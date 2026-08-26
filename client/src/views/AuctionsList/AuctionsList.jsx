import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Card, Col, Row, Typography, Tag, Button, message, Alert, Empty, Statistic,
  Image, Result,
} from 'antd';
import {
  FireFilled, ClockCircleOutlined, CheckCircleFilled, BellOutlined,
  CrownFilled, LoginOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import { MISIO_COLORS } from '../../theme/misioTheme';
import { useAuth } from '../../auth/AuthContext';
import { useApiOrMock } from '../../hooks/useApiOrMock';
import { api, SERVER_URL } from '../../auth/api';

const { Title, Text, Paragraph } = Typography;
const { Timer } = Statistic;

/**
 * 🔨 SUBASTAS (/subastas) — listado tipo sorteos, pero con MATRÍCULA:
 *  - scheduled: countdown al arranque + "Matricularme" (el sistema te
 *    avisa 15 min antes y al empezar).
 *  - live: SOLO los matriculados pueden entrar a la sala de pujas.
 *  - finished: ganador con su puja.
 * Si el admin desactiva el módulo (interruptor de emergencia), esta
 * página muestra el aviso y nada más.
 */
export default function AuctionsList() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [msgApi, contextHolder] = message.useMessage();
  const { data: flag } = useApiOrMock('/auctions/flag', { enabled: false });
  const { data: auctions, demo, refresh } = useApiOrMock(
    flag.enabled ? '/auctions' : null, [],
  );
  const [enrolling, setEnrolling] = useState(null);

  if (!flag.enabled) {
    return (
      <Result
        icon={<span style={{ fontSize: 56 }}>🔨</span>}
        title="Las subastas están en pausa"
        subTitle="Estamos preparando la próxima tanda. Vuelve pronto — cuando abran, podrás matricularte y te avisaremos antes de cada arranque."
      />
    );
  }

  const enroll = async (a) => {
    if (!user) {
      msgApi.info('Inicia sesión para matricularte en la subasta.');
      return navigate('/login', { state: { from: '/subastas' } });
    }
    setEnrolling(a._id);
    try {
      await api(`/auctions/${a._id}/enroll`, { method: 'POST' });
      msgApi.success('¡Matriculado! Te avisaremos 15 minutos antes y al arrancar. 🔔', 6);
      refresh();
    } catch (err) { msgApi.error(err.message); } finally { setEnrolling(null); }
  };

  const STATUS_ORDER = { live: 0, scheduled: 1, finished: 2, cancelled: 3 };
  const sorted = [...auctions].sort(
    (a, b) => (STATUS_ORDER[a.status] ?? 9) - (STATUS_ORDER[b.status] ?? 9),
  );

  return (
    <div>
      {contextHolder}
      <div style={{ textAlign: 'center', margin: '8px 0 24px' }}>
        <Title level={2} style={{ marginBottom: 4 }}>🔨 Subastas Misio</Title>
        <Text style={{ color: MISIO_COLORS.textMuted }}>
          Matricúlate, te avisamos cuando empiece, y puja en tiempo real con tu
          saldo contable — tu puja queda retenida hasta que alguien te supere.
        </Text>
      </div>

      {demo && (
        <Alert type="info" showIcon style={{ marginBottom: 16 }}
          message="Modo demo (backend no conectado)." />
      )}

      {sorted.length === 0 ? (
        <Empty description="Aún no hay subastas programadas — vuelve pronto." />
      ) : (
        <Row gutter={[16, 16]}>
          {sorted.map((a) => (
            <Col xs={24} sm={12} lg={8} key={a._id} className="fade-in-up" style={{ animationDelay: '0.2s' }}>
              <Card 
                hoverable
                className={`z-raffle-card${a.status === 'live' ? ' hot' : ''}`}
                style={{ background: '#ffffff', border: 'none', borderRadius: 24, height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden', boxShadow: '0 12px 32px rgba(0,0,0,0.06)' }}
                styles={{ body: { padding: 0, display: 'flex', flexDirection: 'column', flex: 1 } }}
              >
                {/* 1. Imagen de borde a borde */}
                <div className="z-img-wrapper">
                  {a.images?.length > 0 ? (
                    <Image src={`${SERVER_URL}${a.images[0]}`} alt={a.title} preview={false}
                      style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  ) : (
                    <div className="z-card-placeholder" style={{ width: '100%', height: '100%', borderRadius: 0, fontSize: 64 }}>
                      {a.emoji ?? '🔨'}
                    </div>
                  )}
                  {/* Badges flotantes */}
                  <div style={{ position: 'absolute', top: 16, left: 16, display: 'flex', gap: 8 }}>
                    {a.status === 'live' && <span className="z-pill" style={{ background: MISIO_COLORS.danger, color: '#fff', padding: '6px 14px', fontSize: 12, fontWeight: 800 }}>🔴 EN VIVO</span>}
                    {a.mode === 'moderated' && <span className="z-pill" style={{ background: '#a855f7', color: '#fff', padding: '6px 14px', fontSize: 12, fontWeight: 800 }}>🎙️ Moderada</span>}
                    {a.status === 'scheduled' && <span className="z-pill" style={{ background: MISIO_COLORS.electricBlue, color: '#fff', padding: '6px 14px', fontSize: 12, fontWeight: 800 }}>Programada</span>}
                    {a.status === 'finished' && <span className="z-pill" style={{ background: '#64748b', color: '#fff', padding: '6px 14px', fontSize: 12, fontWeight: 800 }}>Finalizada</span>}
                    {a.status === 'cancelled' && <span className="z-pill" style={{ background: '#475569', color: '#fff', padding: '6px 14px', fontSize: 12, fontWeight: 800 }}>Cancelada</span>}
                  </div>
                </div>

                {/* 2. Cuerpo del contenido */}
                <div className="z-card-body">
                  <div>
                    <Title level={4} style={{ margin: 0, color: '#0f172a', fontWeight: 900, lineHeight: 1.2 }}>{a.title}</Title>
                    {a.description && (
                      <Paragraph style={{ color: '#64748b', fontSize: 13, marginTop: 8, marginBottom: 0 }} ellipsis={{ rows: 2 }}>
                        {a.description}
                      </Paragraph>
                    )}
                  </div>

                  <div style={{ marginTop: 'auto' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 12 }}>
                      <div>
                        <Text style={{ fontSize: 11, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 1, fontWeight: 700, display: 'block', marginBottom: 4 }}>
                          {a.currentBid ? 'Puja actual' : 'Precio base'}
                        </Text>
                        <div className="z-price-text gradient-animate">
                          S/ {(a.currentBid?.amount ?? a.basePrice).toLocaleString('es-PE')}
                        </div>
                        {a.currentBid && (
                          <Text style={{ fontSize: 12, color: '#64748b', marginTop: 4, display: 'block' }}>
                            <CrownFilled style={{ color: MISIO_COLORS.prizeGold }} /> {a.currentBid.name}
                          </Text>
                        )}
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <Text style={{ fontSize: 14, color: '#0f172a', fontWeight: 800, display: 'block' }}>
                          {a.status === 'scheduled' ? 'Arranca en' : a.status === 'live' ? 'Cierra en' : 'Pujas'}
                        </Text>
                        {a.status === 'scheduled' && (
                          <Timer type="countdown" value={dayjs(a.startAt).valueOf()} format="D[d] HH:mm:ss"
                            valueStyle={{ fontSize: 13, color: '#64748b', lineHeight: 1 }}
                            onFinish={refresh} />
                        )}
                        {a.status === 'live' && (
                          <Timer type="countdown" value={dayjs(a.endAt).valueOf()} format="HH:mm:ss"
                            valueStyle={{ fontSize: 13, color: MISIO_COLORS.danger, lineHeight: 1 }}
                            onFinish={refresh} />
                        )}
                        {['finished', 'cancelled'].includes(a.status) && (
                          <Text style={{ fontSize: 13, color: '#64748b', display: 'block' }}>{a.bidsCount} pujas</Text>
                        )}
                      </div>
                    </div>

                    <div style={{ background: '#f1f5f9', height: 8, borderRadius: 100, width: '100%', marginBottom: 16 }}></div>

                    <Text style={{ fontSize: 13, color: '#64748b', display: 'block', textAlign: 'center' }}>
                      👥 {a.enrolledCount} matriculado{a.enrolledCount === 1 ? '' : 's'}
                      {a.buyNowPrice ? ` · Cómpralo ya: S/ ${a.buyNowPrice.toLocaleString('es-PE')}` : ''}
                    </Text>
                  </div>
                </div>

                {/* ── Botón de acción Edge-to-Edge ── */}
                {a.status === 'scheduled' && (
                  a.amIEnrolled ? (
                    <Button block disabled
                      style={{ height: 64, borderRadius: 0, fontSize: 16, fontWeight: 800, border: 'none', letterSpacing: 0.5, color: MISIO_COLORS.saldoGreen, background: '#f0fdf4' }}>
                      <CheckCircleFilled /> MATRICULADO
                    </Button>
                  ) : (
                    <Button type="primary" block className="btn-marketero"
                      loading={enrolling === a._id} onClick={(e) => { e.stopPropagation(); enroll(a); }}
                      style={{ height: 64, borderRadius: 0, fontSize: 16, fontWeight: 800, border: 'none', letterSpacing: 0.5 }}>
                      {user ? 'MATRICULARME →' : 'INICIAR SESIÓN PARA PUJAR'}
                    </Button>
                  )
                )}
                {a.status === 'live' && (
                  <Button type="primary" danger block 
                    onClick={(e) => { e.stopPropagation(); a.amIEnrolled ? navigate(`/subasta/${a._id}`) : enroll(a); }}
                    loading={enrolling === a._id}
                    style={{ height: 64, borderRadius: 0, fontSize: 16, fontWeight: 800, border: 'none', letterSpacing: 0.5, background: MISIO_COLORS.danger }}>
                    {a.amIEnrolled ? '🔴 ENTRAR A PUJAR' : '🔴 MATRICULARME Y ENTRAR'}
                  </Button>
                )}
                {a.status === 'finished' && a.winner && (
                  <div style={{ height: 64, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f8fafc', borderTop: '1px solid #e2e8f0' }}>
                    <Text className="prize-glow" style={{ fontWeight: 800 }}>
                      🏆 {a.winner.name} — S/ {a.winner.amount.toLocaleString('es-PE')}
                    </Text>
                  </div>
                )}
              </Card>
            </Col>
          ))}
        </Row>
      )}
    </div>
  );
}
