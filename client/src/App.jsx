import React, { lazy, Suspense, useState } from 'react';
import { BrowserRouter, Routes, Route, NavLink, Outlet, useNavigate, useLocation } from 'react-router-dom';
import {
  Layout, Menu, Typography, Tag, Dropdown, Avatar, Button, Space, Skeleton, Drawer, Grid, Alert, FloatButton,
} from 'antd';
import {
  ShopOutlined, UserOutlined, GiftOutlined, TrophyOutlined, FireOutlined, TeamOutlined,
  WalletOutlined, IdcardOutlined, DashboardOutlined as DashIcon, PlayCircleOutlined, DashboardOutlined,
  ThunderboltFilled, LogoutOutlined, LoginOutlined, SmileOutlined, MenuOutlined, MailOutlined,
} from '@ant-design/icons';

import { AuthProvider, useAuth } from './auth/AuthContext';
import { Badge } from 'antd';
import { useThemeMode } from './theme/ThemeProvider';
import { useSite } from './theme/SiteProvider';
import { api, SERVER_URL } from './auth/api';
import Announcements from './components/Announcements';
import ForcePasswordChange from './components/ForcePasswordChange';

import AdminShell, { ADMIN_MENU } from './views/AdminShell/AdminShell';
import ProtectedRoute from './auth/ProtectedRoute';
import { MISIO_COLORS } from './theme/misioTheme';

// CODE-SPLITTING: cada vista es un chunk que se descarga al navegar a
// ella — el bundle inicial baja drásticamente (clave para PWA en 4G).
const MarketplaceLanding = lazy(() => import('./views/MarketplaceLanding/MarketplaceLanding'));
const UserDashboard = lazy(() => import('./views/UserDashboard/UserDashboard'));
const LiveDrawRoom = lazy(() => import('./views/LiveDrawRoom/LiveDrawRoom'));
const AdminLogisticsDashboard = lazy(() => import('./views/AdminLogisticsDashboard/AdminLogisticsDashboard'));
const AuthPage = lazy(() => import('./views/AuthPage/AuthPage'));
const ResetPassword = lazy(() => import('./views/ResetPassword/ResetPassword'));
const BingoFamiliar = lazy(() => import('./views/BingoFamiliar/BingoFamiliar'));
const AdminRaffles = lazy(() => import('./views/AdminRaffles/AdminRaffles'));
const AdminDrawPanel = lazy(() => import('./views/AdminDrawPanel/AdminDrawPanel'));
const PublicTicketList = lazy(() => import('./views/PublicTicketList/PublicTicketList'));
const RaffleDetail = lazy(() => import('./views/RaffleDetail/RaffleDetail'));
const AdminPayments = lazy(() => import('./views/AdminPayments/AdminPayments'));
const AdminUsers = lazy(() => import('./views/AdminUsers/AdminUsers'));
const AdminStore = lazy(() => import('./views/AdminStore/AdminStore'));
const AdminCashRegister = lazy(() => import('./views/AdminCashRegister/AdminCashRegister'));
const StoreFront = lazy(() => import('./views/StoreFront/StoreFront'));
const Winners = lazy(() => import('./views/Winners/Winners'));
const LegalPage = lazy(() => import('./views/LegalPage/LegalPage'));
const Landing = lazy(() => import('./views/Landing/Landing'));
const MiPerfil = lazy(() => import('./views/MiPerfil/MiPerfil'));
const Reclamaciones = lazy(() => import('./views/Reclamaciones/Reclamaciones'));
const Nosotros = lazy(() => import('./views/Nosotros/Nosotros'));
const AuctionsList = lazy(() => import('./views/AuctionsList/AuctionsList'));
const AuctionRoom = lazy(() => import('./views/AuctionRoom/AuctionRoom'));
const AdminAuctions = lazy(() => import('./views/AdminAuctions/AdminAuctions'));
const AdminAuctionPanel = lazy(() => import('./views/AdminAuctionPanel/AdminAuctionPanel'));
const AdminAudit = lazy(() => import('./views/AdminAudit/AdminAudit'));
const AdminAccounting = lazy(() => import('./views/AdminAccounting/AdminAccounting'));
const AdminContent = lazy(() => import('./views/AdminContent/AdminContent'));
const AdminComplaints = lazy(() => import('./views/AdminComplaints/AdminComplaints'));
const AdminDashboard = lazy(() => import('./views/AdminDashboard/AdminDashboard'));
const AdminSystemStats = lazy(() => import('./views/AdminSystemStats/AdminSystemStats'));
const AdminCampaigns = lazy(() => import('./views/AdminCampaigns/AdminCampaigns'));
const TicketValidation = lazy(() => import('./views/TicketValidation/TicketValidation'));

