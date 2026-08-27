import React, { useState } from 'react';
import dayjs from 'dayjs';
import {
  Card, Table, Tag, Button, Space, Typography, message, Alert, Modal, Form,
  Input, InputNumber, Switch, Row, Col, Popconfirm, Empty, Tooltip, Tabs,
} from 'antd';
import {
  PlusOutlined, EditOutlined, DeleteOutlined, CheckOutlined, ReloadOutlined,
  UploadOutlined, PictureOutlined,
} from '@ant-design/icons';
import { MISIO_COLORS } from '../../theme/misioTheme';
import RedemptionManager from './RedemptionManager';
import { useApiOrMock } from '../../hooks/useApiOrMock';
import { api, SERVER_URL, tokenStore } from '../../auth/api';
import { Upload, Image, Radio } from 'antd';

const { Title, Text } = Typography;

const MOCK_ITEMS = [
  { _id: 'i1', name: 'Gift card Rappi S/ 20', priceMisio: 20, emoji: '🛵', stock: -1, active: true },
  { _id: 'i2', name: 'Recarga Claro/Movistar S/ 15', priceMisio: 15, emoji: '📶', stock: 10, active: true },
];
const MOCK_REDEMPTIONS = [
  { _id: 'r1', userId: { name: 'Carla Mendoza', phone: '987654321' },
    itemName: 'Gift card Rappi S/ 20', price: 20, status: 'pending',
    createdAt: new Date().toISOString() },
];

/**
 * SPRINT B — Tienda de canjes (/admin/tienda).
 * Arriba: catálogo configurable (nombre, precio en Misio, emoji, stock
 * -1 = ilimitado, visible). Abajo: canjes realizados — el admin los
 * atiende (envía la gift card, hace la recarga…) y marca "Entregado".
 */
