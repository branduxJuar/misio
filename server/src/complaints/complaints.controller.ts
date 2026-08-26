import {
  BadRequestException, Body, Controller, Get, Param, Patch, Post,
  Req, UseGuards,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  Complaint, ComplaintDocument, ComplaintKind, ComplaintStatus,
} from './complaint.schema';
import { CreateComplaintDto, RespondComplaintDto } from './dto/complaint.dto';
import { Counter } from '../common/counter.schema';
import { JwtAuthGuard, RolesGuard } from '../auth/guards/auth.guards';
import { AuthUser, CurrentUser, Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../users/user.schema';
import { NotificationsService } from '../notifications/notifications.service';
import { NotificationType } from '../notifications/notification.schema';

@Controller('complaints')
export class ComplaintsController {
  constructor(
    @InjectModel(Complaint.name) private complaintModel: Model<ComplaintDocument>,
    @InjectModel(Counter.name) private counterModel: Model<Counter>,
    private readonly notifService: NotificationsService,
  ) {}

  /**
   * POST /api/v1/complaints — PÚBLICO (la ley exige que cualquiera pueda
   * reclamar, con o sin cuenta). Devuelve el folio LR-XXXXXX.
   */
  @Post()
  async create(@Body() dto: CreateComplaintDto, @Req() req: any) {
    const { fullName, dni, email, phone, kind, orderRef, detail } = dto;

    // FOLIO ATÓMICO. Antes: `countDocuments() + 1` — dos personas
    // reclamando en el mismo segundo obtenían el MISMO folio, y en un
    // libro de reclamaciones eso es un problema legal, no un detalle.
    // Ahora un contador que Mongo incrementa de forma atómica: cada
    // llamada recibe un número distinto aunque lleguen mil a la vez.
    const seq = await this.counterModel.findOneAndUpdate(
      { _id: 'complaints' },
      { $inc: { seq: 1 } },
      { new: true, upsert: true },
    );

    const complaint = await this.complaintModel.create({
      code: `LR-${String(seq.seq).padStart(6, '0')}`,
      userId: req.user?.userId ?? null,
      fullName: String(fullName).slice(0, 120),
      dni,
      email: String(email ?? '').slice(0, 120),
      phone: String(phone ?? '').slice(0, 20),
      kind,
      orderRef: String(orderRef ?? '').slice(0, 80),
      detail: String(detail).slice(0, 3000),
    });
    return {
      code: complaint.code,
      message: `Registrado con folio ${complaint.code}. Responderemos dentro del plazo legal (máx. 30 días calendario) al contacto indicado.`,
    };
  }

  /** GET /api/v1/complaints/mine — mis reclamos (por DNI del token). */
  @UseGuards(JwtAuthGuard)
  @Get('mine')
  async mine(@CurrentUser() user: AuthUser) {
    return this.complaintModel.find({ userId: user.userId }).sort({ createdAt: -1 }).lean();
  }

  // ── ADMIN ─────────────────────────────────────────────────────
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @Get()
  findAll() {
    return this.complaintModel.find().sort({ status: 1, createdAt: -1 }).lean();
  }

  /** PATCH /api/v1/complaints/:id/respond — { response } */
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @Patch(':id/respond')
  async respond(@Param('id') id: string, @Body() dto: RespondComplaintDto) {
    const response = dto.response;
    if (!response || response.trim().length < 10) {
      throw new BadRequestException('La respuesta debe tener al menos 10 caracteres');
    }
    const complaint = await this.complaintModel.findByIdAndUpdate(
      id,
      { response: response.trim(), status: ComplaintStatus.ANSWERED, respondedAt: new Date() },
      { new: true },
    );
    if (!complaint) throw new BadRequestException('Reclamo no existe');
    if (complaint.userId) {
      await this.notifService.notifyUser(
        complaint.userId.toString(),
        `📩 Tu ${complaint.kind} ${complaint.code} fue respondido: "${response.trim().slice(0, 140)}${response.length > 140 ? '…' : ''}"`,
        NotificationType.GENERAL,
      );
    }
    return complaint;
  }
}
