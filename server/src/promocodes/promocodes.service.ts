import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { ClientSession, Model, Types } from 'mongoose';
import { PromoCode, PromoCodeType } from './promocode.schema';
import { PromoCodeUsage } from './promocode-usage.schema';

@Injectable()
export class PromoCodesService {
  constructor(
    @InjectModel(PromoCode.name) private promoCodeModel: Model<PromoCode>,
    @InjectModel(PromoCodeUsage.name) private usageModel: Model<PromoCodeUsage>,
  ) {}

  async create(data: Partial<PromoCode> & { code: string }) {
    const existing = await this.promoCodeModel.findOne({ code: data.code.toUpperCase() });
    if (existing) {
      throw new BadRequestException(`El código ${data.code} ya existe.`);
    }
    const doc = new this.promoCodeModel({
      ...data,
      code: data.code.toUpperCase(),
    });
    return doc.save();
  }

  async findAll() {
    return this.promoCodeModel.find().sort({ createdAt: -1 });
  }

  async expireCode(code: string) {
    await this.promoCodeModel.findOneAndUpdate({ code: code.toUpperCase() }, { isActive: false });
  }

  /** Valida si un usuario puede usar un código para un propósito específico */
  async validate(code: string, userId: string, expectedType?: PromoCodeType) {
    if (!code) throw new BadRequestException('Código no proporcionado');
    const upperCode = code.toUpperCase();

    const promo = await this.promoCodeModel.findOne({ code: upperCode });
    if (!promo) {
      throw new NotFoundException('El código promocional no es válido o no existe.');
    }

    if (!promo.isActive) {
      throw new BadRequestException('El código promocional está inactivo.');
    }

    if (new Date() > new Date(promo.expiresAt)) {
      throw new BadRequestException('El código promocional ha expirado.');
    }

    if (expectedType && promo.type !== expectedType) {
      throw new BadRequestException('El código no es válido para este tipo de operación.');
    }

    // Verificar límite de usos por usuario
    const userUsages = await this.usageModel.countDocuments({ 
      promoCodeId: promo._id, 
      userId: new Types.ObjectId(userId) 
    });

    if (userUsages >= promo.maxUsesPerUser) {
      throw new BadRequestException('Ya has alcanzado el límite de usos para este código.');
    }

    return promo;
  }

  /** Aplica el código y registra su uso (debe llamarse DENTRO de una transacción o tras confirmarla) */
  async apply(code: string, userId: string, referenceId?: string | Types.ObjectId, session?: ClientSession) {
    const promo = await this.validate(code, userId);

    // Registrar el uso
    await this.usageModel.create([{
      userId: new Types.ObjectId(userId),
      promoCodeId: promo._id,
      code: promo.code,
      referenceId: referenceId ? new Types.ObjectId(referenceId) : null,
    }], { session });

    // Incrementar el uso global
    await this.promoCodeModel.findByIdAndUpdate(promo._id, { $inc: { totalUses: 1 } }, { session });

    return promo;
  }
}
