import React, { useState } from 'react';
import TicketCard from '../../components/TicketCard';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  Divider, Tabs, Grid, Space, Steps, Tooltip,
  Card, Col, Row, Statistic, Table, Tag, Typography, Button, List, Avatar, message, Alert, Empty,
} from 'antd';
import {
  WalletFilled, HistoryOutlined, GiftFilled, ArrowUpOutlined, ArrowDownOutlined, TrophyFilled, FilePdfOutlined, InfoCircleOutlined
} from '@ant-design/icons';
import {
  MOCK_USER, MOCK_USER_TICKETS, MOCK_TRANSACTIONS, MOCK_STORE_ITEMS,
} from '../../mocks/mockData';
import { MISIO_COLORS } from '../../theme/misioTheme';
import { useApiOrMock } from '../../hooks/useApiOrMock';
import MyPrizes from '../MyPrizes/MyPrizes';
import Inbox from '../Inbox/Inbox';
import { api } from '../../auth/api';
import RechargeModal from '../../components/RechargeModal';
import CampaignPopup from '../../components/CampaignPopup';

const { Title, Text } = Typography;

const SERVER_URL = import.meta.env.VITE_SERVER_URL || 'http://localhost:3000';

const TICKET_TAG = {
  active: { color: 'processing', label: 'En juego' },
  burned_al_agua: { color: 'default', label: 'Al agua 💧' },
  winner: { color: 'gold', label: '🏆 GANADOR' },
};

const TX_LABEL = {
  deposit_yape: 'Recarga Yape/Plin',
  ticket_purchase: 'Compra de boleto',
  cero_perdida_refund: 'Reembolso Cero Pérdida',
  marketplace_purchase: 'Canje en tienda',
  raffle_cancelled_refund: 'Devolución: rifa cancelada',
  offline_sale: 'Venta física (Externa)',
};

const TX_STATUS_TAG = {
  pending: <Tag color="warning">Pendiente</Tag>,
  failed: <Tag color="error">Rechazada</Tag>,
};

/** Normaliza boletos: la API trae raffleId poblado; el mock, raffleTitle plano. */
const normalizeTicket = (t) => ({
  ...t,
  raffleTitle: t.raffleTitle ?? t.raffleId?.title ?? '—',
  ticketPrice: t.ticketPrice ?? t.raffleId?.ticketPrice ?? null,
  raffleStatus: t.raffleStatus ?? t.raffleId?.status ?? 'active',
  date: t.date ?? (t.createdAt ? new Date(t.createdAt).toLocaleDateString('es-PE') : '—'),
  prizeWonTitle: t.raffleId?.type === 'paquete' && t.prizeIndex !== undefined && t.raffleId?.prizes
    ? t.raffleId.prizes[t.prizeIndex]?.title
    : null,
});

const normalizeTx = (tx) => ({
  ...tx,
  date: tx.date ?? (tx.createdAt ? new Date(tx.createdAt).toLocaleString('es-PE') : '—'),
});

const ticketColumns = [
  { title: 'Rifa', dataIndex: 'raffleTitle', key: 'raffleTitle', ellipsis: true },
  {
    title: 'N° Boleto',
    dataIndex: 'ticketNumber',
    key: 'ticketNumber',
    render: (n) => <Text code>#{String(n).padStart(4, '0')}</Text>,
  },
  {
    title: 'Estado',
    dataIndex: 'status',
    key: 'status',
    render: (s) => <Tag color={TICKET_TAG[s]?.color}>{TICKET_TAG[s]?.label ?? s}</Tag>,
  },
  { title: 'Fecha', dataIndex: 'date', key: 'date', responsive: ['md'] },
];

/**
 * UserDashboard v2 — datos reales del backend con fallback a mock:
 *   GET /users/me         → saldo actualizado (post-compras)
 *   GET /tickets/mine     → historial de boletos
 *   GET /transactions/mine → ledger (incluye depósitos pendientes)
 */
