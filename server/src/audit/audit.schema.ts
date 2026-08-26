import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

/**
 * BITÁCORA DE ACCIONES DEL PERSONAL.
 *
 * En una plataforma que mueve dinero, el riesgo más común NO es el
 * hacker externo: es alguien de adentro confirmando un depósito que
 * nunca llegó, o "ajustando" un saldo. Esta bitácora hace que toda
 * acción sensible del staff quede firmada con nombre, hora e IP.
 * Es de solo escritura: nadie la edita desde la aplicación.
 */
@Schema({ timestamps: true, collection: 'audit_logs' })
// Índice TTL: MongoDB borra automáticamente los registros con más de 90
// días. Sin esto, la bitácora crece sin límite y llena el disco — y
// nadie va a revisar auditorías de hace un año.
// Para cambiar la retención: db.audit_logs.dropIndex('createdAt_1') y
// crear uno nuevo con el expireAfterSeconds que quieras.
export class AuditLog {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  actorId: Types.ObjectId;

  @Prop({ required: true })
  actorName: string;

  @Prop({ required: true })
  actorRole: string;

  /** Qué hizo: 'POST /payments/deposits/:id/confirm' */
  @Prop({ required: true, index: true })
  action: string;

  /** Módulo tocado: pagos, usuarios, tienda… (para filtrar) */
  @Prop({ default: '', index: true })
  module: string;

  /** Sobre qué recurso (id de la rifa, del usuario, del depósito…) */
  @Prop({ default: '' })
  targetId: string;

  /** Datos relevantes SIN secretos (nunca contraseñas ni tokens). */
  @Prop({ type: Object, default: {} })
  meta: Record<string, unknown>;

  @Prop({ default: '' })
  ip: string;

  @Prop({ default: true })
  success: boolean;
}
export type AuditLogDocument = HydratedDocument<AuditLog>;
export const AuditLogSchema = SchemaFactory.createForClass(AuditLog);

/** La bitácora se lee siempre por fecha descendente y se filtra por módulo. */
AuditLogSchema.index({ createdAt: -1 });
AuditLogSchema.index({ module: 1, createdAt: -1 });
AuditLogSchema.index({ actorId: 1, createdAt: -1 });


AuditLogSchema.index({ createdAt: 1 }, { expireAfterSeconds: 90 * 24 * 3600 }); // 90 días
