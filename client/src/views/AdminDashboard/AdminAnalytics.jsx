import React from 'react';
import { Card, Col, Row, Typography, Statistic, Table, Empty } from 'antd';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend, PieChart, Pie, Cell
} from 'recharts';
import { useApiOrMock } from '../../hooks/useApiOrMock';
import { MISIO_COLORS } from '../../theme/misioTheme';
import { useAuth } from '../../auth/AuthContext';

const { Title, Text } = Typography;

const MOCK_ADVANCED = {
  conversionRate: 42.5,
  topBuyers: [
    { _id: '1', name: 'Juan Perez', phone: '999888777', totalSpent: 1500, purchaseCount: 15 },
    { _id: '2', name: 'Maria Gomez', phone: '999888666', totalSpent: 1200, purchaseCount: 10 },
    { _id: '3', name: 'Carlos Ruiz', phone: '999888555', totalSpent: 800, purchaseCount: 8 },
  ],
  rafflePerformance: [
    { _id: 'r1', title: 'PlayStation 5', totalRevenue: 5000 },
    { _id: 'r2', title: 'iPhone 15 Pro', totalRevenue: 8500 },
    { _id: 'r3', title: 'Laptop Gamer', totalRevenue: 3200 },
  ],
  partnerPerformance: [
    { _id: 'p1', companyName: 'Nike Peru', totalSoldTickets: 400, grossRevenue: 4000, misioCommission: 400 },
    { _id: 'p2', companyName: 'Adidas', totalSoldTickets: 350, grossRevenue: 3500, misioCommission: 350 },
  ],
};

export default function AdminAnalytics() {
  const { user } = useAuth();
  const { data: s, loading } = useApiOrMock('/stats/advanced', MOCK_ADVANCED);

  if (!s && !loading) return <Empty description="No se pudieron cargar las analíticas" />;

  const isPartner = user?.role === 'partner_admin';

  const topBuyersColumns = [
    { title: 'Nombre', dataIndex: 'name', key: 'name' },
    { title: 'Teléfono', dataIndex: 'phone', key: 'phone' },
    {
      title: 'Total Gastado',
      dataIndex: 'totalSpent',
      key: 'totalSpent',
      render: (val) => <Text strong style={{ color: MISIO_COLORS.primary }}>S/ {val?.toFixed(2)}</Text>,
    },
    { title: 'Compras', dataIndex: 'purchaseCount', key: 'purchaseCount' },
  ];

  const partnerColumns = [
    { title: 'Empresa', dataIndex: 'companyName', key: 'companyName', render: (val) => <Text strong>{val || 'Sin Nombre'}</Text> },
    { title: 'Boletos Vendidos', dataIndex: 'totalSoldTickets', key: 'totalSoldTickets' },
    {
      title: 'Ingreso Bruto',
      dataIndex: 'grossRevenue',
      key: 'grossRevenue',
      render: (val) => `S/ ${val?.toFixed(2)}`,
    },
    {
      title: 'Comisión Neta (Misio)',
      dataIndex: 'misioCommission',
      key: 'misioCommission',
      render: (val) => <Text strong style={{ color: MISIO_COLORS.success }}>S/ {val?.toFixed(2)}</Text>,
    },
  ];

  const conversionData = [
    { name: 'Compradores', value: s?.conversionRate ?? 0 },
    { name: 'Solo Registrados', value: 100 - (s?.conversionRate ?? 0) },
  ];

  return (
    <div style={{ maxWidth: 1200, margin: '0 auto', paddingBottom: 40 }}>
      <Title level={3} style={{ marginTop: 0, fontFamily: 'Outfit, sans-serif' }}>
        📊 Inteligencia de Negocio (BI)
      </Title>
      <Text type="secondary">Métricas avanzadas de rentabilidad y comportamiento de usuarios.</Text>

      <Row gutter={[16, 16]} style={{ marginTop: 24 }}>
        {!isPartner && (
          <Col xs={24} md={8}>
            <Card title="Tasa de Conversión (General)" size="small" style={{ borderRadius: 12, height: '100%' }}>
              <div style={{ textAlign: 'center', marginBottom: 16 }}>
                <Statistic value={s?.conversionRate} precision={1} suffix="%" valueStyle={{ fontSize: 36, color: MISIO_COLORS.primary, fontWeight: 'bold' }} />
                <Text type="secondary">Usuarios que han comprado vs Registrados</Text>
              </div>
              <ResponsiveContainer width="100%" height={200}>
                <PieChart>
                  <Pie
                    data={conversionData}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={80}
                    paddingAngle={5}
                    dataKey="value"
                  >
                    <Cell fill={MISIO_COLORS.primary} />
                    <Cell fill="#e2e8f0" />
                  </Pie>
                  <Tooltip formatter={(value) => `${value.toFixed(1)}%`} />
                  <Legend verticalAlign="bottom" height={36} />
                </PieChart>
              </ResponsiveContainer>
            </Card>
          </Col>
        )}

        <Col xs={24} md={isPartner ? 24 : 16}>
          <Card title="Rentabilidad por Sorteo (Ingresos Brutos)" size="small" style={{ borderRadius: 12, height: '100%' }}>
            <ResponsiveContainer width="100%" height={320}>
              <BarChart data={s?.rafflePerformance ?? []} layout="vertical" margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                <XAxis type="number" tickFormatter={(v) => `S/ ${v}`} />
                <YAxis dataKey="title" type="category" width={150} tick={{ fontSize: 12 }} />
                <Tooltip formatter={(value) => `S/ ${value.toFixed(2)}`} />
                <Bar dataKey="totalRevenue" name="Ingreso Bruto" fill={MISIO_COLORS.success} radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </Card>
        </Col>
      </Row>

      {!isPartner && (
        <Row gutter={[16, 16]} style={{ marginTop: 24 }}>
          <Col xs={24}>
            <Card title="🏢 Rendimiento de Partners (B2B)" size="small" style={{ borderRadius: 12 }}>
              <Table 
                dataSource={s?.partnerPerformance ?? []} 
                columns={partnerColumns} 
                rowKey="_id" 
                pagination={false} 
                loading={loading}
                size="middle"
              />
            </Card>
          </Col>
        </Row>
      )}

      {!isPartner && (
        <Row gutter={[16, 16]} style={{ marginTop: 24 }}>
          <Col xs={24}>
            <Card title="🐋 Top Compradores (Ballenas)" size="small" style={{ borderRadius: 12 }}>
              <Table 
                dataSource={s?.topBuyers ?? []} 
                columns={topBuyersColumns} 
                rowKey="_id" 
                pagination={{ pageSize: 10 }} 
                loading={loading}
                size="middle"
              />
            </Card>
          </Col>
        </Row>
      )}
    </div>
  );
}
