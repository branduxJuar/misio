import React from 'react';
import { Button, Tooltip } from 'antd';

/**
 * 🔗 COMPARTIR SORTEO EN WHATSAPP
 */
export default function ShareButtons({ raffle, size = 'middle' }) {
  const baseUrl = window.location.origin;
  const url = `${baseUrl}/rifa/${raffle._id}`;

  // UTM automático
  const utmUrl = `${url}?utm_source=share&utm_medium=whatsapp&utm_campaign=${encodeURIComponent(raffle.title?.slice(0, 30) ?? 'sorteo')}`;

  const text = `🎟️ ¡Mira este increíble sorteo! ${raffle.title} por solo S/ ${raffle.ticketPrice}. ¡Participa ya!`;

  const shareWhatsApp = () => {
    const waUrl = `https://wa.me/?text=${encodeURIComponent(`${text}\n${utmUrl}`)}`;
    window.open(waUrl, '_blank');
  };

  return (
    <Tooltip title="Compartir en WhatsApp">
      <Button 
        size={size} 
        onClick={shareWhatsApp}
        style={{ 
          background: '#f0fdf4', 
          borderColor: '#86efac', 
          color: '#15803d', 
          fontWeight: 700, 
          borderRadius: 20 
        }}
      >
        📲 Compartir por WhatsApp
      </Button>
    </Tooltip>
  );
}
