import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Alert, Card, Col, Row, Tag, Typography, Statistic, Divider, Empty, List, Button, Space } from 'antd';
import { DownloadOutlined } from '@ant-design/icons';
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, Tooltip as RTooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import {
  RiseOutlined, WalletOutlined, FireOutlined, ClockCircleOutlined,
  ShoppingCartOutlined, TeamOutlined, GiftOutlined, InboxOutlined,
} from '@ant-design/icons';
import { MISIO_COLORS } from '../../theme/misioTheme';
import { useApiOrMock } from '../../hooks/useApiOrMock';
import { SERVER_URL, tokenStore } from '../../auth/api';
import { useAuth } from '../../auth/AuthContext';
import { StatBox } from '../AdminShell/AdminShell';

const { Title, Text } = Typography;

const MOCK_STATS = {
  ticketRevenue: 4820, walletLiability: 1290, ticketsSold: 964, totalUsers: 218,
  bannedUsers: 1, activeRaffles: 3, liveRaffles: 1, pendingDeposits: 4,
  pendingRedemptions: 2, storeRevenue: 1450,
};

/**
 * 📊 DASHBOARD (/admin) — la primera pantalla del panel.
 *
 * Arriba, las 4 cajas de color con lo ACCIONABLE (lo que hace que abras
 * el panel: pagos por verificar, canjes por atender). Abajo, las cifras
 * de contexto. Cada caja lleva a su módulo: el dashboard no es un
 * adorno, es un tablero de tareas.
 */
