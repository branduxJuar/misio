import React, { useState } from 'react';
import {
  Card, Table, Tag, Button, Typography, message, Alert, Modal, Form, Input, Tooltip, Grid, List, Space
} from 'antd';
import { SendOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import { MISIO_COLORS } from '../../theme/misioTheme';
import { useApiOrMock } from '../../hooks/useApiOrMock';
import { api } from '../../auth/api';

const { Title, Text, Paragraph } = Typography;

const MOCK = [
  { _id: 'c1', code: 'LR-000001', fullName: 'Jorge Ramírez', dni: '45678912',
    phone: '956123789', email: 'jorge@mail.com', kind: 'reclamo',
    orderRef: 'sorteo PS5', detail: 'Mi recarga de S/ 30 no se acreditó después de 2 horas de haber pagado por Yape.',
    status: 'pending', createdAt: new Date().toISOString() },
];

/** 📕 Reclamos (admin) — responder dentro del plazo legal (30 días). */
export default function AdminComplaints() {
  const [msgApi, contextHolder] = message.useMessage();
  const { data: complaints, demo, refresh } = useApiOrMock('/complaints', MOCK);
  const [responding, setResponding] = useState(null);
  const [saving, setSaving] = useState(false);
  const [form] = Form.useForm();
  const screens = Grid.useBreakpoint();
  const isDesktop = screens.lg;

  const respond = async ({ response }) => {
    if (demo) return msgApi.info('Modo demo.');
    setSaving(true);
    try {
      await api(`/complaints/${responding._id}/respond`, { method: 'PATCH', body: { response } });
      msgApi.success('Respuesta enviada — el usuario fue notificado ✓');
      setResponding(null);
      refresh();
    } catch (err) { msgApi.error(err.message); } finally { setSaving(false); }
  };

  const columns = [
    {
      title: 'Folio', dataIndex: 'code', key: 'code',
      render: (c, r) => (
        <>
          <Text code>{c}</Text>
          <br />
          <Text style={{ fontSize: 11, color: MISIO_COLORS.textMuted }}>
            {dayjs(r.createdAt).format('DD/MM/YY HH:mm')}
          </Text>
        </>
      ),
    },
    {
      title: 'Persona', key: 'who',
      render: (_, r) => (
        <>
          <Text style={{ fontSize: 13 }}>{r.fullName}</Text>
          <br />
          <Text style={{ fontSize: 11, color: MISIO_COLORS.textMuted }}>
            DNI {r.dni} · {r.phone || r.email || 'sin contacto'}
          </Text>
        </>
      ),
    },
    {
      title: 'Detalle', key: 'detail', responsive: ['md'],
      render: (_, r) => (
        <Tooltip title={r.detail}>
          <div>
            {r.kind === 'queja' ? <Tag>Queja</Tag> : <Tag color="warning">Reclamo</Tag>}
            {r.orderRef && <Tag color="processing">{r.orderRef}</Tag>}
            <Paragraph style={{ fontSize: 12, margin: '4px 0 0', maxWidth: 320 }} ellipsis={{ rows: 2 }}>
              {r.detail}
            </Paragraph>
          </div>
        </Tooltip>
      ),
    },
    {
      title: 'Estado', key: 'status',
      render: (_, r) =>
        r.status === 'answered'
          ? <Tag color="success">Respondido</Tag>
          : <Button type="primary" size="small" icon={<SendOutlined />}
              onClick={() => { form.resetFields(); setResponding(r); }}>
              Responder
            </Button>,
    },
  ];

  return (
    <div>
      {contextHolder}
      {demo && <Alert type="info" showIcon style={{ marginBottom: 16 }} message="Modo demo." />}
      <Title level={3}>
        📕 Libro de Reclamaciones{' '}
        <Tag color="warning">{complaints.filter((c) => c.status === 'pending').length} por responder</Tag>
      </Title>
      <Alert type="warning" showIcon style={{ marginBottom: 16 }}
        message="Plazo legal: 30 días calendario por reclamo (Ley N° 29571). Responder rápido evita denuncias ante Indecopi." />
      <Card style={{ boxShadow: '0 8px 24px rgba(0,0,0,0.05)', border: 'none', borderRadius: 16 }}>
        {isDesktop ? (
          <Table dataSource={complaints} columns={columns} rowKey="_id"
            size="middle" scroll={{ x: 640 }} pagination={{ pageSize: 10 }} />
        ) : (
          <List
            dataSource={complaints}
            pagination={{ pageSize: 10, size: 'small' }}
            renderItem={(r) => (
              <List.Item style={{ padding: '0 0 12px' }}>
                <Card size="small" style={{ width: '100%', borderRadius: 12, border: 'none', backgroundColor: MISIO_COLORS.primary, boxShadow: '0 4px 16px rgba(0,163,143,0.3)' }} styles={{ body: { padding: '16px' } }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                    <Text code style={{ fontSize: 13, backgroundColor: 'rgba(255,255,255,0.2)', color: '#fff', border: 'none' }}>{r.code}</Text>
                    <div>
                      {r.kind === 'queja' ? <Tag style={{ margin: 0 }}>Queja</Tag> : <Tag color="warning" style={{ margin: 0 }}>Reclamo</Tag>}
                    </div>
                  </div>
                  
                  <div style={{ marginBottom: 12, background: 'rgba(255,255,255,0.1)', padding: 12, borderRadius: 8, border: '1px solid rgba(255,255,255,0.2)' }}>
                    <Text strong style={{ fontSize: 13, display: 'block', color: '#fff' }}>{r.fullName}</Text>
                    <Text style={{ fontSize: 11, color: 'rgba(255,255,255,0.6)' }}>DNI {r.dni} · {r.phone || r.email || 'sin contacto'}</Text>
                  </div>
                  
                  <div style={{ marginBottom: 12 }}>
                    {r.orderRef && <Tag color="processing" style={{ marginBottom: 8, display: 'inline-block' }}>{r.orderRef}</Tag>}
                    <Paragraph style={{ fontSize: 13, margin: 0, color: 'rgba(255,255,255,0.8)' }} ellipsis={{ rows: 3, expandable: true, symbol: <span style={{ color: '#fff', fontWeight: 'bold' }}>ver más</span> }}>
                      {r.detail}
                    </Paragraph>
                  </div>
                  
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 12, paddingTop: 12, borderTop: '1px solid rgba(255,255,255,0.2)' }}>
                    <Text style={{ fontSize: 11, color: 'rgba(255,255,255,0.6)' }}>{dayjs(r.createdAt).format('DD/MM/YY HH:mm')}</Text>
                    {r.status === 'answered'
                      ? <Tag color="success" style={{ margin: 0 }}>Respondido</Tag>
                      : <Button type="primary" size="small" icon={<SendOutlined />}
                          style={{ backgroundColor: '#fff', color: MISIO_COLORS.primary }}
                          onClick={() => { form.resetFields(); setResponding(r); }}>
                          Responder
                        </Button>}
                  </div>
                </Card>
              </List.Item>
            )}
          />
        )}
      </Card>

      <Modal open={!!responding} onCancel={() => setResponding(null)} footer={null}
        title={responding ? `Responder ${responding.code}` : ''} destroyOnHidden>
        {responding && (
          <>
            <Alert type="info" style={{ marginBottom: 12 }}
              message={<Text style={{ fontSize: 12 }}>{responding.detail}</Text>} />
            <Form form={form} layout="vertical" onFinish={respond} requiredMark={false}>
              <Form.Item name="response" label="Respuesta oficial (le llegará como notificación)"
                rules={[{ required: true, min: 10, message: 'Mínimo 10 caracteres' }]}>
                <Input.TextArea rows={4} maxLength={2000} showCount />
              </Form.Item>
              <Button type="primary" htmlType="submit" block loading={saving}>
                Enviar respuesta y cerrar el folio
              </Button>
            </Form>
          </>
        )}
      </Modal>
    </div>
  );
}
