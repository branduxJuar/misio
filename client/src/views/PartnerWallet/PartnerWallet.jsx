import React, { useState, useEffect, useCallback } from 'react';
import {
  Card, Typography, Button, Table, Tag, Modal, Form, InputNumber,
  Input, message, Statistic, Space, Divider, Alert, Tooltip, Empty,
  Grid, List, Descriptions,
} from 'antd';
import {
  WalletOutlined, SendOutlined, CheckCircleOutlined,
  ClockCircleOutlined, CloseCircleOutlined, ReloadOutlined,
  EyeOutlined, EyeInvisibleOutlined
} from '@ant-design/icons';
import { api } from '../../auth/api';
import { useAuth } from '../../auth/AuthContext';
import { MISIO_COLORS } from '../../theme/misioTheme';
import dayjs from 'dayjs';

const { Title, Text } = Typography;
const { useBreakpoint } = Grid;

const STATUS_TAG = {
  pending: <Tag icon={<ClockCircleOutlined />} color="orange">Pendiente</Tag>,
  completed: <Tag icon={<CheckCircleOutlined />} color="success">Completado</Tag>,
  rejected: <Tag icon={<CloseCircleOutlined />} color="error">Rechazado</Tag>,
};

export default function PartnerWallet() {
  const { user } = useAuth();
  const screens = useBreakpoint();
  const isDesktop = screens.md;

  const [partner, setPartner] = useState(null);
  const [payouts, setPayouts] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [requesting, setRequesting] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [showPrices, setShowPrices] = useState(true);
  const [form] = Form.useForm();
  const [msgApi, contextHolder] = message.useMessage();

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const [empresas, payoutsData, adminStats] = await Promise.all([
        api('/empresas'),
        api('/empresas/payouts'),
        api('/stats/admin'),
      ]);
      setPartner(empresas?.[0] ?? null);
      setPayouts(payoutsData);
      setStats(adminStats);
    } catch (err) {
      msgApi.error('Error al cargar la billetera');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const onRequestPayout = async (values) => {
    setRequesting(true);
    try {
      await api('/empresas/payouts/request', {
        method: 'POST',
        body: { amount: values.amount, notes: values.notes },
      });
      msgApi.success('Solicitud de retiro enviada. El equipo Misio la revisará pronto.');
      setModalOpen(false);
      form.resetFields();
      load();
    } catch (err) {
      msgApi.error(err.response?.data?.message || 'No se pudo enviar la solicitud');
    } finally {
      setRequesting(false);
    }
  };

  const columns = [
    {
      title: 'Fecha',
      dataIndex: 'createdAt',
      render: (v) => dayjs(v).format('DD/MM/YYYY HH:mm'),
    },
    {
      title: 'Monto Solicitado',
      dataIndex: 'amount',
      render: (v) => <Text strong style={{ color: MISIO_COLORS.primary }}>S/ {showPrices ? Number(v).toFixed(2) : '***'}</Text>,
    },
    {
      title: 'Estado',
      dataIndex: 'status',
      render: (v) => STATUS_TAG[v] ?? <Tag>{v}</Tag>,
    },
    {
      title: 'Datos / Notas',
      dataIndex: 'notes',
      render: (v) => v ? <Text type="secondary" style={{ fontSize: 12 }}>{v}</Text> : '-',
    },
    {
      title: 'Comprobante',
      dataIndex: 'receiptUrl',
      render: (v) => v
        ? <Button type="link" size="small" href={v} target="_blank">Ver PDF / Imagen</Button>
        : <Text type="secondary">-</Text>,
    },
    {
      title: 'Procesado',
      dataIndex: 'processedAt',
      render: (v) => v ? dayjs(v).format('DD/MM/YYYY') : '-',
    },
  ];

  const balance = partner?.walletBalance ?? 0;
  const comisionRetenida = stats?.ticketRevenue ? stats.ticketRevenue * ((partner?.feePercentage ?? 0) / 100) : 0;
  const pendingTotal = payouts.filter(p => p.status === 'pending').reduce((s, p) => s + p.amount, 0);

  return (
    <div style={{ maxWidth: 960, margin: '0 auto', padding: 'max(16px, 2vw)' }}>
      {contextHolder}

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 32, flexWrap: 'wrap', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ width: 48, height: 48, borderRadius: 14, background: '#ecfdf5', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <WalletOutlined style={{ color: MISIO_COLORS.primary, fontSize: 24 }} />
            </div>
            <Title level={2} style={{ margin: 0, fontFamily: 'Outfit, sans-serif', fontWeight: 800, color: '#0f172a' }}>
              Billetera Empresarial
            </Title>
          </div>
          <span 
            onClick={() => setShowPrices(!showPrices)} 
            style={{ cursor: 'pointer', color: '#94a3b8', fontSize: 22, background: '#f8fafc', padding: '6px', borderRadius: '50%', border: '1px solid #e2e8f0' }}
            title="Ocultar/Mostrar valores"
          >
            {showPrices ? <EyeInvisibleOutlined /> : <EyeOutlined />}
          </span>
        </div>
        <Button shape="round" icon={<ReloadOutlined />} onClick={load} loading={loading} style={{ fontWeight: 600 }}>Actualizar</Button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: isDesktop ? '1.8fr 1fr 1fr' : '1fr', gap: 20, marginBottom: 32 }}>
        <Card style={{ borderRadius: 20, background: 'linear-gradient(135deg, #047857 0%, #064e3b 100%)', border: 'none', boxShadow: '0 12px 24px rgba(4, 120, 87, 0.2)' }} styles={{ body: { padding: 24 } }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ flex: 1.5, paddingRight: 8 }}>
              <Text style={{ color: 'rgba(255,255,255,0.7)', fontSize: 12, textTransform: 'uppercase', letterSpacing: 1, fontWeight: 600 }}>Saldo Disponible</Text>
              <div style={{ color: '#fff', fontSize: 32, fontWeight: 900, fontFamily: 'Outfit, sans-serif', whiteSpace: 'nowrap' }}>
                {showPrices ? `S/ ${Number(balance).toFixed(2)}` : '***'}
              </div>
            </div>
            
            <div style={{ flex: 1, textAlign: 'right', borderLeft: '1px solid rgba(255,255,255,0.2)', paddingLeft: 12 }}>
              <Text style={{ color: 'rgba(255,255,255,0.7)', fontSize: 11, textTransform: 'uppercase', letterSpacing: 1, fontWeight: 600 }}>Comisión Misio ({partner?.feePercentage ?? 0}%)</Text>
              <div style={{ color: '#6ee7b7', fontSize: 20, fontWeight: 700, fontFamily: 'Outfit, sans-serif', whiteSpace: 'nowrap' }}>
                {showPrices ? `S/ ${comisionRetenida.toFixed(2)}` : '***'}
              </div>
            </div>
          </div>
          <Button
            type="primary"
            shape="round"
            size="large"
            style={{ marginTop: 20, background: '#ffffff', color: '#047857', border: 'none', fontWeight: 800, width: '100%', boxShadow: '0 4px 14px rgba(0,0,0,0.1)' }}
            icon={<SendOutlined />}
            disabled={balance <= 0}
            onClick={() => setModalOpen(true)}
          >
            Solicitar Retiro
          </Button>
        </Card>

        <Card style={{ borderRadius: 20, border: '1px solid #e2e8f0', boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.05)' }} styles={{ body: { padding: 24, display: 'flex', flexDirection: 'column', height: '100%' } }}>
          <Statistic
            title={<Text style={{ color: '#64748b', fontSize: 13, textTransform: 'uppercase', letterSpacing: 1, fontWeight: 600 }}>Sorteos Exitosos</Text>}
            value={partner?.successfulRaffles ?? 0}
            suffix={<span style={{ fontSize: 14, color: '#94a3b8', marginLeft: 4 }}>sorteos</span>}
            valueStyle={{ color: '#0f172a', fontWeight: 900, fontSize: 36, fontFamily: 'Outfit, sans-serif' }}
          />
          <div style={{ marginTop: 'auto', paddingTop: 16 }}>
            <Text type="secondary" style={{ fontSize: 13, color: '#94a3b8' }}>Total de sorteos cerrados exitosamente</Text>
          </div>
        </Card>

        <Card style={{ borderRadius: 20, border: '1px solid #e2e8f0', boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.05)' }} styles={{ body: { padding: 24, display: 'flex', flexDirection: 'column', height: '100%' } }}>
          <Statistic
            title={<Text style={{ color: '#64748b', fontSize: 13, textTransform: 'uppercase', letterSpacing: 1, fontWeight: 600 }}>Retiros en Proceso</Text>}
            value={pendingTotal}
            formatter={(val) => showPrices ? Number(val).toFixed(2) : '***'}
            prefix="S/"
            valueStyle={{ color: '#f59e0b', fontWeight: 900, fontSize: 36, fontFamily: 'Outfit, sans-serif' }}
          />
          <div style={{ marginTop: 'auto', paddingTop: 16 }}>
            <Text type="secondary" style={{ fontSize: 13, color: '#94a3b8' }}>Monto pendiente de transferencia</Text>
          </div>
        </Card>
      </div>

      {partner?.feePercentage != null && (
        <Alert
          type="info"
          showIcon
          style={{ marginBottom: 32, borderRadius: 12, border: '1px solid #bae6fd', background: '#f0f9ff' }}
          message={<Text style={{ color: '#0369a1', fontWeight: 500 }}>Tu comisión acordada con Misio es del <strong>{partner.feePercentage}%</strong> por cada sorteo. El monto acreditado en tu billetera ya es el monto neto después de la comisión.</Text>}
        />
      )}

      <Card
        title={<Text style={{ fontFamily: 'Outfit, sans-serif', fontWeight: 800, fontSize: 18, color: '#0f172a' }}>Historial de Retiros</Text>}
        style={{ borderRadius: 20, border: '1px solid #e2e8f0', boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.05)' }}
        extra={<span className="z-pill" style={{ background: '#f1f5f9', color: '#475569', fontWeight: 600, padding: '4px 12px', borderRadius: 20, fontSize: 12 }}>{payouts.length} solicitudes</span>}
      >
        {payouts.length === 0 && !loading ? (
          <Empty description="Aún no has solicitado ningún retiro" />
        ) : isDesktop ? (
          <Table
            dataSource={payouts}
            columns={columns}
            rowKey="_id"
            loading={loading}
            pagination={{ pageSize: 8 }}
            size="small"
          />
        ) : (
          <List
            loading={loading}
            dataSource={payouts}
            renderItem={(p) => (
              <List.Item>
                <Card size="small" style={{ width: '100%', borderRadius: 8 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Text strong>S/ {showPrices ? Number(p.amount).toFixed(2) : '***'}</Text>
                    {STATUS_TAG[p.status]}
                  </div>
                  <Text type="secondary" style={{ fontSize: 12 }}>
                    {dayjs(p.createdAt).format('DD/MM/YYYY HH:mm')}
                  </Text>
                  {p.notes && <div><Text type="secondary" style={{ fontSize: 11 }}>{p.notes}</Text></div>}
                  {p.receiptUrl && (
                    <Button type="link" size="small" href={p.receiptUrl} target="_blank" style={{ padding: 0 }}>
                      Ver comprobante
                    </Button>
                  )}
                </Card>
              </List.Item>
            )}
          />
        )}
      </Card>

      {/* ── Modal solicitar retiro ──────────────────────────────── */}
      <Modal
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        title="Solicitar Retiro"
        onOk={() => form.submit()}
        confirmLoading={requesting}
        okText="Enviar Solicitud"
      >
        <Alert
          type="warning"
          showIcon
          message="Tu solicitud será revisada por el equipo Misio. Saldo disponible:"
          description={<Text strong style={{ fontSize: 18 }}>S/ {balance.toFixed(2)}</Text>}
          style={{ marginBottom: 16 }}
        />
        <Form form={form} layout="vertical" onFinish={onRequestPayout}>
          <Form.Item
            name="amount"
            label="Monto a retirar (S/)"
            rules={[
              { required: true, message: 'Ingresa un monto' },
              { type: 'number', min: 1, message: 'Mínimo S/ 1' },
              { validator: (_, val) => val > balance ? Promise.reject('No puedes retirar más de tu saldo disponible') : Promise.resolve() },
            ]}
          >
            <InputNumber
              style={{ width: '100%' }}
              min={1}
              max={balance}
              precision={2}
              prefix="S/"
              placeholder={`Máx. S/ ${balance.toFixed(2)}`}
            />
          </Form.Item>
          <Form.Item
            name="notes"
            label="Datos bancarios / Observaciones"
            tooltip="Ingresa tu número de cuenta, banco, nombre del titular y CCI para facilitar la transferencia."
            rules={[{ required: true, min: 10, message: 'Por favor ingresa tus datos bancarios (mín. 10 caracteres)' }]}
          >
            <Input.TextArea
              rows={3}
              placeholder="Ej. BCP - Cta. Cte. 194-12345678-0-45 | CCI: 002-194-001234567804-45 | Titular: Empresa ABC S.A.C."
            />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
