import React, { useEffect, useMemo, useState } from 'react';
import dayjs from 'dayjs';
import {
  Card, Table, Tag, Button, Space, Typography, message, Alert, Modal, Form,
  Input, InputNumber, Radio, Select, Switch, Row, Col, Tooltip, Popconfirm,
  Segmented,
} from 'antd';
import {
  StopOutlined, CheckCircleOutlined, SearchOutlined, GiftOutlined, SaveOutlined, KeyOutlined,
  UserAddOutlined, MailOutlined, WalletOutlined,
} from '@ant-design/icons';
import { MISIO_COLORS } from '../../theme/misioTheme';
import { useApiOrMock } from '../../hooks/useApiOrMock';
import { api } from '../../auth/api';
import { useAuth } from '../../auth/AuthContext';
import { Checkbox } from 'antd';
import { ADMIN_MENU } from '../AdminShell/AdminShell';

const { Title, Text } = Typography;

const MOCK_USERS = [
  { _id: 'u1', name: 'Carla Mendoza', dni: '74581236', phone: '987654321',
    role: 'user', walletBalance: 47, banned: false, createdAt: new Date().toISOString() },
  { _id: 'u2', name: 'Jorge Ramírez', dni: '45678912', phone: '956123789',
    role: 'user', walletBalance: 10, banned: true, banReason: 'Pago falsificado',
    createdAt: new Date().toISOString() },
];

/**
 * SPRINT B — Gestión de usuarios (/admin/usuarios).
 * - 🎁 Bono de bienvenida configurable: crédito (S/ X) o boleto gratis
 *   en una rifa elegida, para cada nuevo registro.
 * - Tabla de usuarios con búsqueda y BANEO/reactivación con motivo.
 *   El baneo corta el acceso AL INSTANTE (se valida en cada request).
 */
/** Todos los módulos del panel con su etiqueta, tomados del menú real. */
const MODULES = ADMIN_MENU.flatMap((g) =>
  g.items.map((i) => ({ perm: i.perm, label: i.label, group: g.group })),
);

/** Sugerencia al elegir rol (el admin siempre los tiene todos). */
const ROLE_PRESET = {
  admin: MODULES.map((m) => m.perm),
  operator: ['pagos', 'tienda'],
  presenter: ['sorteos', 'subastas'],
  systems: ['dashboard', 'usuarios', 'pagos', 'tienda', 'reclamos'],
};

