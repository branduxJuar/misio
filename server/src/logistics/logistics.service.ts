import { BadRequestException, Injectable, NotFoundException, OnModuleInit } from '@nestjs/common';
import { MailService } from '../auth/mail.service';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { DeliveryStatus, LogisticsERP, LogisticsERPDocument } from './logistics.schema';
import { User, UserDocument } from '../users/user.schema';
import { Raffle, RaffleDocument } from '../raffles/raffle.schema';
import { Ticket, TicketDocument } from '../tickets/ticket.schema';
import { InboxService } from '../inbox/inbox.service';

/** Etiquetas de la bitácora por estado de entrega. */
const STATUS_LABEL: Record<DeliveryStatus, string> = {
  [DeliveryStatus.IN_STOCK]: 'Premio en almacén',
  [DeliveryStatus.TRANSIT]: 'Premio en tránsito con el courier',
  [DeliveryStatus.DELIVERED]: 'Premio ENTREGADO al ganador ✓',
};

@Injectable()
export class LogisticsService implements OnModuleInit {
  constructor(
    @InjectModel(LogisticsERP.name) private erpModel: Model<LogisticsERPDocument>,
    @InjectModel(Raffle.name) private raffleModel: Model<RaffleDocument>,
    @InjectModel(Ticket.name) private ticketModel: Model<TicketDocument>,
    private readonly mailService: MailService,
    private readonly inboxService: InboxService,
  ) {}

  async onModuleInit() {
    // Al iniciar el servidor, reparar automáticamente cualquier premio ganado que no aparezca en bandeja/ERP
    setTimeout(() => {
      this.syncWinners().catch(() => {});
    }, 1500);
  }

  /** Registrar compra de premio: abre la bitácora con la primera entrada. */
  create(data: Partial<LogisticsERP>) {
    return this.erpModel.create({
      ...data,
      history: [{ label: `Premio comprado — costo S/ ${data.purchaseCost}`, at: new Date() }],
    });
  }

  /**
   * Inventario para el panel de logística. Trae el CONTACTO del ganador
   * (teléfono, correo y dirección de envío): sin eso, gestionar una
   * entrega obliga a saltar a otro módulo a buscar a la persona.
   */
  findAll() {
    return this.erpModel
      .find()
      .populate('raffleId', 'title ticketPrice totalTickets status winner')
      .populate('winnerId', 'name dni phone email address altContact avatarUrl')
      .sort({ createdAt: -1 })
      .limit(500)
      .lean();
  }

  /**
   * MIS PREMIOS (usuario): lo que gané y en qué va su envío.
   * Devuelve solo lo que le incumbe — jamás el costo de compra ni la
   * boleta: eso es información interna del negocio.
   */
  async findMine(userId: string) {
    const ids: any[] = [userId];
    try { ids.push(new Types.ObjectId(userId)); } catch {}

    // Auto-reparar al vuelo si el usuario ganó algún sorteo y no figuraba aún en Logística o su bandeja
    try {
      const wonTickets = await this.ticketModel.find({ userId: { $in: ids }, status: 'winner' }).populate('raffleId', 'title type prizes').lean();
      
      for (const t of wonTickets as any[]) {
        if (!t.raffleId) continue;
        const r = t.raffleId;
        const isPaquete = r.type === 'paquete';
        
        const erpFilter: any = { raffleId: r._id };
        if (isPaquete && t.prizeIndex !== undefined) {
          erpFilter.prizeIndex = t.prizeIndex;
        }

        const existing = await this.erpModel.findOne(erpFilter).lean();

        if (!existing || !existing.winnerId || String(existing.winnerId) !== String(userId)) {
          const prizeName = isPaquete && r.prizes && r.prizes[t.prizeIndex] 
            ? r.prizes[t.prizeIndex].title 
            : r.title;
            
          await this.erpModel.findOneAndUpdate(
            erpFilter,
            {
              raffleId: r._id,
              ...(isPaquete && t.prizeIndex !== undefined ? { prizeIndex: t.prizeIndex } : {}),
              winnerId: new Types.ObjectId(userId),
              $setOnInsert: {
                productName: prizeName || 'Premio Sorteo Misio',
                purchaseCost: 0,
                deliveryStatus: 'in_stock',
              },
              $push: {
                history: {
                  label: `Premio confirmado para entrega (boleto #${t.ticketNumber})`,
                  at: new Date(),
                },
              },
            },
            { upsert: true },
          );
        }

        if (this.inboxService) {
          const msgs = await this.inboxService.findMine(userId);
          const prizeName = isPaquete && r.prizes && r.prizes[t.prizeIndex] ? r.prizes[t.prizeIndex].title : r.title;
          if (!msgs.some(m => (m.subject?.includes(prizeName) || m.body?.includes(prizeName)) && m.body?.includes(String(t.ticketNumber)))) {
            await this.inboxService.send({
              userId,
              subject: `🏆 ¡Felicitaciones, ganaste ${prizeName}!`,
              body: `¡Eres el ganador indiscutible del sorteo "${r.title}" con tu boleto N° ${t.ticketNumber}! Ya estamos organizando tu envío. Puedes hacer el seguimiento desde tu pestaña "Mis premios y envíos".`,
              kind: 'info',
            });
          }
        }
      }
    } catch (e) {
      // Si ocurre un error leve en la auto-sincronización, seguimos devolviendo la lista de premios
    }

    const rows = await this.erpModel
      .find({ winnerId: { $in: ids } })
      .populate('raffleId', 'title images ticketPrefix')
      .sort({ createdAt: -1 })
      .limit(100)
      .lean();

    return rows.map((r: any) => ({
      _id: r._id,
      productName: r.productName,
      raffle: r.raffleId,
      deliveryStatus: r.deliveryStatus,
      shipping: {
        courier: r.shippingDetails?.courier ?? '',
        trackingNumber: r.shippingDetails?.trackingNumber ?? '',
        destinationCity: r.shippingDetails?.destinationCity ?? '',
      },
      evidencePhotoUrl: r.evidencePhotoUrl ?? '',
      history: r.history ?? [],
      wonAt: r.createdAt,
    }));
  }