export default function AdminDashboard() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { data: s, demo } = useApiOrMock('/stats/admin', MOCK_STATS);

  const money = (v) => `S/ ${Number(v ?? 0).toLocaleString('es-PE', { minimumFractionDigits: 2 })}`;

  return (
    <div>
      {demo && (
        <Alert type="info" showIcon style={{ marginBottom: 16 }}
          message="Modo demo: estadísticas ficticias (backend no conectado)." />
      )}

      <Title level={4} style={{ marginTop: 0 }}>
        Hola, {user?.name?.split(' ')[0]} 👋
      </Title>
      <Text style={{ color: MISIO_COLORS.textMuted }}>
        Esto es lo que necesita tu atención hoy.
      </Text>

      {/* ── Lo accionable: cajas de color que llevan al módulo ────── */}
      <Row gutter={[14, 14]} style={{ marginTop: 16 }}>
        <Col xs={12} lg={6}>
          <StatBox
            color="#3c8dbc"
            value={s.pendingDeposits}
            label="Pagos por verificar"
            icon={<ClockCircleOutlined />}
            onClick={() => navigate('/admin/pagos')}
          />
        </Col>
        <Col xs={12} lg={6}>
          <StatBox
            color="#00a65a"
            value={s.pendingRedemptions}
            label="Canjes por atender"
            icon={<ShoppingCartOutlined />}
            onClick={() => navigate('/admin/tienda')}
          />
        </Col>
        <Col xs={12} lg={6}>
          <StatBox
            color="#f39c12"
            value={s.activeRaffles}
            label="Sorteos en venta"
            icon={<GiftOutlined />}
            onClick={() => navigate('/admin/rifas')}
          />
        </Col>
        <Col xs={12} lg={6}>
          <StatBox
            color="#dd4b39"
            value={s.liveRaffles}
            label="Sorteos EN VIVO"
            icon={<FireOutlined />}
            onClick={() => navigate('/admin/rifas')}
          />
        </Col>
      </Row>

      {/* ── Cifras de contexto ───────────────────────────────────── */}
      <Row gutter={[14, 14]} style={{ marginTop: 14 }}>
        <Col xs={12} md={8} xl={6}>
          <Card size="small">
            <Statistic
              title={<Text style={{ color: MISIO_COLORS.textMuted, fontSize: 12 }}>Ingresos por boletos</Text>}
              value={s.ticketRevenue} prefix="S/ " precision={2}
              valueStyle={{ color: MISIO_COLORS.saldoGreen, fontWeight: 700 }}
            />
            <Text style={{ fontSize: 11, color: MISIO_COLORS.textMuted }}>
              <RiseOutlined /> detalle en <Link to="/admin/contabilidad">Contabilidad</Link>
            </Text>
          </Card>
        </Col>
        <Col xs={12} md={8} xl={6}>
          <Card size="small">
            <Statistic
              title={<Text style={{ color: MISIO_COLORS.textMuted, fontSize: 12 }}>Saldo vivo en billeteras</Text>}
              value={s.walletLiability} prefix="S/ " precision={2}
              valueStyle={{ fontWeight: 700 }}
            />
            <Text style={{ fontSize: 11, color: MISIO_COLORS.textMuted }}>
              <WalletOutlined /> es dinero que les debes
            </Text>
          </Card>
        </Col>
        <Col xs={12} md={8} xl={6}>
          <Card size="small">
            <Statistic
              title={<Text style={{ color: MISIO_COLORS.textMuted, fontSize: 12 }}>Boletos vendidos</Text>}
              value={s.ticketsSold}
              valueStyle={{ color: MISIO_COLORS.electricBlue, fontWeight: 700 }}
            />
            <Text style={{ fontSize: 11, color: MISIO_COLORS.textMuted }}>
              <InboxOutlined /> histórico
            </Text>
          </Card>
        </Col>
        <Col xs={12} md={8} xl={6}>
          <Card size="small">
            <Statistic
              title={<Text style={{ color: MISIO_COLORS.textMuted, fontSize: 12 }}>Usuarios registrados</Text>}
              value={s.totalUsers}
              valueStyle={{ fontWeight: 700 }}
            />
            <Text style={{ fontSize: 11, color: MISIO_COLORS.textMuted }}>
              <TeamOutlined />{' '}
              {s.bannedUsers > 0
                ? <Tag color="error" style={{ margin: 0 }}>{s.bannedUsers} suspendido(s)</Tag>
                : 'todos activos'}
            </Text>
          </Card>
        </Col>
      </Row>

      <TrendCharts />

      {/* ── Salud del servidor ───────────────────────────────────── */}
      <SystemHealth />

      {/* ── Atajos ───────────────────────────────────────────────── */}
      <Card size="small" title="Accesos rápidos" style={{ marginTop: 14 }}>
        <List
          size="small"
          dataSource={[
            { t: '🎟️ Crear un sorteo nuevo', to: '/admin/rifas' },
            { t: '💵 Verificar pagos Yape pendientes', to: '/admin/pagos' },
            { t: '🎨 Editar el contenido de la portada', to: '/admin/contenido' },
            { t: '📒 Ver el libro mayor del mes', to: '/admin/contabilidad' },
            { t: '👥 Dar permisos a un colaborador', to: '/admin/usuarios' },
          ]}
          renderItem={(i) => (
            <List.Item>
              <Link to={i.to}>{i.t}</Link>
            </List.Item>
          )}
        />
      </Card>
    </div>
  );
}

const MOCK_TRENDS = {
  days: 30,
  signups: Array.from({ length: 30 }, (_, i) => ({ date: `2026-06-${String(i + 1).padStart(2, '0')}`, value: Math.floor(Math.random() * 12) })),
  deposits: Array.from({ length: 30 }, (_, i) => ({ date: `2026-06-${String(i + 1).padStart(2, '0')}`, value: Math.floor(Math.random() * 800) })),
};

