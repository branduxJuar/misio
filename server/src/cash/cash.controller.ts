import { Controller, Get, Post, Body, UseGuards, Request, Param } from '@nestjs/common';
import { CashService } from './cash.service';
import { JwtAuthGuard, RolesGuard } from '../auth/guards/auth.guards';
import { CurrentUser, AuthUser } from '../auth/decorators/roles.decorator';
import { CashMovementType } from './cash.schema';
import { CashMovementDto, CloseShiftDto, CreateRegisterDto, OpenShiftDto } from './dto/cash.dto';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('cash')
export class CashController {
  constructor(private cashService: CashService) {}

  @Get('registers')
  async getRegisters() {
    return this.cashService.getRegisters();
  }

  @Get('shifts-history')
  async getShiftsHistory() {
    return this.cashService.getShiftsHistory();
  }

  @Get('shifts/:id')
  async getShift(@Param('id') id: string) {
    return this.cashService.getShiftDetails(id);
  }

  @Post('registers')
  async createRegister(@Body() body: CreateRegisterDto) {
    return this.cashService.createRegister(body.name);
  }

  @Get('my-shift')
  async getMyShift(@CurrentUser() user: AuthUser) {
    const shift = await this.cashService.getActiveShift(user.userId);
    if (!shift) return null;
    return this.cashService.getShiftDetails(shift.id);
  }

  @Post('open-shift')
  async openShift(@CurrentUser() user: AuthUser, @Body() body: OpenShiftDto) {
    return this.cashService.openShift(body.registerId, user.userId, body.openingBalance);
  }

  @Post('close-shift')
  async closeShift(@CurrentUser() user: AuthUser, @Body() body: CloseShiftDto) {
    return this.cashService.closeShift(user.userId, body.closingBalance);
  }

  @Post('movement')
  async addMovement(@CurrentUser() user: AuthUser, @Body() body: CashMovementDto) {
    return this.cashService.addMovement(user.userId, body.type, body.amount, body.description);
  }
}
