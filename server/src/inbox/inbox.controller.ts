import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { InboxService } from './inbox.service';
import { JwtAuthGuard, RolesGuard } from '../auth/guards/auth.guards';
import { AuthUser, CurrentUser, Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../users/user.schema';
import { SendAdminMessageDto } from './dto/inbox.dto';

@UseGuards(JwtAuthGuard)
@Controller('inbox')
export class InboxController {
  constructor(private readonly inbox: InboxService) {}

  @Get('test-server')
  testServer() {
    return { ok: true, message: 'Server is running the latest code!' };
  }

  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  @Post('admin-send')
  async sendAdminMessage(@Body() body: SendAdminMessageDto) {
    await this.inbox.send({
      userId: body.userId,
      subject: body.subject,
      body: body.message,
      kind: 'info',
    });
    return { success: true };
  }

  /** GET /api/v1/inbox — mi bandeja de correo interno. */
  @Get()
  mine(@CurrentUser() user: AuthUser) {
    return this.inbox.findMine(user.userId);
  }

  /** GET /api/v1/inbox/unread — cuántos sin leer. */
  @Get('unread')
  async unread(@CurrentUser() user: AuthUser) {
    return { count: await this.inbox.unreadCount(user.userId) };
  }

  /** PATCH /api/v1/inbox/:id/read */
  @Patch(':id/read')
  read(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.inbox.markRead(user.userId, id);
  }

  /** PATCH /api/v1/inbox/read-all */
  @Patch('read-all')
  readAll(@CurrentUser() user: AuthUser) {
    return this.inbox.markAllRead(user.userId);
  }
}
