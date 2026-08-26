import { theme } from 'antd';

/**
 * Tema visual de Misio v3 — "Sobrio moderno" con MODO CLARO Y OSCURO.
 *
 * MISIO_COLORS ahora apunta a VARIABLES CSS (definidas en index.css para
 * :root oscuro y body.light claro): todos los estilos inline del código
 * cambian de modo SOLOS, sin tocar las vistas.
 *
 * La regla semántica se mantiene: verde SOLO dinero, dorado SOLO premios.
 */
export const MISIO_COLORS = {
  bgBase: 'var(--z-bg-base)',
  bgSurface: 'var(--z-bg-surface)',
  bgElevated: 'var(--z-bg-elevated)',
  primary: 'var(--z-primary)',
  electricBlue: 'var(--z-blue)',
  saldoGreen: 'var(--z-green)',
  prizeGold: 'var(--z-gold)',
  danger: 'var(--z-danger)',
  textMuted: 'var(--z-text-muted)',
};

/** Paletas concretas por modo (AntD no acepta var() en sus tokens). */
const PALETTES = {
  dark: {
    primary: '#14b8a6', blue: '#0ea5e9', green: '#10b981', gold: '#f59e0b',
    danger: '#f43f5e', bgBase: '#06181b', bgSurface: '#0a2928',
    bgElevated: '#113837', border: '#164e4b', borderSec: '#133d3b',
  },
  light: {
    primary: '#0d9488', blue: '#0284c7', green: '#10b981', gold: '#d97706',
    danger: '#e11d48', bgBase: '#eef7f6', bgSurface: '#ffffff',
    bgElevated: '#e0f2f1', border: '#bfe3e0', borderSec: '#e5f3f2',
  },
};

/** Construye el tema AntD para el modo pedido ('dark' | 'light'). */
export function buildAntdTheme(mode = 'light') {
  const c = PALETTES[mode] ?? PALETTES.light;
  return {
    algorithm: mode === 'light' ? theme.defaultAlgorithm : theme.darkAlgorithm,
    token: {
      colorPrimary: c.primary,
      colorInfo: c.blue,
      colorSuccess: c.green,
      colorWarning: c.gold,
      colorError: c.danger,
      colorBgBase: c.bgBase,
      colorBgContainer: c.bgSurface,
      colorBgElevated: c.bgElevated,
      colorBorder: c.border,
      colorBorderSecondary: c.borderSec,
      fontFamily: "'Inter', 'Segoe UI', system-ui, sans-serif",
      borderRadius: 16,
      fontSize: 15,
    },
    components: {
      Card: { colorBgContainer: c.bgSurface, borderRadiusLG: 24 },
      Button: { fontWeight: 700, borderRadius: 100 /* Estilo píldora */ },
      Tag: { borderRadiusSM: 100, fontSize: 13, fontWeight: 600 /* Estilo píldora */ },
      Typography: { fontFamilyCode: "'Outfit', sans-serif" }
    },
  };
}

/** Tema por defecto (ahora claro, paleta verde y azul). */
export const misioTheme = buildAntdTheme('light');
