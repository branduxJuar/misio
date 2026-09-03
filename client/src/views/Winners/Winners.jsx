import React from 'react';
import { Card, Col, Row, Typography, Tag, Image, Empty, Alert } from 'antd';
import { TrophyFilled, CheckCircleFilled } from '@ant-design/icons';
import dayjs from 'dayjs';
import 'dayjs/locale/es';
dayjs.locale('es');
import { MISIO_COLORS } from '../../theme/misioTheme';
import { useApiOrMock } from '../../hooks/useApiOrMock';
import { SERVER_URL } from '../../auth/api';
import { maskName } from '../../utils/mask';

const { Title, Text } = Typography;

const MOCK_WINNERS = [
  { raffleId: 'w1', title: 'PlayStation 5 Slim', image: '',
    winner: { code: 'PS500004', name: 'Brand.... Juar....' },
    delivery: { status: 'delivered', evidencePhotoUrl: '' },
    updatedAt: new Date().toISOString(), totalTickets: 100 },
  { raffleId: 'w2', title: 'S/ 1,500 en efectivo', image: '',
    winner: { code: 'CASH0102', name: 'Maria.... Fern....' },
    delivery: { status: 'transit', evidencePhotoUrl: '' },
    updatedAt: new Date(Date.now() - 86400e3).toISOString(), totalTickets: 300 },
];

const DELIVERY_TAG = {
  delivered: <Tag color="success"><CheckCircleFilled /> Entregado</Tag>,
  transit: <Tag color="processing">🚚 En camino</Tag>,
  in_stock: <Tag>Coordinando entrega</Tag>,
};

/**
 * 🏆 GANADORES (/ganadores, público) — la vitrina de confianza:
 * cada sorteo completado con su ganador (nombre parcialmente oculto,
 * enmascarado desde el servidor), el código del boleto y, cuando el ERP
 * la registra, la FOTO de la entrega. Nada vende más que premios reales.
 */
export default function Winners() {
  const { data: winners, demo } = useApiOrMock('/raffles/winners', MOCK_WINNERS);

  const groupedWinners = React.useMemo(() => {
    const groups = {};
    winners.forEach(w => {
      const monthYear = dayjs(w.updatedAt).format('MMMM YYYY');
      const capitalized = monthYear.charAt(0).toUpperCase() + monthYear.slice(1);
      if (!groups[capitalized]) groups[capitalized] = [];
      groups[capitalized].push(w);
    });
    return Object.entries(groups);
  }, [winners]);

  return (
    <div>
      <div style={{ textAlign: 'center', margin: '8px 0 32px' }}>
        <Title level={2} style={{ marginBottom: 4, letterSpacing: '-0.02em' }}>
          <TrophyFilled style={{ color: MISIO_COLORS.prizeGold, marginRight: 8 }} />
          Ganadores
        </Title>
      </div>

      {demo && (
        <Alert type="info" showIcon style={{ marginBottom: 16 }}
          message="Modo demo: ganadores ficticios (backend no conectado)." />
      )}

      {winners.length === 0 ? (
        <Empty description="Los primeros ganadores aparecerán aquí después del primer sorteo." />
      ) : (
        <div>
          {groupedWinners.map(([monthLabel, groupWinners]) => (
            <div key={monthLabel} style={{ marginBottom: 40 }}>
              <Title level={4} style={{ color: MISIO_COLORS.textMuted, borderBottom: `1px solid ${MISIO_COLORS.border}`, paddingBottom: 8, marginBottom: 20 }}>
                Ganadores de {monthLabel}
              </Title>
              <Row gutter={[16, 16]}>
                {groupWinners.map((w, idx) => (
                  <Col xs={24} sm={12} lg={6} key={w._id || idx} style={{ display: 'flex' }}>
                      <Card
                        hoverable
                        className="z-raffle-card"
                        style={{ width: '100%', background: '#ffffff', border: 'none', borderRadius: 24, height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden', boxShadow: '0 12px 32px rgba(0,0,0,0.06)' }}
                        styles={{ body: { padding: 0, display: 'flex', flexDirection: 'column', flex: 1 } }}
                      >
                        <div className="z-img-wrapper">
                          {(w.delivery?.evidencePhotoUrl || w.evidencePhotoUrl) ? (
                            <img
                              src={`${SERVER_URL}${(w.delivery?.evidencePhotoUrl || w.evidencePhotoUrl)}`}
                              alt={w.title}
                              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                            />
                          ) : (
                            <div className="z-card-placeholder" style={{ width: '100%', height: '100%', borderRadius: 0, display: 'flex', justifyContent: 'center', alignItems: 'center', fontSize: 48, background: '#f1f5f9' }}>
                              🏆
                            </div>
                          )}
                        </div>

                        <div className="z-card-body">
                          <Title level={4} style={{ margin: 0, fontWeight: 900, fontSize: 20, letterSpacing: -0.5, lineHeight: 1.2, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                            {w.title}
                          </Title>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 8, color: MISIO_COLORS.textMuted }}>
                            <TrophyFilled style={{ color: MISIO_COLORS.prizeGold }} />
                            <Text style={{ fontSize: 13, fontWeight: 500 }}>
                              {dayjs(w.updatedAt).format('DD de MMMM')}
                            </Text>
                          </div>

                          <div style={{ marginTop: 'auto', paddingTop: 20 }}>
                            <div style={{ background: '#f8fafc', padding: '12px 16px', borderRadius: 12, border: '1px dashed #cbd5e1' }}>
                              <Text type="secondary" style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, display: 'block', marginBottom: 4 }}>Boleto Ganador</Text>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                <Text code style={{ fontSize: 14, fontWeight: 800, margin: 0 }}>
                                  #{w.winner?.code ?? w.winnerCode ?? '—'}
                                </Text>
                                <Text className="prize-glow" style={{ fontSize: 15, fontWeight: 800 }}>
                                  {maskName(w.winner?.name ?? w.winnerName ?? '—')}
                                </Text>
                              </div>
                            </div>
                          </div>
                        </div>

                        {/* Franja Inferior Estado de Entrega */}
                        <div style={{ 
                          background: (w.delivery?.status === 'delivered') ? '#10b981' : (w.delivery?.status === 'transit') ? '#3b82f6' : '#f1f5f9',
                          padding: '12px 24px',
                          display: 'flex',
                          justifyContent: 'center',
                          alignItems: 'center'
                        }}>
                          <Text style={{ 
                            color: (w.delivery?.status === 'delivered' || w.delivery?.status === 'transit') ? '#fff' : '#64748b',
                            fontWeight: 800,
                            fontSize: 13,
                            textTransform: 'uppercase',
                            letterSpacing: 0.5
                          }}>
                            {(w.delivery?.status === 'delivered') ? 'Premio Entregado ✓' : (w.delivery?.status === 'transit') ? 'En Camino 🚚' : 'Coordinando entrega ⏳'}
                          </Text>
                        </div>
                      </Card>
                  </Col>
                ))}
              </Row>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
