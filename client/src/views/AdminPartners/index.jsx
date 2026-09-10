import React, { useState, useEffect, useCallback } from 'react';
import {
  Table, Button, Space, Modal, Form, Input, InputNumber, Switch, message,
  Upload, Typography, Tag, Card, Row, Col, Statistic, Select, Grid, List,
  Tabs, Alert, Tooltip, Divider, Badge,
} from 'antd';
import {
  PlusOutlined, EditOutlined, UploadOutlined, BankOutlined, TrophyOutlined,
  CheckCircleOutlined, CloseCircleOutlined, ClockCircleOutlined, DollarOutlined,
} from '@ant-design/icons';
import { api, BASE_URL, tokenStore } from '../../auth/api';
import { MISIO_COLORS } from '../../theme/misioTheme';
import dayjs from 'dayjs';

export default function AdminPartners() {
  const [partners, setPartners] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [editingPartner, setEditingPartner] = useState(null);
  const [form] = Form.useForm();
  const [submitLoading, setSubmitLoading] = useState(false);
  const [contractFile, setContractFile] = useState(null);
  const [msgApi, contextHolder] = message.useMessage();
  const screens = Grid.useBreakpoint();
  const isDesktop = screens.md;

  // Payouts state
  const [payouts, setPayouts] = useState([]);
  const [payoutsLoading, setPayoutsLoading] = useState(false);
  const [approvingPayout, setApprovingPayout] = useState(null);
  const [rejectingPayout, setRejectingPayout] = useState(null);
  const [rejectForm] = Form.useForm();
  const [receiptFile, setReceiptFile] = useState(null);
  const [logoFile, setLogoFile] = useState(null);
  const [processingPayout, setProcessingPayout] = useState(false);

  const fetchPartners = useCallback(async () => {
    try {
      setLoading(true);
      const data = await api('/empresas');
      setPartners(data);
    } catch (err) {
      msgApi.error(err.response?.data?.message || err.message || 'Error al cargar empresas');
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchPayouts = useCallback(async () => {
    try {
      setPayoutsLoading(true);
      const data = await api('/empresas/payouts');
      setPayouts(data);
    } catch (err) {
      msgApi.error('Error al cargar retiros');
    } finally {
      setPayoutsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPartners();
    fetchPayouts();
  }, [fetchPartners, fetchPayouts]);

  const showModal = (partner = null) => {
    setEditingPartner(partner);
    if (partner) {
      form.setFieldsValue(partner);
    } else {
      form.resetFields();
      form.setFieldsValue({ feePercentage: 10, trustTier: 1, walletBalance: 0, isPublicSponsor: false });
    }
    setContractFile(null);
    setLogoFile(null);
    setIsModalVisible(true);
  };

  const handleCancel = () => {
    setIsModalVisible(false);
    form.resetFields();
  };

  const onFinish = async (values) => {
    setSubmitLoading(true);
    try {
      let finalValues = { ...values };

      if (contractFile) {
        const formData = new FormData();
        formData.append('file', contractFile);
        
        const res = await fetch(`${BASE_URL}/empresas/upload-contract`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${tokenStore.get()}` },
          body: formData,
        });

        if (!res.ok) throw new Error('Error subiendo el contrato');
        const data = await res.json();
        finalValues.contractDocumentUrl = data.url;
      }

      if (logoFile) {
        const formData = new FormData();
        formData.append('file', logoFile);
        
        const res = await fetch(`${BASE_URL}/empresas/upload-contract`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${tokenStore.get()}` },
          body: formData,
        });

        if (!res.ok) throw new Error('Error subiendo el logo');
        const data = await res.json();
        finalValues.logo = data.url;
      }

      if (editingPartner) {
        await api(`/empresas/${editingPartner._id}`, { method: 'PATCH', body: finalValues });
        msgApi.success('Empresa actualizada correctamente');
      } else {
        await api('/empresas', { method: 'POST', body: finalValues });
        msgApi.success('Empresa registrada correctamente');
      }
      setIsModalVisible(false);
      fetchPartners();
    } catch (err) {
      msgApi.error(err.response?.data?.message || 'Error al guardar la empresa');
    } finally {
      setSubmitLoading(false);
    }
  };

  const approvePayout = async () => {
    setProcessingPayout(true);
    try {
      if (!receiptFile) {
        msgApi.error('Debes adjuntar el comprobante de transferencia para aprobar el retiro.');
        setProcessingPayout(false);
        return;
      }

      const formData = new FormData();
      formData.append('file', receiptFile);

      const res = await fetch(`${BASE_URL}/empresas/payouts/${approvingPayout._id}/approve`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${tokenStore.get()}` },
        body: formData,
      });
      if (!res.ok) throw new Error('Error al aprobar');
      msgApi.success('Retiro aprobado y marcado como completado');
      setApprovingPayout(null);
      setReceiptFile(null);
      fetchPayouts();
      fetchPartners();
    } catch (err) {
      msgApi.error('Error al aprobar el retiro');
    } finally {
      setProcessingPayout(false);
    }
  };

  const rejectPayout = async ({ reason }) => {
    setProcessingPayout(true);
    try {
      await api(`/empresas/payouts/${rejectingPayout._id}/reject`, {
        method: 'POST',
        body: { reason },
      });
      msgApi.success('Retiro rechazado y monto devuelto a la billetera del partner');
      setRejectingPayout(null);
      rejectForm.resetFields();
      fetchPayouts();
      fetchPartners();
    } catch (err) {
      msgApi.error(err.response?.data?.message || 'Error al rechazar');
    } finally {
      setProcessingPayout(false);
    }
  };

  const pendingPayouts = payouts.filter(p => p.status === 'pending').length;

  const STATUS_PAYOUT = {
    pending: <Tag icon={<ClockCircleOutlined />} color="orange">Pendiente</Tag>,
    completed: <Tag icon={<CheckCircleOutlined />} color="success">Completado</Tag>,
    rejected: <Tag icon={<CloseCircleOutlined />} color="error">Rechazado</Tag>,
  };

  const payoutColumns = [
    {
      title: 'Empresa',
      dataIndex: ['partnerId', 'name'],
      render: (v, r) => {
        try {
          return (
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              {r.partnerId?.logo ? (
                <Avatar src={`${window.location.origin}${r.partnerId.logo}`} shape="square" size="large" />
              ) : (
                <Avatar shape="square" size="large" style={{ backgroundColor: MISIO_COLORS.primary }}>
                  {String(r.partnerId?.name || 'X').charAt(0).toUpperCase()}
                </Avatar>
              )}
              <div>
                <div style={{ fontWeight: 600 }}>{r.partnerId?.name ?? '-'}</div>
                <div style={{ fontSize: 11, color: 'gray' }}>{r.partnerId?.legalId}</div>
              </div>
            </div>
          );
        } catch (e) {
          return <Tag color="error">Error</Tag>;
        }
      },
    },
    { title: 'Fecha', dataIndex: 'createdAt', render: v => dayjs(v).format('DD/MM/YY HH:mm') },
    {
      title: 'Monto a Pagar',
      dataIndex: 'amount',
      render: v => <Typography.Text strong style={{ color: MISIO_COLORS.primary }}>S/ {Number(v).toFixed(2)}</Typography.Text>,
    },
    {
      title: 'Comisión Misio',
      dataIndex: ['partnerId', 'feePercentage'],
      render: v => <Tag color="blue">{v ?? 0}%</Tag>,
    },
    { title: 'Estado', dataIndex: 'status', render: v => STATUS_PAYOUT[v] ?? <Tag>{v}</Tag> },
    {
      title: 'Datos Bancarios',
      dataIndex: 'notes',
      render: v => v ? <Typography.Text style={{ fontSize: 12 }}>{v}</Typography.Text> : '-',
    },
    {
      title: 'Comprobante',
      dataIndex: 'receiptUrl',
      render: v => v ? <Button type="link" size="small" href={v} target="_blank">Ver</Button> : '-',
    },
    {
      title: 'Acciones',
      key: 'actions',
      render: (_, r) => r.status === 'pending' ? (
        <Space size="small">
          <Button size="small" type="primary" style={{ background: '#52c41a' }}
            icon={<CheckCircleOutlined />}
            onClick={() => { setApprovingPayout(r); setReceiptFile(null); }}>
            Aprobar
          </Button>
          <Button size="small" danger icon={<CloseCircleOutlined />}
            onClick={() => { setRejectingPayout(r); rejectForm.resetFields(); }}>
            Rechazar
          </Button>
        </Space>
      ) : (
        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
          {dayjs(r.processedAt).format('DD/MM/YY')}
        </Typography.Text>
      ),
    },
  ];

  const partnerColumns = [
    {
      title: 'Empresa',
      dataIndex: 'name',
      key: 'name',
      render: (text, record) => {
        try {
          return (
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              {record.logo ? (
                <Avatar src={`${window.location.origin}${record.logo}`} shape="square" size="large" />
              ) : (
                <Avatar shape="square" size="large" style={{ backgroundColor: MISIO_COLORS.primary }}>
                  {String(text || 'X').charAt(0).toUpperCase()}
                </Avatar>
              )}
              <div>
                <div style={{ fontWeight: 600 }}>{text}</div>
                <div style={{ fontSize: 12, color: 'gray' }}>RUC/DNI: {record.legalId}</div>
              </div>
            </div>
          );
        } catch (e) {
          return <Tag color="error">Error</Tag>;
        }
      },
    },
    {
      title: 'Comisión Misio (%)',
      dataIndex: 'feePercentage',
      key: 'feePercentage',
      render: (val) => <Tag color="blue">{val}%</Tag>,
    },
    {
      title: 'Billetera Empresarial',
      dataIndex: 'walletBalance',
      key: 'walletBalance',
      render: (val) => <span style={{ fontWeight: 'bold', color: MISIO_COLORS.success }}>S/ {Number(val).toFixed(2)}</span>,
    },
    {
      title: 'Nivel',
      dataIndex: 'trustTier',
      key: 'trustTier',
      render: (val) => (
        val === 2 
          ? <Tag color="gold" icon={<TrophyOutlined />}>Verificado</Tag>
          : <Tag color="blue">Nuevo</Tag>
      ),
    },
    {
      title: 'Contrato',
      key: 'contract',
      render: (_, record) => (
        record.contractDocumentUrl ? (
          <Button type="link" href={`${window.location.origin}${record.contractDocumentUrl}`} target="_blank">Ver PDF</Button>
        ) : (
          <Upload
            name="file"
            action={`${BASE_URL}/empresas/upload-contract`}
            headers={{ Authorization: `Bearer ${tokenStore.get()}` }}
            showUploadList={false}
            onChange={async (info) => {
              if (info.file.status === 'done') {
                try {
                  await api(`/empresas/${record._id}`, {
                    method: 'PATCH',
                    body: { contractDocumentUrl: info.file.response.url }
                  });
                  msgApi.success('Contrato adjuntado exitosamente');
                  fetchPartners();
                } catch (err) {
                  msgApi.error('Error al guardar el contrato en la empresa');
                }
              } else if (info.file.status === 'error') {
                msgApi.error('Error al subir el archivo');
              }
            }}
          >
            <Button size="small" type="dashed" icon={<UploadOutlined />}>Adjuntar</Button>
          </Upload>
        )
      )
    },
    {
      title: 'Términos',
      dataIndex: 'termsAcceptedAt',
      key: 'termsAcceptedAt',
      render: (val) => val ? <Tag color="green">Aceptados</Tag> : <Tag color="warning">Pendiente</Tag>
    },
    {
      title: 'Acciones',
      key: 'actions',
      render: (_, record) => (
        <Space size="middle">
          <Button type="primary" icon={<EditOutlined />} onClick={() => showModal(record)}>
            Editar
          </Button>
        </Space>
      ),
    },
  ];

  return (
    <div style={{ padding: 'max(16px, 2vw)', maxWidth: 1200, margin: '0 auto' }}>
      {contextHolder}
      <Row justify="space-between" align="middle" style={{ marginBottom: 24 }} gutter={[16, 16]}>
        <Col xs={24} sm={16}>
          <Typography.Title level={2} style={{ margin: 0 }}>
            <BankOutlined style={{ marginRight: 12, color: MISIO_COLORS.primary }} />
            Empresas B2B
          </Typography.Title>
          <Typography.Text type="secondary">
            Gestión de partners, comisiones por venta y billeteras empresariales.
          </Typography.Text>
        </Col>
        <Col xs={24} sm={8} style={{ textAlign: 'right' }}>
          <Button type="primary" icon={<PlusOutlined />} onClick={() => showModal()} size="large" style={{ width: '100%' }}>
            Registrar Empresa
          </Button>
        </Col>
      </Row>

      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        <Col xs={24} sm={12} md={8}>
          <Card>
            <Statistic 
              title="Total Empresas" 
              value={partners.length} 
              prefix={<BankOutlined />} 
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} md={8}>
          <Card>
            <Statistic 
              title="Saldo Total (Billeteras)" 
              value={partners.reduce((acc, p) => acc + (p.walletBalance || 0), 0)} 
              precision={2}
              prefix="S/"
              valueStyle={{ color: MISIO_COLORS.success }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} md={8}>
          <Card>
            <Statistic
              title="Retiros Pendientes"
              value={pendingPayouts}
              prefix={<DollarOutlined />}
              valueStyle={{ color: pendingPayouts > 0 ? '#fa8c16' : undefined }}
            />
            {pendingPayouts > 0 && <Typography.Text type="warning" style={{ fontSize: 12 }}>Requieren atención</Typography.Text>}
          </Card>
        </Col>
      </Row>

      <Tabs
        defaultActiveKey="empresas"
        items={[
          {
            key: 'empresas',
            label: 'Empresas',
            children: (
              <Card styles={{ body: { padding: isDesktop ? 24 : 8 } }}>
                {isDesktop ? (
                  <Table 
                    columns={partnerColumns} 
                    dataSource={partners} 
                    rowKey="_id" 
                    loading={loading}
                    scroll={{ x: 900 }}
                    pagination={{ responsive: true }}
                  />
                ) : (
                  <List
                    dataSource={partners}
                    loading={loading}
                    renderItem={(partner) => (
                      <List.Item style={{ padding: '0 0 12px' }}>
                        <Card
                          size="small"
                          style={{ width: '100%', borderRadius: 12, border: '1px solid var(--z-border)' }}
                          styles={{ body: { padding: '16px' } }}
                        >
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
                            <div>
                              <Typography.Text strong style={{ fontSize: 16 }}>{partner.name}</Typography.Text>
                              <div style={{ color: 'gray', fontSize: 13 }}>ID: {partner.legalId}</div>
                            </div>
                            {partner.termsAcceptedAt ? <Tag color="green">Aceptados</Tag> : <Tag color="warning">Pendiente</Tag>}
                          </div>
                          <div style={{ marginBottom: 12, fontSize: 14 }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                              <span style={{ color: 'gray' }}>Comisión Misio:</span>
                              <strong>{partner.feePercentage}%</strong>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                              <span style={{ color: 'gray' }}>Billetera:</span>
                              <strong style={{ color: MISIO_COLORS.success }}>S/{partner.walletBalance?.toFixed(2) || '0.00'}</strong>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                              <span style={{ color: 'gray' }}>Nivel:</span>
                              {partner.trustTier === 2 ? <Tag color="gold">Verificado</Tag> : <Tag color="blue">Nuevo</Tag>}
                            </div>
                          </div>
                          <Button type="primary" block icon={<EditOutlined />} onClick={() => showModal(partner)}>
                            Editar Empresa
                          </Button>
                        </Card>
                      </List.Item>
                    )}
                  />
                )}
              </Card>
            ),
          },
          {
            key: 'retiros',
            label: (
              <Badge count={pendingPayouts} size="small" offset={[4, -4]}>
                Retiros
              </Badge>
            ),
            children: (
              <Card>
                {pendingPayouts > 0 && (
                  <Alert
                    type="warning"
                    showIcon
                    message={`Hay ${pendingPayouts} solicitud(es) de retiro pendiente(s) de revisión.`}
                    style={{ marginBottom: 16 }}
                  />
                )}
                <Table
                  dataSource={payouts}
                  columns={payoutColumns}
                  rowKey="_id"
                  loading={payoutsLoading}
                  pagination={{ pageSize: 10 }}
                  scroll={{ x: 900 }}
                  size="middle"
                />
              </Card>
            ),
          },
        ]}
      />

      {/* ── Modal Editar/Crear Empresa ─────────────────── */}
      <Modal
        title={editingPartner ? "Editar Empresa" : "Registrar Empresa"}
        open={isModalVisible}
        onCancel={handleCancel}
        footer={null}
        destroyOnHidden
        forceRender
        width={800}
      >
        <Form
          form={form}
          layout="vertical"
          onFinish={onFinish}
        >
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item
                name="name"
                label="Nombre de la Empresa"
                rules={[{ required: true, message: 'Ingrese el nombre' }]}
              >
                <Input placeholder="Ej. Tiendas EFE" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item
                name="legalId"
                label="RUC o DNI"
                rules={[{ required: true, message: 'Ingrese RUC/DNI' }]}
              >
                <Input placeholder="Ej. 20123456789" />
              </Form.Item>
            </Col>
          </Row>

          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="contactNumber" label="Número de Contacto">
                <Input placeholder="Ej. 999 999 999" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="address" label="Dirección">
                <Input placeholder="Ej. Av. Javier Prado 123" />
              </Form.Item>
            </Col>
          </Row>

          <Row gutter={16}>
            <Col span={24}>
              <Form.Item name="bankDetails" label="Datos Bancarios (Cuenta, CCI, Banco)">
                <Input.TextArea rows={2} placeholder="Ej. BCP Soles: 191-xxxx / CCI: 002191..." />
              </Form.Item>
            </Col>
          </Row>

          <Row gutter={16}>
            <Col span={12}>
              <Form.Item
                name="feePercentage"
                label="Comisión Misio (%)"
                rules={[{ required: true }]}
                tooltip="Porcentaje que Misio cobra por cada ticket vendido."
              >
                <InputNumber min={0} max={100} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item
                name="trustTier"
                label="Nivel de Confianza"
              >
                <Select>
                  <Select.Option value={1}>1 - Nuevo</Select.Option>
                  <Select.Option value={2}>2 - Verificado</Select.Option>
                </Select>
              </Form.Item>
            </Col>
          </Row>
          
          {editingPartner && (
            <Form.Item
              name="walletBalance"
              label="Ajustar Billetera Empresarial (S/)"
              tooltip="Editar el saldo manualmente (uso administrativo avanzado)."
            >
              <InputNumber style={{ width: '100%' }} />
            </Form.Item>
          )}

          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="logoUrl" hidden>
                <Input />
              </Form.Item>
              <Form.Item label="Logo de la Empresa (Imagen)">
                <Upload
                  name="logo"
                  beforeUpload={(file) => {
                    setLogoFile(file);
                    return false;
                  }}
                  onRemove={() => setLogoFile(null)}
                  fileList={logoFile ? [logoFile] : []}
                  maxCount={1}
                  accept="image/*"
                  style={{ width: '100%' }}
                >
                  <Button block icon={<UploadOutlined />}>Seleccionar Logo</Button>
                </Upload>
              </Form.Item>
            </Col>

            <Col span={12}>
              <Form.Item name="contractDocumentUrl" hidden>
                <Input />
              </Form.Item>
              <Form.Item label="Contrato Firmado (PDF o Imagen)">
                <Upload
                  name="file"
                  beforeUpload={(file) => {
                    setContractFile(file);
                    return false;
                  }}
                  onRemove={() => setContractFile(null)}
                  fileList={contractFile ? [contractFile] : []}
                  maxCount={1}
                  style={{ width: '100%' }}
                >
                  <Button block icon={<UploadOutlined />}>Seleccionar Archivo</Button>
                </Upload>
              </Form.Item>
            </Col>
          </Row>

          <Form.Item
            name="description"
            label="Descripción (Opcional)"
          >
            <Input.TextArea rows={2} />
          </Form.Item>

          <Form.Item
            name="isPublicSponsor"
            valuePropName="checked"
          >
            <Switch checkedChildren="Patrocinador Público" unCheckedChildren="Oculto" />
          </Form.Item>

          <Form.Item>
            <Space style={{ width: '100%', justifyContent: 'flex-end' }}>
              <Button onClick={handleCancel}>Cancelar</Button>
              <Button type="primary" htmlType="submit" loading={submitLoading}>
                Guardar Empresa
              </Button>
            </Space>
          </Form.Item>
        </Form>
      </Modal>

      {/* ── Modal Aprobar Retiro ─────────────────── */}
      <Modal
        open={!!approvingPayout}
        onCancel={() => setApprovingPayout(null)}
        title="Aprobar Retiro"
        onOk={approvePayout}
        confirmLoading={processingPayout}
        okButtonProps={{ style: { background: '#52c41a' } }}
        okText="Confirmar y Aprobar"
      >
        {approvingPayout && (
          <>
            <Alert
              type="success"
              showIcon
              message={`Aprobando retiro de S/ ${Number(approvingPayout.amount).toFixed(2)} para ${approvingPayout.partnerId?.name}`}
              style={{ marginBottom: 16 }}
            />
            {approvingPayout.notes && (
              <div style={{ marginBottom: 16, padding: 12, background: '#f8fafc', borderRadius: 8 }}>
                <Typography.Text type="secondary" style={{ display: 'block', fontSize: 12, marginBottom: 4 }}>Notas del Partner al retirar:</Typography.Text>
                <Typography.Text>{approvingPayout.notes}</Typography.Text>
              </div>
            )}
            
            <div style={{ marginBottom: 16, padding: 12, background: '#fffbeb', borderRadius: 8, border: '1px solid #fcd34d' }}>
              <Typography.Text type="secondary" style={{ display: 'block', fontSize: 12, marginBottom: 4 }}>💳 Datos Bancarios Registrados:</Typography.Text>
              <Typography.Text strong style={{ display: 'block', whiteSpace: 'pre-wrap' }}>
                {approvingPayout.partnerId?.bankDetails || 'No se registraron datos bancarios en el perfil de esta empresa.'}
              </Typography.Text>
            </div>
            <Form.Item label="Subir comprobante de transferencia (OBLIGATORIO)" required>
              <Upload
                beforeUpload={(file) => { setReceiptFile(file); return false; }}
                onRemove={() => setReceiptFile(null)}
                fileList={receiptFile ? [receiptFile] : []}
                maxCount={1}
                accept="image/*,.pdf"
              >
                <Button icon={<UploadOutlined />}>Seleccionar Comprobante</Button>
              </Upload>
            </Form.Item>
          </>
        )}
      </Modal>

      {/* ── Modal Rechazar Retiro ─────────────────── */}
      <Modal
        open={!!rejectingPayout}
        onCancel={() => setRejectingPayout(null)}
        title="Rechazar Retiro"
        onOk={() => rejectForm.submit()}
        confirmLoading={processingPayout}
        okButtonProps={{ danger: true }}
        okText="Rechazar y devolver saldo"
      >
        {rejectingPayout && (
          <Alert
            type="error"
            showIcon
            message={`El monto de S/ ${Number(rejectingPayout.amount).toFixed(2)} se devolverá automáticamente a la billetera de ${rejectingPayout.partnerId?.name}.`}
            style={{ marginBottom: 16 }}
          />
        )}
        <Form form={rejectForm} layout="vertical" onFinish={rejectPayout}>
          <Form.Item
            name="reason"
            label="Motivo del rechazo"
            rules={[{ required: true, min: 5, message: 'Ingresa el motivo (mín. 5 caracteres)' }]}
          >
            <Input.TextArea rows={3} placeholder="Ej. Datos bancarios incorrectos, cuenta no verificada..." />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
