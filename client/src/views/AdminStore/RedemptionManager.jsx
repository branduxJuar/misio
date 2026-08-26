import React, { useState, useEffect } from 'react';
import {
  Modal, Tag, Button, Input, Upload, Image, Space, Typography, Alert, Steps, Card, Row, Col, Avatar
} from 'antd';
import { 
  CheckOutlined, CopyOutlined, InboxOutlined, UserOutlined, 
  HomeOutlined, PhoneOutlined, MailOutlined, IdcardOutlined, CloseCircleFilled 
} from '@ant-design/icons';
import { api, SERVER_URL, tokenStore } from '../../auth/api';
import { MISIO_COLORS } from '../../theme/misioTheme';

const { Text, Title } = Typography;
const { Dragger } = Upload;

export default function RedemptionManager({ redemptionId, open, onClose, onDelivered, msgApi }) {
  const [detail, setDetail] = useState(null);
  const [code, setCode] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open && redemptionId) {
      api(`/store/redemptions/${redemptionId}`).then((d) => {
        setDetail(d); setCode(d.virtualCode ?? ''); setNote(d.deliveryNote ?? '');
      }).catch(() => {});
    }
  }, [open, redemptionId]);

  if (!detail) return <Modal open={open} onCancel={onClose} footer={null}>Cargando…</Modal>;

  const isVirtual = detail.fulfillment === 'virtual' || detail.itemId?.fulfillment === 'virtual';
  const d = detail.delivery ?? {};
  const done = detail.status === 'delivered';

  const statusToStep = { pending: 0, processing: 1, delivered: 2 };
  const stepToStatus = ['pending', 'processing', 'delivered'];

  const renderFile = (url, i, endpoint) => {
    const isPdf = url.toLowerCase().endsWith('.pdf');
    const content = isPdf ? (
      <a href={`${SERVER_URL}${url}`} target="_blank" rel="noreferrer">
        <div style={{ width: 56, height: 56, background: 'var(--z-bg-layout)', border: '1px solid var(--z-border)', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24 }} title="Abrir PDF">
          📄
        </div>
      </a>
    ) : (
      <Image src={`${SERVER_URL}${url}`} width={56} height={56} style={{ objectFit: 'cover', borderRadius: 8 }} />
    );

    return (
      <div key={i} style={{ position: 'relative', display: 'inline-block' }}>
        {content}
        <CloseCircleFilled
          onClick={() => handleDeleteFile(endpoint, url)}
          style={{ position: 'absolute', top: -6, right: -6, color: '#ff4d4f', fontSize: 16, cursor: 'pointer', background: 'white', borderRadius: '50%', zIndex: 2, boxShadow: '0 2px 4px rgba(0,0,0,0.1)' }}
          title="Eliminar archivo"
        />
      </div>
    );
  };

  const handleDeleteFile = async (endpoint, url) => {
    try {
      await api(`/store/redemptions/${redemptionId}/${endpoint}?url=${encodeURIComponent(url)}`, { method: 'DELETE' });
      setDetail(prev => ({
        ...prev,
        [endpoint]: prev[endpoint].filter(u => u !== url)
      }));
      msgApi.success('Archivo eliminado');
    } catch (err) {
      msgApi.error(err.message || 'Error al eliminar');
    }
  };

  const makeUploadProps = (endpoint, fieldName, successMsg) => ({
    name: 'files',
    multiple: true,
    showUploadList: false,
    customRequest: async ({ file, onSuccess, onError }) => {
      try {
        const fd = new FormData();
        fd.append('files', file);
        const token = tokenStore.get();
        const res = await fetch(`${SERVER_URL}/api/v1/store/redemptions/${redemptionId}/${endpoint}`, {
          method: 'POST', headers: token ? { Authorization: `Bearer ${token}` } : {}, body: fd,
        });
        if (!res.ok) throw new Error('upload');
        const data = await res.json();
        setDetail((prev) => ({ ...prev, [fieldName]: data[fieldName] }));
        msgApi.success(successMsg);
        onSuccess?.(data);
      } catch (e) { msgApi.error('Error al subir'); onError?.(e); }
    },
  });

  const deliver = async () => {
    if (isVirtual && !code.trim()) { msgApi.error('Ingresa el código a entregar'); return; }
    setBusy(true);
    try {
      await api(`/store/redemptions/${redemptionId}/deliver`, {
        method: 'PATCH', body: { virtualCode: code.trim(), deliveryNote: note.trim() },
      });
      msgApi.success(isVirtual
        ? 'Entregado — el código se envió por correo interno, email y push ✓'
        : 'Marcado como entregado — el usuario fue notificado ✓');
      onDelivered?.();
      onClose();
    } catch (err) { msgApi.error(err.message); } finally { setBusy(false); }
  };

  const updateStatus = async (status) => {
    setBusy(true);
    try {
      await api(`/store/redemptions/${redemptionId}/status`, {
        method: 'PATCH', body: { status }
      });
      msgApi.success('Estado actualizado ✓');
      setDetail(prev => ({ ...prev, status }));
      onDelivered?.();
    } catch (e) { msgApi.error(e.message); } finally { setBusy(false); }
  };

  const waLink = d.phone
    ? `https://wa.me/51${String(d.phone).replace(/\D/g, '')}?text=${encodeURIComponent(`Hola ${detail.userId?.name}, tu código de "${detail.itemName}" es: ${code}`)}`
    : null;

  return (
    <Modal open={open} onCancel={onClose} width={800} footer={null} centered
      title={null} styles={{ padding: '24px' }}>
      
      <Row gutter={[16, 16]}>
        {/* ENCABEZADO Y ESTADO */}
        <Col span={24}>
          <Card bordered={false} style={{ background: 'var(--z-bg-elevated)', borderRadius: 16 }}>
            <Row align="middle" justify="space-between" gutter={[16, 16]}>
              <Col>
                <Space size="large" align="center">
                  <Avatar size={64} style={{ background: 'var(--z-primary)', fontSize: 32, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    {detail.itemId?.emoji || '🎁'}
                  </Avatar>
                  <div>
                    <Title level={4} style={{ margin: 0, letterSpacing: '-0.5px' }}>{detail.itemName}</Title>
                    <Text strong style={{ color: MISIO_COLORS.saldoGreen, fontSize: 18 }}>S/ {detail.price}</Text>
                    <Tag color={isVirtual ? 'purple' : 'blue'} style={{ marginLeft: 12, borderRadius: 100 }}>
                      {isVirtual ? '💻 Virtual' : '📦 Físico'}
                    </Tag>
                  </div>
                </Space>
              </Col>
              <Col>
                <div style={{ minWidth: 280 }}>
                  <Steps 
                    size="small"
                    current={statusToStep[detail.status] || 0}
                    onChange={(c) => {
                      if (c === 2 || done || busy) return; // Entregado solo via botón
                      updateStatus(stepToStatus[c]);
                    }}
                    items={[
                      { title: 'Pendiente' },
                      { title: 'Procesando' },
                      { title: 'Entregado', disabled: true }
                    ]}
                  />
                </div>
              </Col>
            </Row>
          </Card>
        </Col>

        {/* DATOS DEL USUARIO Y ENTREGA */}
        <Col xs={24} md={12}>
          <Card title={<><UserOutlined /> Usuario</>} bordered={false} size="small" style={{ height: '100%', borderRadius: 12, border: '1px solid var(--z-border)' }}>
            <Space direction="vertical" style={{ width: '100%' }}>
              <Text><UserOutlined style={{ marginRight: 8, color: MISIO_COLORS.textMuted }} /> <Text strong>{detail.userId?.name}</Text></Text>
              <Text><IdcardOutlined style={{ marginRight: 8, color: MISIO_COLORS.textMuted }} /> DNI: {detail.userId?.dni}</Text>
              <Text><PhoneOutlined style={{ marginRight: 8, color: MISIO_COLORS.textMuted }} /> {detail.userId?.phone}</Text>
              <Text><MailOutlined style={{ marginRight: 8, color: MISIO_COLORS.textMuted }} /> {detail.userId?.email || '—'}</Text>
            </Space>
          </Card>
        </Col>
        <Col xs={24} md={12}>
          <Card title={<><HomeOutlined /> Datos de Entrega</>} bordered={false} size="small" style={{ height: '100%', borderRadius: 12, border: '1px solid var(--z-border)' }}>
            {isVirtual ? (
              <Space direction="vertical" style={{ width: '100%' }}>
                <Text><MailOutlined style={{ marginRight: 8, color: MISIO_COLORS.textMuted }} /> {d.email || detail.userId?.email || '— (usar interno)'}</Text>
                <Text><PhoneOutlined style={{ marginRight: 8, color: MISIO_COLORS.textMuted }} /> {d.phone || detail.userId?.phone || '—'}</Text>
                {d.note && <Alert type="info" message={d.note} style={{ marginTop: 8 }} />}
              </Space>
            ) : (
              <Space direction="vertical" style={{ width: '100%' }}>
                <Text><HomeOutlined style={{ marginRight: 8, color: MISIO_COLORS.textMuted }} /> {d.address || '— (no proporcionada)'}</Text>
                <Text><UserOutlined style={{ marginRight: 8, color: MISIO_COLORS.textMuted }} /> Ref: {d.reference || '—'}</Text>
                <Text><PhoneOutlined style={{ marginRight: 8, color: MISIO_COLORS.textMuted }} /> {d.phone || detail.userId?.phone || '—'}</Text>
                {d.note && <Alert type="info" message={d.note} style={{ marginTop: 8 }} />}
              </Space>
            )}
          </Card>
        </Col>

        {/* EVIDENCIAS Y RECIBOS */}
        <Col xs={24} md={12}>
          <Card bordered={false} size="small" style={{ borderRadius: 12, border: '1px solid var(--z-border)' }} 
            title="Evidencia de entrega (Pública)">
            <Space wrap style={{ marginBottom: 12 }}>
              {(detail.evidence ?? []).map((url, i) => renderFile(url, i, 'evidence'))}
            </Space>
            <Dragger {...makeUploadProps('evidence', 'evidence', 'Evidencia subida 📎')} style={{ padding: '16px 0', borderRadius: 12 }}>
              <p className="ant-upload-drag-icon" style={{ marginBottom: 8 }}><InboxOutlined style={{ color: MISIO_COLORS.primary }} /></p>
              <Text strong>Subir captura o foto</Text>
            </Dragger>
          </Card>
        </Col>
        
        <Col xs={24} md={12}>
          <Card bordered={false} size="small" style={{ borderRadius: 12, border: '1px solid var(--z-border)' }}
            title="Recibo de compra (Interno)">
            <Space wrap style={{ marginBottom: 12 }}>
              {(detail.receipts ?? []).map((url, i) => renderFile(url, i, 'receipts'))}
            </Space>
            <Dragger {...makeUploadProps('receipts', 'receipts', 'Recibo subido 📎')} style={{ padding: '16px 0', borderRadius: 12 }} accept=".pdf,image/*">
              <p className="ant-upload-drag-icon" style={{ marginBottom: 8 }}><InboxOutlined style={{ color: MISIO_COLORS.electricBlue }} /></p>
              <Text strong>Adjuntar recibo (PDF o Foto)</Text>
            </Dragger>
          </Card>
        </Col>

        {/* ZONA DE CÓDIGO (VIRTUAL) Y ACCIONES FINALES */}
        <Col span={24}>
          <Card bordered={false} style={{ borderRadius: 12, background: isVirtual ? '#f8fafc' : 'transparent', border: isVirtual ? '1px dashed #cbd5e1' : 'none' }}>
            {isVirtual && (
              <div style={{ marginBottom: 24 }}>
                <Title level={5} style={{ marginTop: 0 }}>Código a entregar</Title>
                {done && detail.virtualCode ? (
                  <Alert type="success" showIcon message={<span>Entregado: <Text copyable strong style={{ fontSize: 16 }}>{detail.virtualCode}</Text></span>} />
                ) : (
                  <Space direction="vertical" style={{ width: '100%' }}>
                    <Input.TextArea rows={2} placeholder="Pega aquí el código / PIN de la gift card o recarga"
                      value={code} onChange={(e) => setCode(e.target.value)} 
                      style={{ fontSize: 16, borderRadius: 8 }} />
                    <Space wrap>
                      {code && <Button icon={<CopyOutlined />} onClick={() => { navigator.clipboard.writeText(code); msgApi.success('Copiado'); }}>Copiar</Button>}
                      {waLink && <Button href={waLink} target="_blank" style={{ borderColor: '#25D366', color: '#25D366' }}>📲 WhatsApp</Button>}
                    </Space>
                    <Text style={{ fontSize: 12, color: MISIO_COLORS.textMuted }}>
                      El código llegará al usuario por correo interno, email y notificación push.
                    </Text>
                  </Space>
                )}
              </div>
            )}

            {!done && (
              <Row gutter={16} align="middle">
                <Col flex="auto">
                  <Input placeholder="Nota interna de entrega (opcional)" value={note} onChange={(e) => setNote(e.target.value)} size="large" style={{ borderRadius: 8 }} />
                </Col>
                <Col>
                  <Button size="large" onClick={onClose}>Cancelar</Button>
                </Col>
                <Col>
                  <Button size="large" type="primary" icon={<CheckOutlined />} loading={busy} onClick={deliver}
                    style={{ borderRadius: 100, fontWeight: 'bold' }}>
                    {isVirtual ? 'Entregar código' : 'Marcar como entregado'}
                  </Button>
                </Col>
              </Row>
            )}
            
            {done && (
              <Row justify="end">
                <Button size="large" onClick={onClose}>Cerrar</Button>
              </Row>
            )}
          </Card>
        </Col>
      </Row>
    </Modal>
  );
}
