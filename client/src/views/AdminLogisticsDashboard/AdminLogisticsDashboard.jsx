import React, { useMemo, useState } from 'react';
import {
  Card, Col, Row, Statistic, Table, Tag, Timeline, Typography, Progress,
  Button, Modal, Form, Input, Select, Upload, Space, message, Alert, Empty,
  Popconfirm, Spin, Segmented
} from 'antd';
import {
  RiseOutlined, FallOutlined, DollarCircleFilled, InboxOutlined,
  RocketFilled, CheckCircleFilled, UploadOutlined, FileImageOutlined,
  SettingOutlined, ReloadOutlined, UnorderedListOutlined,
} from '@ant-design/icons';
import {
  MOCK_ERP_SUMMARY, MOCK_ERP_INVENTORY, MOCK_SHIPPING_LOG,
} from '../../mocks/mockData';
import { MISIO_COLORS } from '../../theme/misioTheme';
import { useApiOrMock } from '../../hooks/useApiOrMock';
import { api, apiUpload } from '../../auth/api';
import { Link } from 'react-router-dom';

const { Title, Text } = Typography;

const DELIVERY_TAG = {
  in_stock: { color: 'processing', icon: <InboxOutlined />, label: 'En almacén' },
  transit: { color: 'warning', icon: <RocketFilled />, label: 'En tránsito' },
  delivered: { color: 'success', icon: <CheckCircleFilled />, label: 'Entregado' },
};

const COURIERS = [
  'Olva Courier', 
  'Shalom', 
  'Marvisur', 
  'Cruz del Sur Cargo', 
  'InDrive Envíos',
  'Transferencia Bancaria',
  'Billetera Digital (Yape/Plin)',
  'Entrega Presencial'
];

/** Normaliza filas: la API trae raffleId/winnerId poblados; el mock, planos. */
const normalizeRow = (r) => ({
  ...r,
  raffleTitle: r.raffleTitle ?? r.raffleId?.title ?? '—',
  revenue: r.revenue ?? (r.raffleId ? r.raffleId.ticketPrice * r.raffleId.totalTickets : 0),
  winner: r.winner ?? (r.winnerId ? `${r.winnerId.name} (${r.winnerId.phone ?? ''})` : '— (sin ganador)'),
  courier: r.courier ?? r.shippingDetails?.courier ?? '—',
  trackingNumber: r.trackingNumber ?? r.shippingDetails?.trackingNumber ?? '—',
});

/**
 * AdminLogisticsDashboard v2 — ERP conectado al backend:
 *   GET /logistics/summary → KPIs reales (aggregate de márgenes)
 *   GET /logistics         → inventario con bitácora (history)
 *   PATCH /logistics/:id   → tracking/estado (modal "Gestionar")
 *   POST /logistics/:id/receipt|evidence → uploads Multer
 * Clic en una fila → su bitácora aparece en el Timeline.
 */
