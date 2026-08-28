import React, { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  Card, Col, Row, Typography, Tag, Button, Input, Space, Statistic, List,
  Avatar, message, Alert, Skeleton, Popconfirm, Empty,
} from 'antd';
import {
  ArrowLeftOutlined, SaveOutlined, CrownFilled, PlayCircleFilled,
  ClockCircleOutlined, FireFilled,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import { io } from 'socket.io-client';
import { MISIO_COLORS } from '../../theme/misioTheme';
import { api, tokenStore, SERVER_URL } from '../../auth/api';
import { toEmbedSrc } from '../../utils/stream';

const { Title, Text } = Typography;
const { Timer } = Statistic;
const WS_URL = (import.meta.env.VITE_WS_URL || SERVER_URL).replace(/\/api\/v1\/?$/, '');

/**
 * 🎙️ PANEL MODERADOR DE SUBASTA (/admin/subasta/:id) — el "modo en vivo":
 *  - Pones el enlace de transmisión (YouTube/Kick/TikTok/Facebook) igual
 *    que en los sorteos; la sala de pujas muestra tu video.
 *  - Ves las pujas ENTRAR EN VIVO (socket) para narrarlas: "¡S/ 420 de
 *    CARL…! ¿alguien da más?".
 *  - Tú decides cuándo arranca (las moderadas no se abren solas).
 */
export default function AdminAuctionPanel() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [msgApi, contextHolder] = message.useMessage();

  const [auction, setAuction] = useState(null);
  const [bids, setBids] = useState([]);
  const [streamInput, setStreamInput] = useState('');
  const [saving, setSaving] = useState(false);
  const [flash, setFlash] = useState(null); // Última puja resaltada
  const socketRef = useRef(null);

  const load = async () => {
    const [a, b] = await Promise.all([
      api(`/auctions/${id}`),
      api(`/auctions/${id}/bids`),
    ]);
    setAuction(a);
    setBids(b);
    setStreamInput((prev) => prev || a.streamUrl || '');
  };

  useEffect(() => {
    load().catch((e) => msgApi.error(e.message));

    const socket = io(`${WS_URL}/auctions`, {
      auth: { token: tokenStore.get() },
      transports: ['websocket'],
    });
    socketRef.current = socket;
    // Observador: mira sin matricularse ni pujar
    socket.emit('watch_auction', { auctionId: id }, (ack) => {
      if (!ack?.ok) msgApi.error(ack?.error ?? 'No se pudo conectar al panel');
    });
    socket.on('bid_update', (r) => {
      setFlash(r?.currentBid ?? null);
      setTimeout(() => setFlash(null), 2500);
      load().catch(() => {});
    });
    socket.on('auction_finished', () => load().catch(() => {}));

    return () => socket.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const saveStream = async () => {
    setSaving(true);
    try {
      await api(`/auctions/${id}/stream`, { method: 'PATCH', body: { streamUrl: streamInput } });
      msgApi.success('Transmisión guardada — los matriculados ya la ven en la sala 📡');
      load();
    } catch (err) { msgApi.error(err.message); } finally { setSaving(false); }
  };

  const startNow = async () => {
    try {
      await api(`/auctions/${id}/start`, { method: 'POST' });
      msgApi.success('🔨 ¡Subasta ABIERTA! Los matriculados fueron notificados.', 6);
      load();
    } catch (err) { msgApi.error(err.message); }
  };

  const finishNow = async () => {
    try {
      await api(`/auctions/${id}/finish`, { method: 'POST' });
      msgApi.success('✅ Subasta terminada con éxito. Ganador adjudicado.', 6);
      load();
    } catch (err) { msgApi.error(err.message); }
  };

  if (!auction) return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20, padding: 40 }}>
      <Skeleton.Input active block style={{ height: 200, borderRadius: 16, marginBottom: 20 }} />
      <Skeleton active paragraph={{ rows: 8 }} />
    </div>
  );

  const live = auction.status === 'live';
  const embed = toEmbedSrc(auction.streamUrl);

  return (
    <div>
      {contextHolder}
      <Space style={{ marginBottom: 12 }} wrap>
        <Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/admin/subastas')}>Subastas</Button>
        <Title level={4} style={{ margin: 0 }}>🎙️ {auction.emoji} {auction.title}</Title>
        {live && <Tag color={MISIO_COLORS.danger}>🔴 EN VIVO</Tag>}
        {auction.status === 'scheduled' && <Tag color="processing">Programada</Tag>}
        {auction.status === 'finished' && <Tag>Finalizada</Tag>}
        {auction.mode === 'moderated' ? <Tag color="purple">Moderada</Tag> : <Tag>Automática</Tag>}
      </Space>

      {auction.status === 'scheduled' && (
        <Alert
          type="info" showIcon style={{ marginBottom: 16 }}
          message="La subasta aún no arranca"
          description="Pon tu enlace de transmisión, ponte al aire y recién abre las pujas: los matriculados reciben el aviso en ese momento."
          action={
            <Popconfirm title="¿Abrir las pujas ahora?" okText="¡Abrir!" cancelText="Aún no" onConfirm={startNow}>
              <Button type="primary" icon={<PlayCircleFilled />}>Iniciar subasta</Button>
            </Popconfirm>
          }
        />
      )}

      {auction.status === 'live' && (
        <Alert
          type="warning" showIcon style={{ marginBottom: 16 }}
          message="La subasta está EN VIVO"
          description="Puedes cerrar y adjudicar la subasta en este instante para despedirte con calma de tu audiencia."
          action={
            <Popconfirm title="¿Terminar la subasta AHORA?" okText="Sí, finalizar" cancelText="No, esperar" onConfirm={finishNow}>
              <Button type="primary" danger icon={<StopOutlined />}>Terminar subasta</Button>
            </Popconfirm>
          }
        />
      )}

      <Row gutter={[20, 20]}>
        {/* ── Transmisión (columna menor, como en el sorteo) ────────── */}
        <Col xs={24} lg={9}>
          <Card title="📡 Transmisión en vivo (YouTube / Kick / TikTok / Facebook)">
            <Space.Compact block style={{ marginBottom: 12 }}>
              <Input
                placeholder="Pega el link normal: youtube.com/watch?v=…"
                value={streamInput}
                onChange={(e) => setStreamInput(e.target.value)}
              />
              <Button type="primary" icon={<SaveOutlined />} loading={saving} onClick={saveStream}>
                Guardar
              </Button>
            </Space.Compact>
            <div style={{
              aspectRatio: '16/9', borderRadius: 12, overflow: 'hidden',
              background: 'var(--z-bg-elevated)', display: 'grid', placeItems: 'center',
            }}>
              {embed ? (
                <iframe src={embed} title="Transmisión de la subasta" allowFullScreen
                  style={{ width: '100%', height: '100%', border: 0 }} />
              ) : (
                <Text style={{ color: MISIO_COLORS.textMuted, fontSize: 12, textAlign: 'center', padding: 12 }}>
                  Pega tu link y guárdalo: aparecerá aquí y en la sala de los postores.
                </Text>
              )}
            </div>
            <Text style={{ fontSize: 11, color: MISIO_COLORS.textMuted, display: 'block', marginTop: 10 }}>
              Puedes cambiar el link incluso con la subasta EN VIVO — si tu
              transmisión se cae, la subasta no se cancela.
            </Text>
          </Card>
        </Col>

        {/* ── Pujas en vivo (protagonista) ──────────────────────────── */}
        <Col xs={24} lg={15}>
          <Card>
            <Row gutter={[16, 16]}>
              <Col xs={12} md={8}>
                <Statistic
                  title={<Text style={{ color: MISIO_COLORS.textMuted }}>Puja actual</Text>}
                  value={auction.currentBid?.amount ?? auction.basePrice}
                  prefix="S/"
                  valueStyle={{
                    color: MISIO_COLORS.saldoGreen, fontWeight: 700,
                    fontSize: 34, transition: 'transform 0.2s',
                    transform: flash ? 'scale(1.06)' : 'none',
                  }}
                />
                {auction.currentBid && (
                  <Text style={{ fontSize: 12 }}>
                    <CrownFilled style={{ color: MISIO_COLORS.prizeGold }} /> {auction.currentBid.name}
                  </Text>
                )}
              </Col>
              <Col xs={12} md={8}>
                <Statistic
                  title={<Text style={{ color: MISIO_COLORS.textMuted }}>
                    {auction.status === 'scheduled' ? 'Arranca' : 'Cierra en'}
                  </Text>}
                  valueRender={() => (
                    <Timer type="countdown"
                      value={dayjs(auction.status === 'scheduled' ? auction.startAt : auction.endAt).valueOf()}
                      format="HH:mm:ss"
                      valueStyle={{ fontWeight: 700, color: MISIO_COLORS.electricBlue }}
                      onFinish={() => load().catch(() => {})}
                    />
                  )}
                  prefix={<ClockCircleOutlined />}
                />
              </Col>
              <Col xs={12} md={4}>
                <Statistic title={<Text style={{ color: MISIO_COLORS.textMuted }}>Pujas</Text>}
                  value={auction.bidsCount} valueStyle={{ fontSize: 20 }} />
              </Col>
              <Col xs={12} md={4}>
                <Statistic title={<Text style={{ color: MISIO_COLORS.textMuted }}>Matriculados</Text>}
                  value={auction.enrolledCount} valueStyle={{ fontSize: 20 }} />
              </Col>
            </Row>

            {flash && (
              <Alert
                type="success" showIcon={false} style={{ marginTop: 12, textAlign: 'center' }}
                message={
                  <Text strong style={{ fontSize: 16 }}>
                    <FireFilled style={{ color: MISIO_COLORS.danger }} />{' '}
                    ¡NUEVA PUJA! {flash.name} — S/ {flash.amount?.toLocaleString('es-PE')}
                  </Text>
                }
              />
            )}
          </Card>

          <Card title="📜 Pujas en vivo" size="small" style={{ marginTop: 20 }}>
            {bids.length === 0 ? (
              <Empty description={live ? 'Nadie ha pujado todavía — anímalos.' : 'Sin pujas.'} />
            ) : (
              <List
                dataSource={bids}
                renderItem={(b, i) => (
                  <List.Item>
                    <List.Item.Meta
                      avatar={
                        <Avatar style={{
                          background: i === 0 ? MISIO_COLORS.prizeGold : 'var(--z-bg-elevated)',
                          color: i === 0 ? '#3d2e00' : undefined,
                        }}>
                          {i === 0 ? '👑' : (b.name ?? '?')[0]}
                        </Avatar>
                      }
                      title={<Text style={{ fontSize: 13 }}>{b.name}</Text>}
                      description={
                        <Text style={{ fontSize: 11, color: MISIO_COLORS.textMuted }}>
                          {dayjs(b.createdAt ?? b.at).format('HH:mm:ss')}
                        </Text>
                      }
                    />
                    <Text strong style={{ color: i === 0 ? MISIO_COLORS.saldoGreen : undefined }}>
                      S/ {b.amount?.toLocaleString('es-PE')}
                    </Text>
                  </List.Item>
                )}
              />
            )}
          </Card>
        </Col>
      </Row>
    </div>
  );
}
