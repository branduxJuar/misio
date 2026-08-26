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
  // Formato acordado con el negocio: "Brand.... Juar...."
  // (primeras letras legibles + puntos — suficiente para que el ganador
  // se reconozca, insuficiente para identificarlo desde fuera).
  return (fullName ?? '')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => {
      const head = part.slice(0, 5);
      return `${head.charAt(0).toUpperCase()}${head.slice(1).toLowerCase()}....`;
    })
    .join(' ');
}
