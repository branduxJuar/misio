import React, { useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { Card, Typography, Tag, Alert, Result, Progress } from 'antd';
import { LockFilled, ThunderboltFilled, ClockCircleOutlined } from '@ant-design/icons';
import { MISIO_COLORS } from '../../theme/misioTheme';
import { api } from '../../auth/api';

const { Title, Text } = Typography;

/**
 * SPRINT 2 — LISTA PÚBLICA DE BOLETOS (/lista/:raffleId?t=TOKEN).
 *
 * - El token dura 5 MINUTOS y solo se genera desde la web Misio. Si
 *   alguien comparte el link después, el token venció → candado.
 * - Nombres PARCIALMENTE ocultos: BRAN… JUA… + código del boleto.
 * - Disuasores: no imprimible (CSS @media print), sin clic derecho,
 *   sin selección de texto y bloqueo de atajos (F12, Ctrl+P/S/U,
 *   Ctrl+Shift+I/J/C). Nota técnica: son DISUASORES del lado del
 *   cliente; la protección real es que el token muere en 5 min y los
 *   nombres ya viajan enmascarados desde el servidor.
 */
export default function PublicTicketList() {
  const { raffleId } = useParams();
  const [params] = useSearchParams();
  const token = params.get('t');

  const [data, setData] = useState(null);
  const [expired, setExpired] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(300);

  // ── Cargar la lista (el servidor valida el token) ────────────────
  useEffect(() => {
    if (!token) return setExpired(true);
    api(`/raffles/${raffleId}/public-tickets?t=${encodeURIComponent(token)}`)
      .then(setData)
      .catch(() => setExpired(true));
  }, [raffleId, token]);

  // ── Cuenta regresiva: al llegar a 0 la lista se oculta ───────────
  useEffect(() => {
    if (!data) return undefined;
    const timer = setInterval(() => {
      setSecondsLeft((s) => {
        if (s <= 1) { setExpired(true); setData(null); clearInterval(timer); return 0; }
        return s - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [data]);

  // ── Disuasores: impresión, clic derecho, atajos, selección ───────
  useEffect(() => {
    const style = document.createElement('style');
    style.id = 'misio-public-lock';
    style.textContent = `
      @media print { body { display: none !important; } }
      .misio-public-list, .misio-public-list * {
        user-select: none !important; -webkit-user-select: none !important;
      }
    `;
    document.head.appendChild(style);

    const noContext = (e) => e.preventDefault();
    const noKeys = (e) => {
      const k = e.key?.toLowerCase();
      const blocked =
        k === 'f12' ||
        (e.ctrlKey && ['p', 's', 'u'].includes(k)) ||
        (e.ctrlKey && e.shiftKey && ['i', 'j', 'c'].includes(k)) ||
        (e.metaKey && ['p', 's'].includes(k));
      if (blocked) { e.preventDefault(); e.stopPropagation(); }
    };
    document.addEventListener('contextmenu', noContext);
    document.addEventListener('keydown', noKeys, true);
    return () => {
      document.getElementById('misio-public-lock')?.remove();
      document.removeEventListener('contextmenu', noContext);
      document.removeEventListener('keydown', noKeys, true);
    };
  }, []);

  // ── Candado: sin token, vencido o inválido ───────────────────────
  if (expired || !token) {
    return (
      <Result
        icon={<LockFilled style={{ color: MISIO_COLORS.danger }} />}
        title="Este enlace ya no está disponible"
        subTitle="Los enlaces de la lista de participantes duran solo 5 minutos y se generan únicamente desde la web de Misio. Pide a quien te lo compartió que genere uno nuevo, o entra directamente a misio."
      />
    );
  }

  if (!data) {
    return <Alert type="info" showIcon message="Verificando enlace…" />;
  }

  const mins = Math.floor(secondsLeft / 60);
  const secs = String(secondsLeft % 60).padStart(2, '0');

  return (
    <div className="misio-public-list">
      {/* Cabecera con cuenta regresiva del token */}
      <Card style={{ marginBottom: 16 }}>
        <Title level={4} style={{ margin: 0 }}>
          <ThunderboltFilled style={{ color: MISIO_COLORS.primary }} /> {data.raffle.title}
        </Title>
        <Text style={{ color: MISIO_COLORS.textMuted }}>
          Lista oficial de participantes · {data.raffle.soldTickets} / {data.raffle.totalTickets} boletos vendidos
          · Sorteo: {new Date(data.raffle.drawDate).toLocaleString('es-PE')}
        </Text>
        <div style={{ marginTop: 12 }}>
          <Tag color={secondsLeft < 60 ? MISIO_COLORS.danger : MISIO_COLORS.electricBlue}>
            <ClockCircleOutlined /> Enlace válido por {mins}:{secs}
          </Tag>
          <Progress
            percent={Math.round((secondsLeft / 300) * 100)}
            showInfo={false}
            size="small"
            strokeColor={secondsLeft < 60 ? MISIO_COLORS.danger : MISIO_COLORS.electricBlue}
          />
        </div>
      </Card>

      {/* Lista: NOMBRE PARCIAL + #CÓDIGO */}
      <Card title="🎟️ Boletos vendidos">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 8 }}>
          {data.tickets.map((t) => (
            <div
              key={t.code}
              style={{
                padding: '8px 10px', borderRadius: 10, background: MISIO_COLORS.bgElevated,
                border: `1px solid ${MISIO_COLORS.bgElevated}`,
              }}
            >
              <Text style={{ fontSize: 12, color: MISIO_COLORS.textMuted, display: 'block' }}>
                {t.holder}
              </Text>
              <Text code style={{ fontSize: 12 }}>{t.code}</Text>
            </div>
          ))}
        </div>
        <Text style={{ fontSize: 11, color: MISIO_COLORS.textMuted, display: 'block', marginTop: 16, textAlign: 'center' }}>
          Nombres parcialmente ocultos por privacidad · Página de solo lectura, no imprimible · Misio ⚡ Cero Pérdida
        </Text>
      </Card>
    </div>
  );
}
