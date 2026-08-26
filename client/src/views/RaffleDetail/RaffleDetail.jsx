import React, { useEffect, useMemo, useState } from 'react';

import { useParams, useNavigate } from 'react-router-dom';
import dayjs from 'dayjs';
import {
  Card, Col, Row, Typography, Tag, Button, Alert, Space, Image, Carousel,
  Input, message, Statistic, Divider, Progress, Affix, Badge, Modal, Form, Select,
} from 'antd';
import ReactMarkdown from 'react-markdown';
import {
  ShoppingCartOutlined, CalendarOutlined, ThunderboltFilled, DeleteOutlined,
  FireFilled, ShopOutlined, WhatsAppOutlined, PrinterOutlined, BookOutlined
} from '@ant-design/icons';
import { MISIO_COLORS } from '../../theme/misioTheme';
import { useAuth } from '../../auth/AuthContext';
import { api, SERVER_URL, tokenStore } from '../../auth/api';
import { io } from 'socket.io-client';

const WS_URL = import.meta.env.VITE_WS_URL ?? 'http://localhost:3000';
import RechargeModal from '../../components/RechargeModal';
import { printTickets, shareWhatsAppImage } from '../../utils/ticketPrinter';

const { Title, Text, Paragraph } = Typography;

/** Código de numerología en el cliente (espejo del backend). */
const fmtCode = (prefix, n, total) => {
  const digits = Math.max(4, String(total).length);
  return `${prefix}-${String(n).padStart(digits, '0')}`;
};

/**
 * DETALLE DE LA RIFA (/rifa/:id) — el flujo correcto de compra:
 * fotos y descripción del producto → GRILLA con TODOS los tickets según
 * la numerología configurada → seleccionas tus números → carrito →
 * pagas con tu saldo Misio. (Pago directo con QR Yape: Sprint 3.)
 */
