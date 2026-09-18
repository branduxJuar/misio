import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Schema as MongooseSchema, Types } from 'mongoose';

export type DossierStatus = 'received' | 'validated' | 'observed';

@Schema({ timestamps: true, collection: 'raffle_dossiers' })
export class RaffleDossier {
  @Prop({ type: Types.ObjectId, ref: 'Raffle', required: true, unique: true })
  raffleId: Types.ObjectId;

  // Datos del certificador (Notario, Auditor, etc.)
  @Prop()
  certifierName?: string;

  @Prop()
  certifierRole?: string;

  @Prop()
  reference?: string;

  // Archivo original protegido
  @Prop()
  originalFilePath?: string;

  @Prop()
  originalFileHash?: string;

  @Prop({ type: String, default: 'received' })
  status: DossierStatus;

  // Evidencia en video
  @Prop({ type: String })
  videoPlatform?: 'youtube' | 'kick' | 'local';

  @Prop()
  videoUrl?: string;

  @Prop()
  videoHash?: string;
}

export type RaffleDossierDocument = HydratedDocument<RaffleDossier>;
export const RaffleDossierSchema = SchemaFactory.createForClass(RaffleDossier);
