import { useCallback, useEffect, useState } from 'react';
import { api } from '../auth/api';

/**
 * useApiOrMock — intenta la API real; si el backend no responde (o el
 * endpoint exige sesión y no la hay), cae al mock para que el prototipo
 * siga renderizando. `demo: true` indica que estás viendo datos ficticios.
 *
 *   const { data, demo, loading, refresh } = useApiOrMock('/raffles', MOCK_RAFFLES);
 *
 * Cuando el backend esté siempre disponible, basta eliminar el fallback.
 */
export function useApiOrMock(path, mockData, { enabled = true } = {}) {
  const [data, setData] = useState(mockData);
  const [demo, setDemo] = useState(true);
  const [loading, setLoading] = useState(enabled);

  const refresh = useCallback(async () => {
    if (!enabled) return;
    setLoading(true);
    try {
      const real = await api(path);
      setData(real);
      setDemo(false);
    } catch {
      setData(mockData); // Backend caído o sin sesión → modo demo
      setDemo(true);
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path, enabled]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { data, demo, loading, refresh };
}
