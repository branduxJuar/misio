import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Ticket, TicketDocument } from '../tickets/ticket.schema';

@Injectable()
export class ParticipantProofGuard implements CanActivate {
  constructor(@InjectModel(Ticket.name) private readonly tickets: Model<TicketDocument>) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const user = context.switchToHttp().getRequest().user;
    if (!user) throw new ForbiddenException('No autenticado');
    if (user.role === 'admin' || user.role === 'superadmin') return true;

    if (!await this.tickets.exists({ userId: user.userId })) {
      throw new ForbiddenException('Esta acta está disponible para usuarios que ya participaron en algún sorteo de Misio.');
    }
    return true;
  }
}
