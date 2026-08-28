import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import dayjs from 'dayjs';
import {
  Card, Col, Row, Typography, Tag, Button, Input, InputNumber, Radio, Modal,
  message, Alert, Space, Steps, Statistic, Divider, Popconfirm, Select, ConfigProvider, theme, Segmented, List, Avatar
} from 'antd';
import {
  PlayCircleFilled, TrophyFilled, ThunderboltFilled, SaveOutlined,
  CheckCircleFilled, ReloadOutlined, DownloadOutlined, InfoCircleOutlined,
  UserOutlined, FireOutlined, UpOutlined, DownOutlined,
} from '@ant-design/icons';
import { io } from 'socket.io-client';
import { MISIO_COLORS } from '../../theme/misioTheme';
import { toEmbedSrc } from '../../utils/stream';
import { api, tokenStore, SERVER_URL } from '../../auth/api';
import * as XLSX from 'xlsx';
import Roulette from '../../components/Roulette';

const { Title, Text } = Typography;
const WS_URL = (import.meta.env.VITE_WS_URL || SERVER_URL).replace(/\/api\/v1\/?$/, '');

/**
 * SPRINT 2 — PANEL ESPECIALIZADO DEL SORTEO (/admin/sorteo/:id).
 *
 * - Link de transmisión multi-plataforma, embebido aquí mismo.
 * - DOS MODOS de sorteo:
 *   🎪 PRESENCIAL: el admin gira la tómbola física, saca el boleto e
 *      ingresa su número; el sistema valida y sugiere aceptar el
 *      resultado (al agua o ganador) según la secuencia.
 *   💻 TÓMBOLA VIRTUAL: animación con todos los boletos y nombres
 *      parciales (BRAN… JUA… #1234); el sistema elige al azar.
 * - Al salir el ganador: resumen del cierre + "Finalizar sorteo".
 */
