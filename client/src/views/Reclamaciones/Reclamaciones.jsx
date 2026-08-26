import React, { useState } from 'react';
import {
  Card, Col, Row, Typography, Form, Input, Button, Radio, message, Result,
  List, Tag, Alert,
} from 'antd';
import { BookOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import { MISIO_COLORS } from '../../theme/misioTheme';
import { useAuth } from '../../auth/AuthContext';
import { useApiOrMock } from '../../hooks/useApiOrMock';
import { api } from '../../auth/api';

const { Title, Text } = Typography;

/**
 * 📕 LIBRO DE RECLAMACIONES VIRTUAL (/reclamaciones).
 * Ley N° 29571 — cualquiera puede reclamar, con o sin cuenta. Devuelve
 * un folio LR-XXXXXX y el compromiso de respuesta en el plazo legal.
 */
export default function Reclamaciones() {
  const { user } = useAuth();
  const [msgApi, contextHolder] = message.useMessage();
  const { data: mine } = useApiOrMock(user ? '/complaints/mine' : null, []);
  const [sent, setSent] = useState(null);
  const [saving, setSaving] = useState(false);
  const [form] = Form.useForm();

  const submit = async (v) => {
    setSaving(true);
    try {
      const res = await api('/complaints', { method: 'POST', body: v });
      setSent(res);
    } catch (err) {
      msgApi.error(err.message);
    } finally {
      setSaving(false);
    }
  };

  if (sent) {
    return (
      <Result
        status="success"
        title={`Registrado con folio ${sent.code}`}
        subTitle={sent.message}
        extra={<Button type="primary" onClick={() => { setSent(null); form.resetFields(); }}>Registrar otro</Button>}
      />
    );
  }

  return (
    <div>
      {contextHolder}
      <div style={{ textAlign: 'center', margin: '8px 0 20px' }}>
        <Title level={2} style={{ marginBottom: 4 }}>
          <BookOutlined style={{ color: MISIO_COLORS.danger }} /> Libro de Reclamaciones
        </Title>
        <Text style={{ color: MISIO_COLORS.textMuted }}>
          Conforme al Código de Protección y Defensa del Consumidor (Ley N° 29571).
          Respondemos dentro del plazo legal — la mayoría en menos de 48 horas.
        </Text>
      </div>

      <Row gutter={[20, 20]}>
        <Col xs={24} lg={user ? 14 : 24}>
          <Card>
            <Form
              form={form} layout="vertical" onFinish={submit} requiredMark={false}
              initialValues={{ kind: 'reclamo', fullName: user?.name, dni: user?.dni }}
            >
              <Row gutter={12}>
                <Col xs={24} sm={12}>
                  <Form.Item name="fullName" label="Nombre completo"
                    rules={[{ required: true, min: 3 }]}>
                    <Input />
                  </Form.Item>
                </Col>
                <Col xs={12} sm={6}>
                  <Form.Item name="dni" label="DNI"
                    rules={[{ required: true, pattern: /^\d{8}$/, message: '8 dígitos' }]}>
                    <Input maxLength={8} />
                  </Form.Item>
                </Col>
                <Col xs={12} sm={6}>
                  <Form.Item name="phone" label="Celular">
                    <Input maxLength={9} />
                  </Form.Item>
                </Col>
              </Row>
              <Form.Item name="email" label="Correo (para responderte)"
                rules={[{ type: 'email', message: 'Correo inválido' }]}>
                <Input placeholder="tucorreo@gmail.com" />
              </Form.Item>
              <Form.Item name="kind" label="Tipo">
                <Radio.Group>
                  <Radio.Button value="reclamo">Reclamo (producto/servicio)</Radio.Button>
                  <Radio.Button value="queja">Queja (atención)</Radio.Button>
                </Radio.Group>
              </Form.Item>
              <Form.Item name="orderRef" label="Sorteo / pedido relacionado (opcional)">
                <Input placeholder="Ej: sorteo PS5, canje, N° operación…" />
              </Form.Item>
              <Form.Item name="detail" label="Detalle"
                rules={[{ required: true, min: 20, message: 'Cuéntanos qué pasó (mín. 20 caracteres)' }]}>
                <Input.TextArea rows={4} maxLength={3000} showCount />
              </Form.Item>
              <Button type="primary" htmlType="submit" block size="large" loading={saving}>
                Registrar en el Libro de Reclamaciones
              </Button>
            </Form>
          </Card>
        </Col>

        {user && (
          <Col xs={24} lg={10}>
            <Card title="Mis reclamos">
              <List
                dataSource={mine}
                locale={{ emptyText: 'No has registrado reclamos.' }}
                renderItem={(c) => (
                  <List.Item>
                    <List.Item.Meta
                      title={
                        <>
                          <Text code>{c.code}</Text>{' '}
                          {c.status === 'answered'
                            ? <Tag color="success">Respondido</Tag>
                            : <Tag color="warning">En atención</Tag>}
                        </>
                      }
                      description={
                        <>
                          <Text style={{ fontSize: 12, color: MISIO_COLORS.textMuted }}>
                            {dayjs(c.createdAt).format('DD/MM/YYYY')} · {c.kind}
                          </Text>
                          {c.response && (
                            <Alert type="info" style={{ marginTop: 6 }}
                              message={<Text style={{ fontSize: 12 }}>{c.response}</Text>} />
                          )}
                        </>
                      }
                    />
                  </List.Item>
                )}
              />
            </Card>
          </Col>
        )}
      </Row>
    </div>
  );
}