  /**
   * SINCRONIZAR GANADORES (admin): recorre los sorteos completados y se
   * asegura de que cada ganador tenga su fila de envío en el ERP.
   */
  async syncWinners() {
    const wonTickets = await this.ticketModel
      .find({ status: 'winner' })
      .populate('raffleId', 'title type prizes ticketPrefix')
      .lean();

    let creados = 0;
    let actualizados = 0;
    for (const t of wonTickets as any[]) {
      if (!t.raffleId) continue;
      const r = t.raffleId;
      const isPaquete = r.type === 'paquete';
      
      const cleanWinnerId = t.userId ? String(t.userId) : null;
      const erpFilter: any = { raffleId: r._id };
      if (isPaquete && t.prizeIndex !== undefined) {
        erpFilter.prizeIndex = t.prizeIndex;
      }

      const existing = await this.erpModel.findOne(erpFilter).lean();
      
      const needsSync = !existing || 
        (cleanWinnerId && (!existing.winnerId || String(existing.winnerId) !== cleanWinnerId)) ||
        (!cleanWinnerId && (!existing.offlineWinnerName || existing.offlineWinnerName !== t.buyerName));

      if (needsSync) {
        const prizeName = isPaquete && r.prizes && r.prizes[t.prizeIndex] 
            ? r.prizes[t.prizeIndex].title 
            : r.title;

        await this.erpModel.findOneAndUpdate(
          erpFilter,
          {
            raffleId: r._id,
            ...(isPaquete && t.prizeIndex !== undefined ? { prizeIndex: t.prizeIndex } : {}),
            winnerId: cleanWinnerId ? new Types.ObjectId(cleanWinnerId) : null,
            offlineWinnerName: !cleanWinnerId ? (t.buyerName || '—') : undefined,
            offlineWinnerPhone: !cleanWinnerId ? (t.buyerPhone || '') : undefined,
            $setOnInsert: {
              productName: prizeName || 'Premio',
              purchaseCost: 0,
              deliveryStatus: 'in_stock',
            },
            $push: {
              history: {
                label: cleanWinnerId
                  ? `🔄 Registro Logístico recuperado. Se ha sincronizado automáticamente al ganador ${t.buyerName || 'registrado'} (Boleto #${t.ticketNumber}). Listo para el despacho.`
                  : `🔄 Registro Logístico recuperado. Se sincronizó la Venta Externa de ${t.buyerName || 'Anónimo'} (Boleto #${t.ticketNumber}). Coordina la entrega por fuera del sistema.`,
                at: new Date(),
              },
            },
          },
          { upsert: true },
        );
        if (existing) actualizados += 1;
        else creados += 1;
      }

      if (this.inboxService && cleanWinnerId) {
        try {
          const userMsgs = await this.inboxService.findMine(cleanWinnerId);
          const prizeName = isPaquete && r.prizes && r.prizes[t.prizeIndex] ? r.prizes[t.prizeIndex].title : r.title;
          if (!userMsgs.some(m => (m.subject?.includes(prizeName) || m.body?.includes(prizeName)) && m.body?.includes(String(t.ticketNumber)))) {
            await this.inboxService.send({
              userId: cleanWinnerId,
              subject: `🏆 ¡Felicitaciones, ganaste ${prizeName}!`,
              body: `¡Eres el ganador indiscutible del sorteo "${r.title}" con tu boleto N° ${t.ticketNumber}! Ya estamos organizando tu envío. Puedes hacer el seguimiento desde la pestaña "Mis premios y envíos".`,
              kind: 'info',
            });
          }
        } catch (e) {}
      }
    }
    return {
      revisados: wonTickets.length,
      filasCreadas: creados,
      filasActualizadas: actualizados,
      mensaje: creados + actualizados > 0
        ? `Reparado: ${creados} envío(s) creados y ${actualizados} actualizado(s) — revisa la tabla`
        : 'Todo estaba en orden: cada ganador ya tiene su envío',
    };
  }

