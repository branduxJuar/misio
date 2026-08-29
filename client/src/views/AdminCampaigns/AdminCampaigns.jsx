import React, { useState, useEffect } from 'react';
import { Card, Button, Table, Typography, Space, message, Modal, Form, Input, Select, InputNumber, Row, Col, Tag, Switch, DatePicker, Grid, List } from 'antd';
import { RocketOutlined, SendOutlined, InfoCircleOutlined, UsergroupAddOutlined, GiftOutlined } from '@ant-design/icons';
import { api } from '../../auth/api';
import dayjs from 'dayjs';

const { Title, Text } = Typography;
const { Option } = Select;

export default function AdminCampaigns() {
  const screens = Grid.useBreakpoint();
  const isDesktop = screens.lg;
  const [campaigns, setCampaigns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [form] = Form.useForm();
  const [audienceCount, setAudienceCount] = useState(null);
  const [calculating, setCalculating] = useState(false);

  const fetchCampaigns = async () => {
    setLoading(true);
    try {
      const data = await api('/campaigns');
      setCampaigns(data || []);
    } catch (error) {
      message.error('Error al cargar campañas');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCampaigns();
  }, []);

  const calculateAudience = async () => {
    try {
      setCalculating(true);
      const values = form.getFieldsValue();
      let promoData = null;
      if (values.hasPromo) {
        promoData = {
          code: values.promoCode,
          type: values.promoType,
          value: values.promoValue,
          terms: values.promoTerms,
          expiresAt: values.promoExpiresAt ? values.promoExpiresAt.toISOString() : null,
        };
      }

      const target = {
        audienceType: values.audienceType,
        monthsInactive: values.monthsInactive,
        country: values.country,
      };
      const result = await api('/campaigns/audience', {
        method: 'POST',
        body: target,
      });
      setAudienceCount(result.count);
      message.success(`Audiencia calculada: ${result.count} usuarios`);
    } catch (error) {
      message.error('Error al calcular la audiencia');
    } finally {
      setCalculating(false);
    }
  };

  const handleCreate = async (values) => {
    try {
      let promoData = null;
      if (values.hasPromo) {
        promoData = {
          code: values.promoCode,
          type: values.promoType,
          value: values.promoValue,
          terms: values.promoTerms,
          expiresAt: values.promoExpiresAt ? values.promoExpiresAt.toISOString() : null,
        };
      }

      await api('/campaigns', {
        method: 'POST',
        body: {
          title: values.title,
          message: values.message,
          target: {
            audienceType: values.audienceType,
            monthsInactive: values.monthsInactive,
            country: values.country,
          },
          promo: promoData,
        },
      });
      message.success('Campaña creada (Borrador)');
      setIsModalOpen(false);
      form.resetFields();
      setAudienceCount(null);
      fetchCampaigns();
    } catch (error) {
      message.error('Error al crear campaña');
    }
  };

  const handleSend = async (campaignId) => {
    Modal.confirm({
      title: '¿Estás seguro de enviar esta campaña?',
      content: 'Esta acción no se puede deshacer. Los mensajes se enviarán al buzón de los usuarios seleccionados.',
      okText: 'Sí, enviar ahora',
      okType: 'danger',
      cancelText: 'Cancelar',
      onOk: async () => {
        try {
          await api(`/campaigns/${campaignId}/send`, { method: 'POST' });
          message.success('¡Campaña enviada con éxito!');
          fetchCampaigns();
        } catch (error) {
          message.error('Error al enviar la campaña');
        }
      }
    });
  };

  const handleFinish = (campaignId) => {
    Modal.confirm({
      title: '¿Finalizar campaña?',
      content: 'La campaña se marcará como finalizada. Si tiene un código promocional adjunto, este será desactivado y ya no podrá ser usado.',
      okText: 'Sí, finalizar',
      cancelText: 'Cancelar',
      onOk: async () => {
        try {
          await api(`/campaigns/${campaignId}/finish`, { method: 'PATCH' });
          message.success('Campaña finalizada exitosamente.');
          fetchCampaigns();
        } catch (error) {
          message.error('Error al finalizar la campaña');
        }
      }
    });
  };

  const columns = [
    {
      title: 'Campaña',
      dataIndex: 'title',
      key: 'title',
      render: (text, record) => (
        <div>
          <Text strong>{text}</Text>
          <div style={{ fontSize: 12, color: 'gray' }}>{record.message.substring(0, 50)}...</div>
        </div>
      ),
    },
    {
      title: 'Filtros (Audiencia)',
      key: 'target',
      render: (_, record) => {
        const { target } = record;
        return (
          <Space direction="vertical" size={0}>
            {target?.audienceType === 'new' && <Text type="secondary">- Público: Nuevos (Sin recargas)</Text>}
            {target?.audienceType === 'inactive' && <Text type="secondary">- Público: Inactivos ({target.monthsInactive} meses)</Text>}
            {(!target?.audienceType || target?.audienceType === 'all') && <Text type="secondary">- Público: Todos los usuarios</Text>}
            {target?.country ? <Text type="secondary">- País: {target.country}</Text> : <Text type="secondary">- País: Global (Todos)</Text>}
            {record.promo && <Tag color="purple" style={{ marginTop: 4 }}>Código: {record.promo.code}</Tag>}
          </Space>
        );
      }
    },
    {
      title: 'Estado',
      dataIndex: 'status',
      key: 'status',
      render: (status) => {
        if (status === 'sent') return <Tag color="green">Activa</Tag>;
        if (status === 'finished') return <Tag color="default">Finalizada</Tag>;
        return <Tag color="orange">Borrador</Tag>;
      },
    },
    {
      title: 'Alcance',
      dataIndex: 'sentCount',
      key: 'sentCount',
      render: (count, record) => (
        record.status === 'sent' ? <Text strong>{count} usuarios</Text> : <Text type="secondary">-</Text>
      ),
    },
    {
      title: 'Fecha de Creación',
      dataIndex: 'createdAt',
      key: 'createdAt',
      render: (date) => dayjs(date).format('DD/MM/YYYY HH:mm'),
    },
    {
      title: 'Acciones',
      key: 'actions',
      render: (_, record) => (
        <Space>
          {record.status === 'draft' && (
            <Button type="primary" icon={<SendOutlined />} onClick={() => handleSend(record._id)}>
              Disparar Campaña
            </Button>
          )}
          {record.status === 'sent' && (
            <Button danger onClick={() => handleFinish(record._id)}>
              Finalizar Campaña
            </Button>
          )}
        </Space>
      ),
    },
  ];

  return (
    <div style={{ padding: isDesktop ? 24 : 16, maxWidth: 1200, margin: '0 auto' }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 }}>
        <div style={{ flex: '1 1 200px' }}>
          <Title level={isDesktop ? 2 : 3} style={{ margin: 0 }}><RocketOutlined /> Promociones y Campañas</Title>
          <Text type="secondary">Crea y envía mensajes masivos a segmentos específicos de tu audiencia.</Text>
        </div>
        <Button type="primary" size="large" onClick={() => setIsModalOpen(true)} style={{ width: isDesktop ? 'auto' : '100%' }}>
          + Nueva Campaña
        </Button>
      </div>

      <Card style={{ boxShadow: '0 8px 24px rgba(0,0,0,0.05)', border: 'none', borderRadius: 16 }}>
        {isDesktop ? (
          <Table
            columns={columns}
            dataSource={campaigns}
            rowKey="_id"
            loading={loading}
            pagination={{ pageSize: 10 }}
            scroll={{ x: 800 }}
          />
        ) : (
          <List
            dataSource={campaigns}
            loading={loading}
            pagination={{ pageSize: 10, size: 'small' }}
            renderItem={(r) => (
              <List.Item style={{ padding: '0 0 12px' }}>
                <Card size="small" style={{ width: '100%', borderRadius: 12, border: '1px solid var(--z-border)', backgroundColor: '#fafafa' }} styles={{ body: { padding: '16px' } }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8, alignItems: 'flex-start' }}>
                    <Text strong style={{ fontSize: 14, flex: 1, marginRight: 8 }}>{r.title}</Text>
                    <div>
                      {r.status === 'sent' ? <Tag color="green" style={{ margin: 0 }}>Activa</Tag>
                        : r.status === 'finished' ? <Tag color="default" style={{ margin: 0 }}>Finalizada</Tag>
                        : <Tag color="orange" style={{ margin: 0 }}>Borrador</Tag>}
                    </div>
                  </div>
                  
                  <div style={{ marginBottom: 12 }}>
                    <Space direction="vertical" size={0}>
                      {r.target?.audienceType === 'new' && <Text type="secondary" style={{ fontSize: 12 }}>- Público: Nuevos (Sin recargas)</Text>}
                      {r.target?.audienceType === 'inactive' && <Text type="secondary" style={{ fontSize: 12 }}>- Público: Inactivos ({r.target.monthsInactive} meses)</Text>}
                      {(!r.target?.audienceType || r.target?.audienceType === 'all') && <Text type="secondary" style={{ fontSize: 12 }}>- Público: Todos los usuarios</Text>}
                      {r.target?.country ? <Text type="secondary" style={{ fontSize: 12 }}>- País: {r.target.country}</Text> : <Text type="secondary" style={{ fontSize: 12 }}>- País: Global (Todos)</Text>}
                      {r.promo && <Tag color="purple" style={{ marginTop: 4 }}>Código: {r.promo.code}</Tag>}
                    </Space>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--z-text-muted)', marginBottom: 12 }}>
                    <span>{dayjs(r.createdAt).format('DD/MM/YYYY HH:mm')}</span>
                    {r.status === 'sent' ? <Text strong>{r.sentCount} usuarios</Text> : <span>-</span>}
                  </div>

                  <div style={{ display: 'flex', gap: 8 }}>
                    {r.status === 'draft' && (
                      <Button block type="primary" size="small" icon={<SendOutlined />} onClick={() => handleSend(r._id)}>
                        Disparar
                      </Button>
                    )}
                    {r.status === 'sent' && (
                      <Button block danger size="small" onClick={() => handleFinish(r._id)}>
                        Finalizar
                      </Button>
                    )}
                  </div>
                </Card>
              </List.Item>
            )}
          />
        )}
      </Card>

      <Modal
        title="Crear Nueva Campaña"
        open={isModalOpen}
        onCancel={() => { setIsModalOpen(false); setAudienceCount(null); }}
        onOk={() => form.submit()}
        okText="Guardar Borrador"
        width={700}
      >
        <Form form={form} layout="vertical" onFinish={handleCreate}>
          <Form.Item label="Título de la Promoción (Asunto)" name="title" rules={[{ required: true, message: 'El título es obligatorio' }]}>
            <Input placeholder="Ej. ¡Te extrañamos! Gana S/10 en tu próxima recarga" size="large" />
          </Form.Item>
          
          <Form.Item label="Mensaje" name="message" rules={[{ required: true, message: 'El mensaje es obligatorio' }]}>
            <Input.TextArea rows={4} placeholder="Escribe el mensaje persuasivo que llegará al buzón de los usuarios..." />
          </Form.Item>

          <Card type="inner" title={<><UsergroupAddOutlined /> Filtros de Audiencia</>} style={{ marginBottom: 24 }}>
            <Row gutter={[16, 16]}>
              <Col xs={24} md={8}>
                <Form.Item label="Tipo de Audiencia" name="audienceType" initialValue="all">
                  <Select>
                    <Option value="all">Todos los usuarios</Option>
                    <Option value="new">Solo Nuevos (Sin recargas)</Option>
                    <Option value="inactive">Inactivos (Retargeting)</Option>
                  </Select>
                </Form.Item>
              </Col>
              
              <Form.Item noStyle dependencies={['audienceType']}>
                {({ getFieldValue }) => getFieldValue('audienceType') === 'inactive' && (
                  <Col xs={24} md={8}>
                    <Form.Item label="Meses sin recargar" name="monthsInactive" rules={[{ required: true, message: 'Ingrese los meses' }]}>
                      <InputNumber min={1} style={{ width: '100%' }} placeholder="Ej. 3" />
                    </Form.Item>
                  </Col>
                )}
              </Form.Item>

              <Col xs={24} md={8}>
                <Form.Item label="País (Opcional)" name="country" tooltip="Dejar en blanco para todos los países.">
                  <Select placeholder="Seleccionar país" allowClear>
                    <Option value="Perú">Perú</Option>
                    <Option value="Colombia">Colombia</Option>
                    <Option value="México">México</Option>
                  </Select>
                </Form.Item>
              </Col>
            </Row>

            <div style={{ background: 'rgba(255, 255, 255, 0.04)', border: '1px solid rgba(255,255,255,0.08)', padding: 16, borderRadius: 8, display: 'flex', flexWrap: 'wrap', gap: 12, justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <Text strong>Audiencia Estimada</Text>
                <br />
                <Text type="secondary" style={{ fontSize: 12 }}><InfoCircleOutlined /> Calcula cuántos usuarios recibirán este mensaje</Text>
              </div>
              <Space wrap>
                {audienceCount !== null && (
                  <Tag color="blue" style={{ fontSize: 16, padding: '4px 12px', margin: 0 }}>{audienceCount} usuarios</Tag>
                )}
                <Button onClick={calculateAudience} loading={calculating} style={{ width: isDesktop ? 'auto' : '100%' }}>Calcular</Button>
              </Space>
            </div>
          </Card>

          <Card type="inner" title={<><GiftOutlined /> Incentivo Promocional (Opcional)</>} style={{ marginBottom: 24 }}>
            <Form.Item name="hasPromo" valuePropName="checked">
              <Switch checkedChildren="Con Promo Code" unCheckedChildren="Sin Premio" />
            </Form.Item>
            <Text type="secondary" style={{ display: 'block', marginBottom: 16 }}>Si activas esto, se generará un código promocional que los usuarios podrán canjear.</Text>
            
            <Form.Item noStyle dependencies={['hasPromo']}>
              {({ getFieldValue }) => getFieldValue('hasPromo') && (
                <>
                  <Row gutter={[16, 16]}>
                    <Col xs={24} md={12}>
                      <Form.Item label="Código Promocional" name="promoCode" rules={[{ required: true, message: 'Ingrese el código' }]}>
                        <Input placeholder="Ej. FIESTAS2026" style={{ textTransform: 'uppercase' }} />
                      </Form.Item>
                    </Col>
                    <Col xs={24} md={12}>
                      <Form.Item label="Tipo de Beneficio" name="promoType" initialValue="bonus_recharge">
                        <Select>
                          <Option value="bonus_recharge">Porcentaje Extra en Recargas (%)</Option>
                          <Option value="free_ticket">Boleto Gratis (Cantidad)</Option>
                        </Select>
                      </Form.Item>
                    </Col>
                  </Row>
                  <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
                    <Col xs={24} md={12}>
                      <Form.Item label="Valor (Ej. 15 para 15% o 1 para 1 boleto)" name="promoValue" rules={[{ required: true }]}>
                        <InputNumber min={1} style={{ width: '100%' }} />
                      </Form.Item>
                    </Col>
                    <Col xs={24} md={12}>
                      <Form.Item label="Fecha de Expiración" name="promoExpiresAt" rules={[{ required: true }]}>
                        <DatePicker showTime style={{ width: '100%' }} />
                      </Form.Item>
                    </Col>
                  </Row>
                  <Form.Item label="Términos y Condiciones (Obligatorio)" name="promoTerms" rules={[{ required: true }]}>
                    <Input.TextArea rows={2} placeholder="Ej. Válido solo por 48 horas. Tope máximo de bono S/ 50." />
                  </Form.Item>
                </>
              )}
            </Form.Item>
          </Card>
        </Form>
      </Modal>
    </div>
  );
}
