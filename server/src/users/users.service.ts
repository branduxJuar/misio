import { BadRequestException, ConflictException, Injectable, NotFoundException, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectModel } from '@nestjs/mongoose';
import * as bcrypt from 'bcrypt';
import { ClientSession, Model } from 'mongoose';
import { ADMIN_MODULES, DEFAULT_PERMISSIONS, User, UserDocument, UserRole } from './user.schema';

@Injectable()
export class UsersService {
  // Mapa en memoria para rastrear usuarios activos (ID -> { start, last })
  private activeUsers = new Map<string, { start: number, last: number }>();
  private readonly logger = new Logger(UsersService.name);

  constructor(@InjectModel(User.name) private userModel: Model<UserDocument>) {}

  /** Actualiza el timestamp del usuario indicando que está activo */
  pingPresence(userId: string) {
    const now = Date.now();
    const existing = this.activeUsers.get(userId);
    if (existing) {
      existing.last = now;
    } else {
      this.activeUsers.set(userId, { start: now, last: now });
    }
  }

  /** Devuelve los usuarios activos en los últimos `minutes` */
  async getActiveUsers(minutes = 5): Promise<any[]> {
    const cutoff = Date.now() - minutes * 60 * 1000;
    const activeSessions = Array.from(this.activeUsers.entries())
      .filter(([_, session]) => session.last > cutoff);
    
    // Limpieza de memoria: eliminar a los inactivos
    for (const [id, session] of this.activeUsers.entries()) {
      if (session.last <= cutoff) this.activeUsers.delete(id);
    }

    if (!activeSessions.length) return [];
    
    const activeIds = activeSessions.map(([id]) => id);
    const users = await this.userModel.find({ _id: { $in: activeIds } })
      .select('name dni phone email role')
      .lean();

    // Adjuntamos el tiempo de inicio de sesión
    return users.map(u => ({
      ...u,
      sessionStart: this.activeUsers.get(u._id.toString())?.start || Date.now()
    }));
  }

  /** Verificación manual de correo por el administrador */
  async manualVerifyEmail(userId: string) {
    const user = await this.userModel.findByIdAndUpdate(
      userId,
      {
        $set: {
          emailVerifiedAt: new Date(),
          verifyCode: null,
          verifyCodeExpires: null,
        }
      },
      { new: true }
    );
    if (!user) throw new NotFoundException('Usuario no encontrado');
    return user;
  }

  create(data: Partial<User>) {
    return this.userModel.create(data);
  }

  /**
   * LISTADO PAGINADO Y BUSCABLE.

   *
   * Antes devolvía la colección ENTERA: con 100.000 usuarios son ~40 MB de
   * JSON por cada vez que el admin abre la pantalla — el servidor se queda
   * sin memoria y el navegador se congela. Ahora: página + búsqueda, con
   * tope duro de 100 por página aunque pidan más.
   *
   * La búsqueda escapa la entrada antes de armar el RegExp: un `.*` o un
   * `(a+)+` enviado por el cliente sería un ataque de expresión regular
   * (ReDoS) que deja la CPU al 100%.
   */
  async findAll(opts: { page?: number; limit?: number; search?: string } = {}) {
    const page = Math.max(1, Number(opts.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(opts.limit) || 25));
    const filter: Record<string, unknown> = {};

    if (opts.search?.trim()) {
      const safe = opts.search.trim().slice(0, 60).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      filter.$or = [
        { name: { $regex: safe, $options: 'i' } },
        { dni: { $regex: `^${safe}` } },
        { phone: { $regex: `^${safe}` } },
      ];
    }

    const [items, total] = await Promise.all([
      this.userModel
        .find(filter)
        .select('-__v')
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      this.userModel.countDocuments(filter),
    ]);
    return { items, total, page, limit, pages: Math.ceil(total / limit) };
  }

  /**
   * CREAR USUARIO CON ROL (solo admin): para delegar en su personal.
   * operator = verifica pagos y atiende canjes; admin = acceso total.
   */
  async createWithRole(data: {
    name: string; dni: string; phone: string; password: string; role: UserRole;
    permissions?: string[];
  }) {
    const bcrypt = await import('bcrypt');
    const exists = await this.userModel.findOne({ dni: data.dni });
    if (exists) throw new ConflictException('Ya existe un usuario con ese DNI');
    // Permisos: los que marcaste, o los de su rol por defecto
    const permissions = (data.permissions?.length
      ? data.permissions
      : DEFAULT_PERMISSIONS[data.role] ?? []
    ).filter((p) => (ADMIN_MODULES as readonly string[]).includes(p));

    const user = await this.userModel.create({
      name: data.name,
      dni: data.dni,
      phone: data.phone,
      role: data.role,
      permissions,
      passwordHash: await bcrypt.hash(data.password, 10),
      acceptedTermsAt: new Date(), // Cuenta interna creada por el dueño
    });
    const { passwordHash, ...safe } = user.toObject();
    return safe;
  }

