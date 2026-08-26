import React, { useMemo, useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Card, Col, Row, Typography, Tag, Button, Space, Image, message, Affix,
  InputNumber, Alert, Empty, Badge, Modal, Input, Form, Divider, List, Carousel, Radio,
} from 'antd';
import {
  ShoppingCartOutlined, DeleteOutlined, ThunderboltFilled, WalletFilled,
} from '@ant-design/icons';
import { MISIO_COLORS } from '../../theme/misioTheme';
import { useAuth } from '../../auth/AuthContext';
import { useApiOrMock } from '../../hooks/useApiOrMock';
import { api, SERVER_URL } from '../../auth/api';
import RechargeModal from '../../components/RechargeModal';

const { Title, Text, Paragraph } = Typography;

const MOCK_ITEMS = [
  { _id: 'i1', name: 'Gift card Rappi S/ 20', priceMisio: 20, emoji: '🛵',
    description: 'Código digital, entrega por WhatsApp.', images: [], stock: -1, active: true },
  { _id: 'i2', name: 'Audífonos JBL Tune 510', priceMisio: 120, emoji: '🎧',
    description: 'Nuevos, sellados, con garantía.', images: [], stock: 4, active: true },
];

/**
 * 🛍️ TIENDA (/tienda) — sección PRINCIPAL para los usuarios.
 * Catálogo público con fotos y descripciones. Carrito con cantidades.
 * Se paga con saldo Misio (el que ganaste por Cero Pérdida o recargaste
 * con Yape). Si no hay sesión, se pide iniciar sesión RECIÉN al pagar.
 */
