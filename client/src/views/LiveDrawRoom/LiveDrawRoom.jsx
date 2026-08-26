import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Card, Col, Row, Typography, Tag, List, Avatar, Steps, Badge, Statistic,
  Divider, Button, Alert, message, Collapse, Grid, Segmented,
} from 'antd';
import {
  EyeFilled, PlayCircleFilled, UserOutlined, TrophyFilled, ThunderboltFilled,
  SoundOutlined,
} from '@ant-design/icons';
import { io } from 'socket.io-client';
import {
  MOCK_LIVE_RAFFLE, MOCK_PARTICIPANTS, MOCK_DRAW_TIMELINE,
} from '../../mocks/mockData';
import { MISIO_COLORS } from '../../theme/misioTheme';
import { toEmbedSrc } from '../../utils/stream';
import { useNavigate, useParams } from 'react-router-dom';
import { api, tokenStore } from '../../auth/api';
import { useAuth } from '../../auth/AuthContext';

const { Title, Text } = Typography;

const WS_URL = import.meta.env.VITE_WS_URL ?? 'http://localhost:3000';

/**
 * LiveDrawRoom v2 — "Modo Presentador" en TIEMPO REAL.
 *
 * Flujo:
 *  1. GET /raffles → busca la rifa con status 'live' (si no hay → modo demo).
 *  2. GET /live/:id → estado inicial (tiradas ya ejecutadas, participantes).
 *  3. socket.io('/live') → join_raffle; escucha:
 *       viewer_count → contador de espectadores
 *       draw_result  → nueva tirada (al agua o GANADOR) para toda la sala
 *  4. Si el usuario es admin, aparece el panel del presentador con el
 *     botón "Lanzar tirada" (emite presenter_draw con ack de error).
 */
