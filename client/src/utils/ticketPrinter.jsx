import React from 'react';
import { createRoot } from 'react-dom/client';
import html2canvas from 'html2canvas';
import dayjs from 'dayjs';
import { QRCodeSVG } from 'qrcode.react';

/** Formato del ticket. */
const fmtCode = (prefix, n, total) => {
  const digits = Math.max(4, String(total).length);
  return `${prefix}-${String(n).padStart(digits, '0')}`;
};

/** Renderiza un solo ticket visual (similar a Mis Boletos). */
const TicketView = ({ raffle, ticketNumber, buyerName, date }) => {
  return (
    <div style={{
      width: '320px',
      height: '160px',
      background: '#ffffff',
      borderRadius: '12px',
      border: '1px solid #e2e8f0',
      display: 'flex',
      fontFamily: 'Outfit, sans-serif',
      position: 'relative',
      overflow: 'hidden',
      boxSizing: 'border-box'
    }}>
      {/* Sección Izquierda */}
      <div style={{ flex: 1, padding: '16px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div style={{ color: '#047857', fontWeight: 900, fontSize: '16px', display: 'flex', alignItems: 'center', gap: '4px' }}>
            <span style={{ color: '#f59e0b' }}>⚡</span> Misio
          </div>
          <div style={{ fontSize: '10px', color: '#64748b' }}>
            {dayjs(date).format('DD/MM/YYYY HH:mm')}
          </div>
        </div>
        
        <div>
          <div style={{ fontSize: '14px', fontWeight: 800, color: '#0f172a', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', textTransform: 'uppercase' }}>
            {raffle.title}
          </div>
          {buyerName && (
            <div style={{ fontSize: '10px', color: '#475569', marginTop: '2px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              👤 {buyerName}
            </div>
          )}
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
          <div style={{ fontSize: '14px', color: '#64748b', fontWeight: 500 }}>
            S/ {Number(raffle.ticketPrice).toFixed(2)}
          </div>
          <div style={{ fontSize: '12px', fontWeight: 700, color: '#047857', background: '#ecfdf5', padding: '2px 8px', borderRadius: '12px' }}>
            Comprado
          </div>
        </div>
      </div>

      {/* Muescas / Troquelado */}
      <div style={{ position: 'absolute', top: '-10px', right: '100px', width: '20px', height: '20px', background: '#ffffff', borderRadius: '50%', borderBottom: '1px solid #e2e8f0' }} />
      <div style={{ position: 'absolute', bottom: '-10px', right: '100px', width: '20px', height: '20px', background: '#ffffff', borderRadius: '50%', borderTop: '1px solid #e2e8f0' }} />
      <div style={{ position: 'absolute', top: '10px', bottom: '10px', right: '110px', borderRight: '2px dashed #cbd5e1' }} />

      {/* Sección Derecha */}
      <div style={{ width: '120px', background: 'linear-gradient(135deg, #047857 0%, #065f46 100%)', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', color: '#ffffff', padding: '10px' }}>
        <div style={{ fontSize: '10px', fontWeight: 600, opacity: 0.9, letterSpacing: '1px' }}>Nº BOLETO</div>
        <div style={{ fontSize: '32px', fontWeight: 900, lineHeight: 1 }}>{String(ticketNumber).padStart(3, '0')}</div>
        <div style={{ fontSize: '11px', fontWeight: 700, marginTop: '4px', opacity: 0.9 }}>
          {fmtCode(raffle.ticketPrefix, ticketNumber, raffle.totalTickets)}
        </div>
        
        {/* QR Code de Validación */}
        <div style={{ marginTop: 'auto', background: '#fff', padding: '4px', borderRadius: '4px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <QRCodeSVG 
            value={`${window.location.origin}/validar?c=${fmtCode(raffle.ticketPrefix, ticketNumber, raffle.totalTickets)}`} 
            size={44} 
            style={{ display: 'block', width: 44, height: 44 }}
          />
        </div>
      </div>
    </div>
  );
};

const TicketsContainer = ({ raffle, tickets, buyerName, date, format }) => {
  return (
    <div id="tickets-render-container" style={{ 
      display: 'flex', 
      flexWrap: 'wrap', 
      gap: '16px', 
      padding: '20px', 
      background: '#ffffff', 
      width: format === 'ticketera' ? '360px' : '720px' // Ticketera (1 col) vs A4 (2 cols)
    }}>
      {tickets.map(t => (
        <TicketView key={t} raffle={raffle} ticketNumber={t} buyerName={buyerName} date={date} />
      ))}
    </div>
  );
};

/**
 * Genera una imagen PNG con todos los tickets.
 */
export async function generateTicketsImage(raffle, tickets, buyerName, date = new Date(), format = 'a4') {
  const container = document.createElement('div');
  container.style.position = 'absolute';
  container.style.top = '-9999px';
  container.style.left = '-9999px';
  document.body.appendChild(container);

  return new Promise((resolve, reject) => {
    const root = createRoot(container);
    root.render(<TicketsContainer raffle={raffle} tickets={tickets} buyerName={buyerName} date={date} format={format} />);
    
    // Esperar a que React renderice
    setTimeout(async () => {
      try {
        const element = document.getElementById('tickets-render-container');
        const canvas = await html2canvas(element, { scale: 2, backgroundColor: '#ffffff' });
        const dataUrl = canvas.toDataURL('image/png');
        root.unmount();
        document.body.removeChild(container);
        resolve(dataUrl);
      } catch (err) {
        root.unmount();
        document.body.removeChild(container);
        reject(err);
      }
    }, 150); // tiempo para que React monte
  });
}

/**
 * Imprime los tickets. format = 'a4' | 'ticketera'
 */
export async function printTickets(raffle, tickets, buyerName, date = new Date(), format = 'a4') {
  try {
    const dataUrl = await generateTicketsImage(raffle, tickets, buyerName, date, format);
    
    const iframe = document.createElement('iframe');
    iframe.style.position = 'absolute';
    iframe.style.top = '-9999px';
    document.body.appendChild(iframe);
    
    const doc = iframe.contentWindow.document;
    doc.open();
    
    if (format === 'ticketera') {
      doc.write(`
        <html>
          <head>
            <style>
              @page { size: 80mm auto; margin: 0; }
              body { margin: 0; padding: 0; display: flex; flex-direction: column; align-items: center; background: #fff; }
              img { width: 75mm; object-fit: contain; margin-top: 5mm; }
            </style>
          </head>
          <body>
            <img src="${dataUrl}" />
            <script>
              window.onload = () => { window.print(); };
            </script>
          </body>
        </html>
      `);
    } else {
      doc.write(`
        <html>
          <head>
            <style>
              @page { size: A4; margin: 10mm; }
              body { margin: 0; display: flex; justify-content: center; align-items: flex-start; background: #fff; }
              img { max-width: 100%; height: auto; object-fit: contain; }
            </style>
          </head>
          <body>
            <img src="${dataUrl}" />
            <script>
              window.onload = () => { window.print(); };
            </script>
          </body>
        </html>
      `);
    }
    
    doc.close();
    
    // Eliminar el iframe después de un tiempo para no dejar basura
    setTimeout(() => {
      document.body.removeChild(iframe);
    }, 10000);
    
  } catch (err) {
    console.error('Error al imprimir', err);
    window.print(); // fallback
  }
}

/**
 * Abre el menú para compartir en WhatsApp (móvil) o descarga la imagen (PC).
 */
export async function shareWhatsAppImage(raffle, tickets, buyerName, buyerPhone, date = new Date()) {
  try {
    const dataUrl = await generateTicketsImage(raffle, tickets, buyerName, date, 'ticketera'); // Ticketera para movil se ve mejor
    const res = await fetch(dataUrl);
    const blob = await res.blob();
    const file = new File([blob], 'tickets-misio.png', { type: 'image/png' });
    
    const txt = `¡Hola ${buyerName}! 👋\n\nConfirmamos tu compra para el sorteo *${raffle.title}*.\n\n🎟️ *Boletos:* ${tickets.map(n => fmtCode(raffle.ticketPrefix, n, raffle.totalTickets)).join(', ')}\n\n¡Mucha suerte! 🍀`;

    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      await navigator.share({
        files: [file],
        title: 'Tus Boletos - Misio',
        text: txt
      });
    } else {
      // Fallback para PC: descargar la imagen y abrir wa.me
      const a = document.createElement('a');
      a.href = dataUrl;
      a.download = 'tickets-misio.png';
      a.click();
      
      const url = `https://wa.me/${buyerPhone.replace(/\D/g, '')}?text=${encodeURIComponent(txt + '\n\n(Tu imagen de boletos ha sido descargada)')}`;
      window.open(url, '_blank');
    }
  } catch (err) {
    console.error('Error al compartir', err);
    // fallback a texto
    const txt = `¡Hola ${buyerName}! 👋\n\nConfirmamos tu compra para el sorteo *${raffle.title}*.\n\n🎟️ *Boletos:* ${tickets.map(n => fmtCode(raffle.ticketPrefix, n, raffle.totalTickets)).join(', ')}\n\n¡Mucha suerte! 🍀`;
    const url = `https://wa.me/${buyerPhone.replace(/\D/g, '')}?text=${encodeURIComponent(txt)}`;
    window.open(url, '_blank');
  }
}
