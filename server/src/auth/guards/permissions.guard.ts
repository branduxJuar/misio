import {
  CanActivate, ExecutionContext, ForbiddenException, Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { User, UserDocument, UserRole } from '../../users/user.schema';

export const PERMS_KEY = 'perms';

/**
 * Verifica que el usuario tenga el permiso del módulo EN LA BASE DE
 * DATOS (no en el token): si le quitas un permiso a alguien, deja de
 * funcionar al instante — no hay que esperar a que su token expire.
 */
@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    @InjectModel(User.name) private userModel: Model<UserDocument>,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const required = this.reflector.getAllAndOverride<string[]>(PERMS_KEY, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    if (!required?.length) return true;

    const req = ctx.switchToHttp().getRequest();
    if (!req.user?.userId) throw new ForbiddenException('Sesión inválida');

    const user = await this.userModel
      .findById(req.user.userId)
      .select('role permissions')
      .lean();
    if (!user) throw new ForbiddenException('Cuenta no encontrada');
    if (user.role === UserRole.ADMIN) return true; // El dueño ve todo

    const has = required.some((p) => user.permissions?.includes(p));
    if (!has) {
      throw new ForbiddenException(
        `No tienes permiso para el módulo "${required[0]}" — pídeselo al administrador`,
      );
    }
    return true;
  }
}