const { Header, Content, Footer } = Layout;
const { useBreakpoint } = Grid;

/** Qué ítem del nav se resalta según la ruta actual. */
const navKey = (path) => {
  if (path.startsWith('/admin')) return '/admin';
  if (path === '/' || path === '/bienvenido') return '/sorteos';
  return path;
};

/**
 * Navegación según rol. El usuario NO ve "En Vivo": al sorteo se entra
 * desde el card de la rifa cuando está en vivo. El personal (admin u
 * operador) ve UN solo ítem "Admin" — dentro está todo con su dashboard.
 */
function buildNavItems(role, auctionsEnabled = false, isDesktop = true) {
  const items = [
    { key: '/sorteos', path: '/sorteos', text: 'Sorteos', icon: <GiftOutlined />, label: <NavLink to="/sorteos">Sorteos</NavLink> },
    { key: '/tienda', path: '/tienda', text: 'Tienda', icon: <ShopOutlined />, label: <NavLink to="/tienda">Tienda</NavLink> },
    ...(auctionsEnabled ? [{ key: '/subastas', path: '/subastas', text: 'Subastas', icon: <FireOutlined />, label: <NavLink to="/subastas">Subastas</NavLink> }] : []),
    { key: '/ganadores', path: '/ganadores', text: 'Ganadores', icon: <TrophyOutlined />, label: <NavLink to="/ganadores">Ganadores</NavLink> },
    { key: '/bingo', path: '/bingo', text: 'Bingo', icon: <SmileOutlined />, label: <NavLink to="/bingo">Bingo Gratis</NavLink> },
  ];

  if (isDesktop) {
    items.push({ key: '/nosotros', path: '/nosotros', text: 'Nosotros', icon: <TeamOutlined />, label: <NavLink to="/nosotros">Nosotros</NavLink> });
  } else {
    items.push({ key: '/mi-cuenta', path: '/mi-cuenta', text: 'Mi cuenta', icon: <UserOutlined />, label: <NavLink to="/mi-cuenta">Mi cuenta</NavLink> });
  }

  return items;
}

/** Esquina derecha del header: avatar + logout, o botón de ingreso. */
/**
 * Portada inteligente: el VISITANTE ve el landing (necesita entender y
 * confiar antes de comprar); el usuario logueado ya está convencido y
 * entra directo a los sorteos. El landing sigue disponible en /bienvenido.
 */
function Home() {
  const { user } = useAuth();
  return user ? <MarketplaceLanding /> : <Landing />;
}

function ThemeToggle() {
  const { mode, toggle } = useThemeMode();
  return (
    <Button
      type="text"
      onClick={toggle}
      title={mode === 'dark' ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'}
      style={{ fontSize: 16 }}
    >
      {mode === 'dark' ? '☀️' : '🌙'}
    </Button>
  );
}

function UnreadBadge() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [count, setCount] = React.useState(0);

  React.useEffect(() => {
    if (!user) return;
    const load = () => {
      api('/inbox/unread').then(res => setCount(res.count)).catch(() => {});
    };
    load();
    const interval = setInterval(load, 30000); // Polling cada 30s
    return () => clearInterval(interval);
  }, [user]);

  if (!user) return null;

  return (
    <Badge count={count} size="small" offset={[-12, 6]}>
      <Button 
        type="text" 
        icon={<MailOutlined style={{ fontSize: 18 }} />} 
        onClick={() => navigate('/mi-cuenta?tab=2')}
        style={{ marginRight: 8 }}
      />
    </Badge>
  );
}