  /**
   * CAMBIO DE ESTADO (solo el estado). El caso real del día a día:
   * "ya lo despaché" → un clic. Si pasa a TRÁNSITO se pueden adjuntar
   * courier y guía en la misma llamada; para DELIVERED se exige evidencia
   * (la foto de la entrega es lo que hace pública y verificable la
   * promesa de que sí entregamos).
   */
  async setStatus(
    id: string,
    status: DeliveryStatus,
    extra?: { courier?: string; trackingNumber?: string },
  ) {
    const current = await this.erpModel.findById(id).lean();
    if (!current) throw new NotFoundException(`Registro ERP ${id} no existe`);
    if (current.deliveryStatus === status) return current;

    if (status === DeliveryStatus.DELIVERED && !current.evidencePhotoUrl) {
      throw new BadRequestException(
        'Adjunta primero la foto de la entrega usando el botón "Detalles" (⚙️). Sin evidencia no se marca como entregado.',
      );
    }
    if (status === DeliveryStatus.TRANSIT) {
      const courier = extra?.courier || current.shippingDetails?.courier;
      const guia = extra?.trackingNumber || current.shippingDetails?.trackingNumber;
      if (!courier || !guia) {
        throw new BadRequestException('Para marcar EN TRÁNSITO indica el courier y el número de guía');
      }
    }
    const updated = await this.update(id, {
      deliveryStatus: status,
      ...(extra && (extra.courier || extra.trackingNumber)
        ? { shippingDetails: { ...current.shippingDetails, ...extra } as any }
        : {}),
    });

    // Correo al ganador cuando despachamos: el tracking es lo primero
    // que quiere saber ("¿ya salió mi premio?").
    if (status === DeliveryStatus.TRANSIT && current.winnerId) {
      try {
        const winner = await this.erpModel.findById(id).populate('winnerId', 'name email').lean();
        const w = winner?.winnerId as any;
        if (w?.email) {
          await this.mailService.sendPrizeShipped(
            w.email, w.name, current.productName,
            extra?.courier || '', extra?.trackingNumber || '',
          );
        }
      } catch { /* el correo nunca rompe la operación */ }
    }

    return updated;
  }

  /**
   * Actualiza tracking / estado de entrega y ESCRIBE LA BITÁCORA sola:
   * cada cambio relevante (guía registrada, cambio de estado) agrega su
   * entrada al history — el Timeline del panel se alimenta de aquí.
   */
  async update(id: string, data: Partial<LogisticsERP>) {
    const current = await this.erpModel.findById(id).lean();
    if (!current) throw new NotFoundException(`Registro ERP ${id} no existe`);

    const entries: { label: string; at: Date }[] = [];
    const now = new Date();

    const newTracking = (data.shippingDetails as any)?.trackingNumber;
    if (newTracking && newTracking !== current.shippingDetails?.trackingNumber) {
      const courier = (data.shippingDetails as any)?.courier || current.shippingDetails?.courier || 'courier';
      entries.push({ label: `Guía ${newTracking} registrada con ${courier}`, at: now });
    }

    if (data.deliveryStatus && data.deliveryStatus !== current.deliveryStatus) {
      entries.push({ label: STATUS_LABEL[data.deliveryStatus], at: now });
    }

    return this.erpModel.findByIdAndUpdate(
      id,
      {
        ...data,
        // shippingDetails se fusiona (no se pisa lo que no vino en el PATCH)
        shippingDetails: { ...current.shippingDetails, ...(data.shippingDetails ?? {}) },
        ...(entries.length ? { $push: { history: { $each: entries } } } : {}),
      },
      { new: true },
    );
  }

