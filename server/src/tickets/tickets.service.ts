import { Logger, BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import { Connection, Model, Types } from 'mongoose';
import { Ticket, TicketDocument, TicketStatus } from './ticket.schema';
import { formatTicketCode, Raffle, RaffleDocument, RaffleStatus } from '../raffles/raffle.schema';
import { UsersService } from '../users/users.service';
import { TransactionsService } from '../transactions/transactions.service';
import { TransactionStatus, TransactionType } from '../transactions/transaction.schema';
import { PromoCodesService } from '../promocodes/promocodes.service';
import { PromoCodeType } from '../promocodes/promocode.schema';
import { CashService } from '../cash/cash.service';
import { CashMovementType } from '../cash/cash.schema';
import { MailService } from '../auth/mail.service';


/** Reintentos ante colisión de números (dos compras simultáneas). */
const PURCHASE_RETRIES = 3;

@Injectable()
export class TicketsService {
  /**
   * ¿El MongoDB conectado soporta transacciones? (requiere replica set).
   * El Mongo standalone típico de Windows NO las soporta: withTransaction
   * lanza "Transaction numbers are only allowed on a replica set...". En
   * ese caso este flag pasa a false y la compra corre SIN transacción
   * (los índices únicos siguen protegiendo contra números duplicados).
   */
  private readonly logger = new Logger(TicketsService.name);
  private txSupported: boolean | null = null; // null = aún no probado

  constructor(
    @InjectModel(Ticket.name) private ticketModel: Model<TicketDocument>,
    @InjectModel(Raffle.name) private raffleModel: Model<RaffleDocument>,
    @InjectConnection() private readonly connection: Connection,
    private readonly usersService: UsersService,
    private readonly txService: TransactionsService,
    private readonly promoCodesService: PromoCodesService,
    private readonly cashService: CashService,
    private readonly mailService: MailService,
  ) {}

  /**
   * Detecta UNA vez si el MongoDB soporta transacciones (replica set).
   * Lo hace con una transacción vacía de prueba, ANTES de cualquier
   * compra real — así nunca dejamos una compra a medias por descubrir
   * el modo a mitad de camino. Cachea el resultado.
   */
  private async supportsTransactions(): Promise<boolean> {
    if (this.txSupported !== null) return this.txSupported;
    const session = await this.connection.startSession();
    try {
      await session.withTransaction(async () => {
        // Una ESCRITURA es lo que dispara el error en standalone (un
        // findOne de solo lectura puede no fallar y dar un falso positivo).
        // Usamos una colección temporal aparte para no chocar con el schema
        // ni con los índices de tickets.
        await this.connection.db!.collection('__txprobe__')
          .insertOne({ t: Date.now() }, { session });
        throw new Error('__abort_probe__'); // aborta la transacción de prueba
      });
      this.txSupported = true;
    } catch (err: any) {
      if (err?.message === '__abort_probe__') {
        // La escritura funcionó dentro de la tx y se revirtió → SÍ soporta
        this.txSupported = true;
        this.logger.log('✓ MongoDB soporta transacciones (replica set)');
      } else {
        // Cualquier otro fallo = no soporta transacciones. Sea el mensaje
        // que sea, caemos a modo sin-transacción (más seguro que asumir sí).
        this.txSupported = false;
        this.logger.warn(
          '⚠️ MongoDB standalone (sin replica set): las compras corren SIN ' +
          'transacción. Funciona para desarrollo; en producción usa un ' +
          'replica set para atomicidad total. (' + (err?.message ?? '').slice(0, 60) + ')',
        );
      }
    } finally {
      await session.endSession();
      // Limpiar cualquier resto de la prueba (por si en standalone quedó)
      await this.connection.db?.collection('__txprobe__').deleteMany({}).catch(() => {});
    }
    return this.txSupported;
  }

  /** Historial de boletos del usuario (UserDashboard). */
  /**
   * Boletos del usuario. TOPE DURO: un jugador intenso acumula miles y
   * el móvil no puede con esa lista (ni la necesita: ve los recientes).
   */
  findByUser(userId: string, limit = 300) {
    return this.ticketModel
      .find({ userId })
      .sort({ createdAt: -1 })
      .limit(Math.min(Math.max(1, limit), 500))
      .populate('raffleId', 'title status ticketPrice type prizes')
      .lean();
  }

  /** Lista de participantes de una rifa (LiveDrawRoom y Exportación Admin). */
  findByRaffle(raffleId: string) {
    // Match robusto: acepta raffleId como ObjectId o string.
    const rid: any = { $in: [new Types.ObjectId(raffleId), raffleId] };
    return this.ticketModel.find({ raffleId: rid })
      .populate('userId', 'name phone email')
      .populate('soldBy', 'name')
      .lean();
  }

  /**
   * COMPRA ATÓMICA — todo o nada dentro de una transacción MongoDB:
   *   1. Valida que la rifa esté en venta.
   *   2. Busca los N números libres más bajos.
   *   3. Descuenta el saldo Misio (falla si no alcanza).
   *   4. Inserta los boletos (el índice único raffleId+ticketNumber
   *      detecta sobreventa → abort + retry).
   *   5. Registra el movimiento en el ledger.
   *
   * ⚠️ Requiere MongoDB como replica set (Atlas lo es por defecto;
   * en local: mongod --replSet rs0 + rs.initiate()). Ver README.
   */
  /**
   * @param opts.quantity      compra rápida: el sistema asigna los números libres más bajos
   * @param opts.ticketNumbers compra con NÚMEROS ELEGIDOS por el usuario (Sprint 3: grilla)
   *
   * DELIMITADOR: (boletos que ya tiene + los nuevos) ≤ raffle.maxTicketsPerUser.
   * ANTI doble-compra del MISMO número: el índice único raffleId+ticketNumber
   * hace que si dos personas pagan el mismo número a la vez, solo UNA inserción
   * gana; la otra aborta su transacción completa (no se le cobra nada) y
   * recibe el error con el número en conflicto.
   */
  async purchase(
    userId: string,
    raffleId: string,
    opts: { quantity?: number; ticketNumbers?: number[]; fromPendingConfirmation?: boolean; promoCode?: string },
  ) {
    const explicit = opts.ticketNumbers?.length ? [...new Set(opts.ticketNumbers)] : null;
    const quantity = explicit ? explicit.length : (opts.quantity ?? 0);
    if (quantity < 1) throw new BadRequestException('Indica cantidad o números de boleto');

    // Validación de Autocontrol y Juego Responsable
    const userProfile = await this.usersService.findOne(userId);
    const ac = userProfile?.autocontrol;
    if (ac && ac.option !== 'none') {
      const isExpired = ac.pendingDisableAt && Date.now() >= new Date(ac.pendingDisableAt).getTime();
      if (!isExpired) {
        if (ac.option === 'exclusion') {
          throw new BadRequestException('No puedes comprar boletos: Tienes activada una Autoexclusión Indefinida por Juego Responsable.');
        }
        if (ac.option === 'monthly_spend' && ac.monthlySpendLimit) {
          const spend = await this.txService.getMonthlySpend(userId);
          if (spend >= ac.monthlySpendLimit) {
            throw new BadRequestException(`Has alcanzado tu límite de gasto mensual de S/ ${ac.monthlySpendLimit.toFixed(2)} programado en Autocontrol.`);
          }
        }
      }
    }

    const useTx = await this.supportsTransactions();

    for (let attempt = 1; attempt <= PURCHASE_RETRIES; attempt++) {
      const session = useTx ? await this.connection.startSession() : null;
      try {
        let result: { tickets: TicketDocument[]; totalPaid: number } | undefined;

        const body = async () => {
          // 1. Rifa en venta
          const raffle = await this.raffleModel.findById(raffleId).session(session);
          if (!raffle || raffle.status !== RaffleStatus.ACTIVE) {
            throw new BadRequestException('La rifa no está en venta');
          }

          // 2a. DELIMITADOR por usuario
          const alreadyOwned = await this.ticketModel
            .countDocuments({ raffleId, userId })
            .session(session);
          if (alreadyOwned + quantity > raffle.maxTicketsPerUser) {
            throw new BadRequestException(
              `Máximo ${raffle.maxTicketsPerUser} boletos por persona en esta rifa (ya tienes ${alreadyOwned})`,
            );
          }

          // 2b. Números a comprar
          const taken = await this.ticketModel
            .find({ raffleId })
            .distinct('ticketNumber')
            .session(session);
          const takenSet = new Set(taken);

          // Números en proceso de compra (pago Yape pendiente de otro usuario)
          const inProcess = new Set(
            (await this.txService.pendingNumbersForRaffle(raffleId)).filter((n) => !takenSet.has(n)),
          );

          let numbers: number[];
          if (explicit) {
            // Números ELEGIDOS: validar rango y disponibilidad
            const outOfRange = explicit.filter((n) => n < 1 || n > raffle.totalTickets);
            if (outOfRange.length) {
              throw new BadRequestException(`Números fuera de rango: ${outOfRange.join(', ')}`);
            }
            const reserved = explicit.filter((n) => inProcess.has(n));
            if (reserved.length && !opts.fromPendingConfirmation) {
              throw new ConflictException(
                `En proceso de compra por otra persona: ${reserved
                  .map((n) => formatTicketCode(raffle.ticketPrefix, n, raffle.totalTickets))
                  .join(', ')} — si su pago no se confirma, se liberarán`,
              );
            }
            const unavailable = explicit.filter((n) => takenSet.has(n));
            if (unavailable.length) {
              throw new ConflictException(
                `Ya vendidos: ${unavailable
                  .map((n) => formatTicketCode(raffle.ticketPrefix, n, raffle.totalTickets))
                  .join(', ')} — elige otros`,
              );
            }
            numbers = explicit;
          } else {
            if (raffle.totalTickets - takenSet.size < quantity) {
              throw new ConflictException(
                `Solo quedan ${raffle.totalTickets - takenSet.size} boletos disponibles`,
              );
            }
            numbers = [];
            for (let n = 1; n <= raffle.totalTickets && numbers.length < quantity; n++) {
              if (!takenSet.has(n) && !inProcess.has(n)) numbers.push(n);
            }
            if (numbers.length < quantity) {
              throw new ConflictException('No hay suficientes boletos libres (algunos están en proceso de compra)');
            }
          }

          // 3. PROMO CODE (Descuento de boletos gratis)
          let discountQuantity = 0;
          let promoData: any = null;
          if (opts.promoCode) {
            const promo = await this.promoCodesService.validate(opts.promoCode, userId, PromoCodeType.FREE_TICKET);
            promoData = promo;
            // El valor del promoCode es la cantidad de boletos gratis
            discountQuantity = Math.min(quantity, promo.value);
          }

          // 4. COBRO + LEDGER EN UN SOLO PASO.
          // Solo cobramos los boletos que no son gratis. Si todos son gratis, cobraremos S/ 0.
          const totalPaid = raffle.ticketPrice * (quantity - discountQuantity);
          
          let txRecord: any = null;
          if (totalPaid > 0) {
            txRecord = await this.txService.create(
              {
                userId,
                amount: -totalPaid,
                type: TransactionType.TICKET_PURCHASE,
                status: TransactionStatus.COMPLETED,
                meta: {
                  raffleId,
                  ticketNumbers: numbers,
                  itemName: `${numbers.length}× boleto — ${raffle.title}`,
                  promoCode: promoData?.code,
                },
              },
              session ?? undefined,
            );
          } else if (promoData) {
            // Si todo fue gratis, igual registramos una transacción de S/ 0 para tener el historial
            txRecord = await this.txService.create(
              {
                userId,
                amount: 0,
                type: TransactionType.TICKET_PURCHASE,
                status: TransactionStatus.COMPLETED,
                meta: {
                  raffleId,
                  ticketNumbers: numbers,
                  itemName: `${numbers.length}× boleto GRATIS — ${raffle.title}`,
                  promoCode: promoData.code,
                },
              },
              session ?? undefined,
            );
          }

          // Si hay promo, la registramos
          if (promoData) {
            await this.promoCodesService.apply(promoData.code, userId, txRecord?._id, session ?? undefined);
          }

          // 4. Boletos (duplicate key aquí = colisión → retry externo).
          //    SIN transacción, si esto falla hay que DEVOLVER el cobro a
          //    mano (no hay rollback automático): el usuario nunca queda
          //    cobrado sin boletos.
          let tickets;
          try {
            tickets = await this.ticketModel.insertMany(
              numbers.map((ticketNumber) => ({
                userId: new Types.ObjectId(userId),
                raffleId: new Types.ObjectId(raffleId),
                ticketNumber,
                code: formatTicketCode(raffle.ticketPrefix, ticketNumber, raffle.totalTickets),
              })),
              { session: session ?? undefined, ordered: true },
            );
          } catch (insertErr) {
            if (!session) {
              // Compensación: devolver lo cobrado (reembolso al saldo real)
              await this.txService.create({
                userId,
                amount: totalPaid,
                type: TransactionType.TICKET_PURCHASE,
                status: TransactionStatus.COMPLETED,
                meta: { raffleId, itemName: `Reverso compra fallida — ${raffle.title}` },
              }).catch(() => { /* mejor esfuerzo */ });
            }
            throw insertErr;
          }

          // 4b. Contador denormalizado: $inc atómico en la MISMA
          //     transacción — si algo falla, no queda contado.
          await this.raffleModel.updateOne(
            { _id: raffleId },
            { $inc: { soldCount: numbers.length } },
            { session: session ?? undefined },
          );

          result = { tickets, totalPaid };
        };
        if (session) await session.withTransaction(body);
        else await body();

        return result;
      } catch (err: any) {
        // 11000 = duplicate key: otro usuario tomó el número en paralelo
        const isCollision = err?.code === 11000 || /E11000/.test(err?.message ?? '');
        // Con números ELEGIDOS no se reintenta: el otro comprador ganó ese
        // número; el usuario debe elegir otro (su pago NO se ejecutó).
        if (isCollision && explicit) {
          throw new ConflictException('Alguien acaba de comprar uno de esos números — elige otros');
        }
        if (isCollision && attempt < PURCHASE_RETRIES) continue; // Reintentar (compra rápida)
        throw isCollision
          ? new ConflictException('Alta demanda: intenta de nuevo en unos segundos')
          : err;
      } finally {
        if (session) await session.endSession();
      }
    }
    // Si llegamos aquí, los reintentos se agotaron sin éxito ni error claro
    throw new ConflictException('No se pudo completar la compra — intenta de nuevo');
  }

  /**
   * COMPRA OFFLINE (POS Vendedor) — Se registran ventas físicas (Efectivo/Yape).
   * No descuenta de la billetera virtual, pero registra quién vendió y cómo se pagó.
   */
  async purchaseOffline(
    sellerId: string,
    raffleId: string,
    opts: { quantity?: number; ticketNumbers?: number[]; buyerName?: string; buyerPhone?: string; buyerDni?: string; buyerEmail?: string; paymentMethod?: string },
  ) {
    const shift = await this.cashService.getActiveShift(sellerId);
    if (!shift) {
      throw new Error('NO_ACTIVE_SHIFT'); // Capturado por el front para mostrar alerta
    }

    const explicit = opts.ticketNumbers?.length ? [...new Set(opts.ticketNumbers)] : null;
    const quantity = explicit ? explicit.length : (opts.quantity ?? 0);
    if (quantity < 1) throw new BadRequestException('Indica cantidad o números de boleto');

    const useTx = await this.supportsTransactions();

    for (let attempt = 1; attempt <= PURCHASE_RETRIES; attempt++) {
      const session = useTx ? await this.connection.startSession() : null;
      try {
        let result: { tickets: TicketDocument[] } | undefined;

        const body = async () => {
          const raffle = await this.raffleModel.findById(raffleId).session(session);
          if (!raffle || raffle.status !== RaffleStatus.ACTIVE) {
            throw new BadRequestException('La rifa no está en venta');
          }

          if (opts.buyerDni) {
            const existingDni = await this.ticketModel
              .findOne({ raffleId, buyerDni: opts.buyerDni })
              .session(session);
            if (existingDni) {
              throw new BadRequestException(`El DNI ${opts.buyerDni} ya registró compras en este sorteo.`);
            }
          }

          const taken = await this.ticketModel
            .find({ raffleId })
            .distinct('ticketNumber')
            .session(session);
          const takenSet = new Set(taken);

          // Números en proceso de compra (pago Yape web pendiente)
          const inProcess = new Set(
            (await this.txService.pendingNumbersForRaffle(raffleId)).filter((n) => !takenSet.has(n)),
          );

          let numbers: number[];
          if (explicit) {
            const outOfRange = explicit.filter((n) => n < 1 || n > raffle.totalTickets);
            if (outOfRange.length) {
              throw new BadRequestException(`Números fuera de rango: ${outOfRange.join(', ')}`);
            }
            const reserved = explicit.filter((n) => inProcess.has(n));
            if (reserved.length) {
              throw new ConflictException(`En proceso de compra web: ${reserved.join(', ')}`);
            }
            const unavailable = explicit.filter((n) => takenSet.has(n));
            if (unavailable.length) {
              throw new ConflictException(`Ya vendidos: ${unavailable.join(', ')}`);
            }
            numbers = explicit;
          } else {
            if (raffle.totalTickets - takenSet.size < quantity) {
              throw new ConflictException(`Solo quedan ${raffle.totalTickets - takenSet.size} boletos disponibles`);
            }
            numbers = [];
            for (let n = 1; n <= raffle.totalTickets && numbers.length < quantity; n++) {
              if (!takenSet.has(n) && !inProcess.has(n)) numbers.push(n);
            }
            if (numbers.length < quantity) {
              throw new ConflictException('No hay suficientes boletos libres');
            }
          }

          let tickets;
          try {
            tickets = await this.ticketModel.insertMany(
              numbers.map((ticketNumber) => ({
                raffleId: new Types.ObjectId(raffleId),
                ticketNumber,
                code: formatTicketCode(raffle.ticketPrefix, ticketNumber, raffle.totalTickets),
                isOffline: true,
                buyerName: opts.buyerName,
                buyerPhone: opts.buyerPhone,
                buyerDni: opts.buyerDni,
                buyerEmail: opts.buyerEmail,
                paymentMethod: opts.paymentMethod,
                soldBy: new Types.ObjectId(sellerId),
              })),
              { session: session ?? undefined, ordered: true },
            );
          } catch (insertErr) {
            throw insertErr;
          }

          await this.raffleModel.updateOne(
            { _id: raffleId },
            { $inc: { soldCount: numbers.length } },
            { session: session ?? undefined },
          );

          // Registrar ingreso en caja
          const totalAmount = numbers.length * raffle.ticketPrice;
          if (totalAmount > 0) {
            await this.cashService.addMovement(
              sellerId,
              CashMovementType.INCOME,
              totalAmount,
              `Venta Externa - Rifa: ${raffle.title}`,
              { session: session ?? undefined }
            );

            // Registrar transacción para Contabilidad e Historial de Pagos
            await this.txService.create({
              userId: sellerId,
              amount: totalAmount,
              type: TransactionType.OFFLINE_SALE,
              status: TransactionStatus.COMPLETED,
              meta: {
                methodName: 'Venta Externa',
                operationNumber: `POS-${Date.now().toString().slice(-6)}`,
                buyerName: opts.buyerName,
                buyerDni: opts.buyerDni,
                raffleId: raffleId,
                ticketNumbers: numbers
              }
            }, session ?? undefined);
          }

          if (opts.buyerEmail) {
            const ticketCodes = tickets.map(t => t.code);
            this.mailService.sendOfflineSaleTickets(
              opts.buyerEmail,
              opts.buyerName || 'Participante',
              raffle.title,
              raffle.drawDate,
              ticketCodes
            ).catch(e => this.logger.error(`Error sending offline tickets email to ${opts.buyerEmail}: ${e.message}`));
          }

          result = { tickets };
        };
        if (session) await session.withTransaction(body);
        else await body();

        return result;
      } catch (err: any) {
        const isCollision = err?.code === 11000 || /E11000/.test(err?.message ?? '');
        if (isCollision && explicit) {
          throw new ConflictException('Alguien compró uno de esos números justo ahora — elige otros');
        }
        if (isCollision && attempt < PURCHASE_RETRIES) continue;
        throw isCollision ? new ConflictException('Alta demanda: intenta de nuevo') : err;
      } finally {
        if (session) await session.endSession();
      }
    }
    throw new ConflictException('No se pudo completar la venta — intenta de nuevo');
  }

  /**
   * BOLETO GRATIS (bono de bienvenida): asigna el número libre más bajo
   * de la rifa SIN cobrar la billetera. Reintenta ante colisiones.
   */
  async grantFreeTicket(userId: string, raffleId: string) {
    const raffle = await this.raffleModel.findById(raffleId);
    if (!raffle || raffle.status !== RaffleStatus.ACTIVE) {
      throw new BadRequestException('La rifa del bono no está en venta');
    }
    for (let attempt = 1; attempt <= PURCHASE_RETRIES; attempt++) {
      const taken = new Set(await this.ticketModel.find({ raffleId }).distinct('ticketNumber'));
      let free = 0;
      for (let n = 1; n <= raffle.totalTickets; n++) if (!taken.has(n)) { free = n; break; }
      if (!free) throw new BadRequestException('La rifa del bono está agotada');
      try {
        return await this.ticketModel.create({
          userId,
          raffleId,
          ticketNumber: free,
          code: formatTicketCode(raffle.ticketPrefix, free, raffle.totalTickets),
        });
      } catch (err: any) {
        if (err?.code !== 11000 || attempt === PURCHASE_RETRIES) throw err;
      }
    }
    throw new ConflictException('No se pudo asignar el boleto de bienvenida');
  }

  /** Marca un boleto como "quemado" en una tirada al agua (Modo Presentador). */
  burnAlAgua(ticketId: string) {
    return this.ticketModel.findByIdAndUpdate(
      ticketId,
      { status: TicketStatus.BURNED_AL_AGUA },
      { new: true },
    );
  }

  /** Marca el boleto ganador de la tirada definitiva. */
  markWinner(ticketId: string) {
    return this.ticketModel.findByIdAndUpdate(
      ticketId,
      { status: TicketStatus.WINNER },
      { new: true },
    );
  }

  /**
   * 🔧 ADMIN — inyecta boletos directamente en una rifa, SIN cobro ni
   * transacción. Es la herramienta de corrección manual: si una compra
   * falló pero el usuario pagó, o para pruebas, el admin asigna los
   * números a mano. Devuelve los boletos creados.
   */
  async adminAddTickets(raffleId: string, userId: string, ticketNumbers: number[]) {
    const raffle = await this.raffleModel.findById(raffleId);
    if (!raffle) throw new NotFoundException('Rifa no existe');

    const nums = [...new Set(ticketNumbers)].filter((n) => n >= 1 && n <= raffle.totalTickets);
    if (!nums.length) throw new BadRequestException('Números inválidos o fuera de rango (1..' + raffle.totalTickets + ')');

    // Descartar los que ya existen (evita duplicados)
    const existing = await this.ticketModel.find({ raffleId, ticketNumber: { $in: nums } }).distinct('ticketNumber');
    const existingSet = new Set(existing);
    const toCreate = nums.filter((n) => !existingSet.has(n));
    if (!toCreate.length) throw new BadRequestException('Todos esos números ya existen en la rifa');

    const created = await this.ticketModel.insertMany(
      toCreate.map((ticketNumber) => ({
        userId: new Types.ObjectId(userId),
        raffleId: new Types.ObjectId(raffleId),
        ticketNumber,
        status: TicketStatus.ACTIVE,
        code: formatTicketCode(raffle.ticketPrefix, ticketNumber, raffle.totalTickets),
      })),
      { ordered: false },
    );
    await this.raffleModel.updateOne({ _id: raffleId }, { $inc: { soldCount: created.length } });
    this.logger.log(`🔧 Admin inyectó ${created.length} boleto(s) en "${raffle.title}"`);
    return { created: created.length, numbers: toCreate, skipped: nums.length - toCreate.length };
  }

  /**
   * 🔧 ADMIN — recalcula soldCount contando los boletos reales. Corrige el
   * contador si quedó desincronizado por compras a medias.
   */
  async adminRecountRaffle(raffleId: string) {
    const real = await this.ticketModel.countDocuments({ raffleId });
    await this.raffleModel.updateOne({ _id: raffleId }, { soldCount: real });
    return { soldCount: real };
  }

  /**
   * 🔧 ADMIN / SELLER — Reporte de ventas físicas (Cierres de Caja)
   */
  async getOfflineSales(startDate?: string, endDate?: string, sellerId?: string) {
    const match: any = { isOffline: true };
    if (sellerId) match.soldBy = new Types.ObjectId(sellerId);
    
    if (startDate || endDate) {
      match.createdAt = {};
      if (startDate) match.createdAt.$gte = new Date(startDate);
      if (endDate) match.createdAt.$lte = new Date(endDate);
    } else {
      // Por defecto, hoy
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);
      match.createdAt = { $gte: today, $lt: tomorrow };
    }

    const tickets = await this.ticketModel.aggregate([
      { $match: match },
      { 
        $lookup: {
          from: 'raffles',
          localField: 'raffleId',
          foreignField: '_id',
          as: 'raffle'
        }
      },
      { $unwind: '$raffle' },
      {
        $lookup: {
          from: 'users',
          localField: 'soldBy',
          foreignField: '_id',
          as: 'seller'
        }
      },
      { $unwind: { path: '$seller', preserveNullAndEmptyArrays: true } },
      {
        $project: {
          _id: 1,
          ticketNumber: 1,
          buyerName: 1,
          buyerPhone: 1,
          paymentMethod: 1,
          createdAt: 1,
          'raffle.title': 1,
          'raffle.ticketPrice': 1,
          'seller.name': 1
        }
      },
      { $sort: { createdAt: -1 } }
    ]);

    // Agrupar por transacción (misma fecha de creación exacta)
    const grouped = new Map<number, any>(); // time.getTime() -> tx
    
    tickets.forEach(t => {
      const time = new Date(t.createdAt).getTime();
      if (!grouped.has(time)) {
        grouped.set(time, {
          date: t.createdAt,
          buyerName: t.buyerName,
          buyerPhone: t.buyerPhone,
          paymentMethod: t.paymentMethod,
          sellerName: t.seller?.name ?? 'Desconocido',
          raffleTitle: t.raffle?.title ?? '',
          tickets: [],
          totalAmount: 0
        });
      }
      const tx = grouped.get(time)!;
      tx.tickets.push(t.ticketNumber);
      tx.totalAmount += (t.raffle?.ticketPrice ?? 0);
    });

    const details = Array.from(grouped.values());

    const summary = { total: 0, efectivo: 0, yape: 0, plin: 0, transferencia: 0 };
    details.forEach(d => {
      summary.total += d.totalAmount;
      if (d.paymentMethod === 'efectivo') summary.efectivo += d.totalAmount;
      if (d.paymentMethod === 'yape') summary.yape += d.totalAmount;
      if (d.paymentMethod === 'plin') summary.plin += d.totalAmount;
      if (d.paymentMethod === 'transferencia') summary.transferencia += d.totalAmount;
    });

    return { summary, details };
  }

  /**
   * Validación pública (escaneo QR).
   * Retorna información básica sin exponer datos sensibles del comprador.
   */
  async validateTicket(code: string) {
    if (!code) throw new BadRequestException('Código de boleto requerido');
    
    const ticket = await this.ticketModel.findOne({ code })
      .populate('raffleId', 'title status ticketPrice drawDate')
      .populate('userId', 'name phone');
      
    if (!ticket) {
      return { valid: false, message: 'Boleto no encontrado' };
    }

    const raffle = ticket.raffleId as any;
    
    let buyerName = ticket.isOffline ? ticket.buyerName : (ticket.userId as any)?.name || 'Anónimo';
    let buyerPhone = ticket.isOffline ? ticket.buyerPhone : (ticket.userId as any)?.phone || '';
    
    // Enmascarar teléfono por privacidad (999 *** 777)
    if (buyerPhone && buyerPhone.length >= 6) {
      buyerPhone = buyerPhone.substring(0, 3) + ' *** ' + buyerPhone.substring(buyerPhone.length - 3);
    }

    // Enmascarar nombre (Primera letra y asteriscos para cada palabra)
    if (buyerName && buyerName !== 'Anónimo') {
      buyerName = buyerName
        .trim()
        .split(' ')
        .map(word => {
          if (word.length <= 1) return word;
          return word.charAt(0) + '*'.repeat(word.length - 1);
        })
        .join(' ');
    }
    
    return {
      valid: true,
      ticket: {
        code: ticket.code,
        status: ticket.status,
        date: ticket.createdAt,
        buyerName,
        buyerPhone,
        channel: ticket.isOffline ? 'Venta Externa' : 'Web',
        raffleTitle: raffle.title,
        raffleStatus: raffle.status,
        raffleDate: raffle.drawDate
      }
    };
  }

}
