import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { CashRegister, CashRegisterDocument, CashRegisterStatus, CashShift, CashShiftDocument, ShiftStatus, CashMovement, CashMovementDocument, CashMovementType } from './cash.schema';
import { Transaction, TransactionDocument, TransactionType, TransactionStatus } from '../transactions/transaction.schema';

@Injectable()
export class CashService {
  constructor(
    @InjectModel(CashRegister.name) private registerModel: Model<CashRegisterDocument>,
    @InjectModel(CashShift.name) private shiftModel: Model<CashShiftDocument>,
    @InjectModel(CashMovement.name) private movementModel: Model<CashMovementDocument>,
    @InjectModel(Transaction.name) private txModel: Model<TransactionDocument>,
  ) {}

  async getRegisters() {
    return this.registerModel.find().populate('currentShiftId');
  }

  async getShiftsHistory(limit: number = 50) {
    return this.shiftModel.find({ status: ShiftStatus.CLOSED })
      .sort({ closedAt: -1 })
      .limit(limit)
      .populate('registerId', 'name')
      .populate('openedBy', 'name email');
  }

  async createRegister(name: string) {
    return this.registerModel.create({ name });
  }

  async openShift(registerId: string, userId: string, openingBalance: number) {
    const register = await this.registerModel.findById(registerId);
    if (!register) throw new NotFoundException('Caja no encontrada');
    if (register.status === CashRegisterStatus.OPEN) {
      throw new BadRequestException('La caja ya está abierta.');
    }

    // Check if the user already has another open shift in ANY register
    const activeShift = await this.shiftModel.findOne({ openedBy: userId, status: ShiftStatus.OPEN });
    if (activeShift) {
      throw new BadRequestException('Ya tienes un turno abierto en otra caja.');
    }

    const shift = await this.shiftModel.create({
      registerId,
      openedBy: userId,
      openingBalance,
      status: ShiftStatus.OPEN,
    });

    register.status = CashRegisterStatus.OPEN;
    register.currentShiftId = shift._id;
    await register.save();

    return shift;
  }

  async getActiveShift(userId: string) {
    return this.shiftModel.findOne({ openedBy: userId, status: ShiftStatus.OPEN }).populate('registerId');
  }

  async getShiftDetails(shiftId: string) {
    const shift = await this.shiftModel.findById(shiftId).populate('registerId').populate('openedBy', 'name email');
    if (!shift) throw new NotFoundException('Turno no encontrado');

    const movements = await this.movementModel.find({ shiftId: shift._id }).sort({ createdAt: -1 });
    const deposits = await this.txModel.find({ shiftId: shift._id, status: TransactionStatus.COMPLETED }).sort({ createdAt: -1 });

    let calculatedExpected = shift.openingBalance;
    for (const mov of movements) {
      if (mov.type === CashMovementType.INCOME) calculatedExpected += mov.amount;
      else calculatedExpected -= mov.amount;
    }
    for (const dep of deposits) {
      calculatedExpected += dep.amount;
    }

    return {
      shift,
      movements,
      deposits,
      calculatedExpected,
    };
  }

  async addMovement(userId: string, type: CashMovementType, amount: number, description: string, opts?: { session?: any }) {
    const shift = await this.getActiveShift(userId);
    if (!shift) throw new BadRequestException('No tienes un turno abierto para registrar movimientos.');

    const [mov] = await this.movementModel.create([{
      shiftId: shift._id,
      type,
      amount: Math.abs(amount),
      description,
      registeredBy: userId,
    }], { session: opts?.session });

    return mov;
  }

  async closeShift(userId: string, closingBalance: number) {
    const shift = await this.getActiveShift(userId);
    if (!shift) throw new BadRequestException('No tienes un turno abierto para cerrar.');

    const { calculatedExpected } = await this.getShiftDetails(shift.id);

    shift.closingBalance = closingBalance;
    shift.expectedBalance = calculatedExpected;
    shift.discrepancy = closingBalance - calculatedExpected;
    shift.status = ShiftStatus.CLOSED;
    shift.closedBy = new Types.ObjectId(userId);
    shift.closedAt = new Date();
    await shift.save();

    await this.registerModel.updateOne(
      { _id: shift.registerId },
      { status: CashRegisterStatus.CLOSED, currentShiftId: null }
    );

    return shift;
  }
}
