import React, { useEffect, useState } from 'react';
import { Button, Card, Modal, Space, Typography, Grid } from 'antd';
import { CloseOutlined, DownloadOutlined, ThunderboltFilled } from '@ant-design/icons';
import { MISIO_COLORS } from '../theme/misioTheme';
import { useAuth } from '../auth/AuthContext';

const { Text, Title, Paragraph } = Typography;
const { useBreakpoint } = Grid;

const DISMISS_KEY = 'misio_install_dismissed_at';
const DISMISS_DAYS = 14; // Si dice "ahora no", no volvemos a molestar en 2 semanas

/** ¿Ya está instalada (corriendo como app)? */
const isStandalone = () =>
  window.matchMedia?.('(display-mode: standalone)').matches ||
  window.navigator.standalone === true;

const isIOS = () =>
  /iphone|ipad|ipod/i.test(window.navigator.userAgent) && !window.MSStream;

const recentlyDismissed = () => {
  const at = Number(localStorage.getItem(DISMISS_KEY) ?? 0);
  return at > 0 && Date.now() - at < DISMISS_DAYS * 86400000;
};

/**
 * 📲 INSTALAR LA APP (PWA).
 *
 * - Android / Chrome / Edge: el navegador dispara `beforeinstallprompt`;
 *   lo guardamos y mostramos NUESTRO banner (el nativo es discreto y
 *   fácil de ignorar). Al aceptar, se abre el instalador real.
 * - iPhone / Safari: Apple NO permite el instalador automático, así que
 *   mostramos las instrucciones exactas (Compartir → Añadir a inicio).
 * - No aparece si ya está instalada ni si el usuario la descartó hace
 *   menos de 14 días — nada de banners insistentes.
 */
