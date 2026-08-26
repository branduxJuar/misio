import { createParamDecorator, ExecutionContext, SetMetadata } from '@nestjs/common';
import { UserRole } from '../../users/user.schema';

export const ROLES_KEY = 'roles';
export const PERMS_KEY = 'perms';
export const IS_PUBLIC_KEY = 'isPublic';

/** Omite la autenticación JwtAuthGuard para esta ruta. */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

/** Exige permiso de módulo: @RequirePerm('contabilidad'). */
export const RequirePerm = (...perms: string[]) => SetMetadata(PERMS_KEY, perms);

/** Declara qué roles pueden acceder a un endpoint: @Roles(UserRole.ADMIN). */
export const Roles = (...roles: UserRole[]) => SetMetadata(ROLES_KEY, roles);

/** Usuario autenticado desde el JWT (payload validado por JwtStrategy). */
export interface AuthUser {
  userId: string;
  name: string;
  role: UserRole;
}

/**
 * Inyecta el usuario autenticado en el handler:
 *   findMine(@CurrentUser() user: AuthUser) { ... }
 * Evita que un cliente malicioso pase el userId de OTRO usuario en el body.
 */
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthUser =>
    ctx.switchToHttp().getRequest().user,
);
