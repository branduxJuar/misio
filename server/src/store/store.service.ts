import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  Redemption, RedemptionDocument, RedemptionStatus, StoreItem, StoreItemDocument,
} from './store.schema';
import { User, UserDocument } from '../users/user.schema';
import { TransactionsService } from '../transactions/transactions.service';
import { TransactionStatus, TransactionType } from '../transactions/transaction.schema';
import { NotificationsService } from '../notifications/notifications.service';
import { NotificationType } from '../notifications/notification.schema';
import { InboxService } from '../inbox/inbox.service';
import { MailService } from '../auth/mail.service';
import { PushService } from '../notifications/push.service';

@Injectable()
export class StoreService {
  constructor(
    @InjectModel(StoreItem.name) private itemModel: Model<StoreItemDocument>,
    @InjectModel(Redemption.name) private redemptionModel: Model<RedemptionDocument>,
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    private readonly txService: TransactionsService,
    private readonly notifService: NotificationsService,
    private readonly inbox: InboxService,
    private readonly mailService: MailService,
    private readonly pushService: PushService,
  ) {}

  // ── Catálogo ────────────────────────────────────────────────────
  findActiveItems() {
    return this.itemModel.find({ active: true }).sort({ priceMisio: 1 }).lean();
  }

  findAllItems() {
    return this.itemModel.find().sort({ createdAt: -1 }).lean();
  }

  createItem(data: Partial<StoreItem>) {
    return this.itemModel.create(data);
  }

  async updateItem(id: string, data: Partial<StoreItem>) {
    const doc = await this.itemModel.findByIdAndUpdate(id, data, { new: true });
    if (!doc) throw new NotFoundException('Producto no existe');
    return doc;
  }

  async removeItem(id: string) {
    const doc = await this.itemModel.findByIdAndDelete(id);
    if (!doc) throw new NotFoundException('Producto no existe');
    return { deleted: true };
  }

  /** Subir/quitar fotos del producto. */
  async addImages(id: string, urls: string[]) {
    const doc = await this.itemModel.findByIdAndUpdate(
      id, { $push: { images: { $each: urls } } }, { new: true },
    );
    if (!doc) throw new NotFoundException('Producto no existe');
    return doc;
  }

  async removeImage(id: string, url: string) {
    const doc = await this.itemModel.findByIdAndUpdate(
      id, { $pull: { images: url } }, { new: true },
    );
    if (!doc) throw new NotFoundException('Producto no existe');
    return doc;
  }