export default function InstallPrompt() {
  const [deferred, setDeferred] = useState(null); // Evento del navegador
  const [visible, setVisible] = useState(false);
  const [iosHelp, setIosHelp] = useState(false);
  const { user } = useAuth();
  const screens = useBreakpoint();
  const isDesktop = screens.lg;

  useEffect(() => {
    if (isStandalone()) return; // Ya la usa instalada

    // Android/Chrome/Edge: capturamos el evento y lo guardamos
    const onBeforeInstall = (e) => {
      e.preventDefault();
      setDeferred(e);
    };
    window.addEventListener('beforeinstallprompt', onBeforeInstall);

    const onInstalled = () => setVisible(false);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstall);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  // Mostrar el banner SOLO si el usuario está logueado y tenemos el evento
  // (o es iOS donde no hay evento).
  useEffect(() => {
    if (isStandalone() || recentlyDismissed()) return;

    if (user && deferred) {
      const t = setTimeout(() => setVisible(true), 1500);
      return () => clearTimeout(t);
    }

    if (user && isIOS()) {
      const t = setTimeout(() => setVisible(true), 2500);
      return () => clearTimeout(t);
    }
  }, [user, deferred]);

  const dismiss = () => {
    localStorage.setItem(DISMISS_KEY, String(Date.now()));
    setVisible(false);
  };

  const install = async () => {
    if (isIOS() && !deferred) return setIosHelp(true);
    if (!deferred) return;
    deferred.prompt();
    const { outcome } = await deferred.userChoice;
    setDeferred(null);
    setVisible(false);
    if (outcome === 'dismissed') localStorage.setItem(DISMISS_KEY, String(Date.now()));
  };

  useEffect(() => {
    const onManual = () => {
      if (isIOS() && !deferred) {
        setIosHelp(true);
      } else if (deferred) {
        install();
      } else {
        setVisible(true);
      }
    };
    window.addEventListener('misio:install_prompt', onManual);
    return () => window.removeEventListener('misio:install_prompt', onManual);
  }, [deferred]);

  return (
    <>
      {visible && (
        <div style={{
          position: 'fixed', left: 12, right: 12, bottom: isDesktop ? 12 : 82, zIndex: 1000,
          display: 'flex', justifyContent: 'center', pointerEvents: 'none',
          transition: 'bottom 0.3s ease-out'
        }}>
          <Card
            style={{
              width: 'min(520px, 100%)',
              borderColor: MISIO_COLORS.primary,
              boxShadow: '0 12px 40px color-mix(in srgb, var(--z-primary) 28%, transparent)',
              pointerEvents: 'auto',
            }}
            styles={{ body: { padding: 14 } }}
          >
            <Space align="start" style={{ width: '100%' }}>
              <div style={{
                width: 44, height: 44, borderRadius: 12, display: 'grid', placeItems: 'center',
                background: MISIO_COLORS.primary, fontSize: 22, flexShrink: 0,
              }}>
                ⚡
              </div>
              <div style={{ flex: 1 }}>
                <Text strong style={{ display: 'block' }}>Instala Misio en tu celular</Text>
                <Text style={{ fontSize: 12, color: MISIO_COLORS.textMuted }}>
                  Entra directo desde tu pantalla de inicio y recibe los avisos de
                  cada sorteo en vivo. Ocupa casi nada.
                </Text>
                <Space style={{ marginTop: 10 }} wrap>
                  <Button type="primary" icon={<DownloadOutlined />} onClick={install}>
                    Instalar app
                  </Button>
                  <Button type="text" onClick={dismiss}>Ahora no</Button>
                </Space>
              </div>
              <Button type="text" size="small" icon={<CloseOutlined />} onClick={dismiss} />
            </Space>
          </Card>
        </div>
      )}

      {/* iOS: instrucciones (Safari no permite instalador automático) */}
      <Modal open={iosHelp} onCancel={() => setIosHelp(false)} footer={null} centered
        title={<><ThunderboltFilled style={{ color: MISIO_COLORS.primary }} /> Instalar Misio en tu iPhone</>}>
        <Paragraph style={{ color: MISIO_COLORS.textMuted }}>
          En iPhone, Safari pide hacerlo a mano — son 3 toques:
        </Paragraph>
        <Space direction="vertical" size={10} style={{ width: '100%' }}>
          {[
            ['1', 'Toca el botón Compartir', 'El cuadrito con la flecha hacia arriba, abajo en la barra de Safari.'],
            ['2', 'Elige "Añadir a pantalla de inicio"', 'Baja un poco en la lista de opciones.'],
            ['3', 'Toca "Añadir"', 'Listo: Misio queda como una app más en tu iPhone.'],
          ].map(([n, t, d]) => (
            <Card key={n} size="small">
              <Space align="start">
                <div style={{
                  width: 26, height: 26, borderRadius: '50%', display: 'grid', placeItems: 'center',
                  background: MISIO_COLORS.primary, color: '#fff', fontWeight: 700, fontSize: 13,
                }}>
                  {n}
                </div>
                <div>
                  <Text strong style={{ fontSize: 13 }}>{t}</Text>
                  <br />
                  <Text style={{ fontSize: 12, color: MISIO_COLORS.textMuted }}>{d}</Text>
                </div>
              </Space>
            </Card>
          ))}
        </Space>
        <Button block type="primary" style={{ marginTop: 14 }} onClick={() => setIosHelp(false)}>
          Entendido
        </Button>
      </Modal>
    </>
  );
}

/** Para el menú del avatar: dispara el instalador cuando se pueda. */
export function useInstallApp() {
  const [canInstall, setCanInstall] = useState(false);
  
  useEffect(() => {
    if (isStandalone()) return;
    if (isIOS()) setCanInstall(true);
    
    const onBeforeInstall = (e) => { 
      e.preventDefault(); 
      setCanInstall(true); 
    };
    window.addEventListener('beforeinstallprompt', onBeforeInstall);
    return () => window.removeEventListener('beforeinstallprompt', onBeforeInstall);
  }, []);

  return {
    canInstall,
    install: () => {
      window.dispatchEvent(new Event('misio:install_prompt'));
    },
  };
}