  /**
   * Expulsa al usuario invalidando todas las sesiones emitidas hasta este momento.
   */
  async kick(id: string) {
    const user = await this.userModel.findByIdAndUpdate(
      id,
      { $set: { forceLogoutAt: new Date(), hashedRefreshToken: null } },
      { new: true }
    );
    if (!user) throw new NotFoundException('Usuario no encontrado');
    
    // Lo sacamos también de la lista de activos en memoria
    this.activeUsers.delete(id);
    
    return { success: true, message: `Se cerró la sesión de ${user.name}` };
  }

  /**
   * SUBASTAS — retención atómica: mueve fondos contable → retenido al
   * pujar (guard de saldo), y retenido → contable al ser superado.
   */
  async holdFunds(userId: string, amount: number, session?: ClientSession) {
    const user = await this.userModel.findOneAndUpdate(
      { _id: userId, walletBalance: { $gte: amount } },
      { $inc: { walletBalance: -amount, walletHeld: amount } },
      { new: true, session },
    );
    if (!user) throw new BadRequestException('Saldo contable insuficiente para esta puja — recarga con Yape');
    return user;
  }

  async releaseFunds(userId: string, amount: number, session?: ClientSession) {
    const user = await this.userModel.findOneAndUpdate(
      { _id: userId, walletHeld: { $gte: amount } },
      { $inc: { walletBalance: amount, walletHeld: -amount } },
      { new: true, session },
    );
    if (!user) throw new BadRequestException('Retención inconsistente');
    return user;
  }

  /** El ganador paga: la retención se consume (no vuelve al contable). */
  async consumeHeld(userId: string, amount: number, session?: ClientSession) {
    const user = await this.userModel.findOneAndUpdate(
      { _id: userId, walletHeld: { $gte: amount } },
      { $inc: { walletHeld: -amount } },
      { new: true, session },
    );
    if (!user) throw new BadRequestException('Retención inconsistente al cobrar');
    return user;
  }

  /** El usuario completa/actualiza SU perfil (correo, dirección, contacto). */
  async updateProfile(
    userId: string,
    data: { email?: string; phone?: string; altContact?: string; address?: Record<string, string> },
  ) {
    const patch: any = {};
    if (data.email !== undefined) patch.email = String(data.email).toLowerCase().trim();
    if (data.phone !== undefined) patch.phone = String(data.phone).trim();
    if (data.altContact !== undefined) patch.altContact = String(data.altContact).trim();
    if (data.address !== undefined) {
      const a = data.address ?? {};
      patch.address = {
        line1: String(a.line1 ?? '').slice(0, 160),
        city: String(a.city ?? '').slice(0, 60),
        region: String(a.region ?? '').slice(0, 60),
        reference: String(a.reference ?? '').slice(0, 200),
      };
    }
    const user = await this.userModel
      .findByIdAndUpdate(userId, patch, { new: true })
      .select('-passwordHash -verifyCode -verifyCodeExpires');
    if (!user) throw new NotFoundException('Usuario no existe');
    return user;
  }

  // ═══ AVISOS EMERGENTES ═══
  async markAnnouncementAsRead(userId: string, announcementId: string) {
    await this.userModel.updateOne(
      { _id: userId },
      { $addToSet: { readAnnouncements: announcementId } }
    );
  }

  async getAnnouncementStats(announcements: any[]) {
    const totalUsers = await this.userModel.countDocuments();
    const readCounts = await this.userModel.aggregate([
      { $unwind: '$readAnnouncements' },
      { $group: { _id: '$readAnnouncements', count: { $sum: 1 } } }
    ]);
    const countsMap = readCounts.reduce((acc, curr) => {
      acc[curr._id] = curr.count;
      return acc;
    }, {});
    
    const stats: Record<string, { read: number; total: number }> = {};
    for (const ann of announcements) {
      stats[ann.id] = {
        read: countsMap[ann.id] || 0,
        total: totalUsers
      };
    }
    return stats;
  }

