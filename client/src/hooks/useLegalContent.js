import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../auth/api';

export function useLegalContent(open) {
  const [content, setContent] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const request = useRef(0);
  const reload = useCallback(async () => {
    const current = ++request.current;
    setLoading(true);
    setError(false);
    try {
      const data = await api('/settings/legal');
      if (current === request.current) setContent(data);
    } catch {
      if (current === request.current) { setContent(null); setError(true); }
    } finally {
      if (current === request.current) setLoading(false);
    }
  }, []);
  useEffect(() => {
    if (!open) return;
    reload();
    window.addEventListener('focus', reload);
    window.addEventListener('misio-content-updated', reload);
    return () => {
      request.current++;
      window.removeEventListener('focus', reload);
      window.removeEventListener('misio-content-updated', reload);
    };
  }, [open, reload]);
  return { content, loading, error, reload };
}
