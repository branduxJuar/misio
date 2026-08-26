import React, { useMemo, useState } from 'react';
import dayjs from 'dayjs';
import {
  Card, Table, Tag, Button, Space, Typography, message, Alert, Drawer, Form,
  Input, InputNumber, Radio, DatePicker, Checkbox, Modal, Upload, Image,
  Popconfirm, Tooltip, Divider,
} from 'antd';
import {
  PlusOutlined, EditOutlined, PictureOutlined, CalendarOutlined,
  StopOutlined, UploadOutlined, DeleteOutlined, ClockCircleOutlined,
  TeamOutlined, FileExcelOutlined, EyeOutlined, IdcardOutlined, 
  PhoneOutlined, MailOutlined, UserOutlined
} from '@ant-design/icons';
import { MISIO_COLORS } from '../../theme/misioTheme';
import { useNavigate } from 'react-router-dom';
import { useApiOrMock } from '../../hooks/useApiOrMock';
import { api, apiUpload, SERVER_URL } from '../../auth/api';
import * as XLSX from 'xlsx';
import { generateTicketsImage } from '../../utils/ticketPrinter';
import TicketCard from '../../components/TicketCard';

const { Title, Text } = Typography;

const STATUS_TAG = {
  active: <Tag color="success">En venta</Tag>,
  live: <Tag color="error">🔴 En vivo</Tag>,
  completed: <Tag color="gold">🏆 Finalizada</Tag>,
  cancelled: <Tag>❌ Cancelada</Tag>,
};

const MOCK_ADMIN_RAFFLES = [
  {
    _id: 'demo1', title: 'iPhone 16 Pro Max 256GB', ticketPrefix: 'IPH16',
    ticketPrice: 10, totalTickets: 500, soldTickets: 431, drawMode: 'al_agua',
    winningAttempt: 3, maxTicketsPerUser: 10, status: 'active',
    drawDate: new Date(Date.now() + 3 * 86400000).toISOString(),
    notifyDayBefore: true, images: [], postponements: [],
  },
];

/** Días que faltan para el sorteo → tag con color según urgencia. */
function DaysLeft({ drawDate, status }) {
  if (status !== 'active') return null;
  const days = dayjs(drawDate).diff(dayjs(), 'day');
  const hours = dayjs(drawDate).diff(dayjs(), 'hour');
  if (hours < 0) return <Tag color="error">¡Fecha vencida!</Tag>;
  if (days < 1) return <Tag color="error"><ClockCircleOutlined /> ¡HOY / mañana!</Tag>;
  if (days <= 3) return <Tag color="warning">Faltan {days} días</Tag>;
  return <Tag color="processing">Faltan {days} días</Tag>;
}

/** Vista previa de la numerología según prefijo + total. */
function NumerologyPreview({ prefix, total }) {
  if (!prefix || !total) return null;
  const digits = Math.max(4, String(total).length);
  const fmt = (n) => `${prefix.toUpperCase()}-${String(n).padStart(digits, '0')}`;
  return (
    <Alert
      type="info"
      style={{ marginBottom: 16 }}
      message={
        <Text style={{ fontSize: 13 }}>
          🎟️ Numerología: <Text code>{fmt(1)}</Text>, <Text code>{fmt(2)}</Text>
          {' … '}<Text code>{fmt(total)}</Text>
        </Text>
      }
    />
  );
}

/**
 * SPRINT 1 — Gestión de Sorteos (Super Admin).
 * Crear/editar rifas con: producto + fotos, descripción, numerología
 * (prefijo), formato directo/al agua, límite por persona, fecha del
 * sorteo, aviso "falta 1 día", aplazamiento con motivo y cancelación
 * con devolución total.
 */
