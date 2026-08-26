import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Card, Col, Row, Progress, Tag, Button, Typography, Space, Badge, message, Alert, Collapse, Divider, Statistic
} from 'antd';
import {
  ThunderboltFilled, FireFilled, SafetyCertificateFilled, WalletFilled, LeftOutlined, RightOutlined
} from '@ant-design/icons';
import { MOCK_RAFFLES } from '../../mocks/mockData';
import { MISIO_COLORS } from '../../theme/misioTheme';
import { useAuth } from '../../auth/AuthContext';
import { useApiOrMock } from '../../hooks/useApiOrMock';
import { SERVER_URL } from '../../auth/api';
import { useSite } from '../../theme/SiteProvider';

const { Title, Text, Paragraph } = Typography;


export default function MarketplaceLanding() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [msgApi, contextHolder] = message.useMessage();
  const site = useSite();
  // El fondo de polaroids fue removido por ser visualmente recargado
  // Se usará un mesh gradient limpio en su lugar.

  // Rifas reales (GET /raffles incluye soldTickets del aggregate) o mock
  const { data: raffles, demo, refresh } = useApiOrMock('/raffles', MOCK_RAFFLES);

  const [selectedMonthKey, setSelectedMonthKey] = useState('all');
  const scrollRef = React.useRef(null);

  const scrollMonths = (offset) => {
    if (scrollRef.current) {
      scrollRef.current.scrollBy({ left: offset, behavior: 'smooth' });
    }
  };

  const { months, filteredRaffles } = React.useMemo(() => {
    if (!raffles || raffles.length === 0) return { months: [], filteredRaffles: [] };
    
    const monthMap = new Map();
    raffles.forEach(r => {
      if (!r.drawDate) return;
      const d = new Date(r.drawDate);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const name = d.toLocaleString('es-ES', { month: 'long' });
      if (!monthMap.has(key)) {
        monthMap.set(key, { key, name, year: d.getFullYear() });
      }
    });

    const sortedMonths = Array.from(monthMap.values()).sort((a, b) => a.key.localeCompare(b.key));
    
    const filtered = selectedMonthKey === 'all' 
      ? raffles 
      : raffles.filter(r => {
          if (!r.drawDate) return false;
          const d = new Date(r.drawDate);
          const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
          return key === selectedMonthKey;
        });

    return { months: sortedMonths, filteredRaffles: filtered };
  }, [raffles, selectedMonthKey]);

  /** El flujo correcto: entrar al detalle y elegir números en la grilla. */
  const openDetail = (raffle) => navigate(`/rifa/${raffle._id}`);




  return (
    <div>
      {contextHolder}

      {demo && (
        <Alert
          type="info"
          showIcon
          message="Modo demo: viendo datos ficticios (backend no conectado)."
          style={{ marginBottom: 16 }}
        />
      )}

      {/* ── Hero: propuesta de valor Cashback (rediseño UX) ───── */}
      <div className="full-bleed-hero fade-in-up" style={{
        background: `
          radial-gradient(circle at 15% 50%, rgba(13, 148, 136, 0.12), transparent 50%),
          radial-gradient(circle at 85% 30%, rgba(2, 132, 199, 0.12), transparent 50%),
          url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%230f172a' fill-opacity='0.03'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")
        `
      }}>

        <div style={{ position: 'relative', zIndex: 10 }}>
          <Title style={{ marginBottom: 4, fontSize: 'clamp(28px, 5vw, 48px)', textTransform: 'uppercase', fontWeight: 900 }}>
            <span style={{ color: '#0f172a' }}>Sorteos donde</span><br/><span className="gradient-animate">nunca pierdes</span>
          </Title>
          <Paragraph style={{ color: '#475569', fontSize: 15, maxWidth: 560, margin: '0 auto' }}>
            Si tu boleto no gana, una parte de su valor vuelve como saldo de canje
            para nuestra tienda. Sin letra chica.
          </Paragraph>
        </div>
      </div>
      <div id="sorteos" />

      {/* ── Filtro de meses ─────────────────────────────────── */}
      {months.length > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, marginBottom: 16 }}>
          <Button type="text" shape="circle" icon={<LeftOutlined />} onClick={() => scrollMonths(-200)} style={{ color: MISIO_COLORS.textMuted }} />
          
          <div 
            ref={scrollRef}
            style={{
              display: 'flex',
              overflowX: 'auto',
              scrollbarWidth: 'none',
              msOverflowStyle: 'none',
              maxWidth: 'calc(100vw - 120px)'
            }} 
            className="hide-scrollbar"
          >
            <style>{`.hide-scrollbar::-webkit-scrollbar { display: none; }`}</style>
            <div style={{ display: 'flex', gap: 12, margin: '0 auto', width: 'max-content', padding: '0 8px' }}>
            
            <div
              onClick={() => setSelectedMonthKey('all')}
              style={{
                flexShrink: 0,
                padding: '0 16px',
                height: 44,
                color: selectedMonthKey === 'all' ? 'var(--z-primary)' : 'var(--z-text-muted)',
                borderBottom: `2px solid ${selectedMonthKey === 'all' ? 'var(--z-primary)' : 'transparent'}`,
                display: 'flex',
                alignItems: 'center',
                cursor: 'pointer',
                transition: 'all 0.2s ease',
              }}
            >
              <div style={{ fontSize: 14, fontWeight: 700, letterSpacing: 0.5, textTransform: 'uppercase' }}>Todos los sorteos</div>
            </div>

            {months.map(m => {
              const isActive = selectedMonthKey === m.key;
              return (
                <div
                  key={m.key}
                  onClick={() => setSelectedMonthKey(m.key)}
                  style={{
                    flexShrink: 0,
                    padding: '0 16px',
                    height: 44,
                    color: isActive ? 'var(--z-primary)' : 'var(--z-text-muted)',
                    borderBottom: `2px solid ${isActive ? 'var(--z-primary)' : 'transparent'}`,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    cursor: 'pointer',
                    transition: 'all 0.2s ease',
                  }}
                >
                  <div style={{
                    fontSize: 14, 
                    fontWeight: 700,
                    textTransform: 'uppercase',
                    letterSpacing: 0.5
                  }}>
                    {m.name}
                  </div>
                  <div style={{ fontSize: 14, fontWeight: 500, opacity: isActive ? 1 : 0.6 }}>
                    {m.year}
                  </div>
                </div>
              );
            })}
            </div>
          </div>
          
          <Button type="text" shape="circle" icon={<RightOutlined />} onClick={() => scrollMonths(200)} style={{ color: MISIO_COLORS.textMuted }} />
        </div>
      )}

      {/* ── Grid de rifas activas ─────────────────────────────────── */}
      <Row gutter={[20, 20]}>
        {filteredRaffles.map((raffle) => {
          const sold = raffle.soldTickets ?? 0;
          const soldPct = Math.round((sold / raffle.totalTickets) * 100);
          const isLive = raffle.status === 'live';
          const quedan = Math.max(0, (raffle.totalTickets ?? 0) - sold);

          return (
            <Col xs={24} sm={12} lg={6} key={raffle._id} className="fade-in-up" style={{ animationDelay: '0.2s' }}>
              <Card
                hoverable
                className={`z-raffle-card${isLive ? ' hot' : ''}`}
                onClick={() => (isLive ? navigate(`/en-vivo/${raffle._id}`) : openDetail(raffle))}
                style={{ background: '#ffffff', border: 'none', borderRadius: 24, height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden', boxShadow: '0 12px 32px rgba(0,0,0,0.06)' }}
                styles={{ body: { padding: 0, display: 'flex', flexDirection: 'column', flex: 1 } }}
              >
                {/* 1. Imagen cabecera de borde a borde */}
                <div className="z-img-wrapper">
                  {raffle.images?.length > 0 ? (
                    <img
                      src={`${SERVER_URL}${raffle.images[0]}`}
                      alt={raffle.title}
                      style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                    />
                  ) : (
                    <div className="z-card-placeholder" style={{ width: '100%', height: '100%', borderRadius: 0 }}>
                      {raffle.emoji ?? '🎁'}
                    </div>
                  )}
                  {/* Badges Flotantes */}
                  {raffle.type === 'paquete' && (
                    <div style={{ position: 'absolute', top: isLive ? 48 : 16, left: 16 }}>
                      <span className="z-pill" style={{ background: MISIO_COLORS.electricBlue, color: '#fff', padding: '2px 8px', fontSize: 10, fontWeight: 800, boxShadow: '0 2px 8px rgba(0,0,0,0.2)', display: 'inline-flex', alignItems: 'center', gap: 4 }}>📦 {raffle.prizes?.length || 2} PREMIOS</span>
                    </div>
                  )}
                  <div style={{ position: 'absolute', top: 16, right: 16, display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6 }}>
                    {!isLive && quedan <= 30 && quedan > 0 && (
                      <span className="z-pill gold" style={{ background: MISIO_COLORS.prizeGold, color: '#fff', padding: '2px 8px', fontSize: 10, fontWeight: 800, boxShadow: '0 2px 8px rgba(0,0,0,0.2)', display: 'inline-flex', alignItems: 'center', gap: 4 }}>🔥 ¡Últimos {quedan}!</span>
                    )}
                    {raffle.drawDate && (
                      <div className="mini-countdown" style={{ 
                        display: 'inline-flex', 
                        alignItems: 'center', 
                        background: 'rgba(15, 23, 42, 0.75)',
                        backdropFilter: 'blur(4px)',
                        padding: '2px 8px',
                        borderRadius: 100,
                        gap: 4,
                        whiteSpace: 'nowrap',
                        boxShadow: '0 2px 8px rgba(0,0,0,0.2)'
                      }}>
                        <style>{`
                          .mini-countdown .ant-statistic-content, 
                          .mini-countdown .ant-statistic-content-value {
                            font-size: 10px !important;
                            line-height: 1 !important;
                            color: #ffffff !important;
                            font-weight: 800 !important;
                            font-variant-numeric: tabular-nums;
                            margin: 0 !important;
                            padding: 0 !important;
                          }
                          .mini-countdown .ant-statistic {
                            line-height: 1 !important;
                          }
                        `}</style>
                        <span style={{ fontSize: 9 }}>⏳</span>
                        <Statistic.Countdown
                          value={new Date(raffle.drawDate).getTime()}
                          format="D[d] HH:mm:ss"
                        />
                      </div>
                    )}
                  </div>
                </div>

                {/* 2. Cuerpo del contenido */}
                <div className="z-card-body">
                  <div>
                    <Title level={4} style={{ margin: 0, color: '#0f172a', fontWeight: 900, lineHeight: 1.2 }}>{raffle.title}</Title>
                    {raffle.drawDate && (
                      <div style={{ marginTop: 8 }}>
                        <Text style={{ fontSize: 14, color: '#64748b', display: 'flex', alignItems: 'center', gap: 6 }}>
                          📅 Sorteo: {new Date(raffle.drawDate).toLocaleDateString('es-ES', { day: 'numeric', month: 'long' })}
                        </Text>
                      </div>
                    )}
                  </div>

                  <div style={{ marginTop: 'auto' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 12 }}>
                      <div>
                        <Text style={{ fontSize: 11, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 1, fontWeight: 700, display: 'block', marginBottom: 4 }}>
                          Boleto
                        </Text>
                        <div className="z-price-text gradient-animate">
                          S/ {raffle.ticketPrice}
                        </div>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <Text style={{ fontSize: 14, color: '#0f172a', fontWeight: 800, display: 'block' }}>{soldPct}% vendido</Text>
                        <Text style={{ fontSize: 13, color: '#64748b', display: 'block' }}>quedan {quedan}</Text>
                      </div>
                    </div>
                    
                    <Progress
                      percent={soldPct}
                      showInfo={false}
                      size={['100%', 8]}
                      strokeColor={soldPct > 80 ? { from: MISIO_COLORS.danger, to: MISIO_COLORS.prizeGold } : { from: MISIO_COLORS.primary, to: MISIO_COLORS.electricBlue }}
                      trailColor="#f1f5f9"
                    />
                  </div>
                </div>

                {isLive ? (
                  <Button type="primary" danger block size="large"
                    onClick={(e) => { e.stopPropagation(); navigate(`/en-vivo/${raffle._id}`); }} 
                    style={{ height: 64, borderRadius: 0, fontSize: 16, fontWeight: 800, border: 'none', letterSpacing: 0.5 }}>
                    🔴 ENTRAR AL SORTEO EN VIVO
                  </Button>
                ) : (
                  <Button type="primary" block size="large" className="btn-marketero"
                    onClick={(e) => { e.stopPropagation(); openDetail(raffle); }} 
                    style={{ height: 64, borderRadius: 0, fontSize: 16, fontWeight: 800, border: 'none', letterSpacing: 0.5 }}>
                    ELEGIR MI NÚMERO →
                  </Button>
                )}
              </Card>
            </Col>
          );
        })}
      </Row>

      <Divider style={{ margin: '60px 0' }} />

      {/* ── CÓMO FUNCIONA ─────────────────────────────────────────── */}
      <div id="como-funciona" style={{ marginBottom: 60 }}>
        <Title level={2} style={{ textAlign: 'center', marginBottom: 40, textTransform: 'uppercase', fontWeight: 900 }}>
          ¿Cómo funciona Misio?
        </Title>
        <Row gutter={[24, 24]}>
          {[
            {
              step: '1', title: 'Compra tu boleto', 
              desc: 'Elige tu número de la suerte en cualquiera de nuestros sorteos activos usando tu método de pago favorito (Yape, Plin, Tarjeta).'
            },
            {
              step: '2', title: 'Mira el Sorteo en Vivo', 
              desc: 'Nuestros sorteos son 100% transparentes. Conéctate a la transmisión en vivo y mira cómo sale el número ganador.'
            },
            {
              step: '3', title: 'Cashback si no ganas', 
              desc: 'Aquí nadie pierde. Si tu número no sale, un porcentaje del valor de tu boleto vuelve a tu cuenta como saldo para usar en nuestra tienda.'
            }
          ].map((item, idx) => (
            <Col xs={24} md={8} key={idx}>
              <Card className="glass-card" style={{ height: '100%', textAlign: 'center' }} styles={{ body: { padding: '40px 24px' }}}>
                <div style={{
                  width: 60, height: 60, borderRadius: '50%', background: 'var(--z-primary)', color: '#fff',
                  fontSize: 28, fontWeight: 900, display: 'flex', alignItems: 'center', justifyContent: 'center',
                  margin: '0 auto 20px', boxShadow: '0 10px 20px rgba(139, 92, 246, 0.4)'
                }}>
                  {item.step}
                </div>
                <Title level={4} style={{ textTransform: 'uppercase', fontWeight: 800 }}>{item.title}</Title>
                <Paragraph style={{ color: 'var(--z-text-muted)', fontSize: 15 }}>
                  {item.desc}
                </Paragraph>
              </Card>
            </Col>
          ))}
        </Row>
      </div>

      {/* ── PREGUNTAS FRECUENTES (FAQ) ────────────────────────────── */}
      <div style={{ maxWidth: 800, margin: '0 auto 60px' }}>
        <Title level={3} style={{ textAlign: 'center', marginBottom: 30, textTransform: 'uppercase', fontWeight: 900 }}>
          Preguntas Frecuentes
        </Title>
        <Collapse 
          accordion 
          size="large"
          bordered={false}
          style={{ background: 'transparent' }}
          items={[
            {
              key: '1',
              label: <Text strong style={{ fontSize: 16 }}>¿Es verdad que nunca pierdo?</Text>,
              children: <Paragraph style={{ color: 'var(--z-text-muted)', margin: 0 }}>Sí. A diferencia de las rifas tradicionales donde si pierdes tu dinero desaparece, en Misio te devolvemos una porción de tu dinero en forma de "Saldo de Canje". Puedes acumular ese saldo para reclamar productos reales de nuestra tienda.</Paragraph>
            },
            {
              key: '2',
              label: <Text strong style={{ fontSize: 16 }}>¿Cómo me entregan el premio si gano?</Text>,
              children: <Paragraph style={{ color: 'var(--z-text-muted)', margin: 0 }}>Si resultas ganador, nos pondremos en contacto contigo de inmediato al número registrado en tu cuenta. Los premios físicos se envían a todo el Perú mediante encomienda segura, y los premios en efectivo se transfieren al instante.</Paragraph>
            },
            {
              key: '3',
              label: <Text strong style={{ fontSize: 16 }}>¿Cómo recargo mi billetera para comprar?</Text>,
              children: <Paragraph style={{ color: 'var(--z-text-muted)', margin: 0 }}>Puedes recargar "Saldo Contable" desde tu perfil utilizando transferencias bancarias, Yape o Plin. Una vez tu recarga es aprobada (toma unos minutos), podrás comprar boletos con 1 solo clic.</Paragraph>
            }
          ]}
        />
      </div>

    </div>
  );
}