function TrendCharts() {
  const { data: t } = useApiOrMock('/stats/trends?days=30', MOCK_TRENDS);
  const downloadCsv = async (kind) => {
    try {
      const token = tokenStore.get();
      const res = await fetch(`${SERVER_URL}/api/v1/stats/export/${kind}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) throw new Error('export');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = `${kind}.csv`; a.click();
      URL.revokeObjectURL(url);
    } catch { /* silencioso */ }
  };
  const fmtDate = (d) => d?.slice(5);
  return (
    <>
      <Row gutter={[14, 14]} style={{ marginTop: 14 }}>
        <Col xs={24} lg={12}>
          <Card size="small" title="📈 Registros por día (últimos 30)">
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={t?.signups ?? []}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                <XAxis dataKey="date" tickFormatter={fmtDate} tick={{ fontSize: 10 }} interval={5} />
                <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
                <RTooltip labelFormatter={fmtDate} />
                <Line type="monotone" dataKey="value" stroke="#0d9488" strokeWidth={2} dot={false} name="Registros" />
              </LineChart>
            </ResponsiveContainer>
          </Card>
        </Col>
        <Col xs={24} lg={12}>
          <Card size="small" title="💰 Recargas confirmadas por día (S/)">
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={t?.deposits ?? []}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                <XAxis dataKey="date" tickFormatter={fmtDate} tick={{ fontSize: 10 }} interval={5} />
                <YAxis tick={{ fontSize: 10 }} />
                <RTooltip labelFormatter={fmtDate} formatter={(v) => [`S/ ${v}`, 'Recargas']} />
                <Bar dataKey="value" fill="#22c55e" radius={[3, 3, 0, 0]} name="Recargas" />
              </BarChart>
            </ResponsiveContainer>
          </Card>
        </Col>
      </Row>
      <Card size="small" title="📊 Exportar datos (CSV para Excel)" style={{ marginTop: 14 }}>
        <Space wrap>
          <Button icon={<DownloadOutlined />} onClick={() => downloadCsv('users')}>Usuarios</Button>
          <Button icon={<DownloadOutlined />} onClick={() => downloadCsv('deposits')}>Recargas</Button>
          <Button icon={<DownloadOutlined />} onClick={() => downloadCsv('raffles')}>Sorteos</Button>
        </Space>
      </Card>
    </>
  );
}

function SystemHealth() {
  const [health, setHealth] = React.useState(null);
  const [checking, setChecking] = React.useState(false);
  const load = React.useCallback(async () => {
    setChecking(true);
    try {
      const token = tokenStore.get();
      const res = await fetch(`${SERVER_URL}/api/v1/health/system`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      setHealth(await res.json());
    } catch {
      setHealth({ error: true });
    } finally { setChecking(false); }
  }, []);
  React.useEffect(() => { load(); }, [load]);

  const COLOR = { ok: '#22c55e', warning: '#f59e0b', error: '#f0526b', info: '#38bdf8', unknown: '#999' };
  const ICON = { ok: '✅', warning: '⚠️', error: '❌', info: 'ℹ️', unknown: '❔' };

  return (
    <Card size="small" title="🩺 Salud del servidor" style={{ marginTop: 14 }}
      extra={<Button size="small" loading={checking} onClick={load}>Revisar de nuevo</Button>}>
      {!health ? (
        <Typography.Text type="secondary">Consultando...</Typography.Text>
      ) : health.error ? (
        <Alert type="error" showIcon message="No se pudo consultar /health/system — ¿el backend está corriendo?" />
      ) : (
        <>
          <Space wrap size={16} style={{ marginBottom: 12, fontSize: 12 }}>
            <span>Versión API: <b>{health.version}</b></span>
            <span>Uptime: <b>{Math.floor(health.uptimeSeconds / 3600)}h {Math.floor((health.uptimeSeconds % 3600) / 60)}m</b></span>
            <span>Memoria: <b>{health.memoryMb} MB</b></span>
            <span>Node: <b>{health.node}</b></span>
          </Space>
          <List
            size="small"
            dataSource={Object.entries(health.checks ?? {})}
            renderItem={([name, c]) => (
              <List.Item style={{ padding: '8px 0' }}>
                <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', width: '100%' }}>
                  <span>{ICON[c.status] ?? '❔'}</span>
                  <div style={{ flex: 1 }}>
                    <b style={{ textTransform: 'capitalize' }}>{name}</b>
                    <div style={{ fontSize: 12, color: COLOR[c.status] ?? '#999' }}>{c.detail}</div>
                  </div>
                </div>
              </List.Item>
            )}
          />
        </>
      )}
    </Card>
  );
}