export default function AdminRaffles() {
  const [msgApi, contextHolder] = message.useMessage();
  const navigate = useNavigate();
  const { data: raffles, demo, refresh } = useApiOrMock('/raffles/admin/all', MOCK_ADMIN_RAFFLES);

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editing, setEditing] = useState(null); // null = creando
  const [photosOf, setPhotosOf] = useState(null);
  const [postponing, setPostponing] = useState(null);
  const [cancelling, setCancelling] = useState(null);
  const [saving, setSaving] = useState(false);
  const [form] = Form.useForm();
  const [postponeForm] = Form.useForm();
  const [cancelForm] = Form.useForm();

  // ── Participantes ───────────────────────────────────────────────
  const [participantsDrawer, setParticipantsDrawer] = useState(null);
  const [participants, setParticipants] = useState([]);
  const [loadingParticipants, setLoadingParticipants] = useState(false);
  const [searchPart, setSearchPart] = useState('');
  const [viewingParticipant, setViewingParticipant] = useState(null);

  // Preview reactiva de numerología en el formulario
  const watchPrefix = Form.useWatch('ticketPrefix', form);
  const watchTotal = Form.useWatch('totalTickets', form);
  const watchMode = Form.useWatch('drawMode', form);
  const watchType = Form.useWatch('type', form);
  const watchProductPrice = Form.useWatch('referenceProductPrice', form);

  const guardDemo = () => {
    if (demo) msgApi.info('Modo demo: conecta el backend para gestionar rifas reales.');
    return demo;
  };

  // ── Crear / Editar ──────────────────────────────────────────────
  const openCreate = () => {
    setEditing(null);
    form.resetFields();
    form.setFieldsValue({
      type: 'normal', drawMode: 'al_agua', winningAttempt: 3, maxTicketsPerUser: 10,
      notifyDayBefore: true, ticketPrice: 5, totalTickets: 100,
      prizes: [{ title: '', drawMode: 'al_agua', winningAttempt: 3 }],
    });
    setDrawerOpen(true);
  };

  const openEdit = (r) => {
    setEditing(r);
    form.setFieldsValue({ ...r, drawDate: dayjs(r.drawDate) });
    setDrawerOpen(true);
  };

  const save = async (values) => {
    if (guardDemo()) return;
    setSaving(true);
    try {
      const body = { ...values, drawDate: values.drawDate.toISOString() };
      delete body.referenceProductPrice;
      if (body.drawMode === 'direct') delete body.winningAttempt;
      if (!body.streamUrl) delete body.streamUrl;
      
      if (body.prizes && Array.isArray(body.prizes)) {
        body.prizes = body.prizes.map(p => ({
          title: p.title,
          drawMode: p.drawMode,
          winningAttempt: p.drawMode === 'direct' ? undefined : p.winningAttempt,
        }));
      }

      if (editing) {
        await api(`/raffles/${editing._id}`, { method: 'PATCH', body });
        msgApi.success('Rifa actualizada ✓');
      } else {
        await api('/raffles', { method: 'POST', body });
        msgApi.success('¡Rifa creada! Ahora súbele las fotos del producto.');
      }
      setDrawerOpen(false);
      refresh();
    } catch (err) {
      msgApi.error(err.message);
    } finally {
      setSaving(false);
    }
  };

  // ── Fotos ───────────────────────────────────────────────────────
  const photoUploader = {
    multiple: true,
    showUploadList: false,
    accept: '.jpg,.jpeg,.png,.webp',
    customRequest: async ({ file, onSuccess, onError }) => {
      if (guardDemo()) return onError(new Error('demo'));
      try {
        // El endpoint acepta varias en el campo "files"
        const token = (await import('../../auth/api')).tokenStore.get();
        const fd = new FormData();
        fd.append('files', file);
        const res = await fetch(`${SERVER_URL}/api/v1/raffles/${photosOf._id}/images`, {
          method: 'POST',
          headers: token ? { Authorization: `Bearer ${token}` } : {},
          body: fd,
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.message ?? 'Error al subir');
        setPhotosOf(data);
        msgApi.success('Foto subida 📸');
        onSuccess('ok');
        refresh();
      } catch (err) {
        msgApi.error(err.message);
        onError(err);
      }
    },
  };

  const removePhoto = async (url) => {
    if (guardDemo()) return;
    try {
      const updated = await api(
        `/raffles/${photosOf._id}/images?url=${encodeURIComponent(url)}`,
        { method: 'DELETE' },
      );
      setPhotosOf(updated);
      refresh();
    } catch (err) {
      msgApi.error(err.message);
    }
  };

  // ── Aplazar ─────────────────────────────────────────────────────
  const postpone = async ({ reason, newDate }) => {
    if (guardDemo()) return;
    setSaving(true);
    try {
      const res = await api(`/raffles/${postponing._id}/postpone`, {
        method: 'POST',
        body: { reason, newDate: newDate.toISOString() },
      });
      msgApi.success(`Sorteo aplazado — ${res.notified} comprador(es) avisados con el motivo.`);
      setPostponing(null);
      refresh();
    } catch (err) {
      msgApi.error(err.message);
    } finally {
      setSaving(false);
    }
  };

  // ── Cancelar (devolver todo) ────────────────────────────────────
  const cancel = async ({ reason }) => {
    if (guardDemo()) return;
    setSaving(true);
    try {
      const res = await api(`/raffles/${cancelling._id}/cancel`, {
        method: 'POST',
        body: { reason },
      });
      msgApi.success(
        `Rifa cancelada: S/ ${res.refundedTotal} devueltos a ${res.refundedUsers} usuario(s), ${res.notified} avisados.`,
        7,
      );
      setCancelling(null);
      refresh();
    } catch (err) {
      msgApi.error(err.message);
    } finally {
      setSaving(false);
    }
  };

  // ── Participantes y Exportación ────────────────────────────────
  const openParticipants = async (r) => {
    if (guardDemo()) return;
    setParticipantsDrawer(r);
    setLoadingParticipants(true);
    try {
      const res = await api(`/tickets?raffleId=${r._id}`);
      setParticipants(res);
    } catch (err) {
      msgApi.error(err.message || 'Error cargando tickets');
    } finally {
      setLoadingParticipants(false);
    }
  };

  const exportToExcel = () => {
    if (!participants || participants.length === 0) {
      msgApi.warning('No hay datos para exportar');
      return;
    }

    const data = participants.map(t => ({
      'Nº Boleto': String(t.ticketNumber).padStart(4, '0'),
      'Código': t.code,
      'Cliente': t.isOffline ? t.buyerName : (t.userId?.name || 'Anónimo'),
      'DNI': t.isOffline ? (t.buyerDni || '-') : '-',
      'Teléfono': t.isOffline ? t.buyerPhone : (t.userId?.phone || '-'),
      'Correo': t.isOffline ? (t.buyerEmail || '-') : (t.userId?.email || '-'),
      'Canal': t.isOffline ? 'Venta Externa' : 'Web',
      'Medio de Pago': t.paymentMethod ? t.paymentMethod.toUpperCase() : 'MISIO',
      'Vendedor': t.isOffline ? (t.soldBy?.name || 'Desconocido') : 'Web',
      'Fecha Compra': dayjs(t.createdAt).format('DD/MM/YYYY HH:mm:ss'),
      'Estado': t.status
    }));

    const worksheet = XLSX.utils.json_to_sheet(data);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Tickets');
    
    // Auto-ajustar ancho de columnas
    worksheet['!cols'] = [
      { wch: 10 }, { wch: 12 }, { wch: 25 }, { wch: 15 }, 
      { wch: 15 }, { wch: 15 }, { wch: 20 }, { wch: 20 }, { wch: 10 }
    ];

    const fileName = `Tickets_${participantsDrawer.title.replace(/[^a-z0-9]/gi, '_')}.xlsx`;
    XLSX.writeFile(workbook, fileName);
  };

  // ── Tabla ───────────────────────────────────────────────────────
  const columns = useMemo(() => [
    {
      title: 'Producto',
      key: 'title',
      render: (_, r) => (
        <Space>
          {r.images?.[0] ? (
            <Image src={`${SERVER_URL}${r.images[0]}`} width={42} height={42}
              style={{ objectFit: 'cover', borderRadius: 8 }} preview={false} />
          ) : (
            <div style={{ width: 42, height: 42, borderRadius: 8, background: MISIO_COLORS.bgElevated,
              display: 'grid', placeItems: 'center' }}>🎁</div>
          )}
          <div>
            <Text strong style={{ fontSize: 13 }}>{r.title}</Text>
            <br />
            <Text code style={{ fontSize: 11 }}>{r.ticketPrefix}-0001…</Text>
          </div>
        </Space>
      ),
    },
    {
      title: 'Boletos',
      key: 'tickets',
      responsive: ['md'],
      render: (_, r) => (
        <>
          <Text style={{ fontSize: 12 }}>{r.soldTickets ?? 0} / {r.totalTickets} · S/ {r.ticketPrice}</Text>
          <br />
          <Text style={{ fontSize: 11, color: MISIO_COLORS.textMuted }}>
            máx {r.maxTicketsPerUser}/persona
          </Text>
        </>
      ),
    },
    {
      title: 'Formato',
      key: 'mode',
      responsive: ['lg'],
      render: (_, r) => {
        if (r.type === 'paquete') {
          return <Tag color="purple">📦 Paquete ({r.prizes?.length || 0} premios)</Tag>;
        }
        return r.drawMode === 'direct'
          ? <Tag color="processing">🎯 Directo</Tag>
          : <Tag color="warning">💧 Al agua ×{r.winningAttempt - 1}</Tag>;
      },
    },
    {
      title: 'Sorteo',
      key: 'drawDate',
      render: (_, r) => (
        <>
          <Text style={{ fontSize: 12 }}>{dayjs(r.drawDate).format('DD/MM/YYYY HH:mm')}</Text>
          {r.postponements?.length > 0 && (
            <Tooltip title={`Aplazada ${r.postponements.length} vez/veces`}>
              <Tag style={{ marginLeft: 4 }}>📅×{r.postponements.length}</Tag>
            </Tooltip>
          )}
          <br />
          <DaysLeft drawDate={r.drawDate} status={r.status} />
        </>
      ),
    },
    { title: 'Estado', key: 'status', render: (_, r) => STATUS_TAG[r.status] },
    {
      title: 'Acciones',
      key: 'actions',
      render: (_, r) => (
        <Space wrap size={4}>
          <Tooltip title={r.status === 'completed' ? 'Ver panel (Sorteo finalizado)' : r.status === 'live' ? 'Ir al panel del sorteo' : 'Iniciar / preparar el sorteo'}>
            <Button
              size="small" type="primary"
              disabled={r.status === 'cancelled'}
              onClick={() => navigate(`/admin/sorteo/${r._id}`)}
            >
              ▶
            </Button>
          </Tooltip>
          <Tooltip title="Ver participantes">
            <Button size="small" icon={<TeamOutlined />} 
              onClick={() => openParticipants(r)} />
          </Tooltip>
          <Tooltip title="Editar todos los campos">
            <Button size="small" icon={<EditOutlined />} disabled={r.status !== 'active'}
              onClick={() => openEdit(r)} />
          </Tooltip>
          <Tooltip title="Fotos del producto">
            <Button size="small" icon={<PictureOutlined />} onClick={() => setPhotosOf(r)} />
          </Tooltip>
          <Tooltip title="Aplazar fecha (con motivo)">
            <Button size="small" icon={<CalendarOutlined />} disabled={r.status !== 'active'}
              onClick={() => { postponeForm.resetFields(); setPostponing(r); }} />
          </Tooltip>
          <Tooltip title="Cancelar y devolver TODO el dinero">
            <Button size="small" danger icon={<StopOutlined />}
              disabled={!['active', 'live'].includes(r.status)}
              onClick={() => { cancelForm.resetFields(); setCancelling(r); }} />
          </Tooltip>
        </Space>
      ),
    },
  ], [demo]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div>
      {contextHolder}
      {demo && (
        <Alert type="info" showIcon style={{ marginBottom: 16 }}
          message="Modo demo: viendo datos ficticios (backend no conectado)." />
      )}

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        flexWrap: 'wrap', gap: 12, marginBottom: 16 }}>
        <Title level={3} style={{ margin: 0 }}>🎰 Gestión de Sorteos</Title>
        <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
          Crear rifa
        </Button>
      </div>

      <Card>
        <Table dataSource={raffles} columns={columns} rowKey="_id"
          pagination={{ pageSize: 8 }} size="middle" scroll={{ x: 720 }} />
      </Card>

      {/* ── Drawer Crear/Editar ─────────────────────────────────── */}
      <Drawer
        title={editing ? `Editar — ${editing.title}` : 'Crear nueva rifa'}
        width={Math.min(480, window.innerWidth)}
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        destroyOnHidden
      >
        <Form form={form} layout="vertical" onFinish={save} requiredMark={false}>
          <Form.Item name="title" label="Producto / Título"
            rules={[{ required: true, min: 5, message: 'Mínimo 5 caracteres' }]}>
            <Input placeholder="PlayStation 5 Slim + 2 mandos" />
          </Form.Item>

          <Form.Item name="description" label="Descripción del producto">
            <Input.TextArea rows={3} placeholder="Edición disco 1TB, sellado, con boleta..." />
          </Form.Item>

          <Space.Compact block>
            <Form.Item name="ticketPrefix" label="Prefijo (numerología)" style={{ flex: 1 }}
              rules={[{ required: true, pattern: /^[A-Za-z0-9]{2,6}$/, message: '2-6 letras/números' }]}>
              <Input placeholder="PS5" maxLength={6} style={{ textTransform: 'uppercase' }} />
            </Form.Item>
            <Form.Item name="totalTickets" label="Cantidad de tickets" style={{ flex: 1 }}
              rules={[{ required: true, type: 'number', min: 10, message: 'Mínimo 10' }]}>
              <InputNumber min={10} max={100000} style={{ width: '100%' }} placeholder="100" />
            </Form.Item>
          </Space.Compact>

          <NumerologyPreview prefix={watchPrefix} total={watchTotal} />

          <Form.Item name="referenceProductPrice" label="Costo real del premio (S/)" 
            tooltip="Opcional. Ingresa cuánto te costó el premio para calcular un precio de boleto recomendado (recuperación + 30% ganancia).">
            <InputNumber min={0} style={{ width: '100%' }} placeholder="Ej. 3500" />
          </Form.Item>

          {watchProductPrice > 0 && watchTotal > 0 && (
            <Alert
              type="success"
              showIcon
              style={{ marginBottom: 16 }}
              message={
                <Text style={{ fontSize: 13 }}>
                  💡 <b>Precio sugerido:</b> Para recuperar los S/ {watchProductPrice} y tener un margen del ~30%, el boleto debería costar <b>S/ {Math.ceil((watchProductPrice * 1.3) / watchTotal)}</b>.
                </Text>
              }
            />
          )}

          <Space.Compact block>
            <Form.Item name="ticketPrice" label="Precio por ticket (S/)" style={{ flex: 1 }}
              rules={[{ required: true, type: 'number', min: 1 }]}>
              <InputNumber min={1} style={{ width: '100%' }} />
            </Form.Item>
            <Form.Item name="maxTicketsPerUser" style={{ flex: 1 }}
              label={<Tooltip title="Delimitador: máximo de boletos que una persona puede comprar en esta rifa">Máx. por persona ℹ️</Tooltip>}
              rules={[{ required: true, type: 'number', min: 1 }]}>
              <InputNumber min={1} max={100} style={{ width: '100%' }} />
            </Form.Item>
          </Space.Compact>

          <Form.Item name="type" label="Tipo de sorteo" rules={[{ required: true }]}>
            <Radio.Group buttonStyle="solid">
              <Radio.Button value="normal">Normal (1 premio)</Radio.Button>
              <Radio.Button value="paquete">Paquete (Múltiples premios)</Radio.Button>
            </Radio.Group>
          </Form.Item>

          {watchType !== 'paquete' ? (
            <>
              <Form.Item name="drawMode" label="Formato del sorteo" rules={[{ required: true }]}>
                <Radio.Group>
                  <Radio.Button value="direct">🎯 Ganador directo</Radio.Button>
                  <Radio.Button value="al_agua">💧 Con tiradas al agua</Radio.Button>
                </Radio.Group>
              </Form.Item>
              {watchMode === 'al_agua' && (
                <Form.Item name="winningAttempt"
                  label="Tirada ganadora (las anteriores son al agua)"
                  rules={[{ required: true, type: 'number', min: 2, message: 'Mínimo la 2da tirada' }]}
                  extra={<Text style={{ fontSize: 12, color: MISIO_COLORS.textMuted }}>
                    Ej: 3 → las tiradas 1 y 2 salen al agua, la 3ra gana.
                  </Text>}>
                  <InputNumber min={2} max={10} style={{ width: '100%' }} />
                </Form.Item>
              )}
            </>
          ) : (
            <Form.List name="prizes" rules={[
              {
                validator: async (_, prizes) => {
                  if (!prizes || prizes.length < 1) {
                    return Promise.reject(new Error('Debes agregar al menos 1 premio al paquete'));
                  }
                },
              },
            ]}>
              {(fields, { add, remove }, { errors }) => (
                <div style={{ background: '#f5f5f5', padding: 16, borderRadius: 8, marginBottom: 24, border: '1px solid #d9d9d9' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                    <Text strong>Premios del Paquete</Text>
                    <Button type="dashed" onClick={() => add({ drawMode: 'al_agua', winningAttempt: 3 })} icon={<PlusOutlined />}>
                      Agregar Premio
                    </Button>
                  </div>
                  {fields.map(({ key, name, ...restField }, index) => (
                    <Card key={key} size="small" style={{ marginBottom: 12 }} 
                      title={`Premio ${index + 1}`}
                      extra={<Button danger type="text" onClick={() => remove(name)} icon={<DeleteOutlined />} />}
                    >
                      <Form.Item {...restField} name={[name, 'title']} label="Título del premio" rules={[{ required: true, message: 'Requerido' }]}>
                        <Input placeholder="Ej. PlayStation 5" />
                      </Form.Item>
                      <Form.Item {...restField} name={[name, 'drawMode']} label="Formato del sorteo" rules={[{ required: true }]}>
                        <Radio.Group>
                          <Radio.Button value="direct">🎯 Directo</Radio.Button>
                          <Radio.Button value="al_agua">💧 Al agua</Radio.Button>
                        </Radio.Group>
                      </Form.Item>
                      
                      <Form.Item
                        noStyle
                        shouldUpdate={(prevValues, currentValues) =>
                          prevValues.prizes?.[name]?.drawMode !== currentValues.prizes?.[name]?.drawMode
                        }
                      >
                        {() => {
                          const prizeMode = form.getFieldValue(['prizes', name, 'drawMode']);
                          if (prizeMode !== 'al_agua') return null;
                          return (
                            <Form.Item {...restField} name={[name, 'winningAttempt']} label="Tirada ganadora" rules={[{ required: true, type: 'number', min: 2 }]}>
                              <InputNumber min={2} max={10} style={{ width: '100%' }} />
                            </Form.Item>
                          );
                        }}
                      </Form.Item>
                    </Card>
                  ))}
                  <Form.ErrorList errors={errors} />
                </div>
              )}
            </Form.List>
          )}

          <Form.Item name="drawDate" label="Fecha y hora del sorteo"
            rules={[{ required: true, message: 'Elige la fecha del sorteo' }]}>
            <DatePicker showTime format="DD/MM/YYYY HH:mm" style={{ width: '100%' }}
              disabledDate={(d) => d && d.isBefore(dayjs(), 'day')} />
          </Form.Item>

          <Form.Item name="notifyDayBefore" valuePropName="checked">
            <Checkbox>
              🔔 Avisar a todos los compradores cuando falte 1 día para el sorteo
            </Checkbox>
          </Form.Item>

          <Form.Item name="streamUrl" label="Link de transmisión (opcional, se puede poner el día del sorteo)">
            <Input placeholder="https://www.youtube.com/embed/..." />
          </Form.Item>

          <Button type="primary" htmlType="submit" block size="large" loading={saving}>
            {editing ? 'Guardar cambios' : 'Crear rifa'}
          </Button>
          {!editing && (
            <Text style={{ fontSize: 12, color: MISIO_COLORS.textMuted, display: 'block', marginTop: 8, textAlign: 'center' }}>
              Las fotos del producto se suben después de crear (botón 🖼️ en la tabla).
            </Text>
          )}
        </Form>
      </Drawer>

      {/* ── Modal Fotos ─────────────────────────────────────────── */}
      <Modal open={!!photosOf} onCancel={() => setPhotosOf(null)} footer={null}
        title={photosOf ? `Fotos — ${photosOf.title}` : ''} destroyOnHidden>
        {photosOf && (
          <Space direction="vertical" style={{ width: '100%' }} size="middle">
            <Upload {...photoUploader}>
              <Button icon={<UploadOutlined />} block>Subir fotos (JPG/PNG/WEBP, máx 5MB c/u)</Button>
            </Upload>
            <Divider style={{ margin: '4px 0' }} />
            {(photosOf.images ?? []).length === 0 ? (
              <Text style={{ color: MISIO_COLORS.textMuted }}>Sin fotos aún.</Text>
            ) : (
              <Space wrap>
                {photosOf.images.map((url) => (
                  <div key={url} style={{ position: 'relative' }}>
                    <Image src={`${SERVER_URL}${url}`} width={100} height={100}
                      style={{ objectFit: 'cover', borderRadius: 10 }} />
                    <Button danger size="small" icon={<DeleteOutlined />}
                      style={{ position: 'absolute', top: 4, right: 4 }}
                      onClick={() => removePhoto(url)} />
                  </div>
                ))}
              </Space>
            )}
          </Space>
        )}
      </Modal>

      {/* ── Modal Aplazar ───────────────────────────────────────── */}
      <Modal open={!!postponing} onCancel={() => setPostponing(null)} footer={null}
        title={postponing ? `Aplazar sorteo — ${postponing.title}` : ''} destroyOnHidden>
        <Form form={postponeForm} layout="vertical" onFinish={postpone} requiredMark={false}>
          <Form.Item name="reason" label="Motivo (se les enviará a todos los compradores)"
            rules={[{ required: true, min: 5, message: 'Explica el motivo (mín. 5 caracteres)' }]}>
            <Input.TextArea rows={3} placeholder="Problemas con la transmisión, reprogramamos para garantizar transparencia..." />
          </Form.Item>
          <Form.Item name="newDate" label="Nueva fecha y hora"
            rules={[{ required: true, message: 'Elige la nueva fecha' }]}>
            <DatePicker showTime format="DD/MM/YYYY HH:mm" style={{ width: '100%' }}
              disabledDate={(d) => d && d.isBefore(dayjs(), 'day')} />
          </Form.Item>
          <Button type="primary" htmlType="submit" block loading={saving}>
            Aplazar y avisar a los compradores
          </Button>
        </Form>
      </Modal>

      {/* ── Modal Cancelar ──────────────────────────────────────── */}
      <Modal open={!!cancelling} onCancel={() => setCancelling(null)} footer={null}
        title={cancelling ? `⚠️ Cancelar rifa — ${cancelling.title}` : ''} destroyOnHidden>
        <Alert type="warning" showIcon style={{ marginBottom: 16 }}
          message="Esta acción devuelve el 100% del dinero a TODOS los compradores y no se puede deshacer." />
        <Form form={cancelForm} layout="vertical" onFinish={cancel} requiredMark={false}>
          <Form.Item name="reason" label="Motivo de la cancelación (visible para los compradores)"
            rules={[{ required: true, min: 5, message: 'Explica el motivo (mín. 5 caracteres)' }]}>
            <Input.TextArea rows={3} placeholder="El producto llegó dañado del proveedor..." />
          </Form.Item>
          <Popconfirm title="¿Confirmas la devolución total?" okText="Sí, devolver todo"
            cancelText="No" onConfirm={() => cancelForm.submit()}>
            <Button danger type="primary" block loading={saving}>
              Cancelar rifa y devolver el dinero a todos
            </Button>
          </Popconfirm>
        </Form>
      </Modal>
      {/* ── Drawer Participantes ─────────────────────────────────── */}
      <Drawer
        title={
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span>Lista de Participantes — {participantsDrawer?.title}</span>
            <Button 
              type="primary" 
              icon={<FileExcelOutlined />} 
              onClick={exportToExcel}
              disabled={!participants || participants.length === 0}
              style={{ background: '#107c41' }} // Color Excel
            >
              Descargar Excel
            </Button>
          </div>
        }
        width={Math.min(900, window.innerWidth)}
        open={!!participantsDrawer}
        onClose={() => { setParticipantsDrawer(null); setSearchPart(''); }}
        destroyOnHidden
      >
        <Input.Search 
          placeholder="Buscar por cliente, teléfono o nº de boleto..." 
          allowClear 
          onChange={(e) => setSearchPart(e.target.value)}
          style={{ marginBottom: 16 }}
        />
        <Table 
          dataSource={participants.filter(p => {
            if (!searchPart) return true;
            const q = searchPart.toLowerCase();
            const name = (p.isOffline ? p.buyerName : p.userId?.name) || '';
            const phone = (p.isOffline ? p.buyerPhone : p.userId?.phone) || '';
            return name.toLowerCase().includes(q) || 
                   phone.includes(q) || 
                   String(p.ticketNumber).includes(q);
          })} 
          rowKey="_id"
          loading={loadingParticipants}
          pagination={{ pageSize: 20 }}
          size="small"
          scroll={{ x: 800 }}
          columns={[
            {
              title: 'Boleto',
              dataIndex: 'ticketNumber',
              render: (v, r) => (
                <div style={{
                  background: `linear-gradient(135deg, ${MISIO_COLORS.primary}, #0f615f)`,
                  color: '#fff',
                  padding: '4px 12px',
                  borderRadius: 6,
                  textAlign: 'center',
                  fontWeight: 'bold',
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  minWidth: 54,
                  boxShadow: '0 2px 5px rgba(0,0,0,0.15)',
                  position: 'relative',
                  maskImage: 'radial-gradient(circle at 0 50%, transparent 4px, black 4.5px), radial-gradient(circle at 100% 50%, transparent 4px, black 4.5px)',
                  maskSize: '51% 100%',
                  maskRepeat: 'no-repeat',
                  maskPosition: 'left, right',
                  WebkitMaskImage: 'radial-gradient(circle at 0 50%, transparent 4px, black 4.5px), radial-gradient(circle at 100% 50%, transparent 4px, black 4.5px)',
                  WebkitMaskSize: '51% 100%',
                  WebkitMaskRepeat: 'no-repeat',
                  WebkitMaskPosition: 'left, right',
                  border: '1px dashed rgba(255,255,255,0.4)'
                }}>
                  {r.code || `${participantsDrawer?.ticketPrefix || ''}-${String(v).padStart(4, '0')}`}
                </div>
              )
            },
            {
              title: 'Cliente',
              render: (_, r) => (
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  <Text>{r.isOffline ? r.buyerName : (r.userId?.name || 'Anónimo')}</Text>
                  <Text type="secondary" style={{ fontSize: 12 }}>
                    {r.isOffline ? (r.buyerPhone || '-') : (r.userId?.phone || '-')}
                  </Text>
                </div>
              )
            },
            {
              title: 'Canal',
              render: (_, r) => r.isOffline ? <Tag color="blue">Venta Externa</Tag> : <Tag color="green">Web</Tag>
            },
            {
              title: 'Medio de Pago',
              dataIndex: 'paymentMethod',
              render: (v) => <Tag>{v ? v.toUpperCase() : 'MISIO'}</Tag>
            },
            {
              title: 'Vendedor',
              render: (_, r) => r.isOffline ? (r.soldBy?.name || 'Desconocido') : 'Web'
            },
            {
              title: 'Fecha',
              dataIndex: 'createdAt',
              render: (v) => dayjs(v).format('DD/MM/YYYY HH:mm')
            },
            {
              title: 'Estado',
              dataIndex: 'status',
              render: (v) => v === 'active' ? 'Activo' : v === 'winner' ? 'Ganador' : 'Al agua'
            },
            {
              title: 'Acciones',
              align: 'center',
              render: (_, r) => (
                <Space>
                  <Tooltip title="Ver Detalles">
                    <Button 
                      type="text" 
                      icon={<EyeOutlined />}
                      onClick={() => setViewingParticipant(r)}
                    />
                  </Tooltip>
                  <Tooltip title="Descargar Boleto PNG">
                    <Button 
                      type="text" 
                      icon={<PictureOutlined style={{ color: MISIO_COLORS.primary }} />}
                      onClick={async () => {
                        try {
                          const dataUrl = await generateTicketsImage(participantsDrawer, [r.ticketNumber], r.isOffline ? r.buyerName : (r.userId?.name || ''), r.createdAt, 'ticketera');
                          const link = document.createElement('a');
                          link.download = `ticket-${String(r.ticketNumber).padStart(4, '0')}.png`;
                          link.href = dataUrl;
                          link.click();
                        } catch (err) {
                          message.error('Error generando imagen');
                        }
                      }}
                    />
                  </Tooltip>
                </Space>
              )
            }
          ]}
        />
      </Drawer>

      {/* ── Modal Detalles de Participante ────────────────────────── */}
      <Modal
        open={!!viewingParticipant}
        onCancel={() => setViewingParticipant(null)}
        footer={[
          <Button key="close" onClick={() => setViewingParticipant(null)}>
            Cerrar
          </Button>
        ]}
        title={
          <Space>
            <UserOutlined style={{ color: MISIO_COLORS.primary }} />
            <span>Detalles del Participante</span>
          </Space>
        }
        width={700}
        destroyOnHidden
      >
        {viewingParticipant && (
          <div style={{ marginTop: 16 }}>
            <Card size="small" style={{ background: '#f8fafc', borderRadius: 8 }}>
              <Space direction="vertical" size="middle" style={{ width: '100%' }}>
                <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 16 }}>
                  <TicketCard 
                    ticket={{
                      ...viewingParticipant,
                      code: viewingParticipant.code || `${participantsDrawer?.ticketPrefix || ''}-${String(viewingParticipant.ticketNumber).padStart(4, '0')}`
                    }}
                    raffle={{
                      title: participantsDrawer?.title,
                      ticketPrice: participantsDrawer?.ticketPrice
                    }}
                    showDownload={true}
                  />
                </div>

                <Divider style={{ margin: '8px 0' }} />

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                  <div>
                    <Text type="secondary" style={{ fontSize: 12, display: 'block' }}>Nombre Completo</Text>
                    <Text strong>
                      <UserOutlined style={{ marginRight: 6, color: '#64748b' }} />
                      {viewingParticipant.isOffline ? viewingParticipant.buyerName : (viewingParticipant.userId?.name || 'Anónimo')}
                    </Text>
                  </div>
                  <div>
                    <Text type="secondary" style={{ fontSize: 12, display: 'block' }}>Documento / DNI</Text>
                    <Text strong>
                      <IdcardOutlined style={{ marginRight: 6, color: '#64748b' }} />
                      {viewingParticipant.isOffline ? (viewingParticipant.buyerDni || 'No registrado') : (viewingParticipant.userId?.dni || 'No registrado')}
                    </Text>
                  </div>
                  <div>
                    <Text type="secondary" style={{ fontSize: 12, display: 'block' }}>Teléfono / WhatsApp</Text>
                    <Text strong>
                      <PhoneOutlined style={{ marginRight: 6, color: '#64748b' }} />
                      {viewingParticipant.isOffline ? (viewingParticipant.buyerPhone || 'No registrado') : (viewingParticipant.userId?.phone || 'No registrado')}
                    </Text>
                  </div>
                  <div>
                    <Text type="secondary" style={{ fontSize: 12, display: 'block' }}>Correo Electrónico</Text>
                    <Text strong>
                      <MailOutlined style={{ marginRight: 6, color: '#64748b' }} />
                      {viewingParticipant.isOffline ? (viewingParticipant.buyerEmail || 'No registrado') : (viewingParticipant.userId?.email || 'No registrado')}
                    </Text>
                  </div>
                </div>
                
                <Divider style={{ margin: '8px 0' }} />

                <div>
                  <Text type="secondary" style={{ fontSize: 12, display: 'block' }}>Detalles de Compra</Text>
                  <Text style={{ display: 'block' }}>
                    <span style={{ color: '#64748b' }}>Fecha:</span> {dayjs(viewingParticipant.createdAt).format('DD/MM/YYYY HH:mm')}
                  </Text>
                  <Text style={{ display: 'block' }}>
                    <span style={{ color: '#64748b' }}>Medio de pago:</span> {viewingParticipant.paymentMethod ? viewingParticipant.paymentMethod.toUpperCase() : 'MISIO'}
                  </Text>
                  {viewingParticipant.isOffline && (
                    <Text style={{ display: 'block' }}>
                      <span style={{ color: '#64748b' }}>Vendedor:</span> {viewingParticipant.soldBy?.name || 'Desconocido'}
                    </Text>
                  )}
                  
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 12 }}>
                    <Tag color={viewingParticipant.status === 'active' ? 'success' : 'default'} style={{ margin: 0 }}>
                      {viewingParticipant.status === 'active' ? 'Activo' : viewingParticipant.status}
                    </Tag>
                    <Tag color={viewingParticipant.isOffline ? 'blue' : 'green'} style={{ margin: 0 }}>
                      {viewingParticipant.isOffline ? 'Venta Externa' : 'Venta Web'}
                    </Tag>
                  </div>
                </div>

              </Space>
            </Card>
          </div>
        )}
      </Modal>

    </div>
  );
}
