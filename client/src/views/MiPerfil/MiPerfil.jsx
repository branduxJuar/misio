import React, { useEffect, useState } from 'react';
import {
  Card, Col, Row, Typography, Form, Input, Button, message, Upload, Avatar,
  Tag, List, Space, Alert, Tooltip, Tabs, Grid, Select,
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
import PosPinSection from './PosPinSection';

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

  const screens = Grid.useBreakpoint();
  const isMobile = !screens.md;

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

  if (['admin', 'operator', 'seller'].includes(user?.role)) {
    tabOptions.push({
      key: 'pos',
      label: 'Configuración POS',
      icon: <SafetyCertificateOutlined style={{ fontSize: 16 }} />,
    });
  }

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
      {/* ── NAVEGACIÓN DE PESTAÑAS ───────────── */}
      {isMobile ? (
        <div style={{ marginBottom: 24 }}>
          <Select
            value={activeTab}
            onChange={setActiveTab}
            style={{ width: '100%', height: 48 }}
            size="large"
            options={tabOptions.map(t => ({
              value: t.key,
              label: (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span>{t.icon}</span>
                  <span style={{ fontWeight: 600 }}>{t.label}</span>
                  {t.badge && (
                    <Tag color="error" style={{ borderRadius: 10, margin: 0, marginLeft: 'auto' }}>
                      {t.badge}
                    </Tag>
                  )}
                  {t.activeStatus && (
                    <Tag color="processing" style={{ borderRadius: 10, margin: 0, marginLeft: 'auto' }}>
                      Activo
                    </Tag>
                  )}
                </div>
              )
            }))}
          />
        </div>
      ) : (
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
      )}

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
                    <Col xs={24} md={12}>
                    <Form.Item name="addressLine1" label="Dirección exacta">
                      <Input size="large" placeholder="Av. Principal 245, Dpto 3" style={{ borderRadius: 8 }} />
                    </Form.Item>
                  </Col>
                  <Col xs={24} md={12}>
                    <Form.Item name="addressLine2" label="Referencia (Opcional)">
                      <Input size="large" placeholder="Frente al parque" style={{ borderRadius: 8 }} />
                    </Form.Item>
                  </Col>
                  <Col xs={12} md={8}>
                    <Form.Item name="city" label="Ciudad / Distrito">
                      <Input size="large" placeholder="Lima" style={{ borderRadius: 8 }} />
                    </Form.Item>
                  </Col>
                  <Col xs={12} md={8}>
                    <Form.Item name="state" label="Departamento">
                      <Input size="large" placeholder="Lima" style={{ borderRadius: 8 }} />
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
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: 17, fontWeight: 700, color: '#0f172a' }}>
                  <div style={{ width: 36, height: 36, borderRadius: 10, background: '#ecfdf5', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#047857', fontSize: 18 }}>
                    <FileTextOutlined />
                  </div>
                  <span>Mis recargas y recibos emitidos</span>
                </div>
                <span style={{ background: '#f8fafc', color: '#64748b', border: '1px solid #e2e8f0', padding: '5px 14px', borderRadius: '20px', fontSize: 12, fontWeight: 600 }}>
                  Comprobantes oficiales Misio
                </span>
              </div>
            }
            style={{ borderRadius: 16, border: '1px solid #e2e8f0', boxShadow: '0 4px 15px rgba(0, 0, 0, 0.02)', background: '#ffffff' }}
            styles={{ header: { padding: '18px 24px', borderBottom: '1px solid #f1f5f9' }, body: { padding: '16px 24px' } }}
          >
            <List
              dataSource={deposits}
              locale={{ emptyText: <div style={{ padding: '30px 0', color: '#94a3b8' }}>Aún no tienes recargas registradas en tu historial.</div> }}
              renderItem={(tx) => (
                <List.Item style={{ padding: '0 0 16px', border: 'none' }}>
                  <Card size="small" style={{ width: '100%', borderRadius: 12, border: '1px solid #f1f5f9', boxShadow: '0 2px 10px rgba(0,0,0,0.02)' }} styles={{ body: { padding: '16px' } }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
                      <div>
                        <Text strong style={{ color: '#047857', fontSize: 18, display: 'block' }}>
                          + S/ {Number(tx.amount).toFixed(2)}
                        </Text>
                        <Text style={{ fontSize: 12, color: '#64748b' }}>
                          📅 {dayjs(tx.createdAt).format('DD/MM/YYYY')} a las {dayjs(tx.createdAt).format('hh:mm A')}
                        </Text>
                      </div>
                      {STATUS_TAG[tx.status]}
                    </div>
                    
                    <div style={{ background: '#f8fafc', padding: 12, borderRadius: 8, marginBottom: 12, display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                      {tx.meta?.methodName && <Tag color="green" style={{ borderRadius: 8, fontWeight: 600, margin: 0 }}>{tx.meta.methodName}</Tag>}
                      {tx.meta?.operationNumber && (
                        <Text code style={{ fontSize: 12, borderRadius: 6, color: '#475569', margin: 0 }}>Op: {tx.meta.operationNumber}</Text>
                      )}
                    </div>
                    
                    <div style={{ textAlign: 'right' }}>
                      {tx.meta?.receiptUrl ? (
                        <Button type="primary" icon={<EyeOutlined />}
                          style={{ background: '#047857', borderRadius: 8, fontWeight: 600, width: isMobile ? '100%' : 'auto' }}
                          href={`${SERVER_URL}${tx.meta.receiptUrl}`} target="_blank">
                          Ver recibo oficial
                        </Button>
                      ) : (
                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#64748b', background: '#f1f5f9', padding: '6px 12px', borderRadius: 8, width: isMobile ? '100%' : 'auto', justifyContent: 'center', fontWeight: 500 }}>
                          <span>⏳</span> Recibo pendiente de adjuntar
                        </div>
                      )}
                    </div>
                  </Card>
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

        {activeTab === 'pos' && (
          <div>
            <PosPinSection profile={profile} demo={demo} />
          </div>
        )}
      </div>
    </div>
  );
}
