import { Modal } from 'antd';

/**
 * Cliente HTTP mínimo de Misio.
 * - Inyecta el JWT en cada request si existe sesión.
 * - Lanza un Error con el mensaje del backend (los DTOs de NestJS
 *   devuelven mensajes en español listos para mostrar en la UI).
 */
const BASE_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3000/api/v1';

const TOKEN_KEY = 'misio_token';
const REFRESH_KEY = 'misio_refresh';

export const tokenStore = {
  get: () => localStorage.getItem(TOKEN_KEY),
  set: (token) => localStorage.setItem(TOKEN_KEY, token),
  getRefresh: () => localStorage.getItem(REFRESH_KEY),
  setRefresh: (token) => localStorage.setItem(REFRESH_KEY, token),
  clear: () => { localStorage.removeItem(TOKEN_KEY); localStorage.removeItem(REFRESH_KEY); },
};

/**
 * RENOVACIÓN SILENCIOSA: si un request falla con 401, intenta renovar
 * el access token con el refresh token y reintenta UNA vez. El usuario
 * no nota nada: la app no cierra su sesión a mitad de uso.
 *
 * Si el refresh también falla (token robado y rotado, sesión cerrada
 * desde otro dispositivo), ahí sí se limpia todo y se manda al login.
 */
let refreshPromise = null; // Evita n renovaciones simultáneas

async function tryRefresh() {
  const rt = tokenStore.getRefresh();
  if (!rt) return false;
  if (refreshPromise) return refreshPromise;
  refreshPromise = (async () => {
    try {
      const res = await fetch(`${BASE_URL}/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken: rt }),
      });
      if (!res.ok) return false;
      const data = await res.json();
      tokenStore.set(data.accessToken);
      tokenStore.setRefresh(data.refreshToken);
      return true;
    } catch { return false; }
    finally { refreshPromise = null; }
  })();
  return refreshPromise;
}

export async function api(path, { method = 'GET', body } = {}) {
  const token = tokenStore.get();

  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  const data = await res.json().catch(() => ({}));

  if (res.status === 503 && data.maintenance) {
    window.dispatchEvent(new CustomEvent('misio:maintenance', { detail: data }));
  }

  // Manejo de 401 (No autorizado / Expirado / Expulsado / Baneado)
  if (res.status === 401) {
    if (tokenStore.getRefresh()) {
      const renewed = await tryRefresh();
      if (renewed) return api(path, { method, body }); // reintenta con el token nuevo
    }
    
    // Si llegamos aquí, falló la renovación o no había refresh token
    tokenStore.clear();
    
    // Mostrar el motivo exacto por el cual fue desconectado (baneo, expulsión, expiración)
    const msg = Array.isArray(data.message) ? data.message[0] : (data.message || 'Tu sesión ha terminado.');
    
    // Evitamos mostrar múltiples modales si hay requests concurrentes
    if (!window.__misioSessionAlertShown) {
      window.__misioSessionAlertShown = true;
      Modal.warning({
        title: 'Sesión Terminada',
        content: msg,
        okText: 'Ir a Iniciar Sesión',
        onOk: () => {
          window.location.href = '/login';
        },
      });
    }
    
    throw new Error(msg);
  }

  if (!res.ok) {
    const msg = Array.isArray(data.message) ? data.message[0] : data.message;
    throw new Error(msg ?? `Error ${res.status}`);
  }
  return data;
}

/**
 * Subida de archivos (multipart/form-data) con el campo "file" que
 * esperan los endpoints /logistics/:id/receipt y /logistics/:id/evidence.
 * OJO: sin header Content-Type manual — el browser pone el boundary solo.
 */
export async function apiUpload(path, file) {
  const token = tokenStore.get();
  const form = new FormData();
  form.append('file', file);

  const res = await fetch(`${BASE_URL}${path}`, {
    method: 'POST',
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: form,
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = Array.isArray(data.message) ? data.message[0] : data.message;
    throw new Error(msg ?? `Error ${res.status}`);
  }
  return data;
}

/** Base del server (sin /api/v1) para abrir archivos subidos (/uploads/...). */
export const SERVER_URL = BASE_URL.replace(/\/api\/v1\/?$/, '');
