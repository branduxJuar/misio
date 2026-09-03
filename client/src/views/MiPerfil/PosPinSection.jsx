import React, { useState } from 'react';
import { Card, Form, Input, Button, message, Typography } from 'antd';
import { SaveOutlined, LockOutlined } from '@ant-design/icons';
import { api } from '../../auth/api';

const { Title, Text } = Typography;

export default function PosPinSection({ profile, demo }) {
  const [form] = Form.useForm();
  const [saving, setSaving] = useState(false);
  const [msgApi, contextHolder] = message.useMessage();

  const savePin = async (values) => {
    if (demo) return msgApi.info('Modo demo: conecta el backend.');
    if (values.pin !== values.confirmPin) {
      return msgApi.error('Los PINs no coinciden.');
    }
    setSaving(true);
    try {
      await api('/users/me/pos-pin', {
        method: 'PATCH',
        body: { pin: values.pin },
      });
      msgApi.success('PIN de POS guardado correctamente.');
      form.resetFields();
    } catch (err) {
      msgApi.error(err.message || 'Error al guardar el PIN');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card
      title={
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: 17, fontWeight: 700, color: '#0f172a' }}>
          <div style={{ width: 36, height: 36, borderRadius: 10, background: '#ecfdf5', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#047857', fontSize: 18 }}>
            <LockOutlined />
          </div>
          <span>Configuración de POS (Ventas Físicas)</span>
        </div>
      }
      style={{ borderRadius: 16, border: '1px solid #e2e8f0', boxShadow: '0 4px 15px rgba(0, 0, 0, 0.02)', background: '#ffffff' }}
      styles={{ header: { padding: '18px 24px', borderBottom: '1px solid #f1f5f9' }, body: { padding: '24px' } }}
    >
      {contextHolder}
      <div style={{ marginBottom: 20 }}>
        <Text style={{ color: '#64748b' }}>
          Configura un PIN numérico (ej. 4 o 6 dígitos) que usarás para autorizar anulaciones y otras operaciones especiales en el módulo de Ventas POS.
        </Text>
      </div>
      <Form form={form} layout="vertical" onFinish={savePin} requiredMark={false}>
        <Form.Item
          name="pin"
          label={<Text strong style={{ color: '#334155' }}>Nuevo PIN POS</Text>}
          rules={[
            { required: true, message: 'Ingresa un PIN' },
            { pattern: /^\d+$/, message: 'Solo números permitidos' }
          ]}
        >
          <Input.Password size="large" placeholder="Ej. 1234" maxLength={6} style={{ borderRadius: 8, maxWidth: 300 }} />
        </Form.Item>
        <Form.Item
          name="confirmPin"
          label={<Text strong style={{ color: '#334155' }}>Confirmar PIN POS</Text>}
          rules={[
            { required: true, message: 'Confirma tu PIN' },
            ({ getFieldValue }) => ({
              validator(_, value) {
                if (!value || getFieldValue('pin') === value) {
                  return Promise.resolve();
                }
                return Promise.reject(new Error('Los PINs no coinciden'));
              },
            }),
          ]}
        >
          <Input.Password size="large" placeholder="Confirmar PIN" maxLength={6} style={{ borderRadius: 8, maxWidth: 300 }} />
        </Form.Item>
        <Button
          type="primary"
          size="large"
          htmlType="submit"
          icon={<SaveOutlined />}
          loading={saving}
          style={{ background: '#047857', fontWeight: 600, borderRadius: 8, height: 46 }}
        >
          Guardar PIN
        </Button>
      </Form>
    </Card>
  );
}
