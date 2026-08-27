import { defineConfig } from 'vite';
import { readFileSync } from 'node:fs';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

const { version: APP_VERSION } = JSON.parse(readFileSync('./package.json', 'utf8'));

/**
 * HTTPS EN RED LOCAL: con basicSsl() el navegador del celular activa el
 * service worker y el prompt de instalación de la PWA. Sin HTTPS, la PWA
 * no se instala desde otra máquina de la red.
 *
 * El plugin genera un certificado autofirmado al vuelo — no hay nada que
 * configurar. El celular mostrará "conexión no segura" la primera vez:
 * dale "Avanzado → Continuar" y listo.
 */
let sslPlugin = null;
try {
  const { default: basicSsl } = await import('@vitejs/plugin-basic-ssl');
  sslPlugin = basicSsl();
} catch {
  // Si no está instalado, Vite arranca en HTTP normal
}

export default defineConfig({
  define: { __APP_VERSION__: JSON.stringify(APP_VERSION) },
  plugins: [
    react(),
    sslPlugin,
    VitePWA({
      registerType: 'prompt',
      includeAssets: ['favicon.svg', 'pwa-192.png', 'pwa-512.png'],
      manifest: {
        name: 'Misio — Sorteos Cero Pérdida',
        short_name: 'Misio',
        description: 'Sorteos donde nunca pierdes: si tu boleto no gana, su valor vuelve como saldo de canje.',
        theme_color: '#0e1015',
        background_color: '#0e1015',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '/',
        lang: 'es-PE',
        categories: ['entertainment', 'shopping'],
        icons: [
          { src: '/pwa-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/pwa-512.png', sizes: '512x512', type: 'image/png' },
          { src: '/pwa-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
        shortcuts: [
          { name: 'Sorteos', short_name: 'Sorteos', url: '/', icons: [{ src: '/pwa-192.png', sizes: '192x192' }] },
          { name: 'Mi Saldo', short_name: 'Mi Saldo', url: '/mi-cuenta', icons: [{ src: '/pwa-192.png', sizes: '192x192' }] },
          { name: 'Tienda', short_name: 'Tienda', url: '/tienda', icons: [{ src: '/pwa-192.png', sizes: '192x192' }] },
          { name: 'Bingo Gratis', short_name: 'Bingo', url: '/bingo', icons: [{ src: '/pwa-192.png', sizes: '192x192' }] },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
      },
    }),
  ].filter(Boolean),
  server: {
    port: 5173,
    // host: true → escucha en 0.0.0.0 (toda la red local)
    host: true,
  },
});
