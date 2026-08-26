import React, { useState } from 'react';
import {
  Card, Table, Tag, Button, Typography, message, Alert, Modal, Form, Input,
  InputNumber, DatePicker, Switch, Space, Upload, Image, Popconfirm, Tooltip,
} from 'antd';
import {
  PlusOutlined, UploadOutlined, PictureOutlined, DeleteOutlined,
  StopOutlined, FireFilled, CrownFilled, PlayCircleFilled, VideoCameraFilled,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import { MISIO_COLORS } from '../../theme/misioTheme';
import { useApiOrMock } from '../../hooks/useApiOrMock';
import { api, SERVER_URL, tokenStore } from '../../auth/api';
import { useNavigate } from 'react-router-dom';
import { Radio } from 'antd';

const { Title, Text } = Typography;

const STATUS_TAG = {
  draft: <Tag color="default">Borrador</Tag>,
  scheduled: <Tag color="processing">Programada</Tag>,
  live: <Tag color={MISIO_COLORS.danger}>🔴 EN SUBASTA</Tag>,
  finished: <Tag color="success">Finalizada</Tag>,
  cancelled: <Tag>Cancelada</Tag>,
};

/**
 * 🔨 SUBASTAS (admin):
 *  - INTERRUPTOR DE EMERGENCIA: apaga TODO el módulo al instante (los
 *    endpoints públicos responden "deshabilitado" y la página muestra
 *    el aviso) — pedido explícito: "por si tengo problemas, lo deshabilito".
 *  - Crear subastas (inicio programado + duración), fotos, cancelar con
 *    motivo (libera la retención del líder y notifica a los matriculados).
 */
export default function AdminAuctions() {
  const [msgApi, contextHolder] = message.useMessage();
  const navigate = useNavigate();
  const { data: flag, refresh: refreshFlag } = useApiOrMock('/auctions/flag', { enabled: false });
  const [page, setPage] = useState(1);
  const { data: paged, demo, refresh } = useApiOrMock(
    `/auctions/admin/all?page=${page}&limit=20`,
    { items: [], total: 0, page: 1, limit: 20, pages: 1 },
  );
  const auctions = paged.items ?? [];
  const [creating, setCreating] = useState(false);
  const [photosOf, setPhotosOf] = useState(null);
  const [saving, setSaving] = useState(false);
  const [form] = Form.useForm();

  const guardDemo = () => demo && (msgApi.info('Modo demo: conecta el backend.'), true);

  const setFlag = async (enabled) => {
    if (guardDemo()) return;
    try {
      await api('/auctions/flag', { method: 'PUT', body: { enabled } });
      msgApi.success(enabled
        ? 'Subastas ACTIVADAS — ya aparecen para los usuarios.'
        : 'Subastas DESACTIVADAS — el módulo quedó en pausa para todos.');
      refreshFlag();
    } catch (err) { msgApi.error(err.message); }
  };

  const create = async (v) => {
    if (guardDemo()) return;
    setSaving(true);
    try {
      await api('/auctions', {
        method: 'POST',
        body: {
          title: v.title,
          description: v.description,
          emoji: v.emoji,
          basePrice: v.basePrice,
          minIncrement: v.minIncrement,
          buyNowPrice: v.buyNowPrice || 0,
          startAt: v.startAt.toISOString(),
          durationMin: v.durationMin,
          mode: v.mode ?? 'auto',
          streamUrl: v.streamUrl ?? '',
        },
      });
      msgApi.success('Subasta programada ✓ — los matriculados recibirán el aviso 15 min antes.');
      setCreating(false);
      form.resetFields();
      refresh();
    } catch (err) { msgApi.error(err.message); } finally { setSaving(false); }
  };

  const startNow = async (a) => {
    if (guardDemo()) return;
    try {
      await api(`/auctions/${a._id}/start`, { method: 'POST' });
      msgApi.success(`🔨 "${a.title}" ARRANCÓ — los matriculados fueron notificados. ¡A pujar!`, 6);
      refresh();
    } catch (err) { msgApi.error(err.message); }
  };

  const cancel = async (a, reason) => {
    try {
      await api(`/auctions/${a._id}/cancel`, { method: 'POST', body: { reason } });
      msgApi.success('Cancelada — retenciones liberadas y matriculados notificados.');
      refresh();
    } catch (err) { msgApi.error(err.message); }
  };

  const publish = async (a) => {
    if (guardDemo()) return;
    try {
      await api(`/auctions/${a._id}/publish`, { method: 'PATCH' });
      msgApi.success(`📢 Subasta "${a.title}" publicada. Los usuarios ya pueden verla y matricularse.`);
      refresh();
    } catch (err) { msgApi.error(err.message); }
  };

  const columns = [
    {
      title: 'Subasta', key: 'title',
      render: (_, a) => (
        <>
          <Text strong>{a.emoji} {a.title}</Text>
          <br />
          <Text style={{ fontSize: 11, color: MISIO_COLORS.textMuted }}>
            {dayjs(a.startAt).format('DD/MM HH:mm')} → {dayjs(a.endAt).format('HH:mm')}
          </Text>
        </>
      ),
    },
    {
      title: 'Estado', key: 'status',
      render: (_, a) => (
        <Space direction="vertical" size={2}>
          {STATUS_TAG[a.status] ?? a.status}
          {a.mode === 'moderated'
            ? <Tag color="purple" style={{ margin: 0 }}>🎙️ Moderada</Tag>
            : <Tag style={{ margin: 0 }}>🤖 Automática</Tag>}
        </Space>
      ),
    },
    {
      title: 'Dinero', key: 'money', responsive: ['md'],
      render: (_, a) => (
        <>
          <Text style={{ fontSize: 12 }}>Base S/ {a.basePrice}</Text>
          {a.currentBid && (
            <>
              <br />
              <Text style={{ fontSize: 12, color: MISIO_COLORS.saldoGreen }}>
                <CrownFilled style={{ color: MISIO_COLORS.prizeGold }} /> S/ {a.currentBid.amount} ({a.currentBid.name})
              </Text>
            </>
          )}
        </>
      ),
    },
    {
      title: '👥 / 🔨', key: 'counts', responsive: ['sm'],
      render: (_, a) => (
        <Text style={{ fontSize: 12 }}>{a.enrolled?.length ?? 0} matr. · {a.bidsCount} pujas</Text>
      ),
    },
    {
      title: '', key: 'actions',
      render: (_, a) => (
        <Space size={4}>
          {a.status === 'draft' && (
            <Popconfirm
              title="¿Publicar esta subasta?"
              description="Pasará a programada y será visible para el público."
              okText="Publicar" cancelText="Cancelar"
              onConfirm={() => publish(a)}
            >
              <Tooltip title="Publicar (hacerla visible en la tienda)">
                <Button size="small" type="primary" style={{ backgroundColor: '#fa8c16', borderColor: '#fa8c16' }}>
                  📢 Publicar
                </Button>
              </Tooltip>
            </Popconfirm>
          )}
          {a.status === 'scheduled' && (
            <Popconfirm
              title="¿Iniciar la subasta AHORA?"
              description="Arranca al instante con su duración completa y se avisa a los matriculados."
              okText="¡Iniciar!" cancelText="Aún no"
              onConfirm={() => startNow(a)}
            >
              <Tooltip title="Iniciar ahora (sin esperar la hora)">
                <Button size="small" type="primary" icon={<PlayCircleFilled />} />
              </Tooltip>
            </Popconfirm>
          )}
          {a.status !== 'cancelled' && (
            <Tooltip title="Panel en vivo: transmitir y ver las pujas">
              <Button size="small" icon={<VideoCameraFilled />}
                onClick={() => navigate(`/admin/subasta/${a._id}`)} />
            </Tooltip>
          )}
          <Tooltip title="Fotos">
            <Button size="small" icon={<PictureOutlined />} onClick={() => setPhotosOf(a)} />
          </Tooltip>
          {['scheduled', 'live'].includes(a.status) && (
            <Popconfirm
              title="Cancelar subasta"
              description={
                <Input.TextArea id={`reason-${a._id}`} rows={2}
                  placeholder="Motivo (se notifica a los matriculados)" />
              }
              okText="Cancelar subasta" cancelText="Volver"
              onConfirm={() => {
                const reason = document.getElementById(`reason-${a._id}`)?.value ?? '';
                return cancel(a, reason);
              }}
            >
              <Button size="small" danger icon={<StopOutlined />} />
            </Popconfirm>
          )}
        </Space>
      ),
    },
  ];

  return (
    <div>
      {contextHolder}
      {demo && <Alert type="info" showIcon style={{ marginBottom: 16 }} message="Modo demo." />}

      <Title level={3}><FireFilled style={{ color: MISIO_COLORS.danger }} /> Subastas</Title>

      {/* ── Interruptor de emergencia ── */}
      <Card size="small" style={{ marginBottom: 20 }}>
        <Space align="center" wrap>
          <Switch checked={!!flag.enabled} onChange={setFlag} />
          <div>
            <Text strong>{flag.enabled ? 'Módulo ACTIVO' : 'Módulo APAGADO'}</Text>
            <br />
            <Text style={{ fontSize: 12, color: MISIO_COLORS.textMuted }}>
              {flag.enabled
                ? 'Los usuarios ven las subastas, se matriculan y pujan. Apágalo ante cualquier problema: TODO el módulo se pausa al instante.'
                : 'Nadie puede ver, matricularse ni pujar. Enciéndelo cuando estés listo.'}
            </Text>
          </div>
        </Space>
      </Card>

      <Card
        title={<>Subastas <Tag>{paged.total ?? auctions.length}</Tag></>}
        extra={
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreating(true)}>
            Programar subasta
          </Button>
        }
      >
        <Table dataSource={auctions} columns={columns} rowKey="_id"
          size="middle" scroll={{ x: 640 }}
          pagination={{
            current: paged.page ?? 1,
            pageSize: paged.limit ?? 20,
            total: paged.total ?? auctions.length,
            showSizeChanger: false,
            onChange: setPage,
          }} />
      </Card>

      {/* ── Crear ── */}
      <Modal open={creating} onCancel={() => setCreating(false)} footer={null}
        title="🔨 Programar subasta" destroyOnHidden>
        <Form form={form} layout="vertical" onFinish={create} requiredMark={false}
          initialValues={{ emoji: '🔨', minIncrement: 5, durationMin: 30, mode: 'auto' }}>
          <Form.Item name="title" label="Título" rules={[{ required: true, min: 3 }]}>
            <Input placeholder="MacBook Air M3 — 16GB / 512GB" />
          </Form.Item>
          <Form.Item name="description" label="Descripción">
            <Input.TextArea rows={2} placeholder="Nuevo, sellado, boleta y garantía." />
          </Form.Item>
          <Space.Compact block>
            <Form.Item name="emoji" label="Emoji" style={{ width: 90 }}>
              <Input maxLength={4} />
            </Form.Item>
            <Form.Item name="basePrice" label="Precio base S/" style={{ flex: 1 }}
              rules={[{ required: true }]}>
              <InputNumber min={1} style={{ width: '100%' }} placeholder="100" />
            </Form.Item>
            <Form.Item name="minIncrement" label="Incremento S/" style={{ flex: 1 }}>
              <InputNumber min={1} style={{ width: '100%' }} />
            </Form.Item>
          </Space.Compact>
          <Space.Compact block>
            <Form.Item name="startAt" label="Arranca" style={{ flex: 1.4 }}
              rules={[{ required: true, message: 'Fecha y hora de inicio' }]}>
              <DatePicker showTime format="DD/MM/YYYY HH:mm" style={{ width: '100%' }}
                disabledDate={(d) => d && d < dayjs().startOf('day')} />
            </Form.Item>
            <Form.Item name="durationMin" label="Duración (min)" style={{ flex: 1 }}
              rules={[{ required: true }]}>
              <InputNumber min={5} max={480} style={{ width: '100%' }} />
            </Form.Item>
          </Space.Compact>
          <Form.Item name="buyNowPrice" label='Precio "Cómpralo ya" (opcional — 0 = sin botón)'>
            <InputNumber min={0} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="mode" label="¿Cómo se conduce?">
            <Radio.Group style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <Radio value="auto">
                🤖 <b>Automática</b> — arranca y cierra sola por reloj (sin ti)
              </Radio>
              <Radio value="moderated">
                🎙️ <b>Moderada (en vivo)</b> — tú transmites y abres las pujas
              </Radio>
            </Radio.Group>
          </Form.Item>
          <Form.Item noStyle shouldUpdate={(a, b) => a.mode !== b.mode}>
            {({ getFieldValue }) => getFieldValue('mode') === 'moderated' && (
              <Form.Item name="streamUrl" label="Enlace de transmisión (puedes ponerlo después)">
                <Input placeholder="https://www.youtube.com/watch?v=…" />
              </Form.Item>
            )}
          </Form.Item>
          <Button type="primary" htmlType="submit" block loading={saving}>
            Programar
          </Button>
          <Text style={{ fontSize: 11, color: MISIO_COLORS.textMuted, display: 'block', marginTop: 8 }}>
            Anti-sniping automático: toda puja en los últimos 2 minutos extiende
            el cierre 2 minutos. Los matriculados reciben aviso 15 min antes y
            al arrancar.
          </Text>
        </Form>
      </Modal>

      {/* ── Fotos ── */}
      <Modal open={!!photosOf} onCancel={() => setPhotosOf(null)} footer={null}
        title={photosOf ? `Fotos — ${photosOf.title}` : ''} destroyOnHidden>
        {photosOf && (
          <Space direction="vertical" style={{ width: '100%' }} size="middle">
            <Upload multiple showUploadList={false} accept=".jpg,.jpeg,.png,.webp"
              customRequest={async ({ file, onSuccess, onError }) => {
                try {
                  const fd = new FormData();
                  fd.append('files', file);
                  const token = tokenStore.get();
                  const res = await fetch(`${SERVER_URL}/api/v1/auctions/${photosOf._id}/images`, {
                    method: 'POST',
                    headers: token ? { Authorization: `Bearer ${token}` } : {},
                    body: fd,
                  });
                  const data = await res.json();
                  if (!res.ok) throw new Error(data.message ?? 'Error al subir');
                  setPhotosOf(data);
                  onSuccess('ok');
                  refresh();
                } catch (err) { msgApi.error(err.message); onError(err); }
              }}>
              <Button icon={<UploadOutlined />} block>Subir fotos (máx 4)</Button>
            </Upload>
            <Space wrap>
              {(photosOf.images ?? []).map((url) => (
                <Image key={url} src={`${SERVER_URL}${url}`} width={100} height={100}
                  style={{ objectFit: 'cover', borderRadius: 10 }} />
              ))}
            </Space>
          </Space>
        )}
      </Modal>
    </div>
  );
}