export default function AdminDrawPanel() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [msgApi, contextHolder] = message.useMessage();

  const [raffle, setRaffle] = useState(null);
  const [draws, setDraws] = useState([]);
  const [participants, setParticipants] = useState([]);
  const [activeCount, setActiveCount] = useState(0);
  const [diag, setDiag] = useState(null);
  const [fixOpen, setFixOpen] = useState(false);
  const [fixUsers, setFixUsers] = useState([]);
  const [fixForm, setFixForm] = useState({ userId: undefined, numbers: '' });
  const [fixing, setFixing] = useState(false);
  const [closing, setClosing] = useState(null);
  const [mode, setMode] = useState('virtual'); // 'virtual' | 'presencial'
  const [streamInput, setStreamInput] = useState('');
  const [formulaModal, setFormulaModal] = useState(false);
  const [manualNumber, setManualNumber] = useState(null);
  const [pendingConfirm, setPendingConfirm] = useState(null); // Tirada por confirmar (presencial)
  const [spinning, setSpinning] = useState(false);
  const [lastResult, setLastResult] = useState(null); // Última tirada (la ruleta apunta aquí)
  const [resultModal, setResultModal] = useState(null); // Modal "Aceptar resultado"
  const [busy, setBusy] = useState(false);
  const [activeTab, setActiveTab] = useState('resumen');
  // El ganador salió bien, pero el cierre (reembolsos + Logística) falló:
  // esto NUNCA debe pasar desapercibido, o "Gestionar envíos" sale vacío
  // sin que nadie sepa por qué.
  const [closingError, setClosingError] = useState(null);
  const [retryingClose, setRetryingClose] = useState(false);
  const [activePrizeIndex, setActivePrizeIndex] = useState(0);
  const [viewers, setViewers] = useState(0);
  const [streamCollapsed, setStreamCollapsed] = useState(false);
  const socketRef = useRef(null);
  const spinTimer = useRef(null);

  // ── Carga inicial + socket ──────────────────────────────────────
  /** Rescate de rifa atascada: boletos al agua → activos de nuevo. */
  const retryClose = async () => {
    setRetryingClose(true);
    try {
      await api(`/raffles/${id}/close`, { method: 'POST' });
      msgApi.success('Cierre completado — reembolsos y Logística al día ✓');
      setClosingError(null);
      loadState();
    } catch (err) { msgApi.error(err.message); } finally { setRetryingClose(false); }
  };

  const openFix = async () => {
    setFixOpen(true);
    try {
      const users = await api('/users');
      setFixUsers(Array.isArray(users) ? users : (users.items ?? []));
    } catch { /* si falla, se puede escribir el ID igual */ }
  };

  const submitFix = async () => {
    setFixing(true);
    try {
      const numbers = fixForm.numbers.split(/[\s,]+/).map((n) => parseInt(n, 10)).filter((n) => n > 0);
      if (!fixForm.userId) { msgApi.error('Elige el usuario'); setFixing(false); return; }
      if (!numbers.length) { msgApi.error('Escribe los números, ej: 1 2 3'); setFixing(false); return; }
      const res = await api('/tickets/admin-add', {
        method: 'POST',
        body: { raffleId: id, userId: fixForm.userId, ticketNumbers: numbers },
      });
      msgApi.success(`${res.created} boleto(s) agregados${res.skipped ? ` (${res.skipped} ya existían)` : ''}`);
      setFixForm({ userId: undefined, numbers: '' });
      setFixOpen(false);
      loadState();
    } catch (err) { msgApi.error(err.message); }
    finally { setFixing(false); }
  };

  const downloadTickets = () => {
    if (!participants.length) return msgApi.warning('No hay participantes');
    const data = participants.map(p => ({
      Boleto: `#${String(p.ticketNumber).padStart(4, '0')}`,
      Usuario: p.user?.name || 'Anónimo',
      DNI: p.user?.dni || '-',
      Estado: p.status
    }));
    const worksheet = XLSX.utils.json_to_sheet(data);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Boletos');
    XLSX.writeFile(workbook, `boletos_rifa_${id}.xlsx`);
  };

  const recount = async () => {
    try {
      const res = await api('/tickets/admin-recount', { method: 'POST', body: { raffleId: id } });
      msgApi.success(`Contador corregido: ${res.soldCount} boletos reales`);
      loadState();
    } catch (err) { msgApi.error(err.message); }
  };

  const resetDraws = async () => {
    try {
      const res = await api(`/raffles/${id}/reset-draws`, {
        method: 'POST',
        body: isPaquete ? { prizeIndex: activePrizeIndex } : {}
      });
      socketRef.current?.emit('reset_draws', { raffleId: id });
      msgApi.success(res.mensaje ?? 'Tiradas reiniciadas');
      loadState();
    } catch (err) { msgApi.error(err.message); }
  };

  const loadState = async () => {
    const state = await api(`/live/${id}`);
    setRaffle(state.raffle);
    setDraws(state.draws);
    setParticipants(state.participants);
    // Conteo real (sin el tope de 200 de la lista de participantes): de
    // aquí depende si se puede girar la tómbola.
    setActiveCount(state.activeCount ?? 0);
    // Si la tómbola está vacía, pedir el diagnóstico: ¿nadie compró, todo
    // se quemó, o hay compras Yape pendientes de confirmar?
    if ((state.activeCount ?? 0) === 0) {
      api(`/raffles/${id}/diagnostics`).then(setDiag).catch(() => {});
    } else {
      setDiag(null);
    }
    setStreamInput(state.raffle.streamUrl ?? '');
  };

  useEffect(() => {
    loadState().catch((e) => msgApi.error(e.message));
    const socket = io(`${WS_URL}/live`, {
      // El token se lee en cada (re)conexión con una función, no una vez:
      // así si expiró y se renovó, la reconexión usa el nuevo. Sin esto,
      // tras 2h el socket seguía mandando el token viejo y las tiradas
      // fallaban con "sin token" mientras la pantalla seguía cargando.
      auth: (cb) => cb({ token: tokenStore.get() }),
      transports: ['websocket'],
      reconnection: true,
      reconnectionAttempts: 5,
    });
    socketRef.current = socket;
    socket.emit('join_raffle', { raffleId: id });
    socket.on('draw_result', (r) => {
      if (r.isManual) {
        setDraws((prev) => [...prev, r]);
      } else {
        // Retrasamos 6500ms para que se actualice la lista de fondo exactamente 
        // al mismo tiempo que aparece el modal (4000ms ruleta + 2500ms animación bolilla).
        setTimeout(() => setDraws((prev) => {
          if (prev.some(d => d.ticketNumber === r.ticketNumber && d.attempt === r.attempt)) return prev;
          return [...prev, r];
        }), 6500);
      }
    });
    socket.on('raffle_completed', (summary) => setClosing(summary));
    socket.on('stats', (s) => setViewers(s.viewers));
    socket.on('connect_error', (err) =>
      msgApi.error(`Conexión del sorteo: ${err.message}. Recarga la página si persiste.`));
    return () => { socket.disconnect(); clearTimeout(spinTimer.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const activeParticipants = useMemo(
    () => participants.filter((p) => p.status === 'active'),
    [participants],
  );

  const isPaquete = raffle?.type === 'paquete';
  const targetPrize = isPaquete ? raffle?.prizes?.[activePrizeIndex] : raffle;
  
  const prizeDraws = draws.filter(d => isPaquete ? d.prizeIndex === activePrizeIndex : true);
  const currentAttempt = prizeDraws.length + 1;
  const total = targetPrize?.winningAttempt ?? 1;
  const isWinnerTurn = currentAttempt >= total || activeCount === 1;
  
  const finishedPrize = !!targetPrize?.winner || prizeDraws.some((d) => d.result === 'winner');
  const finishedRaffle = raffle?.status === 'completed';
  const daysLeft = raffle ? dayjs(raffle.drawDate).diff(dayjs(), 'day') : 0;

  // ── Acciones ────────────────────────────────────────────────────
  const goLive = async () => {
    setBusy(true);
    try {
      await api(`/raffles/${id}/status`, { method: 'PATCH', body: { status: 'live' } });
      setRaffle((r) => ({ ...r, status: 'live' }));
      msgApi.success('¡Rifa EN VIVO! Ya puedes tirar la tómbola.');
    } catch (e) { msgApi.error(e.message); } finally { setBusy(false); }
  };

  const cancelLive = async () => {
    setBusy(true);
    try {
      await api(`/raffles/${id}/status`, { method: 'PATCH', body: { status: 'active' } });
      setRaffle((r) => ({ ...r, status: 'active' }));
      msgApi.success('Sorteo regresado a ventas correctamente.');
    } catch (e) { msgApi.error(e.message); } finally { setBusy(false); }
  };

  const finalizeRaffle = async () => {
    setBusy(true);
    try {
      socketRef.current?.emit('close_room', { raffleId: id });
      await api(`/raffles/${id}/status`, { method: 'PATCH', body: { status: 'completed' } });
      msgApi.success('Sorteo marcado como finalizado correctamente.');
      navigate('/admin/rifas');
    } catch (e) { msgApi.error(e.message); } finally { setBusy(false); }
  };

  const saveStream = async () => {
    setBusy(true);
    try {
      const updated = await api(`/raffles/${id}/stream`, { method: 'PATCH', body: { streamUrl: streamInput } });
      setRaffle((r) => ({ ...r, streamUrl: updated.streamUrl }));
      setStreamInput(updated.streamUrl);
      msgApi.success(`Link ${updated._platform === 'otro' ? '' : `de ${updated._platform} `}convertido a formato embed y guardado ✓`);
    } catch (e) { msgApi.error(e.message); } finally { setBusy(false); }
  };

  /**
   * RULETA VIRTUAL: la rueda arranca a girar "a ciegas" y ~2.4s después
   * llega la tirada del servidor — la ruleta desacelera y se detiene
   * apuntando al boleto sorteado. Luego se muestra el modal de resultado.
   */
  const spinVirtual = () => {
    if (activeCount === 0) return msgApi.warning('No hay boletos activos');
    if (finishedPrize) return msgApi.warning('El sorteo de este premio ya terminó');
    setLastResult(null);
    setSpinning(true);
    socketRef.current.emit('presenter_draw', { 
      raffleId: id,
      prizeIndex: isPaquete ? activePrizeIndex : -1
    }, (ack) => {
      if (!ack?.ok) {
        setSpinning(false);
        return msgApi.error(ack?.error ?? 'Error en la tirada');
      }
      // Delay artificial de 4 segundos para darle drama a la tómbola
      setTimeout(() => {
        setSpinning(false);
        setLastResult(ack.result);
        // El modal sale DESPUÉS de que la bolilla gigante emerja
        setTimeout(() => setResultModal(ack.result), 2500);
        if (ack.result?.closingError) setClosingError(ack.result.closingError);
      }, 4000);
    });
  };

  /** PRESENCIAL paso 1: sugerir la aceptación antes de registrar. */
  const askManual = () => {
    if (!manualNumber) return msgApi.warning('Ingresa el número del boleto que salió');
    setPendingConfirm({ ticketNumber: manualNumber, isWinner: isWinnerTurn, attempt: currentAttempt });
  };

  /** PRESENCIAL paso 2: registrar en el sistema. */
  const confirmManual = () => {
    setBusy(true);
    socketRef.current.emit(
      'presenter_draw_manual',
      { 
        raffleId: id, 
        ticketNumber: pendingConfirm.ticketNumber,
        prizeIndex: isPaquete ? activePrizeIndex : -1
      },
      (ack) => {
        setBusy(false);
        setPendingConfirm(null);
        if (!ack?.ok) return msgApi.error(ack?.error ?? 'Error al registrar');
        setLastResult(ack.result);
        setResultModal(ack.result);
        setManualNumber(null);
        if (ack.result?.closingError) setClosingError(ack.result.closingError);
        loadState().catch(() => {});
      },
    );
  };

  if (!raffle) {
    return <Alert type="info" showIcon message="Cargando sorteo… (requiere backend activo)" />;
  }

  return (
    <div>
      {contextHolder}

      {/* ── Cabecera ──────────────────────────────────────────────── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 16 }}>
        <Space wrap>
          <Title level={4} style={{ margin: 0 }}>🎪 Sorteo — {raffle.title}</Title>
          {raffle.status === 'live'
            ? <Tag color={MISIO_COLORS.danger} style={{ margin: 0 }}>🔴 EN VIVO</Tag>
            : raffle.status === 'completed'
              ? <Tag color={MISIO_COLORS.prizeGold} style={{ margin: 0 }}>🏆 FINALIZADO</Tag>
              : <Tag color="processing" style={{ margin: 0 }}>En venta</Tag>}
          
          <Button 
            type="text" 
            size="small"
            icon={<InfoCircleOutlined />} 
            onClick={() => setFormulaModal(true)}
            style={{ color: MISIO_COLORS.electricBlue, marginLeft: 8 }}
          >
            Fórmula de Azar
          </Button>
        </Space>

        <Space wrap>
          <Button icon={<DownloadOutlined />} onClick={downloadTickets}>
            Descargar Lista
          </Button>

          {(!raffle.refundsProcessed) && (
            <Popconfirm
              title="¿Devolver al juego los boletos jugados?"
              description={isPaquete
                ? `Se borrará el ganador (si lo hay) y todos los boletos volverán a estar activos SOLO para el premio seleccionado (${targetPrize?.title}).`
                : "Se borrará el ganador (si lo hay) y todos los boletos volverán a estar activos. La tómbola empezará desde 0."
              }
              okText="Reiniciar tiradas" cancelText="No"
              onConfirm={resetDraws}
            >
              <Button danger icon={<ReloadOutlined />}>
                Reiniciar tiradas
              </Button>
            </Popconfirm>
          )}

          {raffle.status === 'live' && !finishedRaffle && (
            <>
              <Button onClick={cancelLive} loading={busy}>
                Cancelar En Vivo
              </Button>
              <Button 
                type="primary" 
                icon={<CheckCircleFilled />} 
                onClick={finalizeRaffle} 
                loading={busy}
                disabled={isPaquete ? !raffle.prizes?.every(p => p.winner) : !raffle.winner}
              >
                Finalizar sorteo
              </Button>
            </>
          )}
        </Space>
      </div>

      {/* ⚠️ El ganador salió pero el cierre falló: reembolsos y Logística
          quedaron pendientes. Nunca pasa desapercibido — con botón para
          reintentar sin duplicar nada (el candado interno lo protege). */}
      {(closingError || (raffle.status === 'completed' && raffle.refundsProcessed !== true)) && (
        <Alert
          type="error"
          showIcon
          closable
          onClose={() => setClosingError(null)}
          style={{ marginBottom: 16 }}
          message="El ganador quedó registrado, pero el cierre está pendiente o falló"
          description={
            <Space direction="vertical" size={6}>
              <Text style={{ fontSize: 12 }}>
                Los reembolsos Cero Pérdida y la asignación en Logística no se han
                completado. Detalle: {closingError || 'Falta ejecutar el cierre de la rifa.'}
              </Text>
              <Button size="small" type="primary" danger loading={retryingClose} onClick={retryClose}>
                Reintentar cierre
              </Button>
            </Space>
          }
        />
      )}

      {/* Sugerencia de días restantes + iniciar */}
      {raffle.status === 'active' && (
        <Alert
          type={daysLeft > 0 ? 'warning' : 'success'}
          showIcon
          style={{ marginBottom: 16 }}
          message={
            daysLeft > 0
              ? `📅 El sorteo está programado para dentro de ${daysLeft} día(s) (${dayjs(raffle.drawDate).format('DD/MM HH:mm')}). Puedes iniciarlo igual cuando quieras.`
              : '✅ ¡Hoy es el día programado del sorteo!'
          }
          action={
            <Button type="primary" danger icon={<PlayCircleFilled />} loading={busy} onClick={goLive}>
              Iniciar sorteo AHORA
            </Button>
          }
        />
      )}


      <Card
        style={{
          marginBottom: 24,
          borderRadius: 20,
          background: 'radial-gradient(ellipse at 50% 0%, rgba(30, 41, 59, 0.65) 0%, rgba(15, 23, 42, 0.9) 100%)',
          border: '1px solid rgba(255, 255, 255, 0.12)',
          boxShadow: '0 20px 50px rgba(0, 0, 0, 0.5)',
          overflow: 'hidden',
          backdropFilter: 'blur(12px)',
        }}
        styles={{
          header: {
            borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
            padding: '20px 28px',
            background: 'rgba(15, 23, 42, 0.4)',
          },
          body: { padding: '28px' },
        }}
        title={
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 19, fontWeight: 900, color: '#F8FAFC', display: 'flex', alignItems: 'center', gap: 10, letterSpacing: 0.3 }}>
                <FireOutlined style={{ color: MISIO_COLORS.prizeGold, fontSize: 22 }} /> SECUENCIA Y RESULTADOS DE TIRADAS
              </span>
              <Tag
                style={{
                  background: 'rgba(56, 189, 248, 0.15)',
                  color: '#38BDF8',
                  borderColor: 'rgba(56, 189, 248, 0.3)',
                  fontSize: 12,
                  fontWeight: 800,
                  padding: '3px 14px',
                  borderRadius: 24,
                  letterSpacing: 0.5,
                }}
              >
                RONDA {Math.min(currentAttempt, total)} / {total}
              </Tag>
              
              {isPaquete && (
                <ConfigProvider theme={{ 
                  algorithm: theme.darkAlgorithm, 
                  token: { 
                    colorBgContainer: 'rgba(30, 41, 59, 0.8)', 
                    colorBorder: 'rgba(255, 255, 255, 0.2)',
                    colorBgElevated: '#1e293b',
                    colorText: '#ffffff',
                    controlItemBgActive: '#0f172a',
                    controlItemBgHover: '#334155'
                  } 
                }}>
                  <Select 
                    value={activePrizeIndex} 
                    onChange={(val) => {
                      setActivePrizeIndex(val);
                      setLastResult(null);
                    }}
                    style={{ width: 220 }}
                    options={raffle.prizes.map((p, i) => {
                      const firstUnfinished = raffle.prizes.findIndex(pr => !pr.winner);
                      const isFuture = firstUnfinished !== -1 && i > firstUnfinished;
                      return {
                        label: `Premio ${i + 1}: ${p.title}`,
                        value: i,
                        disabled: isFuture
                      };
                    })}
                  />
                </ConfigProvider>
              )}</div>
          </div>
        }
      >
        {/* Grid UX/UI optimizado con alta legibilidad, contraste y jerarquía de datos */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(310px, 1fr))',
            gap: 24,
            width: '100%',
          }}
        >
          {Array.from({ length: total }, (_, i) => {
            const d = prizeDraws[i];
            const winnerStep = i + 1 === total;
            const isCurrentPending = !d && i === prizeDraws.length;

            return (
              <div
                key={i}
                style={{
                  position: 'relative',
                  borderRadius: 14,
                  padding: '12px 16px',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                  transition: 'all 0.35s cubic-bezier(0.4, 0, 0.2, 1)',
                  minHeight: 90,
                  overflow: 'hidden',
                  ...(winnerStep && d ? {
                    background: 'radial-gradient(ellipse at 50% 0%, rgba(234, 179, 8, 0.28) 0%, rgba(20, 14, 2, 0.95) 85%)',
                    border: '2px solid #FACC15',
                    boxShadow: '0 15px 35px -5px rgba(234, 179, 8, 0.35), inset 0 1px 0 0 rgba(255, 255, 255, 0.3)',
                  } : d ? {
                    background: 'radial-gradient(circle at top left, rgba(14, 165, 233, 0.16) 0%, rgba(15, 23, 42, 0.95) 100%)',
                    border: '1px solid rgba(56, 189, 248, 0.35)',
                    boxShadow: '0 10px 30px -10px rgba(0, 0, 0, 0.6), inset 0 1px 0 0 rgba(255, 255, 255, 0.1)',
                  } : {
                    background: isCurrentPending ? 'radial-gradient(circle at center, rgba(56, 189, 248, 0.07) 0%, rgba(15, 23, 42, 0.6) 100%)' : 'rgba(15, 23, 42, 0.4)',
                    border: isCurrentPending ? '2px dashed rgba(56, 189, 248, 0.5)' : '1px dashed rgba(255, 255, 255, 0.1)',
                    opacity: d ? 1 : isCurrentPending ? 1 : 0.5,
                  }),
                }}
              >
                {/* Luz ambiental decorativa superior para ganadora */}
                {winnerStep && d && (
                  <div style={{ position: 'absolute', top: -30, left: '50%', transform: 'translateX(-50%)', width: '70%', height: 50, background: 'radial-gradient(circle, rgba(250,204,21,0.6) 0%, rgba(250,204,21,0) 70%)', pointerEvents: 'none' }} />
                )}

                {/* 1. Header Strip: Número de ronda y Tipo de Tirada */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6, zIndex: 1 }}>
                  <div
                    style={{
                      fontSize: 10,
                      fontWeight: 800,
                      padding: '3px 10px',
                      borderRadius: 30,
                      letterSpacing: '0.5px',
                      textTransform: 'uppercase',
                      ...(winnerStep && d ? {
                        background: 'linear-gradient(90deg, #FACC15 0%, #EAB308 100%)',
                        color: '#0F172A',
                        boxShadow: '0 2px 10px rgba(234, 179, 8, 0.4)',
                      } : d ? {
                        background: 'rgba(14, 165, 233, 0.2)',
                        color: '#38BDF8',
                        border: '1px solid rgba(56, 189, 248, 0.35)',
                      } : {
                        background: 'rgba(255, 255, 255, 0.08)',
                        color: '#94A3B8',
                      }),
                    }}
                  >
                    0{i + 1} / RONDA
                  </div>

                  <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: 0.3 }}>
                    {winnerStep ? (
                      <span style={{ color: '#FACC15', display: 'flex', alignItems: 'center', gap: 4, textShadow: '0 0 10px rgba(250, 204, 21, 0.5)' }}>
                        <TrophyFilled style={{ fontSize: 14 }} /> PREMIO MAYOR
                      </span>
                    ) : (
                      <span style={{ color: d ? '#38BDF8' : '#64748B', display: 'flex', alignItems: 'center', gap: 4, fontWeight: 700 }}>
                        <span style={{ fontSize: 13 }}>💧</span> Al Agua
                      </span>
                    )}
                  </div>
                </div>

                {/* 2. Core Display (F-Pattern Anchor): Ticket & Participante */}
                <div style={{ padding: '4px 0', flexGrow: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', zIndex: 1 }}>
                  {d ? (
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <div>
                        <div style={{ fontSize: 10, fontWeight: 700, color: winnerStep ? '#FDE047' : '#64748B', letterSpacing: '1px', textTransform: 'uppercase', marginBottom: 0 }}>
                          TICKET
                        </div>
                        <div
                          style={{
                            fontSize: winnerStep ? 28 : 24,
                            fontWeight: 900,
                            lineHeight: 1,
                            color: winnerStep ? '#FFF' : '#F8FAFC',
                            textShadow: winnerStep ? '0 0 20px rgba(250, 204, 21, 0.7)' : '0 2px 10px rgba(0, 0, 0, 0.4)',
                            fontFamily: 'monospace',
                            letterSpacing: '-0.5px',
                          }}
                        >
                          #{String(d.ticketNumber).padStart(4, '0')}
                        </div>
                      </div>

                      {/* Pill del participante */}
                      <div
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 6,
                          background: winnerStep ? 'rgba(250, 204, 21, 0.15)' : 'rgba(255, 255, 255, 0.06)',
                          border: winnerStep ? '1px solid rgba(250, 204, 21, 0.35)' : '1px solid rgba(255, 255, 255, 0.1)',
                          padding: '4px 10px',
                          borderRadius: 20,
                        }}
                      >
                        <UserOutlined style={{ color: winnerStep ? '#FACC15' : '#38BDF8', fontSize: 12 }} />
                        <span style={{ fontSize: 13, fontWeight: 700, color: '#F1F5F9', maxWidth: 100, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {d.holderName || 'Cliente'}
                        </span>
                      </div>
                    </div>
                  ) : (
                    <div style={{ textAlign: 'center', padding: '4px 0', color: isCurrentPending ? '#38BDF8' : '#64748B' }}>
                      <div style={{ fontSize: 22, marginBottom: 2, opacity: isCurrentPending ? 1 : 0.4 }}>
                        {isCurrentPending ? '🎱' : '⏳'}
                      </div>
                      <div style={{ fontSize: 13, fontWeight: 700, color: isCurrentPending ? '#E2E8F0' : '#64748B' }}>
                        {isCurrentPending ? 'En juego: lista para girar' : 'Pendiente en secuencia'}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </Card>

      <Row gutter={[20, 20]} style={{ display: 'flex', alignItems: 'stretch' }}>

        {/* ── Panel de tirada ──────────────────────────────────────── */}
        <Col xs={24} lg={16} style={{ display: 'flex', flexDirection: 'column' }}>
          <Row gutter={[20, 20]} style={{ display: 'flex', alignItems: 'stretch', flex: 1 }}>
            {/* ── Lado Izquierdo: Estadísticas y Participantes ── */}
            <Col xs={24} md={13} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <Segmented
                options={[
                  { label: 'Estadística', value: 'resumen' },
                  { label: 'En Juego', value: 'en_juego' },
                  { label: 'Al Agua', value: 'al_agua' },
                  { label: 'Ganadores', value: 'ganadores' }
                ]}
                value={activeTab}
                onChange={setActiveTab}
                block
                size="large"
              />
              <Card
                title={
                  <span>
                    <ThunderboltFilled style={{ color: MISIO_COLORS.primary }} /> Estadística del Sorteo
                    {isPaquete && targetPrize && (
                      <span style={{ marginLeft: 6, fontWeight: 'normal', color: MISIO_COLORS.textMuted, fontSize: 14 }}>
                        — Viendo: {targetPrize.title}
                      </span>
                    )}
                  </span>
                }
                style={{ flex: 1, display: 'flex', flexDirection: 'column' }}
                styles={{ body: { flex: 1, display: 'flex', flexDirection: 'column' } }}
              >

                {activeTab === 'resumen' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 24, alignItems: 'center', justifyContent: 'center', flex: 1, textAlign: 'center' }}>
                    <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', justifyContent: 'center' }}>
                      <Statistic title={<Text style={{ color: MISIO_COLORS.textMuted, fontSize: 12, lineHeight: 1 }}>🎱 En juego</Text>}
                        value={activeCount} valueStyle={{ color: MISIO_COLORS.electricBlue, fontSize: 18, fontWeight: 700, lineHeight: 1, marginTop: 4 }} />
                      <Statistic title={<Text style={{ color: MISIO_COLORS.textMuted, fontSize: 12, lineHeight: 1 }}>💧 Al agua</Text>}
                        value={participants.filter(p => p.status === 'burned_al_agua').length} valueStyle={{ color: '#94a3b8', fontSize: 18, fontWeight: 700, lineHeight: 1, marginTop: 4 }} />
                      <Statistic title={<Text style={{ color: MISIO_COLORS.textMuted, fontSize: 12, lineHeight: 1 }}>🏆 Ganadores</Text>}
                        value={participants.filter(p => p.status === 'winner').length} valueStyle={{ color: MISIO_COLORS.prizeGold, fontSize: 18, fontWeight: 700, lineHeight: 1, marginTop: 4 }} />
                      <Statistic title={<Text style={{ color: MISIO_COLORS.textMuted, fontSize: 12, lineHeight: 1 }}>👀 Espectadores</Text>}
                        value={viewers} valueStyle={{ color: '#fca5a5', fontSize: 18, fontWeight: 700, lineHeight: 1, marginTop: 4 }} />
                    </div>
                    
                    <Statistic title={<Text style={{ color: MISIO_COLORS.textMuted }}>Próxima tirada</Text>}
                      value={finishedPrize ? '🏁 Sorteo finalizado' : isWinnerTurn ? '🏆 GANADORA' : `${currentAttempt} (al agua)`}
                      valueStyle={{ color: finishedPrize ? MISIO_COLORS.green : isWinnerTurn ? MISIO_COLORS.prizeGold : MISIO_COLORS.electricBlue, fontSize: 18 }} />

                    {/* ¿Tómbola en 0? El diagnóstico dice POR QUÉ y qué hacer */}
                    {activeCount === 0 && diag && (
                      <Alert
                        type={diag.pendingPurchases > 0 ? 'warning' : 'info'}
                        showIcon
                        style={{ marginTop: 12 }}
                        message={
                          diag.pendingPurchases > 0
                            ? `Hay ${diag.pendingPurchases} compra(s) por Yape PENDIENTES de confirmar`
                            : diag.sold === 0
                              ? 'Nadie ha comprado boletos en esta rifa todavía'
                              : diag.burned > 0 && diag.active === 0
                                ? `Los ${diag.burned} boleto(s) vendidos se quemaron en tiradas al agua`
                                : 'Sin boletos activos'
                        }
                        description={
                          diag.pendingPurchases > 0 ? (
                            <span>
                              Los boletos {diag.pendingNumbers.map((n) => `#${n}`).join(', ')} NO se crean
                              hasta que confirmes el pago. Ve a{' '}
                              <a onClick={() => navigate('/admin/pagos')}>Admin → Pagos</a> y confírmalos —
                              al confirmar, los boletos aparecen aquí al instante.
                            </span>
                          ) : diag.sold === 0 ? (
                            'Cuando alguien pague con saldo (o confirmes un pago Yape), sus boletos entran a la tómbola.'
                          ) : (
                            'Usa "Reiniciar tiradas" para devolver los boletos quemados al juego.'
                          )
                        }
                        action={
                          <Space direction="vertical">
                            <Button size="small" type="primary" onClick={openFix}>🔧 Agregar boletos a mano</Button>
                            <Button size="small" onClick={recount}>Recontar</Button>
                          </Space>
                        }
                      />
                    )}
                  </div>
                )}

                {['en_juego', 'al_agua', 'ganadores'].includes(activeTab) && (
                  <div style={{ flex: 1, overflowY: 'auto', maxHeight: 400, paddingRight: 8 }} className="custom-scrollbar">
                    <List
                      grid={{ gutter: [12, 12], column: 2 }}
                      split={false}
                      dataSource={participants.filter(p => 
                        activeTab === 'en_juego' ? p.status === 'active' :
                        activeTab === 'al_agua' ? p.status === 'burned_al_agua' :
                        p.status === 'winner'
                      )}
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
                                <Avatar size={20} style={{ backgroundColor: '#ffffff', color: p.isOffline ? '#ff4d4f' : '#008b8b', border: '1px solid #e8e8e8', fontSize: 11, flexShrink: 0 }}>
                                  {(p.unmaskedName || p.user?.name || p.name || 'C').charAt(0).toUpperCase()}
                                </Avatar>
                                <Text strong style={{ fontSize: 12, color: '#1a1a1a' }} ellipsis>
                                  {p.unmaskedName || p.user?.name || p.name || 'Cliente Misio'}
                                </Text>
                                {p.isOffline && <span style={{ backgroundColor: '#ffe5e5', color: '#ff4d4f', fontSize: 9, padding: '2px 4px', borderRadius: 4, fontWeight: 'bold', flexShrink: 0 }}>POS</span>}
                              </div>

                              {/* Línea punteada divisoria */}
                              <div style={{ position: 'absolute', right: 54, top: 12, bottom: 12, borderRight: '1px dashed #cfdfde' }} />
                            </div>

                            {/* Lado derecho (Número) */}
                            <div style={{ 
                              width: 54, flexShrink: 0,
                              background: p.status === 'winner' ? 'linear-gradient(135deg, #f6d365 0%, #fda085 100%)' : p.status === 'burned_al_agua' ? 'linear-gradient(135deg, #a8aaad 0%, #76787a 100%)' : 'linear-gradient(135deg, #009688 0%, #005f73 100%)', 
                              display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', 
                              padding: '8px 2px', color: '#fff'
                            }}>
                              <Text style={{ color: 'rgba(255,255,255,0.85)', fontSize: 7, fontWeight: 600, letterSpacing: 0, marginBottom: 2 }}>BOLETO</Text>
                              <Text style={{ color: '#fff', fontSize: 14, fontWeight: 800, lineHeight: 1, marginBottom: 2 }}>
                                {String(p.ticketNumber).padStart(3, '0')}
                              </Text>
                              <Text style={{ color: 'rgba(255,255,255,0.7)', fontSize: 7 }}>{p.status === 'active' ? 'EN JUEGO' : p.status === 'winner' ? 'GANADOR' : 'AL AGUA'}</Text>
                            </div>
                          </div>
                        </List.Item>
                      )}
                    />
                  </div>
                )}
              </Card>
            </Col>

            {/* ── Lado Derecho: Controles de la Tómbola ── */}
            <Col xs={24} md={11} style={{ display: 'flex', flexDirection: 'column' }}>
              <Card
                title="Tómbola de Sorteo"
                extra={
                  <Radio.Group value={mode} onChange={(e) => setMode(e.target.value)} size="small">
                    <Radio.Button value="virtual">💻 Tómbola virtual</Radio.Button>
                    <Radio.Button value="presencial">🎪 Presencial</Radio.Button>
                  </Radio.Group>
                }
                style={{ flex: 1, borderColor: MISIO_COLORS.primary, display: 'flex', flexDirection: 'column' }}
                styles={{ body: { flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' } }}
              >
                {mode === 'presencial' ? (
                  <div style={{ width: '100%', maxWidth: 340 }}>
                    <Text style={{ color: MISIO_COLORS.textMuted, display: 'block', marginBottom: 8 }}>
                      Gira tu tómbola física, saca el boleto e ingresa su número:
                    </Text>
                    <Space.Compact block>
                      <InputNumber
                        min={1} max={raffle.totalTickets}
                        placeholder="N° del boleto que salió"
                        value={manualNumber}
                        onChange={setManualNumber}
                        style={{ flex: 1 }}
                        size="large"
                      />
                      <Button type="primary" size="large" disabled={raffle.status !== 'live' || finishedPrize} onClick={askManual}>
                        Registrar
                      </Button>
                    </Space.Compact>
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: '100%' }}>
                    {/* RULETA VISIBLE: gira y se detiene en el boleto sorteado */}
                    <Roulette
                      participants={activeParticipants}
                      spinning={spinning}
                      result={lastResult}
                      size={Math.min(300, window.innerWidth - 90)}
                    />
                    <Button
                      type="primary" block loading={spinning}
                      disabled={raffle.status !== 'live' || finishedPrize}
                      onClick={spinVirtual}
                      style={{ marginTop: 24, height: 48, fontSize: 16, fontWeight: 'bold' }}
                    >
                      {finishedPrize 
                        ? '🏆 Sorteo finalizado' 
                        : `🎲 Girar tómbola — tirada ${Math.min(currentAttempt, total)}${isWinnerTurn ? ' ¡GANADORA!' : ' (al agua)'}`}
                    </Button>
                  </div>
                )}
                {raffle.status !== 'live' && !finishedPrize && (
                  <Text style={{ fontSize: 12, color: MISIO_COLORS.textMuted, display: 'block', marginTop: 12, textAlign: 'center' }}>
                    Inicia el sorteo (botón de arriba) para habilitar las tiradas.
                  </Text>
                )}
              </Card>
            </Col>
          </Row>

          {/* Modal de corrección manual */}
          <Modal
            open={fixOpen}
            onCancel={() => setFixOpen(false)}
            onOk={submitFix}
            confirmLoading={fixing}
            okText="Agregar boletos"
            title="🔧 Agregar boletos manualmente"
          >
            <Alert type="info" showIcon style={{ marginBottom: 14 }}
              message="Herramienta de corrección"
              description="Asigna boletos directamente a un usuario, sin cobro. Útil si una compra no se registró o para pruebas." />
            <div style={{ marginBottom: 12 }}>
              <Text style={{ display: 'block', marginBottom: 4 }}>Usuario</Text>
              <Select
                showSearch
                style={{ width: '100%' }}
                placeholder="Elige el usuario"
                value={fixForm.userId}
                onChange={(v) => setFixForm((f) => ({ ...f, userId: v }))}
                optionFilterProp="label"
                options={fixUsers.map((u) => ({ value: u._id, label: `${u.name} (${u.dni})` }))}
              />
            </div>
            <div>
              <Text style={{ display: 'block', marginBottom: 4 }}>Números de boleto</Text>
              <Input
                placeholder="Ej: 1 2 3 4 5"
                value={fixForm.numbers}
                onChange={(e) => setFixForm((f) => ({ ...f, numbers: e.target.value }))}
              />
              <Text style={{ fontSize: 11, color: MISIO_COLORS.textMuted }}>
                Separados por espacio o coma. Los que ya existan se omiten.
              </Text>
            </div>
          </Modal>
        </Col>

        <Col xs={24} lg={8} style={{ display: 'flex', flexDirection: 'column' }}>
          {/* ── Transmisión (compacta: la protagonista es la ruleta) ── */}
          <Card 
            title="📡 Transmisión en vivo"
            extra={
              <Button type="text" shape="circle" icon={streamCollapsed ? <DownOutlined /> : <UpOutlined />} onClick={() => setStreamCollapsed(!streamCollapsed)} />
            }
            style={{ flex: streamCollapsed ? 0 : 1, display: 'flex', flexDirection: 'column' }}
            styles={{ body: { flex: 1, display: streamCollapsed ? 'none' : 'flex', flexDirection: 'column' } }}
          >
            <Space.Compact block>
              <Input
                placeholder="Pega el link normal: youtube.com/watch?v=… · twitch.tv/canal · kick.com/canal"
                value={streamInput}
                onChange={(e) => setStreamInput(e.target.value)}
              />
              <Button type="primary" icon={<SaveOutlined />} loading={busy} onClick={saveStream}>
                Guardar
              </Button>
            </Space.Compact>
            <div style={{ marginTop: 12, flex: 1, minHeight: 250, width: '100%', borderRadius: 12,
              overflow: 'hidden', background: MISIO_COLORS.bgBase }}>
              {raffle.streamUrl ? (
                <iframe
                  src={toEmbedSrc(raffle.streamUrl)}
                  title="Transmisión del sorteo"
                  style={{ width: '100%', height: '100%', border: 0 }}
                  allow="autoplay; encrypted-media; picture-in-picture"
                  allowFullScreen
                />
              ) : (
                <div style={{ height: '100%', display: 'grid', placeItems: 'center' }}>
                  <Text style={{ color: MISIO_COLORS.textMuted }}>
                    Pega el link de embed y guárdalo para verlo aquí.
                  </Text>
                </div>
              )}
            </div>
          </Card>
        </Col>
      </Row>

      {/* ── Confirmación PRESENCIAL: "sugerir aceptar" ────────────── */}
      <Modal
        open={!!pendingConfirm}
        onCancel={() => setPendingConfirm(null)}
        onOk={confirmManual}
        okText={pendingConfirm?.isWinner ? '🏆 Sí, es el GANADOR' : '💧 Sí, salió AL AGUA'}
        cancelText="No, me equivoqué"
        confirmLoading={busy}
        title="Confirmar tirada de la tómbola física"
      >
        {pendingConfirm && (
          <Text>
            Boleto <Text code>#{String(pendingConfirm.ticketNumber).padStart(4, '0')}</Text> como
            tirada <b>{pendingConfirm.attempt}</b> de {total} —{' '}
            {pendingConfirm.isWinner
              ? <span className="prize-glow">esta tirada define al GANADOR.</span>
              : 'esta tirada sale AL AGUA (el boleto se quema y recibirá su reembolso Cero Pérdida).'}
          </Text>
        )}
      </Modal>

      {/* ── Resultado de la tirada (ambos modos) ──────────────────── */}
      <Modal
        open={!!resultModal}
        onCancel={() => setResultModal(null)}
        footer={
          resultModal?.result === 'winner'
            ? <Button type="primary" onClick={() => { setResultModal(null); loadState(); }}>Ver resumen</Button>
            : <Button type="primary" onClick={() => { setResultModal(null); loadState(); }}>
                🎱 Preparar siguiente tirada
              </Button>
        }
        closable={false}
        maskClosable={false}
        title={resultModal?.result === 'winner' ? '🏆 ¡TENEMOS GANADOR!' : '💧 Salió al agua'}
      >
        {resultModal && (
          <div style={{ textAlign: 'center', padding: '12px 0' }}>
            <Title level={2} className={resultModal.result === 'winner' ? 'prize-glow' : ''} style={{ margin: 0 }}>
              #{String(resultModal.ticketNumber).padStart(4, '0')}
            </Title>
            <Text style={{ fontSize: 16 }}>{resultModal.holderName}</Text>
            <br />
            <Text style={{ color: MISIO_COLORS.textMuted }}>
              Tirada {resultModal.attempt} de {resultModal.totalAttempts} — transmitida a toda la sala.
            </Text>
          </div>
        )}
      </Modal>

      {/* ── Explicación de la Fórmula de Azar ────────────── */}
      <Modal
        open={formulaModal}
        onCancel={() => setFormulaModal(false)}
        footer={[
          <Button key="ok" type="primary" onClick={() => setFormulaModal(false)}>
            Entendido
          </Button>
        ]}
        title={<><InfoCircleOutlined style={{ color: MISIO_COLORS.primary }} /> ¿Cómo garantiza el sistema la transparencia?</>}
      >
        <div style={{ marginTop: 16 }}>
          <Text style={{ display: 'block', marginBottom: 12, fontSize: 15 }}>
            Queremos que estés 100% seguro de que nuestro sorteo es justo. Por eso, combinamos el sistema clásico de lotería con la máxima seguridad tecnológica.
          </Text>
          
          <Title level={5} style={{ color: MISIO_COLORS.electricBlue, margin: '16px 0 8px' }}>1. Como un ánfora gigante 🔮</Title>
          <Text style={{ display: 'block', marginBottom: 16 }}>
            Imagina una piscina de pelotas gigante. Al darle a "Girar tómbola", el sistema mete en esta piscina <b>única y exclusivamente los boletos comprados válidos</b>. Si ya sacamos boletos "al agua", esos se tiran a la basura y ya no entran a la piscina.
          </Text>

          <Title level={5} style={{ color: MISIO_COLORS.electricBlue, margin: '16px 0 8px' }}>2. La mano con los ojos vendados 🙈</Title>
          <Text style={{ display: 'block', marginBottom: 16 }}>
            El sistema revuelve la piscina a la velocidad de la luz y saca <b>1 sola pelota al azar</b>. Esto lo hace el "cerebro" de nuestro servidor, por lo que es imposible que un administrador o programador decida qué pelota sale. Es azar puro y matemático.
          </Text>

          <Title level={5} style={{ color: MISIO_COLORS.electricBlue, margin: '16px 0 8px' }}>3. La garantía técnica (Para los expertos) 💻</Title>
          <Text style={{ display: 'block', marginBottom: 12 }}>
            Para quienes saben de tecnología, aquí está la prueba. Utilizamos un algoritmo interno inalterable de la base de datos (MongoDB) llamado <code>$sample</code> que garantiza la aleatoriedad criptográfica de la elección:
          </Text>
          <div style={{ background: '#f5f5f5', padding: 12, borderRadius: 8, marginBottom: 16, border: '1px solid #e0e0e0' }}>
            <code style={{ fontSize: 13, color: '#d63384' }}>
              db.tickets.aggregate([<br/>
              &nbsp;&nbsp;{'{'} $match: {'{'} raffleId: "...", status: "active" {'}'} {'}'},<br/>
              &nbsp;&nbsp;{'{'} <b>$sample: {'{'} size: 1 {'}'}</b> {'}'}<br/>
              ])
            </code>
          </div>

          <Title level={5} style={{ color: MISIO_COLORS.electricBlue, margin: '16px 0 8px' }}>¡Todo sucede en un parpadeo!</Title>
          <Text style={{ display: 'block' }}>
            Esta selección matemática inalterable ocurre en milésimas de segundo. Para cuando ves las pelotitas saltando en la pantalla, el sistema ya sabe quién ganó de forma totalmente justa, y solo te está revelando el resultado.
          </Text>
        </div>
      </Modal>

    </div>
  );
}
