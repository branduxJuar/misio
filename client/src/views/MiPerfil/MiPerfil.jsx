import React, { useEffect, useState } from 'react';
import {
  Card, Col, Row, Typography, Form, Input, Button, message, Upload, Avatar,
  Tag, List, Space, Alert, Tooltip, Tabs,
} from 'antd';
import {
  UserOutlined, CameraOutlined, SaveOutlined, EnvironmentOutlined,
  FileTextOutlined, EyeOutlined, SafetyCertificateOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import { MISIO_COLORS } from '../../theme/misioTheme';
import { useAuth } from '../../auth/AuthContext';
import { useApiOrMock } from '../../hooks/useApiOrMock';
import { api, apiUpload, SERVER_URL } from '../../auth/api';
import AutocontrolSection from './AutocontrolSection';

const { Title, Text } = Typography;

const STATUS_TAG = {
  pending: <Tag color="warning">En verificación</Tag>,
  completed: <Tag color="success">Confirmada</Tag>,
  failed: <Tag color="error">Rechazada</Tag>,
};

/**
 * 👤 MI PERFIL (/perfil) — el usuario completa lo que falta:
 * foto, correo, DIRECCIÓN DE ENVÍO (clave para despachar premios y
 * compras) y contacto adicional. Además: sus RECIBOS de recarga — cada
 * depósito con su comprobante (imagen/PDF), subible por él o por el
 * personal.
 */
export default function MiPerfil() {
  const { user, refreshUser } = useAuth();
  const [msgApi, contextHolder] = message.useMessage();
  const { data: profile, demo, refresh } = useApiOrMock('/users/me', user ?? {});
  const { data: txs, refresh: refreshTxs } = useApiOrMock('/transactions/mine', []);

  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState('datos');
  const [form] = Form.useForm();

  const deposits = txs.filter((t) => t.type === 'deposit_yape');

  useEffect(() => {
    form.setFieldsValue({
      email: profile.email,
      phone: profile.phone,
      altContact: profile.altContact,
      line1: profile.address?.line1,
      city: profile.address?.city,
      region: profile.address?.region,
      reference: profile.address?.reference,
    });
  }, [profile]); // eslint-disable-line react-hooks/exhaustive-deps

  const save = async (v) => {
    if (demo) return msgApi.info('Modo demo: conecta el backend.');
    setSaving(true);
    try {
      await api('/users/me', {
        method: 'PATCH',
        body: {
          email: v.email,
          phone: v.phone,
          altContact: v.altContact,
          address: { line1: v.line1, city: v.city, region: v.region, reference: v.reference },
        },
      });
      msgApi.success('Perfil actualizado ✓ — con tu dirección ya podemos enviarte lo que ganes.');
      refresh();
      refreshUser?.();
    } catch (err) { msgApi.error(err.message); } finally { setSaving(false); }
  };

  const avatarUploader = {
    showUploadList: false,
    accept: '.jpg,.jpeg,.png,.webp',
    customRequest: async ({ file, onSuccess, onError }) => {
      if (demo) return onError(new Error('demo'));
      try {
        await apiUpload('/users/me/avatar', file);
        msgApi.success('Foto actualizada 📸');
        onSuccess('ok');
        refresh();
        refreshUser?.();
      } catch (err) { msgApi.error(err.message); onError(err); }
    },
  };

  const tabOptions = [
    {
      key: 'datos',
      label: 'Mis Datos',
      icon: <UserOutlined style={{ fontSize: 16 }} />,
    },
    {
      key: 'recibos',
      label: 'Mis Recibos',
      icon: <FileTextOutlined style={{ fontSize: 16 }} />,
      badge: deposits.length > 0 ? deposits.length : null,
    },
    {
      key: 'autocontrol',
      label: 'Autocontrol y Límites',
      icon: <SafetyCertificateOutlined style={{ fontSize: 16 }} />,
      activeStatus: profile?.autocontrol?.option && profile.autocontrol.option !== 'none',
    },
  ];

  return (
    <div>
      {contextHolder}
      <Title level={3} style={{ color: '#0f172a', fontWeight: 800, marginBottom: 16 }}>
        👤 Mi Perfil
      </Title>
      
      {demo && (
        <Alert type="info" showIcon style={{ marginBottom: 20, borderRadius: 12 }}
          message="Modo demo (backend no conectado)." />
      )}

      {/* ── ESTILOS UX/UI PARA PESTAÑAS REALES Y COMPACTAS ──────────────── */}
      <style>{`
        .misio-tabs-container {
          display: flex;
          gap: 6px;
          border-bottom: 2px solid #e2e8f0;
          margin-bottom: 24px;
          overflow-x: auto;
          scrollbar-width: none;
        }
        .misio-tabs-container::-webkit-scrollbar {
          display: none;
        }
        .misio-real-tab {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          padding: 10px 22px;
          cursor: pointer;
          border-radius: 10px 10px 0 0;
          margin-bottom: -2px;
          transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
          user-select: none;
          white-space: nowrap;
          font-size: 14px;
        }
        .misio-real-tab.active {
          background: #ecfdf5;
          border-top: 1.5px solid #6ee7b7;
          border-left: 1.5px solid #6ee7b7;
          border-right: 1.5px solid #6ee7b7;
          border-bottom: 2.5px solid #047857;
          color: #047857;
          font-weight: 700;
        }
        .misio-real-tab.inactive {
          background: transparent;
          border-top: 1.5px solid transparent;
          border-left: 1.5px solid transparent;
          border-right: 1.5px solid transparent;
          border-bottom: 2.5px solid transparent;
          color: #64748b;
          font-weight: 500;
        }
        .misio-real-tab.inactive:hover {
          background: #f8fafc;
          color: #1e293b;
          border-top-color: #e2e8f0;
          border-left-color: #e2e8f0;
          border-right-color: #e2e8f0;
        }
        .tab-badge {
          padding: 1px 8px;
          border-radius: 12px;
          font-size: 11px;
          font-weight: 700;
          transition: all 0.2s ease;
        }
        .misio-real-tab.active .tab-badge {
          background: #047857;
          color: #ffffff;
        }
        .misio-real-tab.inactive .tab-badge {
          background: #e2e8f0;
          color: #475569;
        }
        .tab-content-fade {
          animation: misioTabFadeIn 0.3s cubic-bezier(0.4, 0, 0.2, 1);
        }
        @keyframes misioTabFadeIn {
          0% { opacity: 0; transform: translateY(6px); }
          100% { opacity: 1; transform: translateY(0); }
        }
      `}</style>

      {/* ── NAVEGACIÓN DE PESTAÑAS (ESTILO TABS CONECTADOS A LÍNEA BASE) ───── */}
      <div className="misio-tabs-container">
        {tabOptions.map((item) => {
          const isActive = activeTab === item.key;
          return (
            <div
              key={item.key}
              className={`misio-real-tab ${isActive ? 'active' : 'inactive'}`}
              onClick={() => setActiveTab(item.key)}
            >
              <span style={{ fontSize: '16px', display: 'flex', alignItems: 'center' }}>
                {item.icon}
              </span>
              <span>{item.label}</span>
              
              {item.badge !== null && item.badge !== undefined && (
                <span className="tab-badge">
                  {item.badge}
                </span>
              )}

              {item.activeStatus && (
                <span style={{
                  padding: '2px 8px',
                  borderRadius: '12px',
                  fontSize: '11px',
                  fontWeight: 700,
                  background: '#dcfce7',
                  color: '#15803d',
                  border: '1px solid #86efac',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '4px'
                }}>
                  ● Activo
                </span>
              )}
            </div>
          );
        })}
      </div>

      {/* ── CONTENIDO DE LA PESTAÑA ACTIVA ───────────────────────────── */}
      <div className="tab-content-fade" key={activeTab}>
        {activeTab === 'datos' && (
          <Row gutter={[20, 20]}>
            {/* ── Foto + identidad ── */}
            <Col xs={24} md={8}>
              <Card style={{ textAlign: 'center', borderRadius: 16, border: '1px solid #e2e8f0', boxShadow: '0 4px 15px rgba(0, 0, 0, 0.02)', background: '#ffffff' }}>
                <Avatar
                  size={115}
                  src={profile.avatarUrl ? `${SERVER_URL}${profile.avatarUrl}` : undefined}
                  icon={<UserOutlined />}
                  style={{ background: MISIO_COLORS.primary, marginBottom: 16, boxShadow: '0 4px 14px rgba(13, 148, 136, 0.25)' }}
                />
                <br />
                <Upload {...avatarUploader}>
                  <Button icon={<CameraOutlined />} size="medium" style={{ borderRadius: 8, fontWeight: 500 }}>
                    Cambiar foto
                  </Button>
                </Upload>
                <Title level={4} style={{ marginTop: 16, marginBottom: 4, fontWeight: 700, color: '#0f172a' }}>
                  {profile.name || 'Usuario'}
                </Title>
                <Text style={{ color: MISIO_COLORS.textMuted, fontSize: 13, fontWeight: 500 }}>
                  DNI {profile.dni || '—'}
                </Text>
                <br />
                {profile.emailVerifiedAt
                  ? <Tag color="success" style={{ marginTop: 14, padding: '4px 14px', borderRadius: 20, fontWeight: 600, fontSize: 12 }}>✉️ Correo verificado</Tag>
                  : profile.email
                    ? <Tag color="warning" style={{ marginTop: 14, padding: '4px 14px', borderRadius: 20, fontWeight: 600, fontSize: 12 }}>Correo sin verificar</Tag>
                    : null}
              </Card>
            </Col>

            {/* ── Datos + dirección de envío ── */}
            <Col xs={24} md={16}>
              <Card 
                title={
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: 17, fontWeight: 700, color: '#0f172a' }}>
                    <div style={{ width: 36, height: 36, borderRadius: 10, background: '#ecfdf5', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#047857', fontSize: 18 }}>
                      <EnvironmentOutlined />
                    </div>
                    <span>Mis datos y dirección de envío</span>
                  </div>
                }
                style={{ borderRadius: 16, border: '1px solid #e2e8f0', boxShadow: '0 4px 15px rgba(0, 0, 0, 0.02)', background: '#ffffff' }}
                styles={{ header: { padding: '18px 24px', borderBottom: '1px solid #f1f5f9' }, body: { padding: '24px' } }}
              >
                <Form form={form} layout="vertical" onFinish={save} requiredMark={false}>
                  <Row gutter={16}>
                    <Col xs={24} sm={12}>
                      <Form.Item name="email" label={<Text strong style={{ color: '#334155' }}>Correo</Text>}
                        rules={[{ type: 'email', message: 'Correo inválido' }]}>
                        <Input size="large" placeholder="tucorreo@gmail.com" style={{ borderRadius: 8 }} />
                      </Form.Item>
                    </Col>
                    <Col xs={24} sm={6}>
                      <Form.Item name="phone" label={<Text strong style={{ color: '#334155' }}>Celular</Text>}
                        rules={[{ pattern: /^9\d{8}$/, message: '9 dígitos' }]}>
                        <Input size="large" maxLength={9} style={{ borderRadius: 8 }} />
                      </Form.Item>
                    </Col>
                    <Col xs={24} sm={6}>
                      <Form.Item name="altContact" label={<Text strong style={{ color: '#334155' }}>WhatsApp / otro</Text>}>
                        <Input size="large" placeholder="Opcional" style={{ borderRadius: 8 }} />
                      </Form.Item>
                    </Col>
                  </Row>
                  <Form.Item name="line1" label={<Text strong style={{ color: '#334155' }}>Dirección (calle / Mz. / Lote)</Text>}>
                    <Input size="large" placeholder="Av. Tumbes Norte 245, Dpto 3" style={{ borderRadius: 8 }} />
                  </Form.Item>
                  <Row gutter={16}>
                    <Col xs={12}>
                      <Form.Item name="city" label={<Text strong style={{ color: '#334155' }}>Ciudad / Distrito</Text>}>
                        <Input size="large" placeholder="Tumbes" style={{ borderRadius: 8 }} />
                      </Form.Item>
                    </Col>
                    <Col xs={12}>
                      <Form.Item name="region" label={<Text strong style={{ color: '#334155' }}>Región</Text>}>
                        <Input size="large" placeholder="Tumbes" style={{ borderRadius: 8 }} />
                      </Form.Item>
                    </Col>
                  </Row>
                  <Form.Item name="reference" label={<Text strong style={{ color: '#334155' }}>Referencia para el courier</Text>}>
                    <Input size="large" placeholder="Frente al parque, portón negro" style={{ borderRadius: 8 }} />
                  </Form.Item>
                  <Button 
                    type="primary" 
                    size="large"
                    htmlType="submit" 
                    icon={<SaveOutlined />} 
                    loading={saving} 
                    block
                    style={{ background: '#047857', fontWeight: 600, borderRadius: 8, height: 46, marginTop: 8 }}
                  >
                    Guardar mis datos
                  </Button>
                </Form>
              </Card>
            </Col>
          </Row>
        )}

        {activeTab === 'recibos' && (
          <Card
            title={
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: 17, fontWeight: 700, color: '#0f172a' }}>
                <div style={{ width: 36, height: 36, borderRadius: 10, background: '#ecfdf5', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#047857', fontSize: 18 }}>
                  <FileTextOutlined />
                </div>
                <span>Mis recargas y recibos emitidos</span>
              </div>
            }
            style={{ borderRadius: 16, border: '1px solid #e2e8f0', boxShadow: '0 4px 15px rgba(0, 0, 0, 0.02)', background: '#ffffff' }}
            styles={{ header: { padding: '18px 24px', borderBottom: '1px solid #f1f5f9' }, body: { padding: '16px 24px' } }}
            extra={
              <span style={{ background: '#f8fafc', color: '#64748b', border: '1px solid #e2e8f0', padding: '5px 14px', borderRadius: '20px', fontSize: 12, fontWeight: 600 }}>
                Comprobantes oficiales Misio
              </span>
            }
          >
            <List
              dataSource={deposits}
              locale={{ emptyText: <div style={{ padding: '30px 0', color: '#94a3b8' }}>Aún no tienes recargas registradas en tu historial.</div> }}
              renderItem={(tx) => (
                <List.Item
                  style={{ padding: '16px 8px', borderBottom: '1px solid #f1f5f9', transition: 'all 0.2s', borderRadius: 8 }}
                  actions={[
                    tx.meta?.receiptUrl ? (
                      <Button key="ver" type="primary" size="small" icon={<EyeOutlined />}
                        style={{ background: '#047857', borderRadius: 6, fontWeight: 600, height: 32, padding: '0 14px' }}
                        href={`${SERVER_URL}${tx.meta.receiptUrl}`} target="_blank">
                        Ver recibo
                      </Button>
                    ) : (
                      <Tooltip key="pendiente"
                        title="Tu recibo se adjuntará cuando el equipo confirme tu recarga">
                        <span style={{ fontSize: 12, color: '#64748b', background: '#f1f5f9', padding: '5px 12px', borderRadius: 14, fontWeight: 500 }}>
                          ⏳ Recibo pendiente
                        </span>
                      </Tooltip>
                    ),
                  ]}
                >
                  <List.Item.Meta
                    title={
                      <Space wrap size={10}>
                        <Text strong style={{ color: '#047857', fontSize: 16 }}>
                          + S/ {Number(tx.amount).toFixed(2)}
                        </Text>
                        {STATUS_TAG[tx.status]}
                        {tx.meta?.methodName && <Tag color="green" style={{ borderRadius: 12, fontWeight: 600 }}>{tx.meta.methodName}</Tag>}
                        {tx.meta?.operationNumber && (
                          <Text code style={{ fontSize: 12, borderRadius: 6, color: '#475569' }}>Op: {tx.meta.operationNumber}</Text>
                        )}
                      </Space>
                    }
                    description={
                      <Text style={{ fontSize: 13, color: '#64748b', marginTop: 4, display: 'block' }}>
                        📅 Registrada el {dayjs(tx.createdAt).format('DD/MM/YYYY')} a las {dayjs(tx.createdAt).format('hh:mm A')}
                      </Text>
                    }
                  />
                </List.Item>
              )}
            />
          </Card>
        )}

        {activeTab === 'autocontrol' && (
          <div>
            <AutocontrolSection 
              profile={profile} 
              demo={demo} 
              refresh={refresh} 
              refreshUser={refreshUser} 
            />
          </div>
        )}
      </div>
    </div>
  );
}