function SessionCorner({ compact }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  if (!user) {
    return (
      <Button type="primary" icon={<LoginOutlined />} onClick={() => navigate('/login')}>
        {compact ? '' : 'Ingresar'}
      </Button>
    );
  }

  const isStaff = ['admin', 'operator', 'presenter'].includes(user.role)
    && (user.role === 'admin' || (user.permissions ?? []).length > 0);
  // A dónde entra cada quien: su primer módulo permitido
  const staffHome = user.role === 'admin'
    ? '/admin'
    : (ADMIN_MENU.flatMap((g) => g.items).find((i) => (user.permissions ?? []).includes(i.perm))?.key ?? '/admin');

  return (
    <Dropdown
      menu={{
        style: { padding: '8px', borderRadius: '16px', boxShadow: '0 20px 40px rgba(0,0,0,0.15)', minWidth: 220 },
        items: [
          {
            key: 'header',
            label: (
              <div style={{ padding: '4px', display: 'flex', flexDirection: 'column' }}>
                <span style={{ fontWeight: 800, color: '#0f172a', fontSize: 14 }}>{user.name}</span>
                <span style={{ fontSize: 12, color: '#64748b' }}>{user.email || 'Usuario'}</span>
              </div>
            ),
            disabled: true,
            style: { cursor: 'default' }
          },
          { type: 'divider' },
          {
            key: 'mi-misio',
            icon: <WalletOutlined style={{ fontSize: 16, color: '#047857' }} />,
            label: <span style={{ fontWeight: 600, color: '#334155' }}>Mi Saldo</span>,
            onClick: () => navigate('/mi-cuenta'),
            style: { padding: '10px 14px', borderRadius: 8, marginBottom: 4 }
          },
          {
            key: 'perfil',
            icon: <IdcardOutlined style={{ fontSize: 16, color: '#0284c7' }} />,
            label: <span style={{ fontWeight: 600, color: '#334155' }}>Mi Perfil</span>,
            onClick: () => navigate('/perfil'),
            style: { padding: '10px 14px', borderRadius: 8 }
          },

          // El panel de administración solo aparece para el personal
          ...(isStaff
            ? [{ type: 'divider' },
               {
                 key: 'admin',
                 icon: <DashIcon style={{ fontSize: 16, color: '#d97706' }} />,
                 label: <span style={{ fontWeight: 600, color: '#334155' }}>{user.role === 'admin' ? 'Panel de Administración'
                   : user.role === 'operator' ? 'Panel de Pagos'
                   : 'Panel de Sorteos'}</span>,
                 onClick: () => navigate(staffHome),
                 style: { padding: '10px 14px', borderRadius: 8 }
               }]
            : []),
          { type: 'divider' },
          {
            key: 'logout',
            icon: <LogoutOutlined style={{ fontSize: 16, color: '#ef4444' }} />,
            label: <span style={{ fontWeight: 600, color: '#ef4444' }}>Cerrar sesión</span>,
            onClick: () => {
              logout();
              navigate('/');
            },
            style: { padding: '10px 14px', borderRadius: 8 }
          },
        ],
      }}
    >
      <Space style={{ cursor: 'pointer' }} size={6}>
        <Avatar 
          style={{ background: MISIO_COLORS.primary }} 
          src={user.avatarUrl ? `${SERVER_URL}${user.avatarUrl}` : undefined}
          icon={!user.avatarUrl ? <UserOutlined /> : undefined} 
        />
        {/* En móvil solo el avatar: el nombre no cabe junto al menú */}
        {!compact && <span>{user.name.split(' ')[0]}</span>}
        {!compact && user.role === 'admin' && <Tag color={MISIO_COLORS.prizeGold}>ADMIN</Tag>}
      </Space>
    </Dropdown>
  );
}

function MobileBottomNav({ items, currentPath }) {
  return (
    <div style={{
      position: 'fixed',
      bottom: 0,
      left: 0,
      right: 0,
      height: 58,
      background: 'color-mix(in srgb, var(--z-header-bg) 85%, transparent)',
      borderTop: 'none',
      boxShadow: '0 -6px 30px rgba(0,0,0,0.12)',
      display: 'flex',
      justifyContent: 'space-around',
      alignItems: 'center',
      zIndex: 1000,
      backdropFilter: 'blur(30px)',
      WebkitBackdropFilter: 'blur(30px)',
      paddingBottom: 'env(safe-area-inset-bottom, 0px)'
    }}>
      {/* Línea dorada en toda la barra */}
      <div style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        height: 1,
        background: 'linear-gradient(90deg, #10b981, #6ee7b7, #10b981)',
        boxShadow: '0 1px 4px rgba(16, 185, 129, 0.3)'
      }} />
      {items.slice(0, 6).map(item => {
        const isActive = navKey(currentPath) === item.key;
        return (
          <NavLink key={item.key} to={item.path} style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            color: isActive ? 'var(--z-primary)' : 'var(--z-text-muted)',
            fontSize: 10,
            fontWeight: isActive ? 700 : 500,
            textDecoration: 'none',
            flex: 1,
            height: '100%',
            position: 'relative',
          }}>
            <div style={{
              position: 'relative',
              width: 48,
              height: 30,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: 15,
              background: isActive ? 'color-mix(in srgb, var(--z-primary) 22%, transparent)' : 'transparent',
              transition: 'background 0.2s',
              marginBottom: 4,
            }}>
              <div style={{ fontSize: 22, transition: 'transform 0.2s', transform: isActive ? 'scale(1.15)' : 'scale(1)' }}>
                {item.icon}
              </div>
            </div>
            <span style={{ 
              whiteSpace: 'nowrap', 
              overflow: 'hidden', 
              textOverflow: 'ellipsis', 
              maxWidth: '90%',
              transition: 'color 0.2s' 
            }}>
              {item.text}
            </span>
          </NavLink>
        );
      })}
    </div>
  );
}

