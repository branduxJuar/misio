import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export enum CampaignStatus {
  DRAFT = 'draft',
  SENT = 'sent',
  FINISHED = 'finished',
}

export interface ICampaignTarget {
  audienceType?: 'all' | 'inactive' | 'new';
  monthsInactive?: number;
  country?: string;
}

@Schema({ timestamps: true, collection: 'campaigns' })
export class Campaign {
  @Prop({ required: true, trim: true })
  title: string;

  @Prop({ required: true, trim: true })
  message: string;

  @Prop({ type: Object, default: {} })
  target: ICampaignTarget;

  @Prop({ type: Object, default: null })
  promo: {
    code: string;
    type: string;
    value: number;
    terms: string;
    expiresAt: Date;
  } | null;

  @Prop({ type: String, enum: CampaignStatus, default: CampaignStatus.DRAFT })
  status: CampaignStatus;

  @Prop({ default: 0 })
  sentCount: number;

  @Prop({ type: Date, default: null })
  sentAt: Date | null;

  @Prop({ type: Types.ObjectId, ref: 'User' })
  createdBy: Types.ObjectId;
}

export type CampaignDocument = HydratedDocument<Campaign>;
export const CampaignSchema = SchemaFactory.createForClass(Campaign);