export default function AdminLogisticsDashboard() {
  const [msgApi, contextHolder] = message.useMessage();

  const { data: summary, demo } = useApiOrMock('/logistics/summary', MOCK_ERP_SUMMARY);
  const { data: rawInventory, refresh } = useApiOrMock('/logistics', MOCK_ERP_INVENTORY);

  const inventory = useMemo(() => rawInventory.map(normalizeRow), [rawInventory]);
  const [filterStatus, setFilterStatus] = useState('all');
  
  const filteredInventory = useMemo(() => {
    if (filterStatus === 'all') return inventory;
    return inventory.filter(row => row.deliveryStatus === filterStatus);
  }, [inventory, filterStatus]);

  const [managing, setManaging] = useState(null);
  const [shipping, setShipping] = useState(null);
  const [bitacoraModalId, setBitacoraModalId] = useState(null);
  const [timelineData, setTimelineData] = useState([]);
  const [loadingTimeline, setLoadingTimeline] = useState(false);
  const [shipForm] = Form.useForm(); // Registro en el modal Gestionar
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [form] = Form.useForm();

  const syncWinners = async () => {
    if (demo) return msgApi.info('Modo demo: conecta el backend para sincronizar.');
    setSyncing(true);
    try {
      await api('/logistics/sync-winners', { method: 'POST' });
      msgApi.success('Sincronización completada. Las filas faltantes han sido creadas.');
      refresh();
    } catch (err) {
      msgApi.error(err.message);
    } finally {
      setSyncing(false);
    }
  };


  const { totalRevenue, totalCosts, netMargin, prizesInStock, prizesInTransit } = summary;
  const marginPct = totalRevenue > 0 ? Math.round((netMargin / totalRevenue) * 100) : 0;

  // ── Guardar tracking/estado ─────────────────────────────────────────
  const openManage = (record) => {
    setManaging(record);
    form.setFieldsValue({
      courier: record.shippingDetails?.courier || undefined,
      trackingNumber: record.shippingDetails?.trackingNumber || '',
      destinationCity: record.shippingDetails?.destinationCity || '',
      deliveryStatus: record.deliveryStatus,
    });
  };

  const saveManage = async (values) => {
    if (demo) return msgApi.info('Modo demo: conecta el backend para gestionar envíos reales.');
    setSaving(true);
    try {
      await api(`/logistics/${managing._id}`, {
        method: 'PATCH',
        body: {
          deliveryStatus: values.deliveryStatus,
          shippingDetails: {
            courier: values.courier ?? '',
            trackingNumber: values.trackingNumber ?? '',
            destinationCity: values.destinationCity ?? '',
          },
        },
      });
      msgApi.success('Envío actualizado — la bitácora registró el cambio');
      setManaging(null);
      refresh();
    } catch (err) {
      msgApi.error(err.message);
    } finally {
      setSaving(false);
    }
  };

  // ── Upload de boleta / evidencia ────────────────────────────────────
  const makeUploader = (kind) => ({
    showUploadList: false,
    customRequest: async ({ file, onSuccess, onError }) => {
      if (demo) {
        msgApi.info('Modo demo: conecta el backend para subir archivos.');
        return onError(new Error('demo'));
      }
      try {
        await apiUpload(`/logistics/${managing._id}/${kind}`, file);
        msgApi.success(kind === 'receipt' ? 'Boleta adjuntada ✓' : 'Evidencia adjuntada 📸');
        onSuccess('ok');
        refresh();
      } catch (err) {
        msgApi.error(err.message);
        onError(err);
      }
    },
  });

  /** Cambia SOLO el estado del premio (endpoint dedicado). */
  const setStatus = async (row, status, extra = {}) => {
    if (demo) return msgApi.info('Modo demo: conecta el backend.');
    try {
      await api(`/logistics/${row._id}/status`, {
        method: 'PATCH',
        body: { status, ...extra },
      });
      msgApi.success(
        status === 'transit'
          ? '🚚 Despachado — el ganador ya puede seguir su envío'
          : '✅ Entregado — queda publicado con su evidencia',
      );
      refresh();
      setShipping(null);
    } catch (err) { msgApi.error(err.message); }
  };

  // ── Columnas ────────────────────────────────────────────────────────
  const inventoryColumns = [
    { title: 'Premio', dataIndex: 'productName', key: 'productName', ellipsis: true },
    {
      title: 'Ganador y contacto',
      key: 'winner',
      render: (_, r) => {
        if (r.winnerId) {
          return (
            <>
              <Text style={{ fontSize: 13 }}>{r.winnerId.name}</Text>
              <br />
              <Text style={{ fontSize: 11, color: MISIO_COLORS.textMuted }}>
                📱 {r.winnerId.phone ?? '—'}
                {r.winnerId.address?.city ? ` · ${r.winnerId.address.city}` : ''}
              </Text>
            </>
          );
        }
        if (r.offlineWinnerName) {
          return (
            <>
              <Text style={{ fontSize: 13 }}>{r.offlineWinnerName} <Tag color="orange" style={{ marginLeft: 4 }}>Venta Externa</Tag></Text>
              <br />
              <Text style={{ fontSize: 11, color: MISIO_COLORS.textMuted }}>
                📱 {r.offlineWinnerPhone ?? '—'}
              </Text>
            </>
          );
        }
        return <Tag>Sin sortear</Tag>;
      },
    },
    {
      title: 'Fecha del Sorteo',
      key: 'date',
      width: 120,
      render: (_, r) => {
        const d = r.raffleId?.winner?.drawnAt || r.createdAt;
        if (!d) return <Text style={{ fontSize: 11, color: MISIO_COLORS.textMuted }}>—</Text>;
        return <Text style={{ fontSize: 12 }}>{new Date(d).toLocaleDateString('es-PE')}</Text>;
      }
    },
    {
      title: 'Courier / Guía',
      key: 'courier',
      responsive: ['lg'],
      width: 130,
      render: (_, r) => (r.courier ? (
        <>
          <Text style={{ fontSize: 12 }}>{r.courier}</Text>
          <br />
          <Text code style={{ fontSize: 11 }}>{r.trackingNumber}</Text>
        </>
      ) : <Text style={{ fontSize: 11, color: MISIO_COLORS.textMuted }}>—</Text>),
    },
    {
      title: 'Estado',
      dataIndex: 'deliveryStatus',
      key: 'deliveryStatus',
      width: 130,
      filters: Object.entries(DELIVERY_TAG).map(([value, t]) => ({ text: t.label, value })),
      onFilter: (value, record) => record.deliveryStatus === value,
      render: (s) => (
        <Tag color={DELIVERY_TAG[s]?.color} icon={DELIVERY_TAG[s]?.icon}>
          {DELIVERY_TAG[s]?.label ?? s}
        </Tag>
      ),
    },
    {
      title: 'Acciones',
      key: 'actions',
      render: (_, r) => {
        if (!r.winnerId && !r.offlineWinnerName) {
          return <Button size="small" icon={<UnorderedListOutlined />} onClick={(e) => { e.stopPropagation(); openBitacora(r._id); }}>Bitácora</Button>;
        }
        return (
          <Space>
            <Button size="small" type="primary" ghost icon={<SettingOutlined />} onClick={(e) => { e.stopPropagation(); openManage(r); }}>
              {r.deliveryStatus === 'delivered' ? 'Detalles' : 'Gestionar Envío'}
            </Button>
            <Button size="small" icon={<UnorderedListOutlined />} onClick={(e) => { e.stopPropagation(); openBitacora(r._id); }}>
              Bitácora
            </Button>
          </Space>
        );
      },
    },
  ];

  const openBitacora = async (id) => {
    setBitacoraModalId(id);
    if (demo) {
      setTimelineData(MOCK_SHIPPING_LOG.map((step) => ({
        color: step.status === 'done' ? MISIO_COLORS.saldoGreen : step.status === 'current' ? MISIO_COLORS.electricBlue : 'gray',
        children: (
          <>
            <Text style={{ fontSize: 13 }}>{step.label}</Text>
            <br />
            <Text style={{ fontSize: 11, color: MISIO_COLORS.textMuted }}>{step.date}</Text>
          </>
        )
      })));
      return;
    }
    
    setLoadingTimeline(true);
    try {
      const res = await api(`/logistics/${id}/timeline`);
      setTimelineData(res.map((entry, i, arr) => {
        const isLast = i === arr.length - 1;
        const isCompletedStep = entry.type === 'step' && (!isLast || entry.label.toLowerCase().includes('entregado') || entry.label.toLowerCase().includes('evidencia'));
        const isCurrentStep = entry.type === 'step' && !isCompletedStep;

        let dotIcon;
        if (entry.type === 'win') dotIcon = <div style={{ fontSize: 20, transform: 'translateY(-2px)' }}>🏆</div>;
        else if (isCompletedStep) dotIcon = <CheckCircleFilled style={{ fontSize: 18, color: MISIO_COLORS.saldoGreen, background: '#fff' }} />;
        else if (isCurrentStep) dotIcon = <div style={{ width: 14, height: 14, borderRadius: '50%', background: '#fff', border: `3px solid ${MISIO_COLORS.electricBlue}` }} />;
        else dotIcon = <div style={{ width: 12, height: 12, borderRadius: '50%', background: '#cbd5e1' }} />;

        return {
          color: 'transparent',
          dot: dotIcon,
          children: (
            <div style={{ 
              background: '#ffffff', 
              padding: '16px 20px', 
              borderRadius: 12, 
              boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
              border: `1px solid ${isCurrentStep ? MISIO_COLORS.electricBlue : '#f1f5f9'}`,
              marginBottom: 12,
              transform: 'translateY(-6px)'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
                <Text style={{ fontSize: 14, fontWeight: entry.type === 'win' || isCurrentStep ? 700 : 500, color: '#1e293b', flex: 1 }}>
                  {entry.label}
                </Text>
                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                  <Text style={{ fontSize: 12, color: MISIO_COLORS.textMuted, display: 'block', fontWeight: 500 }}>
                    {new Date(entry.at).toLocaleDateString('es-PE', { day: '2-digit', month: 'short', year: 'numeric' })}
                  </Text>
                  <Text style={{ fontSize: 11, color: '#94a3b8' }}>
                    {new Date(entry.at).toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' })}
                  </Text>
                </div>
              </div>
            </div>
          ),
        };
      }));
    } catch (err) {
      msgApi.error(err.message);
      setTimelineData([]);
    } finally {
      setLoadingTimeline(false);
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
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <Title level={3} style={{ margin: 0 }}>🚚 Logística de premios</Title>
      </div>

      {/* ── Estado de las entregas (operación, no finanzas) ───────── */}
      <Row gutter={[14, 14]} style={{ marginTop: 16 }}>
        <Col xs={8}>
          <Card size="small">
            <Statistic
              title={<Text style={{ color: MISIO_COLORS.textMuted, fontSize: 12 }}>En almacén</Text>}
              value={prizesInStock}
              valueStyle={{ color: MISIO_COLORS.electricBlue, fontWeight: 700 }}
            />
            <Text style={{ fontSize: 11, color: MISIO_COLORS.textMuted }}>esperando despacho</Text>
          </Card>
        </Col>
        <Col xs={8}>
          <Card size="small">
            <Statistic
              title={<Text style={{ color: MISIO_COLORS.textMuted, fontSize: 12 }}>En tránsito</Text>}
              value={prizesInTransit}
              valueStyle={{ color: MISIO_COLORS.prizeGold, fontWeight: 700 }}
            />
            <Text style={{ fontSize: 11, color: MISIO_COLORS.textMuted }}>en ruta al ganador</Text>
          </Card>
        </Col>
        <Col xs={8}>
          <Card size="small">
            <Statistic
              title={<Text style={{ color: MISIO_COLORS.textMuted, fontSize: 12 }}>Entregados</Text>}
              value={inventory.filter((r) => r.deliveryStatus === 'delivered').length}
              valueStyle={{ color: MISIO_COLORS.saldoGreen, fontWeight: 700 }}
            />
            <Text style={{ fontSize: 11, color: MISIO_COLORS.textMuted }}>con evidencia</Text>
          </Card>
        </Col>
      </Row>

      <Row gutter={[20, 20]} style={{ marginTop: 20 }}>
        {/* ── Inventario y márgenes ───────────────────────────────── */}
        <Col xs={24} xl={24}>
          <Card
            title={
              <Space wrap>
                <span>📦 Premios y entregas</span>
                <Segmented
                  options={[
                    { label: 'Todos', value: 'all' },
                    { label: 'Almacén', value: 'in_stock' },
                    { label: 'Tránsito', value: 'transit' },
                    { label: 'Entregados', value: 'delivered' },
                  ]}
                  value={filterStatus}
                  onChange={setFilterStatus}
                  style={{ marginLeft: 8 }}
                />
              </Space>
            }
            extra={
              <Popconfirm
                title="Sincronizar ganadores"
                description="Recorre los sorteos completados y crea el envío de cada ganador que falte (repara datos antiguos)."
                okText="Sincronizar" cancelText="No"
                onConfirm={async () => {
                  if (demo) return msgApi.info('Modo demo: conecta el backend.');
                  try {
                    const res = await api('/logistics/sync-winners', { method: 'POST' });
                    msgApi.success(res.mensaje, 6);
                    refresh();
                  } catch (err) { msgApi.error(err.message); }
                }}
              >
                <Button size="small" icon={<ReloadOutlined />}>🔗 Sincronizar ganadores</Button>
              </Popconfirm>
            }
          >
            <Table
              dataSource={filteredInventory}
              columns={inventoryColumns}
              rowKey="_id"
              pagination={{ pageSize: 6 }}
              size="middle"
              scroll={{ x: 760 }}
            />
          </Card>
        </Col>
      </Row>

      {/* ── Modal Gestionar: tracking + estado + uploads ──────────── */}
      <Modal
        open={!!managing}
        onCancel={() => setManaging(null)}
        title={managing ? `Gestionar envío — ${managing.productName}` : ''}
        footer={null}
        destroyOnHidden
      >
        {managing && (
          <Space direction="vertical" size="large" style={{ width: '100%' }}>
            {managing.winnerId && (
              <Alert
                type="info"
                style={{ marginBottom: 20 }}
                message={<Text strong>Datos del ganador: {managing.winnerId.name}</Text>}
                description={
                  <Space direction="vertical" size={2}>
                    <Text style={{ fontSize: 12 }}>
                      📱 {managing.winnerId.phone ?? '—'}
                      {managing.winnerId.phone && (
                        <a style={{ marginLeft: 8 }} target="_blank" rel="noreferrer"
                          href={`https://wa.me/51${String(managing.winnerId.phone).replace(/\D/g, '')}`}>
                          escribirle por WhatsApp
                        </a>
                      )}
                    </Text>
                    <Text style={{ fontSize: 12 }}>
                      📍 {managing.winnerId.address?.line1 ?? 'Sin dirección registrada'}
                      {managing.winnerId.address?.city ? `, ${managing.winnerId.address.city}` : ''}
                    </Text>
                  </Space>
                }
              />
            )}
            <Form form={form} layout="vertical" onFinish={saveManage} requiredMark={false}>
              <Form.Item name="courier" label="Courier">
                <Select
                  placeholder="Selecciona el courier"
                  options={COURIERS.map((c) => ({ value: c, label: c }))}
                  allowClear
                />
              </Form.Item>
              <Form.Item name="trackingNumber" label="N° de guía / Operación">
                <Input placeholder="Ej: OLV-12345 o 09485720 (Transf.)" />
              </Form.Item>
              <Form.Item name="destinationCity" label="Ciudad destino">
                <Input placeholder="Iquitos, Loreto" />
              </Form.Item>
              <Form.Item name="deliveryStatus" label="Estado de entrega">
                <Select
                  options={Object.entries(DELIVERY_TAG).map(([value, t]) => ({
                    value,
                    label: t.label,
                  }))}
                />
              </Form.Item>
              <Button type="primary" htmlType="submit" block loading={saving}>
                Guardar cambios
              </Button>
            </Form>

            <Space style={{ width: '100%', justifyContent: 'center' }} wrap>
              <Upload {...makeUploader('receipt')} accept=".jpg,.jpeg,.png,.webp,.pdf">
                <Button icon={<UploadOutlined />}>Subir boleta de compra</Button>
              </Upload>
              <Upload {...makeUploader('evidence')} accept=".jpg,.jpeg,.png,.webp">
                <Button icon={<FileImageOutlined />}>Subir evidencia de entrega</Button>
              </Upload>
            </Space>
            <Text style={{ fontSize: 11, color: MISIO_COLORS.textMuted, textAlign: 'center', display: 'block' }}>
              Máx. 5MB. Cada cambio y archivo queda registrado en la bitácora del premio.
            </Text>
          </Space>
        )}
      </Modal>

      {/* ── Modal de Bitácora ──────────── */}
      <Modal
        open={!!bitacoraModalId}
        onCancel={() => setBitacoraModalId(null)}
        footer={null}
        destroyOnHidden
        width={600}
        styles={{ body: { padding: 0 } }}
      >
        <div style={{ padding: '32px 32px 16px 32px', borderBottom: '1px solid #f1f5f9' }}>
          <Title level={4} style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 12, color: '#0f172a' }}>
            <span style={{ fontSize: 24 }}>🚚</span> Bitácora e Historial
          </Title>
          <Text style={{ color: MISIO_COLORS.textMuted, marginTop: 4, display: 'block' }}>
            Rastreo detallado de logística y eventos del premio
          </Text>
        </div>
        
        <div style={{ padding: '32px 32px 16px 32px', background: '#f8fafc', borderBottomLeftRadius: 8, borderBottomRightRadius: 8, minHeight: 300, maxHeight: '65vh', overflowY: 'auto' }}>
          {loadingTimeline ? (
            <div style={{ textAlign: 'center', padding: '40px 0' }}>
              <Spin tip="Cargando historial..." />
            </div>
          ) : timelineData.length > 0 ? (
            <Timeline items={timelineData} />
          ) : (
            <Empty description="Sin eventos aún" />
          )}
        </div>
      </Modal>
    </div>
  );
}
