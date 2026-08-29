import React, { useState } from 'react';
import {
  Card, Table, Tag, Typography, Select, Space, Alert, Button, Tooltip, List, Grid,
} from 'antd';
import { ReloadOutlined, SafetyCertificateFilled } from '@ant-design/icons';
import dayjs from 'dayjs';
import { MISIO_COLORS } from '../../theme/misioTheme';
import { useApiOrMock } from '../../hooks/useApiOrMock';

const { Title, Text } = Typography;

const MOCK = [
  { _id: '1', actorName: 'Carla Mendoza', actorRole: 'operator', module: 'pagos',
    action: 'POST /payments/deposits/:id/confirm', targetId: '66f1a…', success: true,
    ip: '190.12.4.7', meta: { amount: 50 }, createdAt: new Date().toISOString() },
  { _id: '2', actorName: 'Brandux Juárez', actorRole: 'admin', module: 'usuarios',
    action: 'POST /users/staff', targetId: '', success: true, ip: '190.12.4.1',
    meta: { role: 'operator' }, createdAt: new Date(Date.now() - 3600e3).toISOString() },
  { _id: '3', actorName: 'Carla Mendoza', actorRole: 'operator', module: 'pagos',
    action: 'POST /payments/deposits/:id/confirm', targetId: '66f0b…', success: false,
    ip: '190.12.4.7', meta: {}, createdAt: new Date(Date.now() - 7200e3).toISOString() },
];

const MODULES = ['pagos', 'usuarios', 'sorteos', 'tienda', 'erp', 'subastas', 'contenido', 'reclamos'];

/**
 * 🛡️ AUDITORÍA (/admin/auditoria) — solo el administrador.
 *
 * Toda acción de escritura del personal queda firmada aquí: quién, qué,
 * cuándo, desde qué IP y si salió bien. En una plataforma con dinero, el
 * riesgo más frecuente no es el hacker de película: es alguien de
 * adentro confirmando un depósito que nunca llegó. Con la bitácora, esa
 * acción tiene nombre y hora.
 */
