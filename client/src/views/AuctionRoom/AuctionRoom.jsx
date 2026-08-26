import React, { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  Card, Col, Row, Typography, Tag, Button, InputNumber, List, Avatar, Alert,
  Statistic, Space, message, Result, Skeleton, Image, Popconfirm,
} from 'antd';
import {
  ClockCircleOutlined, ThunderboltFilled, CrownFilled, ArrowLeftOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import { io } from 'socket.io-client';
import { MISIO_COLORS } from '../../theme/misioTheme';
import { useAuth } from '../../auth/AuthContext';
import { api, tokenStore, SERVER_URL } from '../../auth/api';
import { toEmbedSrc } from '../../utils/stream';

const { Title, Text } = Typography;
const { Timer } = Statistic;
const WS_URL = import.meta.env.VITE_WS_URL ?? 'http://localhost:3000';

/**
 * 🔨 SALA DE SUBASTA (/subasta/:id) — SOLO matriculados.
 *
 * Pujas EN TIEMPO REAL con DINERO REAL:
 *  - Al pujar, el monto se RETIENE de tu saldo contable (walletHeld).
 *  - Si te superan, se libera al instante y te llega la notificación.
 *  - Anti-sniping: toda puja en los últimos 2 min extiende el cierre 2 min.
 *  - El servidor procesa las pujas EN SERIE (mutex): nunca dos líderes.
 */
export default function AuctionRoom() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user, refreshUser } = useAuth();
  const [msgApi, contextHolder] = message.useMessage();

  const [auction, setAuction] = useState(null);
  const [bids, setBids] = useState([]);
  const [error, setError] = useState(null);
  const [amount, setAmount] = useState(0);
  const [placing, setPlacing] = useState(false);
  const socketRef = useRef(null);

  const load = async () => {
    const [a, b] = await Promise.all([
      api(`/auctions/${id}`),
      api(`/auctions/${id}/bids`),
    ]);
    setAuction(a);
    setBids(b);
    const min = (a.currentBid?.amount ?? a.basePrice - a.minIncrement) + a.minIncrement;
    setAmount((prev) => Math.max(prev, min));
  };

  useEffect(() => {
    load().catch((e) => setError(e.message));

    const socket = io(`${WS_URL}/auctions`, {
      auth: { token: tokenStore.get() },
      transports: ['websocket'],
    });
    socketRef.current = socket;
    socket.emit('join_auction', { auctionId: id }, (ack) => {
      if (!ack?.ok) setError(ack?.error ?? 'No se pudo entrar a la sala');
    });

    socket.on('bid_update', () => {
      load().catch(() => {});
      refreshUser?.(); // Si te superaron, tu retención se liberó
    });
    socket.on('auction_finished', () => {
      load().catch(() => {});
      refreshUser?.();
    });

    return () => socket.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const placeBid = () => {
    setPlacing(true);
    socketRef.current.emit('place_bid', { auctionId: id, amount }, (ack) => {
      setPlacing(false);
      if (!ack?.ok) return msgApi.error(ack?.error ?? 'No se pudo pujar');
      msgApi.success(`¡Vas liderando con S/ ${amount}! Tu puja quedó retenida. 👑`);
      refreshUser?.();
    });
  };

  const buyNow = () => {
    socketRef.current.emit('buy_now', { auctionId: id }, (ack) => {
      if (!ack?.ok) return msgApi.error(ack?.error ?? 'No se pudo comprar');
      msgApi.success('¡ES TUYO! 🏆 Coordinamos la entrega por tu perfil.', 8);
      refreshUser?.();
    });
  };

  if (error) {
    return (
      <Result
        status="403"
        title="Sala solo para matriculados"
        subTitle={error}
        extra={<Button type="primary" onClick={() => navigate('/subastas')}>Ver subastas</Button>}
      />
    );
  }
  if (!auction) return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20, padding: 40 }}>
      <Skeleton.Input active block style={{ height: 300, borderRadius: 16, marginBottom: 20 }} />
      <Skeleton active paragraph={{ rows: 6 }} />
    </div>
  );

  const minBid = (auction.currentBid?.amount ?? auction.basePrice - auction.minIncrement) + auction.minIncrement;
  const available = Number(user?.walletBalance ?? 0);
  const held = Number(user?.walletHeld ?? 0);
  const live = auction.status === 'live';
  const finished = ['finished', 'cancelled'].includes(auction.status);

  return (
    <div>
      {contextHolder}
      <Space style={{ marginBottom: 12 }} wrap>
        <Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/subastas')}>Subastas</Button>
        <Title level={4} style={{ margin: 0 }}>{auction.emoji} {auction.title}</Title>
        {live && <Tag color={MISIO_COLORS.danger}>🔴 EN SUBASTA</Tag>}
        {auction.status === 'scheduled' && <Tag color="processing">Aún no arranca</Tag>}
        {finished && <Tag>Finalizada</Tag>}
      </Space>

      {/* ── Ganador ── */}
      {auction.winner && (
        <Alert type="success" showIcon style={{ marginBottom: 16 }}
          message={
            <Text className="prize-glow" style={{ fontWeight: 700, fontSize: 16 }}>
              🏆 GANADOR: {auction.winner.name} — S/ {auction.winner.amount.toLocaleString('es-PE')}
            </Text>
          }
          description="El pago ya quedó ejecutado con su retención — pasa directo al envío con seguimiento." />
      )}

      <Row gutter={[20, 20]}>
        <Col xs={24} lg={15}>
          <Card>
            {/* Modo moderado: la transmisión manda — el subastador narra */}
            {auction.mode === 'moderated' && toEmbedSrc(auction.streamUrl) && (
              <div style={{ aspectRatio: '16/9', borderRadius: 12, overflow: 'hidden', marginBottom: 12 }}>
                <iframe src={toEmbedSrc(auction.streamUrl)} title="Subasta en vivo" allowFullScreen
                  style={{ width: '100%', height: '100%', border: 0 }} />
              </div>
            )}
            {auction.mode === 'moderated' && !toEmbedSrc(auction.streamUrl) && live && (
              <Alert type="info" showIcon style={{ marginBottom: 12 }}
                message="Subasta conducida en vivo — la transmisión está por comenzar." />
            )}

            {auction.description && (
              <Text style={{ color: MISIO_COLORS.textMuted, display: 'block', marginTop: 10 }}>
                {auction.description}
              </Text>
            )}

            <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
              <Col xs={12} md={6}>
                <Statistic title={<Text style={{ color: MISIO_COLORS.textMuted }}>Puja actual</Text>}
                  value={auction.currentBid?.amount ?? auction.basePrice} prefix="S/"
                  valueStyle={{ color: MISIO_COLORS.saldoGreen, fontWeight: 700 }} />
                {auction.currentBid && (
                  <Text style={{ fontSize: 11, color: auction.amILeader ? MISIO_COLORS.saldoGreen : MISIO_COLORS.textMuted }}>
                    <CrownFilled style={{ color: MISIO_COLORS.prizeGold }} />{' '}
                    {auction.amILeader ? '¡TÚ lideras!' : auction.currentBid.name}
                  </Text>
                )}
              </Col>
              <Col xs={12} md={6}>
                <Statistic title={<Text style={{ color: MISIO_COLORS.textMuted }}>
                  {auction.status === 'scheduled' ? 'Arranca en' : 'Cierra en'}</Text>}
                  valueRender={() => (
                    <Timer type="countdown"
                      value={dayjs(auction.status === 'scheduled' ? auction.startAt : auction.endAt).valueOf()}
                      format="HH:mm:ss"
                      valueStyle={{ fontWeight: 700,
                        color: live && dayjs(auction.endAt).diff(dayjs(), 'minute') < 2
                          ? MISIO_COLORS.danger : MISIO_COLORS.electricBlue }}
                      onFinish={() => load().catch(() => {})}
                    />
                  )} />
                {live && (
                  <Text style={{ fontSize: 11, color: MISIO_COLORS.textMuted }}>
                    ⚡ Última puja en -2 min extiende +2 min
                  </Text>
                )}
              </Col>
              <Col xs={12} md={6}>
                <Statistic title={<Text style={{ color: MISIO_COLORS.textMuted }}>Incremento mín.</Text>}
                  value={auction.minIncrement} prefix="S/" valueStyle={{ fontSize: 18 }} />
              </Col>
              <Col xs={12} md={6}>
                <Statistic title={<Text style={{ color: MISIO_COLORS.textMuted }}>Pujas</Text>}
                  value={auction.bidsCount} valueStyle={{ fontSize: 18 }} />
              </Col>
            </Row>

            {/* ── Barra de puja ── */}
            {live && (
              <>
                <Space.Compact block style={{ marginTop: 18 }}>
                  <InputNumber size="large" min={minBid} step={auction.minIncrement}
                    value={amount} onChange={(v) => setAmount(v ?? minBid)}
                    prefix="S/" style={{ flex: 1 }} />
                  <Button type="primary" size="large" icon={<ThunderboltFilled />}
                    loading={placing} disabled={auction.amILeader} onClick={placeBid}>
                    {auction.amILeader ? 'Vas liderando 👑' : `Pujar S/ ${amount}`}
                  </Button>
                </Space.Compact>
                <Space style={{ marginTop: 10 }} wrap>
                  {[0, 1, 2, 4].map((k) => {
                    const q = minBid + k * auction.minIncrement;
                    return <Button key={q} size="small" onClick={() => setAmount(q)}>S/ {q}</Button>;
                  })}
                  {auction.buyNowPrice && (
                    <Popconfirm
                      title={`¿Comprar YA por S/ ${auction.buyNowPrice.toLocaleString('es-PE')}?`}
                      description="Se cobra al instante de tu saldo contable y la subasta termina contigo."
                      okText="¡Es mío!" cancelText="No"
                      onConfirm={buyNow}
                    >
                      <Button size="small" type="dashed"
                        style={{ borderColor: MISIO_COLORS.prizeGold, color: MISIO_COLORS.prizeGold }}>
                        🏷️ Cómpralo ya — S/ {auction.buyNowPrice.toLocaleString('es-PE')}
                      </Button>
                    </Popconfirm>
                  )}
                </Space>
                <Alert type="info" showIcon={false} style={{ marginTop: 12 }}
                  message={
                    <Text style={{ fontSize: 12 }}>
                      💵 Disponible: <Text strong style={{ color: MISIO_COLORS.saldoGreen }}>S/ {available.toFixed(2)}</Text>
                      {held > 0 && <> · 🔒 Retenido en subastas: <Text strong style={{ color: MISIO_COLORS.prizeGold }}>S/ {held.toFixed(2)}</Text></>}
                      {' — '}al pujar, el monto se retiene; si te superan, vuelve solo.
                    </Text>
                  } />
              </>
            )}
            {auction.status === 'scheduled' && (
              <Alert type="info" showIcon style={{ marginTop: 16 }}
                message="La sala abre cuando arranque la subasta — te llegará la notificación." />
            )}
          </Card>
        </Col>

        {/* ── Historial de pujas ── */}
        <Col xs={24} lg={9}>
          <Card title="📜 Últimas pujas" size="small">
            <List
              dataSource={bids}
              locale={{ emptyText: live ? 'Sé el primero en pujar.' : 'Sin pujas aún.' }}
              renderItem={(b, i) => (
                <List.Item>
                  <List.Item.Meta
                    avatar={
                      <Avatar style={{
                        background: i === 0 ? MISIO_COLORS.prizeGold : MISIO_COLORS.bgElevated,
                        color: i === 0 ? '#3d2e00' : undefined,
                      }}>
                        {i === 0 ? '👑' : (b.name ?? '?')[0]}
                      </Avatar>
                    }
                    title={<Text style={{ fontSize: 13 }}>{b.name}</Text>}
                    description={
                      <Text style={{ fontSize: 11, color: MISIO_COLORS.textMuted }}>
                        {dayjs(b.createdAt).format('HH:mm:ss')}
                      </Text>
                    }
                  />
                  <Text strong style={{ color: i === 0 ? MISIO_COLORS.saldoGreen : undefined }}>
                    S/ {b.amount.toLocaleString('es-PE')}
                  </Text>
                </List.Item>
              )}
            />
          </Card>
        </Col>
      </Row>
    </div>
  );
}
