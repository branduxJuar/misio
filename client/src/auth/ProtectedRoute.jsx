import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { Skeleton } from 'antd';
import { useAuth } from './AuthContext';
import { ADMIN_MENU } from '../views/AdminShell/AdminShell';

/** A dónde mandar a alguien que entró donde no debe: a su primer módulo. */
const firstAllowed = (user) => {
  if (user.role === 'admin') return '/admin';
  const perms = user.permissions ?? [];
  const item = ADMIN_MENU.flatMap((g) => g.items).find((i) => perms.includes(i.perm));
  return item?.key ?? '/';
};

/**
 * Protege una ruta:
 *   <ProtectedRoute>                    → exige sesión activa
 *   <ProtectedRoute adminOnly>          → exige rol admin
 *   <ProtectedRoute roles={['admin']}>  → exige uno de esos roles
 *   <ProtectedRoute perm="contabilidad">→ exige ese PERMISO de módulo
 *
 * Ojo: esto es solo la puerta visual. El servidor vuelve a comprobar el
 * permiso en cada endpoint (PermissionsGuard) — esconder un botón nunca
 * es seguridad.
 */
export default function ProtectedRoute({ children, adminOnly = false, roles = null, perm = null }) {
  const { user, loading, isAdmin } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 20, minHeight: '100vh', padding: 24, justifyContent: 'center' }}>
        <Skeleton.Input active block style={{ height: 60, borderRadius: 8 }} />
        <Skeleton active paragraph={{ rows: 6 }} />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" state={{ from: location.pathname }} replace />;
  }

  if (adminOnly && !isAdmin) {
    return <Navigate to="/" replace />;
  }

  // Control por PERMISO de módulo (el admin los tiene todos)
  if (perm && user.role !== 'admin' && !(user.permissions ?? []).includes(perm)) {
    return <Navigate to={firstAllowed(user)} replace />;
  }

  // Control por lista de roles (admin, operator…)
  if (roles && !roles.includes(user.role)) {
    return <Navigate to={firstAllowed(user)} replace />;
  }

  return children;
}