  // ── Canje ───────────────────────────────────────────────────────
  /**
   * CHECKOUT DEL CARRITO (multi-producto):
   * (1) reclama stock línea por línea de forma atómica — si una falla,
   *     devuelve el stock ya reclamado; (2) cobra el TOTAL vía ledger
   *     (guard de saldo); si falla, restaura todo; (3) crea UNA orden
   *     con sus líneas + notificación.
   */
  async checkout(
    userId: string,
    cart: { itemId: string; qty: number }[],
    delivery?: { address?: string; reference?: string; phone?: string; email?: string; note?: string },
  ) {
    if (!cart?.length) throw new BadRequestException('El carrito está vacío');

    const lines: { itemId: any; name: string; price: number; qty: number; limited: boolean; saleType: 'canje' | 'venta' }[] = [];
    const claimed: { itemId: string; qty: number }[] = []; // Para rollback

    const rollback = async () => {
      for (const c of claimed) {
        await this.itemModel.updateOne({ _id: c.itemId }, { $inc: { stock: c.qty } });
      }
    };

    // (1) Validar y reclamar stock
    for (const entry of cart) {
      const qty = Math.max(1, Math.min(20, Math.floor(entry.qty ?? 1)));
      const item = await this.itemModel.findOne({ _id: entry.itemId, active: true });
      if (!item) {
        await rollback();
        throw new NotFoundException('Un producto del carrito ya no está disponible');
      }
      if (item.stock !== -1) {
        const ok = await this.itemModel.findOneAndUpdate(
          { _id: item._id, stock: { $gte: qty } },
          { $inc: { stock: -qty } },
        );
        if (!ok) {
          await rollback();
          throw new BadRequestException(`Stock insuficiente de "${item.name}"`);
        }
        claimed.push({ itemId: item._id.toString(), qty });
      }
      lines.push({ itemId: item._id, name: item.name, price: item.priceMisio, qty, limited: item.stock !== -1, saleType: (item as any).saleType ?? 'canje' });
    }

    const total = lines.reduce((s, l) => s + l.price * l.qty, 0);

    // (2) COBRO DIVIDIDO POR BILLETERA:
    //  🎁 canje → walletCanje (reembolsos Cero Pérdida)
    //  💵 venta → walletBalance (dinero real recargado)
    const totalCanje = lines.filter((l) => l.saleType === 'canje')
      .reduce((s, l) => s + l.price * l.qty, 0);
    const totalVenta = lines.filter((l) => l.saleType === 'venta')
      .reduce((s, l) => s + l.price * l.qty, 0);

    const user = await this.userModel.findById(userId).lean();
    if (!user) {
      await rollback();
      throw new NotFoundException('Usuario no encontrado');
    }

    const walletCanje = Number(user.walletCanje ?? 0);
    const walletContable = Number(user.walletBalance ?? 0);

    // Lógica de fallback: 
    // - Venta DEBE pagarse con Contable
    // - Canje se paga primero con Canje, si falta se usa Contable
    let chargeVentaContable = totalVenta;
    let chargeCanjeDesdeCanje = Math.min(totalCanje, walletCanje);
    let chargeCanjeDesdeContable = totalCanje - chargeCanjeDesdeCanje;

    const faltanteVenta = Math.max(0, chargeVentaContable - walletContable);
    const contableSobrante = Math.max(0, walletContable - chargeVentaContable);
    const faltanteCanje = Math.max(0, chargeCanjeDesdeContable - contableSobrante);

    if (faltanteVenta > 0) {
      await rollback();
      throw new BadRequestException('Saldo Contable insuficiente para productos de Venta');
    }
    if (faltanteCanje > 0) {
      await rollback();
      throw new BadRequestException('Saldo insuficiente para completar la compra de Canje');
    }

    const charge = (amount: number, wallet: 'contable' | 'canje', label: string) =>
      this.txService.create({
        userId,
        amount: -amount,
        type: TransactionType.MARKETPLACE_PURCHASE,
        status: TransactionStatus.COMPLETED,
        wallet,
        meta: { itemName: label },
      });

    const canjeLabel = lines.filter((l) => l.saleType === 'canje').map((l) => `${l.qty}× ${l.name}`).join(', ');
    const ventaLabel = lines.filter((l) => l.saleType === 'venta').map((l) => `${l.qty}× ${l.name}`).join(', ');

    let revertedCanje = 0;
    let revertedContable = 0;

    try {
      if (chargeCanjeDesdeCanje > 0) {
        await charge(chargeCanjeDesdeCanje, 'canje', canjeLabel);
        revertedCanje += chargeCanjeDesdeCanje;
      }
      if (chargeCanjeDesdeContable > 0) {
        await charge(chargeCanjeDesdeContable, 'contable', `Fallback canje: ${canjeLabel}`);
        revertedContable += chargeCanjeDesdeContable;
      }
      if (chargeVentaContable > 0) {
        await charge(chargeVentaContable, 'contable', ventaLabel);
        revertedContable += chargeVentaContable;
      }
    } catch (err) {
      // Compensación: devolver lo ya cobrado al canje/contable + stock
      if (revertedCanje > 0) {
        await this.txService.create({
          userId,
          amount: revertedCanje,
          type: TransactionType.MARKETPLACE_PURCHASE,
          status: TransactionStatus.COMPLETED,
          wallet: 'canje',
          meta: { itemName: `Reverso por fallo de cobro: ${canjeLabel}` },
        });
      }
      if (revertedContable > 0) {
        await this.txService.create({
          userId,
          amount: revertedContable,
          type: TransactionType.MARKETPLACE_PURCHASE,
          status: TransactionStatus.COMPLETED,
          wallet: 'contable',
          meta: { itemName: `Reverso por fallo de cobro` },
        });
      }
      await rollback();
      throw err;
    }

    // (3) Orden única con líneas
    const summary = lines.map((l) => `${l.qty}× ${l.name}`).join(', ');
    // El tipo de entrega lo define el primer producto (una orden mixta es
    // rara; si la hay, gana el físico porque necesita envío).
    const firstItem = await this.itemModel.findById(lines[0].itemId).lean();
    const fulfillment = (lines.length === 1)
      ? ((firstItem as any)?.fulfillment ?? 'fisico')
      : 'fisico';

    const order = await this.redemptionModel.create({
      userId,
      itemId: lines[0].itemId,
      itemName: summary,
      price: total,
      items: lines.map(({ itemId, name, price, qty }) => ({ itemId, name, price, qty })),
      fulfillment,
      delivery: delivery ?? {},
    });

    await this.notifService.notifyUser(
      userId,
      `🛍️ ¡Orden registrada! ${summary} — total S/ ${total.toFixed(2)}. Te contactaremos para la entrega.`,
      NotificationType.GENERAL,
    );
    return order;
  }

