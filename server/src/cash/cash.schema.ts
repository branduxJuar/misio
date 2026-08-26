import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export enum CashRegisterStatus {
  OPEN = 'OPEN',
  CLOSED = 'CLOSED',
}

/** 
 * Represents a physical or digital Cash Register (e.g., "Yape Juan", "Caja Fuerte").
 */
@Schema({ timestamps: true })
export class CashRegister {
  @Prop({ required: true })
  name: string;

  @Prop({ default: CashRegisterStatus.CLOSED, enum: CashRegisterStatus })
  status: CashRegisterStatus;

  // Si está abierta, a qué turno pertenece
  @Prop({ type: Types.ObjectId, ref: 'CashShift', default: null })
  currentShiftId: Types.ObjectId | null;
}
export type CashRegisterDocument = CashRegister & Document;
export const CashRegisterSchema = SchemaFactory.createForClass(CashRegister);

export enum ShiftStatus {
  OPEN = 'OPEN',
  CLOSED = 'CLOSED',
}

/** 
 * Represents a working shift of a Cash Register.
 */
@Schema({ timestamps: true })
export class CashShift {
  @Prop({ type: Types.ObjectId, ref: 'CashRegister', required: true })
  registerId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  openedBy: Types.ObjectId;

  @Prop({ default: Date.now })
  openedAt: Date;

  @Prop({ type: Types.ObjectId, ref: 'User' })
  closedBy?: Types.ObjectId;

  @Prop()
  closedAt?: Date;

  @Prop({ required: true, default: 0 })
  openingBalance: number;

  @Prop()
  closingBalance?: number;

  @Prop()
  expectedBalance?: number;

  @Prop()
  discrepancy?: number; // closingBalance - expectedBalance

  @Prop({ default: ShiftStatus.OPEN, enum: ShiftStatus })
  status: ShiftStatus;
}
export type CashShiftDocument = CashShift & Document;
export const CashShiftSchema = SchemaFactory.createForClass(CashShift);

export enum CashMovementType {
  EXPENSE = 'EXPENSE',    // Gasto (ej: publicidad)
  INCOME = 'INCOME',      // Ingreso manual
  WITHDRAWAL = 'WITHDRAWAL', // Retiro de utilidades
}

/**
 * Manual cash movements (expenses, manual income) attached to a shift.
 * (Note: Regular deposits/ticket sales use the existing Transaction model).
 */
@Schema({ timestamps: true })
export class CashMovement {
  @Prop({ type: Types.ObjectId, ref: 'CashShift', required: true })
  shiftId: Types.ObjectId;

  @Prop({ required: true, enum: CashMovementType })
  type: CashMovementType;

  @Prop({ required: true })
  amount: number;

  @Prop({ required: true })
  description: string;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  registeredBy: Types.ObjectId;
}
export type CashMovementDocument = CashMovement & Document;
export const CashMovementSchema = SchemaFactory.createForClass(CashMovement);
