/**
 * CLIENT_URL contiene los orígenes web permitidos separados por coma.
 * CORS HTTP y cada namespace Socket.IO deben leerlos de la misma forma.
 */
export const clientOrigins = (fallback: string) => (process.env.CLIENT_URL ?? fallback)
  .split(',')
  .map((origin) => origin.trim().replace(/^["']|["']$/g, ''))
  .filter(Boolean);
