import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Card, Col, Row, Typography, Tag, Button, Form, Input, Modal, message,
  Alert, Space, InputNumber, Radio, List, Avatar, Result, Tooltip,
  Switch, Select, Popconfirm, Progress,
} from 'antd';
import {
  PlusOutlined, LoginOutlined, SoundFilled, CopyOutlined, WhatsAppOutlined,
  CrownFilled, UserOutlined, TrophyFilled, ReloadOutlined, NotificationOutlined,
} from '@ant-design/icons';
import { io } from 'socket.io-client';
import { MISIO_COLORS } from '../../theme/misioTheme';
import { useAuth } from '../../auth/AuthContext';
import { api, tokenStore } from '../../auth/api';

const { Title, Text } = Typography;
const WS_URL = import.meta.env.VITE_WS_URL ?? 'http://localhost:3000';
const BINGO_LETTERS = ['B', 'I', 'N', 'G', 'O'];
/** Un color por columna, como las cartillas de toda la vida. */
const COL_COLORS = ['#0d9488', '#38bdf8', '#34d399', '#e8b84a', '#f0526b'];

/**
 * SPRINT C — BINGO SOCIAL v2.
 * Juego GRATIS entre usuarios registrados: creas tu sala, compartes el
 * código con tus amigos, el anfitrión canta los números y el sistema
 * detecta el BINGO automáticamente. Sin admin, sin dinero: pura reunión.
 */
