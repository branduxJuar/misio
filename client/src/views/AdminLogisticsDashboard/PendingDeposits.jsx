import React, { useState } from 'react';
import { Card, Table, Tag, Button, Space, Typography, message, Popconfirm, Empty } from 'antd';
import { CheckOutlined, CloseOutlined, ReloadOutlined } from '@ant-design/icons';
import { MISIO_COLORS } from '../../theme/misioTheme';
import { useApiOrMock } from '../../hooks/useApiOrMock';
import { api } from '../../auth/api';

const { Text } = Typography;

/** Mock para modo demo (backend apagado). */
const MOCK_PENDING = [
  {
    _id: 'dep_01',
    userId: { name: 'Jorge Ramírez', dni: '45678912', phone: '956123789' },
    amount: 30,
    createdAt: new Date().toISOString(),
  },
];

/**
 * PendingDeposits — Cola de recargas Yape/Plin por confirmar.
 * Flujo del operador: revisa su app de Yape → si el monto llegó, Confirmar
 * (acredita el saldo); si no, Rechazar. La doble confirmación está
 * protegida en el backend (filtro por status 'pending').
 */
export default function PendingDeposits() {
  const { data: deposits, demo, refresh, loading } = useApiOrMock(
    '/transactions/pending',
    MOCK_PENDING,
  );
  const [msgApi, contextHolder] = message.useMessage();
  const [processing, setProcessing] = useState(null); // _id en proceso

  const act = async (id, action) => {
    if (demo) {
      msgApi.info('Modo demo: conecta el backend para confirmar depósitos reales.');
      return;
    }
    setProcessing(id);
    try {
      await api(`/transactions/${id}/${action}`, { method: 'PATCH' });
      msgApi.success(action === 'confirm' ? 'Saldo acreditado al usuario ✓' : 'Depósito rechazado');
      refresh();
    } catch (err) {
      msgApi.error(err.message);
    } finally {
      setProcessing(null);
    }
  };

  const columns = [
    {
      title: 'Usuario',
      key: 'user',
      render: (_, r) => (
        <>
          <Text>{r.userId?.name ?? '—'}</Text>
          <br />
          <Text style={{ fontSize: 11, color: MISIO_COLORS.textMuted }}>
            DNI {r.userId?.dni} · {r.userId?.phone}
          </Text>
        </>
      ),
    },
    {
      title: 'Monto',
      dataIndex: 'amount',
      key: 'amount',
      render: (v) => (
        <Text strong style={{ color: MISIO_COLORS.saldoGreen }}>S/ {Number(v).toFixed(2)}</Text>
      ),
    },
    {
      title: 'Solicitado',
      dataIndex: 'createdAt',
      key: 'createdAt',
      responsive: ['md'],
      render: (d) => new Date(d).toLocaleString('es-PE'),
    },
    {
      title: 'Acción',
      key: 'actions',
      render: (_, r) => (
        <Space>
          <Popconfirm
            title="¿El Yape llegó por el monto exacto?"
            okText="Sí, acreditar"
            cancelText="No"
            onConfirm={() => act(r._id, 'confirm')}
          >
            <Button
              type="primary"
              size="small"
              icon={<CheckOutlined />}
              loading={processing === r._id}
            >
              Confirmar
            </Button>
          </Popconfirm>
          <Button
            danger
            size="small"
            icon={<CloseOutlined />}
            onClick={() => act(r._id, 'reject')}
            loading={processing === r._id}
          >
            Rechazar
          </Button>
        </Space>
      ),
    },
  ];

  return (
    <Card
      title={
        <>
          💰 Depósitos por confirmar{' '}
          <Tag color="warning">{deposits.length} en cola</Tag>
        </>
      }
      extra={<Button size="small" icon={<ReloadOutlined />} onClick={refresh} loading={loading} />}
    >
      {contextHolder}
      <Table
        dataSource={deposits}
        columns={columns}
        rowKey="_id"
        size="small"
        scroll={{ x: 480 }}
        pagination={false}
        locale={{ emptyText: <Empty description="Sin depósitos pendientes 🎉" /> }}
      />
    </Card>
  );
}
