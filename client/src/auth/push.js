/** 🔔 Suscripción a Web Push. Falla silenciosamente si no hay soporte. */
import { api } from './api';

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = window.atob(base64);
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}

export async function isPushSupported() {
  return 'serviceWorker' in navigator && 'PushManager' in window;
}

export async function subscribeToPush() {
  if (!(await isPushSupported())) return false;
  try {
    const { publicKey, enabled } = await api('/notifications/vapid-key');
    if (!enabled || !publicKey) return false;
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') return false;
    const reg = await navigator.serviceWorker.ready;
    const subscription = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicKey),
    });
    await api('/notifications/subscribe', { method: 'POST', body: { subscription } });
    return true;
  } catch { return false; }
}

export async function unsubscribeFromPush() {
  if (!(await isPushSupported())) return;
  try {
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    if (sub) {
      await api('/notifications/unsubscribe', { method: 'POST', body: { endpoint: sub.endpoint } });
      await sub.unsubscribe();
    }
  } catch { /* silencioso */ }
}
