import React, { createContext, useContext, useEffect, useState } from 'react';
import { api } from '../auth/api';

/** Valores por defecto: lo que se ve mientras carga o si el backend no está. */
const DEFAULT_SITE = {
  brandName: 'Misio',
  tagline: 'Sorteos donde nunca pierdes',
  logoUrl: '',
  primaryColor: '#0d9488',
  whatsapp: '',
  landing: {},
  about: {},
};

const SiteCtx = createContext({ ...DEFAULT_SITE, refresh: () => {} });
export const useSite = () => useContext(SiteCtx);

/**
 * 🏷️ MARCA Y CONTENIDO EDITABLES.
 * Trae GET /site (público) y lo aplica en vivo: nombre de la empresa,
 * logo, color principal (sobrescribe la variable CSS --z-primary, así el
 * cambio se propaga a TODA la app sin tocar componentes) y el título de
 * la pestaña del navegador.
 */
export default function SiteProvider({ children }) {
  const [site, setSite] = useState(DEFAULT_SITE);

  const load = async () => {
    try {
      const data = await api('/site');
      setSite({ ...DEFAULT_SITE, ...data });
    } catch { /* sin backend: se queda con los valores por defecto */ }
  };

  useEffect(() => { load(); }, []);

  useEffect(() => {
    let pColor = site.primaryColor;
    if (['#6366f1', '#8b5cf6', '#7c3aed', '#4f46e5'].includes(pColor?.toLowerCase())) {
      pColor = '#0d9488';
    }
    if (pColor) {
      document.documentElement.style.setProperty('--z-primary', pColor);
    }
    document.title = `${site.brandName} — ${site.tagline}`;
  }, [site.primaryColor, site.brandName, site.tagline]);

  return (
    <SiteCtx.Provider value={{ ...site, refresh: load }}>
      {children}
    </SiteCtx.Provider>
  );
}