  /** Adjunta boleta o evidencia (llamado por los endpoints de upload). */
  async attachFile(id: string, kind: 'receipt' | 'evidence', fileUrl: string) {
    const label =
      kind === 'receipt'
        ? 'Boleta/factura de compra adjuntada'
        : 'Foto de evidencia de entrega adjuntada 📸';

    const doc = await this.erpModel.findByIdAndUpdate(
      id,
      {
        [kind === 'receipt' ? 'receiptFileUrl' : 'evidencePhotoUrl']: fileUrl,
        $push: { history: { label, at: new Date() } },
      },
      { new: true },
    );
    if (!doc) throw new NotFoundException(`Registro ERP ${id} no existe`);
    return doc;
  }

  /**
   * KPI financiero global: suma de ingresos por boletos (vía $lookup a la
   * rifa) menos la suma de costos de compra de premios = margen neto.
   */
  async financialSummary() {
    const [summary] = await this.erpModel.aggregate([
      {
        $lookup: {
          from: 'raffles',
          localField: 'raffleId',
          foreignField: '_id',
          as: 'raffle',
        },
      },
      { $unwind: '$raffle' },
      {
        $group: {
          _id: null,
          totalRevenue: {
            $sum: { $multiply: ['$raffle.ticketPrice', '$raffle.totalTickets'] },
          },
          totalCosts: { $sum: '$purchaseCost' },
          prizesInStock: {
            $sum: { $cond: [{ $eq: ['$deliveryStatus', DeliveryStatus.IN_STOCK] }, 1, 0] },
          },
          prizesInTransit: {
            $sum: { $cond: [{ $eq: ['$deliveryStatus', DeliveryStatus.TRANSIT] }, 1, 0] },
          },
        },
      },
      {
        $project: {
          _id: 0,
          totalRevenue: 1,
          totalCosts: 1,
          netMargin: { $subtract: ['$totalRevenue', '$totalCosts'] },
          prizesInStock: 1,
          prizesInTransit: 1,
        },
      },
    ]);
    return summary ?? { totalRevenue: 0, totalCosts: 0, netMargin: 0, prizesInStock: 0, prizesInTransit: 0 };
  }

  /**
   * Construye el timeline completo de un premio, desde su sorteo hasta su entrega.
   */
  async getTimeline(id: string) {
    const doc = await this.erpModel.findById(id).populate('raffleId').lean();
    if (!doc) throw new NotFoundException('Envío no encontrado');

    const timeline: any[] = [];
    const raffle: any = doc.raffleId;

    if (raffle?.createdAt) {
      timeline.push({ label: `Sorteo creado: ${raffle.title}`, at: raffle.createdAt, type: 'start' });
    }

    if (doc.winnerId) {
      const ticket = await this.ticketModel
        .findOne({ raffleId: raffle?._id, userId: doc.winnerId, status: 'winner' })
        .sort({ createdAt: -1 })
        .lean();
      if (ticket) {
        timeline.push({ label: `Boleto ganador comprado (#${ticket.ticketNumber})`, at: ticket.createdAt, type: 'ticket' });
      }
    } else if (doc.offlineWinnerName) {
      const ticket = await this.ticketModel
        .findOne({ raffleId: raffle?._id, buyerName: doc.offlineWinnerName, status: 'winner' })
        .sort({ createdAt: -1 })
        .lean();
      if (ticket) {
        timeline.push({ label: `Boleto ganador externo vendido (#${ticket.ticketNumber})`, at: ticket.createdAt, type: 'ticket' });
      }
    }

    const drawDate = raffle?.winner?.drawnAt || (doc as any).createdAt;
    timeline.push({ label: `Sorteo realizado. Premio ganado: ${doc.productName}`, at: drawDate, type: 'win' });

    if (doc.history && doc.history.length > 0) {
      doc.history.forEach((h: any) => {
        const lbl = h.label.toLowerCase();
        if (lbl.includes('rifa completada') || lbl.includes('ganador sincronizado') || lbl.includes('premio confirmado')) {
          return;
        }
        timeline.push({ label: h.label, at: h.at, type: 'step' });
      });
    }

    // Ordenar cronológicamente
    timeline.sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime());
    return timeline;
  }
}
