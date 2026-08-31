import React, { createContext, useContext, useEffect, useState } from 'react';
import { api, SERVER_URL } from '../auth/api';

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
  const [loading, setLoading] = useState(true);

  const load = async () => {
    try {
      const data = await api('/site');
      setSite({ ...DEFAULT_SITE, ...data });
    } catch { /* sin backend: se queda con los valores por defecto */ }
    finally { setLoading(false); }
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
    document.title = "Misio.pe";

    // 1. Cambiar favicons y apple-touch-icon en vivo
    const logo = '/favicon.svg';
    const logoPng = '/pwa-192.png';
    
    let iconLink = document.querySelector("link[rel~='icon']");
    if (iconLink) iconLink.href = logo;

    let appleIcon = document.querySelector("link[rel='apple-touch-icon']");
    if (appleIcon) appleIcon.href = logoPng;

    // 2. Modificar el PWA Manifest en vivo para que use el logo al instalar
    fetch('/manifest.webmanifest')
      .then(res => res.json())
      .then(manifest => {
        manifest.icons = [
          { src: logoPng, sizes: '192x192', type: 'image/png' },
          { src: logoPng, sizes: '512x512', type: 'image/png' },
          { src: logoPng, sizes: '512x512', type: 'image/png', purpose: 'maskable' }
        ];
        manifest.name = `${site.brandName} — ${site.tagline}`;
        manifest.short_name = site.brandName;
        manifest.theme_color = pColor || '#0d9488';
        
        const blob = new Blob([JSON.stringify(manifest)], { type: 'application/manifest+json' });
        const manifestUrl = URL.createObjectURL(blob);
        
        let manifestLink = document.querySelector("link[rel='manifest']");
        if (!manifestLink) {
          manifestLink = document.createElement('link');
          manifestLink.rel = 'manifest';
          document.head.appendChild(manifestLink);
        }
        manifestLink.href = manifestUrl;
      })
      .catch(() => {});

  }, [site.primaryColor, site.brandName, site.tagline, site.logoUrl]);

  return (
    <SiteCtx.Provider value={{ ...site, loading, refresh: load }}>
      {children}
    </SiteCtx.Provider>
  );
}
