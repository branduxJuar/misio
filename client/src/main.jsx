import React from 'react';
import ReactDOM from 'react-dom/client';
import ThemeProvider from './theme/ThemeProvider';
import SiteProvider from './theme/SiteProvider';
import App from './App';
import './index.css';

/**
 * Raíz de la PWA Misio.
 * ThemeProvider maneja el modo claro/oscuro (variables CSS + tema AntD)
 * y el locale es_ES traduce paginación, tablas y modales al español.
 */
ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <SiteProvider>
      <ThemeProvider>
        <App />
      </ThemeProvider>
    </SiteProvider>
  </React.StrictMode>,
);
