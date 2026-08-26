import { Body, Controller, Get, Patch, Post, UseGuards } from '@nestjs/common';
import { NotificationsService } from './notifications.service';
import { PushService } from './push.service';
import { JwtAuthGuard, RolesGuard } from '../auth/guards/auth.guards';
import { AuthUser, CurrentUser, Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../users/user.schema';

@UseGuards(JwtAuthGuard)
@Controller('notifications')
export class NotificationsController {
  constructor(
    private readonly notifService: NotificationsService,
    private readonly pushService: PushService,
  ) {}

  @Get('mine')
  findMine(@CurrentUser() user: AuthUser) {
    return this.notifService.findByUser(user.userId);
  }

  @Patch('read-all')
  readAll(@CurrentUser() user: AuthUser) {
    return this.notifService.markAllRead(user.userId);
  }

  // ═══ Web Push ═══

  @Get('vapid-key')
  vapidKey() {
    return this.pushService.getPublicKey();
  }

  @Post('subscribe')
  subscribe(@CurrentUser() user: AuthUser, @Body('subscription') subscription: any) {
    return this.pushService.subscribe(user.userId, subscription);
  }

  @Post('unsubscribe')
  unsubscribe(@CurrentUser() user: AuthUser, @Body('endpoint') endpoint: string) {
    return this.pushService.unsubscribe(user.userId, endpoint);
  }
}