export default function AdminAudit() {
  const [module, setModule] = useState();
  const screens = Grid.useBreakpoint();
  const isDesktop = screens.lg;
  const { data: logs, demo, refresh } = useApiOrMock(
    module ? `/audit?module=${module}` : '/audit', MOCK,
  );

  const columns = [
    {
      title: 'Cuándo', key: 'when', width: 150,
      render: (_, r) => (
        <Tooltip title={dayjs(r.createdAt).format('DD/MM/YYYY HH:mm:ss')}>
          <Text style={{ fontSize: 12 }}>{dayjs(r.createdAt).format('DD/MM HH:mm:ss')}</Text>
        </Tooltip>
      ),
    },
    {
      title: 'Quién', key: 'who',
      render: (_, r) => (
        <>
          <Text style={{ fontSize: 13 }}>{r.actorName}</Text>
          <br />
          <Tag color={r.actorRole === 'admin' ? MISIO_COLORS.prizeGold : MISIO_COLORS.electricBlue}
            style={{ fontSize: 10, margin: 0 }}>
            {r.actorRole?.toUpperCase()}
          </Tag>
        </>
      ),
    },
    {
      title: 'Qué hizo', key: 'action',
      render: (_, r) => (
        <>
          <Text code style={{ fontSize: 11 }}>{r.action}</Text>
          {r.targetId && (
            <>
              <br />
              <Text style={{ fontSize: 11, color: MISIO_COLORS.textMuted }}>sobre {r.targetId}</Text>
            </>
          )}
          {Object.keys(r.meta ?? {}).length > 0 && (
            <>
              <br />
              <Text style={{ fontSize: 11, color: MISIO_COLORS.textMuted }}>
                {Object.entries(r.meta).map(([k, v]) => `${k}: ${v}`).join(' · ')}
              </Text>
            </>
          )}
        </>
      ),
    },
    {
      title: 'Módulo', dataIndex: 'module', key: 'module', responsive: ['md'],
      render: (m) => <Tag style={{ margin: 0 }}>{m || '—'}</Tag>,
    },
    { title: 'IP', dataIndex: 'ip', key: 'ip', responsive: ['lg'],
      render: (ip) => <Text style={{ fontSize: 11 }}>{ip || '—'}</Text> },
    {
      title: '', key: 'ok', width: 40,
      render: (_, r) => (r.success
        ? <Tag color="success" style={{ margin: 0 }}>✓</Tag>
        : <Tag color="error" style={{ margin: 0 }}>✗</Tag>),
    },
  ];

  return (
    <div>
      <Title level={3}>
        <SafetyCertificateFilled style={{ color: MISIO_COLORS.saldoGreen }} /> Auditoría
      </Title>
      <Text style={{ color: MISIO_COLORS.textMuted }}>
        Cada acción de escritura del personal queda firmada: quién, qué, cuándo y
        desde dónde. Solo tú (administrador) ves esta bitácora, y nadie puede
        borrarla desde el sistema.
      </Text>

      {demo && <Alert type="info" showIcon style={{ margin: '14px 0' }} message="Modo demo: registros de ejemplo." />}

      <Card
        size="small"
        style={{ marginTop: 16, borderRadius: 16, boxShadow: '0 8px 24px rgba(0,0,0,0.05)' }}
        title={<>Registros <Tag>{logs.length}</Tag></>}
        extra={
          <Space>
            <Select
              allowClear
              placeholder="Todos los módulos"
              style={{ width: isDesktop ? 170 : 130 }}
              value={module}
              onChange={setModule}
              options={MODULES.map((m) => ({ value: m, label: m }))}
            />
            <Button icon={<ReloadOutlined />} onClick={refresh} />
          </Space>
        }
      >
        {isDesktop ? (
          <Table
            dataSource={logs}
            columns={columns}
            rowKey="_id"
            size="small"
            pagination={{ pageSize: 20, showSizeChanger: false }}
          />
        ) : (
          <div style={{ maxHeight: '70vh', overflowY: 'auto', paddingRight: 4 }}>
            <List
              dataSource={logs}
              pagination={{ pageSize: 20, size: 'small', showSizeChanger: false }}
              renderItem={(r) => (
                <List.Item style={{ padding: '0 0 12px' }}>
                  <Card size="small" style={{ width: '100%', borderRadius: 12, border: 'none', backgroundColor: MISIO_COLORS.primary, boxShadow: '0 4px 16px rgba(0,163,143,0.3)' }} styles={{ body: { padding: '16px' } }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                      <Text style={{ fontSize: 13, fontWeight: 'bold', color: '#fff' }}>{r.actorName}</Text>
                      {r.success ? <Tag color="success" style={{ margin: 0 }}>✓</Tag> : <Tag color="error" style={{ margin: 0 }}>✗</Tag>}
                    </div>
                    <div style={{ marginBottom: 8 }}>
                      <Tag color={r.actorRole === 'admin' ? MISIO_COLORS.prizeGold : MISIO_COLORS.electricBlue} style={{ fontSize: 10, border: 'none' }}>
                        {r.actorRole?.toUpperCase()}
                      </Tag>
                      <Tag style={{ margin: 0, fontSize: 10, border: 'none', color: MISIO_COLORS.primary, backgroundColor: '#fff' }}>{r.module || '—'}</Tag>
                      <Text style={{ fontSize: 11, color: 'rgba(255,255,255,0.7)', marginLeft: 8 }}>
                        {dayjs(r.createdAt).format('DD/MM HH:mm')}
                      </Text>
                    </div>
                    <div style={{ background: 'rgba(255,255,255,0.1)', padding: 8, borderRadius: 6, border: '1px solid rgba(255,255,255,0.2)' }}>
                      <Text code style={{ fontSize: 11, display: 'block', wordBreak: 'break-all', whiteSpace: 'normal', backgroundColor: 'rgba(255,255,255,0.2)', color: '#fff', border: 'none' }}>{r.action}</Text>
                      {r.targetId && <Text style={{ fontSize: 11, color: 'rgba(255,255,255,0.6)', display: 'block', marginTop: 4 }}>sobre {r.targetId}</Text>}
                      {Object.keys(r.meta ?? {}).length > 0 && (
                        <Text style={{ fontSize: 11, color: 'rgba(255,255,255,0.6)', display: 'block', marginTop: 4 }}>
                          {Object.entries(r.meta).map(([k, v]) => `${k}: ${v}`).join(' · ')}
                        </Text>
                      )}
                    </div>
                  </Card>
                </List.Item>
              )}
            />
          </div>
        )}
      </Card>
    </div>
  );
}