export default function RaffleDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user, refreshUser } = useAuth();
  const [msgApi, contextHolder] = message.useMessage();

  const [raffle, setRaffle] = useState(null);
  const [sold, setSold] = useState(new Set());
  const [inProcess, setInProcess] = useState(new Set());
  const [myNumbers, setMyNumbers] = useState(new Set());
  const [cart, setCart] = useState([]); // Números seleccionados
  const [search, setSearch] = useState('');
  const [activeBlock, setActiveBlock] = useState(0); // Índice de bloque cuando total > 500
  const [othersSelected, setOthersSelected] = useState({}); // número → etiqueta (BRAN…)
  const socketRef = React.useRef(null);
  const [liveConnected, setLiveConnected] = React.useState(false);
  const [winnerAnnouncement, setWinnerAnnouncement] = React.useState(null);
  const [paying, setPaying] = useState(false);
  const [yapeOpen, setYapeOpen] = useState(false);
  const [error, setError] = useState(false);
  const [posOpen, setPosOpen] = useState(false);
  const [posForm] = Form.useForm();
  const [posSuccess, setPosSuccess] = useState(null);
  const [legalPages, setLegalPages] = useState(null);
  const [rulesOpen, setRulesOpen] = useState(false);

  // ── Carga: rifa + vendidos + (si hay sesión) mis boletos ─────────
  const [promoCode, setPromoCode] = useState('');
  const [promoValid, setPromoValid] = useState(null);
  const [promoMessage, setPromoMessage] = useState('');
  const [promoValue, setPromoValue] = useState(0);
  const [showPromo, setShowPromo] = useState(false);

  const load = async () => {
    try {
      api('/settings/legal').then(setLegalPages).catch(() => {});
      const [r, s] = await Promise.all([api(`/raffles/${id}`), api(`/raffles/${id}/sold`)]);
      setRaffle(r);
      setSold(new Set(s.sold));
      setInProcess(new Set(s.inProcess ?? []));
      if (user) {
        try {
          const mine = await api('/tickets/mine');
          setMyNumbers(new Set(
            mine.filter((t) => (t.raffleId?._id ?? t.raffleId) === id).map((t) => t.ticketNumber),
          ));
        } catch { /* sin sesión válida: no marca los míos */ }
      }
    } catch {
      setError(true);
    }
  };
  // ── TIEMPO REAL: selecciones de OTROS navegadores + ventas al instante ──
  useEffect(() => {
    const socket = io(`${WS_URL}/live`, {
      // Token como función: se relee en cada (re)conexión
      auth: (cb) => cb({ token: tokenStore.get() }),
      transports: ['websocket'],
      reconnection: true,
    });
    socketRef.current = socket;

    // join_raffle en 'connect' (no fuera): así también se RE-une a la sala
    // tras cada reconexión. Antes, un parpadeo de red te dejaba fuera de
    // la sala en silencio y dejabas de ver las selecciones de otros.
    socket.on('connect', () => {
      setLiveConnected(true);
      socket.emit('join_raffle', { raffleId: id });
    });
    socket.on('disconnect', () => setLiveConnected(false));
    socket.on('connect_error', () => setLiveConnected(false));

    socket.on('grid_update', ({ bySocket }) => {
      const map = {};
      for (const [sid, sel] of Object.entries(bySocket ?? {})) {
        if (sid === socket.id) continue; // Mis propias selecciones no
        for (const n of sel.numbers) map[n] = sel.label;
      }
      setOthersSelected(map);
    });

    socket.on('grid_sold', ({ numbers }) => {
      const nums = (numbers ?? []).map(Number);
      setSold((prev) => new Set([...prev, ...nums]));
      setInProcess((prev) => {
        const next = new Set(prev);
        nums.forEach((n) => next.delete(n));
        return next;
      });
      setCart((prev) => {
        const clash = prev.filter((n) => nums.includes(n));
        if (clash.length) {
          msgApi.warning(`¡Te ganaron el ${clash.map((n) => `#${n}`).join(', ')}! Elige otro.`);
        }
        return prev.filter((n) => !nums.includes(n));
      });
    });

    socket.on('grid_in_process', ({ numbers }) => {
      const nums = (numbers ?? []).map(Number);
      setInProcess((prev) => new Set([...prev, ...nums]));
      setCart((prev) => {
        const clash = prev.filter((n) => nums.includes(n));
        if (clash.length) {
          msgApi.warning(`⚠️ Alguien acaba de registrar un pago para el ${clash.map((n) => `#${n}`).join(', ')}. Está en proceso de verificación.`);
        }
        return prev.filter((n) => !nums.includes(n));
      });
    });

    socket.on('grid_released', ({ numbers }) => {
      const nums = (numbers ?? []).map(Number);
      setInProcess((prev) => {
        const next = new Set(prev);
        nums.forEach((n) => next.delete(n));
        return next;
      });
    });

    // #5: Redirigir cuando el sorteo empieza o termina
    socket.on('raffle_status', ({ status }) => {
      if (status === 'live') {
        // El sorteo empezó: mandar a la vista del sorteo en vivo
        msgApi.info('🎰 ¡El sorteo está en vivo! Entrando…');
        setTimeout(() => navigate(`/rifa/${id}`), 1000);
        load(); // Refresca el estado de la rifa
      }
      if (status === 'completed') {
        // El sorteo terminó: refrescar para mostrar el resultado
        msgApi.success('🏆 ¡El sorteo terminó! Viendo resultados…');
        load();
      }
    });

    // #3: Animación de victoria cuando se declara ganador
    socket.on('raffle_completed', (summary) => {
      setWinnerAnnouncement(summary);
    });

    return () => socket.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  // Cada cambio del carrito se transmite a la sala (los demás lo ven al toque)
  useEffect(() => {
    socketRef.current?.emit('grid_select', { raffleId: id, numbers: cart });
  }, [cart, id]);

  useEffect(() => {
    load();
    // Carrito de invitado: si eligió números sin cuenta y volvió del login,
    // se restaura lo que tenía seleccionado.
    const savedCart = sessionStorage.getItem(`misio_cart_${id}`);
    if (savedCart) {
      try { setCart(JSON.parse(savedCart)); } catch { /* corrupto: ignorar */ }
      sessionStorage.removeItem(`misio_cart_${id}`);
    }
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  const toggle = (n) => {
    if (sold.has(n)) return;
    if (inProcess.has(n)) {
      return msgApi.info('Ese número está en proceso de compra por otra persona. Si su pago no se confirma, se liberará.');
    }
    if (othersSelected[n]) {
      return msgApi.info(`${othersSelected[n]} está eligiendo ese número en este momento.`);
    }
    if (raffle.status !== 'active') return msgApi.info('Este sorteo ya no está en venta');
    setCart((prev) => {
      if (prev.includes(n)) return prev.filter((x) => x !== n);
      const ownedPlusCart = myNumbers.size + prev.length;
      if (ownedPlusCart >= raffle.maxTicketsPerUser) {
        msgApi.warning(`Máximo ${raffle.maxTicketsPerUser} boletos por persona en este sorteo`);
        return prev;
      }
      return [...prev, n].sort((a, b) => a - b);
    });
  };

  const pickRandom = (count) => {
    if (raffle.status !== 'active') return msgApi.info('Este sorteo ya no está en venta');
    const availableSpace = raffle.maxTicketsPerUser - myNumbers.size - cart.length;
    if (availableSpace <= 0) {
      return msgApi.warning(`Ya tienes el máximo de ${raffle.maxTicketsPerUser} boletos en este sorteo.`);
    }
    
    // Only pick up to the requested count or the available space
    const toPick = Math.min(count, availableSpace);
    const allNumbers = Array.from({ length: raffle.totalTickets }, (_, i) => i + 1);
    
    const availableNumbers = allNumbers.filter(n => 
      !sold.has(n) && 
      !inProcess.has(n) && 
      !myNumbers.has(n) && 
      !cart.includes(n) && 
      !othersSelected[n]
    );

    if (availableNumbers.length === 0) {
      return msgApi.warning('No hay suficientes boletos disponibles.');
    }

    const actualToPick = Math.min(toPick, availableNumbers.length);
    // Fisher-Yates or simple sort for randomization
    const shuffled = availableNumbers.sort(() => 0.5 - Math.random());
    const selected = shuffled.slice(0, actualToPick);

    setCart(prev => [...prev, ...selected].sort((a, b) => a - b));
    if (actualToPick < count) {
      msgApi.info(`Solo se pudieron seleccionar ${actualToPick} boletos aleatorios por el límite.`);
    } else {
      msgApi.success(`¡${actualToPick} ${actualToPick === 1 ? 'boleto agregado' : 'boletos agregados'} al azar!`);
    }
  };

  const validatePromo = async () => {
    if (!promoCode.trim()) return;
    setPromoValid('loading');
    try {
      const res = await api('/promocodes/validate', {
        method: 'POST',
        body: { code: promoCode, type: 'free_ticket' },
      });
      setPromoValid('valid');
      setPromoValue(res.value);
      setPromoMessage(`¡Código válido! Tienes ${res.value} boleto(s) gratis.`);
    } catch (err) {
      setPromoValid('invalid');
      setPromoValue(0);
      setPromoMessage(err.message || 'Código inválido o expirado.');
    }
  };

  const calculateTotal = () => {
    const cost = cart.length - (promoValid === 'valid' ? promoValue : 0);
    return Math.max(0, cost) * (raffle?.ticketPrice ?? 0);
  };
  const total = calculateTotal();

  const buy = async () => {
    if (!user) {
      // El invitado eligió tranquilo; RECIÉN al pagar se le pide cuenta.
      sessionStorage.setItem(`misio_cart_${id}`, JSON.stringify(cart));
      msgApi.info('Crea tu cuenta o inicia sesión para pagar — tus números elegidos te esperan.');
      return navigate('/login', { state: { from: `/rifa/${id}` } });
    }
    setPaying(true);
    try {
      const res = await api('/tickets/purchase', {
        method: 'POST',
        body: { 
          raffleId: id, 
          ticketNumbers: cart,
          promoCode: promoValid === 'valid' ? promoCode : undefined,
        },
      });
      msgApi.success(
        `¡Tuyos! ${res.tickets.map((t) => t.code || `#${t.ticketNumber}`).join(', ')} — S/ ${res.totalPaid} pagados con tu Misio.`,
        7,
      );
      socketRef.current?.emit('grid_purchased', { raffleId: id, numbers: cart });
      refreshUser?.();
      setCart([]);
      load(); // Refresca vendidos y míos
    } catch (err) {
      msgApi.error(err.message);
      load(); // Alguien pudo ganar un número mientras tanto
    } finally {
      setPaying(false);
    }
  };

  const handleOpenPos = async () => {
    try {
      const shiftData = await api('/cash/my-shift');
      if (!shiftData || Object.keys(shiftData).length === 0) {
        msgApi.error(
          <Space direction="vertical">
            <Text strong style={{ color: 'red' }}>¡Alto ahí! Caja cerrada 🛑</Text>
            <Text>No puedes vender boletos externamente si no tienes un turno de caja abierto.</Text>
            <Button size="small" type="primary" onClick={() => window.location.href = '/admin/caja'}>
              Ir a Abrir Caja
            </Button>
          </Space>,
          7
        );
        return;
      }
      setPosOpen(true);
    } catch (err) {
      msgApi.error('Error verificando el estado de la caja');
    }
  };

  const buyOffline = async (values) => {
    setPaying(true);
    try {
      const res = await api('/tickets/offline', {
        method: 'POST',
        body: {
          raffleId: id,
          ticketNumbers: cart,
          buyerName: values.buyerName,
          buyerPhone: values.buyerPhone,
          buyerDni: values.buyerDni,
          buyerEmail: values.buyerEmail,
          paymentMethod: values.paymentMethod,
        }
      });
      
      setPosSuccess({
        buyerName: values.buyerName,
        buyerPhone: values.buyerPhone,
        paymentMethod: values.paymentMethod,
        tickets: res.tickets.map(t => t.ticketNumber),
        totalPaid: res.totalPaid
      });
      
      socketRef.current?.emit('grid_purchased', { raffleId: id, numbers: cart });
      setCart([]);
      load();
    } catch (err) {
      if (err.message && err.message.includes('NO_ACTIVE_SHIFT')) {
        msgApi.error(
          <Space direction="vertical">
            <Text strong style={{ color: 'red' }}>¡Alto ahí! Caja cerrada 🛑</Text>
            <Text>No puedes vender boletos externamente si no tienes un turno de caja abierto.</Text>
            <Button size="small" type="primary" onClick={() => window.location.href = '/admin/caja'}>
              Ir a Abrir Caja
            </Button>
          </Space>,
          7
        );
      } else {
        msgApi.error(err.message || 'Error registrando la venta física');
      }
      load();
    } finally {
      setPaying(false);
      setPosOpen(false);
      posForm.resetFields();
    }
  };

  const handlePrint = (format) => {
    if (!posSuccess) return;
    const { buyerName, tickets } = posSuccess;
    printTickets(raffle, tickets, buyerName, new Date(), format);
  };

  const handleWhatsApp = () => {
    if (!posSuccess) return;
    const { buyerName, buyerPhone, tickets } = posSuccess;
    shareWhatsAppImage(raffle, tickets, buyerName, buyerPhone, new Date());
  };

  const shareRaffleWhatsApp = () => {
    const baseUrl = window.location.origin;
    const url = `${baseUrl}/rifa/${raffle._id}`;
    const utmUrl = `${url}?utm_source=share&utm_medium=whatsapp&utm_campaign=${encodeURIComponent(raffle.title?.slice(0, 30) ?? 'sorteo')}`;
    const text = `🎟️ ¡Mira este increíble sorteo! ${raffle.title} por solo S/ ${raffle.ticketPrice}. ¡Participa ya!`;
    const waUrl = `https://wa.me/?text=${encodeURIComponent(`${text}\n${utmUrl}`)}`;
    window.open(waUrl, '_blank');
  };

  if (error) {
    return <Alert type="warning" showIcon message="No se pudo cargar el sorteo (¿backend apagado?)." />;
  }
  if (!raffle) return <Alert type="info" showIcon message="Cargando sorteo…" />;

  const soldPct = Math.round((sold.size / raffle.totalTickets) * 100);
  // TODOS los números (por bloques de 500 si > 500 boletos). El buscador filtra por coincidencia:
  const q = search.replace(/\D/g, '');
  const allNumbers = Array.from({ length: raffle.totalTickets }, (_, i) => i + 1);
  const blockSize = 500;
  const visibleNumbers = q
    ? allNumbers.filter((n) => String(n).includes(q))
    : raffle.totalTickets > blockSize
      ? allNumbers.slice(activeBlock * blockSize, (activeBlock + 1) * blockSize)
      : allNumbers;

  return (
    <div>
      {contextHolder}

      <Row gutter={[20, 20]}>
        {/* ── Producto: fotos + info (Fijo/Sticky a la izquierda) ── */}
        <Col xs={24} lg={7} xl={6} className="z-sticky-col">
          <Card styles={{ body: { padding: 0, overflow: 'hidden', borderRadius: 16 } }} style={{ borderRadius: 16, border: '1px solid #cbd5e1', background: '#ffffff', boxShadow: '0 8px 24px -4px rgba(0, 0, 0, 0.08)', height: 'auto' }}>
            <div style={{ position: 'relative' }}>
              <div style={{ position: 'absolute', top: 12, right: 12, zIndex: 10 }}>
                <span className="z-pill" style={{ padding: '6px 14px', fontSize: 12, background: 'rgba(255, 255, 255, 0.9)', backdropFilter: 'blur(4px)', color: '#0f172a', border: '1px solid rgba(203, 213, 225, 0.5)', fontWeight: 800, borderRadius: 20, boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}>
                  <CalendarOutlined style={{ marginRight: 6, color: '#047857' }} />
                  {dayjs(raffle.drawDate).format('DD/MM/YYYY HH:mm')}
                </span>
              </div>
            {raffle.images?.length > 0 ? (
              <Carousel autoplay dots>
                {raffle.images.map((url) => (
                  <div key={url}>
                    <Image
                      src={`${SERVER_URL}${url}`}
                      style={{ width: '100%', aspectRatio: '4/3', objectFit: 'cover' }}
                    />
                  </div>
                ))}
              </Carousel>
            ) : (
              <div style={{ aspectRatio: '4/3', display: 'grid', placeItems: 'center', fontSize: 80,
                background: 'linear-gradient(135deg, #f0fdf4, #ecfdf5)' }}>
                {raffle.emoji ?? '🎁'}
              </div>
            )}
            </div>
          </Card>

          <Card style={{ marginTop: 20, height: 'auto', borderRadius: 16, border: '1px solid #cbd5e1', background: '#ffffff', boxShadow: '0 8px 24px -4px rgba(0, 0, 0, 0.08)' }} styles={{ body: { padding: '24px' } }}>
            <Space direction="vertical" size="middle" style={{ width: '100%' }}>
              
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12 }}>
                <Title level={3} style={{ margin: 0, fontFamily: 'Outfit, sans-serif', fontWeight: 900, textTransform: 'uppercase', color: '#0f172a', lineHeight: 1.1, flex: 1, minWidth: 200 }}>
                  {raffle.title}
                </Title>
                <div style={{ fontSize: 30, fontWeight: 900, lineHeight: 1, color: '#047857' }}>
                  S/ {raffle.ticketPrice}
                </div>
              </div>
              
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                {raffle.type === 'paquete' && (
                  <span className="z-pill" style={{ padding: '4px 12px', fontSize: 11, background: '#eff6ff', color: '#1d4ed8', border: '1px solid #bfdbfe', fontWeight: 700, borderRadius: 20 }}>
                    📦 {raffle.prizes?.length || 2} PREMIOS
                  </span>
                )}
              </div>

              <Paragraph style={{ color: '#475569', margin: 0, fontSize: 14, lineHeight: 1.5 }}>
                {raffle.description || 'Participa en nuestro sorteo y gana excelentes premios.'}
              </Paragraph>
              
              {raffle.type === 'paquete' && raffle.prizes && (
                <div style={{ background: '#f8fafc', padding: '12px 16px', borderRadius: 12, border: '1px solid #e2e8f0' }}>
                  <Text strong style={{ color: '#0f172a', display: 'block', marginBottom: 8 }}>📦 Este paquete incluye {raffle.prizes.length} premios:</Text>
                  <ul style={{ margin: 0, paddingLeft: 20, color: '#475569' }}>
                    {raffle.prizes.map((p, i) => (
                      <li key={i}>{p.title}</li>
                    ))}
                  </ul>
                </div>
              )}

              <div style={{ marginTop: 4 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                  <Text style={{ color: '#334155', fontWeight: 600, fontSize: 13 }}><FireFilled style={{ color: '#f59e0b', marginRight: 4 }} /> {sold.size} de {raffle.totalTickets} boletos vendidos</Text>
                </div>
                <Progress percent={soldPct} strokeWidth={8} showInfo={false}
                  strokeColor={{ from: '#10b981', to: '#047857' }} 
                  trailColor="#e2e8f0" />
              </div>
            </Space>
          </Card>

          {/* ── Acciones Flotantes (Compartir y Bases) ── */}
          <Card 
            style={{ 
              marginTop: 16, 
              borderRadius: 16, 
              border: '1px solid #e2e8f0', 
              background: '#ffffff', 
              boxShadow: '0 4px 12px -4px rgba(0, 0, 0, 0.05)', 
              overflow: 'hidden'
            }} 
            styles={{ body: { padding: 0 } }} 
          >
            {/* Compartir por WhatsApp */}
            <div 
              onClick={shareRaffleWhatsApp}
              onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#f8fafc'}
              onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
              style={{ 
                padding: '16px', 
                cursor: 'pointer',
                display: 'flex', 
                alignItems: 'center', 
                justifyContent: 'space-between',
                transition: 'background-color 0.2s ease',
                borderBottom: '1px solid #f1f5f9'
              }}
            >
               <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                 <div style={{ 
                   width: 44, 
                   height: 44, 
                   borderRadius: 12, 
                   background: '#dcfce7', 
                   display: 'flex', 
                   alignItems: 'center', 
                   justifyContent: 'center', 
                   color: '#16a34a', 
                   fontSize: 22,
                   boxShadow: 'inset 0 2px 4px rgba(255,255,255,0.5), 0 2px 4px rgba(22, 163, 74, 0.15)'
                 }}>
                   <WhatsAppOutlined />
                 </div>
                 <div>
                   <Typography.Text strong style={{ display: 'block', color: '#0f172a', fontSize: 15, fontFamily: 'Outfit, sans-serif' }}>
                     Compartir por WhatsApp
                   </Typography.Text>
                   <Typography.Text style={{ fontSize: 12, color: '#64748b' }}>
                     Invita a tus amigos a participar
                   </Typography.Text>
                 </div>
               </div>
               <div style={{ 
                 color: '#16a34a', 
                 background: '#dcfce7', 
                 borderRadius: '50%', 
                 width: 28, 
                 height: 28, 
                 display: 'flex', 
                 alignItems: 'center', 
                 justifyContent: 'center',
                 fontSize: 12
               }}>
                 ➔
               </div>
            </div>

            {/* Bases y reglas */}
            <div 
              onClick={() => setRulesOpen(true)}
              onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#f8fafc'}
              onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
              style={{ 
                padding: '16px', 
                cursor: 'pointer',
                display: 'flex', 
                alignItems: 'center', 
                justifyContent: 'space-between',
                transition: 'background-color 0.2s ease'
              }}
            >
               <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                 <div style={{ 
                   width: 44, 
                   height: 44, 
                   borderRadius: 12, 
                   background: '#eff6ff', 
                   display: 'flex', 
                   alignItems: 'center', 
                   justifyContent: 'center', 
                   color: '#3b82f6', 
                   fontSize: 20,
                   boxShadow: 'inset 0 2px 4px rgba(255,255,255,0.5), 0 2px 4px rgba(59, 130, 246, 0.15)'
                 }}>
                   <BookOutlined />
                 </div>
                 <div>
                   <Typography.Text strong style={{ display: 'block', color: '#0f172a', fontSize: 15, fontFamily: 'Outfit, sans-serif' }}>
                     Bases y reglas del sorteo
                   </Typography.Text>
                   <Typography.Text style={{ fontSize: 12, color: '#64748b' }}>
                     Lee los términos para participar
                   </Typography.Text>
                 </div>
               </div>
               <div style={{ 
                 color: '#3b82f6', 
                 background: '#eff6ff', 
                 borderRadius: '50%', 
                 width: 28, 
                 height: 28, 
                 display: 'flex', 
                 alignItems: 'center', 
                 justifyContent: 'center',
                 fontSize: 12
               }}>
                 ➔
               </div>
            </div>
          </Card>
        </Col>

        {/* ── Grilla de tickets ──────────────────────────────────── */}
        <Col xs={24} lg={11} xl={12}>
          <Card
            style={{ borderRadius: 16, border: '1px solid #cbd5e1', background: '#ffffff', boxShadow: '0 8px 24px -4px rgba(0, 0, 0, 0.08)' }}
            styles={{ body: { padding: '16px 18px' } }}
            title={<span style={{ fontFamily: 'Outfit', fontWeight: 900, fontSize: 17, color: '#0f172a' }}>🎟️ ELIGE TUS NÚMEROS</span>}
            extra={
              <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: '#475569', display: 'none' }}>🎲 Al azar:</span>
                <Button size="small" onClick={() => pickRandom(1)} style={{ borderRadius: 16, fontWeight: 700, color: '#047857', borderColor: '#10b981', background: '#ecfdf5' }}>+ 1 al azar</Button>
                <Button size="small" onClick={() => pickRandom(3)} style={{ borderRadius: 16, fontWeight: 700, color: '#047857', borderColor: '#10b981', background: '#ecfdf5' }}>+ 3 al azar</Button>
                <Button size="small" onClick={() => pickRandom(5)} style={{ borderRadius: 16, fontWeight: 700, color: '#047857', borderColor: '#10b981', background: '#ecfdf5' }}>+ 5 al azar</Button>
              </div>
            }
          >
            {/* Leyenda y Buscador en una sola fila */}
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 10 }}>
              <div style={{ flex: '1 1 auto', display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', padding: '4px 12px', background: '#f8fafc', borderRadius: 8, border: '1px solid #e2e8f0' }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: '#64748b' }}>Estado:</span>
                <Badge color="#047857" text={<Text style={{ fontSize: 11, color: '#0f172a', fontWeight: 700 }}>Elegido</Text>} />
                <Badge color="#94a3b8" text={<Text style={{ fontSize: 11, color: '#475569', fontWeight: 600 }}>Vendido</Text>} />
                <Badge color="#f97316" text={<Text style={{ fontSize: 11, color: '#7c2d12', fontWeight: 700 }}>En proceso</Text>} />
                <Badge color="#0284c7" text={<Text style={{ fontSize: 11, color: '#0369a1', fontWeight: 700 }}>Ocupado</Text>} />
                <Badge color="#eab308" text={<Text style={{ fontSize: 11, color: '#713f12', fontWeight: 700 }}>Tuyo</Text>} />
              </div>

              <Input
                allowClear
                placeholder="🔍 Busca tu número (ej: 77)"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                style={{ flex: '1 1 200px', minWidth: 150, borderRadius: 8, borderColor: '#cbd5e1', boxShadow: 'none', fontSize: 13 }}
              />
            </div>


            {raffle.totalTickets > 500 && !q && (
              <div style={{ marginBottom: 12, background: '#f8fafc', padding: '8px 12px', borderRadius: 10, border: '1px solid #e2e8f0' }}>
                <div style={{ fontSize: 12, color: '#0f172a', fontWeight: 700, marginBottom: 6, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 6 }}>
                  <span>📦 Navega por bloques de boletos:</span>
                  <span style={{ color: '#047857', fontWeight: 800 }}>Bloque {activeBlock + 1} de {Math.ceil(raffle.totalTickets / 500)}</span>
                </div>
                <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', maxHeight: 110, overflowY: 'auto' }}>
                  {Array.from({ length: Math.ceil(raffle.totalTickets / 500) }, (_, idx) => {
                    const start = idx * 500 + 1;
                    const end = Math.min((idx + 1) * 500, raffle.totalTickets);
                    const digits = Math.max(4, String(raffle.totalTickets).length);
                    const label = `${String(start).padStart(digits, '0')} al ${String(end).padStart(digits, '0')}`;
                    const isCurrent = idx === activeBlock;
                    const itemsInCartInBlock = cart.filter(n => n >= start && n <= end).length;
                    
                    return (
                      <button
                        key={idx}
                        onClick={() => setActiveBlock(idx)}
                        style={{
                          padding: '4px 10px',
                          borderRadius: 16,
                          border: isCurrent ? '2px solid #047857' : '1px solid #cbd5e1',
                          background: isCurrent ? '#047857' : '#ffffff',
                          color: isCurrent ? '#ffffff' : '#334155',
                          fontSize: 12,
                          fontWeight: isCurrent ? 800 : 600,
                          cursor: 'pointer',
                          fontFamily: 'Outfit, sans-serif',
                          transition: 'all 0.2s ease',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 5,
                          boxShadow: isCurrent ? '0 2px 6px rgba(4, 120, 87, 0.2)' : 'none'
                        }}
                      >
                        {label}
                        {itemsInCartInBlock > 0 && (
                          <span style={{
                            background: isCurrent ? '#ffffff' : '#047857',
                            color: isCurrent ? '#047857' : '#ffffff',
                            borderRadius: '50%',
                            width: 16,
                            height: 16,
                            display: 'inline-flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize: 10,
                            fontWeight: 800
                          }}>
                            {itemsInCartInBlock}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
            {q && raffle.totalTickets > 500 && (
              <div style={{ marginBottom: 12, fontSize: 12, color: '#047857', fontWeight: 600, background: '#ecfdf5', padding: '8px 12px', borderRadius: 8, border: '1px solid #6ee7b7' }}>
                🔍 Mostrando todas las coincidencias con &ldquo;<b>{q}</b>&rdquo; en los {raffle.totalTickets} boletos de la rifa.
              </div>
            )}
            <div className="z-raffle-grid" style={{
              display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(68px, 1fr))',
              gap: 8, maxHeight: 560, overflowY: 'auto', paddingRight: 4,
              paddingBottom: 30,
            }}>
              {visibleNumbers.map((n) => {
                const isSold = sold.has(n);
                const isMine = myNumbers.has(n);
                const isPending = inProcess.has(n);
                const byOther = !isSold && !isMine && othersSelected[n];
                const inCart = cart.includes(n);
                return (
                  <button
                    key={n}
                    className={inCart ? "z-tile-pick" : undefined}
                    onClick={() => toggle(n)}
                    disabled={(isSold && !isMine) || isPending || !!byOther}
                    title={byOther ? `${byOther} lo está eligiendo ahora mismo` : undefined}
                    style={{
                      padding: '12px 4px', borderRadius: 8,
                      fontSize: 14, fontWeight: inCart || isMine ? 800 : 700, cursor: (isSold && !isMine) ? 'not-allowed' : isMine ? 'default' : 'pointer',
                      fontFamily: 'Outfit, sans-serif', transition: 'all 0.15s ease',
                      transform: inCart ? 'scale(1.05)' : 'none',
                      border: inCart
                        ? '1px solid #10b981'
                        : isMine ? '1px solid #eab308'
                        : isPending ? '1px dashed #f97316'
                        : byOther ? '1px solid #38bdf8'
                        : isSold ? '1px solid #0f172a' : '1px solid #334155',
                      boxShadow: inCart ? '0 4px 14px rgba(4, 120, 87, 0.4)' : '0 2px 4px rgba(0,0,0,0.15)',
                      background: inCart
                        ? '#047857'
                        : isMine ? '#fbbf24'
                        : isPending ? '#f97316'
                        : byOther ? '#38bdf8'
                        : isSold ? '#0f172a' : '#1e293b',
                      color: inCart ? '#ffffff'
                        : isMine ? '#000000'
                        : isPending ? '#ffffff'
                        : byOther ? '#ffffff'
                        : isSold ? '#475569' : '#f8fafc',
                      textDecoration: isSold && !isMine ? 'line-through' : 'none',
                      opacity: isSold && !isMine ? 0.85 : 1,
                    }}
                  >
                    {fmtCode(raffle.ticketPrefix, n, raffle.totalTickets)}
                  </button>
                );
              })}
            </div>

          </Card>
        </Col>

        {/* ── Columna 3: Carrito de Boletos Fixed/Sticky ───────── */}
        <Col xs={24} lg={6} xl={6} id="seccion-carrito" className="z-sticky-col">
          <Card
            style={{ 
              borderRadius: 16,
              border: cart.length > 0 ? '2px solid #047857' : '1px solid #cbd5e1',
              background: '#ffffff',
              boxShadow: cart.length > 0 ? '0 10px 30px rgba(4, 120, 87, 0.15)' : '0 4px 20px rgba(0, 0, 0, 0.05)',
              maxHeight: 'calc(100vh - 40px)',
              display: 'flex',
              flexDirection: 'column'
            }}
            styles={{ 
              body: { 
                padding: '20px', 
                overflowY: 'auto', 
                flex: 1
              } 
            }}
            title={<><ShoppingCartOutlined style={{ color: '#047857', marginRight: 8, fontSize: 18 }} /><span style={{ fontFamily: 'Outfit', fontWeight: 800, color: '#0f172a', fontSize: 16 }}>TU CARRITO</span></>}
          >
            {/* Indicador sutil y compacto de límite por usuario */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              paddingBottom: 10,
              marginBottom: 12,
              borderBottom: '1px solid #f1f5f9',
              fontSize: 12,
              color: '#64748b'
            }}>
              <span>
                🎯 Límite: <strong style={{ color: '#334155' }}>Máx. {raffle.maxTicketsPerUser} {raffle.maxTicketsPerUser === 1 ? 'ticket' : 'tickets'}</strong>
              </span>
              <span style={{ 
                fontSize: 12,
                fontWeight: 700,
                color: cart.length + myNumbers.size >= raffle.maxTicketsPerUser ? '#ef4444' : '#047857'
              }}>
                {cart.length + myNumbers.size}/{raffle.maxTicketsPerUser} {cart.length + myNumbers.size >= raffle.maxTicketsPerUser && ' (tope)'}
              </span>
            </div>

            {myNumbers.size > 0 && (
              <div style={{ fontSize: 11, color: '#64748b', marginBottom: 12, marginTop: -8 }}>
                ℹ️ Ya tienes {myNumbers.size} {myNumbers.size === 1 ? 'ticket comprado' : 'tickets comprados'} en tu cuenta.
              </div>
            )}

            <Space direction="vertical" size={16} style={{ width: '100%' }}>
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                  <Text style={{ fontSize: 13, fontWeight: 700, color: '#334155' }}>Mis Boletos ({cart.length}):</Text>
                  {cart.length > 0 && (
                    <Button size="small" type="text" icon={<DeleteOutlined />} onClick={() => setCart([])} style={{ color: '#ef4444', fontWeight: 600, padding: 0 }}>
                      Vaciar
                    </Button>
                  )}
                </div>

                {cart.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '30px 14px', height: 190, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', background: '#f8fafc', borderRadius: 12, border: '1px dashed #cbd5e1' }}>
                    <div style={{ fontSize: 48, marginBottom: 12, opacity: 0.7 }}>🎟️</div>
                    <Text style={{ fontSize: 15, color: '#0f172a', fontWeight: 700, display: 'block', marginBottom: 6 }}>
                      Tu carrito está vacío
                    </Text>
                    <Text style={{ fontSize: 13, color: '#64748b', lineHeight: 1.4, display: 'block', maxWidth: 220 }}>
                      Haz clic en los boletos oscuros para agregarlos a tu lista de compra.
                    </Text>
                  </div>
                ) : (
                  <div style={{ maxHeight: 190, display: 'flex', flexDirection: 'column', gap: 6, overflowY: 'auto', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 12, padding: '6px 8px' }}>
                    {/* Caja de tickets con scroll automático después de 4 items */}
                    {cart.map((n) => (
                      <div
                        key={n}
                        style={{
                          position: 'relative',
                          display: 'flex',
                          alignItems: 'stretch',
                          background: 'linear-gradient(135deg, #047857 0%, #065f46 100%)',
                          borderRadius: 10,
                          overflow: 'hidden',
                          boxShadow: '0 4px 10px rgba(4, 120, 87, 0.22)',
                          border: '1px solid #10b981',
                          minHeight: 40,
                          flexShrink: 0,
                        }}
                      >
                        {/* Muesca izquierda (troquelado cine) */}
                        <div style={{
                          position: 'absolute',
                          left: -6,
                          top: '50%',
                          transform: 'translateY(-50%)',
                          width: 12,
                          height: 12,
                          background: '#f8fafc',
                          borderRadius: '50%',
                          borderRight: '1px solid #10b981',
                          zIndex: 2
                        }} />

                        {/* Muesca derecha (troquelado cine) */}
                        <div style={{
                          position: 'absolute',
                          right: -6,
                          top: '50%',
                          transform: 'translateY(-50%)',
                          width: 12,
                          height: 12,
                          background: '#f8fafc',
                          borderRadius: '50%',
                          borderLeft: '1px solid #10b981',
                          zIndex: 2
                        }} />

                        {/* Cuerpo principal del ticket */}
                        <div style={{
                          flex: 1,
                          padding: '4px 8px 4px 14px',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          borderRight: '2px dashed rgba(255, 255, 255, 0.4)',
                          color: '#ffffff',
                          gap: 6
                        }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <span style={{ fontSize: 15 }}>🎟️</span>
                            <span style={{ fontFamily: 'Outfit, sans-serif', fontWeight: 900, fontSize: 15, letterSpacing: 0.5 }}>
                              {fmtCode(raffle.ticketPrefix, n, raffle.totalTickets)}
                            </span>
                          </div>
                          <span style={{ fontSize: 11, fontWeight: 800, background: 'rgba(0, 0, 0, 0.25)', padding: '3px 6px', borderRadius: 6, color: '#6ee7b7', whiteSpace: 'nowrap' }}>
                            S/ {raffle.ticketPrice}
                          </span>
                        </div>

                        {/* Talón desprendible / botón eliminar */}
                        <button
                          onClick={() => toggle(n)}
                          title="Desprender y quitar del carrito"
                          style={{
                            width: 44,
                            background: 'rgba(0, 0, 0, 0.15)',
                            border: 'none',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            color: '#fca5a5',
                            fontSize: 14,
                            transition: 'all 0.2s ease',
                            padding: 0,
                            fontWeight: 900
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.background = '#ef4444';
                            e.currentTarget.style.color = '#ffffff';
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.background = 'rgba(0, 0, 0, 0.15)';
                            e.currentTarget.style.color = '#fca5a5';
                          }}
                        >
                          ✕
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

                <div style={{ borderTop: '1px solid #f1f5f9', paddingTop: 12 }}>
                  <span style={{ fontSize: 13, color: '#475569', fontWeight: 600, display: 'block' }}>Total a pagar:</span>
                  <span style={{ fontSize: 30, fontWeight: 900, lineHeight: 1.1, color: '#047857', display: 'block' }}>
                    S/ {total.toFixed(2)}
                  </span>
                  {user && (
                    <Text style={{ fontSize: 12, color: '#64748b', fontWeight: 500, display: 'block', marginTop: 2 }}>
                      Mi Misio disponible: S/ {Number(user.walletBalance ?? 0).toFixed(2)}
                    </Text>
                  )}
                </div>
                
                <Space direction="vertical" size={8} style={{ width: '100%' }}>
                  <Button
                    type="primary"
                    icon={<ThunderboltFilled style={{ color: '#fef08a' }} />}
                    loading={paying} onClick={buy}
                    style={{ 
                      width: '100%', 
                      background: '#047857', 
                      borderColor: '#047857', 
                      color: '#ffffff',
                      height: 38, 
                      fontSize: 13, 
                      fontWeight: 700, 
                      borderRadius: 8, 
                      boxShadow: '0 2px 8px rgba(4, 120, 87, 0.2)' 
                    }}
                    disabled={cart.length === 0 || (user && user.walletBalance < total)}
                  >
                    {total === 0 && cart.length > 0 ? 'Llevar Gratis' : 'Pagar con MISIO'}
                  </Button>
                  <Button
                    onClick={() => {
                      if (!user) {
                        sessionStorage.setItem(`misio_cart_${id}`, JSON.stringify(cart));
                        msgApi.info('Crea tu cuenta o inicia sesión para pagar — tus números te esperan.');
                        return navigate('/login', { state: { from: `/rifa/${id}` } });
                      }
                      setYapeOpen(true);
                    }}
                    style={{ 
                      width: '100%', 
                      background: '#742284', 
                      color: '#ffffff', 
                      border: 'none', 
                      height: 38, 
                      fontSize: 13, 
                      fontWeight: 700, 
                      borderRadius: 8, 
                      boxShadow: '0 2px 8px rgba(116, 34, 132, 0.2)' 
                    }}
                    disabled={cart.length === 0 || total === 0}
                  >
                    🟣 Pagar YAPE / PLIN
                  </Button>
                  {(user?.role === 'ADMIN' || user?.role === 'SELLER' || user?.role === 'admin' || user?.role === 'seller') && (
                    <Button
                      onClick={handleOpenPos}
                      style={{ 
                        width: '100%', 
                        background: '#1e293b', 
                        color: '#ffffff', 
                        border: 'none', 
                        height: 38, 
                        fontSize: 13, 
                        fontWeight: 700, 
                        borderRadius: 8,
                        boxShadow: '0 2px 8px rgba(0, 0, 0, 0.2)' 
                      }}
                      disabled={cart.length === 0}
                    >
                      🛒 Venta Externa (POS)
                    </Button>
                  )}
                </Space>

                <div style={{ borderTop: '1px solid #f1f5f9', paddingTop: 6, marginTop: -4 }}>
                  {!showPromo ? (
                    <div style={{ textAlign: 'center' }}>
                      <a style={{ fontSize: 13, color: '#047857', fontWeight: 600, textDecoration: 'underline' }} onClick={() => setShowPromo(true)}>
                        ¿Tienes un código promocional?
                      </a>
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      <Text style={{ fontSize: 12, fontWeight: 600, color: '#334155' }}>Código promocional:</Text>
                      <Space.Compact style={{ width: '100%' }}>
                        <Input
                          placeholder="Ej: PROMO50"
                          size="small"
                          value={promoCode}
                          onChange={(e) => setPromoCode(e.target.value.toUpperCase())}
                          disabled={promoValid === 'loading' || promoValid === 'valid'}
                        />
                        <Button 
                          type="primary" 
                          size="small"
                          onClick={validatePromo}
                          loading={promoValid === 'loading'}
                          disabled={!promoCode || promoValid === 'valid'}
                          style={{ background: '#047857' }}
                        >
                          {promoValid === 'valid' ? 'OK' : 'Aplicar'}
                        </Button>
                      </Space.Compact>
                      {promoValid === 'valid' && <Text type="success" style={{ fontSize: 12, fontWeight: 600 }}>{promoMessage}</Text>}
                      {promoValid === 'invalid' && <Text type="danger" style={{ fontSize: 12, fontWeight: 600 }}>{promoMessage}</Text>}
                    </div>
                  )}
                </div>
              </Space>
          </Card>
        </Col>
      </Row>

      {/* ── Barra Flotante Responsive (Visible solo en Móvil y Tablet al seleccionar boletos) ── */}
      {cart.length > 0 && (
        <div className="z-mobile-checkout-bar">
          <div>
            <span style={{ fontSize: 15, fontWeight: 900, display: 'block' }}>🛒 {cart.length} {cart.length === 1 ? 'boleto elegido' : 'boletos elegidos'}</span>
            <span style={{ fontSize: 13, opacity: 0.9, fontWeight: 600 }}>Total: S/ {total.toFixed(2)}</span>
          </div>
          <button
            onClick={() => {
              const el = document.getElementById('seccion-carrito');
              if (el) el.scrollIntoView({ behavior: 'smooth' });
            }}
            style={{
              background: '#ffffff',
              color: '#047857',
              border: 'none',
              borderRadius: 25,
              padding: '10px 18px',
              fontWeight: 800,
              fontSize: 14,
              cursor: 'pointer',
              boxShadow: '0 2px 10px rgba(0, 0, 0, 0.15)'
            }}
          >
            Ver Carrito / Pagar ⬇️
          </button>
        </div>
      )}

      {/* Pago del carrito vía Yape/Plin: QR + intención de auto-compra */}
      <RechargeModal
        open={yapeOpen}
        onClose={() => setYapeOpen(false)}
        fixedAmount={total}
        purchaseIntent={{ raffleId: id, ticketNumbers: cart }}
        onRegistered={() => {
          socketRef.current?.emit('grid_in_process', { raffleId: id, numbers: cart });
          setInProcess((prev) => new Set([...prev, ...cart.map(Number)]));
          setCart([]);
          load();
        }}
      />

      {/* #3: Animación de victoria — se muestra a todos los conectados */}
      <Modal
        open={!!winnerAnnouncement}
        onCancel={() => setWinnerAnnouncement(null)}
        footer={<Button type="primary" size="large" onClick={() => setWinnerAnnouncement(null)}>🎉 ¡Genial!</Button>}
        centered
        closable={false}
        width={420}
      >
        {winnerAnnouncement && (
          <div style={{ textAlign: 'center', padding: '20px 0' }}>
            <div style={{
              fontSize: 64, animation: 'pulse 0.6s ease-in-out infinite alternate',
              marginBottom: 8,
            }}>🏆</div>
            <Typography.Title level={2} className="prize-glow" style={{ margin: '0 0 8px' }}>
              ¡TENEMOS GANADOR!
            </Typography.Title>
            <Typography.Text style={{ fontSize: 18, display: 'block', marginBottom: 6 }}>
              {winnerAnnouncement.winner?.name ?? 'Un participante'}
            </Typography.Text>
            <Typography.Text style={{ fontSize: 14, color: MISIO_COLORS.textMuted }}>
              Boleto #{String(winnerAnnouncement.winner?.ticketNumber ?? 0).padStart(4, '0')}
            </Typography.Text>
            {winnerAnnouncement.refundedTotal > 0 && (
              <div style={{ marginTop: 14 }}>
                <Tag color="green" style={{ fontSize: 13, padding: '4px 12px' }}>
                  Cero Pérdida: S/ {Number(winnerAnnouncement.refundedTotal).toFixed(2)} devueltos
                </Tag>
              </div>
            )}
            <style>{`@keyframes pulse { from { transform: scale(1); } to { transform: scale(1.15); } }`}</style>
          </div>
        )}
      </Modal>

      {/* ── MODAL: Venta Externa (POS) ── */}
      <Modal
        open={posOpen}
        title={<><ShopOutlined style={{ color: '#047857' }} /> Venta Externa (POS)</>}
        onCancel={() => !paying && setPosOpen(false)}
        width={500}
        destroyOnHidden
        footer={null}
      >
        <Form
          form={posForm}
          layout="vertical"
          onFinish={buyOffline}
          initialValues={{ paymentMethod: 'efectivo' }}
        >
          <div style={{ background: '#f1f5f9', padding: 12, borderRadius: 8, marginBottom: 16 }}>
            <Text strong style={{ fontSize: 16, display: 'block' }}>Boletos Seleccionados: {cart.length}</Text>
            <Text strong style={{ fontSize: 20, color: '#047857', display: 'block' }}>Total a Cobrar: S/ {total.toFixed(2)}</Text>
          </div>

          <Form.Item
            name="buyerName"
            label="Nombre del Cliente"
            rules={[{ required: true, message: 'Ingresa el nombre del cliente físico' }]}
          >
            <Input placeholder="Ej: Juan Pérez" />
          </Form.Item>

          <Form.Item
            name="buyerPhone"
            label="Teléfono / WhatsApp"
            rules={[
              { required: true, message: 'Ingresa el número para contactarlo si gana' },
              { pattern: /^[0-9]+$/, message: 'Solo se permiten números' }
            ]}
          >
            <Input 
              placeholder="Ej: 999 888 777" 
              onKeyPress={(e) => {
                if (!/[0-9]/.test(e.key)) {
                  e.preventDefault();
                }
              }}
            />
          </Form.Item>

          <Form.Item
            name="buyerDni"
            label="DNI"
            rules={[
              { required: true, message: 'Ingresa el DNI del comprador' },
              { pattern: /^[0-9]+$/, message: 'Solo se permiten números' }
            ]}
          >
            <Input 
              placeholder="Ej: 71234567" 
              maxLength={8} 
              onKeyPress={(e) => {
                if (!/[0-9]/.test(e.key)) {
                  e.preventDefault();
                }
              }}
            />
          </Form.Item>

          <Form.Item
            name="buyerEmail"
            label="Correo Electrónico (Opcional)"
            rules={[{ type: 'email', message: 'Ingresa un correo válido' }]}
          >
            <Input placeholder="Ej: cliente@correo.com" />
          </Form.Item>

          <Form.Item
            name="paymentMethod"
            label="Método de Cobro"
            rules={[{ required: true, message: 'Selecciona cómo te pagó el cliente' }]}
          >
            <Select>
              <Select.Option value="efectivo">💵 Efectivo</Select.Option>
              <Select.Option value="yape">🟣 Yape (a tu cuenta)</Select.Option>
              <Select.Option value="plin">🔵 Plin (a tu cuenta)</Select.Option>
              <Select.Option value="transferencia">🏦 Transferencia</Select.Option>
            </Select>
          </Form.Item>

          <Button
            type="primary"
            htmlType="submit"
            loading={paying}
            style={{ width: '100%', height: 44, fontSize: 16, fontWeight: 700, background: '#0f172a' }}
          >
            Registrar Venta Física
          </Button>
        </Form>
      </Modal>

      {/* ── MODAL: Éxito Venta Externa ── */}
      <Modal
        open={!!posSuccess}
        title={<><ShopOutlined style={{ color: '#047857' }} /> ¡Venta Exitosa!</>}
        onCancel={() => setPosSuccess(null)}
        footer={null}
      >
        {posSuccess && (
          <div style={{ textAlign: 'center', padding: '10px 0' }}>
            <div style={{ fontSize: 48, marginBottom: 16 }}>✅</div>
            <Typography.Title level={4}>Se han vendido {posSuccess.tickets.length} boletos</Typography.Title>
            <Text type="secondary" style={{ display: 'block', marginBottom: 24 }}>A nombre de: <b>{posSuccess.buyerName}</b></Text>

            <Space direction="vertical" style={{ width: '100%' }} size="middle">
              <Button
                type="primary"
                icon={<WhatsAppOutlined />}
                style={{ width: '100%', height: 44, background: '#25D366', borderColor: '#25D366' }}
                onClick={handleWhatsApp}
              >
                Compartir Boletos (WhatsApp)
              </Button>
              <div style={{ display: 'flex', gap: '8px', width: '100%' }}>
                <Button
                  icon={<PrinterOutlined />}
                  style={{ flex: 1, height: 44 }}
                  onClick={() => handlePrint('a4')}
                >
                  Imprimir (A4)
                </Button>
                <Button
                  icon={<PrinterOutlined />}
                  style={{ flex: 1, height: 44 }}
                  onClick={() => handlePrint('ticketera')}
                >
                  Imprimir (Ticketera)
                </Button>
              </div>
            </Space>
          </div>
        )}
      </Modal>

      <Modal open={rulesOpen} onCancel={() => setRulesOpen(false)} footer={null} title="Bases y reglas del sorteo" width={700}>
        {legalPages?.raffleRules ? (
          <div className="z-markdown-content" style={{ maxHeight: '70vh', overflowY: 'auto', paddingRight: 12 }}>
            <ReactMarkdown>{legalPages.raffleRules}</ReactMarkdown>
          </div>
        ) : (
          <p>Cargando bases del sorteo...</p>
        )}
      </Modal>
    </div>
  );
}
