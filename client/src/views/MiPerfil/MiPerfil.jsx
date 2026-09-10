import React, { useEffect, useState } from 'react';
import {
  Card, Col, Row, Typography, Form, Input, Button, message, Upload, Avatar,
  Tag, List, Space, Alert, Tooltip, Tabs, Grid, Select,
} from 'antd';
import {
  UserOutlined, CameraOutlined, SaveOutlined, EnvironmentOutlined,
  FileTextOutlined, EyeOutlined, SafetyCertificateOutlined, LockOutlined,
} from '@ant-design/icons';

const ACHIEVEMENTS_LIST = [
  {
    id: 'FOUNDER',
    name: 'Primeros usuarios',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M6 11.5L4 21L8 19L12 22L16 19L20 21L18 11.5C16.4326 12.4433 14.3015 13 12 13C9.6985 13 7.56743 12.4433 6 11.5Z" fill="#ef4444"/>
        <circle cx="12" cy="7" r="6" fill="#f59e0b"/>
        <circle cx="12" cy="7" r="4.5" fill="#fbbf24"/>
        <path d="M12 7.5L10 6L14 6L12 7.5Z" fill="#fef3c7" opacity="0.5"/>
        <text x="12" y="9.5" fontSize="6" fontWeight="bold" fill="#fff" textAnchor="middle" fontFamily="sans-serif">1</text>
        <path d="M12 2L13.5 4.5L16.5 4.5L15 7L16.5 9.5L13.5 9.5L12 12L10.5 9.5L7.5 9.5L9 7L7.5 4.5L10.5 4.5L12 2Z" fill="#fbbf24" stroke="#f59e0b" strokeWidth="1"/>
      </svg>
    )
  },
  {
    id: 'PERFECT_PROFILE',
    name: 'Perfil Perfecto',
    icon: '👤'
  },
  {
    id: 'FIRST_TICKET',
    name: 'El Bautizo',
    icon: '🎟️'
  },
  {
    id: 'LUCKY_WINNER',
    name: 'Tocado por la Suerte',
    icon: '🍀'
  }
];
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
    if (profile) form.setFieldsValue({
      email: profile.email,
      dni: profile.dni,
      phone: profile.phone,
      altContact: profile.altContact,
      addressLine1: profile.address?.line1,
      addressLine2: profile.address?.reference,
      city: profile.address?.city,
      state: profile.address?.region,
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
          dni: v.dni,
          phone: v.phone,
          altContact: v.altContact,
          address: {
            line1: v.addressLine1,
            city: v.city,
            region: v.state,
            reference: v.reference || v.addressLine2,
          },
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
          <Row gutter={[20, 20]} align="stretch">
            {/* ── Foto + identidad ── */}
            <Col xs={24} md={8}>
              <Card 
                style={{ 
                  height: '100%', 
                  textAlign: 'center', 
                  borderRadius: 16, 
                  border: '1px solid #e2e8f0', 
                  boxShadow: '0 10px 30px rgba(0, 0, 0, 0.04)', 
                  background: '#ffffff',
                  overflow: 'hidden'
                }}
                styles={{
                  body: {
                    height: '100%',
                    display: 'flex',
                    flexDirection: 'column',
                    padding: 0
                  }
                }}
              >
                {/* Banner superior con datos de usuario */}
                <div style={{
                  width: '100%',
                  background: `linear-gradient(135deg, ${MISIO_COLORS.primary} 0%, #047857 100%)`,
                  position: 'relative',
                  padding: '24px',
                  display: 'flex',
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'flex-start',
                  borderBottom: '1px solid rgba(0,0,0,0.05)',
                  gap: 20
                }}>
                  {/* Patrón sutil en el banner */}
                  <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, opacity: 0.1, backgroundImage: 'radial-gradient(#ffffff 2px, transparent 2px)', backgroundSize: '16px 16px', zIndex: 0 }} />
                  
                  <div style={{ position: 'relative', zIndex: 1 }}>
                    <Avatar
                      size={90}
                      src={profile.avatarUrl ? `${SERVER_URL}${profile.avatarUrl}` : undefined}
                      icon={<UserOutlined />}
                      style={{ 
                        background: '#ffffff',
                        color: MISIO_COLORS.primary,
                        boxShadow: '0 8px 24px rgba(0, 0, 0, 0.2)',
                        border: '3px solid #ffffff'
                      }}
                    />
                    <div style={{ position: 'absolute', bottom: -2, right: -6 }}>
                      <Upload {...avatarUploader} showUploadList={false}>
                        <Button 
                          type="primary" 
                          shape="circle" 
                          icon={<CameraOutlined />} 
                          size="small" 
                          style={{ 
                            background: '#0f172a', 
                            border: '2px solid #ffffff',
                            boxShadow: '0 4px 10px rgba(0,0,0,0.2)',
                            width: 32,
                            height: 32
                          }} 
                        />
                      </Upload>
                    </div>
                  </div>
                  
                  <div style={{ zIndex: 1, display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}>
                    <Title level={3} style={{ margin: '0 0 6px 0', fontWeight: 800, color: '#ffffff', letterSpacing: '-0.5px', textShadow: '0 2px 4px rgba(0,0,0,0.1)' }}>
                      {profile.name || 'Usuario'}
                    </Title>
                    
                    <div>
                      {profile.emailVerifiedAt
                        ? <Tag color="success" style={{ padding: '4px 12px', borderRadius: 20, fontWeight: 700, fontSize: 12, border: '1px solid rgba(255,255,255,0.3)', background: 'rgba(255, 255, 255, 0.15)', color: '#ffffff', backdropFilter: 'blur(4px)' }}>✓ Correo verificado</Tag>
                        : profile.email
                          ? <Tag color="warning" style={{ padding: '4px 12px', borderRadius: 20, fontWeight: 700, fontSize: 12, border: 'none', background: '#fef3c7', color: '#92400e', boxShadow: '0 2px 8px rgba(0,0,0,0.1)' }}>⚠️ Correo sin verificar</Tag>
                          : null}
                    </div>
                  </div>
                </div>

                <div style={{ padding: '32px 24px', flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                  
                  {/* Ecosistema de Niveles y Premios */}
                  <div style={{
                    flex: 1,
                    display: 'flex',
                    flexDirection: 'column',
                    marginTop: 32,
                    width: '100%',
                    gap: 32
                  }}>
                    {/* STATS SECTION */}
                    <div style={{ display: 'flex', gap: 16, width: '100%' }}>
                      {/* STAT 1: Insignias */}
                      <div
                        style={{ 
                          flex: 1, background: '#ffffff', border: '1px solid #e2e8f0', 
                          borderRadius: 16, padding: '20px 10px', textAlign: 'center', 
                          boxShadow: '0 4px 15px rgba(0,0,0,0.03)',
                          cursor: 'default', transition: 'all 0.25s ease'
                        }}
                        onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-4px)'; e.currentTarget.style.boxShadow = '0 12px 28px rgba(59,130,246,0.12)'; e.currentTarget.style.borderColor = '#93c5fd'; }}
                        onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = '0 4px 15px rgba(0,0,0,0.03)'; e.currentTarget.style.borderColor = '#e2e8f0'; }}
                      >
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ marginBottom: 8 }}>
                          <path d="M12 15C15.866 15 19 11.866 19 8C19 4.13401 15.866 1 12 1C8.13401 1 5 4.13401 5 8C5 11.866 8.13401 15 12 15Z" stroke="#3b82f6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                          <path d="M8.21 13.89L7 23L12 20L17 23L15.79 13.88" stroke="#3b82f6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                        <div style={{ fontSize: 24, fontWeight: 800, color: '#0f172a', lineHeight: 1 }}>{profile.stats?.insignias || 0}</div>
                        <div style={{ fontSize: 13, fontWeight: 500, color: '#94a3b8', marginTop: 8 }}>Insignias</div>
                      </div>
                      
                      {/* STAT 2: Boletos */}
                      <div
                        style={{ 
                          flex: 1, background: '#ffffff', border: '1px solid #e2e8f0', 
                          borderRadius: 16, padding: '20px 10px', textAlign: 'center', 
                          boxShadow: '0 4px 15px rgba(0,0,0,0.03)',
                          cursor: 'default', transition: 'all 0.25s ease'
                        }}
                        onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-4px)'; e.currentTarget.style.boxShadow = '0 12px 28px rgba(59,130,246,0.12)'; e.currentTarget.style.borderColor = '#93c5fd'; }}
                        onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = '0 4px 15px rgba(0,0,0,0.03)'; e.currentTarget.style.borderColor = '#e2e8f0'; }}
                      >
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ marginBottom: 8 }}>
                          <path d="M4 7V17C4 18.1046 4.89543 19 6 19H18C19.1046 19 20 18.1046 20 17V7C20 5.89543 19.1046 5 18 5H6C4.89543 5 4 5.89543 4 7Z" stroke="#3b82f6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                          <path d="M8 5V19" stroke="#3b82f6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" strokeDasharray="2 2"/>
                          <path d="M16 5V19" stroke="#3b82f6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" strokeDasharray="2 2"/>
                        </svg>
                        <div style={{ fontSize: 24, fontWeight: 800, color: '#0f172a', lineHeight: 1 }}>{profile.stats?.sorteos || 0}</div>
                        <div style={{ fontSize: 13, fontWeight: 500, color: '#94a3b8', marginTop: 8 }}>Boletos</div>
                      </div>

                      {/* STAT 3: Premios */}
                      <div
                        style={{ 
                          flex: 1, background: '#ffffff', border: '1px solid #e2e8f0', 
                          borderRadius: 16, padding: '20px 10px', textAlign: 'center', 
                          boxShadow: '0 4px 15px rgba(0,0,0,0.03)',
                          cursor: 'default', transition: 'all 0.25s ease'
                        }}
                        onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-4px)'; e.currentTarget.style.boxShadow = '0 12px 28px rgba(59,130,246,0.12)'; e.currentTarget.style.borderColor = '#93c5fd'; }}
                        onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = '0 4px 15px rgba(0,0,0,0.03)'; e.currentTarget.style.borderColor = '#e2e8f0'; }}
                      >
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ marginBottom: 8 }}>
                          <path d="M8 21H16" stroke="#3b82f6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                          <path d="M12 17V21" stroke="#3b82f6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                          <path d="M7 4H17L19 9L12 17L5 9L7 4Z" stroke="#3b82f6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                        <div style={{ fontSize: 24, fontWeight: 800, color: '#0f172a', lineHeight: 1 }}>{profile.stats?.premios || 0}</div>
                        <div style={{ fontSize: 13, fontWeight: 500, color: '#94a3b8', marginTop: 8 }}>Premios</div>
                      </div>
                    </div>

                    {/* INSIGNIAS SECTION */}
                    <div>
                      <Title level={4} style={{ margin: '0 0 16px 0', fontWeight: 800, color: '#0f172a', letterSpacing: '-0.5px' }}>
                        Insignias
                      </Title>
                      <div style={{
                        background: '#ffffff',
                        border: '1px solid #e2e8f0',
                        borderRadius: 16,
                        padding: '24px',
                        boxShadow: '0 2px 10px rgba(0,0,0,0.02)',
                        display: 'flex',
                        flexWrap: 'wrap',
                        gap: 16,
                      }}>
                        {ACHIEVEMENTS_LIST.map(ach => {
                          const isUnlocked = profile.achievements?.includes(ach.id);
                          // Define background and border colors for the circular token based on unlocked state
                          const tokenBg = isUnlocked ? '#1e293b' : '#f1f5f9';
                          const tokenBorder = isUnlocked ? (ach.id === 'FOUNDER' ? '#10b981' : ach.id === 'FIRST_TICKET' ? '#3b82f6' : ach.id === 'LUCKY_WINNER' ? '#f59e0b' : '#8b5cf6') : '#cbd5e1';
                          
                          return (
                            <Tooltip title={ach.name} key={ach.id}>
                              <div style={{
                                width: 56,
                                height: 56,
                                borderRadius: '50%',
                                background: tokenBg,
                                border: `4px solid ${tokenBorder}`,
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                fontSize: 24,
                                boxShadow: isUnlocked ? '0 4px 12px rgba(0,0,0,0.1)' : 'none',
                                opacity: isUnlocked ? 1 : 0.4,
                                filter: isUnlocked ? 'none' : 'grayscale(100%)',
                                cursor: 'default',
                                transition: 'all 0.3s ease',
                              }}
                              onMouseEnter={(e) => {
                                if(isUnlocked) e.currentTarget.style.transform = 'scale(1.1) translateY(-2px)';
                              }}
                              onMouseLeave={(e) => {
                                if(isUnlocked) e.currentTarget.style.transform = 'scale(1) translateY(0)';
                              }}>
                                {ach.id === 'FOUNDER' ? '👑' : ach.id === 'PERFECT_PROFILE' ? '👤' : ach.id === 'FIRST_TICKET' ? '🎟️' : ach.id === 'LUCKY_WINNER' ? '🍀' : '🎖️'}
                                {!isUnlocked && (
                                  <div style={{
                                    position: 'absolute',
                                    bottom: -4,
                                    right: -4,
                                    background: '#cbd5e1',
                                    borderRadius: '50%',
                                    width: 20,
                                    height: 20,
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center'
                                  }}>
                                    <LockOutlined style={{ fontSize: 10, color: '#64748b' }} />
                                  </div>
                                )}
                              </div>
                            </Tooltip>
                          )
                        })}
                      </div>
                    </div>
                  </div>
                </div>
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
                style={{ height: '100%', borderRadius: 16, border: '1px solid #e2e8f0', boxShadow: '0 4px 15px rgba(0, 0, 0, 0.02)', background: '#ffffff' }}
                styles={{ header: { padding: '18px 24px', borderBottom: '1px solid #f1f5f9' }, body: { padding: '24px' } }}
              >
                <Form form={form} layout="vertical" onFinish={save} requiredMark={false}>
                  <Row gutter={16}>
                    <Col xs={24} md={8}>
                      <Form.Item name="email" label={<Text strong style={{ color: '#334155' }}>Correo</Text>}
                        rules={[{ type: 'email', message: 'Correo inválido' }]}>
                        <Input size="large" placeholder="tucorreo@gmail.com" style={{ borderRadius: 8 }} />
                      </Form.Item>
                    </Col>
                    <Col xs={12} md={8}>
                      <Form.Item name="dni" label={<Text strong style={{ color: '#334155' }}>DNI</Text>}
                        rules={[{ required: true, pattern: /^\d{8}$/, message: '8 dígitos' }]}>
                        <Input size="large" maxLength={8} placeholder="8 dígitos" style={{ borderRadius: 8 }} />
                      </Form.Item>
                    </Col>
                    <Col xs={12} md={8}>
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
                      <Input
                        size="large"
                        placeholder="Frente al parque"
                        style={{ borderRadius: 8 }}
                        onChange={(e) => form.setFieldValue('reference', e.target.value)}
                      />
                    </Form.Item>
                  </Col>
                  <Col xs={12} md={12}>
                    <Form.Item name="city" label="Ciudad / Distrito">
                      <Input size="large" placeholder="Lima" style={{ borderRadius: 8 }} />
                    </Form.Item>
                  </Col>
                  <Col xs={12} md={12}>
                    <Form.Item name="state" label="Departamento">
                      <Input size="large" placeholder="Lima" style={{ borderRadius: 8 }} />
                    </Form.Item>
                  </Col>
                  </Row>
                  <Form.Item name="reference" label={<Text strong style={{ color: '#334155' }}>Referencia para el courier</Text>}>
                    <Input
                      size="large"
                      placeholder="Frente al parque, portón negro"
                      style={{ borderRadius: 8 }}
                      onChange={(e) => form.setFieldValue('addressLine2', e.target.value)}
                    />
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
                    Guardar
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
