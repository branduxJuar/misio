import React, { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  Card, Form, Input, Button, Typography, message, Checkbox, Modal, Alert,
  Space, Segmented, Divider, ConfigProvider, theme
} from 'antd';
import {
  IdcardOutlined, LockOutlined, UserOutlined, PhoneOutlined, MailOutlined,
  ThunderboltFilled, SafetyCertificateFilled, EyeInvisibleOutlined, EyeTwoTone,
  ArrowLeftOutlined,
} from '@ant-design/icons';
import { useAuth } from '../../auth/AuthContext';
import { useSite } from '../../theme/SiteProvider';
import { MISIO_COLORS } from '../../theme/misioTheme';
import { TERMS_PE } from '../../utils/terms';
import { SERVER_URL } from '../../auth/api';

const { Title, Text, Paragraph } = Typography;

/**
 * 🔐 AuthPage — acceso ÚNICO para usuarios y personal (admin/operador/
 * presentador): el rol lo decide el servidor con el token, no una puerta
 * distinta — dos formularios de login serían dos superficies que atacar.
 *
 * Diseño: panel de marca a la izquierda (logo, nombre y colores que TÚ
 * editas en Admin → Contenido) y el formulario a la derecha. En móvil el
 * panel se recoge y manda el formulario.
 *
 * La lógica es la de siempre: login por DNI, registro con T&C y el paso
 * de verificación por código de 6 dígitos cuando está activado.
 */