/**
 * Shell responsive:
 * - Desktop (≥ lg): menú horizontal en el header.
 * - Móvil/tablet: botón hamburguesa → Drawer con el menú vertical.
 *   (El Menu horizontal de AntD no comprime bajo 390px y forzaba
 *   scroll horizontal en toda la app — este era EL bug móvil.)
 */
/**
 * PublicShell — el sitio de cara al público (cabecera, menú, footer,
 * invitación a instalar). El panel de administración y el login NO viven
 * aquí: son aplicaciones aparte, con su propia pantalla completa.
 */
function PublicShell() {
  const [maintenance, setMaintenance] = React.useState(null);
  const [auctionsEnabled, setAuctionsEnabled] = React.useState(false);

  React.useEffect(() => {
    api('/settings/maintenance')
      .then(setMaintenance)
      .catch(() => {});

    api('/auctions/flag')
      .then(res => setAuctionsEnabled(res.enabled))
      .catch(() => {});

    const onMaint = (e) => setMaintenance({ enabled: true, ...e.detail });
    window.addEventListener('misio:maintenance', onMaint);
    return () => window.removeEventListener('misio:maintenance', onMaint);
  }, []);

  const site = useSite();
  const { user } = useAuth();
  const screens = useBreakpoint();
  const location = useLocation();
  const navigate = useNavigate();
  const [drawerOpen, setDrawerOpen] = useState(false);

  const isDesktop = screens.lg; // ≥ 992px
  const navItems = buildNavItems(user?.role, auctionsEnabled, isDesktop);

  if (maintenance?.enabled) {
    return <MaintenanceScreen maintenance={maintenance} />;
  }

  return (
    <Layout style={{ minHeight: '100vh', background: 'transparent' }}>
        {/* Efecto blur de fondo para la parte superior (detrás del header) */}
        <div style={{
          position: 'fixed',
          top: 0, left: 0, right: 0, height: isDesktop ? 96 : 76,
          zIndex: 999, // Un nivel por debajo del header
          pointerEvents: 'none',
          backdropFilter: 'blur(12px)',
          WebkitBackdropFilter: 'blur(12px)',
          background: 'linear-gradient(to bottom, color-mix(in srgb, var(--z-bg-layout) 80%, transparent) 0%, transparent 100%)',
          maskImage: 'linear-gradient(to bottom, black 40%, transparent 100%)',
          WebkitMaskImage: 'linear-gradient(to bottom, black 40%, transparent 100%)'
        }} />

        <Header
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: isDesktop ? 24 : 12,
            paddingInline: 'clamp(16px, 4vw, 36px)',
            background: 'var(--z-header-bg)',
            border: '1px solid color-mix(in srgb, var(--z-border) 40%, transparent)',
            position: 'fixed',
            top: isDesktop ? 16 : 8,
            left: 16,
            right: 16,
            zIndex: 1000,
            borderRadius: 100,
            boxShadow: '0 8px 32px rgba(0,0,0,0.08)',
            lineHeight: isDesktop ? '48px' : '40px',
            height: isDesktop ? 64 : 52,
          }}
        >
        {/* En móvil la hamburguesa ya no se usa, tenemos bottom nav */}
        
        <Typography.Title
          level={4}
          onClick={() => navigate('/')}
          style={{ margin: 0, whiteSpace: 'nowrap', flex: isDesktop ? 'none' : 1, cursor: 'pointer',
            display: 'flex', alignItems: 'center', gap: 8, overflow: 'hidden', textOverflow: 'ellipsis' }}
        >
          {site.logoUrl ? (
            <img src={`${SERVER_URL}${site.logoUrl}`} alt={site.brandName} style={{ height: 28, objectFit: 'contain' }} />
          ) : site.loading ? (
            <Skeleton.Avatar active size="small" shape="circle" style={{ width: 28, height: 28, minWidth: 28 }} />
          ) : (
            <div style={{ color: MISIO_COLORS.primary, fontWeight: 900, fontStyle: 'italic', fontSize: 24, lineHeight: 1, padding: '0 4px' }}>M</div>
          )}
          {site.brandName}
        </Typography.Title>

        {/* Menú horizontal solo en desktop */}
        {isDesktop && (
          <Menu
            mode="horizontal"
            selectedKeys={[navKey(location.pathname)]}
            items={navItems}
            style={{ flex: 1, background: 'transparent', borderBottom: 'none' }}
          />
        )}

        <Space size={0} align="center">
          <ThemeToggle />
          <UnreadBadge />
          <SessionCorner compact={!isDesktop} />
        </Space>
      </Header>

      {/* Mantenimiento ahora usa pantalla completa, este alert ya no es necesario aquí */}

      <Content style={{ paddingTop: isDesktop ? 104 : 76, paddingLeft: 'clamp(12px, 4vw, 48px)', paddingRight: 'clamp(12px, 4vw, 48px)', paddingBottom: isDesktop ? 24 : 135 }}>
        <div className="z-content">
          <Suspense
            fallback={
              <div style={{ display: 'flex', flexDirection: 'column', gap: 20, minHeight: '50vh', padding: 24 }}>
                <Skeleton.Input active block style={{ height: 200, borderRadius: 16 }} />
                <Skeleton active paragraph={{ rows: 4 }} />
              </div>
            }
          >
            <Outlet />
          </Suspense>
        </div>
      </Content>

      <Footer style={{ background: 'transparent', textAlign: 'center', paddingTop: 8,
        borderTop: '1px solid var(--z-border)', marginTop: 24 }}>
        <div className="z-content">
          <div style={{ fontWeight: 700, marginBottom: 10 }}>⚡ {site.brandName}</div>
          <Space wrap size={18} style={{ justifyContent: 'center' }}>
            <NavLink to="/nosotros" style={{ fontSize: 12 }}>Quiénes somos</NavLink>
            <NavLink to="/ganadores" style={{ fontSize: 12 }}>Ganadores</NavLink>
            <NavLink to="/reclamaciones" style={{ fontSize: 12 }}>📕 Libro de Reclamaciones</NavLink>
            <NavLink to="/como-funciona" style={{ fontSize: 12 }}>Cómo funciona</NavLink>
            <NavLink to="/terminos" style={{ fontSize: 12 }}>Términos</NavLink>
            <NavLink to="/privacidad" style={{ fontSize: 12 }}>Privacidad</NavLink>
          </Space>
          <div style={{ fontSize: 11, color: 'var(--z-text-muted)', marginTop: 10 }}>
            Perú · Sorteos transparentes con Cashback Garantizado · Solo mayores de 18 años
          </div>
        </div>
      </Footer>
      
      {!isDesktop && <MobileBottomNav items={navItems} currentPath={location.pathname} />}

      {/* Botón flotante para subir (BackTop) */}
      <FloatButton.BackTop 
        shape="circle"
        type="primary"
        style={{ right: 24, bottom: isDesktop ? 24 : 135 }}
        tooltip={<div>Volver arriba</div>}
      />
    </Layout>
  );
}

