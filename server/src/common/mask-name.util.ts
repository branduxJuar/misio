/**
 * ENMASCARADO DE NOMBRES (privacidad).
 *
 * "Carla Mendoza Ríos" → "CARL… MEND…". La usan los ganadores, las pujas,
 * la lista pública de boletos y el bingo: cualquier sitio donde se muestre
 * a un tercero. Vivía dentro del módulo `live`, lo que obligaba a media
 * aplicación a importar código de streaming para poder ocultar un
 * apellido. Es una regla de privacidad, no de transmisión: su lugar es
 * `common`.
 */
export function maskName(fullName: string): string {
  if (!fullName || fullName === '—') return '—';
  const firstName = fullName.trim().split(/\s+/)[0].replace(/[\.\*]+/g, '');
  if (!firstName) return '—';
  
  const capitalized = firstName.charAt(0).toUpperCase() + firstName.slice(1).toLowerCase();
  
  if (capitalized.length <= 4) {
    return capitalized.slice(0, 2) + '.....';
  }
  return capitalized.slice(0, 4) + '.......';
}
