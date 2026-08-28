import { BadRequestException, Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { AuthService } from './auth.service';
import { LoginDto, RegisterDto, VerifyEmailDto } from './dto/auth.dto';
import { JwtAuthGuard } from './guards/auth.guards';
import { AuthUser, CurrentUser } from './decorators/roles.decorator';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  /** POST /api/v1/auth/register — crea cuenta y devuelve token. */
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('register')
  register(@Body() dto: RegisterDto) {
    if (dto.password) {
      dto.password = Buffer.from(dto.password, 'base64').toString('utf8');
    }
    return this.authService.register(dto);
  }

  /** POST /api/v1/auth/verify-email — { dni, code } → sesión. */
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('verify-email')
  verifyEmail(@Body() dto: VerifyEmailDto) {
    return this.authService.verifyEmail(dto.dni, dto.code);
  }

  /** POST /api/v1/auth/resend-code — { dni } */
  @Throttle({ default: { limit: 3, ttl: 60_000 } })
  @Post('resend-code')
  resendCode(@Body('dni') dni: string) {
    return this.authService.resendCode(dni ?? '');
  }

  /** POST /api/v1/auth/login — DNI + contraseña → token. */
  // 8 intentos por minuto por IP: mata el diccionario de contraseñas sin
  // molestar a quien simplemente se equivocó de tecla.
  @Throttle({ default: { limit: 8, ttl: 60_000 } })
  @Post('login')
  login(@Body() dto: LoginDto) {
    if (dto.password) {
      dto.password = Buffer.from(dto.password, 'base64').toString('utf8');
    }
    return this.authService.login(dto);
  }

  /** GET /api/v1/auth/me — valida el token y devuelve la identidad. */
  @UseGuards(JwtAuthGuard)
  @Get('me')
  me(@CurrentUser() user: AuthUser) {
    return user;
  }

  /**
   * POST /auth/refresh — renueva el access token con el refresh token.
   * El refresh se rota: cada uso invalida el anterior (protección contra
   * robo de tokens).
   */
  @Post('refresh')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  refresh(@Body('refreshToken') refreshToken: string) {
    if (!refreshToken) throw new BadRequestException('refreshToken requerido');
    return this.authService.refresh(refreshToken);
  }

  /**
   * POST /auth/logout — revoca el refresh token. El access viejo expira
   * solo en 2h, pero ya no se puede renovar.
   */
  @UseGuards(JwtAuthGuard)
  @Post('logout')
  async logout(@CurrentUser() user: AuthUser) {
    await this.authService.logout(user.userId);
    return { ok: true };
  }

  // ═══ Recuperación y cambio de contraseña ═══

  /** POST /auth/forgot-password — envía el correo con el enlace de reset. */
  @Post('forgot-password')
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  forgotPassword(@Body('dni') dni: string) {
    if (!dni) throw new BadRequestException('Ingresa tu DNI');
    return this.authService.forgotPassword(dni);
  }

  /** POST /auth/reset-password — aplica la nueva clave con el token. */
  @Post('reset-password')
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  resetPassword(@Body('token') token: string, @Body('password') password: string) {
    if (!token) throw new BadRequestException('Enlace inválido');
    return this.authService.resetPassword(token, password);
  }

  /** POST /auth/change-password — cambio desde adentro (incluye forzado). */
  @UseGuards(JwtAuthGuard)
  @Post('change-password')
  changePassword(
    @CurrentUser() user: AuthUser,
    @Body('currentPassword') currentPassword: string,
    @Body('newPassword') newPassword: string,
    @Body('force') force?: boolean,
  ) {
    return this.authService.changePassword(user.userId, currentPassword, newPassword, !!force);
  }

  // ═════════════ 2FA (TOTP) ═════════════

  /** Paso 1: genera el secreto y devuelve el QR para escanear. */
  @UseGuards(JwtAuthGuard)
  @Post('setup-2fa')
  setup2FA(@CurrentUser() user: AuthUser) {
    return this.authService.setup2FA(user.userId);
  }

  /** Paso 2: confirma con el primer código → activa el 2FA. */
  @UseGuards(JwtAuthGuard)
  @Post('confirm-2fa')
  confirm2FA(@CurrentUser() user: AuthUser, @Body('code') code: string) {
    return this.authService.confirm2FA(user.userId, code);
  }

  /** Desactiva el 2FA (requiere el código actual). */
  @UseGuards(JwtAuthGuard)
  @Post('disable-2fa')
  disable2FA(@CurrentUser() user: AuthUser, @Body('code') code: string) {
    return this.authService.disable2FA(user.userId, code);
  }

  /** Login paso 2: el usuario manda su código TOTP tras el login normal. */
  @Post('verify-2fa')
  @Throttle({ default: { limit: 8, ttl: 60_000 } })
  verify2FA(@Body('dni') dni: string, @Body('code') code: string) {
    return this.authService.verify2FA(dni, code);
  }
}