export default function StoreFront() {
  const navigate = useNavigate();
  const { user, refreshUser } = useAuth();
  const [msgApi, contextHolder] = message.useMessage();
  const { data: items, demo, refresh } = useApiOrMock('/store/items', MOCK_ITEMS);

  const [cart, setCart] = useState({}); // itemId → qty
  const [paying, setPaying] = useState(false);
  const [recharging, setRecharging] = useState(false);
  const [deliveryOpen, setDeliveryOpen] = useState(false);
  const [delivery, setDelivery] = useState({ address: '', reference: '', phone: '', email: '', note: '' });
  const [filterType, setFilterType] = useState('todos');
  const [isScrolled, setIsScrolled] = useState(false);

  useEffect(() => {
    let lastState = false;
    const handleScroll = () => {
      const currentY = window.scrollY;
      if (!lastState && currentY > 200) {
        setIsScrolled(true);
        lastState = true;
      } else if (lastState && currentY < 100) {
        setIsScrolled(false);
        lastState = false;
      }
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const filteredItems = useMemo(() => {
    return (items || []).filter((i) => {
      const isCanje = (i.saleType ?? 'canje') === 'canje';
      if (filterType === 'canje') return isCanje;
      if (filterType === 'venta') return !isCanje;
      return true;
    });
  }, [items, filterType]);

  const lines = useMemo(
    () => Object.entries(cart)
      .map(([id, qty]) => ({ item: items.find((i) => i._id === id), qty }))
      .filter((l) => l.item && l.qty > 0),
    [cart, items],
  );
  const total = lines.reduce((s, l) => s + l.item.priceMisio * l.qty, 0);
  const hasVirtual = lines.some((l) => (l.item.fulfillment ?? 'fisico') === 'virtual');
  const allVirtual = lines.length > 0 && lines.every((l) => (l.item.fulfillment ?? 'fisico') === 'virtual');
  const totalCanje = lines.filter((l) => (l.item.saleType ?? 'canje') === 'canje')
    .reduce((s, l) => s + l.item.priceMisio * l.qty, 0);
  const totalVenta = total - totalCanje;
  const balance = Number(user?.walletBalance ?? 0); // 💵 contable
  const balanceCanje = Number(user?.walletCanje ?? 0); // 🎁 canje

  const chargeVentaContable = totalVenta;
  const chargeCanjeDesdeCanje = Math.min(totalCanje, balanceCanje);
  const chargeCanjeDesdeContable = totalCanje - chargeCanjeDesdeCanje;

  const faltanteVenta = Math.max(0, chargeVentaContable - balance);
  const contableSobrante = Math.max(0, balance - chargeVentaContable);
  const faltanteCanje = Math.max(0, chargeCanjeDesdeContable - contableSobrante);
  const canPay = faltanteVenta === 0 && faltanteCanje === 0;

  const setQty = (item, qty) => {
    const max = item.stock === -1 ? 20 : Math.min(20, item.stock);
    setCart((c) => {
      const next = { ...c };
      const q = Math.max(0, Math.min(max, qty ?? 0));
      if (q === 0) delete next[item._id];
      else next[item._id] = q;
      return next;
    });
  };

  const checkout = () => {
    if (!user) {
      msgApi.info('Inicia sesión o crea tu cuenta para completar la compra.');
      return navigate('/login', { state: { from: '/tienda' } });
    }
    if (demo) return msgApi.info('Modo demo: conecta el backend.');
    // Prellenar con datos del usuario y pedir confirmación de entrega
    setDelivery((d) => ({ ...d, phone: d.phone || user.phone || '', email: d.email || user.email || '' }));
    setDeliveryOpen(true);
  };

  const confirmCheckout = async () => {
    // Validación mínima según tipo
    if (allVirtual) {
      if (!delivery.email && !delivery.phone) {
        return msgApi.error('Deja un correo o teléfono para enviarte el código');
      }
    } else if (!delivery.address?.trim()) {
      return msgApi.error('La dirección de envío es obligatoria para productos físicos');
    }
    setPaying(true);
    try {
      const res = await api('/store/checkout', {
        method: 'POST',
        body: { items: lines.map((l) => ({ itemId: l.item._id, qty: l.qty })), delivery },
      });
      setDeliveryOpen(false);
      msgApi.success(
        `¡Compra registrada! ${res.itemName ?? ''} — te contactaremos para la entrega. 🛍️`,
        7,
      );
      setCart({});
      refresh();
      refreshUser?.();
    } catch (err) {
      msgApi.error(err.message);
      if (/saldo/i.test(err.message ?? '')) setRecharging(true);
    } finally {
      setPaying(false);
    }
  };

  return (
    <div>
      {contextHolder}
      
      <Row gutter={[24, 24]} style={{ minHeight: '120vh' }}>
        {/* ── Columna Izquierda: Catálogo ───────────────────────────── */}
        <Col xs={24} lg={17}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24, flexWrap: 'wrap', gap: 16 }}>
            <Title level={2} style={{ margin: 0 }}>🛍️ Tienda Misio</Title>
            {items.length > 0 && (
              <Radio.Group 
                value={filterType} 
                onChange={(e) => setFilterType(e.target.value)} 
                optionType="button" 
                buttonStyle="solid"
              >
                <Radio.Button value="todos" style={{ borderRadius: '8px 0 0 8px' }}>Todos</Radio.Button>
                <Radio.Button value="canje">🎁 Canje</Radio.Button>
                <Radio.Button value="venta" style={{ borderRadius: '0 8px 8px 0' }}>💵 Con Saldo</Radio.Button>
              </Radio.Group>
            )}
          </div>

          {demo && (
            <Alert type="info" showIcon style={{ marginBottom: 16 }}
              message="Modo demo: catálogo ficticio (backend no conectado)." />
          )}

          {items.length === 0 ? (
            <Empty description="La tienda está en preparación — vuelve pronto." />
          ) : (
            <>
              {filteredItems.length === 0 ? (
                <Empty description="No hay productos en esta categoría" />
              ) : (
                <Row gutter={[16, 16]}>
                  {filteredItems.map((item) => {
                    const inCart = cart[item._id] ?? 0;
                    const out = item.stock === 0;
                return (
                  <Col xs={24} sm={12} xl={8} key={item._id}>
                <Card
                  hoverable={!out}
                  className="z-raffle-card"
                  styles={{ body: { padding: 0, display: 'flex', flexDirection: 'column', flex: 1 } }}
                  style={{ background: '#ffffff', border: 'none', borderRadius: 24, height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden', boxShadow: '0 12px 32px rgba(0,0,0,0.06)' }}
                >
                  <div className="z-img-wrapper">
                    {/* Etiqueta Flotante sobre la imagen */}
                    <div style={{ position: 'absolute', top: 12, right: 12, zIndex: 10 }}>
                      {(item.saleType ?? 'canje') === 'canje'
                        ? <Tag color={MISIO_COLORS.prizeGold} style={{ color: '#3d2e00', margin: 0, fontWeight: 800, textTransform: 'uppercase', boxShadow: '0 4px 12px rgba(0,0,0,0.5)', border: 'none' }}>🎁 Canje</Tag>
                        : <Tag color={MISIO_COLORS.saldoGreen} style={{ color: '#06281c', margin: 0, fontWeight: 800, textTransform: 'uppercase', boxShadow: '0 4px 12px rgba(0,0,0,0.5)', border: 'none' }}>💵 Venta</Tag>}
                    </div>

                    {item.images?.length > 1 ? (
                      <Carousel autoplay effect="fade" dots={{ className: 'misio-carousel-dots' }}>
                        {item.images.map((img, idx) => (
                          <div key={idx}>
                            <Image
                              src={`${SERVER_URL}${img}`}
                              alt={`${item.name} - ${idx + 1}`}
                              preview={false}
                              style={{ width: '100%', aspectRatio: '4/3', objectFit: 'cover' }}
                            />
                          </div>
                        ))}
                      </Carousel>
                    ) : item.images?.length === 1 ? (
                      <Image
                        src={`${SERVER_URL}${item.images[0]}`}
                        alt={item.name}
                        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                      />
                    ) : (
                      <div className="z-card-placeholder" style={{ width: '100%', height: '100%', borderRadius: 0 }}>
                        {item.emoji ?? '🎁'}
                      </div>
                    )}
                  </div>

                  <div className="z-card-body">
                    <div>
                      <Title level={4} style={{ margin: 0, color: '#0f172a', fontWeight: 900, lineHeight: 1.2 }}>{item.name}</Title>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
                        {item.stock !== -1 && !out && (
                          <Tag style={{ margin: 0 }}>{item.stock} disp.</Tag>
                        )}
                        {out && <Tag color="error" style={{ margin: 0 }}>Agotado</Tag>}
                      </div>
                    </div>
                    
                    {item.description && (
                      <Paragraph
                        style={{ color: '#64748b', fontSize: 13, margin: 0, lineHeight: 1.4 }}
                        ellipsis={{ rows: 2 }}
                      >
                        {item.description}
                      </Paragraph>
                    )}

                    <div style={{ marginTop: 'auto', paddingTop: 16, borderTop: '1px dashed #e2e8f0' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                      <Text style={{ fontSize: 11, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 1, fontWeight: 700, display: 'block' }}>
                        PRECIO
                      </Text>
                      <Text className="z-price-text">
                        S/ {item.priceMisio}
                      </Text>
                    </div>
                  </div>
                </div>

                  {inCart === 0 ? (
                    <Button
                      type="primary"
                      block
                      size="large"
                      disabled={out}
                      className="btn-marketero"
                      icon={<ShoppingCartOutlined />}
                      onClick={() => setQty(item, 1)}
                      style={{ height: 64, borderRadius: 0, fontSize: 16, fontWeight: 800, border: 'none', letterSpacing: 0.5 }}
                    >
                      AGREGAR AL CARRITO
                    </Button>
                  ) : (
                    <Button
                      block
                      size="large"
                      onClick={() => setQty(item, 0)}
                      style={{ height: 64, borderRadius: 0, fontSize: 16, fontWeight: 800, border: 'none', background: '#f1f5f9', color: '#64748b' }}
                    >
                      EN CARRITO (QUITAR)
                    </Button>
                  )}
                </Card>
              </Col>
            );
          })}
        </Row>
      )}
    </>
  )}
</Col>

        {/* ── Columna Derecha: Billetera y Carrito ─────────────────── */}
        <Col xs={24} lg={7}>
          <div style={{ position: 'sticky', top: 100, display: 'flex', flexDirection: 'column', gap: 16 }}>
            
            {/* Tarjeta de Billetera */}
            <Card 
              style={{ 
                borderRadius: 24, 
                border: 'none', 
                boxShadow: isScrolled ? '0 10px 20px rgba(0,0,0,0.15)' : '0 20px 40px rgba(0,0,0,0.1)', 
                background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)',
                color: '#fff',
                overflow: 'hidden',
                position: 'relative',
                transition: 'all 0.3s ease'
              }}
              styles={{ body: { padding: isScrolled ? '16px 20px' : '28px 24px', transition: 'padding 0.3s ease' } }}
            >
              {/* Decorative Glow */}
              <div style={{ position: 'absolute', top: -30, right: -30, width: 140, height: 140, background: MISIO_COLORS.electricBlue, filter: 'blur(70px)', opacity: 0.3, borderRadius: '50%' }} />

              {isScrolled && user ? (
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
                    <div>
                      <Text style={{ color: '#cbd5e1', fontSize: 11, display: 'block', lineHeight: 1, marginBottom: 2 }}>Contable</Text>
                      <Text style={{ color: '#fff', fontSize: 15, fontWeight: 800 }}>💵 {balance.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</Text>
                    </div>
                    <div>
                      <Text style={{ color: '#cbd5e1', fontSize: 11, display: 'block', lineHeight: 1, marginBottom: 2 }}>Canje</Text>
                      <Text className="prize-glow" style={{ fontSize: 15, fontWeight: 800 }}>🎁 {balanceCanje.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</Text>
                    </div>
                  </div>
                  <Button 
                    type="primary" 
                    size="small" 
                    onClick={() => setRecharging(true)} 
                    style={{ borderRadius: 8, fontWeight: 800, border: 'none', height: 32 }}
                  >
                    + SALDO
                  </Button>
                </div>
              ) : isScrolled && !user ? (
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Text style={{ color: '#cbd5e1', fontSize: 14, fontWeight: 700 }}>Mi Billetera</Text>
                  <Button 
                    type="primary" 
                    size="small" 
                    onClick={() => navigate('/login', { state: { from: '/tienda' } })} 
                    style={{ borderRadius: 8, fontWeight: 800, border: 'none', height: 32 }}
                  >
                    INGRESAR
                  </Button>
                </div>
              ) : (
                <>
                  <Text style={{ display: 'block', fontSize: 12, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 1.5, fontWeight: 800, marginBottom: 20 }}>
                    MI BILLETERA
                  </Text>

                  {user ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                      <div>
                        <Text style={{ color: '#cbd5e1', fontSize: 13, display: 'block', marginBottom: 4 }}>Saldo Contable 💵</Text>
                        <div style={{ fontSize: 36, fontWeight: 900, color: '#ffffff', lineHeight: 1 }}>
                          S/ {balance.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </div>
                      </div>
                      
                      <div>
                        <Text style={{ color: '#cbd5e1', fontSize: 13, display: 'block', marginBottom: 4 }}>Saldo Canje 🎁</Text>
                        <div className="prize-glow" style={{ fontSize: 20, fontWeight: 800, display: 'inline-block' }}>
                          S/ {balanceCanje.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </div>
                      </div>

                      <Button 
                        type="primary" 
                        block 
                        size="large"
                        onClick={() => setRecharging(true)}
                        style={{ marginTop: 8, height: 48, borderRadius: 12, fontWeight: 800, letterSpacing: 0.5, border: 'none' }}
                      >
                        RECARGAR SALDO
                      </Button>
                    </div>
                  ) : (
                    <div style={{ textAlign: 'center', padding: '10px 0' }}>
                      <Text style={{ color: '#94a3b8', fontSize: 14, display: 'block', marginBottom: 16 }}>
                        Compra con tu saldo recargado o el que volvió a ti por Cashback.
                      </Text>
                      <Button 
                        type="primary" 
                        block 
                        size="large"
                        onClick={() => navigate('/login', { state: { from: '/tienda' } })}
                        style={{ height: 48, borderRadius: 12, fontWeight: 800 }}
                      >
                        INICIAR SESIÓN
                      </Button>
                    </div>
                  )}
                </>
              )}
            </Card>

            {/* Tarjeta de Carrito */}
            <Card 
              style={{ 
                borderRadius: 24, 
                border: 'none', 
                boxShadow: '0 12px 32px rgba(0,0,0,0.06)', 
                background: '#ffffff'
              }}
              styles={{ body: { padding: '24px' } }}
            >
              <Title level={5} style={{ marginTop: 0, marginBottom: 16, display: 'flex', justifyContent: 'space-between' }}>
                <span><ShoppingCartOutlined /> Carrito</span>
                {lines.length > 0 && (
                  <Badge count={lines.reduce((s, l) => s + l.qty, 0)} size="small" style={{ backgroundColor: MISIO_COLORS.primary }} />
                )}
              </Title>

              {lines.length === 0 ? (
                <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Tu carrito está vacío" />
              ) : (
                <Space direction="vertical" size={12} style={{ width: '100%' }}>
                  <List
                    size="small"
                    dataSource={lines}
                    split={false}
                    renderItem={(l) => (
                      <List.Item
                        style={{
                          background: '#f1f5f9',
                          borderRadius: 16,
                          padding: 16,
                          marginBottom: 12,
                          border: '1px solid #cbd5e1',
                          boxShadow: '0 4px 12px rgba(0,0,0,0.03)',
                          display: 'flex',
                          flexDirection: 'column',
                          position: 'relative'
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', width: '100%', gap: 12 }}>
                          <Text style={{ fontSize: 14, fontWeight: 700, color: '#0f172a', lineHeight: 1.3, paddingRight: 24 }}>
                            {l.item.emoji ?? '🛍️'} {l.item.name}
                          </Text>
                          <Button 
                            type="text" 
                            danger 
                            icon={<DeleteOutlined />} 
                            onClick={() => setQty(l.item, 0)} 
                            style={{ position: 'absolute', top: 12, right: 12, opacity: 0.6 }}
                          />
                        </div>
                        
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%', marginTop: 12 }}>
                          <div className={(l.item.saleType ?? 'canje') === 'canje' ? "prize-glow" : "saldo-glow"} style={{ fontSize: 16, fontWeight: 800 }}>
                            S/ {(l.item.priceMisio * l.qty).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </div>
                          
                          <div style={{ display: 'flex', alignItems: 'center', background: '#e2e8f0', borderRadius: 12, padding: '2px' }}>
                            <Button type="text" onClick={() => setQty(l.item, l.qty - 1)} style={{ minWidth: 28, height: 28, padding: 0, color: '#475569' }}>-</Button>
                            <Text strong style={{ width: 36, textAlign: 'center', fontSize: 14 }}>{l.qty}</Text>
                            <Button type="text" onClick={() => setQty(l.item, l.qty + 1)} style={{ minWidth: 28, height: 28, padding: 0, color: '#475569' }}>+</Button>
                          </div>
                        </div>
                      </List.Item>
                    )}
                  />
                  
                  <Divider style={{ margin: '8px 0' }} />

                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <Text type="secondary" style={{ textTransform: 'uppercase' }}>Total</Text>
                      <span style={{ fontSize: 16 }}>
                        {totalCanje > 0 && <Text className="prize-glow" strong>🎁 S/ {totalCanje.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</Text>}
                        {totalCanje > 0 && totalVenta > 0 && <Text> + </Text>}
                        {totalVenta > 0 && <Text className="saldo-glow" strong>💵 S/ {totalVenta.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</Text>}
                      </span>
                    </div>

                    {user && faltanteCanje > 0 && (
                      <Text style={{ fontSize: 12, color: MISIO_COLORS.danger, lineHeight: 1.2 }}>
                        Te faltan S/ {faltanteCanje.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} para completar el canje.
                      </Text>
                    )}
                    {user && faltanteVenta > 0 && (
                      <Text style={{ fontSize: 12, color: MISIO_COLORS.danger, lineHeight: 1.2 }}>
                        Te faltan S/ {faltanteVenta.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} contables. <a onClick={() => setRecharging(true)}>Recargar</a>
                      </Text>
                    )}
                    {user && chargeCanjeDesdeContable > 0 && faltanteCanje === 0 && (
                      <Text style={{ fontSize: 12, color: MISIO_COLORS.textMuted, lineHeight: 1.2, background: 'rgba(255,255,255,0.05)', padding: '6px 10px', borderRadius: 8 }}>
                        ℹ️ Se usarán <strong style={{ color: MISIO_COLORS.saldoGreen }}>S/ {chargeCanjeDesdeContable.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong> de tu saldo Contable para cubrir lo que falta de Canje.
                      </Text>
                    )}
                  </div>

                  <Button type="primary" block size="large" icon={<ThunderboltFilled />}
                    loading={paying} disabled={user && !canPay} onClick={checkout} style={{ marginTop: 8 }}>
                    {user ? 'Pagar con mi Misio' : 'Iniciar sesión'}
                  </Button>
                </Space>
              )}
            </Card>

          </div>
        </Col>
      </Row>

      <RechargeModal open={recharging} onClose={() => setRecharging(false)}
        onRegistered={() => {}} />

      {/* Modal de datos de entrega (según físico/virtual) */}
      <Modal
        open={deliveryOpen}
        onCancel={() => setDeliveryOpen(false)}
        onOk={confirmCheckout}
        confirmLoading={paying}
        okText={`Confirmar canje — S/ ${total}`}
        title={allVirtual ? '💻 Datos para enviarte el código' : '📦 Datos de entrega'}
      >
        <Form layout="vertical">
          <Alert
            type="info" showIcon style={{ marginBottom: 14 }}
            message={allVirtual
              ? 'Este producto es virtual. Te enviaremos el código por estos medios.'
              : hasVirtual
                ? 'Tu carrito tiene productos físicos y virtuales. Déjanos tus datos de envío y contacto.'
                : 'Necesitamos tu dirección para hacerte llegar el producto.'}
          />
          {!allVirtual && (
            <>
              <Form.Item label="Dirección de envío" required style={{ marginBottom: 10 }}>
                <Input.TextArea rows={2} value={delivery.address}
                  onChange={(e) => setDelivery((d) => ({ ...d, address: e.target.value }))}
                  placeholder="Calle, número, distrito, ciudad" />
              </Form.Item>
              <Form.Item label="Referencia" style={{ marginBottom: 10 }}>
                <Input value={delivery.reference}
                  onChange={(e) => setDelivery((d) => ({ ...d, reference: e.target.value }))}
                  placeholder="Frente al parque, casa azul…" />
              </Form.Item>
            </>
          )}
          <Row gutter={10}>
            <Col xs={24} sm={12}>
              <Form.Item label="Teléfono / WhatsApp" style={{ marginBottom: 10 }}>
                <Input value={delivery.phone}
                  onChange={(e) => setDelivery((d) => ({ ...d, phone: e.target.value }))}
                  placeholder="9XX XXX XXX" />
              </Form.Item>
            </Col>
            <Col xs={24} sm={12}>
              <Form.Item label="Correo" style={{ marginBottom: 10 }}>
                <Input value={delivery.email}
                  onChange={(e) => setDelivery((d) => ({ ...d, email: e.target.value }))}
                  placeholder="tucorreo@ejemplo.com" />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item label="Nota (opcional)" style={{ marginBottom: 0 }}>
            <Input value={delivery.note}
              onChange={(e) => setDelivery((d) => ({ ...d, note: e.target.value }))}
              placeholder="Horario de entrega, indicaciones…" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
