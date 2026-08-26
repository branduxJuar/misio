import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { User, UserDocument, UserRole } from '../users/user.schema';

/** Forma del payload firmado dentro del JWT. */
export interface JwtPayload {
  sub: string; // userId (Mongo _id)
  name: string;
  role: UserRole;
  iat?: number;
}

/**
 * Estrategia JWT: extrae el token del header `Authorization: Bearer <token>`
 * y, si la firma es válida, adjunta el payload como `request.user`.
 */
@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    config: ConfigService,
    @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.get<string>('JWT_SECRET')!,
    });
  }

  /**
   * Lo que retorna aquí se convierte en request.user.
   * Consulta el flag banned en CADA request (lectura indexada por _id):
   * banear a alguien lo saca del sistema al instante, sin esperar a que
   * venza su token de 7 días.
   */
  async validate(payload: JwtPayload) {
    const user = await this.userModel.findById(payload.sub).select('banned banReason forceLogoutAt').lean();
    if (!user) throw new UnauthorizedException('Cuenta no encontrada');
    if (user.banned) {
      throw new UnauthorizedException(
        `Tu cuenta fue suspendida${user.banReason ? `: ${user.banReason}` : ''}.`,
      );
    }
    // Si el administrador forzó el cierre de sesión y este token es anterior
    if (user.forceLogoutAt && payload.iat && (payload.iat * 1000) < user.forceLogoutAt.getTime()) {
      throw new UnauthorizedException('Sesión expirada o cerrada por el administrador.');
    }
    return { userId: payload.sub, name: payload.name, role: payload.role };
  }
}