  async setAvatar(userId: string, avatarUrl: string) {
    const user = await this.userModel
      .findByIdAndUpdate(userId, { avatarUrl }, { new: true })
      .select('-passwordHash');
    if (!user) throw new NotFoundException('Usuario no existe');
    return user;
  }

  /**
   * ACTUALIZACIÓN MANUAL DE SALDOS (Solo Admin)
   * Sobrescribe directamente las billeteras sin generar movimientos en el ledger.
   * Uso exclusivo como herramienta de corrección en caso de fallos del sistema.
   */
  async setBalances(userId: string, balances: { walletBalance?: number; walletCanje?: number; walletHeld?: number }) {
    const update: any = {};
    if (balances.walletBalance !== undefined) update.walletBalance = balances.walletBalance;
    if (balances.walletHeld !== undefined) update.walletHeld = balances.walletHeld;
    
    if (balances.walletCanje !== undefined) {
      update.walletCanje = balances.walletCanje;
      
      // Cuando el admin asigna saldo de canje manualmente, reiniciamos los tramos
      // para que comiencen a vencer desde este momento exacto.
      if (balances.walletCanje > 0) {
        const expirationDays = Number(process.env.CANJE_EXPIRATION_DAYS || 20);
        const expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + expirationDays);
        
        update.canjeTranches = [{
          amount: balances.walletCanje,
          originalAmount: balances.walletCanje,
          expiresAt,
          source: 'admin_override',
          createdAt: new Date(),
        }];
      } else {
        update.canjeTranches = [];
      }
    }
    
    if (Object.keys(update).length === 0) return null;

