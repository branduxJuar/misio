import React, { createContext, useContext, useEffect, useState } from 'react';
import { ConfigProvider } from 'antd';
import esES from 'antd/locale/es_ES';
import { buildAntdTheme } from './misioTheme';

const ThemeCtx = createContext({ mode: 'light', toggle: () => {} });
export const useThemeMode = () => useContext(ThemeCtx);

/**
 * MODO CLARO / OSCURO:
 *  - La preferencia vive en localStorage ('misio_theme_v2', por defecto 'light').
 *  - body.light activa las variables CSS claras (estilos inline).
 *  - buildAntdTheme(mode) re-tematiza todos los componentes AntD.
 */
export default function ThemeProvider({ children }) {
  const [mode, setMode] = useState(() => localStorage.getItem('misio_theme_v2') ?? 'light');

  useEffect(() => {
    document.body.classList.toggle('light', mode === 'light');
    localStorage.setItem('misio_theme_v2', mode);
  }, [mode]);

  const toggle = () => setMode((m) => (m === 'dark' ? 'light' : 'dark'));

  return (
    <ThemeCtx.Provider value={{ mode, toggle }}>
      <ConfigProvider theme={buildAntdTheme(mode)} locale={esES}>
        {children}
      </ConfigProvider>
    </ThemeCtx.Provider>
  );
}