/** Rutas del panel: se declaran aparte para que el archivo respire. */
function AdminRoutes() {
  return (
    <Route
      path="/admin"
      element={
        <ProtectedRoute roles={['admin', 'operator', 'presenter', 'seller']}>
          <AdminShell />
        </ProtectedRoute>
      }
    >
      <Route index element={<ProtectedRoute perm="dashboard"><AdminDashboard /></ProtectedRoute>} />
      <Route path="rifas" element={<ProtectedRoute perm="sorteos"><AdminRaffles /></ProtectedRoute>} />
      <Route path="sorteo/:id" element={<ProtectedRoute perm="sorteos"><AdminDrawPanel /></ProtectedRoute>} />
      <Route path="pagos" element={<ProtectedRoute perm="pagos"><AdminPayments /></ProtectedRoute>} />
      <Route path="usuarios" element={<ProtectedRoute perm="usuarios"><AdminUsers /></ProtectedRoute>} />
      <Route path="reclamos" element={<ProtectedRoute perm="reclamos"><AdminComplaints /></ProtectedRoute>} />
      <Route path="subastas" element={<ProtectedRoute perm="subastas"><AdminAuctions /></ProtectedRoute>} />
      <Route path="subasta/:id" element={<ProtectedRoute perm="subastas"><AdminAuctionPanel /></ProtectedRoute>} />
      <Route path="contabilidad" element={<ProtectedRoute perm="contabilidad"><AdminAccounting /></ProtectedRoute>} />
      <Route path="contenido" element={<ProtectedRoute perm="contenido"><AdminContent /></ProtectedRoute>} />
      <Route path="campanas" element={<ProtectedRoute perm="marketing"><AdminCampaigns /></ProtectedRoute>} />
      <Route path="tienda" element={<ProtectedRoute perm="tienda"><AdminStore /></ProtectedRoute>} />
      <Route path="caja" element={<ProtectedRoute roles={['admin', 'seller']}><AdminCashRegister /></ProtectedRoute>} />
      <Route path="erp" element={<ProtectedRoute perm="erp"><AdminLogisticsDashboard /></ProtectedRoute>} />
      <Route path="auditoria" element={<ProtectedRoute roles={['admin']}><AdminAudit /></ProtectedRoute>} />
      <Route path="server-stats" element={<ProtectedRoute perm="dashboard"><AdminSystemStats /></ProtectedRoute>} />
    </Route>
  );
}

