import React, { useState } from 'react';
import {
  Card, Col, Row, Typography, Table, Tag, DatePicker, Space, Button, Alert, Select, Grid, List,
} from 'antd';
import {
  DownloadOutlined, WalletFilled, ShoppingFilled, GiftFilled, BankFilled,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import { MISIO_COLORS } from '../../theme/misioTheme';
import { useApiOrMock } from '../../hooks/useApiOrMock';
import { StatBox } from '../AdminShell/AdminShell';

const { Title, Text } = Typography;
const { RangePicker } = DatePicker;

const S = (n) => `S/ ${Number(n ?? 0).toLocaleString('es-PE', { minimumFractionDigits: 2 })}`;

const TYPE_LABEL = {
  deposit_yape: 'Recarga Yape',
  ticket_purchase: 'Compra de boletos',
  cero_perdida_refund: 'Reembolso Cero Pérdida',
  marketplace_purchase: 'Compra en tienda',
  raffle_cancelled_refund: 'Devolución por cancelación',
  welcome_bonus: 'Bono de bienvenida',
  auction_payment: 'Pago de subasta',
  offline_sale: 'Venta POS (Efectivo)',
};

const MOCK_SUMMARY = {
  income: { deposits: 8410, deposCount: 143 },
  costs: { prizes: 3120, prizesCount: 4 },
  cash: 5290,
  activity: { ticketSales: 7300, ticketsCount: 934, storeVenta: 480, storeCanje: 1260, auctionPayments: 900 },
  promo: { ceroPerdida: 2480, bonuses: 145, cancelRefunds: 0 },
  liability: { contable: 1240, canje: 980, held: 300, total: 2520 },
  queue: { pendingDeposits: 4 },
};

/**
 * 🧮 CONTABILIDAD — la foto financiera del negocio.
 *
 * La distinción que hace honesto el número: DINERO REAL vs SALDO
 * PROMOCIONAL. Las recargas son plata que entró; el saldo de canje que
 * repartes por Cero Pérdida NO es una salida de caja: es un pasivo que
 * se paga con producto (con TU margen). Mezclarlos te haría creer que
 * pierdes plata cada vez que alguien no gana — y es al revés.
 */
export default function AdminAccounting() {
  const screens = Grid.useBreakpoint();
  const isDesktop = screens.lg;
  const [range, setRange] = useState([dayjs().startOf('month'), dayjs()]);
  const [type, setType] = useState();

  const qs = `from=${range[0].toISOString()}&to=${range[1].endOf('day').toISOString()}`;
  const { data: s, demo } = useApiOrMock(`/accounting/summary?${qs}`, MOCK_SUMMARY);
  const { data: ledger } = useApiOrMock(
    `/accounting/ledger?${qs}${type ? `&type=${type}` : ''}`, [],
  );

  const exportCsv = () => {
    const rows = [
      ['Fecha', 'Tipo', 'Usuario', 'DNI', 'Billetera', 'Monto', 'Estado'],
      ...ledger.map((t) => [
        dayjs(t.createdAt).format('DD/MM/YYYY HH:mm'),
        TYPE_LABEL[t.type] ?? t.type,
        t.userId?.name ?? '—',
        t.userId?.dni ?? '—',
        t.wallet ?? 'contable',
        Number(t.amount).toFixed(2),
        t.status,
      ]),
    ];
    const csv = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
    // BOM para que Excel en español abra las tildes bien
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `misio-contabilidad-${dayjs().format('YYYY-MM-DD')}.csv`;
    a.click();
  };

  const columns = [
    {
      title: 'Fecha', dataIndex: 'createdAt', key: 'date',
      render: (d) => <Text style={{ fontSize: 12 }}>{dayjs(d).format('DD/MM/YY HH:mm')}</Text>,
    },
    {
      title: 'Movimiento', dataIndex: 'type', key: 'type',
      render: (t) => <Tag>{TYPE_LABEL[t] ?? t}</Tag>,
    },
    {
      title: 'Usuario', key: 'user', responsive: ['md'],
      render: (_, r) => (
        <Text style={{ fontSize: 12 }}>
          {r.userId?.name ?? '—'}
          {r.userId?.dni && <Text style={{ color: MISIO_COLORS.textMuted }}> · {r.userId.dni}</Text>}
        </Text>
      ),
    },
    {
      title: 'Billetera', dataIndex: 'wallet', key: 'wallet', responsive: ['lg'],
      render: (w) => (w === 'canje'
        ? <Tag color={MISIO_COLORS.prizeGold} style={{ color: '#3d2e00' }}>🎁 Canje</Tag>
        : <Tag color={MISIO_COLORS.saldoGreen} style={{ color: '#06281c' }}>💵 Contable</Tag>),
    },
    {
      title: 'Monto', dataIndex: 'amount', key: 'amount', align: 'right',
      render: (a) => (
        <Text strong style={{ color: a >= 0 ? MISIO_COLORS.saldoGreen : MISIO_COLORS.danger }}>
          {a >= 0 ? '+' : ''}{S(a)}
        </Text>
      ),
    },
    {
      title: 'Estado', dataIndex: 'status', key: 'status', responsive: ['sm'],
      render: (st) => st === 'completed'
        ? <Tag color="success">OK</Tag>
        : st === 'pending' ? <Tag color="warning">Pendiente</Tag> : <Tag color="error">Falló</Tag>,
    },
  ];

  return (
    <div>
      <Space wrap style={{ marginBottom: 16, width: '100%', justifyContent: 'space-between' }}>
        <Title level={3} style={{ margin: 0 }}>🧮 Contabilidad</Title>
        <Space wrap>
          <RangePicker value={range} onChange={(v) => v && setRange(v)} format="DD/MM/YYYY"
            presets={[
              { label: 'Hoy', value: [dayjs().startOf('day'), dayjs()] },
              { label: 'Últimos 7 días', value: [dayjs().subtract(7, 'day'), dayjs()] },
              { label: 'Este mes', value: [dayjs().startOf('month'), dayjs()] },
              { label: 'Mes pasado', value: [dayjs().subtract(1, 'month').startOf('month'), dayjs().subtract(1, 'month').endOf('month')] },
            ]} />
          <Button icon={<DownloadOutlined />} onClick={exportCsv} disabled={!ledger.length}>
            Exportar CSV
          </Button>
        </Space>
      </Space>

      {demo && <Alert type="info" showIcon style={{ marginBottom: 16 }} message="Modo demo: cifras de ejemplo." />}

      {/* ── Dinero REAL ─────────────────────────────────────────── */}
      <Text strong style={{ display: 'block', marginBottom: 8 }}>💵 Dinero real del periodo</Text>
      <Row gutter={[16, 16]}>
        <Col xs={24} sm={12} lg={8}>
          <StatBox color="linear-gradient(135deg,#059669,#34d399)" value={S(s.income?.deposits)}
            label={`Ingresos por recargas/ventas (${s.income?.deposCount ?? 0})`} icon={<WalletFilled />} />
        </Col>
        <Col xs={24} sm={12} lg={8}>
          <StatBox color="linear-gradient(135deg,#b45309,#e8b84a)" value={S(s.costs?.prizes)}
            label={`Costo de premios comprados (${s.costs?.prizesCount ?? 0})`} icon={<GiftFilled />} />
        </Col>
        <Col xs={24} sm={12} lg={8}>
          <StatBox color="linear-gradient(135deg,#047857,#0d9488)" value={S(s.cash)}
            label="Caja del periodo (recargas − premios)" icon={<BankFilled />} />
        </Col>
      </Row>

      {/* ── Actividad y pasivo ──────────────────────────────────── */}
      <Row gutter={[16, 16]} style={{ marginTop: 20 }}>
        <Col xs={24} lg={12}>
          <Card title="🎟️ Actividad (mueve saldo, no es ingreso nuevo)" size="small">
            {[
              ['Venta de boletos', s.activity?.ticketSales, `${s.activity?.ticketsCount ?? 0} boletos`],
              ['Tienda — productos de venta', s.activity?.storeVenta, 'cobrado del saldo contable'],
              ['Tienda — canjes', s.activity?.storeCanje, 'cobrado del saldo de canje'],
              ['Subastas adjudicadas', s.activity?.auctionPayments, 'pago con retención'],
            ].map(([l, v, hint]) => (
              <div key={l} style={{ display: 'flex', justifyContent: 'space-between',
                alignItems: 'center', padding: '8px 0', borderBottom: '1px solid var(--z-border)' }}>
                <div>
                  <Text style={{ fontSize: 13 }}>{l}</Text>
                  <br />
                  <Text style={{ fontSize: 11, color: MISIO_COLORS.textMuted }}>{hint}</Text>
                </div>
                <Text strong>{S(v)}</Text>
              </div>
            ))}
          </Card>
        </Col>
        <Col xs={24} lg={12}>
          <Card title="📊 Pasivo con los usuarios (lo que les debes)" size="small">
            {[
              ['💵 Saldo contable en billeteras', s.liability?.contable, 'dinero real: si te lo piden, es deuda'],
              ['🎁 Saldo de canje (Cero Pérdida)', s.liability?.canje, 'se paga con producto, a tu costo'],
              ['🔒 Retenido en subastas', s.liability?.held, 'congelado por pujas líderes'],
              ['⏱️ Saldo próximo a vencer', s.liability?.expiringAmount, s.liability?.nextExpirationDate ? `vencimiento más cercano: ${dayjs(s.liability?.nextExpirationDate).format('DD/MM/YYYY')}` : 'sin saldo por vencer'],
            ].map(([l, v, hint]) => (
              <div key={l} style={{ display: 'flex', justifyContent: 'space-between',
                alignItems: 'center', padding: '8px 0', borderBottom: '1px solid var(--z-border)' }}>
                <div>
                  <Text style={{ fontSize: 13 }}>{l}</Text>
                  <br />
                  <Text style={{ fontSize: 11, color: MISIO_COLORS.textMuted }}>{hint}</Text>
                </div>
                <Text strong>{S(v)}</Text>
              </div>
            ))}
            <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: 10 }}>
              <Text strong>Total del pasivo</Text>
              <Text strong style={{ color: MISIO_COLORS.prizeGold, fontSize: 16 }}>
                {S(s.liability?.total)}
              </Text>
            </div>
          </Card>
        </Col>
      </Row>

      {/* ── Promocional entregado ───────────────────────────────── */}
      <Card size="small" style={{ marginTop: 20 }}
        title="🎁 Saldo promocional entregado en el periodo">
        <Alert type="info" showIcon style={{ marginBottom: 12 }}
          message="Esto NO es plata que salió de tu caja"
          description="El saldo de canje se convierte en costo solo cuando el usuario canjea un producto — y ahí pagas el precio mayorista, no el valor nominal. Por eso va separado del dinero real." />
        <Row gutter={[16, 16]}>
          {[
            ['Cero Pérdida devuelto', s.promo?.ceroPerdida],
            ['Bonos de bienvenida', s.promo?.bonuses],
            ['Devoluciones por cancelación (real)', s.promo?.cancelRefunds],
          ].map(([l, v]) => (
            <Col xs={24} sm={8} key={l}>
              <Text style={{ fontSize: 12, color: MISIO_COLORS.textMuted, display: 'block' }}>{l}</Text>
              <Text strong style={{ fontSize: 18 }}>{S(v)}</Text>
            </Col>
          ))}
        </Row>
      </Card>

      {/* ── Libro mayor ─────────────────────────────────────────── */}
      <Card
        style={{ marginTop: 20, boxShadow: '0 8px 24px rgba(0,0,0,0.05)', border: 'none', borderRadius: 16 }}
        title={
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center', justifyContent: 'space-between' }}>
            <span>📒 Libro de movimientos <Tag style={{ marginLeft: 8 }}>{ledger.length}</Tag></span>
            <Select allowClear placeholder="Todos los tipos" style={{ width: '100%', maxWidth: 220 }}
              value={type} onChange={setType}
              options={Object.entries(TYPE_LABEL).map(([v, l]) => ({ value: v, label: l }))} />
          </div>
        }
      >
        {isDesktop ? (
          <Table dataSource={ledger} columns={columns} rowKey="_id" size="small"
            scroll={{ x: 640 }} pagination={{ pageSize: 15, showSizeChanger: false }} />
        ) : (
          <List
            dataSource={ledger}
            pagination={{ pageSize: 10, size: 'small' }}
            renderItem={(t) => (
              <List.Item style={{ padding: '0 0 12px' }}>
                <Card size="small" style={{ width: '100%', borderRadius: 12, border: 'none', backgroundColor: MISIO_COLORS.primary, boxShadow: '0 4px 16px rgba(0,163,143,0.3)' }} styles={{ body: { padding: '16px' } }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                    <Text strong style={{ fontSize: 13, color: '#fff' }}>{TYPE_LABEL[t.type] ?? t.type}</Text>
                    <Text strong style={{ fontSize: 14, color: t.amount >= 0 ? '#a7f3d0' : '#fecaca' }}>
                      {t.amount >= 0 ? '+' : ''}{S(t.amount)}
                    </Text>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'rgba(255,255,255,0.75)', marginBottom: 8 }}>
                    <span>{dayjs(t.createdAt).format('DD/MM/YY HH:mm')}</span>
                    {t.status === 'completed' ? <Tag color="success" style={{ margin: 0 }}>OK</Tag>
                      : t.status === 'pending' ? <Tag color="warning" style={{ margin: 0 }}>Pdte</Tag> : <Tag color="error" style={{ margin: 0 }}>Falló</Tag>}
                  </div>
                  {t.userId && (
                    <div style={{ background: 'rgba(255,255,255,0.1)', padding: 8, borderRadius: 8, border: '1px solid rgba(255,255,255,0.2)', display: 'flex', justifyContent: 'space-between' }}>
                      <Text style={{ fontSize: 12, color: '#fff' }}>{t.userId?.name ?? '—'}</Text>
                      {t.userId?.dni && <Text style={{ fontSize: 11, color: 'rgba(255,255,255,0.6)' }}>{t.userId.dni}</Text>}
                    </div>
                  )}
                  <div style={{ marginTop: 8, textAlign: 'right' }}>
                    {t.wallet === 'canje' ? <Tag color={MISIO_COLORS.prizeGold} style={{ color: '#3d2e00', margin: 0 }}>🎁 Canje</Tag>
                      : <Tag color={MISIO_COLORS.saldoGreen} style={{ color: '#06281c', margin: 0 }}>💵 Contable</Tag>}
                  </div>
                </Card>
              </List.Item>
            )}
          />
        )}
      </Card>
    </div>
  );
}