export default function AuthPage() {
  const { login, register, verifyEmail } = useAuth();
  const site = useSite();
  const navigate = useNavigate();
  const location = useLocation();
  const [tab, setTab] = useState('login');
  const [submitting, setSubmitting] = useState(false);
  const [termsOpen, setTermsOpen] = useState(false);
  const [verifying, setVerifying] = useState(null); // { dni, message } → paso del código
  const [code, setCode] = useState('');
  const loginRef = React.useRef('');
  const [msgApi, contextHolder] = message.useMessage();

  const redirectTo = location.state?.from ?? '/';

  // UTM tracking: si el usuario llegó con ?utm_source=whatsapp&utm_campaign=iphone16,
  // lo mandamos al backend al registrarse. Una línea que te dice de dónde viene cada usuario.
  const utm = React.useMemo(() => {
    const p = new URLSearchParams(window.location.search);
    return {
      utmSource: p.get('utm_source') || '',
      utmMedium: p.get('utm_medium') || '',
      utmCampaign: p.get('utm_campaign') || '',
      referrer: document.referrer || '',
    };
  }, []);

  const run = async (fn) => {
    setSubmitting(true);
    try {
      const res = await fn();
      if (res?.requiresVerification) {
        setVerifying({ dni: res.dni, message: res.message });
        return;
      }
      if (res?.welcomeBonus) {
        msgApi.success(`🎁 ¡Bienvenido! Bono aplicado: ${res.welcomeBonus.detail}`, 7);
      } else {
        msgApi.success(`¡Bienvenido a ${site.brandName}! ⚡`);
      }
      navigate(redirectTo, { replace: true });
    } catch (err) {
      if (err.message?.startsWith('VERIFY_EMAIL:')) {
        const dni = loginRef.current;
        setVerifying({ dni, message: err.message.replace('VERIFY_EMAIL:', '') });
        return;
      }
      if (err.message?.startsWith('LOCKED_SUPPORT:')) {
        Modal.error({
          title: 'Cuenta Bloqueada por Seguridad',
          content: err.message.replace('LOCKED_SUPPORT:', ''),
          okText: 'Entendido',
          centered: true,
        });
        setVerifying(null);
        return;
      }
      msgApi.error(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const passwordProps = {
    prefix: <LockOutlined />,
    placeholder: '••••••',
    size: 'large',
    iconRender: (v) => (v ? <EyeTwoTone /> : <EyeInvisibleOutlined />),
  };

  // ── Recuperación: paso 1, pedir por DNI ──
  const forgotForm = (
    <Form layout="vertical" onFinish={async (v) => {
      setSubmitting(true);
      try {
        const { api } = await import('../../auth/api');
        const res = await api('/auth/forgot-password', { method: 'POST', body: { dni: v.dni } });
        msgApi.success(res.message ?? 'Revisa tu correo para continuar');
        setTab('login');
      } catch (err) { msgApi.error(err.message); }
      finally { setSubmitting(false); }
    }}>
      <Text style={{ color: MISIO_COLORS.textMuted, fontSize: 13, display: 'block', marginBottom: 16 }}>
        Ingresa tu DNI. Si tienes un correo registrado, te enviaremos un enlace para crear una nueva contraseña.
      </Text>
      <Form.Item name="dni" label="DNI"
        rules={[{ required: true, pattern: /^\d{8}$/, message: 'DNI de 8 dígitos' }]}>
        <Input prefix={<IdcardOutlined />} placeholder="74581236" size="large" maxLength={8} />
      </Form.Item>
      <Button type="primary" htmlType="submit" block size="large" loading={submitting} className="btn-marketero" style={{ height: 46 }}>
        Enviar enlace de recuperación
      </Button>
      <div style={{ textAlign: 'center', marginTop: 12 }}>
        <a onClick={() => setTab('login')} style={{ fontSize: 12 }}>← Volver a iniciar sesión</a>
      </div>
    </Form>
  );

  const loginForm = (
    <Form
      layout="vertical"
      onFinish={(v) => { loginRef.current = v.identifier; return run(() => login(v.identifier, v.password)); }}
      requiredMark={false}
    >
      <Form.Item
        name="identifier"
        label="Correo electrónico"
        rules={[{ required: true, message: 'Ingresa tu correo' }]}
      >
        <Input prefix={<IdcardOutlined />} placeholder="tucorreo@gmail.com" size="large"
          autoComplete="username" />
      </Form.Item>
      <Form.Item
        name="password"
        label="Contraseña"
        rules={[{ required: true, min: 6, message: 'Mínimo 6 caracteres' }]}
      >
        <Input.Password {...passwordProps} autoComplete="current-password" />
      </Form.Item>
      <Button type="primary" htmlType="submit" block size="large" loading={submitting} className="btn-marketero"
        style={{ height: 46, fontSize: 16 }}>
        Entrar
      </Button>
      <div style={{ textAlign: 'center', marginTop: 12 }}>
        <a onClick={() => setTab('forgot')} style={{ fontSize: 12 }}>¿Olvidaste tu contraseña?</a>
      </div>
      <div style={{ textAlign: 'center', marginTop: 8 }}>
        <Text style={{ fontSize: 12, color: MISIO_COLORS.textMuted }}>
          ¿Aún no tienes cuenta?{' '}
          <a onClick={() => setTab('register')}>Créala gratis</a>
        </Text>
      </div>
    </Form>
  );

  const registerForm = (
    <Form layout="vertical" onFinish={(v) => run(() => register(v))} requiredMark={false}>
      <Form.Item
        name="name"
        label="Nombre completo"
        rules={[{ required: true, min: 3, message: 'Ingresa tu nombre' }]}
      >
        <Input prefix={<UserOutlined />} placeholder="Carla Mendoza" size="large" autoComplete="name" />
      </Form.Item>
      <Form.Item
        name="dni"
        label="DNI"
        extra={<Text style={{ fontSize: 11, color: MISIO_COLORS.textMuted }}>
          Con él entras y con él validamos tu premio.
        </Text>}
        rules={[{ pattern: /^\d{8}$/, message: 'El DNI tiene 8 dígitos', required: true }]}
      >
        <Input prefix={<IdcardOutlined />} placeholder="74581236" maxLength={8} size="large"
          inputMode="numeric" />
      </Form.Item>
      <Form.Item
        name="phone"
        label="Celular"
        rules={[{ pattern: /^9\d{8}$/, message: 'Celular peruano: 9 dígitos empezando en 9', required: true }]}
      >
        <Input prefix={<PhoneOutlined />} placeholder="987654321" maxLength={9} size="large"
          inputMode="numeric" autoComplete="tel" />
      </Form.Item>
      <Form.Item
        name="email"
        label="Correo electrónico"
        rules={[{ required: true, type: 'email', message: 'Ingresa un correo válido' }]}
      >
        <Input prefix={<MailOutlined />} placeholder="tucorreo@gmail.com" size="large"
          autoComplete="email" />
      </Form.Item>
      <Form.Item
        name="password"
        label="Contraseña"
        rules={[{ required: true, min: 6, message: 'Mínimo 6 caracteres' }]}
      >
        <Input.Password {...passwordProps} autoComplete="new-password" />
      </Form.Item>
      <Form.Item
        name="acceptTerms"
        valuePropName="checked"
        rules={[{
          validator: (_, v) => (v ? Promise.resolve() : Promise.reject(new Error('Debes aceptar los Términos y Condiciones'))),
        }]}
      >
        <Checkbox>
          <Text style={{ fontSize: 12 }}>
            Acepto los{' '}
            <a href="/terminos" target="_blank" rel="noreferrer">Términos y Condiciones</a>{' '}
            y la{' '}
            <a href="/privacidad" target="_blank" rel="noreferrer">Política de Privacidad</a>{' '}
            (Ley N° 29733). Declaro ser mayor de 18 años.
          </Text>
        </Checkbox>
      </Form.Item>
      <Button type="primary" htmlType="submit" block size="large" loading={submitting} className="btn-marketero"
        style={{ height: 46, fontSize: 16 }}>
        Crear mi cuenta gratis
      </Button>
    </Form>
  );

  const verifyStep = (
    <Space direction="vertical" size="middle" style={{ width: '100%' }}>
      <Alert type="info" showIcon message="Verifica tu correo" description={verifying?.message} />
      <Input
        size="large"
        maxLength={6}
        placeholder="000000"
        value={code}
        inputMode="numeric"
        autoFocus
        onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
        style={{ textAlign: 'center', fontSize: 26, letterSpacing: 12, fontWeight: 800 }}
      />
      <Button type="primary" size="large" block loading={submitting} className="btn-marketero"
        disabled={code.length !== 6} style={{ height: 46 }}
        onClick={() => run(() => verifyEmail(verifying.dni, code))}>
        Verificar y entrar
      </Button>
      <Button type="link" block onClick={async () => {
        try {
          const apiRes = await (await import('../../auth/api')).api('/auth/resend-code', {
            method: 'POST', body: { dni: verifying.dni },
          });
          const intentos = apiRes.attempts || 1;
          const restantes = 3 - intentos;
          msgApi.success(`Código reenviado. Te quedan ${restantes} intento(s) permitidos.`);
        } catch (e) {
          if (e.message?.startsWith('LOCKED_SUPPORT:')) {
            Modal.error({
              title: 'Cuenta Bloqueada por Seguridad',
              content: e.message.replace('LOCKED_SUPPORT:', ''),
              okText: 'Entendido',
              centered: true,
            });
            setVerifying(null);
          } else {
            msgApi.error(e.message);
          }
        }
      }}>
        Reenviar código
      </Button>
      <Button type="text" block icon={<ArrowLeftOutlined />}
        onClick={() => { setVerifying(null); setCode(''); }}>
        Volver
      </Button>
    </Space>
  );

  return (
    <div className="z-auth-page">
      {contextHolder}

      {/* Puerta aparte: siempre hay salida de vuelta al sitio */}
      <Button
        type="text"
        icon={<ArrowLeftOutlined />}
        onClick={() => navigate('/')}
        style={{ position: 'absolute', top: 16, left: 16 }}
      >
        Volver al sitio
      </Button>
      <div
        className="fade-in-up"
        style={{
          width: 'min(940px, 100%)',
          position: 'relative',
        }}
      >
        <div className="z-auth-split">
          {/* ── Panel de marca (editable desde Admin → Contenido) ──── */}
          <div className="z-auth-brand">
            <div>
              <Space align="center" size={10}>
                {site.logoUrl
                  ? <img src={`${SERVER_URL}${site.logoUrl}`} alt={site.brandName}
                      style={{ height: 34, borderRadius: 8 }} />
                  : <ThunderboltFilled style={{ fontSize: 28, color: '#fff' }} />}
                <Title level={3} style={{ color: '#fff', margin: 0 }}>{site.brandName}</Title>
              </Space>
              <Paragraph style={{ color: 'rgba(255,255,255,0.86)', marginTop: 14, fontSize: 15 }}>
                {site.tagline}
              </Paragraph>
            </div>

            <Space direction="vertical" size={14} style={{ marginTop: 26 }}>
              {[
                ['💸', 'Cashback', 'Si tu boleto no gana, una parte vuelve como saldo de canje.'],
                ['🔴', 'Sorteos en vivo', 'Con la ruleta y los participantes en pantalla.'],
                ['🚚', 'Entrega con seguimiento', 'A todo el Perú, con evidencia publicada.'],
              ].map(([i, t, d]) => (
                <Space align="start" key={t}>
                  <span style={{ fontSize: 20 }}>{i}</span>
                  <div>
                    <Text strong style={{ color: '#fff', display: 'block', fontSize: 14 }}>{t}</Text>
                    <Text style={{ color: 'rgba(255,255,255,0.72)', fontSize: 12 }}>{d}</Text>
                  </div>
                </Space>
              ))}
            </Space>

            <div style={{ marginTop: 'auto', paddingTop: 22 }}>
              <Text style={{ color: 'rgba(255,255,255,0.6)', fontSize: 11 }}>
                <SafetyCertificateFilled /> Conexión cifrada · Solo mayores de 18 años
              </Text>
            </div>
          </div>

          {/* ── Formulario ────────────────────────────────────────── */}
          <div className="z-auth-form">
            {/* Marca compacta: en móvil el panel de la izquierda no se ve */}
            <div className="z-auth-mobile-brand">
              <Space align="center" size={8}>
                {site.logoUrl
                  ? <img src={`${SERVER_URL}${site.logoUrl}`} alt={site.brandName}
                      style={{ height: 26, borderRadius: 6 }} />
                  : <ThunderboltFilled style={{ fontSize: 22, color: MISIO_COLORS.primary }} />}
                <Title level={4} style={{ margin: 0 }}>{site.brandName}</Title>
              </Space>
              <Divider style={{ margin: '12px 0' }} />
            </div>

            {verifying ? verifyStep : (
              <>
                <Title level={4} style={{ marginTop: 0, marginBottom: 4 }}>
                  {tab === 'login' ? 'Entra a tu cuenta'
                    : tab === 'forgot' ? 'Recupera tu contraseña'
                    : 'Crea tu cuenta'}
                </Title>
                {tab !== 'login' && (
                  <Text style={{ color: MISIO_COLORS.textMuted, fontSize: 13, display: 'block', marginTop: 4 }}>
                    {tab === 'forgot'
                      ? 'Te ayudamos a volver a entrar.'
                      : 'Es gratis y toma un minuto. No pedimos tarjeta.'}
                  </Text>
                )}

                {tab !== 'forgot' && (
                  <Segmented
                    block
                    size="large"
                    value={tab}
                    onChange={setTab}
                    options={[
                      { label: 'Ingresar', value: 'login' },
                      { label: 'Registrarme', value: 'register' },
                    ]}
                    style={{ margin: '18px 0 20px' }}
                  />
                )}

                {tab === 'login' ? loginForm : tab === 'forgot' ? forgotForm : registerForm}
              </>
            )}
          </div>
        </div>
      </div>

      {/* Términos y Condiciones — Perú (Ley 29733, Ley 29571) */}
      <Modal
        open={termsOpen}
        onCancel={() => setTermsOpen(false)}
        footer={<Button type="primary" onClick={() => setTermsOpen(false)}>Entendido</Button>}
        title={`Términos y Condiciones de ${site.brandName}`}
        width={Math.min(620, window.innerWidth - 24)}
      >
        <div style={{ maxHeight: '55vh', overflowY: 'auto', paddingRight: 8 }}>
          {TERMS_PE.map((s) => (
            <div key={s.t} style={{ marginBottom: 14 }}>
              <Text strong>{s.t}</Text>
              <br />
              <Text style={{ color: MISIO_COLORS.textMuted, fontSize: 13 }}>{s.c}</Text>
            </div>
          ))}
        </div>
      </Modal>
    </div>
  );
}
