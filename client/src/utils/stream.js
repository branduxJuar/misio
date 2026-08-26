/**
 * Convierte el streamUrl guardado (ya normalizado por el backend) en el
 * src final del iframe. Twitch EXIGE el parámetro parent=<dominio que
 * embebe>; se agrega aquí porque solo el navegador conoce su dominio.
 */
export function toEmbedSrc(url) {
  if (!url) return '';
  if (url.includes('player.twitch.tv')) {
    const sep = url.includes('?') ? '&' : '?';
    return `${url}${sep}parent=${window.location.hostname}&autoplay=true&muted=false`;
  }
  if (url.includes('youtube.com/embed/')) {
    const sep = url.includes('?') ? '&' : '?';
    return `${url}${sep}autoplay=1&rel=0`;
  }
  return url; // Kick y otros: tal cual
}