/**
 * TRES MUNDOS SEPARADOS:
 *  1. /login          → pantalla completa, sin cabecera pública.
 *  2. /admin/*        → panel propio (su layout, su cabecera, su menú):
 *                       es un sistema de administración aparte, no una
 *                       página más del sitio.
 *  3. el resto        → sitio público dentro de PublicShell.
 */

function MaintenanceScreen({ maintenance }) {
  const site = useSite();
  const navigate = useNavigate();
  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'var(--z-bg-layout)',
      padding: 20,
      textAlign: 'center'
    }}>
      {site.logoUrl ? (
        <img src={`${SERVER_URL}${site.logoUrl}`} alt="Logo" style={{ height: 60, marginBottom: 24, objectFit: 'contain' }} />
      ) : (
        <div style={{ fontSize: 60, color: 'var(--z-primary)', marginBottom: 24, fontWeight: 900, fontStyle: 'italic', lineHeight: 1 }}>M</div>
      )}
      <Typography.Title level={2} style={{ marginBottom: 16 }}>
        Volvemos en breve
      </Typography.Title>
      <Typography.Text style={{ fontSize: 18, color: 'var(--z-text-muted)', maxWidth: 500, display: 'block', marginBottom: 32 }}>
        {maintenance.message || 'Estamos realizando tareas de mantenimiento para mejorar la plataforma.'}
      </Typography.Text>
      
      {maintenance.resumeAt && (
        <div style={{ background: 'var(--z-bg-surface)', padding: '24px 40px', borderRadius: 16, border: '1px solid var(--z-border)' }}>
          <Typography.Text style={{ display: 'block', marginBottom: 8, color: 'var(--z-text-muted)' }}>
            TIEMPO ESTIMADO
          </Typography.Text>
          <Typography.Title level={3} style={{ margin: 0, color: 'var(--z-primary)' }}>
            <CountdownDisplay resumeAt={maintenance.resumeAt} />
          </Typography.Title>
        </div>
      )}

      {/* Acceso directo para que los admins no queden por fuera */}
      <div style={{ position: 'absolute', bottom: 24 }}>
        <Button type="link" onClick={() => navigate('/login')} style={{ color: 'var(--z-text-muted)' }}>
          Acceso Administrativo
        </Button>
      </div>
    </div>
  );
}

