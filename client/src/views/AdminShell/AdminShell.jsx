import React, { useEffect, useMemo, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import {
  Layout, Menu, Avatar, Typography, Breadcrumb, Button, Drawer, Grid, Dropdown, Tag,
} from 'antd';
import {
  DashboardOutlined, GiftOutlined, CreditCardOutlined, TeamOutlined,
  ShopOutlined, DatabaseOutlined, BookOutlined, FireOutlined,
  CalculatorOutlined, LayoutOutlined, MenuUnfoldOutlined, MenuFoldOutlined, SafetyCertificateOutlined,
  LogoutOutlined, HomeOutlined, UserOutlined, BellOutlined,
  DesktopOutlined, RocketOutlined, DollarOutlined,
} from '@ant-design/icons';
import { MISIO_COLORS } from '../../theme/misioTheme';
import { useAuth } from '../../auth/AuthContext';
import { useThemeMode } from '../../theme/ThemeProvider';
import { useSite } from '../../theme/SiteProvider';
import { api, SERVER_URL } from '../../auth/api';

const { Sider, Header, Content } = Layout;
const { Text, Title } = Typography;
const { useBreakpoint } = Grid;

/**
 * Catálogo del panel: cada entrada declara el PERMISO que exige. El menú
 * se arma con lo que cada quien puede ver — un operador de pagos no ve
 * (ni sospecha) los módulos de contabilidad o contenido.
 */
// eslint-disable-next-line react-refresh/only-export-components
export const ADMIN_MENU = [
  {
    group: 'Operación',
    items: [
      { key: '/admin', perm: 'dashboard', icon: <DashboardOutlined />, label: 'Dashboard' },
      { key: '/admin/rifas', perm: 'sorteos', icon: <GiftOutlined />, label: 'Sorteos' },
      { key: '/admin/subastas', perm: 'subastas', icon: <FireOutlined />, label: 'Subastas' },
      { key: '/admin/pagos', perm: 'pagos', icon: <CreditCardOutlined />, label: 'Pagos' },
      { key: '/admin/tienda', perm: 'tienda', icon: <ShopOutlined />, label: 'Tienda' },
      { key: '/admin/caja', perm: 'tienda', icon: <DollarOutlined />, label: 'Cierre de Caja' },
    ],
  },
  {
    group: 'Gestión',
    items: [
      { key: '/admin/erp', perm: 'erp', icon: <DatabaseOutlined />, label: 'ERP Logístico' },
      { key: '/admin/contabilidad', perm: 'contabilidad', icon: <CalculatorOutlined />, label: 'Contabilidad' },
      { key: '/admin/campanas', perm: 'marketing', icon: <RocketOutlined />, label: 'Promociones y Campañas' },
      { key: '/admin/reclamos', perm: 'reclamos', icon: <BookOutlined />, label: 'Reclamos' },
    ],
  },
  {
    group: 'Configuración',
    items: [
      { key: '/admin/usuarios', perm: 'usuarios', icon: <TeamOutlined />, label: 'Usuarios y permisos' },
      { key: '/admin/contenido', perm: 'contenido', icon: <LayoutOutlined />, label: 'Contenido y marca' },
      { key: '/admin/auditoria', perm: 'usuarios', icon: <SafetyCertificateOutlined />, label: 'Auditoría' },
      { key: '/admin/server-stats', perm: 'dashboard', icon: <DesktopOutlined />, label: 'Estado del Servidor' },
    ],
  },
];

/** ¿Este usuario puede ver este módulo? El admin ve todo. */
// eslint-disable-next-line react-refresh/only-export-components
export const canSee = (user, perm) =>
  user?.role === 'admin' || (user?.permissions ?? []).includes(perm);

const TITLES = Object.fromEntries(
  ADMIN_MENU.flatMap((g) => g.items).map((i) => [i.key, i.label]),
);

/**
 * 🖥️ SHELL DEL PANEL — barra lateral fija (estilo consola de
 * administración), cabecera con ruta y sesión, y el contenido dentro.
 * Reemplaza las pestañas: con 10 módulos, las pestañas se rompen.
 */
export default function AdminShell() {
  const { user, logout } = useAuth();
  const { mode, toggle } = useThemeMode();
  // SELLO DE VERSIÓN: qué build de panel y qué build de API están
  // corriendo. Si no coinciden, el aviso lo dice — se acabó el
  // "sigue fallando" cuando en realidad el servidor tiene código viejo.
  const [apiVersion, setApiVersion] = useState(null);
  useEffect(() => {
    api('/health')
      .then((h) => setApiVersion(h?.version ?? '?'))
      .catch(() => setApiVersion('sin conexión'));
  }, []);
  const appVersion = typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : 'dev';
  const mismatch = apiVersion && !['?', 'sin conexión'].includes(apiVersion) && apiVersion !== appVersion;
  const site = useSite();
  const location = useLocation();
  const navigate = useNavigate();
  const screens = useBreakpoint();
  const isDesktop = screens.lg;
  const [collapsed, setCollapsed] = useState(false);
  const [drawer, setDrawer] = useState(false);

  const menuItems = useMemo(
    () =>
      ADMIN_MENU.map((g) => {
        const items = g.items.filter((i) => canSee(user, i.perm));
        if (!items.length) return null;
        return {
          key: g.group,
          type: 'group',
          label: g.group,
          children: items.map((i) => ({
            key: i.key,
            icon: i.icon,
            label: <NavLink to={i.key}>{i.label}</NavLink>,
          })),
        };
      }).filter(Boolean),
    [user],
  );

  // La ruta más específica que coincide (para no resaltar "Dashboard" siempre)
  const selected = useMemo(() => {
    const keys = ADMIN_MENU.flatMap((g) => g.items).map((i) => i.key);
    const match = keys
      .filter((k) => location.pathname === k || location.pathname.startsWith(k + '/'))
      .sort((a, b) => b.length - a.length)[0];
    return match ?? '/admin';
  }, [location.pathname]);

  const brand = (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 12, padding: '20px 24px 20px',
      minHeight: 72, marginBottom: 8,
    }}>
      {site.logoUrl ? (
        <img src={`${SERVER_URL}${site.logoUrl}`} alt={site.brandName}
          style={{ width: 32, height: 32, objectFit: 'contain', borderRadius: 8, background: '#fff', padding: 2 }} />
      ) : (
        <div style={{
          width: 32, height: 32, borderRadius: 8, background: 'linear-gradient(135deg, var(--z-primary), var(--z-blue))',
          display: 'grid', placeItems: 'center', fontSize: 16, flexShrink: 0, color: '#fff',
          boxShadow: '0 4px 10px rgba(13, 148, 136, 0.3)'
        }}>⚡</div>
      )}
      {!collapsed && (
        <div style={{ overflow: 'hidden' }}>
          <div style={{ fontSize: 16, fontWeight: 800, letterSpacing: '-0.3px', lineHeight: 1.1, color: '#ffffff' }}>
            {site.brandName}
          </div>
          <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.6)', fontWeight: 500, marginTop: 2 }}>
            Workspace
          </div>
        </div>
      )}
    </div>
  );

  const sideMenu = (
    <Menu
      theme="dark"
      mode="inline"
      selectedKeys={[selected]}
      items={menuItems}
      style={{ background: 'transparent', borderInlineEnd: 'none', padding: '0 12px 24px', fontWeight: 500 }}
      onClick={() => setDrawer(false)}
    />
  );

  return (
    <Layout style={{ minHeight: '100vh', background: 'var(--z-admin-bg)' }}>
      {isDesktop ? (
        <Sider
          collapsible
          collapsed={collapsed}
          onCollapse={setCollapsed}
          trigger={null}
          width={236}
          style={{
            background: 'var(--z-admin-side)',
            borderRight: '1px solid var(--z-border)',
            position: 'fixed',
            insetInlineStart: 0,
            top: 0,
            height: '100vh',
            overflow: 'auto',
            zIndex: 20,
          }}
        >
          {brand}
          {sideMenu}
        </Sider>
      ) : (
        <Drawer
          open={drawer}
          onClose={() => setDrawer(false)}
          placement="left"
          width={260}
          styles={{ body: { padding: 0 }, header: { display: 'none' } }}
        >
          {brand}
          {sideMenu}
        </Drawer>
      )}

      <Layout style={{
        background: 'transparent',
        marginInlineStart: isDesktop ? (collapsed ? 80 : 236) : 0,
        transition: 'margin 0.2s',
      }}>
        {/* ── Cabecera del panel: Flotante estilo Web Pública ── */}
        <Header style={{
          background: 'var(--z-admin-header)',
          margin: '16px 24px 8px 24px',
          borderRadius: 999, /* Bordes completamente redondeados (píldora) */
          padding: '0 24px',
          display: 'flex',
          alignItems: 'center',
          gap: 16,
          height: 64,
          position: 'sticky',
          top: 16,
          zIndex: 10,
          boxShadow: '0 4px 20px rgba(0,0,0,0.06)',
          border: '1px solid var(--z-border)',
        }}>
          <Button
            type="text"
            icon={isDesktop
              ? (collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />)
              : <MenuUnfoldOutlined />}
            onClick={() => (isDesktop ? setCollapsed(!collapsed) : setDrawer(true))}
          />
          <Breadcrumb
            items={[
              { title: <a onClick={() => navigate('/admin')}><HomeOutlined /></a> },
              { title: TITLES[selected] ?? 'Panel' },
            ]}
          />
          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 10 }}>
            <Button type="text" onClick={toggle}
              title={mode === 'dark' ? 'Modo claro' : 'Modo oscuro'}>
              {mode === 'dark' ? '☀️' : '🌙'}
            </Button>
            <Button type="text" icon={<BellOutlined />} onClick={() => navigate('/mi-cuenta')} />
            <Dropdown
              menu={{
                items: [
                  { key: 'site', icon: <HomeOutlined />, label: 'Ver el sitio', onClick: () => navigate('/') },
                  { key: 'me', icon: <UserOutlined />, label: 'Mi perfil', onClick: () => navigate('/perfil') },
                  { type: 'divider' },
                  { key: 'out', icon: <LogoutOutlined />, danger: true, label: 'Cerrar sesión', onClick: logout },
                ],
              }}
            >
              <div style={{ 
                display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer',
                background: 'var(--z-admin-bg)', padding: '4px 12px 4px 4px', borderRadius: 999,
                border: '1px solid var(--z-border)', transition: 'background 0.2s'
              }}
              onMouseEnter={(e) => e.currentTarget.style.background = 'var(--z-bg-elevated)'}
              onMouseLeave={(e) => e.currentTarget.style.background = 'var(--z-admin-bg)'}>
                <Avatar size={32}
                  src={user?.avatarUrl ? `${SERVER_URL}${user.avatarUrl}` : undefined}
                  style={{ background: 'var(--z-primary)', border: '2px solid var(--z-bg-surface)' }} icon={<UserOutlined />} />
                {isDesktop && (
                  <div style={{ lineHeight: 1.1 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--z-text)' }}>{user?.name?.split(' ')[0]}</div>
                    <div style={{ fontSize: 10, color: user?.role === 'admin' ? MISIO_COLORS.prizeGold : MISIO_COLORS.electricBlue, fontWeight: 700 }}>
                      {user?.role?.toUpperCase()}
                    </div>
                  </div>
                )}
              </div>
            </Dropdown>
          </div>
        </Header>

        <Content style={{ padding: 'clamp(14px, 2vw, 24px)' }}>
          <Outlet />
        </Content>

        {/* Pie del panel: identifica el sistema y la sesión activa */}
        <div style={{
          padding: '10px 16px 18px', textAlign: 'center',
          color: MISIO_COLORS.textMuted, fontSize: 11,
        }}>
          {site.brandName} · Panel de administración — sesión de {user?.name}
          {' · '}<a onClick={() => navigate('/')}>ver el sitio público</a>
          <div style={{ marginTop: 4 }}>
            <Tag style={{ fontSize: 10, margin: 0 }}>panel v{appVersion}</Tag>{' '}
            <Tag color={mismatch ? 'error' : undefined} style={{ fontSize: 10, margin: 0 }}>
              API v{apiVersion ?? '…'}
            </Tag>
            {mismatch && (
              <Text style={{ fontSize: 11, color: MISIO_COLORS.danger, display: 'block', marginTop: 4 }}>
                ⚠️ El panel y la API son de versiones distintas: reinstala el
                backend (o el frontend) para que coincidan.
              </Text>
            )}
          </div>
        </div>
      </Layout>
    </Layout>
  );
}

