import React, { useEffect, useState } from 'react';
import {
  Drawer, Form, Input, Select, Button, Upload, Typography, Divider,
  Space, Tag, message,
} from 'antd';
import { UploadOutlined, FileDoneOutlined, CameraOutlined, LinkOutlined } from '@ant-design/icons';
import { api, apiUpload, SERVER_URL } from '../../auth/api';
import { MISIO_COLORS } from '../../theme/misioTheme';

const { Text } = Typography;

/**
 * ManagePrizeDrawer — gestión de UN premio del ERP:
 *  - Actualizar courier / guía / destino / estado (PATCH /logistics/:id).
 *  - Subir boleta de compra (POST /logistics/:id/receipt).
 *  - Subir evidencia de entrega (POST /logistics/:id/evidence).
 * Cada acción escribe la bitácora en el backend; onSaved refresca la tabla.
 */
export default function ManagePrizeDrawer({ record, open, onClose, onSaved }) {
  const [form] = Form.useForm();
  const [saving, setSaving] = useState(false);
  const [msgApi, contextHolder] = message.useMessage();

  useEffect(() => {
    if (record && open) {
      form.setFieldsValue({
        courier: record.courier === '—' ? '' : record.courier,
        trackingNumber: record.trackingNumber === '—' ? '' : record.trackingNumber,
        destinationCity: record.destinationCity ?? '',
        deliveryStatus: record.deliveryStatus,
      });
    }
  }, [record, open, form]);

  if (!record) return null;

  const save = async (values) => {
    setSaving(true);
    try {
      await api(`/logistics/${record._id}`, {
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
      msgApi.success('Envío actualizado — bitácora registrada ✓');
      onSaved?.();
    } catch (err) {
      msgApi.error(err.message);
    } finally {
      setSaving(false);
    }
  };

  /** customRequest de AntD Upload → nuestros endpoints multipart. */
  const uploadTo = (kind) => async ({ file, onSuccess, onError }) => {
    try {
      await apiUpload(`/logistics/${record._id}/${kind}`, file);
      msgApi.success(kind === 'receipt' ? 'Boleta adjuntada ✓' : 'Evidencia adjuntada ✓');
      onSuccess?.('ok');
      onSaved?.();
    } catch (err) {
      msgApi.error(err.message);
      onError?.(err);
    }
  };

  const fileLink = (url, label) =>
    url ? (
      <a href={`${SERVER_URL}${url}`} target="_blank" rel="noreferrer">
        <LinkOutlined /> {label}
      </a>
    ) : (
      <Text style={{ color: MISIO_COLORS.textMuted }}>Sin archivo aún</Text>
    );

  return (
    <Drawer
      title={<>📦 {record.productName}</>}
      open={open}
      onClose={onClose}
      width={Math.min(480, window.innerWidth)}
    >
      {contextHolder}

      <Tag color="processing" style={{ marginBottom: 16 }}>
        Ganador: {record.winnerName ?? '— (sin sortear)'}
      </Tag>

      <Divider orientation="left" plain>Envío</Divider>
      <Form form={form} layout="vertical" onFinish={save} requiredMark={false}>
        <Form.Item name="courier" label="Courier">
          <Input placeholder="Olva Courier / Shalom / Marvisur…" />
        </Form.Item>
        <Form.Item name="trackingNumber" label="N° de guía">
          <Input placeholder="OLV-88214-PE" />
        </Form.Item>
        <Form.Item name="destinationCity" label="Ciudad de Destino">
          <Input placeholder="Iquitos, Cusco, Lima…" />
        </Form.Item>
        <Form.Item name="deliveryStatus" label="Estado de entrega">
          <Select
            options={[
              { value: 'in_stock', label: '📦 En almacén' },
              { value: 'transit', label: '🚚 En tránsito' },
              { value: 'delivered', label: '✅ Entregado' },
            ]}
          />
        </Form.Item>
        <Button type="primary" htmlType="submit" block loading={saving}>
          Guardar y registrar en bitácora
        </Button>
      </Form>

      <Divider orientation="left" plain>Documentos</Divider>
      <Space direction="vertical" style={{ width: '100%' }} size="middle">
        <div>
          <Text strong><FileDoneOutlined /> Boleta / factura de compra</Text>
          <div style={{ margin: '6px 0' }}>{fileLink(record.receiptFileUrl, 'Ver boleta')}</div>
          <Upload customRequest={uploadTo('receipt')} showUploadList={false} accept=".jpg,.jpeg,.png,.webp,.pdf">
            <Button icon={<UploadOutlined />} size="small">Subir boleta (JPG/PNG/PDF, máx 5MB)</Button>
          </Upload>
        </div>
        <div>
          <Text strong><CameraOutlined /> Evidencia de entrega</Text>
          <div style={{ margin: '6px 0' }}>{fileLink(record.evidencePhotoUrl, 'Ver foto')}</div>
          <Upload customRequest={uploadTo('evidence')} showUploadList={false} accept=".jpg,.jpeg,.png,.webp">
            <Button icon={<UploadOutlined />} size="small">Subir foto de entrega</Button>
          </Upload>
        </div>
      </Space>
    </Drawer>
  );
}
