import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { CampaignsService } from './campaigns.service';
import { JwtAuthGuard, RolesGuard } from '../auth/guards/auth.guards';
import { AuthUser, CurrentUser, Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../users/user.schema';
import { CampaignTargetDto, CreateCampaignDto } from './dto/campaigns.dto';

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
@Controller('campaigns')
export class CampaignsController {
  constructor(private readonly campaigns: CampaignsService) {}

  @Get()
  findAll() {
    return this.campaigns.findAll();
  }

  @Post()
  create(@CurrentUser() user: AuthUser, @Body() body: CreateCampaignDto) {
    return this.campaigns.create({
      title: body.title,
      message: body.message,
      target: body.target ?? {},
      promo: body.promo,
      createdBy: user.userId,
    });
  }

  @Post('audience')
  previewAudience(@Body() target: CampaignTargetDto) {
    return this.campaigns.getAudienceCount(target);
  }

  @Post(':id/send')
  send(@Param('id') id: string) {
    return this.campaigns.send(id);
  }

  @Patch(':id/finish')
  finish(@Param('id') id: string) {
    return this.campaigns.finish(id);
  }
}
