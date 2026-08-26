import React, { useEffect, useState } from 'react';
import { Card, Col, Row, Typography, Statistic, Table, message, Space, Progress, Tag, Button } from 'antd';
import {
  DashboardOutlined, TeamOutlined, DesktopOutlined,
  ThunderboltOutlined, ClockCircleOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import { api } from '../../auth/api';
import { MISIO_COLORS } from '../../theme/misioTheme';

dayjs.extend(relativeTime);

const { Title, Text } = Typography;

export default function AdminSystemStats() {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState(null);

  useEffect(() => {
    fetchStats();
    const interval = setInterval(fetchStats, 10000); // Refrescar cada 10s
    return () => clearInterval(interval);
  }, []);

  const fetchStats = async () => {
    try {
      const res = await api('/stats/system');
      setData(res);
    } catch (err) {
      message.error(err.message || 'Error al obtener estado del servidor');
    } finally {
      setLoading(false);
    }
  };

  const bytesToMB = (bytes) => (bytes / 1024 / 1024).toFixed(2);
  const uptimeToDays = (seconds) => {
    const days = Math.floor(seconds / (3600 * 24));
    const hours = Math.floor(seconds % (3600 * 24) / 3600);
    return `${days}d ${hours}h`;
  };

  const memUsagePercent = data ? ((data.os.memory.total - data.os.memory.free) / data.os.memory.total * 100).toFixed(1) : 0;
  
  const columns = [
    { title: 'Usuario', dataIndex: 'name', key: 'name', render: text => <b>{text}</b> },
    { title: 'Documento', dataIndex: 'dni', key: 'dni' },
    { title: 'Teléfono', dataIndex: 'phone', key: 'phone' },
    { 
      title: 'Última Actividad', 
      dataIndex: 'updatedAt', 
      key: 'updatedAt',
      render: date => (
        <Space>
           <Tag color="processing">Activo {dayjs(date).fromNow()}</Tag>
           <Text type="secondary" style={{fontSize: 12}}>{dayjs(date).format('DD/MM/YYYY HH:mm')}</Text>
        </Space>
      )
    },
  ];

  return (
    <div style={{ maxWidth: 1200, margin: '0 auto', padding: '0 16px' }}>
      <Title level={2} style={{ marginBottom: 24, marginTop: 0 }}>
        <DashboardOutlined style={{ marginRight: 8, color: MISIO_COLORS.primary }} />
        Estado del Servidor
      </Title>

      {data && (
        <>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 16 }}>
            <Button 
              type="primary" 
              danger 
              icon={<ThunderboltOutlined />} 
              onClick={async () => {
                try {
                  const res = await api('/stats/fix-holds', { method: 'POST' });
                  message.success(res.message);
                } catch (err) {
                  message.error('Error al liberar retenciones: ' + err.message);
                }
              }}
            >
              Forzar Liberación de Retenciones Atrapadas
            </Button>
          </div>
          <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
            <Col xs={24} sm={8}>
              <Card size="small" style={{ borderColor: MISIO_COLORS.border }}>
                <Statistic
                  title={<Space><ClockCircleOutlined /> Uptime de la App</Space>}
                  value={uptimeToDays(data.os.uptime)}
                  valueStyle={{ color: MISIO_COLORS.prizeGold }}
                />
              </Card>
            </Col>
            <Col xs={24} sm={8}>
              <Card size="small" style={{ borderColor: MISIO_COLORS.border }}>
                <Statistic
                  title={<Space><DesktopOutlined /> Carga CPU (Load Avg 1m)</Space>}
                  value={data.os.loadavg[0].toFixed(2)}
                  valueStyle={{ color: data.os.loadavg[0] > 2 ? '#ff4d4f' : MISIO_COLORS.textBase }}
                />
              </Card>
            </Col>
            <Col xs={24} sm={8}>
              <Card size="small" style={{ borderColor: MISIO_COLORS.border }}>
                <Statistic
                  title={<Space><ThunderboltOutlined /> Uso de RAM del Sistema</Space>}
                  value={`${memUsagePercent}%`}
                  suffix={<Progress percent={memUsagePercent} size="small" showInfo={false} strokeColor={MISIO_COLORS.primary} style={{ width: 60, marginLeft: 10 }} />}
                  valueStyle={{ color: MISIO_COLORS.textBase }}
                />
                <Text style={{ fontSize: 12, color: MISIO_COLORS.textMuted }}>
                  Total: {bytesToMB(data.os.memory.total)} MB
                </Text>
              </Card>
            </Col>
          </Row>

          <Card
            title={<Space><TeamOutlined /> Usuarios Activos Recientemente</Space>}
            style={{ borderColor: MISIO_COLORS.border }}
            bodyStyle={{ padding: 0 }}
          >
            <Table
              dataSource={data.activeUsers}
              columns={columns}
              rowKey="_id"
              pagination={false}
              loading={loading}
              size="middle"
            />
          </Card>
        </>
      )}
    </div>
  );
}