  /** Canje de un solo producto (compatibilidad): checkout de 1 línea. */
  redeem(userId: string, itemId: string) {
    return this.checkout(userId, [{ itemId, qty: 1 }]);
  }

  findMyRedemptions(userId: string) {
    return this.redemptionModel.find({ userId })
      .populate('itemId', 'name fulfillment emoji imageUrl')
      .sort({ createdAt: -1 })
      .lean();
  }

  findAllRedemptions() {
    return this.redemptionModel
      .find()
      .populate('userId', 'name dni phone email')
      .populate('itemId', 'name fulfillment emoji imageUrl images')
      .sort({ status: 1, createdAt: -1 }) // Pendientes primero
      .lean();
  }

  /** Solo entregados (historial). */
  findDeliveredRedemptions() {
    return this.redemptionModel
      .find({ status: RedemptionStatus.DELIVERED })
      .populate('userId', 'name dni phone email')
      .populate('itemId', 'name fulfillment emoji imageUrl images')
      .sort({ deliveredAt: -1 })
      .limit(500)
      .lean();
  }

  /** Detalle completo de un canje (para el modal de gestión). */
  async findRedemptionDetail(id: string) {
    const r = await this.redemptionModel.findById(id)
      .populate('userId', 'name dni phone email')
      .populate('itemId', 'name fulfillment emoji imageUrl images description')
      .lean();
    if (!r) throw new NotFoundException('Canje no existe');
    return r;
  }

  /** Adjuntar evidencia a un canje (rutas de las imágenes subidas). */
  async addEvidence(id: string, urls: string[]) {
    const doc = await this.redemptionModel.findByIdAndUpdate(
      id, { $push: { evidence: { $each: urls } } }, { new: true },
    );
    if (!doc) throw new NotFoundException('Canje no existe');
    return { evidence: doc.evidence };
  }

  /** Cambiar estado intermedio del canje (ej. a PROCESSING). */
  async updateStatus(id: string, status: RedemptionStatus) {
    const doc = await this.redemptionModel.findByIdAndUpdate(
      id, { status }, { new: true },
    );
    if (!doc) throw new NotFoundException('Canje no existe');
    return doc;
  }

  /** Adjuntar recibos de compra a un canje. */
  async addReceipts(id: string, urls: string[]) {
    const doc = await this.redemptionModel.findByIdAndUpdate(
      id, { $push: { receipts: { $each: urls } } }, { new: true },
    );
    if (!doc) throw new NotFoundException('Canje no existe');
    return { receipts: doc.receipts };
  }