export default function BingoFamiliar() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [msgApi, contextHolder] = message.useMessage();

  const [myRooms, setMyRooms] = useState([]);
  const [creating, setCreating] = useState(false);
  const [busy, setBusy] = useState(false);

  // Estado de la partida activa
  const [game, setGame] = useState(null); // { room, myCard, players }
  const [winner, setWinner] = useState(null);
  const [lastNumber, setLastNumber] = useState(null);
  const [calling, setCalling] = useState(false);
  const [auto, setAuto] = useState(false); // Cantar automático (anfitrión)
  const [speed, setSpeed] = useState(5); // Segundos entre números
  const [sound, setSound] = useState(true);
  const [hostGone, setHostGone] = useState(false); // El anfitrión cerró su pestaña
  const socketRef = useRef(null);
  const autoRef = useRef(null);
  const [createForm] = Form.useForm();
  const [joinForm] = Form.useForm();

  // ── Mis partidas ────────────────────────────────────────────────
  const loadMyRooms = () => {
    if (!user) return;
    api('/bingo/rooms/mine').then(setMyRooms).catch(() => {});
  };
  useEffect(loadMyRooms, [user]); // eslint-disable-line react-hooks/exhaustive-deps

  /**
   * Efecto de bola cantada: un "bip" corto con WebAudio (sin archivos que
   * descargar) + vibración en el celular. Es lo que convierte una lista de
   * números en un JUEGO: el aviso llega aunque no estés mirando la pantalla.
   */
  const playBeep = () => {
    if (!sound) return;
    try {
      const Ctx = window.AudioContext ?? window.webkitAudioContext;
      if (!Ctx) return;
      const ctx = new Ctx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = 'sine';
      osc.frequency.setValueAtTime(880, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(1320, ctx.currentTime + 0.12);
      gain.gain.setValueAtTime(0.18, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.35);
      osc.start();
      osc.stop(ctx.currentTime + 0.36);
      setTimeout(() => ctx.close(), 600);
    } catch { /* sin audio: el juego sigue igual */ }
    navigator.vibrate?.(80);
  };

  const playWinFanfare = () => {
    if (!sound) return;
    try {
      const Ctx = window.AudioContext ?? window.webkitAudioContext;
      if (!Ctx) return;
      const ctx = new Ctx();
      [523, 659, 784, 1047].forEach((freq, i) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.type = 'triangle';
        osc.frequency.value = freq;
        const t = ctx.currentTime + i * 0.13;
        gain.gain.setValueAtTime(0.0001, t);
        gain.gain.exponentialRampToValueAtTime(0.22, t + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
        osc.start(t);
        osc.stop(t + 0.32);
      });
      setTimeout(() => ctx.close(), 1200);
    } catch { /* silencio */ }
    navigator.vibrate?.([90, 60, 90, 60, 180]);
  };

  // ── Entrar a una sala (estado + socket) ─────────────────────────
  const enterRoom = async (roomId) => {
    try {
      // POST /enter: si no tenías cartón (y hay cupo), te lo reparte
      const state = await api(`/bingo/rooms/${roomId}/enter`, { method: 'POST' });
      setGame(state);
      setWinner(state.room.winner ?? null);
      setLastNumber(state.room.calledNumbers?.at(-1) ?? null);
      setHostGone(false);

      socketRef.current?.disconnect();
      const socket = io(`${WS_URL}/bingo`, {
        auth: { token: tokenStore.get() },
        transports: ['websocket'],
      });
      socketRef.current = socket;
      socket.emit('join_room', { roomId });

      socket.on('player_joined', ({ name }) => {
        msgApi.info(`👋 ${name} se unió a la sala`);
      });
      // La lista de jugadores se refresca sola (entradas y salidas)
      socket.on('room_update', ({ players }) => {
        setGame((g) => g && { ...g, players });
      });
      socket.on('number_called', ({ number, calledNumbers, players }) => {
        setLastNumber(number);
        playBeep();
        setGame((g) => g && {
          ...g,
          players: players ?? g.players, // Avance de todos, en vivo
          room: { ...g.room, calledNumbers, status: 'live' },
        });
      });
      socket.on('bingo_winner', (w) => {
        setWinner(w);
        stopAuto();
        playWinFanfare();
        setGame((g) => g && { ...g, room: { ...g.room, status: 'finished' } });
      });
      // RESCATE: el anfitrión se fue → cualquiera puede tomar el control
      socket.on('host_left', () => {
        setHostGone(true);
        stopAuto();
        msgApi.warning('El anfitrión salió de la sala — alguien puede tomar el control para seguir cantando.', 6);
      });
      socket.on('host_changed', ({ hostId, name }) => {
        setHostGone(false);
        msgApi.success(`🎪 ${name} es el nuevo anfitrión — la partida sigue.`);
        setGame((g) => g && {
          ...g,
          room: { ...g.room, hostId },
          players: g.players.map((p) => ({ ...p, isHost: p.userId === hostId })),
        });
      });

      // Revancha: cada quien recarga SU cartón nuevo
      socket.on('room_restarted', async () => {
        stopAuto();
        setWinner(null);
        setLastNumber(null);
        try {
          setGame(await api(`/bingo/rooms/${roomId}`));
          msgApi.success('🎲 ¡Nueva ronda! Cartones nuevos para todos.');
        } catch { /* se recupera al recargar */ }
      });
    } catch (err) {
      msgApi.error(err.message);
    }
  };

  useEffect(() => () => socketRef.current?.disconnect(), []);

  // ── Acciones ────────────────────────────────────────────────────
  const createRoom = async (values) => {
    setBusy(true);
    try {
      const { room } = await api('/bingo/rooms', { method: 'POST', body: values });
      setCreating(false);
      msgApi.success(`¡Sala creada! Comparte el código ${room.code} con tus amigos.`, 6);
      loadMyRooms();
      enterRoom(room._id);
    } catch (err) { msgApi.error(err.message); } finally { setBusy(false); }
  };

  const joinRoom = async ({ code }) => {
    setBusy(true);
    try {
      const { room, rejoined } = await api('/bingo/join', { method: 'POST', body: { code } });
      msgApi.success(rejoined ? '¡De vuelta a tu partida!' : `¡Dentro! Sala de ${room.title}`);
      joinForm.resetFields();
      loadMyRooms();
      enterRoom(room._id);
    } catch (err) { msgApi.error(err.message); } finally { setBusy(false); }
  };

  const callNumber = () => {
    setCalling(true);
    socketRef.current.emit('host_call', { roomId: game.room._id }, (ack) => {
      setCalling(false);
      if (!ack?.ok) {
        stopAuto();
        msgApi.error(ack?.error ?? 'Error al cantar');
      }
    });
  };

  /** Tomar el control cuando el anfitrión abandonó. */
  const claimHost = () => {
    socketRef.current.emit('claim_host', { roomId: game.room._id }, (ack) => {
      if (!ack?.ok) return msgApi.error(ack?.error ?? 'No se pudo tomar el control');
      setHostGone(false);
    });
  };

  const stopAuto = () => {
    clearInterval(autoRef.current);
    autoRef.current = null;
    setAuto(false);
  };

  /**
   * CANTAR AUTOMÁTICO: el anfitrión activa el reloj y los números salen
   * solos cada X segundos — así juega en vez de estar dando clicks. El
   * ritmo lo marca SU dispositivo: si cierra la pestaña, se pausa (nadie
   * queda cantando sin anfitrión).
   */
  const toggleAuto = (on) => {
    clearInterval(autoRef.current);
    setAuto(on);
    if (!on) return;
    callNumber();
    autoRef.current = setInterval(callNumber, speed * 1000);
  };

  // Cambiar la velocidad en caliente reinicia el reloj
  useEffect(() => {
    if (!auto) return;
    clearInterval(autoRef.current);
    autoRef.current = setInterval(callNumber, speed * 1000);
    return () => clearInterval(autoRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [speed]);

  useEffect(() => () => clearInterval(autoRef.current), []);

  /** REVANCHA: cartones nuevos para todos, misma sala y mismo código. */
  const restartRound = () => {
    socketRef.current.emit('host_restart', { roomId: game.room._id }, (ack) => {
      if (!ack?.ok) msgApi.error(ack?.error ?? 'No se pudo reiniciar');
    });
  };

  /** ABANDONAR: borra tu cartón. Si eres anfitrión, el rol se traspasa. */
  const leaveRoom = async () => {
    try {
      const res = await api(`/bingo/rooms/${game.room._id}/leave`, { method: 'POST' });
      msgApi.info(res.roomClosed
        ? 'Saliste y la sala se cerró (eras el último).'
        : res.hostTransferred
          ? 'Saliste — otro jugador quedó como anfitrión.'
          : 'Saliste de la sala.');
    } catch (err) { msgApi.error(err.message); }
    stopAuto();
    socketRef.current?.disconnect();
    setGame(null);
    setWinner(null);
    loadMyRooms();
  };

  const shareRoom = () => {
    const text = `🎉 ¡Únete a mi bingo en Misio! Entra a la sección "Bingo Gratis" y usa el código: ${game.room.code}`;
    navigator.clipboard?.writeText(text);
    msgApi.success('Invitación copiada — pégala en tu grupo 📋');
  };

  // ── Sin cuenta: el juego requiere registro (gratis) ─────────────
  if (!user) {
    return (
      <Result
        icon={<span style={{ fontSize: 64 }}>🎱</span>}
        title="Bingo entre amigos, 100% gratis"
        subTitle="Crea tu sala, comparte el código y jueguen juntos. Solo necesitas tu cuenta Misio (gratis, con tu DNI)."
        extra={
          <Button type="primary" size="large" icon={<LoginOutlined />}
            onClick={() => navigate('/login', { state: { from: '/bingo' } })}>
            Crear mi cuenta gratis
          </Button>
        }
      />
    );
  }

  const isHost = game && game.players.find((p) => p.isHost)?.userId === user._id;
  const called = new Set(game?.room?.calledNumbers ?? []);

  return (
    <div>
      {contextHolder}

      {/* ── Lobby ─────────────────────────────────────────────────── */}
      {!game && (
        <>
          <div style={{ textAlign: 'center', margin: '16px 0 28px' }}>
            <Title style={{ marginBottom: 8 }}>
              Bingo entre amigos <span className="prize-glow">GRATIS</span>
            </Title>
            <Text style={{ color: MISIO_COLORS.textMuted, fontSize: 16 }}>
              Crea tu sala, comparte el código y a jugar. El sistema canta BINGO por ustedes.
            </Text>
          </div>

          <Row gutter={[20, 20]}>
            <Col xs={24} md={12}>
              <Card title="🎪 Crear una sala" style={{ height: '100%' }}>
                <Text style={{ color: MISIO_COLORS.textMuted, display: 'block', marginBottom: 12 }}>
                  Tú serás el anfitrión: cantas los números y todos ven la partida en vivo.
                </Text>
                <Button type="primary" size="large" block icon={<PlusOutlined />}
                  onClick={() => { createForm.setFieldsValue({ maxPlayers: 10, winMode: 'line' }); setCreating(true); }}>
                  Crear sala de bingo
                </Button>
              </Card>
            </Col>
            <Col xs={24} md={12}>
              <Card title="🔑 Unirme con código" style={{ height: '100%' }}>
                <Form form={joinForm} onFinish={joinRoom}>
                  <Space.Compact block>
                    <Form.Item name="code" noStyle
                      rules={[{ required: true, message: 'Ingresa el código' }]}>
                      <Input placeholder="ZB-4F7K" size="large"
                        style={{ textTransform: 'uppercase' }} maxLength={12} />
                    </Form.Item>
                    <Button type="primary" size="large" htmlType="submit" loading={busy}>
                      Entrar
                    </Button>
                  </Space.Compact>
                </Form>
                <Text style={{ fontSize: 12, color: MISIO_COLORS.textMuted, display: 'block', marginTop: 10 }}>
                  El código te lo comparte quien creó la sala.
                </Text>
              </Card>
            </Col>
          </Row>

          {myRooms.length > 0 && (
            <Card title="🕹️ Mis partidas recientes" style={{ marginTop: 20 }} size="small">
              <List
                dataSource={myRooms}
                renderItem={(r) => (
                  <List.Item
                    actions={[
                      <Button key="go" size="small" type="primary"
                        disabled={r.status === 'finished'}
                        onClick={() => enterRoom(r._id)}>
                        {r.status === 'finished' ? 'Terminada' : 'Entrar'}
                      </Button>,
                    ]}
                  >
                    <List.Item.Meta
                      title={<Text style={{ fontSize: 13 }}>{r.title} <Text code>{r.code}</Text></Text>}
                      description={
                        <Text style={{ fontSize: 11, color: MISIO_COLORS.textMuted }}>
                          Anfitrión: {r.hostId?.name} · {r.status === 'finished'
                            ? `🏆 Ganó ${r.winner?.name ?? '—'}` : r.status === 'live' ? '🔴 En juego' : 'Esperando jugadores'}
                        </Text>
                      }
                    />
                  </List.Item>
                )}
              />
            </Card>
          )}
        </>
      )}

      {/* ── Partida activa ────────────────────────────────────────── */}
      {game && (
        <>
          {/* Cabecera de la sala */}
          <Card style={{ marginBottom: 16 }} styles={{ body: { padding: 14 } }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center' }}>
              <Title level={5} style={{ margin: 0, flex: '1 1 auto' }}>🎱 {game.room.title}</Title>
              <Tag color={MISIO_COLORS.electricBlue} style={{ fontSize: 14, padding: '3px 10px' }}>
                {game.room.code}
              </Tag>
              <Tooltip title="Copiar invitación">
                <Button size="small" icon={<CopyOutlined />} onClick={shareRoom} />
              </Tooltip>
              <Button size="small" icon={<WhatsAppOutlined />}
                href={`https://wa.me/?text=${encodeURIComponent(`🎉 ¡Únete a mi bingo en Misio! Código: ${game.room.code}`)}`}
                target="_blank" style={{ color: '#25D366', borderColor: '#25D366' }}>
                Invitar
              </Button>
              <Button size="small" onClick={() => {
                stopAuto(); socketRef.current?.disconnect(); setGame(null); setWinner(null); loadMyRooms();
              }}>
                Volver
              </Button>
              <Popconfirm
                title="¿Abandonar la sala?"
                description={isHost
                  ? 'Perderás tu cartón y otro jugador quedará como anfitrión.'
                  : 'Perderás tu cartón de esta partida.'}
                okText="Sí, abandonar" cancelText="No"
                onConfirm={leaveRoom}
              >
                <Button size="small" danger>Abandonar</Button>
              </Popconfirm>
            </div>
            <Text style={{ fontSize: 12, color: MISIO_COLORS.textMuted }}>
              {game.players.length}/{game.room.maxPlayers} jugadores · Gana con:{' '}
              {game.room.winMode === 'full' ? 'cartón lleno' : 'línea (fila, columna o diagonal)'}
            </Text>
          </Card>

          {/* Ganador */}
          {winner && (
            <Alert
              type="success" showIcon style={{ marginBottom: 16, borderColor: MISIO_COLORS.prizeGold }}
              icon={<TrophyFilled style={{ color: MISIO_COLORS.prizeGold }} />}
              message={<span className="prize-glow" style={{ fontWeight: 700, fontSize: 16 }}>
                ¡BINGOOO! 🎉 Ganó {winner.name}
              </span>}
              description={
                <Space direction="vertical" size={6}>
                  <Text style={{ fontSize: 12, color: MISIO_COLORS.textMuted }}>
                    Detectado automáticamente por el sistema — nadie tuvo que cantarlo.
                  </Text>
                  {isHost && (
                    <Button type="primary" icon={<ReloadOutlined />} onClick={restartRound}>
                      🎲 Jugar otra vez (cartones nuevos)
                    </Button>
                  )}
                  {!isHost && (
                    <Text style={{ fontSize: 12 }}>
                      Si el anfitrión inicia otra ronda, tu cartón nuevo llega solo.
                    </Text>
                  )}
                </Space>
              }
            />
          )}

          <Row gutter={[20, 20]}>
            {/* Mi cartón */}
            <Col xs={24} lg={14}>
              <Card
                title="🎫 Tu cartilla"
                extra={lastNumber && (
                  <div className="z-ball" key={lastNumber} title="Última bola cantada">
                    <div className="z-ball-inner">
                      <div className="z-ball-letter" style={{ color: COL_COLORS[Math.floor((lastNumber - 1) / 15)] }}>
                        {BINGO_LETTERS[Math.floor((lastNumber - 1) / 15)]}
                      </div>
                      <div className="z-ball-num">{lastNumber}</div>
                    </div>
                  </div>
                )}
              >
                {/* Cartilla: cabecera de colores + 25 casillas con rejilla.
                    El marcado usa "dauber" (sello translúcido): el número se
                    sigue leyendo debajo, como en un bingo de verdad. */}
                <div className="z-bingo-card">
                  <div className="z-bingo-grid" style={{ marginBottom: 4 }}>
                    {BINGO_LETTERS.map((l, i) => (
                      <div className="z-bingo-head" data-col={i} key={l}>{l}</div>
                    ))}
                  </div>
                  <div className="z-bingo-grid">
                    {[0, 1, 2, 3, 4].map((row) =>
                      [0, 1, 2, 3, 4].map((col) => {
                        const n = game.myCard.numbers[col * 5 + row];
                        const free = n === 0;
                        const marked = free || called.has(n);
                        const isLast = n === lastNumber;
                        return (
                          <div
                            key={`${row}-${col}`}
                            className={[
                              'z-bingo-cell',
                              marked && !free ? 'marked' : '',
                              free ? 'free' : '',
                              isLast ? 'last' : '',
                            ].filter(Boolean).join(' ')}
                          >
                            <span>{free ? '★ LIBRE' : n}</span>
                          </div>
                        );
                      }),
                    )}
                  </div>
                </div>

                {/* Progreso de la partida */}
                <Progress
                  percent={Math.round((game.room.calledNumbers.length / 75) * 100)}
                  showInfo={false}
                  strokeColor={MISIO_COLORS.primary}
                  style={{ marginTop: 12, marginBottom: 4 }}
                />
                <Text style={{ fontSize: 11, color: MISIO_COLORS.textMuted }}>
                  {game.room.calledNumbers.length} de 75 bolas cantadas
                </Text>

                {/* PANEL DEL ANFITRIÓN */}
                {isHost && !winner && (
                  <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
                    <Button type="primary" size="large" block loading={calling}
                      disabled={auto} onClick={callNumber} icon={<NotificationOutlined />}>
                      {auto ? 'Cantando automático…' : '📣 Cantar número'}
                    </Button>
                    <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                      <Space size={6}>
                        <Switch checked={auto} onChange={toggleAuto} />
                        <Text style={{ fontSize: 12 }}>Cantar solo</Text>
                      </Space>
                      <Select
                        size="small" value={speed} onChange={setSpeed} style={{ width: 108 }}
                        options={[
                          { value: 3, label: '⚡ Cada 3 s' },
                          { value: 5, label: '🎯 Cada 5 s' },
                          { value: 8, label: '🐢 Cada 8 s' },
                        ]}
                      />
                      <Space size={6} style={{ marginLeft: 'auto' }}>
                        <Switch size="small" checked={sound} onChange={setSound} />
                        <Text style={{ fontSize: 12 }}>🔊 Sonido</Text>
                      </Space>
                    </div>
                    <Text style={{ fontSize: 11, color: MISIO_COLORS.textMuted }}>
                      Con "cantar solo" las bolas salen a tu ritmo y tú también juegas
                      tu cartón. Se pausa si cierras esta pestaña.
                    </Text>
                  </div>
                )}
                {hostGone && !isHost && !winner && (
                  <Alert
                    type="warning"
                    showIcon
                    style={{ marginTop: 14 }}
                    message="El anfitrión salió de la sala"
                    description="Para que la partida siga, alguien tiene que cantar las bolas."
                    action={
                      <Button size="small" type="primary" onClick={claimHost}>
                        Tomar el control
                      </Button>
                    }
                  />
                )}

                {!isHost && !winner && !hostGone && (
                  <div style={{ marginTop: 12, display: 'flex', gap: 10, alignItems: 'center', justifyContent: 'center' }}>
                    <Text style={{ fontSize: 12, color: MISIO_COLORS.textMuted }}>
                      El anfitrión canta — tu cartón se marca solo.
                    </Text>
                    <Space size={6}>
                      <Switch size="small" checked={sound} onChange={setSound} />
                      <Text style={{ fontSize: 12 }}>🔊</Text>
                    </Space>
                  </div>
                )}
              </Card>
            </Col>

            {/* Jugadores + números cantados */}
            <Col xs={24} lg={10}>
              <Card title={`👥 Jugadores (${game.players.length})`} size="small">
                <List
                  dataSource={[...game.players].sort((a, b) => b.markedCount - a.markedCount)}
                  renderItem={(p) => (
                    <List.Item style={{ padding: '8px 0' }}>
                      <List.Item.Meta
                        avatar={<Avatar style={{ background: p.isHost ? MISIO_COLORS.prizeGold : MISIO_COLORS.primary }}
                          icon={p.isHost ? <CrownFilled /> : <UserOutlined />} />}
                        title={<Text style={{ fontSize: 13 }}>
                          {p.name} {p.isHost && <Tag color={MISIO_COLORS.prizeGold} style={{ fontSize: 10 }}>ANFITRIÓN</Tag>}
                        </Text>}
                      />
                      <Tag>{p.markedCount}/25</Tag>
                    </List.Item>
                  )}
                />
              </Card>

              <Card title="🔢 Tablero de bolas" size="small" style={{ marginTop: 16 }}>
                {game.room.calledNumbers.length === 0 ? (
                  <Text style={{ color: MISIO_COLORS.textMuted }}>Aún no empieza — ¡suerte!</Text>
                ) : (
                  <>
                    {/* Tablero completo 1-75 en 5 filas (B/I/N/G/O): de un
                        vistazo ves qué salió y qué falta, como el tablero
                        que cuelgan en los bingos. */}
                    {BINGO_LETTERS.map((letter, li) => (
                      <div className="z-board-row" key={letter}>
                        <div className="z-board-letter" style={{ background: COL_COLORS[li] }}>
                          {letter}
                        </div>
                        {Array.from({ length: 15 }, (_, k) => li * 15 + k + 1).map((n) => (
                          <div
                            key={n}
                            className={[
                              'z-board-num',
                              called.has(n) ? 'hit' : '',
                              n === lastNumber ? 'now' : '',
                            ].filter(Boolean).join(' ')}
                          >
                            {n}
                          </div>
                        ))}
                      </div>
                    ))}
                    <Text style={{ fontSize: 11, color: MISIO_COLORS.textMuted, display: 'block', marginTop: 8 }}>
                      {game.room.calledNumbers.length} cantadas · faltan {75 - game.room.calledNumbers.length}
                    </Text>
                  </>
                )}
              </Card>
            </Col>
          </Row>
        </>
      )}

      {/* ── Modal crear sala ──────────────────────────────────────── */}
      <Modal open={creating} onCancel={() => setCreating(false)} footer={null}
        title="🎪 Crear sala de bingo" destroyOnHidden>
        <Form form={createForm} layout="vertical" onFinish={createRoom} requiredMark={false}>
          <Form.Item name="title" label="Nombre de la sala (opcional)">
            <Input placeholder="Bingo familiar del domingo" maxLength={60} />
          </Form.Item>
          <Form.Item name="maxPlayers" label="¿Cuántos pueden jugar?"
            rules={[{ required: true, type: 'number', min: 2, max: 50 }]}>
            <InputNumber min={2} max={50} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="winMode" label="¿Cómo se gana?" rules={[{ required: true }]}>
            <Radio.Group>
              <Radio.Button value="line">📏 Línea</Radio.Button>
              <Radio.Button value="full">🃏 Cartón lleno</Radio.Button>
            </Radio.Group>
          </Form.Item>
          <Button type="primary" htmlType="submit" block size="large" loading={busy}>
            Crear y obtener mi código
          </Button>
        </Form>
      </Modal>
    </div>
  );
}
