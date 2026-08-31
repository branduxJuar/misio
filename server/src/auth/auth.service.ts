import { BadRequestException, ConflictException, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import * as bcrypt from 'bcrypt';
import { randomBytes, createHash } from 'node:crypto';
import { generateSecret as totpGenerateSecret, verifySync as totpVerify, generateURI as totpURI } from 'otplib';
import * as QRCode from 'qrcode';
import { User, UserDocument, UserRole } from '../users/user.schema';
import { LoginDto, RegisterDto } from './dto/auth.dto';
import { JwtPayload } from './jwt.strategy';
import { SettingsService } from '../settings/settings.service';
import { MailService } from './mail.service';
import { Ticket, TicketDocument } from '../tickets/ticket.schema';
import { Transaction, TransactionDocument, TransactionType } from '../transactions/transaction.schema';

const BCRYPT_ROUNDS = 10;

@Injectable()
export class AuthService {
  constructor(
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    private jwtService: JwtService,
    private settingsService: SettingsService,
    private mailService: MailService,
    @InjectModel(Ticket.name) private ticketModel: Model<TicketDocument>,
    @InjectModel(Transaction.name) private txModel: Model<TransactionDocument>,
  ) {}

  /**
   * Registro: valida DNI único, hashea la contraseña y devuelve el token
   * de una vez (el usuario queda logueado al registrarse).
   */
  async register(dto: RegisterDto) {
    const exists = await this.userModel.findOne({ dni: dto.dni }).lean();
    if (exists) throw new ConflictException('Ya existe una cuenta con ese DNI');

    const user = await this.userModel.create({
      name: dto.name,
      dni: dto.dni,
      phone: dto.phone,
      passwordHash: await bcrypt.hash(dto.password, BCRYPT_ROUNDS),
      acceptedTermsAt: new Date(), // El DTO ya validó acceptTerms === true
      role: UserRole.USER, // El rol admin se asigna solo por base de datos
      email: dto.email?.toLowerCase().trim() ?? '',
    });

    // RECLAMO DE VENTAS FÍSICAS (POS)
    // Si este usuario antes compró tickets en persona (offline) dando su DNI,
    // ahora que se creó una cuenta formal, transferimos esos tickets y pagos a su ID real
    // para que los vea en su perfil.
    try {
      await this.ticketModel.updateMany(
        { 'buyerDni': dto.dni },
        { $set: { userId: user._id } }
      );
      await this.txModel.updateMany(
        { type: TransactionType.OFFLINE_SALE, 'meta.buyerDni': dto.dni },
        { $set: { userId: user._id } }
      );
    } catch (err) {
      console.error('Error reclamando tickets offline para nuevo usuario:', err);
    }

    // ── Verificación de correo (toggle del admin) ─────────────────
    if (dto.email && (await this.settingsService.isEmailVerificationEnabled())) {
      await this.issueVerificationCode(user);
      return {
        requiresVerification: true,
        dni: user.dni,
        message: `Te enviamos un código de 6 dígitos a ${user.email}. Ingrésalo para activar tu cuenta.`,
      };
    }
    if (dto.email) user.emailVerifiedAt = user.emailVerifiedAt ?? null;

    // BONO DE BIENVENIDA configurable (crédito o boleto gratis).
    // (Con verificación activa, el bono se aplica al VERIFICAR el código.)
    const welcomeBonus = await this.settingsService.applyWelcomeBonus(user._id.toString());
    if (welcomeBonus?.type === 'credit') {
      const fresh = await this.userModel.findById(user._id);
      if (fresh) user.walletBalance = fresh.walletBalance;
    }

    const authResponse = await this.buildAuthResponse(user);
    return { ...authResponse, welcomeBonus };
  }

  /** Login por DNI + contraseña. Mensaje genérico para no filtrar si el DNI existe. */
  async login(dto: LoginDto) {
    const isEmail = dto.identifier.includes('@');
    const query = isEmail
      ? { email: dto.identifier.trim().toLowerCase() }
      : { dni: dto.identifier.trim() };

    const user = await this.userModel
      .findOne(query)
      .select('+passwordHash');

    if (user) {
      if (isEmail && user.role !== UserRole.USER) {
        throw new UnauthorizedException('El personal administrativo debe ingresar con su DNI');
      }
      if (!isEmail && user.role === UserRole.USER) {
        throw new UnauthorizedException('Debes ingresar con tu correo electrónico registrado');
      }
    }

    // CUENTA BLOQUEADA: tras varios fallos seguidos, la puerta se cierra
    // un rato. El atacante pierde el ritmo; el dueño solo espera.
    if (user?.lockedUntil && user.lockedUntil > new Date()) {
      const mins = Math.ceil((user.lockedUntil.getTime() - Date.now()) / 60000);
      throw new UnauthorizedException(
        `Demasiados intentos fallidos. Espera ${mins} minuto(s) y vuelve a intentar.`,
      );
    }

    const valid = user && (await bcrypt.compare(dto.password, user.passwordHash));
    if (!valid) {
      if (user) {
        const fails = (user.failedLogins ?? 0) + 1;
        const update: Record<string, unknown> = { failedLogins: fails };
        // 5 fallos → 5 min; 10 → 30 min. Escalonado: molesta al bot, no
        // al que solo se equivocó de tecla.
        if (fails >= 10) update.lockedUntil = new Date(Date.now() + 30 * 60_000);
        else if (fails >= 5) update.lockedUntil = new Date(Date.now() + 5 * 60_000);
        await this.userModel.updateOne({ _id: user._id }, update);
      }
      // Mismo mensaje exista o no el DNI: no confirmamos qué cuentas hay
      throw new UnauthorizedException('DNI o contraseña incorrectos');
    }
    if (user.failedLogins || user.lockedUntil || user.forgotPasswordAttempts) {
      await this.userModel.updateOne({ _id: user._id }, { failedLogins: 0, lockedUntil: null, forgotPasswordAttempts: 0 });
    }

    // 2FA activo: no entregar tokens todavía — el frontend debe pedir
    // el código de Google Authenticator y llamar a /auth/verify-2fa.
    if (user.totpEnabled) {
      return { requires2FA: true, dni: user.dni };
    }
    if (
      user.email &&
      !user.emailVerifiedAt &&
      (await this.settingsService.isEmailVerificationEnabled())
    ) {
      if (user.isLockedForSpam) {
        throw new UnauthorizedException('LOCKED_SUPPORT: Has superado el límite de correos. Comunícate con soporte.');
      }
      await this.issueVerificationCode(user);
      throw new UnauthorizedException(
        'VERIFY_EMAIL:Tu correo aún no está verificado — te reenviamos el código.',
      );
    }
    if (user.banned) {
      throw new UnauthorizedException(
        `Tu cuenta fue suspendida${user.banReason ? `: ${user.banReason}` : ''}. Si crees que es un error, contáctanos.`,
      );
    }

    return await this.buildAuthResponse(user);
  }

  /** Respuesta estándar: token + datos públicos del usuario. */
  /** Genera y envía un código de 6 dígitos con vigencia de 15 min. */
  private async issueVerificationCode(user: UserDocument) {
    const attempts = (user.verificationAttempts || 0) + 1;
    if (attempts > 3) {
      user.isLockedForSpam = true;
      await user.save();
      throw new UnauthorizedException('LOCKED_SUPPORT: Has superado el límite de correos. Comunícate con soporte.');
    }
    user.verificationAttempts = attempts;

    const code = String(Math.floor(100000 + Math.random() * 900000));
    user.verifyCode = code;
    user.verifyCodeExpires = new Date(Date.now() + 15 * 60 * 1000);
    await user.save();
    await this.mailService.sendVerificationCode(user.email, user.name, code);
    return attempts;
  }

  /** POST /auth/verify-email — valida el código y entrega la sesión. */
  async verifyEmail(identifier: string, code: string) {
    const isEmail = identifier.includes('@');
    const query = isEmail ? { email: identifier.trim().toLowerCase() } : { dni: identifier.trim() };
    const user = await this.userModel
      .findOne(query)
      .select('+passwordHash +verifyCode +verifyCodeExpires');
    if (!user) throw new UnauthorizedException('Cuenta no encontrada');
    if (user.emailVerifiedAt) return await this.buildAuthResponse(user);

    const valid =
      user.verifyCode &&
      user.verifyCode === code.trim() &&
      user.verifyCodeExpires &&
      user.verifyCodeExpires > new Date();
    if (!valid) {
      throw new UnauthorizedException('Código incorrecto o vencido — pide uno nuevo');
    }
    user.emailVerifiedAt = new Date();
    user.verifyCode = '';
    user.verifyCodeExpires = null;
    user.verificationAttempts = 0; // Resetear intentos al verificar
    await user.save();

    // El bono de bienvenida se aplica recién al VERIFICAR (cuenta real)
    const welcomeBonus = await this.settingsService.applyWelcomeBonus(user._id.toString());
    const authResponse = await this.buildAuthResponse(user);
    return { ...authResponse, welcomeBonus };
  }

  /** POST /auth/resend-code — reenvía el código (si sigue sin verificar). */
  async resendCode(identifier: string) {
    const isEmail = identifier.includes('@');
    const query = isEmail ? { email: identifier.trim().toLowerCase() } : { dni: identifier.trim() };
    const user = await this.userModel.findOne(query).select('+verifyCode +verifyCodeExpires +verificationAttempts +isLockedForSpam');
    if (!user || user.emailVerifiedAt) return { sent: false };
    if (user.isLockedForSpam) {
      throw new UnauthorizedException('LOCKED_SUPPORT: Has superado el límite de correos. Comunícate con soporte.');
    }
    const attempts = await this.issueVerificationCode(user);
    return { sent: true, attempts };
  }

  /**
   * Construye la respuesta de autenticación: access + refresh.
   *
   * Access token: corto (2h), viaja en cada request.
   * Refresh token: largo (30d), se usa UNA vez para pedir un access
   * nuevo — y se rota: cada refresh invalida el anterior.
   *
   * Si alguien roba un refresh viejo, no le sirve: ya fue rotado.
   * Si alguien roba el nuevo, el dueño legítimo lo rota al usarlo
   * y el ladrón se queda fuera.
   */
  private async buildAuthResponse(user: UserDocument) {
    const payload: JwtPayload = {
      sub: user._id.toString(),
      name: user.name,
      role: user.role,
    };

    const accessToken = this.jwtService.sign(payload, { expiresIn: '2h' });
    const refreshToken = randomBytes(40).toString('hex');
    const hashedRefreshToken = createHash('sha256')
      .update(refreshToken)
      .digest('hex');

    await this.userModel.updateOne(
      { _id: user._id },
      { hashedRefreshToken },
    );

    return {
      accessToken,
      refreshToken,
      user: {
        _id: user._id,
        name: user.name,
        dni: user.dni,
        phone: user.phone,
        role: user.role,
        walletBalance: user.walletBalance,
        walletCanje: user.walletCanje ?? 0,
        walletHeld: user.walletHeld ?? 0,
        mustChangePassword: user.mustChangePassword ?? false,
      },
    };
  }

  /**
   * RENOVAR: el refresh token se usa UNA vez → se rota.
   * Si el token no coincide (ya fue rotado o nunca existió), se revoca
   * todo: protección contra robo de tokens.
   */
  async refresh(refreshToken: string) {
    const hash = createHash('sha256').update(refreshToken).digest('hex');
    const user = await this.userModel
      .findOne({ hashedRefreshToken: hash })
      .select('+hashedRefreshToken');
    if (!user) {
      throw new UnauthorizedException('Sesión expirada — vuelve a iniciar sesión');
    }
    return await this.buildAuthResponse(user);
  }

  async logout(userId: string) {
    await this.userModel.updateOne({ _id: userId }, { hashedRefreshToken: '' });
  }

  // ═══════════ RECUPERACIÓN DE CONTRASEÑA ═══════════════════════════

  /**
   * Paso 1: el usuario pide recuperar. Genera un token temporal (1h) y
   * envía el correo. Por seguridad, responde igual exista o no el correo.
   */
  async forgotPassword(email: string) {
    const user = await this.userModel.findOne({ email: email.trim().toLowerCase() });
    
    // Si el usuario no existe, devolvemos éxito sin enviar nada (para evitar filtrado de correos válidos)
    if (!user) {
      return { sent: true, message: 'Si el correo está registrado, enviamos las instrucciones.' };
    }

    const attempts = (user.forgotPasswordAttempts || 0) + 1;
    
    if (attempts > 3) {
      await this.userModel.updateOne(
        { _id: user._id },
        { 
          forgotPasswordAttempts: attempts,
          banned: true,
          bannedAt: new Date(),
          banReason: 'Exceso de intentos de recuperación de contraseña'
        }
      );
      await this.mailService.sendAccountBannedForSpam(user.email, user.name);
      // Retornamos el mismo mensaje para no dar indicios al atacante
      return { sent: true, message: 'Si el correo está registrado, enviamos las instrucciones.' };
    }

    const token = randomBytes(32).toString('hex');
    const hash = createHash('sha256').update(token).digest('hex');
    await this.userModel.updateOne(
      { _id: user._id },
      { 
        resetToken: hash, 
        resetTokenExpires: new Date(Date.now() + 3600_000),
        forgotPasswordAttempts: attempts
      },
    );
    
    if (user.email) {
      try {
        await this.mailService.sendPasswordReset(user.email, user.name, token);
      } catch { /* el correo nunca rompe el flujo */ }
    }
    
    return { sent: true, message: 'Si el correo está registrado, enviamos las instrucciones.' };
  }

  /** Paso 2: el usuario llega con el token del correo y su nueva clave. */
  async resetPassword(token: string, newPassword: string) {
    if (!newPassword || newPassword.length < 8 || !/[a-zA-Z]/.test(newPassword) || !/\d/.test(newPassword)) {
      throw new BadRequestException('La contraseña debe tener 8+ caracteres, con letras y números');
    }
    const hash = createHash('sha256').update(token).digest('hex');
    const user = await this.userModel
      .findOne({ resetToken: hash, resetTokenExpires: { $gt: new Date() } })
      .select('+resetToken');
    if (!user) {
      throw new BadRequestException('El enlace venció o no es válido. Pide uno nuevo.');
    }
    const passwordHash = await bcrypt.hash(newPassword, 10);
    await this.userModel.updateOne(
      { _id: user._id },
      { passwordHash, resetToken: '', resetTokenExpires: null, mustChangePassword: false, failedLogins: 0, lockedUntil: null, forgotPasswordAttempts: 0 },
    );
    return { ok: true, message: 'Contraseña actualizada. Ya puedes iniciar sesión.' };
  }

  /** Cambio de contraseña desde adentro (usuario logueado o cambio forzado). */
  async changePassword(userId: string, currentPassword: string, newPassword: string, force = false) {
    if (!newPassword || newPassword.length < 8 || !/[a-zA-Z]/.test(newPassword) || !/\d/.test(newPassword)) {
      throw new BadRequestException('La nueva contraseña debe tener 8+ caracteres, con letras y números');
    }
    const user = await this.userModel.findById(userId).select('+passwordHash');
    if (!user) throw new UnauthorizedException();
    if (!force) {
      const ok = await bcrypt.compare(currentPassword, user.passwordHash);
      if (!ok) throw new BadRequestException('La contraseña actual no es correcta');
    }
    const passwordHash = await bcrypt.hash(newPassword, 10);
    await this.userModel.updateOne({ _id: userId }, { passwordHash, mustChangePassword: false });
    return { ok: true, message: 'Contraseña cambiada correctamente' };
  }


  // ═══════════ 2FA (TOTP) ═══════════════════════════════════════════
  //
  // Flujo: setup → el admin escanea el QR en Google Authenticator →
  // confirm (con el primer código) → activa. A partir de ahí, login
  // devuelve { requires2FA: true } y el frontend pide el código antes
  // de entregar los tokens.

  /** Paso 1: genera el secreto y devuelve el QR para escanear. */
  async setup2FA(userId: string) {
    const user = await this.userModel.findById(userId);
    if (!user) throw new UnauthorizedException();
    if (user.totpEnabled) {
      throw new BadRequestException('El 2FA ya está activo. Desactívalo primero si quieres reconfigurarlo.');
    }
    const secret = totpGenerateSecret({ length: 20 });
    await this.userModel.updateOne({ _id: userId }, { totpSecret: secret });
    const otpauth = totpURI({ secret, issuer: 'Misio', label: user.dni });
    const qrDataUrl = await QRCode.toDataURL(otpauth);
    return { secret, qrDataUrl };
  }

  /** Paso 2: confirma el primer código → activa el 2FA. */
  async confirm2FA(userId: string, code: string) {
    const user = await this.userModel.findById(userId).select('+totpSecret');
    if (!user?.totpSecret) throw new BadRequestException('Primero ejecuta setup-2fa');
    const result = totpVerify({ token: code, secret: user.totpSecret });
    const valid = result?.valid ?? false;
    if (!valid) throw new BadRequestException('Código incorrecto — escanea el QR de nuevo y reintenta');
    await this.userModel.updateOne({ _id: userId }, { totpEnabled: true });
    return { ok: true, message: '2FA activado — desde ahora necesitarás el código de tu app al iniciar sesión' };
  }

  /** Desactiva el 2FA (requiere el código actual como confirmación). */
  async disable2FA(userId: string, code: string) {
    const user = await this.userModel.findById(userId).select('+totpSecret');
    if (!user?.totpEnabled) throw new BadRequestException('El 2FA no está activo');
    const result = totpVerify({ token: code, secret: user.totpSecret });
    const valid = result?.valid ?? false;
    if (!valid) throw new UnauthorizedException('Código incorrecto');
    await this.userModel.updateOne({ _id: userId }, { totpEnabled: false, totpSecret: '' });
    return { ok: true };
  }

  /** Verifica el código TOTP en el login (paso 2 del login con 2FA). */
  async verify2FA(dni: string, code: string) {
    const user = await this.userModel
      .findOne({ dni })
      .select('+totpSecret +passwordHash');
    if (!user?.totpEnabled || !user.totpSecret) {
      throw new BadRequestException('Esta cuenta no tiene 2FA activo');
    }
    const result = totpVerify({ token: code, secret: user.totpSecret });
    const valid = result?.valid ?? false;
    if (!valid) throw new UnauthorizedException('Código 2FA incorrecto');
    return await this.buildAuthResponse(user);
  }
}