export default function AdminStore() {
  const [msgApi, contextHolder] = message.useMessage();
  const { data: items, demo, refresh: refreshItems } = useApiOrMock('/store/items/all', MOCK_ITEMS);
  const { data: redemptions, refresh: refreshRed, loading } = useApiOrMock('/store/redemptions', MOCK_REDEMPTIONS);
  const { data: delivered, refresh: refreshDel } = useApiOrMock('/store/redemptions/delivered', []);
  const [managing, setManaging] = useState(null); // canje en gestión
  const [redTab, setRedTab] = useState('pending');

  const [editing, setEditing] = useState(null); // null cerrado, {} nuevo, obj editar
  const [photosOf, setPhotosOf] = useState(null); // Item en el modal de fotos
  const [saving, setSaving] = useState(false);
  const [processing, setProcessing] = useState(null);
  const [form] = Form.useForm();

  const guardDemo = () => {
    if (demo) msgApi.info('Modo demo: conecta el backend.');
    return demo;
  };

  const openItem = (item) => {
    form.resetFields();
    setEditing(item ?? {});
    form.setFieldsValue(item ?? { emoji: '🎁', stock: -1, active: true, saleType: 'canje', fulfillment: 'fisico' });
  };

  const saveItem = async (values) => {
    if (guardDemo()) return;
    setSaving(true);
    try {
      if (editing?._id) {
        await api(`/store/items/${editing._id}`, { method: 'PATCH', body: values });
        msgApi.success('Producto actualizado ✓');
      } else {
        await api('/store/items', { method: 'POST', body: values });
        msgApi.success('Producto agregado a la tienda ✓');
      }
      setEditing(null);
      form.resetFields();
      refreshItems();
    } catch (err) { msgApi.error(err.message); } finally { setSaving(false); }
  };

  const removeItem = async (id) => {
    if (guardDemo()) return;
    try {
      await api(`/store/items/${id}`, { method: 'DELETE' });
      msgApi.success('Producto eliminado');
      refreshItems();
    } catch (err) { msgApi.error(err.message); }
  };

  const deliver = async (r) => {
    if (guardDemo()) return;
    setProcessing(r._id);
    try {
      await api(`/store/redemptions/${r._id}/deliver`, { method: 'PATCH' });
      msgApi.success('Marcado como entregado — el usuario fue notificado ✓');
      refreshRed();
    } catch (err) { msgApi.error(err.message); } finally { setProcessing(null); }
  };

  const itemColumns = [
    {
      title: 'Producto',
      key: 'name',
      render: (_, i) => (
        <Space>
          <span style={{ fontSize: 22 }}>{i.emoji}</span>
          <div>
            <Text strong style={{ fontSize: 13 }}>{i.name}</Text>
            <br />
            {(i.saleType ?? 'canje') === 'canje'
              ? <Tag color={MISIO_COLORS.prizeGold} style={{ color: '#3d2e00' }}>🎁 Canje</Tag>
              : <Tag color={MISIO_COLORS.saldoGreen} style={{ color: '#06281c' }}>💵 Venta</Tag>}
            {i.active ? <Tag color="success">Visible</Tag> : <Tag>Oculto</Tag>}
          </div>
        </Space>
      ),
    },
    {
      title: 'Precio',
      dataIndex: 'priceMisio',
      key: 'priceMisio',
      render: (v) => <Text style={{ color: MISIO_COLORS.saldoGreen }}>S/ {v}</Text>,
    },
    {
      title: 'Stock',
      dataIndex: 'stock',
      key: 'stock',
      render: (s) => (s === -1 ? <Tag color="processing">∞ Ilimitado</Tag>
        : s === 0 ? <Tag color="error">Agotado</Tag> : <Tag>{s}</Tag>),
    },
    {
      title: '',
      key: 'actions',
      render: (_, i) => (
        <Space size={4}>
          <Button size="small" icon={<PictureOutlined />} onClick={() => setPhotosOf(i)} />
          <Button size="small" icon={<EditOutlined />} onClick={() => openItem(i)} />
          <Popconfirm title="¿Eliminar producto?" onConfirm={() => removeItem(i._id)}>
            <Button size="small" danger icon={<DeleteOutlined />} />
          </Popconfirm>
        </Space>
      ),
    },
  ];

  const redemptionColumns = [
    {
      title: 'Usuario',
      key: 'user',
      render: (_, r) => (
        <>
          <Text style={{ fontSize: 13 }}>{r.userId?.name ?? '—'}</Text>
          <br />
          <Text style={{ fontSize: 11, color: MISIO_COLORS.textMuted }}>{r.userId?.phone}</Text>
        </>
      ),
    },
    { title: 'Canje', dataIndex: 'itemName', key: 'itemName', ellipsis: true },
    {
      title: 'Precio', dataIndex: 'price', key: 'price', responsive: ['md'],
      render: (v) => <Text style={{ color: MISIO_COLORS.saldoGreen }}>S/ {v}</Text>,
    },
    {
      title: 'Fecha', dataIndex: 'createdAt', key: 'createdAt', responsive: ['lg'],
      render: (d) => dayjs(d).format('DD/MM HH:mm'),
    },
    {
      title: 'Acción',
      key: 'status',
      render: (_, r) => (
        <Space direction="vertical" size={2}>
          {r.status === 'processing' && <Tag color="blue">Procesando</Tag>}
          {r.status === 'pending' || r.status === 'processing' ? (
            <Button type="primary" size="small" onClick={() => setManaging(r._id)}>
              Gestionar entrega
            </Button>
          ) : (
            <Button size="small" onClick={() => setManaging(r._id)}>Ver detalle</Button>
          )}
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
      <Title level={3}>🛍️ Tienda de canjes</Title>

      <Row gutter={[20, 20]}>
        <Col xs={24} xl={10}>
          <Card
            title="Catálogo"
            extra={<Button type="primary" size="small" icon={<PlusOutlined />}
              onClick={() => openItem(null)}>Agregar producto</Button>}
          >
            <Table dataSource={items} columns={itemColumns} rowKey="_id"
              size="small" scroll={{ x: 420 }} pagination={{ pageSize: 8 }}
              locale={{ emptyText: <Empty description="Agrega tu primer producto canjeable" /> }} />
          </Card>
        </Col>

        <Col xs={24} xl={14}>
          <Card
            title={<>Canjes{' '}
              <Tag color="warning">{redemptions.filter((r) => r.status === 'pending' || r.status === 'processing').length} por atender</Tag></>}
            extra={<Button size="small" icon={<ReloadOutlined />} onClick={() => { refreshRed(); refreshDel(); }} loading={loading} />}
          >
            <Tabs activeKey={redTab} onChange={setRedTab}
              items={[
                {
                  key: 'pending',
                  label: `Pendientes (${redemptions.filter((r) => r.status === 'pending' || r.status === 'processing').length})`,
                  children: (
                    <Table dataSource={redemptions.filter((r) => r.status === 'pending' || r.status === 'processing')} columns={redemptionColumns}
                      rowKey="_id" size="small" scroll={{ x: 520 }} pagination={{ pageSize: 8 }}
                      locale={{ emptyText: <Empty description="Nada pendiente 🎉" /> }} />
                  ),
                },
                {
                  key: 'delivered',
                  label: `Entregados (${(delivered ?? []).length})`,
                  children: (
                    <Table dataSource={delivered ?? []} columns={redemptionColumns}
                      rowKey="_id" size="small" scroll={{ x: 520 }} pagination={{ pageSize: 8 }}
                      locale={{ emptyText: <Empty description="Aún no hay entregas registradas" /> }} />
                  ),
                },
              ]}
            />
          </Card>
        </Col>
      </Row>

      <RedemptionManager
        redemptionId={managing}
        open={managing !== null}
        onClose={() => setManaging(null)}
        onDelivered={() => { refreshRed(); refreshDel(); }}
        msgApi={msgApi}
      />

      {/* ── Modal producto ────────────────────────────────────────── */}
      <Modal
        open={editing !== null}
        onCancel={() => setEditing(null)}
        footer={null}
        title={editing?._id ? `Editar — ${editing.name}` : 'Nuevo producto canjeable'}
        destroyOnHidden
      >
        <Form form={form} layout="vertical" onFinish={saveItem} requiredMark={false}>
          <Form.Item name="name" label="Nombre del producto"
            rules={[{ required: true, min: 3, message: 'Mínimo 3 caracteres' }]}>
            <Input placeholder="Gift card Steam S/ 50" />
          </Form.Item>
          <Space.Compact block>
            <Form.Item name="priceMisio" label="Precio (saldo Misio)" style={{ flex: 1 }}
              rules={[{ required: true, type: 'number', min: 1 }]}>
              <InputNumber min={1} style={{ width: '100%' }} />
            </Form.Item>
            <Form.Item name="emoji" label="Emoji" style={{ width: 90 }}>
              <Input maxLength={4} style={{ textAlign: 'center' }} />
            </Form.Item>
          </Space.Compact>
          <Form.Item name="saleType" label="Tipo de producto">
            <Radio.Group>
              <Radio.Button value="canje">🎁 Canje (saldo Cero Pérdida)</Radio.Button>
              <Radio.Button value="venta">💵 Venta real (saldo contable)</Radio.Button>
            </Radio.Group>
          </Form.Item>
          <Form.Item name="fulfillment" label="Entrega"
            tooltip="Físico: se envía a una dirección. Virtual: se entrega un código (gift card, recarga).">
            <Radio.Group>
              <Radio.Button value="fisico">📦 Físico (envío)</Radio.Button>
              <Radio.Button value="virtual">💻 Virtual (código)</Radio.Button>
            </Radio.Group>
          </Form.Item>
            <Form.Item name="description" label="Descripción del producto" rules={[{ required: true, message: 'La descripción es requerida' }]}>
              <Input.TextArea
                rows={4}
                placeholder="Nuevo, sellado, con garantía. Entrega local o envío nacional." />
            </Form.Item>
          <Form.Item name="stock"
            label={<Tooltip title="-1 = ilimitado (recargas, gift cards digitales)">Stock ℹ️</Tooltip>}
            rules={[{ required: true, type: 'number', min: -1 }]}>
            <InputNumber min={-1} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="active" label="Visible en la tienda" valuePropName="checked">
            <Switch />
          </Form.Item>
          <Button type="primary" htmlType="submit" block loading={saving}>
            {editing?._id ? 'Guardar cambios' : 'Agregar a la tienda'}
          </Button>
        </Form>
      </Modal>

      {/* ── Modal fotos del producto ─────────────────────────────── */}
      <Modal open={!!photosOf} onCancel={() => setPhotosOf(null)} footer={null}
        title={photosOf ? `Fotos — ${photosOf.name}` : ''} destroyOnHidden>
        {photosOf && (
          <Space direction="vertical" style={{ width: '100%' }} size="middle">
            <Upload
              multiple
              showUploadList={false}
              accept=".jpg,.jpeg,.png,.webp"
              customRequest={async ({ file, onSuccess, onError }) => {
                if (guardDemo()) return onError(new Error('demo'));
                try {
                  const fd = new FormData();
                  fd.append('files', file);
                  const token = tokenStore.get();
                  const res = await fetch(`${SERVER_URL}/api/v1/store/items/${photosOf._id}/images`, {
                    method: 'POST',
                    headers: token ? { Authorization: `Bearer ${token}` } : {},
                    body: fd,
                  });
                  const data = await res.json();
                  if (!res.ok) throw new Error(data.message ?? 'Error al subir');
                  setPhotosOf(data);
                  onSuccess('ok');
                  refreshItems();
                } catch (err) { msgApi.error(err.message); onError(err); }
              }}
            >
              <Button icon={<UploadOutlined />} block>Subir fotos (máx 4, 5MB c/u)</Button>
            </Upload>
            <Space wrap>
              {(photosOf.images ?? []).map((url) => (
                <div key={url} style={{ position: 'relative' }}>
                  <Image src={`${SERVER_URL}${url}`} width={100} height={100}
                    style={{ objectFit: 'cover', borderRadius: 10 }} />
                  <Button danger size="small" icon={<DeleteOutlined />}
                    style={{ position: 'absolute', top: 4, right: 4 }}
                    onClick={async () => {
                      const updated = await api(
                        `/store/items/${photosOf._id}/images?url=${encodeURIComponent(url)}`,
                        { method: 'DELETE' },
                      );
                      setPhotosOf(updated);
                      refreshItems();
                    }} />
                </div>
              ))}
            </Space>
          </Space>
        )}
      </Modal>
    </div>
  );
}
