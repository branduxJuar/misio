import {
  BadRequestException, Body, Controller, Get, Param, Patch, Post, Query,
  UploadedFile, UseGuards, UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { evidenceUploadOptions } from '../logistics/upload.config';
import { UsersService } from './users.service';
import { JwtAuthGuard } from '../auth/guards/auth.guards';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { AuthUser, CurrentUser, RequirePerm } from '../auth/decorators/roles.decorator';
import { UserRole } from './user.schema';
import { CreateUserDto, SetBalancesDto, SetBanDto, SetPermissionsDto, UpdateAutocontrolDto, UpdateProfileDto, SetPosPinDto } from './dto/users.dto';

/**
 * El registro de usuarios ya NO vive aquí: pasó a POST /auth/register
 * (con hash de contraseña). Este controlador solo expone lecturas.
 */
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  /** GET /api/v1/users — listado completo, SOLO Super Admin. */
  @RequirePerm('usuarios')
  @Get()
  findAll(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('search') search?: string,
  ) {
    return this.usersService.findAll({
      page: Number(page) || 1,
      limit: Number(limit) || 25,
      search,
    });
  }

  /** GET /api/v1/users/active — listado de usuarios en sesión (últimos 5 mins). SOLO Admin. */
  @RequirePerm('usuarios')
  @Get('active')
  findActive(): Promise<any[]> {
    return this.usersService.getActiveUsers(5); // 5 minutos de ventana
  }

  /** GET /api/v1/users/me — perfil + saldo del usuario autenticado. */
  @Get('me')
  findMe(@CurrentUser() user: AuthUser) {
    return this.usersService.getProfile(user.userId);
  }

  /** POST /api/v1/users/:id/verify-email — Verifica manualmente el correo (SOLO Admin) */
  @RequirePerm('usuarios')
  @Post(':id/verify-email')
  verifyEmail(@Param('id') id: string) {
    return this.usersService.manualVerifyEmail(id);
  }

  /** POST /api/v1/users — crear usuario con rol (delegación). SOLO admin. */
  @RequirePerm('usuarios')
  @Post()
  create(@Body() body: CreateUserDto) {
    if (!/^\d{8}$/.test(body.dni ?? '')) throw new BadRequestException('DNI: 8 dígitos');
    if ((body.password ?? '').length < 6) throw new BadRequestException('Contraseña: mínimo 6 caracteres');
    if ((body.name ?? '').trim().length < 3) throw new BadRequestException('Nombre: mínimo 3 caracteres');
    const role = body.role || UserRole.USER;
    return this.usersService.createWithRole({ ...body, name: body.name.trim(), role: role as UserRole });
  }

  /** PATCH /api/v1/users/me — el usuario completa su perfil. */
  @Patch('me')
  updateMe(
    @CurrentUser() user: AuthUser,
    @Body() body: UpdateProfileDto,
  ) {
    return this.usersService.updateProfile(user.userId, body);
  }

  /** PATCH /api/v1/users/me/pos-pin — Configura el PIN para anular en POS (solo Admins/Ops). */
  @Patch('me/pos-pin')
  updatePosPin(
    @CurrentUser() user: AuthUser,
    @Body() body: SetPosPinDto,
  ) {
    return this.usersService.setPosPin(user.userId, body.pin);
  }

  /** PATCH /api/v1/users/me/autocontrol — configurar o solicitar desactivar límites. */
  @Patch('me/autocontrol')
  updateAutocontrol(
    @CurrentUser() user: AuthUser,
    @Body() body: UpdateAutocontrolDto,
  ) {
    return this.usersService.setAutocontrol(user.userId, body);
  }

  /** POST /api/v1/users/me/avatar — foto de perfil. */
  @Post('me/avatar')
  @UseInterceptors(FileInterceptor('file', evidenceUploadOptions))
  setAvatar(@CurrentUser() user: AuthUser, @UploadedFile() file: Express.Multer.File) {
    if (!file) throw new BadRequestException('Falta la imagen (campo "file")');
    return this.usersService.setAvatar(user.userId, `/uploads/${file.filename}`);
  }



  /** PATCH /api/v1/users/:id/permissions — { permissions: string[] } */
  @RequirePerm('usuarios')
  @Patch(':id/permissions')
  setPermissions(@Param('id') id: string, @Body() body: SetPermissionsDto) {
    return this.usersService.setPermissions(id, body.permissions);
  }

  /** PATCH /api/v1/users/:id — { name, dni, email, phone } */
  @RequirePerm('usuarios')
  @Patch(':id')
  updateUserAdmin(@Param('id') id: string, @Body() body: any) {
    return this.usersService.updateUserAdmin(id, body);
  }

  /** POST /api/v1/users/:id/kick — Expulsar al usuario del sistema */
  @RequirePerm('usuarios')
  @Post(':id/kick')
  kickUser(@Param('id') id: string) {
    return this.usersService.kick(id);
  }

  /** PATCH /api/v1/users/:id/ban — { banned, reason } — SOLO admin. */
  @RequirePerm('usuarios')
  @Patch(':id/ban')
  setBan(
    @Param('id') id: string,
    @Body() body: SetBanDto,
  ) {
    return this.usersService.setBan(id, !!body.banned, body.reason ?? '');
  }

  /**
   * POST /api/v1/users/:id/reset-password — SOLO admin.
   * Genera una clave TEMPORAL para el usuario. Al entrar, el sistema le
   * pedirá cambiarla. Devuelve la clave para que el admin se la comunique.
   */
  @RequirePerm('usuarios')
  @Post(':id/reset-password')
  resetUserPassword(@Param('id') id: string) {
    return this.usersService.adminResetPassword(id);
  }

  /**
   * PATCH /api/v1/users/:id/balances — EDICIÓN MANUAL DE SALDOS.
   * Herramienta súper privilegiada (SOLO ADMIN) para corregir saldos en caso de fallos.
   */
  @RequirePerm('usuarios')
  @Patch(':id/balances')
  setBalances(
    @Param('id') id: string,
    @Body() body: SetBalancesDto
  ) {
    return this.usersService.setBalances(id, body);
  }

  /** GET /api/v1/users/:id — perfil arbitrario, SOLO admin. */
  @RequirePerm('usuarios')
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.usersService.findOne(id);
  }
}
