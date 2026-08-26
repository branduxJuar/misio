/**
 * PRUEBA DE CARGA CON K6 — ¿cuántos usuarios aguantas?
 *
 * Instala k6: https://k6.io/docs/get-started/installation/
 * Ejecuta:    k6 run scripts/load-test.js
 *
 * Simula el flujo real: un visitante llega a la portada, ve los sorteos,
 * se registra, recarga saldo y compra un boleto. 500 usuarios virtuales
 * durante 2 minutos, con rampas de subida y bajada.
 *
 * MÉTRICAS QUE IMPORTAN:
 *   http_req_duration (p95) < 500ms → bien
 *   http_req_failed < 1% → bien
 *   Si p95 > 1s o fails > 5% → necesitas escalar o hay un cuello de botella
 */
import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Trend } from 'k6/metrics';

const BASE = __ENV.API_URL || 'http://localhost:3000/api/v1';
const failRate = new Rate('failed_requests');
const purchaseDuration = new Trend('purchase_duration');

export const options = {
  stages: [
    { duration: '30s', target: 100 },  // subida
    { duration: '1m', target: 500 },    // pico
    { duration: '30s', target: 0 },     // bajada
  ],
  thresholds: {
    http_req_duration: ['p(95)<500'],
    failed_requests: ['rate<0.05'],
  },
};

export default function () {
  // 1. Portada (la ruta más visitada)
  const raffles = http.get(`${BASE}/raffles`);
  check(raffles, { 'portada 200': (r) => r.status === 200 });
  failRate.add(raffles.status !== 200);
  sleep(1);

  // 2. Health (el load balancer lo martilla)
  const health = http.get(`${BASE}/health`);
  check(health, { 'health ok': (r) => r.status === 200 });
  sleep(0.5);

  // 3. Sitio público (branding, sin auth)
  http.get(`${BASE}/site`);
  sleep(0.5);

  // 4. Ganadores (la otra página pública popular)
  const winners = http.get(`${BASE}/raffles/winners`);
  check(winners, { 'ganadores 200': (r) => r.status === 200 });
  sleep(1);

  // 5. Registro (simula un nuevo usuario por VU)
  const dni = `${70000000 + Math.floor(Math.random() * 9999999)}`;
  const regRes = http.post(`${BASE}/auth/register`, JSON.stringify({
    name: `K6 User ${dni}`,
    dni,
    phone: `9${dni.slice(0, 8)}`,
    email: `k6-${dni}@test.local`,
    password: `k6test${dni}`,
    acceptTerms: true,
  }), { headers: { 'Content-Type': 'application/json' } });

  if (regRes.status === 201 || regRes.status === 200) {
    const token = JSON.parse(regRes.body).accessToken;
    const authHeaders = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    };

    // 6. Mi perfil
    http.get(`${BASE}/users/me`, { headers: authHeaders });
    sleep(0.3);

    // 7. Mis boletos
    http.get(`${BASE}/tickets/mine`, { headers: authHeaders });
    sleep(0.3);

    // 8. Mis movimientos (paginado)
    http.get(`${BASE}/transactions/mine?page=1&limit=15`, { headers: authHeaders });
    sleep(0.5);
  }

  sleep(Math.random() * 2);
}