export default function LiveDrawRoom() {
  const [msgApi, contextHolder] = message.useMessage();
  const screens = Grid.useBreakpoint();
  const { user } = useAuth();

  const [demo, setDemo] = useState(true);
  const [raffle, setRaffle] = useState(null); // Rifa en vivo real
  const [draws, setDraws] = useState([]); // [{attempt, result, ticketNumber, holderName}]
  const [participants, setParticipants] = useState([]);
  const [viewers, setViewers] = useState(0);
  const [drawing, setDrawing] = useState(false);
  const [closing, setClosing] = useState(null); // Resumen Cero Pérdida al cerrar
  const [completedPrizes, setCompletedPrizes] = useState([]); // Premios cerrados en PAQUETE
  const [reactions, setReactions] = useState({ like: 0, sad: 0 });
  const [reactCooldown, setReactCooldown] = useState(false);
  const [selectedPrizeTitle, setSelectedPrizeTitle] = useState(null);
  
  const [audioEnabled, setAudioEnabled] = useState(false);
  const audioEnabledRef = useRef(audioEnabled);
  const spinAudioRef = useRef(null);
  const winnerAudioRef = useRef(null);
  const loserAudioRef = useRef(null);
  
  useEffect(() => {
    audioEnabledRef.current = audioEnabled;
  }, [audioEnabled]);

  useEffect(() => {
    spinAudioRef.current = new Audio('/sounds/spin.mp3');
    spinAudioRef.current.loop = true;
    winnerAudioRef.current = new Audio('/sounds/ganador.mp3');
    loserAudioRef.current = new Audio('/sounds/al_agua.mp3');
  }, []);
  const [activeTab, setActiveTab] = useState('sorteo');
  const navigate = useNavigate();
  const { id } = useParams();
  const socketRef = useRef(null);

  const loadRoom = async () => {
    if (!id) return;
    try {
      const state = await api(`/live/${id}`);
      setRaffle(state.raffle);
      setDraws(state.draws);
      setParticipants(state.participants);
    } catch {}
  };

  const isAnimatingRef = useRef(false);
  const pendingEventsRef = useRef([]);

  const flushPendingEvents = () => {
    while (pendingEventsRef.current.length > 0) {
      const fn = pendingEventsRef.current.shift();
      fn();
    }
  };

  // ── Conexión: estado inicial por REST + suscripción por socket ────
  useEffect(() => {
    let cancelled = false;

    const connect = async () => {
      if (!id) return; // Si no hay ID en la URL, se queda en modo demo

      try {
        await loadRoom();
        if (cancelled) return;
        setDemo(false);

        const socket = io(`${WS_URL}/live`, {
          auth: { token: tokenStore.get() }, // El backend lo exige solo para tirar
          transports: ['websocket'],
        });
        socketRef.current = socket;

        socket.emit('join_raffle', { raffleId: id });
        socket.on('viewer_count', ({ count }) => setViewers(count));
        socket.on('draw_result', (result) => {
          const processResult = () => {
            setDraws((prev) => [...prev, result]);
            
            // 🔥 Actualizar el estado del ticket en la lista "Participantes"
            setParticipants((prev) => 
              prev.map(p => p.ticketNumber === result.ticketNumber 
                ? { ...p, status: result.result === 'winner' ? 'winner' : 'burned_al_agua' } 
                : p
              )
            );

            if (result.result === 'winner') {
              msgApi.success(
                `🏆 ¡GANADOR! Boleto #${String(result.ticketNumber).padStart(4, '0')} de ${result.holderName}`,
                10,
              );
              setRaffle((prev) => {
                if (!prev) return prev;
                // Si es paquete, actualizamos el premio específico
                if (prev.type === 'paquete' && prev.prizes && result.prizeIndex !== undefined) {
                  const newPrizes = [...prev.prizes];
                  newPrizes[result.prizeIndex] = {
                    ...newPrizes[result.prizeIndex],
                    winner: { name: result.holderName, ticketNumber: result.ticketNumber }
                  };
                  return { ...prev, prizes: newPrizes };
                }
                // Si es premio único, sí termina aquí (aunque luego llegue raffle_completed)
                return { ...prev, status: 'completed' };
              });
            }
            
            isAnimatingRef.current = false;
            flushPendingEvents();
          };

          if (result.isManual) {
            processResult();
          } else {
            isAnimatingRef.current = true;
            // Empezar a girar visualmente (y sonido si está activo)
            if (audioEnabledRef.current) {
              spinAudioRef.current?.play().catch(() => {});
            }
            
            // Sincronizar aparición visual con el final del giro de la tómbola
            setTimeout(() => {
              if (audioEnabledRef.current) {
                spinAudioRef.current?.pause();
                if (spinAudioRef.current) spinAudioRef.current.currentTime = 0;
                
                if (result.result === 'winner') {
                  winnerAudioRef.current?.play().catch(() => {});
                } else {
                  loserAudioRef.current?.play().catch(() => {});
                }
              }
              processResult();
            }, 6500); // 4000ms ruleta + 2500ms animación
          }
        });

        // Cierre orquestado (Iteración 4): ganador + reembolsos Cero Pérdida
        socket.on('raffle_completed', (summary) => {
          const action = () => setClosing(summary);
          if (isAnimatingRef.current) pendingEventsRef.current.push(action);
          else action();
        });

        socket.on('raffle_status', ({ status }) => {
          const action = () => setRaffle(prev => prev ? { ...prev, status } : prev);
          if (isAnimatingRef.current) pendingEventsRef.current.push(action);
          else action();
        });

        socket.on('prize_completed', (summary) => {
          const action = () => {
            setCompletedPrizes((prev) => [...prev, summary]);
            setRaffle(prev => {
              if (prev?.type === 'paquete' && prev.prizes) {
                const newPrizes = [...prev.prizes];
                newPrizes[summary.prizeIndex].winner = summary.winner;
                return { ...prev, prizes: newPrizes };
              }
              return prev;
            });
            msgApi.success(`¡Premio "${summary.title}" ganado por ${summary.winner.name}!`);
          };
          if (isAnimatingRef.current) pendingEventsRef.current.push(action);
          else action();
        });

        // Expulsión explícita por el administrador
        socket.on('room_closed', () => {
          msgApi.info('Sorteo finalizado. Saldrás de la sala automáticamente en 10s...', 9);
          setTimeout(() => {
            navigate(`/rifa/${id}`);
            window.location.reload();
          }, 10000);
        });

        socket.on('raffle_reset', () => {
          loadRoom();
        });

        // Reacciones del público (Sprint 2): contadores en vivo
        socket.on('reaction_update', (counts) => setReactions(counts));
      } catch {
        // Backend apagado → modo demo silencioso
      }
    };

    connect();
    return () => {
      cancelled = true;
      socketRef.current?.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Tirada del presentador (con ack: los errores vuelven solo a él) ─
  const launchDraw = () => {
    if (!socketRef.current || !raffle) return;
    setDrawing(true);
    socketRef.current.emit('presenter_draw', { raffleId: raffle._id }, (ack) => {
      setDrawing(false);
      if (!ack?.ok) msgApi.error(ack?.error ?? 'Error en la tirada');
    });
  };

  /** Reaccionar 👍/😢 (con cooldown de 1.5s anti-spam). */
  const sendReaction = (reaction) => {
    if (!socketRef.current || demo || reactCooldown) return;
    socketRef.current.emit('react', { raffleId: raffle._id, reaction });
    setReactCooldown(true);
    setTimeout(() => setReactCooldown(false), 1500);
  };

  /** Generar el link público de 5 min y abrir la lista. */
  const openPublicList = async () => {
    try {
      const { path } = await api(`/raffles/${raffle._id}/share-link`, { method: 'POST' });
      navigate(path);
    } catch (err) {
      msgApi.error(err.message ?? 'Inicia sesión para generar el enlace');
    }
  };

  // ── Datos a renderizar (reales o mock) ─────────────────────────────
  const view = useMemo(() => {
    if (demo) {
      return {
        title: MOCK_LIVE_RAFFLE.title,
        winningAttempt: MOCK_LIVE_RAFFLE.winningAttempt,
        currentAttempt: MOCK_LIVE_RAFFLE.currentAttempt,
        viewers: MOCK_LIVE_RAFFLE.viewers,
        completed: false,
        timeline: MOCK_DRAW_TIMELINE.map((d) => ({
          attempt: d.attempt,
          result: d.result === 'pending' ? null : d.result,
          ticketNumber: d.ticketNumber,
          holderName: d.holder,
        })),
        participants: MOCK_PARTICIPANTS.map((p) => ({
          name: p.name,
          ticketNumber: p.ticketNumber,
          extra: p.city,
        })),
      };
    }

    const isPaquete = raffle.type === 'paquete';
    let targetPrize = raffle;
    let activePrizeStr = '';
    
    if (isPaquete && raffle.prizes) {
      const activePrize = raffle.prizes.find(p => !p.winner);
      targetPrize = activePrize || raffle.prizes[0];
      
      if (selectedPrizeTitle) {
        const sel = raffle.prizes.find(p => p.title === selectedPrizeTitle);
        if (sel) targetPrize = sel;
      }
      
      activePrizeStr = ` (Viendo: ${targetPrize.title})`;
    }
    
    const winningAttempt = targetPrize.winningAttempt ?? 1;
    // Timeline completo: tiradas hechas + pendientes hasta la ganadora
    const prizeDraws = draws.filter(d => isPaquete ? d.prizeIndex === raffle.prizes?.indexOf(targetPrize) : true);
    const timeline = Array.from({ length: winningAttempt }, (_, i) => {
      const done = prizeDraws[i];
      return done
        ? { attempt: i + 1, result: done.result, ticketNumber: done.ticketNumber, holderName: done.holderName }
        : { attempt: i + 1, result: null, ticketNumber: null, holderName: null };
    });

    return {
      title: raffle.title + activePrizeStr,
      winningAttempt,
      currentAttempt: Math.min(prizeDraws.length + 1, winningAttempt),
      viewers,
      completed: raffle.status === 'completed',
      timeline,
      participants: participants.map((p) => ({
        name: p.name,
        ticketNumber: p.ticketNumber,
        extra: p.status === 'burned_al_agua' ? '💧 al agua' : p.status === 'winner' ? '🏆' : '',
      })),
      activeCount: participants.filter(p => p.status === 'active').length,
      burnedCount: participants.filter(p => p.status === 'burned_al_agua').length,
      winnerCount: participants.filter(p => p.status === 'winner').length,
      isPaquete,
      prizes: isPaquete ? raffle.prizes : [],
      activePrizeTitle: targetPrize?.title,
    };
  }, [demo, raffle, draws, participants, viewers, selectedPrizeTitle]);

  const stepsItems = view.timeline.map((draw) => {
    const isWinnerDraw = draw.attempt === view.winningAttempt;
    return {
      title: isWinnerDraw ? (
        <span className="prize-glow">Tirada {draw.attempt} — ¡GANADORA!</span>
      ) : (
        `Tirada ${draw.attempt} — al agua 💧`
      ),
      description: !draw.result ? (
        <Text style={{ color: MISIO_COLORS.textMuted }}>Próxima… mantente atento al stream</Text>
      ) : (
        <>
          <Text code>#{String(draw.ticketNumber).padStart(4, '0')}</Text>{' '}
          <Text style={{ color: MISIO_COLORS.textMuted }}>{draw.holderName}</Text>
        </>
      ),
      status: !draw.result ? 'process' : 'finish',
      icon: isWinnerDraw ? <TrophyFilled style={{ color: MISIO_COLORS.prizeGold }} /> : undefined,
    };
  });

  return (
    <div>
      {contextHolder}

      {demo && (
        <Alert
          type="info"
          showIcon
          message="Modo demo: no hay rifa en vivo (o el backend está apagado). Cambia una rifa a status 'live' para activar la sala real."
          style={{ marginBottom: 16 }}
        />
      )}

      {/* ── Anuncio de cierre para Sorteo de Premio Único ────── */}
      {closing && !view.isPaquete && user && closing.winner?.userId === user._id && (
        <Alert
          type="success"
          showIcon
          icon={<TrophyFilled style={{ color: MISIO_COLORS.prizeGold }} />}
          style={{ marginBottom: 16, borderColor: MISIO_COLORS.prizeGold }}
          message={
            <span className="prize-glow" style={{ fontWeight: 700 }}>
              ¡{closing.winner.name} ganó "{closing.raffleTitle}" con el boleto #
              {String(closing.winner.ticketNumber).padStart(4, '0')}!
            </span>
          }
          description={
            <Text>
              Cero Pérdida cumplido: <b className="saldo-glow">S/ {Number(closing.refundedTotal).toFixed(2)}</b>{' '}
              devueltos automáticamente a {closing.refundedUsers} participante(s) por{' '}
              {closing.refundedTickets} boleto(s). Revisa tu billetera en "Mi Misio".
            </Text>
          }
        />
      )}

      {/* ── Premios completados (si es paquete) ────── */}
      {completedPrizes.length > 0 && (
        <Alert
          type="info"
          showIcon
          style={{ marginBottom: 16 }}
          message={<Text strong style={{ color: MISIO_COLORS.primary }}>🏆 Resumen de Premios Sorteados</Text>}
          description={
            <div style={{ marginTop: 8 }}>
              <ul style={{ paddingLeft: 20, margin: 0 }}>
                {completedPrizes.map((p, i) => (
                  <li key={i} style={{ marginBottom: 4 }}>
                    <Text strong>{p.title}:</Text> {p.winner.name.substring(0, 5)}... (Boleto #{String(p.winner.ticketNumber).padStart(4, '0')})
                  </li>
                ))}
              </ul>
              {closing && view.isPaquete && (
                <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px dashed #cfdfde' }}>
                  <Text>
                    Cero Pérdida cumplido: <b className="saldo-glow">S/ {Number(closing.refundedTotal).toFixed(2)}</b>{' '}
                    devueltos automáticamente a {closing.refundedUsers} participante(s) por{' '}
                    {closing.refundedTickets} boleto(s). Revisa tu billetera en "Mi Misio".
                  </Text>
                </div>
              )}
            </div>
          }
        />
      )}

      <Row gutter={[20, 20]} style={{ alignItems: 'stretch' }}>
        {/* ── Stream + tómbola ────────────────────────────────────── */}
        <Col xs={24} lg={16} style={{ display: 'flex', flexDirection: 'column' }}>
          {/* ── Cabecera de la sala ───────────────────────────────────── */}
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 14, marginBottom: 20 }}>
            <Badge status="processing" color={MISIO_COLORS.danger} />
            <Tag color={view.completed ? MISIO_COLORS.prizeGold : MISIO_COLORS.danger} style={{ fontWeight: 700 }}>
              {view.completed ? '🏆 FINALIZADO' : 'EN VIVO'}
            </Tag>
            <Title level={4} style={{ margin: 0, flex: '1 1 200px', minWidth: 0 }} ellipsis>{view.title}</Title>
            <Button 
              type="text" 
              icon={<SoundOutlined />} 
              onClick={() => setAudioEnabled(!audioEnabled)}
              style={{ color: audioEnabled ? MISIO_COLORS.saldoGreen : 'rgba(148, 163, 184, 0.5)', opacity: audioEnabled ? 1 : 0.6 }}
              title={audioEnabled ? "Desactivar sonido" : "Activar sonido"}
            />
          </div>

          <Card
            styles={{ body: { padding: 0, overflow: 'hidden', borderRadius: 16 } }}
            style={{ boxShadow: `0 0 40px rgba(124, 77, 255, 0.25)` }}
          >
            <div
              style={{
                aspectRatio: '16 / 9',
                background: `radial-gradient(circle at 50% 40%, var(--z-bg-elevated), var(--z-bg-base))`,
              }}
            >
              {!demo && raffle?.streamUrl ? (
                <iframe
                  src={toEmbedSrc(raffle.streamUrl)}
                  title="Transmisión del sorteo"
                  style={{ width: '100%', height: '100%', border: 0 }}
                  allow="autoplay; encrypted-media; picture-in-picture"
                  allowFullScreen
                />
              ) : (
                <div style={{ height: '100%', display: 'grid', placeItems: 'center' }}>
                  <div style={{ textAlign: 'center' }}>
                    <PlayCircleFilled style={{ fontSize: 72, color: MISIO_COLORS.electricBlue }} />
                    <Title level={5} style={{ marginTop: 12 }}>El stream aparecerá aquí</Title>
                    <Text style={{ color: MISIO_COLORS.textMuted }}>
                      YouTube / Kick / TikTok Live — lo activa el presentador
                    </Text>
                  </div>
                </div>
              )}
            </div>

            {/* Reacciones del público y stats */}
            <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 16, padding: '12px 24px',
              background: MISIO_COLORS.bgSurface }}>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
                <Button
                  size="large" disabled={demo || reactCooldown}
                  onClick={() => sendReaction('like')}
                  style={{ borderColor: MISIO_COLORS.saldoGreen }}
                >
                  👍 {reactions.like > 0 ? reactions.like.toLocaleString('es-PE') : ''}
                </Button>
                <Button
                  size="large" disabled={demo || reactCooldown}
                  onClick={() => sendReaction('sad')}
                  style={{ borderColor: MISIO_COLORS.electricBlue }}
                >
                  😢 {reactions.sad > 0 ? reactions.sad.toLocaleString('es-PE') : ''}
                </Button>
              </div>

              <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
                <Statistic
                  title={<Text style={{ color: MISIO_COLORS.textMuted, fontSize: 12, lineHeight: 1 }}>🎱 En juego</Text>}
                  value={view.activeCount}
                  valueStyle={{ color: MISIO_COLORS.electricBlue, fontSize: 18, fontWeight: 700, lineHeight: 1, marginTop: 4 }}
                />
                <Statistic
                  title={<Text style={{ color: MISIO_COLORS.textMuted, fontSize: 12, lineHeight: 1 }}>💧 Al agua</Text>}
                  value={view.burnedCount}
                  valueStyle={{ color: '#94a3b8', fontSize: 18, fontWeight: 700, lineHeight: 1, marginTop: 4 }}
                />
                <Statistic
                  title={<Text style={{ color: MISIO_COLORS.textMuted, fontSize: 12, lineHeight: 1 }}>🏆 Ganadores</Text>}
                  value={view.winnerCount}
                  valueStyle={{ color: MISIO_COLORS.prizeGold, fontSize: 18, fontWeight: 700, lineHeight: 1, marginTop: 4 }}
                />
                <Statistic
                  title={<Text style={{ color: MISIO_COLORS.textMuted, fontSize: 12, lineHeight: 1 }}>👀 Espectadores</Text>}
                  value={view.viewers}
                  valueStyle={{ color: '#fca5a5', fontSize: 18, fontWeight: 700, lineHeight: 1, marginTop: 4 }}
                />
              </div>
            </div>
          </Card>

          {/* El presentador tiene SU panel en Admin → Sorteos → ▶ (aquí todos ven lo mismo) */}

        </Col>

        {/* ── Panel lateral: participantes ────────────────────────── */}
        <Col xs={24} lg={8} style={{ position: 'relative' }}>
          <div style={screens.lg ? { position: 'absolute', top: 0, left: 10, right: 10, bottom: 0, display: 'flex', flexDirection: 'column' } : { display: 'flex', flexDirection: 'column', height: '100%' }}>
          {user && (
            <div style={{ paddingBottom: 16, flexShrink: 0 }}>
              <Segmented
                options={[
                  { label: '🎱 Sorteo', value: 'sorteo' },
                  { label: '👥 Participantes', value: 'participantes' }
                ]}
                value={activeTab}
                onChange={setActiveTab}
                block
                size="large"
              />
            </div>
          )}
          <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, paddingBottom: 0, overflowY: 'auto', paddingRight: 4 }} className="custom-scrollbar">
            
            {activeTab === 'sorteo' && (
              <>
                {/* ── Premios (solo si es sorteo paquete) ───────────────── */}
                {view.isPaquete && (
                  <Collapse
                    style={{ flexShrink: 0, marginBottom: 20, background: '#ffffff', borderRadius: 12 }}
                    items={[{
                      key: '1',
                      label: (
                        <>
                          <Text strong>🎁 Premios del paquete</Text>
                          {view.activePrizeTitle && (
                            <Text type="secondary" style={{ marginLeft: 8, fontSize: 13 }}>
                              (Viendo: {view.activePrizeTitle})
                            </Text>
                          )}
                        </>
                      ),
                      children: (
                        <List
                          size="small"
                          dataSource={view.prizes}
                          renderItem={(p) => {
                            const isCurrent = p.title === view.activePrizeTitle && !p.winner;
                            const isSelected = p.title === view.activePrizeTitle;
                            return (
                              <List.Item
                                onClick={() => setSelectedPrizeTitle(p.title)}
                                style={{ cursor: 'pointer', background: isSelected ? 'rgba(124, 77, 255, 0.05)' : 'transparent', borderRadius: 8, padding: '8px 12px', border: isSelected ? `1px solid ${MISIO_COLORS.electricBlue}` : '1px solid transparent' }}
                              >
                                <div style={{ width: '100%' }}>
                                  <Text strong={isCurrent} style={{ color: p.winner ? MISIO_COLORS.prizeGold : isCurrent ? MISIO_COLORS.electricBlue : undefined }}>
                                    {p.winner ? '🏆 ' : isCurrent ? '▶ ' : '🎁 '} {p.title}
                                  </Text>
                                  {p.winner && <div style={{ fontSize: 12, color: MISIO_COLORS.textMuted }}>Ganador: {p.winner.name.substring(0, 5)}... <Text code style={{ fontSize: 11 }}>#{String(p.winner.ticketNumber).padStart(4, '0')}</Text></div>}
                                </div>
                              </List.Item>
                            );
                          }}
                        />
                      )
                    }]}
                  />
                )}

                {/* ── Timeline de tiradas al agua ───────────────────────── */}
                <Card
                  title={
                    <>
                      🎱 Tiradas de la tómbola{' '}
                      <Tag color="processing">
                        Tirada actual: {view.currentAttempt} de {view.winningAttempt}
                      </Tag>
                    </>
                  }
                  style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden', margin: 0, minHeight: 0 }}
                  styles={{ body: { flex: 1, overflowY: 'auto' } }}
                >
                  <Steps direction="vertical" items={stepsItems} current={view.currentAttempt} />
                  <Divider />
                  <Text style={{ color: MISIO_COLORS.textMuted, fontSize: 12 }}>
                    💧 Regla "al agua": las primeras {view.winningAttempt - 1} tiradas NO ganan.
                    El boleto de la tirada {view.winningAttempt} se lleva el premio. Los boletos
                    quemados reciben su reembolso Cero Pérdida automáticamente.
                  </Text>
                </Card>
              </>
            )}

            {activeTab === 'participantes' && (
              <Card styles={{ body: { padding: 16 } }} style={{ margin: 0, borderRadius: 16, border: 'none', background: '#ffffff', boxShadow: `0 0 40px rgba(124, 77, 255, 0.05)` }}>
                <List
                  grid={{ gutter: [12, 12], column: 2 }}
                  split={false}
                  dataSource={view.participants}
                  renderItem={(p) => (
                    <List.Item
                      style={{ padding: 0, border: 'none', marginBottom: 0 }}
                    >
                      <div style={{ 
                        display: 'flex', width: '100%', borderRadius: 12, border: '1px solid #e8e8e8',
                        overflow: 'hidden', boxShadow: '0 2px 8px rgba(0,0,0,0.03)', position: 'relative'
                      }}>
                        {/* Lado izquierdo */}
                        <div style={{ flex: 1, background: '#f4fbf9', padding: '8px 10px', display: 'flex', flexDirection: 'column', justifyContent: 'center', minWidth: 0 }}>
                          {/* Info del Participante */}
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
                            <Avatar size={20} style={{ backgroundColor: '#ffffff', color: '#008b8b', border: '1px solid #e8e8e8', fontSize: 11, flexShrink: 0 }}>
                              {p.name.charAt(0)}
                            </Avatar>
                            <Text strong style={{ fontSize: 12, color: '#1a1a1a' }} ellipsis>{p.name}</Text>
                          </div>

                          {/* Línea punteada divisoria */}
                          <div style={{ position: 'absolute', right: 64, top: 12, bottom: 12, borderRight: '1px dashed #cfdfde' }} />
                        </div>

                        {/* Lado derecho (Número) */}
                        <div style={{ 
                          width: 64, flexShrink: 0,
                          background: p.extra === '🏆' ? 'linear-gradient(135deg, #f6d365 0%, #fda085 100%)' : p.extra === '💧 al agua' ? 'linear-gradient(135deg, #a8aaad 0%, #76787a 100%)' : 'linear-gradient(135deg, #009688 0%, #005f73 100%)', 
                          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', 
                          padding: '8px 2px', color: '#fff'
                        }}>
                          <Text style={{ color: 'rgba(255,255,255,0.85)', fontSize: 7, fontWeight: 600, letterSpacing: 0, marginBottom: 2 }}>BOLETO</Text>
                          <Text style={{ color: '#fff', fontSize: 16, fontWeight: 800, lineHeight: 1, marginBottom: 2 }}>
                            {String(p.ticketNumber).padStart(3, '0')}
                          </Text>
                          <Text style={{ color: 'rgba(255,255,255,0.7)', fontSize: 7 }}>ANE-{String(p.ticketNumber).padStart(4, '0')}</Text>
                        </div>

                        {/* Recortes superiores e inferiores */}
                        <div style={{ position: 'absolute', right: 56, top: -8, width: 16, height: 16, borderRadius: '50%', background: '#ffffff', border: '1px solid #e8e8e8', zIndex: 10 }} />
                        <div style={{ position: 'absolute', right: 56, bottom: -8, width: 16, height: 16, borderRadius: '50%', background: '#ffffff', border: '1px solid #e8e8e8', zIndex: 10 }} />
                      </div>
                    </List.Item>
                  )}
                />
              </Card>
            )}
          </div>
          </div>
        </Col>
      </Row>
    </div>
  );
}
