import React, { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  Card, Form, Input, Button, Typography, message, Checkbox, Modal, Alert,
  Space, Segmented, Divider, ConfigProvider, theme, Grid
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

const BrandDecorations = () => (
  <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', pointerEvents: 'none', zIndex: 0 }}>
    
    {/* Top Left - Ticket Transparente */}
    <svg style={{ position: 'absolute', top: '15%', left: '0%', transform: 'rotate(25deg)' }} width="50" height="70" viewBox="0 0 60 80">
      <path d="M10,0 L50,0 C55,0 60,5 60,10 L60,30 C55,30 50,35 50,40 C50,45 55,50 60,50 L60,70 C60,75 55,80 50,80 L10,80 C5,80 0,75 0,70 L0,50 C5,50 10,45 10,40 C10,35 5,30 0,30 L0,10 C0,5 5,0 10,0 Z" fill="transparent" stroke="#ffffff" strokeWidth="3" opacity="0.4" />
      <text x="30" y="48" fontSize="24" fontWeight="bold" fill="#ffffff" textAnchor="middle" opacity="0.4">%</text>
    </svg>

    {/* Bottom Right - Ticket Transparente */}
    <svg style={{ position: 'absolute', bottom: '35%', right: '5%', transform: 'rotate(-25deg)' }} width="70" height="50" viewBox="0 0 60 40">
      <path d="M0,10 C5,10 10,5 10,0 L50,0 C50,5 55,10 60,10 L60,30 C55,30 50,35 50,40 L10,40 C10,35 5,30 0,30 Z" fill="transparent" stroke="#ffffff" strokeWidth="3" opacity="0.3" />
      <path d="M10,20 L50,20" stroke="#ffffff" strokeWidth="2" strokeDasharray="4 4" opacity="0.3" />
      <text x="30" y="27" fontSize="18" fontWeight="bold" fill="#ffffff" textAnchor="middle" opacity="0.3">%</text>
    </svg>

    {/* Floating Shapes */}
    <svg style={{ position: 'absolute', bottom: '20%', left: '25%' }} width="16" height="16" viewBox="0 0 24 24"><path d="M12 2 L15 9 L22 9 L16 14 L18 21 L12 17 L6 21 L8 14 L2 9 L9 9 Z" fill="#FBD38D" opacity="0.8"/></svg>
    <svg style={{ position: 'absolute', top: '15%', right: '35%' }} width="12" height="12" viewBox="0 0 24 24"><path d="M12 2 L15 9 L22 9 L16 14 L18 21 L12 17 L6 21 L8 14 L2 9 L9 9 Z" fill="#ffffff" opacity="0.5"/></svg>
    <svg style={{ position: 'absolute', top: '10%', right: '45%', transform: 'rotate(15deg)' }} width="20" height="20" viewBox="0 0 24 24"><path d="M12 2 L22 20 L2 20 Z" fill="none" stroke="#68D391" strokeWidth="3" opacity="0.7"/></svg>
    <svg style={{ position: 'absolute', bottom: '15%', right: '25%', transform: 'rotate(-20deg)' }} width="18" height="18" viewBox="0 0 24 24"><path d="M12 2 L22 20 L2 20 Z" fill="none" stroke="#63B3ED" strokeWidth="3" opacity="0.8"/></svg>
    <svg style={{ position: 'absolute', top: '30%', right: '15%' }} width="14" height="14" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" fill="none" stroke="#F6AD55" strokeWidth="3" opacity="0.8"/></svg>
    <svg style={{ position: 'absolute', bottom: '40%', left: '25%' }} width="10" height="10"><circle cx="5" cy="5" r="5" fill="#68D391" opacity="0.6"/></svg>
    <svg style={{ position: 'absolute', top: '15%', left: '30%' }} width="12" height="12"><circle cx="6" cy="6" r="6" fill="#A0AEC0" opacity="0.6"/></svg>
  </div>
);

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
  const { user } = useAuth();
  const [tab, setTab] = useState('login');
  const [submitting, setSubmitting] = useState(false);
  const [termsOpen, setTermsOpen] = useState(false);
  const [verifying, setVerifying] = useState(null); // { dni, message } → paso del código
  const [code, setCode] = useState('');
  const loginRef = React.useRef('');
  const [msgApi, contextHolder] = message.useMessage();

  const redirectTo = location.state?.from ?? '/';

  React.useEffect(() => {
    if (user && !verifying) {
      // Si ya hay usuario, sacarlo de aquí
      let finalRedirect = redirectTo;
      if (finalRedirect === '/') {
        finalRedirect = ['admin', 'operator', 'presenter', 'seller'].includes(user.role) 
          ? '/admin' 
          : '/mi-cuenta';
      }
      navigate(finalRedirect, { replace: true });
    }
  }, [user, verifying, navigate, redirectTo]);

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

      let finalRedirect = redirectTo;
      if (finalRedirect === '/') {
        const role = res?.user?.role;
        if (role === 'admin' || role === 'operator' || role === 'presenter' || role === 'seller') {
          finalRedirect = '/admin';
        } else {
          finalRedirect = '/mi-cuenta';
        }
      }

      // Dar un pequeño respiro para que React actualice el AuthContext global
      // antes de que el router evalúe ProtectedRoute.
      setTimeout(() => {
        navigate(finalRedirect, { replace: true });
      }, 50);
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
        const res = await api('/auth/forgot-password', { method: 'POST', body: { email: v.email } });
        msgApi.success(res.message ?? 'Revisa tu correo para continuar');
        setTab('login');
      } catch (err) { msgApi.error(err.message); }
      finally { setSubmitting(false); }
    }} requiredMark={false}>
      <Text style={{ color: MISIO_COLORS.textMuted, fontSize: 13, display: 'block', marginBottom: 20 }}>
        Ingresa tu correo registrado. Te enviaremos un enlace para crear una nueva contraseña.
      </Text>
      <Form.Item name="email" label="Correo electrónico"
        rules={[{ required: true, type: 'email', message: 'Ingresa un correo válido' }]}>
        <Input prefix={<MailOutlined />} placeholder="Ej. tucorreo@gmail.com" size="large" autoComplete="email" className="auth-input" />
      </Form.Item>
      <Button type="primary" htmlType="submit" block size="large" loading={submitting} className="btn-marketero btn-pill" style={{ height: 46 }}>
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
        <Input prefix={<MailOutlined />} placeholder="tucorreo@gmail.com" size="large"
          autoComplete="username" className="auth-input" />
      </Form.Item>
      <Form.Item
        name="password"
        label="Contraseña"
        rules={[{ required: true, min: 6, message: 'Mínimo 6 caracteres' }]}
      >
        <Input.Password {...passwordProps} autoComplete="current-password" className="auth-input" />
      </Form.Item>
      <Button type="primary" htmlType="submit" block size="large" loading={submitting} className="btn-marketero btn-pill"
        style={{ height: 46, fontSize: 16 }}>
        Ingresar
      </Button>
      <div style={{ textAlign: 'center', marginTop: 12 }}>
        <a onClick={() => setTab('forgot')} style={{ fontSize: 12 }}>¿Olvidaste tu contraseña?</a>
      </div>
      <div style={{ textAlign: 'center', marginTop: 8 }}>
        <Text style={{ fontSize: 12, color: MISIO_COLORS.textMuted }}>
          ¿Aún no tienes cuenta?{' '}
          <a onClick={() => setTab('register')}>Registrarme</a>
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
        style={{ marginBottom: 12 }}
      >
        <Input prefix={<UserOutlined />} placeholder="Ej. Juan Pérez" size="large" autoComplete="name" className="auth-input" />
      </Form.Item>
      <Form.Item
        name="dni"
        label="DNI"
        rules={[{ pattern: /^\d{8}$/, message: 'El DNI tiene 8 dígitos', required: true }]}
        style={{ marginBottom: 12 }}
      >
        <Input prefix={<IdcardOutlined />} placeholder="Ej. 12345678" maxLength={8} size="large"
          inputMode="numeric" className="auth-input" />
      </Form.Item>
      <Form.Item
        name="phone"
        label="Celular"
        rules={[{ pattern: /^9\d{8}$/, message: 'Celular peruano: 9 dígitos empezando en 9', required: true }]}
        style={{ marginBottom: 12 }}
      >
        <Input prefix={<PhoneOutlined />} placeholder="Ej. 987654321" maxLength={9} size="large"
          inputMode="numeric" autoComplete="tel" className="auth-input" />
      </Form.Item>
      <Form.Item
        name="email"
        label="Correo electrónico"
        rules={[{ required: true, type: 'email', message: 'Ingresa un correo válido' }]}
        style={{ marginBottom: 12 }}
      >
        <Input prefix={<MailOutlined />} placeholder="tucorreo@gmail.com" size="large"
          autoComplete="email" className="auth-input" />
      </Form.Item>
      <Form.Item
        name="password"
        label="Contraseña"
        rules={[{ required: true, min: 6, message: 'Mínimo 6 caracteres' }]}
        style={{ marginBottom: 12 }}
      >
        <Input.Password {...passwordProps} autoComplete="new-password" className="auth-input" />
      </Form.Item>
      <Form.Item
        name="acceptTerms"
        valuePropName="checked"
        rules={[{
          validator: (_, v) => (v ? Promise.resolve() : Promise.reject(new Error('Debes aceptar los Términos y Condiciones'))),
        }]}
        style={{ marginBottom: 20 }}
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
      <Button type="primary" htmlType="submit" block size="large" loading={submitting} className="btn-marketero btn-pill"
        style={{ height: 46, fontSize: 16 }}>
        Registrarme
      </Button>
      <div style={{ textAlign: 'center', marginTop: 16 }}>
        <Text style={{ fontSize: 12, color: MISIO_COLORS.textMuted }}>
          ¿Ya tienes cuenta?{' '}
          <a onClick={() => setTab('login')}>Iniciar sesión</a>
        </Text>
      </div>
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
      <Button type="primary" size="large" block loading={submitting} className="btn-marketero btn-pill"
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

