import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export enum ComplaintKind {
  RECLAMO = 'reclamo', // Disconformidad con el producto/servicio
  QUEJA = 'queja', // Malestar con la atención
}

export enum ComplaintStatus {
  PENDING = 'pending',
  ANSWERED = 'answered',
}

/**
 * LIBRO DE RECLAMACIONES VIRTUAL (Ley N° 29571 + D.S. 011-2011-PCM).
 * El proveedor debe responder dentro del plazo legal (30 días
 * calendario). El código LR-XXXX es el folio del reclamo.
 */
@Schema({ timestamps: true, collection: 'complaints' })
export class Complaint {
  @Prop({ required: true, unique: true })
  code: string; // LR-000123

  /** Si estaba logueado; los invitados también pueden reclamar. */
  @Prop({ type: Types.ObjectId, ref: 'User', default: null, index: true })
  userId: Types.ObjectId | null;

  @Prop({ required: true }) fullName: string;
  @Prop({ required: true }) dni: string;
  @Prop({ default: '' }) email: string;
  @Prop({ default: '' }) phone: string;

  @Prop({ type: String, enum: ComplaintKind, required: true })
  kind: ComplaintKind;

  /** Pedido/rifa/canje relacionado (opcional). */
  @Prop({ default: '' })
  orderRef: string;

  @Prop({ required: true, maxlength: 3000 })
  detail: string;

  @Prop({ type: String, enum: ComplaintStatus, default: ComplaintStatus.PENDING, index: true })
  status: ComplaintStatus;

  @Prop({ default: '' })
  response: string;

  @Prop({ type: Date, default: null })
  respondedAt: Date | null;
}
export type ComplaintDocument = HydratedDocument<Complaint>;
export const ComplaintSchema = SchemaFactory.createForClass(Complaint);