export default function UserDashboard() {
  const { useBreakpoint } = Grid;
  const screens = useBreakpoint();
  const [msgApi, contextHolder] = message.useMessage();
  const navigate = useNavigate();
  const location = useLocation();
  const searchParams = new URLSearchParams(location.search);
  const defaultTab = searchParams.get('tab') || '1';

  const [recharging, setRecharging] = useState(false);
  const [activeTab, setActiveTab] = useState(defaultTab);

  const { data: profile, demo, refresh: reloadProfile } = useApiOrMock('/users/me', MOCK_USER);
  const { data: rawTickets } = useApiOrMock('/tickets/mine', MOCK_USER_TICKETS);
  const { data: rawTxs } = useApiOrMock('/transactions/mine', MOCK_TRANSACTIONS);
  const { data: notifications } = useApiOrMock('/notifications/mine', []);
  const { data: storeItems, refresh: refreshStore } = useApiOrMock('/store/items', MOCK_STORE_ITEMS);
  const { data: rawMyRedemptions } = useApiOrMock('/store/redemptions/mine', []);
  const { refresh: refreshProfile } = { refresh: () => {} };

  const myRedemptions = rawMyRedemptions || [];

  const tickets = rawTickets.map(normalizeTicket);
  const transactions = rawTxs.map(normalizeTx);
  const balance = Number(profile.walletBalance ?? 0);
  const playingBalance = tickets
    .filter(t => t.status === 'active' && t.raffleStatus !== 'completed')
    .reduce((sum, t) => sum + Number(t.ticketPrice ?? 0), 0);

  const tabOptions = [
    {
      key: '1',
      label: 'Resumen & Billetera',
      icon: '📊',
    },
    {
      key: '2',
      label: 'Premios & Correo',
      icon: '🏆',
      badge: notifications.filter(n => !n.read).length > 0 ? notifications.filter(n => !n.read).length : null,
    },
    {
      key: '3',
      label: 'Mis Boletos',
      icon: '🎟️',
      badge: tickets.length > 0 ? tickets.length : null,
    },
    {
      key: '4',
      label: 'Mis Compras',
      icon: '🛍️',
      badge: myRedemptions.length > 0 ? myRedemptions.length : null,
    },
  ];

  const redeem = async (item) => {
    const price = item.priceMisio ?? item.price;
    if (price > balance) {
      msgApi.warning('Saldo insuficiente para este canje.');
      return;
    }
    if (demo) {
      msgApi.success(`(Demo) Canjeaste "${item.name}" por S/ ${price}.`);
      return;
    }
    try {
      await api('/store/redeem', { method: 'POST', body: { itemId: item._id } });
      msgApi.success(`¡Canje registrado! "${item.name}" — te contactaremos para la entrega.`, 6);
      reloadProfile();
      refreshStore();
    } catch (err) {
      msgApi.error(err.message);
    }
  };

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
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <Title level={3} style={{ margin: 0 }}>Hola, {profile.name?.split(' ')[0]} 👋</Title>
      </div>
      
      <PushBanner msgApi={msgApi} />

      {/* ── ESTILOS UX/UI PARA PESTAÑAS REALES Y COMPACTAS ──────────────── */}
      <style>{`
        .misio-tabs-container {
          display: flex;
          gap: 6px;
          border-bottom: 2px solid #e2e8f0;
          margin-bottom: 24px;
          overflow-x: auto;
          scrollbar-width: none;
        }
        .misio-tabs-container::-webkit-scrollbar {
          display: none;
        }
        .misio-real-tab {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          padding: 10px 22px;
          cursor: pointer;
          border-radius: 10px 10px 0 0;
          margin-bottom: -2px;
          transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
          user-select: none;
          white-space: nowrap;
          font-size: 14px;
        }
        .misio-real-tab.active {
          background: #ecfdf5;
          border-top: 1.5px solid #6ee7b7;
          border-left: 1.5px solid #6ee7b7;
          border-right: 1.5px solid #6ee7b7;
          border-bottom: 2.5px solid #047857;
          color: #047857;
          font-weight: 700;
        }
        .misio-real-tab.inactive {
          background: transparent;
          border-top: 1.5px solid transparent;
          border-left: 1.5px solid transparent;
          border-right: 1.5px solid transparent;
          border-bottom: 2.5px solid transparent;
          color: #64748b;
          font-weight: 500;
        }
        .misio-real-tab.inactive:hover {
          background: #f8fafc;
          color: #1e293b;
          border-top-color: #e2e8f0;
          border-left-color: #e2e8f0;
          border-right-color: #e2e8f0;
        }
        .tab-badge {
          padding: 1px 8px;
          border-radius: 12px;
          font-size: 11px;
          font-weight: 700;
          transition: all 0.2s ease;
        }
        .misio-real-tab.active .tab-badge {
          background: #047857;
          color: #ffffff;
        }
        .misio-real-tab.inactive .tab-badge {
          background: #e2e8f0;
          color: #475569;
        }
        .tab-content-fade {
          animation: misioTabFadeIn 0.3s cubic-bezier(0.4, 0, 0.2, 1);
        }
        @keyframes misioTabFadeIn {
          0% { opacity: 0; transform: translateY(6px); }
          100% { opacity: 1; transform: translateY(0); }
        }
      `}</style>

      {/* ── NAVEGACIÓN DE PESTAÑAS (TABS REALES Y COMPACTOS) ───────────── */}
      <div className="misio-tabs-container">
        {tabOptions.map((item) => {
          const isActive = activeTab === item.key;
          return (
            <div
              key={item.key}
              className={`misio-real-tab ${isActive ? 'active' : 'inactive'}`}
              onClick={() => setActiveTab(item.key)}
            >
              <span style={{ fontSize: '16px', display: 'flex', alignItems: 'center' }}>
                {item.icon}
              </span>
              <span>{item.label}</span>
              
              {item.badge !== null && item.badge !== undefined && (
                <span className="tab-badge">
                  {item.badge}
                </span>
              )}
            </div>
          );
        })}
      </div>

      {/* ── CONTENIDO DE LA PESTAÑA ACTIVA ───────────────────────────── */}
      <div className="tab-content-fade" key={activeTab}>
        {activeTab === '1' && (
              <Row gutter={[20, 20]}>
                <Col xs={24} md={10} lg={8}>
                  <Card
                    style={{
                      background: `linear-gradient(135deg, #1f2937, #111827)`,
                      border: `1px solid rgba(0, 229, 143, 0.4)`,
                      borderRadius: 16,
                      boxShadow: '0 10px 25px -5px rgba(0, 229, 143, 0.1)',
                      color: 'white'
                    }}
                    styles={{ body: { padding: '24px' } }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <Text style={{ color: 'rgba(255,255,255,0.7)', fontSize: 14 }}>MISIO CARD</Text>
                      <WalletFilled style={{ color: MISIO_COLORS.primary, fontSize: 24 }} />
                    </div>
                    
                    <div style={{ margin: '24px 0' }}>
                      <Text style={{ color: 'rgba(255,255,255,0.5)', fontSize: 12, textTransform: 'uppercase' }}>Saldo Contable (Dinero Real)</Text>
                      <div style={{ fontSize: 'clamp(28px, 6vw, 36px)', fontWeight: 800, color: '#fff', lineHeight: 1.2 }}>
                        S/ {balance.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </div>
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 16, background: 'rgba(255,255,255,0.05)', padding: '12px', borderRadius: 8 }}>
                      <div style={{ flex: 1, position: 'relative' }}>
                        <Text style={{ color: 'rgba(255,255,255,0.5)', fontSize: 11, display: 'block' }}>Saldo de Canje</Text>
                        <Tooltip title={
                          profile.canjeTranches?.length > 0 ? (
                            <div style={{ fontSize: 12 }}>
                              {profile.canjeTranches.map((t, i) => {
                                const days = Math.ceil((new Date(t.expiresAt).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
                                return (
                                  <div key={i} style={{ marginBottom: 4 }}>
                                    S/ {t.amount.toFixed(2)} vencen en {days > 0 ? `${days} días` : 'hoy'}
                                  </div>
                                );
                              })}
                            </div>
                          ) : 'Tu saldo devuelto de sorteos sin ganar'
                        } color="#1a1a1a" placement="bottomLeft">
                          <Text style={{ color: MISIO_COLORS.prizeGold, fontWeight: 700, fontSize: 16, cursor: 'help' }}>
                            S/ {Number(profile.walletCanje ?? 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            {profile.canjeTranches?.length > 0 && (
                              <InfoCircleOutlined style={{ fontSize: 12, marginLeft: 4, color: 'rgba(255,255,255,0.5)' }} />
                            )}
                          </Text>
                        </Tooltip>
                        
                        {/* ⚠️ ALERTA VISIBLE DE VENCIMIENTO */}
                        {profile.canjeTranches?.length > 0 && (() => {
                           // Tomamos el tramo que vence más pronto
                           const soonest = [...profile.canjeTranches].sort((a, b) => new Date(a.expiresAt).getTime() - new Date(b.expiresAt).getTime())[0];
                           const days = Math.ceil((new Date(soonest.expiresAt).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
                           if (days <= 5) {
                             return (
                               <div style={{ marginTop: 2 }}>
                                 <span style={{ 
                                   fontSize: 10, background: 'rgba(255,77,109,0.2)', color: MISIO_COLORS.danger, 
                                   padding: '2px 6px', borderRadius: 4, fontWeight: 600, display: 'inline-block' 
                                 }}>
                                   ⚠️ Expira en {days > 0 ? `${days}d` : 'hoy'}
                                 </span>
                               </div>
                             );
                           }
                           return null;
                        })()}
                      </div>
                      <div style={{ flex: 1, textAlign: 'center', borderLeft: '1px solid rgba(255,255,255,0.1)', borderRight: Number(profile.walletHeld ?? 0) > 0 ? '1px solid rgba(255,255,255,0.1)' : 'none', padding: '0 8px' }}>
                        <Text style={{ color: 'rgba(255,255,255,0.5)', fontSize: 11, display: 'block' }}>En Juego</Text>
                        <Text style={{ color: '#00e58f', fontWeight: 700, fontSize: 16 }}>S/ {playingBalance.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</Text>
                      </div>
                      {Number(profile.walletHeld ?? 0) > 0 && (
                        <div style={{ flex: 1, textAlign: 'right' }}>
                          <Text style={{ color: 'rgba(255,255,255,0.5)', fontSize: 11, display: 'block' }}>Retenido</Text>
                          <Text style={{ color: '#fff', fontWeight: 700, fontSize: 16 }}>S/ {Number(profile.walletHeld ?? 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</Text>
                        </div>
                      )}
                    </div>
                    
                    <Button
                      type="primary"
                      block
                      size="large"
                      style={{ marginTop: 24, borderRadius: 8, fontWeight: 600, height: 48 }}
                      onClick={() => setRecharging(true)}
                    >
                      💳 Recargar Saldo
                    </Button>
                  </Card>
                </Col>

                <Col xs={24} md={14} lg={16}>
                  <Card
                    title={<><HistoryOutlined /> Movimientos recientes</>}
                    style={{ borderRadius: 12, boxShadow: '0 4px 12px rgba(0,0,0,0.05)' }}
                    styles={{ body: { padding: '12px 24px' } }}
                  >
                    {transactions.length === 0 ? (
                      <Empty description="No tienes movimientos aún" style={{ margin: '40px 0' }} />
                    ) : (
                      <List
                        dataSource={transactions.slice(0, 5)} // Mostrar solo los 5 más recientes en el resumen
                        renderItem={(tx) => {
                          const isIncome = tx.amount > 0;
                          return (
                            <List.Item style={{ padding: '16px 0', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                              <List.Item.Meta
                                avatar={
                                  <Avatar
                                    size="large"
                                    style={{
                                      background: isIncome ? 'rgba(0,229,143,0.1)' : 'rgba(255,77,109,0.1)',
                                      color: isIncome ? MISIO_COLORS.saldoGreen : MISIO_COLORS.danger,
                                    }}
                                    icon={isIncome ? <ArrowUpOutlined /> : <ArrowDownOutlined />}
                                  />
                                }
                                title={
                                  <Text style={{ fontSize: 15, fontWeight: 500 }}>
                                    {TX_LABEL[tx.type] ?? tx.type} {TX_STATUS_TAG[tx.status]}
                                  </Text>
                                }
                                description={<Text style={{ fontSize: 12, color: MISIO_COLORS.textMuted }}>{tx.date}</Text>}
                              />
                              <Text
                                strong
                                style={{ fontSize: 16, color: isIncome ? MISIO_COLORS.saldoGreen : MISIO_COLORS.danger }}
                              >
                                {isIncome ? '+' : ''}S/ {Math.abs(tx.amount).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                              </Text>
                            </List.Item>
                          );
                        }}
                      />
                    )}
                  </Card>
                </Col>
              </Row>
        )}

        {activeTab === '2' && (
              <Row gutter={[20, 20]}>
                <Col xs={24} lg={14}>
                  <Card title={<><TrophyFilled style={{ color: MISIO_COLORS.prizeGold }} /> Mis premios y envíos</>}
                    style={{ marginBottom: 20, borderRadius: 12, boxShadow: '0 4px 12px rgba(0,0,0,0.05)' }}>
                    <MyPrizes />
                  </Card>
                </Col>
                <Col xs={24} lg={10}>
                  <div style={{ marginBottom: 20 }}>
                    <Inbox />
                  </div>
                </Col>
              </Row>
        )}

        {activeTab === '3' && (
              <Card style={{ borderRadius: 12, boxShadow: '0 4px 12px rgba(0,0,0,0.05)' }}>
                {tickets.length === 0 ? (
                  <Empty description="Aún no tienes boletos — ¡elige tus números en una rifa!" style={{ margin: '40px 0' }} />
                ) : (() => {
                  const winners = tickets.filter((t) => t.status === 'winner');
                  const vigentes = tickets.filter((t) =>
                    t.status !== 'winner' && ['active', 'live'].includes(t.raffleStatus));
                  const anteriores = tickets.filter((t) =>
                    t.status !== 'winner' && !['active', 'live'].includes(t.raffleStatus));

                  const grid = (list, variant) => (
                    <Row gutter={[16, 16]}>
                      {list.map((t) => (
                        <Col xs={24} md={12} lg={8} key={t._id}>
                          <TicketCard
                            ticket={t}
                            variant={variant}
                            raffle={{ title: t.raffleTitle, ticketPrice: t.ticketPrice }}
                          />
                        </Col>
                      ))}
                    </Row>
                  );

                  return (
                    <Tabs
                      defaultActiveKey={winners.length > 0 ? 'ganadores' : 'vigentes'}
                      type="card"
                      items={[
                        {
                          key: 'vigentes',
                          label: `En Juego (${vigentes.length})`,
                          children: vigentes.length > 0 ? grid(vigentes, 'normal')
                            : <Empty description="No tienes boletos en sorteos vigentes." />,
                        },
                        {
                          key: 'ganadores',
                          label: <span style={{ color: winners.length > 0 ? MISIO_COLORS.prizeGold : undefined }}>
                            Ganadores ({winners.length})
                          </span>,
                          children: winners.length > 0 ? grid(winners, 'winner')
                            : <Empty description="Aún no tienes boletos ganadores. ¡Suerte en el próximo sorteo!" />,
                        },
                        {
                          key: 'anteriores',
                          label: `Pasados (${anteriores.length})`,
                          children: anteriores.length > 0 ? grid(anteriores, 'normal')
                            : <Empty description="No tienes boletos de sorteos pasados." />,
                        },
                      ]}
                    />
                  );
                })()}
              </Card>
        )}

        {activeTab === '4' && (
              <Card style={{ borderRadius: 12, boxShadow: '0 4px 12px rgba(0,0,0,0.05)' }}>
                {myRedemptions.length === 0 ? (
                  <Empty description="No tienes compras en la tienda aún." style={{ margin: '40px 0' }} />
                ) : (() => {
                  const sortedRedemptions = [...myRedemptions].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
                  const pendientes = sortedRedemptions.filter(r => r.status === 'pending');
                  const proceso = sortedRedemptions.filter(r => r.status === 'processing');
                  const entregados = sortedRedemptions.filter(r => r.status === 'delivered');

                  const renderList = (list) => (
                    <Row gutter={[16, 16]}>
                      {list.map((r) => {
                        const item = r.itemId || {};
                        const steps = [
                          { title: 'Pendiente', description: 'Orden recibida' },
                          { title: 'Procesando', description: 'Preparando envío' },
                          { title: 'Entregado', description: r.deliveryNote || 'Finalizado' },
                        ];
                        const currentStep = r.status === 'pending' ? 0 : r.status === 'processing' ? 1 : 2;
                        
                        return (
                          <Col xs={24} key={r._id}>
                            <Card bordered={true} style={{ borderRadius: 12, borderColor: 'var(--z-border)' }} size="small">
                              <Row gutter={[16, 16]} align="middle">
                                <Col xs={24} md={7}>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                                    <div style={{ fontSize: 32, background: 'var(--z-bg-layout)', width: 64, height: 64, borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                      {item.emoji || '📦'}
                                    </div>
                                    <div style={{ minWidth: 0 }}>
                                      <Text strong style={{ fontSize: 16, display: 'block', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.name}</Text>
                                      <Text type="secondary" style={{ fontSize: 12 }}>{new Date(r.createdAt).toLocaleDateString('es-PE')}</Text>
                                    </div>
                                  </div>
                                </Col>
                                <Col xs={24} md={12}>
                                  <Steps size="small" current={currentStep} items={steps} />
                                </Col>
                                <Col xs={24} md={5}>
                                  {r.receipts && r.receipts.length > 0 ? (
                                    <div style={{ textAlign: 'right', display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
                                      <Text strong style={{ display: 'block', marginBottom: 6, fontSize: 11, color: 'var(--z-text-muted)', textTransform: 'uppercase' }}>Recibo(s)</Text>
                                      <Space wrap style={{ justifyContent: 'flex-end' }} size="small">
                                        {r.receipts.map((url, i) => (
                                          <a key={i} href={`${SERVER_URL}${url}`} target="_blank" rel="noreferrer">
                                            <Button size="small" type="default" icon={<FilePdfOutlined style={{ color: '#ff4d4f' }} />} style={{ borderRadius: 6 }}>
                                              {r.receipts.length > 1 ? `Doc ${i + 1}` : 'Ver PDF'}
                                            </Button>
                                          </a>
                                        ))}
                                      </Space>
                                    </div>
                                  ) : (
                                    <div style={{ textAlign: 'right' }}>
                                      <Text type="secondary" style={{ fontSize: 12 }}>Sin recibo aún</Text>
                                    </div>
                                  )}
                                </Col>
                              </Row>
                            </Card>
                          </Col>
                        );
                      })}
                    </Row>
                  );

                  return (
                    <Tabs
                      defaultActiveKey="all"
                      type="card"
                      items={[
                        {
                          key: 'all',
                          label: `Todos (${sortedRedemptions.length})`,
                          children: renderList(sortedRedemptions),
                        },
                        {
                          key: 'pending',
                          label: `Pendiente (${pendientes.length})`,
                          children: pendientes.length > 0 ? renderList(pendientes) : <Empty description="No tienes compras pendientes." />,
                        },
                        {
                          key: 'processing',
                          label: `Procesando (${proceso.length})`,
                          children: proceso.length > 0 ? renderList(proceso) : <Empty description="No tienes compras en proceso." />,
                        },
                        {
                          key: 'delivered',
                          label: `Entregado (${entregados.length})`,
                          children: entregados.length > 0 ? renderList(entregados) : <Empty description="No tienes compras entregadas." />,
                        },
                      ]}
                    />
                  );
                })()}
              </Card>
        )}
      </div>

      <CampaignPopup />

      <RechargeModal
        open={recharging}
        onClose={() => setRecharging(false)}
        onRegistered={() => {}}
      />
    </div>
  );
}

function PushBanner({ msgApi }) {
  const [state, setState] = React.useState('idle');
  React.useEffect(() => {
    import('../../auth/push').then(async ({ isPushSupported }) => {
      if (!(await isPushSupported())) setState('unsupported');
      else if (Notification.permission === 'granted') setState('on');
    });
  }, []);
  if (state === 'unsupported' || state === 'on') return null;
  const enable = async () => {
    const { subscribeToPush } = await import('../../auth/push');
    const ok = await subscribeToPush();
    if (ok) { setState('on'); msgApi.success('🔔 Notificaciones activadas'); }
    else msgApi.info('No se pudieron activar. Revisa los permisos del navegador.');
  };
  return (
    <Alert type="info" showIcon style={{ marginBottom: 16 }}
      message="🔔 Activa las notificaciones"
      description="Te avisamos cuando tu sorteo esté por empezar y cuando ganes — aunque no tengas la app abierta."
      action={<Button size="small" type="primary" onClick={enable}>Activar</Button>} />
  );
}