/** Tarjeta de KPI corporativa (el "StatBox" rediseñado). */
export function StatBox({ color, value, label, icon, onClick, suffix }) {
  return (
    <div
      onClick={onClick}
      style={{
        background: 'var(--z-admin-card)',
        borderRadius: 16,
        padding: '20px 24px',
        cursor: onClick ? 'pointer' : 'default',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        boxShadow: '0 4px 12px rgba(0, 0, 0, 0.03)',
        border: '1px solid var(--z-border)',
        transition: 'transform 0.2s, box-shadow 0.2s, border-color 0.2s',
      }}
      onMouseEnter={(e) => {
        if (onClick) {
          e.currentTarget.style.transform = 'translateY(-4px)';
          e.currentTarget.style.boxShadow = '0 12px 24px rgba(0, 0, 0, 0.08)';
          e.currentTarget.style.borderColor = color;
        }
      }}
      onMouseLeave={(e) => {
        if (onClick) {
          e.currentTarget.style.transform = 'none';
          e.currentTarget.style.boxShadow = '0 4px 12px rgba(0, 0, 0, 0.03)';
          e.currentTarget.style.borderColor = 'var(--z-border)';
        }
      }}
    >
      <div>
        <div style={{ color: 'var(--z-text-muted)', fontSize: 13, fontWeight: 500, marginBottom: 4 }}>
          {label}
        </div>
        <div style={{ fontSize: 'clamp(24px, 3vw, 32px)', fontWeight: 800, color: 'var(--z-text)', lineHeight: 1 }}>
          {value}{suffix && <span style={{ fontSize: 16, marginLeft: 4 }}>{suffix}</span>}
        </div>
      </div>
      <div style={{
        width: 48, height: 48, borderRadius: 12,
        background: `color-mix(in srgb, ${color} 15%, transparent)`,
        color: color,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 24,
      }}>
        {icon}
      </div>
    </div>
  );
}
