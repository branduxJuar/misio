import React, { useRef } from 'react';
import { Button, Space, Typography, message } from 'antd';
import { DownloadOutlined } from '@ant-design/icons';
import { QRCodeSVG } from 'qrcode.react';
import { useSite } from '../theme/SiteProvider';

const { Text } = Typography;

/**
 * 🎟️ TICKET DE RIFA — diseño horizontal con talón perforado.
 *
 * Formato clásico de boleto de tómbola: cuerpo a la izquierda (marca,
 * sorteo, estado) y talón a la derecha con el número grande, separados
 * por una línea perforada con muescas redondas — como un ticket de
 * verdad que arrancas por la mitad.
 *
 * `variant='winner'` cambia a un diseño premium dorado para los boletos
 * ganadores, pensado para presumir en redes.
 */
export default function TicketCard({ ticket, raffle, variant = 'normal', showDownload = true }) {
  const ref = useRef(null);
  const site = useSite();
  const isWinner = variant === 'winner' || ticket.status === 'winner';

  const download = async () => {
    try {
      const { default: html2canvas } = await import('html2canvas');
      const canvas = await html2canvas(ref.current, { backgroundColor: null, scale: 3 });
      const link = document.createElement('a');
      link.download = `boleto-${ticket.code || ticket.ticketNumber}.png`;
      link.href = canvas.toDataURL('image/png');
      link.click();
      message.success(isWinner
        ? '🏆 ¡Boleto ganador descargado! Presúmelo 🎉'
        : 'Boleto descargado — compártelo en tu historia 📲');
    } catch {
      message.error('No se pudo descargar — intenta de nuevo');
    }
  };

  // Colores según variante (estética clara e iluminada)
  const theme = isWinner
    ? {
        bg: 'linear-gradient(135deg, #fffbeb 0%, #fef3c7 100%)',
        border: '#d97706',
        stub: 'linear-gradient(160deg, #f59e0b, #d97706)',
        stubText: '#fff',
        accent: '#d97706',
        num: '#78350f',
        title: '#78350f',
        subtitle: 'rgba(120, 53, 15, 0.65)',
      }
    : {
        bg: 'linear-gradient(135deg, #f0fdf4 0%, #e0f2fe 100%)',
        border: '#0d9488',
        stub: 'linear-gradient(160deg, #0d9488, #0284c7)',
        stubText: '#fff',
        accent: '#0d9488',
        num: '#0f2926',
        title: '#0f2926',
        subtitle: 'rgba(15, 41, 38, 0.65)',
      };

  const rStatus = ticket.raffleStatus || raffle?.status || 'active';

  const statusLabel = ticket.status === 'winner' ? '🏆 GANADOR'
    : ticket.status === 'active' && rStatus === 'completed' ? 'Finalizado'
    : ticket.status === 'active' ? '✅ Participando'
    : ticket.status === 'live' ? '🔴 En vivo'
    : '💧 Al agua';

  return (
    <Space direction="vertical" size={8} style={{ width: '100%' }}>
      <div
        ref={ref}
        style={{
          display: 'flex',
          borderRadius: 14,
          overflow: 'hidden',
          background: theme.bg,
          border: `1.5px solid ${theme.border}`,
          boxShadow: isWinner ? '0 8px 28px rgba(217,119,6,0.2)' : '0 8px 24px rgba(13,148,136,0.15)',
          minHeight: 130,
          position: 'relative',
        }}
      >
        {/* ── Cuerpo del ticket ── */}
        <div style={{ flex: 1, padding: 'clamp(12px, 3vw, 16px) clamp(10px, 3vw, 18px)', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', overflow: 'hidden' }}>
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <Text style={{ color: theme.accent, fontWeight: 800, fontSize: 14 }}>
                ⚡ {site.brandName}
              </Text>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <Text style={{ color: theme.subtitle, fontSize: 10, fontWeight: 500 }}>
                  {ticket.date}
                </Text>
                {isWinner && <span style={{ fontSize: 18, lineHeight: 1 }}>🏆</span>}
              </div>
            </div>
            <Text style={{ color: theme.title, fontSize: 15, fontWeight: 600, display: 'block', marginTop: 6, wordBreak: 'break-word', lineHeight: 1.2 }}>
              {raffle?.title || 'Sorteo'}
            </Text>
            <Text style={{ color: theme.subtitle, fontSize: 10, letterSpacing: 1 }}>
              {isWinner ? (ticket.prizeWonTitle ? `PREMIO: ${ticket.prizeWonTitle.toUpperCase()}` : '¡GANADOR!') : ''}
            </Text>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginTop: 10 }}>
            {raffle?.ticketPrice != null && raffle.ticketPrice !== '' && (
              <Text style={{ color: theme.subtitle, fontSize: 12, fontWeight: 500 }}>
                S/ {Number(raffle.ticketPrice).toFixed(2)}
              </Text>
            )}
            <Text style={{
              fontSize: 11, fontWeight: 800,
              color: isWinner ? theme.accent
                : ticket.status === 'active' && rStatus !== 'completed' ? '#22c55e'
                : ticket.status === 'live' ? '#f0526b'
                : '#64748b',
            }}>
              {statusLabel}
            </Text>
          </div>
        </div>

        {/* ── Perforación (las muescas del talón) ── */}
        <div style={{ position: 'relative', width: 2, background: 'transparent' }}>
          <div style={{
            position: 'absolute', top: 0, bottom: 0, left: '50%', transform: 'translateX(-50%)',
            borderLeft: `2px dashed ${isWinner ? 'rgba(232,184,74,0.5)' : 'rgba(255,255,255,0.25)'}`,
          }} />
          {/* Muescas redondas arriba y abajo (fondo blanco simulando agujero en la tarjeta) */}
          <div style={{
            position: 'absolute', top: -8, left: '50%', transform: 'translateX(-50%)',
            width: 16, height: 16, borderRadius: '50%',
            background: '#ffffff',
            boxShadow: 'inset 0 -2px 4px rgba(0,0,0,0.1)'
          }} />
          <div style={{
            position: 'absolute', bottom: -8, left: '50%', transform: 'translateX(-50%)',
            width: 16, height: 16, borderRadius: '50%',
            background: '#ffffff',
            boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.1)'
          }} />
        </div>

        {/* ── Talón con el número ── */}
        <div style={{
          width: 'clamp(80px, 25vw, 118px)',
          flexShrink: 0,
          background: theme.stub,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '12px 6px',
        }}>
          <Text style={{ color: '#ffffff', fontSize: 9, letterSpacing: 1, opacity: 0.9 }}>
            N° BOLETO
          </Text>
          <div style={{ color: '#ffffff', fontSize: 34, fontWeight: 900, lineHeight: 1.1, margin: '2px 0' }}>
            {String(ticket.ticketNumber).padStart(3, '0')}
          </div>
          {ticket.code && (
            <Text style={{ color: '#ffffff', fontSize: 9, opacity: 0.9 }}>
              {ticket.code}
            </Text>
          )}
          {ticket.code && (
            <div style={{ marginTop: 'auto', background: '#fff', padding: '4px', borderRadius: '4px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <QRCodeSVG 
                value={`${window.location.origin}/validar?c=${ticket.code}`} 
                size={40} 
                style={{ display: 'block', width: 40, height: 40 }}
              />
            </div>
          )}
        </div>
      </div>

      {showDownload && (
        <Button
          size="small"
          icon={<DownloadOutlined />}
          onClick={download}
          block
          type={isWinner ? 'primary' : 'default'}
          style={isWinner ? { background: theme.stub, border: 'none', color: theme.stubText, fontWeight: 700 } : {}}
        >
          {isWinner ? 'Descargar mi boleto ganador' : 'Descargar boleto'}
        </Button>
      )}
    </Space>
  );
}
