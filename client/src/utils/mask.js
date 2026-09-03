export const maskName = (rawName) => {
  if (!rawName || rawName === '—') return '—';
  // Extraer el primer nombre y limpiarlo
  const firstName = rawName.trim().split(/\s+/)[0].replace(/[\.\*]+/g, '');
  
  if (!firstName) return '—';
  
  // Regla: Si el nombre tiene 4 letras o menos (ej: JOSE), mostrar 2 letras
  // Si tiene más de 4 letras (ej: BRANDON), mostrar 4 letras.
  // Sin apellidos ni iniciales adicionales.
  if (firstName.length <= 4) {
    return firstName.slice(0, 2) + '.....';
  }
  return firstName.slice(0, 4) + '.......';
};