function CountdownDisplay({ resumeAt }) {
  const [left, setLeft] = React.useState('');
  React.useEffect(() => {
    const tick = () => {
      const diff = new Date(resumeAt).getTime() - Date.now();
      if (diff <= 0) { setLeft('¡Ya estamos de vuelta! Recarga la página.'); return; }
      const h = Math.floor(diff / 3600000);
      const m = Math.floor((diff % 3600000) / 60000);
      const s = Math.floor((diff % 60000) / 1000);
      
      const pad = (n) => n.toString().padStart(2, '0');
      setLeft(`${h > 0 ? h + ':' : ''}${pad(m)}:${pad(s)}`);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [resumeAt]);
  return <span>{left}</span>;
}

function CountdownBanner({ resumeAt }) {
  const [left, setLeft] = React.useState('');
  React.useEffect(() => {
    const tick = () => {
      const diff = new Date(resumeAt).getTime() - Date.now();
      if (diff <= 0) { setLeft(' — ¡ya deberíamos estar de vuelta!'); return; }
      const h = Math.floor(diff / 3600000);
      const m = Math.floor((diff % 3600000) / 60000);
      const s = Math.floor((diff % 60000) / 1000);
      setLeft(` — volvemos en ${h > 0 ? h + 'h ' : ''}${m}m ${s}s`);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [resumeAt]);
  return <strong>{left}</strong>;
}

function NotFound() {
  return (
    <div style={{ textAlign: 'center', padding: '80px 20px' }}>
      <Typography.Title level={1} style={{ fontSize: 72, margin: 0 }}>404</Typography.Title>
      <Typography.Text style={{ fontSize: 16, display: 'block', marginBottom: 20 }}>
        Esta página no existe o fue movida.
      </Typography.Text>
      <Button type="primary" href="/">Volver al inicio</Button>
    </div>
  );
}

function DocumentTitleManager() {
  React.useEffect(() => {
    let originalTitle = document.title;
    const onVisibilityChange = () => {
      if (document.hidden) {
        originalTitle = document.title;
        document.title = '¡Regresa, hay sorteos! 🎁';
      } else {
        document.title = originalTitle;
      }
    };
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => document.removeEventListener('visibilitychange', onVisibilityChange);
  }, []);
  return null;
}

export default function App() {
  return (
    <AuthProvider>
      <DocumentTitleManager />
      <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <Suspense
          fallback={
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20, minHeight: '100vh', padding: 24 }}>
              <Skeleton.Input active block style={{ height: 60, borderRadius: 8 }} />
              <Skeleton.Input active block style={{ height: 300, borderRadius: 16 }} />
              <Skeleton active paragraph={{ rows: 6 }} />
            </div>
          }
        >
          <Announcements />
          <ForcePasswordChange />

          <Routes>
            {/* 1 · Acceso */}
            <Route path="/login" element={<AuthPage />} />
            <Route path="/reset-password" element={<ResetPassword />} />

            {/* 2 · Panel de administración (aplicación aparte) */}
            {AdminRoutes()}

            {/* 3 · Sitio público */}
            <Route element={<PublicShell />}>
              <Route path="/" element={<Home />} />
              <Route path="/sorteos" element={<MarketplaceLanding />} />
              <Route path="/bienvenido" element={<Landing />} />
              <Route path="/tienda" element={<StoreFront />} />
              <Route path="/ganadores" element={<Winners />} />
              <Route path="/como-funciona" element={<LegalPage which="howItWorks" />} />
              <Route path="/terminos" element={<LegalPage which="terms" />} />
              <Route path="/privacidad" element={<LegalPage which="privacy" />} />
              <Route path="legal" element={<LegalPage />} />
              <Route path="nosotros" element={<Nosotros />} />
              <Route path="validar" element={<TicketValidation />} />
              <Route path="libro-de-reclamaciones" element={<Reclamaciones />} />
              <Route path="/reclamaciones" element={<Reclamaciones />} />
              <Route path="/nosotros" element={<Nosotros />} />
              <Route path="/subastas" element={<AuctionsList />} />
              <Route path="/subasta/:id" element={<ProtectedRoute><AuctionRoom /></ProtectedRoute>} />
              <Route path="/bingo" element={<BingoFamiliar />} />
              <Route path="/rifa/:id" element={<RaffleDetail />} />
              <Route path="/lista/:raffleId" element={<PublicTicketList />} />
              <Route path="/en-vivo/:id?" element={<LiveDrawRoom />} />
              <Route path="/mi-cuenta" element={<ProtectedRoute><UserDashboard /></ProtectedRoute>} />
              <Route path="/perfil" element={<ProtectedRoute><MiPerfil /></ProtectedRoute>} />
              <Route path="*" element={<NotFound />} />
            </Route>
          </Routes>
        </Suspense>
      </BrowserRouter>
    </AuthProvider>
  );
}
