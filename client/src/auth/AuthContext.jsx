import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { api, tokenStore } from './api';
import { message } from 'antd';

/**
 * Contexto de sesión de Misio.
 * Expone: user (null si no hay sesión), loading (restaurando sesión),
 * y las acciones login / register / logout.
 *
 * Persistencia: el token vive en localStorage; al recargar la página,
 * GET /auth/me valida el token y restaura la identidad.
 */
const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  // Restaurar sesión al montar la app
  useEffect(() => {
    const restore = async () => {
      if (!tokenStore.get()) return setLoading(false);
      try {
        // /auth/me devuelve la identidad del token; /users/me trae el saldo
        const profile = await api('/users/me');
        setUser(profile);
      } catch {
        tokenStore.clear(); // Token vencido o inválido
      } finally {
        setLoading(false);
      }
    };
    restore();
  }, []);

  const handleAuth = (res) => {
    if (res?.requiresVerification) return res;
    tokenStore.set(res.accessToken);
    if (res.refreshToken) tokenStore.setRefresh(res.refreshToken);
    setUser(res.user);
    sessionStorage.removeItem('misio_seen_always_show');
    return res;
  };

  /** Refresca los datos (saldo) tras compras/canjes. */
  const refreshUser = async () => {
    try {
      if (tokenStore.get()) setUser(await api('/users/me'));
    } catch { /* sesión inválida */ }
  };

  // FIX (bug reportado): el saldo quedaba viejo hasta recargar TODA la
  // página. Ahora se refresca al volver el foco a la pestaña y cada 45s.
  useEffect(() => {
    const onFocus = () => refreshUser();
    window.addEventListener('focus', onFocus);
    const interval = setInterval(onFocus, 45000);
    return () => { window.removeEventListener('focus', onFocus); clearInterval(interval); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Cierre de sesión por inactividad (1 hora), sincronizado entre pestañas
  useEffect(() => {
    if (!user) return; // Solo si hay sesión iniciada

    const IDLE_TIMEOUT = 3600000; // 1 hora
    
    const updateActivity = () => {
      const now = Date.now();
      const lastAct = parseInt(localStorage.getItem('z_lastActivity') || '0', 10);
      // Actualizar a lo sumo cada 10s para no ahogar el navegador
      if (now - lastAct > 10000) {
        localStorage.setItem('z_lastActivity', now.toString());
      }
    };

    localStorage.setItem('z_lastActivity', Date.now().toString());

    const events = ['mousemove', 'keydown', 'mousedown', 'scroll', 'touchstart'];
    events.forEach(e => window.addEventListener(e, updateActivity, { passive: true }));

    const checkIdle = setInterval(() => {
      const lastAct = parseInt(localStorage.getItem('z_lastActivity') || '0', 10);
      if (Date.now() - lastAct > IDLE_TIMEOUT) {
        message.warning('Tu sesión ha expirado por inactividad.');
        api('/auth/logout', { method: 'POST' }).catch(() => {});
        tokenStore.clear();
        setUser(null);
      }
    }, 30000); // Comprobar cada 30 segundos

    return () => {
      events.forEach(e => window.removeEventListener(e, updateActivity));
      clearInterval(checkIdle);
    };
  }, [user]);

  const value = useMemo(
    () => ({
      user,
      loading,
      isAdmin: user?.role === 'admin',

      login: async (identifier, password) =>
        handleAuth(await api('/auth/login', { method: 'POST', body: { identifier, password } })),

      refreshUser,
      verifyEmail: async (dni, code) =>
        handleAuth(await api('/auth/verify-email', { method: 'POST', body: { dni, code } })),
      register: async (form) =>
        handleAuth(await api('/auth/register', { method: 'POST', body: form })),

      logout: () => {
        // Revocar el refresh en el servidor (el access expira solo en 2h)
        api('/auth/logout', { method: 'POST' }).catch(() => {});
        tokenStore.clear();
        setUser(null);
        sessionStorage.removeItem('misio_seen_always_show');
      },
    }),
    [user, loading],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

/** Hook de consumo: const { user, login, logout } = useAuth(); */
// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth debe usarse dentro de <AuthProvider>');
  return ctx;
}
