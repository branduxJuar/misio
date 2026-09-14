import React from 'react';
import ReactDOM from 'react-dom/client';
import ThemeProvider from './theme/ThemeProvider';
import SiteProvider from './theme/SiteProvider';
import App from './App';
import './index.css';

/**
 * Raíz del Proyecto Misio.
 * ThemeProvider maneja el modo claro/oscuro (variables CSS + tema AntD)
 * y el locale es_ES traduce paginación, tablas y modales al español.
 */

// FORZAR DESINSTALACIÓN DE LA PWA (Service Worker)
// Si alguna vez se instaló la PWA, el Service Worker antiguo se queda pegado
// interceptando la red y mostrando código viejo. Esto lo destruye por completo.
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.getRegistrations().then((registrations) => {
    for (const registration of registrations) {
      registration.unregister();
    }
  });
}

// Limpiar la memoria caché antigua de la PWA para forzar la carga del nuevo código
if ('caches' in window) {
  caches.keys().then((names) => {
    for (const name of names) {
      caches.delete(name);
    }
  });
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <SiteProvider>
      <ThemeProvider>
        <App />
      </ThemeProvider>
    </SiteProvider>
  </React.StrictMode>,
);
