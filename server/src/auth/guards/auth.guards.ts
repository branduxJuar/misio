import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY, ROLES_KEY } from '../decorators/roles.decorator';
import { UserRole } from '../../users/user.schema';

/**
 * Guard de autenticación: exige un JWT válido.
 * Uso: @UseGuards(JwtAuthGuard) a nivel de controlador o endpoint.
 */
@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(private reflector: Reflector) {
    super();
  }

  canActivate(context: ExecutionContext) {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;
    return super.canActivate(context);
  }
}

/**
 * Guard de autorización por rol. Se usa SIEMPRE junto a JwtAuthGuard
 * (necesita que request.user ya exista):
 *
 *   @UseGuards(JwtAuthGuard, RolesGuard)
 *   @Roles(UserRole.ADMIN)
 *
 * Si el endpoint no declara @Roles, deja pasar a cualquier autenticado.
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<UserRole[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!requiredRoles || requiredRoles.length === 0) return true;

    const { user } = context.switchToHttp().getRequest();
    if (!requiredRoles.includes(user?.role)) {
      throw new ForbiddenException('No tienes permisos para esta operación');
    }
    return true;
  }
}

/**
 * Guard OPCIONAL: si hay token válido inyecta request.user; si no hay o
 * es inválido, deja pasar como anónimo (req.user = undefined). Útil para
 * endpoints públicos que personalizan la respuesta si hay sesión.
 */
@Injectable()
export class OptionalJwtGuard extends JwtAuthGuard {
  handleRequest(err: any, user: any) {
    return user || undefined;
  }
}
