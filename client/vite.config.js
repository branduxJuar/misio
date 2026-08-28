import { defineConfig } from 'vite';
import { readFileSync } from 'node:fs';
import react from '@vitejs/plugin-react';

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
  ].filter(Boolean),
  server: {
    port: 5173,
    // host: true → escucha en 0.0.0.0 (toda la red local)
    host: true,
  },
});