const AuthBackground = () => (
  <svg style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', pointerEvents: 'none', zIndex: 0 }} viewBox="0 0 1440 900" preserveAspectRatio="xMidYMid slice" xmlns="http://www.w3.org/2000/svg">
    {/* Blobs Top Right */}
    <path d="M1150 0C1150 0 1200 120 1320 135C1440 150 1440 300 1440 300V0H1150Z" fill="#a4e4c3" opacity="0.5" />
    <path d="M1250 0C1250 0 1280 80 1380 90C1480 100 1440 220 1440 220V0H1250Z" fill="#c3eed5" opacity="0.6" />
    
    {/* Blobs Bottom Left */}
    <path d="M0 550C0 550 80 550 120 630C160 710 300 710 300 710C300 710 270 810 350 900H0V550Z" fill="#a4e4c3" opacity="0.5" />
    <path d="M0 650C0 650 50 650 75 710C100 770 200 770 200 770C200 770 170 840 240 900H0V650Z" fill="#c3eed5" opacity="0.6" />
    
    {/* Confetti */}
    <rect x="150" y="80" width="16" height="6" rx="3" fill="#ff6b6b" transform="rotate(45 150 80)" />
    <circle cx="210" cy="130" r="6" fill="#feca57" />
    <rect x="250" y="50" width="12" height="5" rx="2.5" fill="#1dd1a1" transform="rotate(-30 250 50)" />
    <rect x="100" y="220" width="16" height="5" rx="2.5" fill="#48dbfb" transform="rotate(15 100 220)" />
    <circle cx="80" cy="100" r="5" fill="#ff9f43" />
    <circle cx="280" cy="240" r="7" fill="#1dd1a1" />

    <rect x="800" y="60" width="16" height="6" rx="3" fill="#ff9f43" transform="rotate(60 800 60)" />
    <circle cx="950" cy="100" r="6" fill="#48dbfb" />
    <rect x="1100" y="80" width="18" height="6" rx="3" fill="#ff6b6b" transform="rotate(-45 1100 80)" />

    <circle cx="1300" cy="750" r="7" fill="#feca57" />
    <rect x="1250" y="820" width="14" height="5" rx="2.5" fill="#1dd1a1" transform="rotate(20 1250 820)" />
    <rect x="1150" y="700" width="12" height="5" rx="2.5" fill="#ff6b6b" transform="rotate(-15 1150 700)" />
    
    <circle cx="400" cy="850" r="6" fill="#48dbfb" />
    <rect x="500" y="780" width="16" height="5" rx="2.5" fill="#ff9f43" transform="rotate(75 500 780)" />
    <circle cx="600" cy="720" r="5" fill="#1dd1a1" />
  </svg>
);

  return (
    <div className="z-auth-page">
      <AuthBackground />
      {contextHolder}

      {/* Puerta aparte: siempre hay salida de vuelta al sitio */}
      <Button
        shape="circle"
        icon={<ArrowLeftOutlined />}
        onClick={() => {
          if (window.history.state && window.history.state.idx > 0) {
            navigate(-1);
          } else {
            navigate('/');
          }
        }}
        style={{ 
          position: 'absolute', 
          top: 16, 
          left: 16, 
          fontSize: 20, 
          color: '#ffffff',
          backgroundColor: 'rgba(255, 255, 255, 0.2)',
          border: '1px solid rgba(255, 255, 255, 0.4)',
          backdropFilter: 'blur(4px)',
          zIndex: 50,
          width: 40,
          height: 40,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center'
        }}
      />
      <div
        className="fade-in-up"
        style={{
          width: 'min(940px, 100%)',
          position: 'relative',
          zIndex: 1,
        }}
      >
        <div className="z-auth-split">
          {/* ── Panel de marca (editable desde Admin → Contenido) ──── */}
          <div className="z-auth-brand" style={{ position: 'relative', overflow: 'hidden' }}>
            <BrandDecorations />
            <div style={{ width: '100%', position: 'relative', zIndex: 1 }}>
              <div className="z-auth-brand-logo" style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%' }}>
                {site.logoUrl
                  ? <img src={`${SERVER_URL}${site.logoUrl}`} alt={site.brandName}
                      style={{ height: 40, borderRadius: 8 }} />
                  : <div style={{ fontSize: 32, fontWeight: 900, fontStyle: 'italic', lineHeight: 1, padding: '0 4px', background: '#fff', color: 'var(--z-primary)', borderRadius: '50%', width: 44, height: 44, display: 'grid', placeItems: 'center' }}>M</div>}
                <Title level={2} style={{ color: '#fff', margin: 0, fontWeight: 800 }}>{site.brandName}</Title>
              </div>
              <Title className="z-auth-brand-tagline" level={1} style={{ color: '#fff', marginTop: 32, marginBottom: 0, fontWeight: 300, lineHeight: 1.15 }}>
                {site.tagline}
              </Title>
            </div>

            <div style={{ marginTop: 40, display: 'flex', gap: 24, flexDirection: 'column' }} className="z-auth-features">
              {[
                ['💸', 'Cashback', 'Si tu boleto no gana, una parte vuelve como saldo de canje.'],
                ['🔴', 'Sorteos en vivo', 'Con la ruleta y los participantes en pantalla.'],
                ['🚚', 'Entrega con seguimiento', 'A todo el Perú, con evidencia publicada.'],
              ].map(([i, t, d]) => (
                <div key={t} className="z-auth-feature-item" style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                  <div style={{
                    width: 56, height: 56, borderRadius: '50%', background: 'rgba(255,255,255,0.2)',
                    display: 'grid', placeItems: 'center', fontSize: 26, flexShrink: 0
                  }}>
                    {i}
                  </div>
                  <div>
                    <Text strong style={{ color: '#fff', display: 'block', fontSize: 16 }}>{t}</Text>
                    <Text className="z-auth-feature-desc" style={{ color: 'rgba(255,255,255,0.85)', fontSize: 13, lineHeight: 1.3, display: 'block' }}>{d}</Text>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* ── Perforación (estilo Ticket) ── */}
          <div style={{ position: 'relative', width: 7, background: 'transparent', zIndex: 10, display: window.innerWidth > 768 ? 'block' : 'none' }}>
            <div style={{
              position: 'absolute', top: 0, bottom: 0, left: '50%', transform: 'translateX(-50%)',
              borderLeft: '4px dashed rgba(0,0,0,0.15)',
            }} />
            <div style={{
              position: 'absolute', top: -20, left: '50%', transform: 'translateX(-50%)',
              width: 40, height: 40, borderRadius: '50%',
              background: '#dcfce7',
              boxShadow: 'inset 0 -2px 6px rgba(0,0,0,0.1)'
            }} />
            <div style={{
              position: 'absolute', bottom: -20, left: '50%', transform: 'translateX(-50%)',
              width: 40, height: 40, borderRadius: '50%',
              background: '#dcfce7',
              boxShadow: 'inset 0 2px 6px rgba(0,0,0,0.1)'
            }} />
          </div>

          {/* ── Formulario ────────────────────────────────────────── */}
          <div className="z-auth-form">
            {/* Marca compacta: en móvil el panel de la izquierda no se ve */}
            <div className="z-auth-mobile-brand">
              <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 8, width: '100%' }}>
                {site.logoUrl
                  ? <img src={`${SERVER_URL}${site.logoUrl}`} alt={site.brandName}
                      style={{ height: 26, borderRadius: 6 }} />
                  : <div style={{ fontSize: 22, color: MISIO_COLORS.primary, fontWeight: 900, fontStyle: 'italic', lineHeight: 1, padding: '0 4px' }}>M</div>}
                <Title level={4} style={{ margin: 0 }}>{site.brandName}</Title>
              </div>
              <Divider style={{ margin: '12px 0' }} />
            </div>

            {verifying ? verifyStep : (
              <>
                {tab !== 'login' && (
                  <Title className="z-auth-form-title" level={4} style={{ marginTop: 0, marginBottom: 4 }}>
                    {tab === 'forgot' ? 'Recupera tu contraseña' : 'Crea tu cuenta'}
                  </Title>
                )}
                {tab === 'forgot' && (
                  <Text style={{ color: MISIO_COLORS.textMuted, fontSize: 13, display: 'block', marginTop: 4, marginBottom: 24 }}>
                    Te ayudamos a volver a entrar.
                  </Text>
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