  async removeEvidence(id: string, url: string) {
    const doc = await this.redemptionModel.findByIdAndUpdate(
      id, { $pull: { evidence: url } }, { new: true }
    );
    if (!doc) throw new NotFoundException('Canje no existe');
    return { evidence: doc.evidence };
  }

  async removeReceipt(id: string, url: string) {
    const doc = await this.redemptionModel.findByIdAndUpdate(
      id, { $pull: { receipts: url } }, { new: true }
    );
    if (!doc) throw new NotFoundException('Canje no existe');
    return { receipts: doc.receipts };
  }

  /**
   * Marca un canje como entregado. Para productos VIRTUALES, entrega el
   * código por los tres canales: correo interno (queda registrado),
   * correo externo (si el usuario tiene email) y notificación. El admin
   * también adjunta evidencia y una nota.
   */
  async markDelivered(id: string, opts: {
    virtualCode?: string;
    virtualCodes?: { itemName: string; code: string }[];
    deliveryNote?: string;
    evidence?: string[];
  } = {}) {
    const doc = await this.redemptionModel.findOne({ 
      _id: id, 
      status: { $in: [RedemptionStatus.PENDING, RedemptionStatus.PROCESSING] } 
    }).populate('userId', 'name email');
    if (!doc) throw new NotFoundException('Canje no existe o ya fue entregado');

    doc.status = RedemptionStatus.DELIVERED;
    doc.deliveredAt = new Date();
    if (opts.virtualCode) doc.virtualCode = opts.virtualCode;
    if (opts.virtualCodes) doc.virtualCodes = opts.virtualCodes;
    if (opts.deliveryNote) doc.deliveryNote = opts.deliveryNote;
    if (opts.evidence?.length) doc.evidence = [...(doc.evidence ?? []), ...opts.evidence];
    await doc.save();

    const user: any = doc.userId;
    const userId = user ? (user._id ?? user).toString() : null;

    if (userId) {
      // Notificación in-app
      await this.notifService.notifyUser(
        userId,
        `✅ Tu canje "${doc.itemName}" fue entregado. ¡Disfrútalo!`,
        NotificationType.GENERAL,
      );

      // Producto VIRTUAL con código: entrega multicanal
      if (doc.fulfillment === 'virtual' && opts.virtualCode) {
        // 1. Correo interno (siempre — queda registrado y copiable)
        await this.inbox.send({
          userId,
          subject: `🎁 Tu código: ${doc.itemName}`,
          body: `¡Listo! Aquí está el código de tu canje "${doc.itemName}". Cópialo y úsalo según las instrucciones del producto.`,
          kind: 'code',
          code: opts.virtualCode,
          redemptionId: id,
        }).catch(() => {});

        // 2. Correo externo (si tiene email)
        if (user?.email) {
          this.mailService.sendGenericMail?.(
            user.email,
            `🎁 Tu código de ${doc.itemName} — Misio`,
            `<p>Hola <b>${user.name}</b>,</p>
             <p>Aquí está el código de tu canje <b>${doc.itemName}</b>:</p>
               <div style="text-align:center;margin:18px 0">
               <span style="display:inline-block;padding:14px 28px;background:#e0f2f1;
                 border:2px dashed #0d9488;border-radius:10px;font-size:22px;
                 font-weight:800;letter-spacing:2px;color:#0f2926">${opts.virtualCode}</span>
               </div>
             <p style="color:#666;font-size:12px">También lo tienes en tu correo interno de Misio.</p>`,
          )?.catch?.(() => {});
        }

        // 3. Push
        await this.pushService.sendToUser(
          userId, '🎁 ¡Tu código llegó!',
          `El código de "${doc.itemName}" está en tu correo interno.`,
          '/mi-cuenta',
        ).catch(() => {});
      }
    }

    return doc;
  }
}
