import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { CampaignsService } from './campaigns.service';
import { JwtAuthGuard } from '../auth/guards/auth.guards';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { AuthUser, CurrentUser, RequirePerm } from '../auth/decorators/roles.decorator';
import { CampaignTargetDto, CreateCampaignDto } from './dto/campaigns.dto';

@UseGuards(JwtAuthGuard, PermissionsGuard)
@RequirePerm('marketing')
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
