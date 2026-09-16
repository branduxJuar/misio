/**
 * CLIENT_URL contiene los orígenes web permitidos separados por coma.
 * CORS HTTP y cada namespace Socket.IO deben leerlos de la misma forma.
 */
export const clientOrigins = (fallback: string) => {
  const configured = (process.env.CLIENT_URL ?? fallback)
    .trim()
    .replace(/^["'\[]+|["'\]]+$/g, '');

  return configured.split(',').map((entry) => {
    const value = entry.trim().replace(/^["']+|["']+$/g, '');
    try { return new URL(value).origin; }
    catch { return ''; }
  }).filter(Boolean);
};