    const user = await this.userModel.findByIdAndUpdate(userId, { $set: update }, { new: true });
    if (!user) throw new NotFoundException('Usuario no encontrado');
    return user;
  }

  /**
   * CREAR PERSONAL (solo admin): cuentas con rol delegado.
   * - operator: verifica pagos y atiende la tienda.
   * - presenter: gestiona y ejecuta los sorteos.
   */
  async createStaff(data: { name: string; dni: string; phone: string; password: string; role: UserRole; permissions?: string[] }) {
    if (![UserRole.ADMIN, UserRole.OPERATOR, UserRole.PRESENTER].includes(data.role)) {
      throw new BadRequestException('Rol inválido para personal');
    }
    const exists = await this.userModel.findOne({ dni: data.dni });
    if (exists) throw new BadRequestException('Ya existe un usuario con ese DNI');
    // Permisos: los que marcaste, o los de su rol por defecto
    const permissions = (data.permissions?.length
      ? data.permissions
      : DEFAULT_PERMISSIONS[data.role] ?? []
    ).filter((p) => (ADMIN_MODULES as readonly string[]).includes(p));

    const user = await this.userModel.create({
      name: data.name,
      dni: data.dni,
      phone: data.phone,
      role: data.role,
      permissions,
      passwordHash: await bcrypt.hash(data.password, 10),
      acceptedTermsAt: new Date(),
    });
    const { passwordHash, ...safe } = user.toObject();
    return safe;
  }

  /** Cambiar los permisos de módulos de una cuenta de personal. */
  async setPermissions(userId: string, permissions: string[]) {
    const clean = (permissions ?? []).filter((p) =>
      (ADMIN_MODULES as readonly string[]).includes(p),
    );
    const user = await this.userModel
      .findByIdAndUpdate(userId, { permissions: clean }, { new: true })
      .select('-passwordHash');
    if (!user) throw new NotFoundException('Usuario no existe');
    return user;
  }

  /** BANEAR / REACTIVAR una cuenta. Los admins no se pueden banear entre sí. */
  async setBan(id: string, banned: boolean, reason = '') {
    const target = await this.userModel.findById(id);
    if (!target) throw new NotFoundException('Usuario no existe');
    if (target.role !== 'user') {
      throw new NotFoundException('Solo se pueden suspender cuentas de usuarios (no personal)');
    }
    target.banned = banned;
    target.banReason = banned ? reason : '';
    target.bannedAt = banned ? new Date() : null;
    await target.save();
    return { _id: target._id, banned: target.banned, banReason: target.banReason };
  }

  async findOne(id: string) {
    const user = await this.userModel.findById(id).lean();
    if (!user) throw new NotFoundException(`Usuario ${id} no existe`);
    if (user.autocontrol?.pendingDisableAt && Date.now() >= new Date(user.autocontrol.pendingDisableAt).getTime()) {
      user.autocontrol.option = 'none';
      user.autocontrol.pendingDisableAt = null;
      await this.userModel.updateOne({ _id: id }, { $set: { 'autocontrol.option': 'none', 'autocontrol.pendingDisableAt': null } });
    }
    return user;
  }

  /**
   * AUTOCONTROL Y JUEGO RESPONSABLE.
   * - Solo se puede tener una opción activa a la vez ('monthly_spend', 'daily_time', 'exclusion', o 'none').
   * - Para quitar o cambiar un límite activo, se requiere confirmación y una espera obligatoria de 24 horas (pendingDisableAt).
   */
  async setAutocontrol(
    userId: string,
    body: {
      option?: 'none' | 'monthly_spend' | 'daily_time' | 'exclusion';
      monthlySpendLimit?: number;
      dailyTimeLimit?: number;
      confirmDisable?: boolean;
      cancelDisable?: boolean;
    },
  ) {
    const user = await this.userModel.findById(userId);
    if (!user) throw new NotFoundException('Usuario no existe');

    const current = user.autocontrol ?? { option: 'none' };

    // 1. Si está solicitando cancelar una desactivación pendiente:
    if (body.cancelDisable && current.pendingDisableAt) {
      user.autocontrol = {
        ...current,
        pendingDisableAt: null,
      };
      await user.save();
      return user.autocontrol;
    }

    // 2. Verificar si la desactivación pendiente ya expiró (pasaron las 24h)
    if (current.pendingDisableAt && Date.now() >= new Date(current.pendingDisableAt).getTime()) {
      current.option = 'none';
      current.pendingDisableAt = null;
    }

    // 3. Si ya tiene un control activo (distinto de 'none') y quiere quitarlo o cambiar a otro:
    if (current.option !== 'none' && body.option !== current.option && !body.confirmDisable && !current.pendingDisableAt) {
      throw new BadRequestException('Actualmente tienes un límite de autocontrol activo. Para quitarlo o modificarlo, debes confirmar el período de espera obligatorio de 24 horas.');
    }

    // 4. Si pide desactivar o flexibilizar el control y confirma:
    if (current.option !== 'none' && body.confirmDisable && !current.pendingDisableAt) {
      user.autocontrol = {
        ...current,
        pendingDisableAt: new Date(Date.now() + 24 * 3600 * 1000), // 24h desde ahora
      };
      await user.save();
      return user.autocontrol;
    }

    const nextOption = body.option ?? 'none';
    if (nextOption === 'monthly_spend' && (!body.monthlySpendLimit || body.monthlySpendLimit <= 0)) {
      throw new BadRequestException('Debes ingresar un monto válido para el límite mensual en Soles.');
    }
    if (nextOption === 'daily_time' && (!body.dailyTimeLimit || body.dailyTimeLimit <= 0)) {
      throw new BadRequestException('Debes seleccionar una cantidad válida de horas para el límite diario.');
    }

    user.autocontrol = {
      option: nextOption,
      monthlySpendLimit: nextOption === 'monthly_spend' ? Number(body.monthlySpendLimit) : null,
      dailyTimeLimit: nextOption === 'daily_time' ? Number(body.dailyTimeLimit) : null,
      pendingDisableAt: null,
      lastModifiedAt: new Date(),
    };
    await user.save();
    return user.autocontrol;
  }

  /**
   * Ajusta el saldo Misio de forma atómica ($inc evita race conditions
   * cuando el usuario compra boletos y recibe reembolsos a la vez).
   * Acepta una ClientSession para participar en transacciones MongoDB
   * (compra de boletos = descuento + boleto + movimiento, todo o nada).
   * Solo debe invocarse desde TransactionsService o TicketsService.
   */
  async adjustWallet(
    userId: string,
    delta: number,
    session?: ClientSession,
    wallet: 'contable' | 'canje' = 'contable',
  ) {
    // 💵 contable = dinero real (recargas) · 🎁 canje = Cero Pérdida
    const field = wallet === 'canje' ? 'walletCanje' : 'walletBalance';
    let user;

    if (wallet === 'canje') {
      user = await this.userModel.findOne({ _id: userId, walletCanje: { $gte: delta < 0 ? -delta : 0 } }).session(session || null);
      if (!user) {
        throw new NotFoundException('Saldo de CANJE insuficiente (este saldo viene de los reembolsos Cero Pérdida)');
      }

      if (delta < 0) {
        // FIFO deduct
        let remainingToDeduct = -delta;
        user.canjeTranches = user.canjeTranches || [];
        user.canjeTranches.sort((a, b) => a.expiresAt.getTime() - b.expiresAt.getTime());
        
        for (let i = 0; i < user.canjeTranches.length; i++) {
          if (remainingToDeduct <= 0) break;
          const tranche = user.canjeTranches[i];
          if (tranche.amount <= remainingToDeduct) {
            remainingToDeduct -= tranche.amount;
            tranche.amount = 0;
          } else {
            tranche.amount -= remainingToDeduct;
            remainingToDeduct = 0;
          }
        }
        
        user.canjeTranches = user.canjeTranches.filter(t => t.amount > 0);
      } else if (delta > 0) {
        // Add new tranche for manual adjustments or reverts
        const expirationDays = Number(process.env.CANJE_EXPIRATION_DAYS || 20);
        const expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + expirationDays);
        user.canjeTranches = user.canjeTranches || [];
        user.canjeTranches.push({
          amount: delta,
          originalAmount: delta,
          expiresAt,
          source: 'Ajuste de saldo o reverso',
          createdAt: new Date(),
        });
      }

      user.walletCanje += delta;
      await user.save({ session });
    } else {
      user = await this.userModel.findOneAndUpdate(
        { _id: userId, [field]: { $gte: delta < 0 ? -delta : 0 } },
        { $inc: { [field]: delta } },
        { new: true, session },
      );
      if (!user) {
        throw new NotFoundException('Saldo contable insuficiente — recarga con Yape');
      }
    }

    return user;
  }

  /**
   * ADMIN resetea la clave de un usuario → queda TEMPORAL. Al entrar, el
   * sistema le pedirá cambiarla (mustChangePassword). Devuelve la clave
   * para que el admin se la comunique.
   */
  async adminResetPassword(targetUserId: string) {
    const user = await this.userModel.findById(targetUserId);
    if (!user) throw new NotFoundException('Usuario no existe');
    const temp = `Misio${Math.floor(1000 + Math.random() * 9000)}`;
    const passwordHash = await bcrypt.hash(temp, 10);
    await this.userModel.updateOne(
      { _id: targetUserId },
      { passwordHash, mustChangePassword: true, failedLogins: 0, lockedUntil: null },
    );
    return { tempPassword: temp, message: 'Clave temporal generada. El usuario deberá cambiarla al entrar.' };
  }

  /**
   * Cron job diario para expirar los tramos de Saldo de Canje.
   * Corre todos los días a la medianoche.
   */
  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async expireCanjeTranches() {
    this.logger.log('Iniciando limpieza de Saldo de Canje expirado...');
    const now = new Date();
    
    const users = await this.userModel.find({
      'canjeTranches.expiresAt': { $lt: now }
    });

    let totalExpired = 0;
    
    for (const user of users) {
      if (!user.canjeTranches) continue;
      
      let expiredAmount = 0;
      const validTranches: any[] = [];
      
      for (const tranche of user.canjeTranches) {
        if (tranche.expiresAt < now) {
          expiredAmount += tranche.amount;
        } else {
          validTranches.push(tranche);
        }
      }
      
      if (expiredAmount > 0) {
        user.canjeTranches = validTranches;
        user.walletCanje = Math.max(0, user.walletCanje - expiredAmount);
        await user.save();
        totalExpired += expiredAmount;
        
        this.logger.log(`Expirados S/ ${expiredAmount} de canje para usuario ${user._id}`);
      }
    }
    
    this.logger.log(`Limpieza completada. Total expirado: S/ ${totalExpired}`);
  }

  async setPosPin(userId: string, pin: string) {
    const user = await this.userModel.findById(userId);
    if (!user) throw new NotFoundException('Usuario no encontrado');
    if (![UserRole.ADMIN, UserRole.OPERATOR].includes(user.role)) {
      throw new BadRequestException('Solo administradores u operadores pueden configurar un PIN de POS');
    }
    const hashedPin = await bcrypt.hash(pin, 10);
    user.posPin = hashedPin;
    await user.save();
    return { message: 'PIN actualizado exitosamente' };
  }
}
