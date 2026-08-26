import React, { useState } from 'react';
import {
  Card, Table, Tag, Button, Space, Typography, message, Alert, Modal, Form,
  Input, Switch, Upload, Image, Popconfirm, Row, Col, Empty, Tooltip,
  Segmented, DatePicker,
} from 'antd';
import {
  PlusOutlined, EditOutlined, DeleteOutlined, QrcodeOutlined, CheckOutlined,
  CloseOutlined, ReloadOutlined, UploadOutlined, FileTextOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import { MISIO_COLORS } from '../../theme/misioTheme';
import { useApiOrMock } from '../../hooks/useApiOrMock';
import { api, apiUpload, SERVER_URL, tokenStore } from '../../auth/api';

const { Title, Text } = Typography;

const MOCK_METHODS = [
  { _id: 'm1', name: 'Yape', accountNumber: '999 999 999', holderName: 'Misio SAC',
    qrImageUrl: '', instructions: 'Yapea el monto exacto', active: true },
];
const MOCK_PENDING = [
  { _id: 'dep_01', userId: { name: 'Jorge Ramírez', dni: '45678912', phone: '956123789' },
    amount: 30, createdAt: new Date().toISOString(),
    meta: { methodName: 'Yape', operationNumber: '0348271', raffleId: 'x', ticketNumbers: [12, 27] },
    intentDetails: {
      type: 'raffle', raffleId: 'x', raffleTitle: 'Sorteo iPhone 16 Pro (Noche de Ganadores)',
      ticketNumbers: [12, 27], formattedTickets: ['IP16-0012', 'IP16-0027'],
      hasConflict: true,
      conflictsWithPending: [
        { ticketNumber: 27, formatted: 'IP16-0027', userName: 'Carlos Valenzuela', userDni: '70112233' }
      ],
      conflictsWithSold: []
    }
  },
  { _id: 'dep_02', userId: { name: 'Carlos Valenzuela', dni: '70112233', phone: '911223344' },
    amount: 15, createdAt: new Date(Date.now() - 120000).toISOString(),
    meta: { methodName: 'Plin', operationNumber: '0881921', raffleId: 'x', ticketNumbers: [27] },
    intentDetails: {
      type: 'raffle', raffleId: 'x', raffleTitle: 'Sorteo iPhone 16 Pro (Noche de Ganadores)',
      ticketNumbers: [27], formattedTickets: ['IP16-0027'],
      hasConflict: true,
      conflictsWithPending: [
        { ticketNumber: 27, formatted: 'IP16-0027', userName: 'Jorge Ramírez', userDni: '45678912' }
      ],
      conflictsWithSold: []
    }
  },
  { _id: 'dep_03', userId: { name: 'Mariana Silva', dni: '73322114', phone: '944556677' },
    amount: 45, createdAt: new Date(Date.now() - 300000).toISOString(),
    meta: { methodName: 'Yape', operationNumber: '0491823', raffleId: 'y', ticketNumbers: [101, 102, 103] },
    intentDetails: {
      type: 'raffle', raffleId: 'y', raffleTitle: 'PlayStation 5 + 3 Juegos Digitales',
      ticketNumbers: [101, 102, 103], formattedTickets: ['PS5-0101', 'PS5-0102', 'PS5-0103'],
      hasConflict: false,
      conflictsWithPending: [],
      conflictsWithSold: []
    }
  },
];

const MOCK_HISTORY = {
  items: [
    { _id: 'dep_h1', userId: { name: 'Carla Mendoza', dni: '74581236', phone: '987654321' },
      amount: 20, status: 'completed', createdAt: new Date(Date.now() - 86400e3).toISOString(),
      meta: { methodName: 'Yape', operationNumber: '0331902', receiptUrl: '' } },
    { _id: 'dep_h2', userId: { name: 'Jorge Ramírez', dni: '45678912', phone: '956123789' },
      amount: 50, status: 'completed', createdAt: new Date(Date.now() - 172800e3).toISOString(),
      meta: { methodName: 'Yape', operationNumber: '0330121', receiptUrl: '/uploads/demo.pdf' } },
  ],
  total: 2,
};

/**
 * SPRINT 3 — PANEL DEDICADO DE PAGOS (/admin/pagos).
 * Arriba: métodos de pago configurables (nombre, titular, número,
 * instrucciones y EL QR). Abajo: verificación de depósitos — confirmar
 * acredita el saldo Y ejecuta la auto-compra si el pago venía del carrito.
 */
export default function AdminPayments() {
  const [msgApi, contextHolder] = message.useMessage();
  const { data: methods, demo, refresh: refreshMethods } = useApiOrMock('/payments/methods/all', MOCK_METHODS);
  const { data: pending, refresh: refreshPending, loading } = useApiOrMock('/payments/pending', MOCK_PENDING);

  const [editingMethod, setEditingMethod] = useState(null); // null cerrado, {} nuevo, obj editar
  const [saving, setSaving] = useState(false);
  const [processing, setProcessing] = useState(null);
  // HISTORIAL: los pagos aprobados desaparecen de "pendientes" apenas se
  // confirman, pero el recibo casi nunca se emite en ese mismo segundo.
  const [histStatus, setHistStatus] = useState('completed');
  const [histRange, setHistRange] = useState(null);
  const histQuery = new URLSearchParams({
    status: histStatus,
    limit: '50',
    ...(histRange?.[0] ? { from: histRange[0].format('YYYY-MM-DD') } : {}),
    ...(histRange?.[1] ? { to: histRange[1].format('YYYY-MM-DD') } : {}),
  }).toString();
  const { data: history, refresh: refreshHistory, loading: loadingHist } =
    useApiOrMock(`/payments/history?${histQuery}`, MOCK_HISTORY);
  const histRows = history?.items ?? (Array.isArray(history) ? history : []);
  const [form] = Form.useForm();

  const guardDemo = () => {
    if (demo) msgApi.info('Modo demo: conecta el backend.');
    return demo;
  };

  // ── Métodos de pago ─────────────────────────────────────────────
  const openMethod = (m) => {
    setEditingMethod(m ?? {});
    form.setFieldsValue(m ?? { active: true });
  };

  const saveMethod = async (values) => {
    if (guardDemo()) return;
    setSaving(true);
    try {
      if (editingMethod?._id) {
        await api(`/payments/methods/${editingMethod._id}`, { method: 'PATCH', body: values });
        msgApi.success('Método actualizado ✓');
      } else {
        await api('/payments/methods', { method: 'POST', body: values });
        msgApi.success('Método creado — ahora súbele el QR con el botón 📱');
      }
      setEditingMethod(null);
      refreshMethods();
    } catch (err) { msgApi.error(err.message); } finally { setSaving(false); }
  };

  const removeMethod = async (id) => {
    if (guardDemo()) return;
    try {
      await api(`/payments/methods/${id}`, { method: 'DELETE' });
      msgApi.success('Método eliminado');
      refreshMethods();
    } catch (err) { msgApi.error(err.message); }
  };

  /**
   * RECIBO DE LA RECARGA: el comprobante que la EMPRESA le entrega al
   * usuario. Lo subes tú (o el operador de pagos) y el usuario lo ve en
   * su perfil — él ya no puede subir nada: solo consultar.
   */
  const receiptUploader = (tx) => ({
    showUploadList: false,
    accept: '.jpg,.jpeg,.png,.webp,.pdf',
    customRequest: async ({ file, onSuccess, onError }) => {
      if (demo) return onError(new Error('demo'));
      try {
        const fd = new FormData();
        fd.append('file', file);
        const token = tokenStore.get();
        const res = await fetch(`${SERVER_URL}/api/v1/transactions/${tx._id}/receipt`, {
          method: 'POST',
          headers: token ? { Authorization: `Bearer ${token}` } : {},
          body: fd,
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.message ?? 'Error al subir');
        msgApi.success('Recibo adjuntado — el usuario ya puede verlo en su perfil 🧾');
        onSuccess('ok');
        refreshPending();
        refreshHistory();
      } catch (err) { msgApi.error(err.message); onError(err); }
    },
  });

  const qrUploader = (m) => ({
    showUploadList: false,
    accept: '.jpg,.jpeg,.png,.webp',
    customRequest: async ({ file, onSuccess, onError }) => {
      if (guardDemo()) return onError(new Error('demo'));
      try {
        await apiUpload(`/payments/methods/${m._id}/qr`, file);
        msgApi.success('QR subido — los usuarios ya lo ven al pagar 📱');
        onSuccess('ok');
        refreshMethods();
      } catch (err) { msgApi.error(err.message); onError(err); }
    },
  });

  // ── Verificación ────────────────────────────────────────────────
  const act = async (id, action) => {
    if (guardDemo()) return;
    setProcessing(id);
    try {
      const res = await api(`/payments/${id}/${action}`, { method: 'PATCH' });
      if (action === 'confirm') {
        if (res.autoPurchase === 'ok') {
          msgApi.success(`Saldo acreditado + AUTO-COMPRA ejecutada: ${res.detail} 🎟️`, 7);
        } else if (res.autoPurchase === 'failed') {
          msgApi.warning(`Saldo acreditado, pero la auto-compra falló: ${res.detail}. El usuario fue avisado.`, 8);
        } else {
          msgApi.success('Saldo acreditado al usuario ✓');
        }
      } else {
        msgApi.success('Depósito rechazado (usuario avisado)');
      }
      refreshPending();
    } catch (err) { 
      if (err.message.includes('NO_ACTIVE_SHIFT')) {
        msgApi.error(
          <Space direction="vertical">
            <Text strong style={{ color: 'red' }}>¡Alto ahí! Caja cerrada 🛑</Text>
            <Text>No puedes recibir dinero si no tienes un turno de caja abierto.</Text>
            <Button size="small" type="primary" onClick={() => window.location.href = '/admin/caja'}>
              Ir a Abrir Caja
            </Button>
          </Space>,
          7
        );
      } else {
        msgApi.error(err.message); 
      }
    } finally { setProcessing(null); }
  };

  const pendingColumns = [
    {
      title: 'Usuario',
      key: 'user',
      render: (_, r) => (
        <>
          <Text>{r.userId?.name ?? '—'}</Text><br />
          <Text style={{ fontSize: 11, color: MISIO_COLORS.textMuted }}>
            DNI {r.userId?.dni} · {r.userId?.phone}
          </Text>
        </>
      ),
    },
    {
      title: 'Pago',
      key: 'pay',
      render: (_, r) => (
        <>
          <Text strong style={{ color: MISIO_COLORS.saldoGreen }}>S/ {Number(r.amount).toFixed(2)}</Text>
          <br />
          <Text style={{ fontSize: 11, color: MISIO_COLORS.textMuted }}>
            {r.meta?.methodName ?? 'Yape'} · Op: <Text code style={{ fontSize: 11 }}>{r.meta?.operationNumber ?? '—'}</Text>
          </Text>
          <br />
          {r.meta?.receiptUrl ? (
            <Space size={6}>
              <a href={`${SERVER_URL}${r.meta.receiptUrl}`} target="_blank" rel="noreferrer"
                style={{ fontSize: 11 }}>🧾 Ver recibo</a>
              <Upload {...receiptUploader(r)}>
                <a style={{ fontSize: 11, color: MISIO_COLORS.textMuted }}>reemplazar</a>
              </Upload>
            </Space>
          ) : (
            <Upload {...receiptUploader(r)}>
              <Tooltip title="Adjunta el recibo que le entregas al usuario (imagen o PDF)">
                <Button size="small" type="link" icon={<UploadOutlined />}
                  style={{ padding: 0, height: 'auto', fontSize: 11 }}>
                  Adjuntar recibo
                </Button>
              </Tooltip>
            </Upload>
          )}
        </>
      ),
    },
    {
      title: 'Tickets / Intención de compra',
      key: 'intent',
      render: (_, r) => {
        const details = r.intentDetails;
        const nums = r.meta?.ticketNumbers;
        const isRaffle = details?.type === 'raffle' || (nums && nums.length > 0);

        if (!isRaffle) {
          return details?.type === 'store' ? (
            <Tag color="purple">🛍️ {details.summary}</Tag>
          ) : (
            <Tag color="default">💰 Recarga libre (Billetera)</Tag>
          );
        }

        const title = details?.raffleTitle ?? 'Sorteo / Rifa';
        const formattedList = details?.formattedTickets ?? (nums ?? []).map((n) => `#${n}`);
        const hasConflict = details?.hasConflict;

        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 240 }}>
            <Text strong style={{ fontSize: 13, color: MISIO_COLORS.primary, lineHeight: 1.3 }}>
              🎲 {title}
            </Text>

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {formattedList.map((tStr, idx) => {
                const numVal = nums?.[idx];
                const isSold = details?.conflictsWithSold?.some((c) => c.ticketNumber === numVal);
                const isPendingConflict = details?.conflictsWithPending?.some((c) => c.ticketNumber === numVal);

                let color = 'cyan';
                let tooltip = 'Ticket solicitado para auto-compra tras confirmar pago';
                if (isSold) {
                  color = 'error';
                  tooltip = '¡TICKET YA VENDIDO A OTRA PERSONA EN BASE DE DATOS!';
                } else if (isPendingConflict) {
                  color = 'warning';
                  tooltip = '¡CONFLICTO! Otro usuario en la cola también pagó y solicita este número';
                }

                return (
                  <Tooltip key={tStr} title={tooltip}>
                    <Tag
                      color={color}
                      style={{
                        margin: 0,
                        padding: '2px 8px',
                        fontSize: 12,
                        fontWeight: isSold || isPendingConflict ? 700 : 500,
                        border: isSold ? '1px solid #ff4d4f' : isPendingConflict ? '1px solid #faad14' : undefined,
                      }}
                    >
                      🎟️ {tStr} {isSold ? '❌' : isPendingConflict ? '⚠️' : ''}
                    </Tag>
                  </Tooltip>
                );
              })}
            </div>

            {hasConflict && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 2 }}>
                {details.conflictsWithPending?.length > 0 && (
                  <Alert
                    type="warning"
                    showIcon
                    style={{ padding: '6px 10px', fontSize: 11, border: '1px solid #faad14', borderRadius: 6 }}
                    message={
                      <span>
                        <b>⚠️ Conflicto en cola:</b> El número{' '}
                        <b>{details.conflictsWithPending.map((c) => c.formatted || `#${c.ticketNumber}`).join(', ')}</b>{' '}
                        también está siendo solicitado por <b>{details.conflictsWithPending[0]?.userName}</b> (DNI {details.conflictsWithPending[0]?.userDni}). El primero que confirmes se lo quedará.
                      </span>
                    }
                  />
                )}
                {details.conflictsWithSold?.length > 0 && (
                  <Alert
                    type="error"
                    showIcon
                    style={{ padding: '6px 10px', fontSize: 11, border: '1px solid #ff4d4f', borderRadius: 6 }}
                    message={
                      <span>
                        <b>❌ Ya vendido:</b> El número{' '}
                        <b>{details.conflictsWithSold.map((c) => c.code || `#${c.ticketNumber}`).join(', ')}</b>{' '}
                        ya fue comprado anteriormente por <b>{details.conflictsWithSold[0]?.userName}</b>. Al confirmar, el pago se acreditará pero la auto-compra fallará.
                      </span>
                    }
                  />
                )}
              </div>
            )}

            {!hasConflict && formattedList.length > 0 && (
              <Text style={{ fontSize: 11, color: MISIO_COLORS.saldoGreen, fontWeight: 500 }}>
                ✓ Tickets libres para auto-compra
              </Text>
            )}
          </div>
        );
      },
    },
    {
      title: 'Fecha', dataIndex: 'createdAt', key: 'createdAt', responsive: ['lg'],
      render: (d) => new Date(d).toLocaleString('es-PE'),
    },
    {
      title: 'Acción',
      key: 'actions',
      render: (_, r) => (
        <Space>
          <Popconfirm title="¿El pago llegó por el monto exacto?" okText="Sí, acreditar"
            cancelText="No" onConfirm={() => act(r._id, 'confirm')}>
            <Button type="primary" size="small" icon={<CheckOutlined />} loading={processing === r._id}>
              Confirmar
            </Button>
          </Popconfirm>
          <Button danger size="small" icon={<CloseOutlined />} loading={processing === r._id}
            onClick={() => act(r._id, 'reject')}>
            Rechazar
          </Button>
        </Space>
      ),
    },
  ];

  return (
    <div>
      {contextHolder}
      {demo && (
        <Alert type="info" showIcon style={{ marginBottom: 16 }}
          message="Modo demo: viendo datos ficticios (backend no conectado)." />
      )}
      <Title level={3}>💳 Pagos</Title>

      <Row gutter={[20, 20]}>
        {/* ── Métodos de pago configurables ───────────────────────── */}
        <Col xs={24} xl={9}>
          <Card
            title="📱 Métodos de pago"
            extra={<Button type="primary" size="small" icon={<PlusOutlined />} onClick={() => openMethod(null)}>Agregar</Button>}
          >
            <Space direction="vertical" size="middle" style={{ width: '100%' }}>
              {methods.length === 0 && <Empty description="Configura tu primer método (Yape, Plin…)" />}
              {methods.map((m) => (
                <Card key={m._id} size="small" styles={{ body: { display: 'flex', gap: 12, alignItems: 'center' } }}>
                  {m.qrImageUrl ? (
                    <Image src={`${SERVER_URL}${m.qrImageUrl}`} width={56} height={56}
                      style={{ borderRadius: 8, objectFit: 'cover' }} />
                  ) : (
                    <div style={{ width: 56, height: 56, borderRadius: 8, background: MISIO_COLORS.bgElevated,
                      display: 'grid', placeItems: 'center' }}>
                      <QrcodeOutlined style={{ fontSize: 24, color: MISIO_COLORS.textMuted }} />
                    </div>
                  )}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <Text strong>{m.name}</Text>{' '}
                    {m.active ? <Tag color="success">Activo</Tag> : <Tag>Oculto</Tag>}
                    <br />
                    <Text style={{ fontSize: 12, color: MISIO_COLORS.textMuted }}>
                      {m.holderName} · {m.accountNumber}
                    </Text>
                  </div>
                  <Space direction="vertical" size={4}>
                    <Upload {...qrUploader(m)}>
                      <Tooltip title="Subir/cambiar QR"><Button size="small" icon={<UploadOutlined />} /></Tooltip>
                    </Upload>
                    <Button size="small" icon={<EditOutlined />} onClick={() => openMethod(m)} />
                    <Popconfirm title="¿Eliminar este método?" onConfirm={() => removeMethod(m._id)}>
                      <Button size="small" danger icon={<DeleteOutlined />} />
                    </Popconfirm>
                  </Space>
                </Card>
              ))}
            </Space>
          </Card>
        </Col>

        {/* ── Verificación de pagos ───────────────────────────────── */}
        <Col xs={24} xl={15}>
          <Card
            title={<>💰 Pagos por verificar <Tag color="warning">{pending.length} en cola</Tag></>}
            extra={<Button size="small" icon={<ReloadOutlined />} onClick={refreshPending} loading={loading} />}
          >
            <Table
              dataSource={pending}
              columns={pendingColumns}
              rowKey="_id"
              size="small"
              scroll={{ x: 780 }}
              pagination={false}
              locale={{ emptyText: <Empty description="Sin pagos pendientes 🎉" /> }}
            />
          </Card>
        </Col>
      </Row>

      {/* ── Historial de pagos resueltos ──────────────────────────── */}
      <Card
        style={{ marginTop: 18 }}
        title={<>🧾 Historial de pagos <Tag>{history?.total ?? histRows.length}</Tag></>}
        extra={
          <Space wrap>
            <Segmented
              size="small"
              value={histStatus}
              onChange={setHistStatus}
              options={[
                { label: 'Aprobados', value: 'completed' },
                { label: 'Rechazados', value: 'failed' },
              ]}
            />
            <DatePicker.RangePicker size="small" value={histRange} onChange={setHistRange}
              format="DD/MM/YYYY" allowClear />
            <Button size="small" icon={<ReloadOutlined />} onClick={refreshHistory} loading={loadingHist} />
          </Space>
        }
      >
        <Text style={{ fontSize: 12, color: MISIO_COLORS.textMuted, display: 'block', marginBottom: 10 }}>
          Aquí vuelves a un pago ya aprobado para adjuntarle su recibo. El
          usuario lo ve al instante en Mi Perfil → Mis recargas.
        </Text>
        <Table
          dataSource={histRows}
          rowKey="_id"
          size="small"
          scroll={{ x: 720 }}
          pagination={{ pageSize: 10, showSizeChanger: false }}
          locale={{ emptyText: <Empty description="Sin pagos en este rango" /> }}
          columns={[
            {
              title: 'Fecha', key: 'date', width: 120,
              render: (_, r) => (
                <Text style={{ fontSize: 12 }}>{dayjs(r.createdAt).format('DD/MM/YY HH:mm')}</Text>
              ),
            },
            {
              title: 'Usuario', key: 'user',
              render: (_, r) => {
                const isOffline = r.type === 'offline_sale';
                const name = isOffline ? (r.meta?.buyerName || 'Cliente POS') : (r.userId?.name ?? '—');
                const dni = isOffline ? (r.meta?.buyerDni || '—') : r.userId?.dni;
                const phone = isOffline ? '' : ` · ${r.userId?.phone || ''}`;
                return (
                  <>
                    <Text style={{ fontSize: 13 }}>
                      {name} {isOffline && <Tag color="cyan" style={{ marginLeft: 4 }}>POS</Tag>}
                    </Text>
                    <br />
                    <Text style={{ fontSize: 11, color: MISIO_COLORS.textMuted }}>
                      {dni ? `DNI ${dni}` : ''}{phone}
                    </Text>
                  </>
                );
              },
            },
            {
              title: 'Monto', key: 'amount', width: 100,
              render: (_, r) => (
                <Text strong style={{ color: MISIO_COLORS.saldoGreen }}>
                  S/ {Number(r.amount ?? 0).toFixed(2)}
                </Text>
              ),
            },
            {
              title: 'Operación', key: 'op', responsive: ['md'],
              render: (_, r) => (
                <Text style={{ fontSize: 11 }}>
                  {r.meta?.methodName} · N° {r.meta?.operationNumber ?? '—'}
                </Text>
              ),
            },
            {
              title: 'Estado', key: 'status', width: 110,
              render: (_, r) => (r.status === 'completed'
                ? <Tag color="success">Aprobado</Tag>
                : <Tag color="error">Rechazado</Tag>),
            },
            {
              title: 'Recibo', key: 'receipt', width: 180,
              render: (_, r) => (
                <Space size={4}>
                  {r.meta?.receiptUrl ? (
                    <Button size="small" type="link" icon={<FileTextOutlined />}
                      href={`${SERVER_URL}${r.meta.receiptUrl}`} target="_blank">
                      Ver
                    </Button>
                  ) : (
                    <Tag style={{ margin: 0 }}>Sin recibo</Tag>
                  )}
                  {r.status === 'completed' && (
                    <Upload {...receiptUploader(r)}>
                      <Button size="small" icon={<UploadOutlined />}>
                        {r.meta?.receiptUrl ? 'Reemplazar' : 'Adjuntar'}
                      </Button>
                    </Upload>
                  )}
                </Space>
              ),
            },
          ]}
        />
      </Card>

      {/* ── Modal método de pago ──────────────────────────────────── */}
      <Modal
        open={editingMethod !== null}
        onCancel={() => setEditingMethod(null)}
        footer={null}
        title={editingMethod?._id ? `Editar — ${editingMethod.name}` : 'Nuevo método de pago'}
        destroyOnHidden
      >
        <Form form={form} layout="vertical" onFinish={saveMethod} requiredMark={false}>
          <Form.Item name="name" label="Nombre" rules={[{ required: true, min: 2 }]}>
            <Input placeholder="Yape / Plin / BCP" />
          </Form.Item>
          <Form.Item name="accountNumber" label="Número / cuenta destino"
            rules={[{ required: true, min: 6, message: 'Mínimo 6 caracteres' }]}>
            <Input placeholder="999 999 999" />
          </Form.Item>
          <Form.Item name="holderName" label="Titular (como aparece al pagar)">
            <Input placeholder="Misio SAC" />
          </Form.Item>
          <Form.Item name="instructions" label="Instrucciones para el usuario">
            <Input.TextArea rows={2} placeholder="Yapea el monto EXACTO y guarda tu N° de operación." />
          </Form.Item>
          <Form.Item name="active" label="Visible para los usuarios" valuePropName="checked">
            <Switch />
          </Form.Item>
          <Button type="primary" htmlType="submit" block loading={saving}>
            {editingMethod?._id ? 'Guardar cambios' : 'Crear método'}
          </Button>
        </Form>
      </Modal>
    </div>
  );
}
