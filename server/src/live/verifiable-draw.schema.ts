import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Schema as MongooseSchema, Types } from 'mongoose';

const PrizeSnapshotSchema = new MongooseSchema({ title: String, drawMode: String, winningAttempt: Number }, { _id: false });
const DrawEventSchema = new MongooseSchema({ prizeIndex: Number, attempt: Number, ticketNumber: Number, result: String, drawnAt: String }, { _id: false });

@Schema({ timestamps: true, collection: 'verifiable_draws' })
export class VerifiableDraw {
  @Prop({ type: Types.ObjectId, ref: 'Raffle', required: true, unique: true })
  raffleId: Types.ObjectId;

  @Prop({ type: [Number], required: true })
  tickets: number[];

  @Prop({ type: [PrizeSnapshotSchema], required: true })
  prizes: { title: string; drawMode: string; winningAttempt: number }[];

  @Prop({ required: true })
  commitment: string;

  @Prop({ required: true })
  beaconRound: number;

  @Prop({ required: true })
  beaconChain: string;

  @Prop()
  beaconSignature?: string;

  @Prop({ type: [Number] })
  sequence?: number[];

  @Prop({ default: 0 })
  cursor: number;

  @Prop({ type: [DrawEventSchema], default: [] })
  events: { prizeIndex: number; attempt: number; ticketNumber: number; result: 'al_agua' | 'winner'; drawnAt: string }[];

  @Prop()
  openedAt?: Date;

  @Prop()
  closedAt?: Date;

  @Prop()
  commitmentPublishedAt?: Date;

  @Prop({ type: [{ severity: String, message: String, timestamp: Date }], default: [] })
  incidents: { severity: string; message: string; timestamp: Date }[];
}

export type VerifiableDrawDocument = HydratedDocument<VerifiableDraw>;
export const VerifiableDrawSchema = SchemaFactory.createForClass(VerifiableDraw);