export default function AdminUsers() {
  const { user: currentUser } = useAuth();
  const [msgApi, contextHolder] = message.useMessage();
  // Paginación y búsqueda EN EL SERVIDOR: traer 100.000 usuarios al
  // navegador para filtrarlos aquí no escala — se pide solo la página.
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState(''); // lo que ya se envió (con retardo)
  const { data: paged, demo, refresh } = useApiOrMock(
    `/users?page=${page}&limit=25${query ? `&search=${encodeURIComponent(query)}` : ''}`,
    { items: MOCK_USERS, total: MOCK_USERS.length, page: 1, limit: 25, pages: 1 },
  );
  const users = paged.items ?? [];

  // Pestañas (Todos vs En Sesión)
  const [viewMode, setViewMode] = useState('all');
  const { data: activeUsersData, refresh: refreshActive } = useApiOrMock('/users/active', []);
  const activeUsers = activeUsersData ?? [];

  // Retardo: no disparamos una consulta por cada tecla
  useEffect(() => {
    const t = setTimeout(() => { 
      setQuery(search); 
      setPage(1); 
      if (viewMode === 'active') refreshActive();
    }, 400);
    return () => clearTimeout(t);
  }, [search, viewMode, refreshActive]);
  
  const { data: bonusCfg, refresh: refreshBonus } = useApiOrMock('/settings/welcome-bonus', {
    enabled: false, type: 'credit', creditAmount: 5, raffleId: null,
  });
  const { data: raffles } = useApiOrMock('/raffles', []);
  const { data: emailCfg, refresh: refreshEmailCfg } = useApiOrMock('/settings/email-verification', { enabled: false });

  const [banning, setBanning] = useState(null); // Usuario en el modal de baneo
  const [creatingStaff, setCreatingStaff] = useState(false);
  const [staffForm] = Form.useForm();
  const [creating, setCreating] = useState(false); // Modal de nuevo usuario/personal
  const [createForm] = Form.useForm();
  const [saving, setSaving] = useState(false);
  const [banForm] = Form.useForm();
  const [bonusForm] = Form.useForm();
  const [messageForm] = Form.useForm();
  const [messaging, setMessaging] = useState(null);

  // Edición de saldos
  const [balancesForm] = Form.useForm();
  const [editingBalances, setEditingBalances] = useState(null);

  const bonusType = Form.useWatch('type', bonusForm);

  // Sincronizar el form del bono cuando llega la config real
  React.useEffect(() => { bonusForm.setFieldsValue(bonusCfg); }, [bonusCfg]); // eslint-disable-line

  const guardDemo = () => {
    if (demo) msgApi.info('Modo demo: conecta el backend.');
    return demo;
  };

  // La búsqueda la resuelve el SERVIDOR (índices + paginación): filtrar
  // aquí exigiría descargar toda la tabla de usuarios en cada carga.

  // ── Bono de bienvenida ──────────────────────────────────────────
  const saveBonus = async (values) => {
    if (guardDemo()) return;
    setSaving(true);
    try {
      await api('/settings/welcome-bonus', { method: 'PUT', body: values });
      msgApi.success('Bono de bienvenida guardado — aplica a los próximos registros ✓');
      refreshBonus();
    } catch (err) { msgApi.error(err.message); } finally { setSaving(false); }
  };

  // ── Crear usuario / personal con rol ────────────────────────────
  const createUser = async (values) => {
    if (guardDemo()) return;
    setSaving(true);
    try {
      await api('/users', { method: 'POST', body: { ...values, permissions: values.permissions ?? [] } });
      msgApi.success(`${values.name} creado con rol ${values.role} ✓`);
      setCreating(false);
      createForm.resetFields();
      refresh();
      if (viewMode === 'active') refreshActive();
    } catch (err) { msgApi.error(err.message); } finally { setSaving(false); }
  };

  // ── Mensaje Directo ─────────────────────────────────────────────
  const sendMessage = async (values) => {
    if (guardDemo()) return;
    setSaving(true);
    try {
      await api('/inbox/admin-send', { method: 'POST', body: { userId: messaging._id, subject: values.subject, message: values.message } });
      msgApi.success(`Mensaje enviado al buzón de ${messaging.name} ✓`);
      setBanning(null);
      banForm.resetFields();
      refresh();
      if (viewMode === 'active') refreshActive();
    } catch (err) { msgApi.error(err.message); } finally { setSaving(false); }
  };

  // ── Crear personal (delegar responsabilidades) ──────────────────
  const createStaff = async (values) => {
    if (guardDemo()) return;
    setSaving(true);
    try {
      await api('/users', { method: 'POST', body: { ...values, permissions: values.permissions ?? [] } });
      msgApi.success(`${values.name} creado con rol ${values.role} — ya puede iniciar sesión con su DNI ✓`, 6);
      setCreatingStaff(false);
      staffForm.resetFields();
      refresh();
      if (viewMode === 'active') refreshActive();
    } catch (err) { msgApi.error(err.message); } finally { setSaving(false); }
  };

  // ── Baneo ───────────────────────────────────────────────────────
  const ban = async ({ reason }) => {
    if (guardDemo()) return;
    setSaving(true);
    try {
      await api(`/users/${banning._id}/ban`, { method: 'PATCH', body: { banned: true, reason } });
      msgApi.success(`${banning.name} suspendido — su acceso se cortó al instante.`);
      setBanning(null);
      refresh();
    } catch (err) { msgApi.error(err.message); } finally { setSaving(false); }
  };

  const unban = async (u) => {
    if (guardDemo()) return;
    try {
      await api(`/users/${u._id}/ban`, { method: 'PATCH', body: { banned: false } });
      msgApi.success(`${u.name} reactivado ✓`);
      refresh();
      if (viewMode === 'active') refreshActive();
    } catch (err) { msgApi.error(err.message); }
  };

  const resetPassword = async (u) => {
    if (guardDemo()) return;
    try {
      const res = await api(`/users/${u._id}/reset-password`, { method: 'POST' });
      // Mostrar la clave temporal en un modal para que el admin la copie
      Modal.success({
        title: 'Clave temporal generada',
        content: (
          <div>
            <Text>Comunícale esta clave a <b>{u.name}</b>. Deberá cambiarla al entrar:</Text>
            <div style={{ margin: '14px 0', textAlign: 'center' }}>
              <Text copyable style={{ fontSize: 22, fontWeight: 800, letterSpacing: 1 }}>
                {res.tempPassword}
              </Text>
            </div>
          </div>
        ),
        okText: 'Copiado, entendido',
      });
    } catch (err) { msgApi.error(err.message); }
  };

  const kickUser = async (u) => {
    if (guardDemo()) return;
    try {
      await api(`/users/${u._id}/kick`, { method: 'POST' });
      msgApi.success(`Sesión de ${u.name} terminada exitosamente.`);
      if (viewMode === 'active') refreshActive();
    } catch (err) { msgApi.error(err.message); }
  };

  const saveBalances = async (values) => {
    if (guardDemo()) return;
    setSaving(true);
    try {
      await api(`/users/${editingBalances._id}/balances`, { method: 'PATCH', body: values });
      msgApi.success(`Saldos de ${editingBalances.name} actualizados manualmente.`);
      setEditingBalances(null);
      refresh();
      if (viewMode === 'active') refreshActive();
    } catch (err) { msgApi.error(err.message); } finally { setSaving(false); }
  };
  const manualVerifyEmail = async (u) => {
    if (guardDemo()) return;
    try {
      await api(`/users/${u._id}/verify-email`, { method: 'POST' });
      msgApi.success(`Correo de ${u.name} verificado manualmente.`);
      refresh();
      if (viewMode === 'active') refreshActive();
    } catch (err) { msgApi.error(err.message); }
  };

  const columns = [
    {
      title: 'Usuario',
      key: 'user',
      render: (_, u) => (
        <>
          <Text strong style={{ fontSize: 13 }}>{u.name}</Text>
          {u.role === 'admin' && <Tag color={MISIO_COLORS.prizeGold} style={{ marginLeft: 6 }}>ADMIN</Tag>}
          {u.role === 'operator' && <Tag color={MISIO_COLORS.electricBlue} style={{ marginLeft: 6 }}>OPERADOR</Tag>}
          {u.role === 'presenter' && <Tag color={MISIO_COLORS.primary} style={{ marginLeft: 6 }}>PRESENTADOR</Tag>}
          {u.role === 'seller' && <Tag color={MISIO_COLORS.green} style={{ marginLeft: 6 }}>VENDEDOR</Tag>}
          {u.role === 'systems' && <Tag color="purple" style={{ marginLeft: 6 }}>SISTEMAS</Tag>}
          {u.role !== 'user' && u.role !== 'admin' && (u.permissions ?? []).length > 0 && (
            <div style={{ marginTop: 4 }}>
              {u.permissions.map((p) => (
                <Tag key={p} style={{ fontSize: 10, marginBottom: 2 }}>{p}</Tag>
              ))}
            </div>
          )}
          <br />
          <Text style={{ fontSize: 11, color: MISIO_COLORS.textMuted }}>
            {u.email ? `${u.email} · ` : ''}DNI {u.dni} · {u.phone}
          </Text>
          {u.email && !u.emailVerifiedAt && (
            <div style={{ marginTop: 2 }}>
              <Tag color="warning" style={{ fontSize: 10 }}>Falta verificar correo</Tag>
            </div>
          )}
        </>
      ),
    },
    {
      title: 'Saldos (S/)',
      key: 'balances',
      responsive: ['md'],
      render: (_, u) => (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <Text style={{ color: MISIO_COLORS.saldoGreen, fontSize: 13 }}>
            Principal: {Number(u.walletBalance ?? 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}
          </Text>
          <Text style={{ color: MISIO_COLORS.electricBlue, fontSize: 11 }}>
            Canje: {Number(u.walletCanje ?? 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}
          </Text>
          <Text style={{ color: '#ff4d4f', fontSize: 11 }}>
            Retenido: {Number(u.walletHeld ?? 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}
          </Text>
        </div>
      ),
    },
    {
      title: 'Registro',
      dataIndex: 'createdAt',
      key: 'createdAt',
      responsive: ['lg'],
      render: (d) => dayjs(d).format('DD/MM/YYYY'),
    },
    {
      title: 'Estado',
      key: 'status',
      render: (_, u) =>
        u.banned ? (
          <Tooltip title={u.banReason || 'Sin motivo registrado'}>
            <Tag color="error">🚫 Suspendido</Tag>
          </Tooltip>
        ) : (
          <Tag color="success">Activo</Tag>
        ),
    },
    {
      title: 'Acción',
      key: 'actions',
      render: (_, u) => (
        <Space size={4} wrap>
          {currentUser?.role === 'admin' && (
            <Button
              size="small"
              icon={<WalletOutlined />}
              onClick={() => {
                setEditingBalances(u);
                balancesForm.setFieldsValue({
                  walletBalance: u.walletBalance ?? 0,
                  walletCanje: u.walletCanje ?? 0,
                  walletHeld: u.walletHeld ?? 0,
                });
              }}
            >
              Saldos
            </Button>
          )}
          <Popconfirm
            title={`Resetear contraseña de ${u.name}`}
            description="Se generará una clave temporal. El usuario deberá cambiarla al entrar."
            okText="Resetear" cancelText="Cancelar"
            onConfirm={() => resetPassword(u)}
          >
            <Button size="small" icon={<KeyOutlined />}>Resetear clave</Button>
          </Popconfirm>
          <Button size="small" icon={<MailOutlined />} onClick={() => { messageForm.resetFields(); setMessaging(u); }}>
            Mensaje
          </Button>
          {u.email && !u.emailVerifiedAt && (
            <Button size="small" icon={<CheckCircleOutlined />} onClick={() => manualVerifyEmail(u)} style={{ color: MISIO_COLORS.prizeGold, borderColor: MISIO_COLORS.prizeGold }}>
              Verificar
            </Button>
          )}
          {u.role === 'admin' ? null : u.banned ? (
            <Button size="small" icon={<CheckCircleOutlined />} onClick={() => unban(u)}>
              Reactivar
            </Button>
          ) : (
            <Button size="small" danger icon={<StopOutlined />}
              onClick={() => { banForm.resetFields(); setBanning(u); }}>
              Banear
            </Button>
          )}
        </Space>
      ),
    },
  ];

  const activeColumns = [
    columns[0], // Usuario
    {
      title: 'Tiempo en sesión',
      key: 'sessionStart',
      render: (_, u) => {
        if (!u.sessionStart) return <Text type="secondary">Desconocido</Text>;
        const mins = dayjs().diff(dayjs(u.sessionStart), 'minute');
        if (mins < 1) return <Tag color="green">Ahora</Tag>;
        return <Text>{mins} min</Text>;
      }
    },
    {
      title: 'Acción',
      key: 'actions',
      render: (_, u) => (
        <Space size={4} wrap>
          <Popconfirm
            title={`Resetear contraseña de ${u.name}`}
            okText="Resetear" cancelText="Cancelar"
            onConfirm={() => resetPassword(u)}
          >
            <Button size="small" icon={<KeyOutlined />}>Resetear clave</Button>
          </Popconfirm>
          <Button size="small" icon={<MailOutlined />} onClick={() => { messageForm.resetFields(); setMessaging(u); }}>
            Mensaje
          </Button>
          <Popconfirm
            title={`Expulsar a ${u.name}`}
            description="Perderá el acceso y se cerrará su sesión de inmediato."
            okText="Expulsar" cancelText="Cancelar"
            onConfirm={() => kickUser(u)}
          >
            <Button size="small" danger icon={<StopOutlined />}>Expulsar</Button>
          </Popconfirm>
        </Space>
      ),
    }
  ];

  return (
    <div>
      {contextHolder}
      {demo && (
        <Alert type="info" showIcon style={{ marginBottom: 16 }}
          message="Modo demo: viendo datos ficticios (backend no conectado)." />
      )}
      <Title level={3}>👥 Usuarios</Title>

      <Row gutter={[20, 20]}>
        {/* ── Bono de bienvenida + verificación de correo ─────────── */}
        <Col xs={24} xl={8}>
          <Card size="small" style={{ marginBottom: 20 }}
            title="📧 Verificación de correo al registrarse">
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <Switch
                checked={!!emailCfg.enabled}
                onChange={async (checked) => {
                  if (guardDemo()) return;
                  try {
                    await api('/settings/email-verification', { method: 'PUT', body: { enabled: checked } });
                    msgApi.success(checked
                      ? 'Activado: los nuevos registros deberán ingresar el código enviado a su correo.'
                      : 'Desactivado: el registro entra directo (modo pruebas).');
                    refreshEmailCfg();
                  } catch (err) { msgApi.error(err.message); }
                }}
              />
              <Text style={{ fontSize: 12, color: MISIO_COLORS.textMuted }}>
                {emailCfg.enabled
                  ? 'Se exige el código de 6 dígitos (15 min). Sin SMTP configurado, el código sale en la consola del servidor.'
                  : 'Apagado — ideal para probar registros sin correo real.'}
              </Text>
            </div>
          </Card>
          <Card title={<><GiftOutlined style={{ color: MISIO_COLORS.prizeGold }} /> Bono de bienvenida</>}>
            <Form form={bonusForm} layout="vertical" onFinish={saveBonus}
              initialValues={bonusCfg} requiredMark={false}>
              <Form.Item name="enabled" label="Activo para nuevos registros" valuePropName="checked">
                <Switch />
              </Form.Item>
              <Form.Item name="type" label="Tipo de bono">
                <Radio.Group>
                  <Radio.Button value="credit">💵 Crédito Misio</Radio.Button>
                  <Radio.Button value="ticket">🎟️ Ticket gratis</Radio.Button>
                </Radio.Group>
              </Form.Item>
              {bonusType !== 'ticket' ? (
                <Form.Item name="creditAmount" label="Monto del crédito (S/)"
                  rules={[{ type: 'number', min: 1, message: 'Mínimo S/ 1' }]}>
                  <InputNumber min={1} max={100} style={{ width: '100%' }} />
                </Form.Item>
              ) : (
                <Form.Item name="raffleId" label="Rifa del sorteo de bienvenida"
                  rules={[{ required: true, message: 'Elige la rifa del boleto gratis' }]}>
                  <Select
                    placeholder="Selecciona una rifa en venta"
                    options={raffles
                      .filter((r) => r.status === 'active')
                      .map((r) => ({ value: r._id, label: `${r.title} (S/ ${r.ticketPrice})` }))}
                  />
                </Form.Item>
              )}
              <Button type="primary" htmlType="submit" block icon={<SaveOutlined />} loading={saving}>
                Guardar configuración
              </Button>
              <Text style={{ fontSize: 11, color: MISIO_COLORS.textMuted, display: 'block', marginTop: 8 }}>
                El bono se aplica automáticamente al registrarse y queda en el
                ledger como "welcome_bonus". Si la rifa del ticket se agota, el
                registro NO se rompe (solo se omite el bono).
              </Text>
            </Form>
          </Card>
        </Col>

        {/* ── Tabla de usuarios ───────────────────────────────────── */}
        <Col xs={24} xl={16}>
          <Card
            title={
              <Space>
                <Segmented
                  options={[
                    { label: 'Todos', value: 'all' },
                    { label: 'En sesión', value: 'active' }
                  ]}
                  value={viewMode}
                  onChange={setViewMode}
                />
                <Tag>{viewMode === 'all' ? (paged.total ?? users.length) : activeUsers.length}</Tag>
              </Space>
            }
            extra={
              <Space wrap>
                <Input
                  prefix={<SearchOutlined />}
                  placeholder="Buscar por nombre, DNI o celular"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  allowClear
                  style={{ width: 200 }}
                />
                <Button type="primary" icon={<UserAddOutlined />} onClick={() => setCreating(true)}>
                  Crear usuario
                </Button>
              </Space>
            }
          >
            <Table
              dataSource={viewMode === 'all' ? users : activeUsers}
              columns={viewMode === 'all' ? columns : activeColumns}
              rowKey="_id"
              size="middle"
              scroll={{ x: 560 }}
              pagination={viewMode === 'all' ? {
                current: paged.page ?? 1,
                pageSize: paged.limit ?? 25,
                total: paged.total ?? users.length,
                showSizeChanger: false,
                onChange: setPage,
              } : { pageSize: 25 }}
            />
          </Card>
        </Col>
      </Row>

      {/* ── Modal crear usuario/personal ──────────────────────────── */}
      <Modal
        open={creating}
        onCancel={() => setCreating(false)}
        footer={null}
        title="👤 Crear usuario con rol"
        destroyOnHidden
      >
        <Alert type="info" showIcon style={{ marginBottom: 16 }}
          message="Para delegar: el OPERADOR verifica pagos y atiende canjes de la tienda. El ADMIN tiene acceso total. Entrégale las credenciales en persona." />
        <Form form={createForm} layout="vertical" onFinish={createUser} requiredMark={false}
          initialValues={{ role: 'operator', permissions: ROLE_PRESET.operator }}
          onValuesChange={(chg) => {
            if (chg.role) staffForm.setFieldValue('permissions', ROLE_PRESET[chg.role] ?? []);
          }}>
          <Form.Item name="name" label="Nombre completo"
            rules={[{ required: true, min: 3, message: 'Mínimo 3 caracteres' }]}>
            <Input placeholder="María Torres" />
          </Form.Item>
          <Space.Compact block>
            <Form.Item name="dni" label="DNI" style={{ flex: 1 }}
              rules={[{ required: true, pattern: /^\d{8}$/, message: '8 dígitos' }]}>
              <Input maxLength={8} placeholder="12345678" />
            </Form.Item>
            <Form.Item name="phone" label="Celular" style={{ flex: 1 }}
              rules={[{ required: true, pattern: /^9\d{8}$/, message: '9 dígitos (empieza en 9)' }]}>
              <Input maxLength={9} placeholder="987654321" />
            </Form.Item>
          </Space.Compact>
          <Form.Item name="password" label="Contraseña inicial"
            rules={[{ required: true, min: 6, message: 'Mínimo 6 caracteres' }]}>
            <Input.Password placeholder="••••••" />
          </Form.Item>
          <Form.Item name="role" label="Rol">
            <Radio.Group>
              <Radio.Button value="operator">🎧 Operador</Radio.Button>
              <Radio.Button value="systems">💻 Sistemas</Radio.Button>
              <Radio.Button value="admin">👑 Admin</Radio.Button>
              <Radio.Button value="user">Usuario</Radio.Button>
            </Radio.Group>
          </Form.Item>
          <Button type="primary" htmlType="submit" block loading={saving}>
            Crear cuenta
          </Button>
        </Form>
      </Modal>

      {/* ── Modal de baneo ────────────────────────────────────────── */}
      <Modal
        open={!!banning}
        onCancel={() => setBanning(null)}
        footer={null}
        title={banning ? `🚫 Suspender a ${banning.name}` : ''}
        destroyOnHidden
      >
        <Alert type="warning" showIcon style={{ marginBottom: 16 }}
          message="El usuario perderá el acceso AL INSTANTE (incluso con sesión abierta). Su saldo y boletos se conservan por si se reactiva." />
        <Form form={banForm} layout="vertical" onFinish={ban} requiredMark={false}>
          <Form.Item name="reason" label="Motivo (el usuario lo verá al intentar entrar)"
            rules={[{ required: true, min: 5, message: 'Explica el motivo (mín. 5 caracteres)' }]}>
            <Input.TextArea rows={3}
              placeholder="Intento de falsificación de comprobante de pago (op. N° 034…)…" />
          </Form.Item>
          <Button danger type="primary" htmlType="submit" block loading={saving}>
            Suspender cuenta
          </Button>
        </Form>
      </Modal>

      {/* ── Modal: crear personal con rol delegado ────────────────── */}
      <Modal
        open={creatingStaff}
        onCancel={() => setCreatingStaff(false)}
        footer={null}
        title="👔 Crear personal (delegar responsabilidades)"
        destroyOnHidden
      >
        <Form form={staffForm} layout="vertical" onFinish={createStaff} requiredMark={false}
          initialValues={{ role: 'operator', permissions: ROLE_PRESET.operator }}
          onValuesChange={(chg) => {
            if (chg.role) staffForm.setFieldValue('permissions', ROLE_PRESET[chg.role] ?? []);
          }}>
          <Form.Item name="name" label="Nombre completo"
            rules={[{ required: true, min: 3, message: 'Mínimo 3 caracteres' }]}>
            <Input placeholder="María Torres" />
          </Form.Item>
          <Space.Compact block>
            <Form.Item name="dni" label="DNI (será su usuario)" style={{ flex: 1 }}
              rules={[{ required: true, pattern: /^\d{8}$/, message: '8 dígitos' }]}>
              <Input maxLength={8} placeholder="87654321" />
            </Form.Item>
            <Form.Item name="phone" label="Celular" style={{ flex: 1 }}
              rules={[{ required: true, pattern: /^9\d{8}$/, message: '9 dígitos (empieza en 9)' }]}>
              <Input maxLength={9} placeholder="987654321" />
            </Form.Item>
          </Space.Compact>
          <Form.Item name="password" label="Contraseña inicial"
            rules={[{ required: true, min: 6, message: 'Mínimo 6 caracteres' }]}>
            <Input.Password placeholder="••••••" />
          </Form.Item>
          <Form.Item name="role" label="Rol y responsabilidad">
            <Radio.Group style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <Radio value="operator">
                💳 <b>Operador</b> — verifica pagos y atiende la tienda de canjes
              </Radio>
              <Radio value="presenter">
                🎪 <b>Presentador</b> — gestiona sorteos y ejecuta la ruleta en vivo
              </Radio>
              <Radio value="systems">
                💻 <b>Sistemas</b> — soporte técnico, trazabilidad de errores y asistencia
              </Radio>
              <Radio value="admin">
                👑 <b>Administrador</b> — acceso total (incluye crear personal)
              </Radio>
            </Radio.Group>
          </Form.Item>
          {/* PERMISOS POR MÓDULO: el rol es solo un atajo — lo que manda
              es esta lista, validada también en el servidor. */}
          <Form.Item noStyle shouldUpdate={(a, b) => a.role !== b.role}>
            {({ getFieldValue, setFieldValue }) => {
              const role = getFieldValue('role');
              if (role === 'admin') {
                return (
                  <Alert type="warning" showIcon style={{ marginBottom: 12 }}
                    message="Un administrador ve y hace TODO"
                    description="Incluye contabilidad, contenido y crear más personal. Dale este rol solo a quien realmente sea dueño de la operación." />
                );
              }
              return (
                <Form.Item name="permissions" label="¿A qué módulos entra?">
                  <Checkbox.Group style={{ width: '100%' }}>
                    <Space direction="vertical" size={2} style={{ width: '100%' }}>
                      <Button size="small" type="link" style={{ padding: 0 }}
                        onClick={() => setFieldValue('permissions', ROLE_PRESET[role] ?? [])}>
                        Usar los de su rol
                      </Button>
                      {MODULES.map((m) => (
                        <Checkbox key={m.perm} value={m.perm}>
                          {m.label}{' '}
                          <Text style={{ fontSize: 11, color: MISIO_COLORS.textMuted }}>
                            ({m.group})
                          </Text>
                        </Checkbox>
                      ))}
                    </Space>
                  </Checkbox.Group>
                </Form.Item>
              );
            }}
          </Form.Item>

          <Button type="primary" htmlType="submit" block loading={saving}>
            Crear cuenta de personal
          </Button>
          <Text style={{ fontSize: 11, color: MISIO_COLORS.textMuted, display: 'block', marginTop: 8 }}>
            Cada rol solo ve sus pestañas en el panel: el operador entra directo
            a Pagos, el presentador a Sorteos.
          </Text>
        </Form>
      </Modal>

      {/* ── Modal de Envío de Mensaje ────────────────────────────────── */}
      <Modal
        open={!!messaging}
        title={messaging ? `Mensaje a ${messaging.name}` : ''}
        onCancel={() => setMessaging(null)}
        destroyOnHidden
        footer={null}
      >
        <Form form={messageForm} layout="vertical" onFinish={sendMessage}>
          <Form.Item
            name="subject"
            label="Asunto del mensaje"
            rules={[{ required: true, message: 'El asunto no puede estar vacío' }]}
          >
            <Input placeholder="Ej: ¡Felicidades! Tienes un descuento" />
          </Form.Item>
          <Form.Item
            name="message"
            label="Detalle del mensaje"
            rules={[{ required: true, message: 'El mensaje no puede estar vacío' }]}
          >
            <Input.TextArea rows={4} placeholder="Ej: Aquí tienes tu cupón del 50%..." />
          </Form.Item>
          <Button type="primary" htmlType="submit" block loading={saving} icon={<MailOutlined />}>
            Enviar mensaje
          </Button>
          <Text style={{ fontSize: 11, color: MISIO_COLORS.textMuted, display: 'block', marginTop: 8 }}>
            Este mensaje aparecerá inmediatamente en la sección "Correo interno" del usuario.
          </Text>
        </Form>
      </Modal>

      {/* Modal: Editar Saldos (Súper Privilegiado) */}
      <Modal
        title={`Corregir saldos de ${editingBalances?.name}`}
        open={!!editingBalances}
        onCancel={() => {
          setEditingBalances(null);
          balancesForm.resetFields();
        }}
        footer={null}
      >
        <Alert
          type="warning"
          showIcon
          message="Modificación directa a la base de datos"
          description="Este panel no generará transacciones. Úsalo solo para corregir inconsistencias o saldos atrapados."
          style={{ marginBottom: 16 }}
        />
        <Form layout="vertical" form={balancesForm} onFinish={saveBalances}>
          <Row gutter={16}>
            <Col xs={24} md={8}>
              <Form.Item
                name="walletBalance"
                label="Saldo Principal"
                rules={[{ required: true, message: 'Requerido' }]}
              >
                <InputNumber style={{ width: '100%' }} precision={2} prefix="S/" />
              </Form.Item>
            </Col>
            <Col xs={24} md={8}>
              <Form.Item
                name="walletCanje"
                label="Saldo Canje"
                rules={[{ required: true, message: 'Requerido' }]}
              >
                <InputNumber style={{ width: '100%' }} precision={2} prefix="S/" />
              </Form.Item>
            </Col>
            <Col xs={24} md={8}>
              <Form.Item
                name="walletHeld"
                label="Saldo Retenido"
                rules={[{ required: true, message: 'Requerido' }]}
              >
                <InputNumber style={{ width: '100%' }} precision={2} prefix="S/" />
              </Form.Item>
            </Col>
          </Row>
          <Button type="primary" htmlType="submit" loading={saving} block>
            Guardar y Sobrescribir Saldos
          </Button>
        </Form>
      </Modal>
    </div>
  );
}
