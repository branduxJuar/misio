import React, { useState } from 'react';
import { Card, Col, Row, Typography, Tag, Timeline, Empty, Alert, Image, Space, Steps, Tabs, Button } from 'antd';
import {
  InboxOutlined, RocketFilled, CheckCircleFilled, TrophyFilled, EyeOutlined, EyeInvisibleOutlined
} from '@ant-design/icons';
import dayjs from 'dayjs';
import { MISIO_COLORS } from '../../theme/misioTheme';
import { useApiOrMock } from '../../hooks/useApiOrMock';
import { SERVER_URL } from '../../auth/api';

const { Title, Text, Paragraph } = Typography;

const MOCK = [
  {
    _id: 'p1', productName: 'iPhone 16 Pro Max 256GB',
    raffle: { title: 'iPhone 16 Pro Max', images: [] },
    deliveryStatus: 'transit',
    shipping: { courier: 'Olva Courier', trackingNumber: 'OLV-123456789', destinationCity: 'Tumbes' },
    evidencePhotoUrl: '',
    history: [
      { label: 'Premio comprado — listo en almacén', at: new Date(Date.now() - 172800e3).toISOString() },
      { label: 'Guía OLV-123456789 registrada con Olva Courier', at: new Date(Date.now() - 86400e3).toISOString() },
      { label: 'En camino al ganador', at: new Date(Date.now() - 86000e3).toISOString() },
    ],
    wonAt: new Date(Date.now() - 259200e3).toISOString(),
  },
];

/** Los 3 momentos del envío, en el orden en que le importan al ganador. */
const STEP_INDEX = { in_stock: 0, transit: 1, delivered: 2 };

const STATUS_TAG = {
  in_stock: { color: 'processing', icon: <InboxOutlined />, label: 'Preparando tu envío' },
  transit: { color: 'warning', icon: <RocketFilled />, label: 'En camino' },
  delivered: { color: 'success', icon: <CheckCircleFilled />, label: 'Entregado' },
};

function PrizeCard({ p }) {
  // Por defecto, mostrar detalles si está en proceso. Ocultarlos si ya fue entregado.
  const [showDetails, setShowDetails] = useState(p.deliveryStatus !== 'delivered');
  
  const tag = STATUS_TAG[p.deliveryStatus] ?? STATUS_TAG.in_stock;
  const step = STEP_INDEX[p.deliveryStatus] ?? 0;
  
  return (
    <Card>
      <Row gutter={[18, 18]}>
        <Col xs={24} md={8}>
          {p.evidencePhotoUrl ? (
            <Image src={`${SERVER_URL}${p.evidencePhotoUrl}`} alt="Entrega"
              style={{ width: '100%', borderRadius: 12, objectFit: 'cover' }} />
          ) : p.raffle?.images?.length ? (
            <Image src={`${SERVER_URL}${p.raffle.images[0]}`} alt={p.productName}
              style={{ width: '100%', aspectRatio: '1', objectFit: 'cover', borderRadius: 12 }} />
          ) : (
            <div style={{ fontSize: 58, textAlign: 'center', padding: '26px 0',
              background: 'var(--z-bg-elevated)', borderRadius: 12 }}>🎁</div>
          )}
        </Col>

        <Col xs={24} md={16}>
          <Space wrap style={{ marginBottom: 6, justifyContent: 'space-between', width: '100%' }}>
            <Space wrap>
              <Text className="prize-glow" style={{ fontWeight: 800, fontSize: 17 }}>
                <TrophyFilled /> {p.productName}
              </Text>
              <Tag color={tag.color} icon={tag.icon}>{tag.label}</Tag>
            </Space>
            
            <Button 
              type="text" 
              size="small" 
              icon={showDetails ? <EyeInvisibleOutlined /> : <EyeOutlined />} 
              onClick={() => setShowDetails(!showDetails)}
              style={{ color: MISIO_COLORS.textMuted }}
            >
              {showDetails ? 'Ocultar detalles' : 'Ver detalle del envío'}
            </Button>
          </Space>
          
          <Paragraph style={{ color: MISIO_COLORS.textMuted, fontSize: 12, marginBottom: 14 }}>
            Ganado el {dayjs(p.wonAt).format('DD/MM/YYYY')}
            {p.raffle?.title ? ` · sorteo "${p.raffle.title}"` : ''}
          </Paragraph>

          {showDetails && (
            <div style={{ marginTop: 16 }}>
              {/* Los 3 momentos, sin jerga logística */}
              <Steps
                size="small"
                current={step}
                status={p.deliveryStatus === 'delivered' ? 'finish' : 'process'}
                items={[
                  { title: 'Preparando', description: 'En nuestro almacén' },
                  { title: 'En camino', description: p.shipping?.courier || 'Con el courier' },
                  { title: 'Entregado', description: 'Con evidencia' },
                ]}
                style={{ marginBottom: 16 }}
              />

              {p.shipping?.trackingNumber && (
                <Alert
                  type="info"
                  showIcon={false}
                  style={{ marginBottom: 12 }}
                  message={
                    <Space direction="vertical" size={2}>
                      <Text style={{ fontSize: 13 }}>
                        🚚 <Text strong>{p.shipping.courier}</Text>
                        {p.shipping.destinationCity ? ` → ${p.shipping.destinationCity}` : ''}
                      </Text>
                      <Text style={{ fontSize: 13 }}>
                        N° de guía: <Text code copyable>{p.shipping.trackingNumber}</Text>
                      </Text>
                      <Text style={{ fontSize: 11, color: MISIO_COLORS.textMuted }}>
                        Con ese número puedes rastrearlo en la web de {p.shipping.courier}.
                      </Text>
                    </Space>
                  }
                />
              )}

              {/* Bitácora: la misma que registra el panel */}
              {p.history?.length > 0 && (
                <Timeline
                  items={p.history.map((h, i) => ({
                    color: i === p.history.length - 1 ? MISIO_COLORS.saldoGreen : MISIO_COLORS.textMuted,
                    children: (
                      <>
                        <Text style={{ fontSize: 12 }}>{h.label}</Text>
                        <br />
                        <Text style={{ fontSize: 11, color: MISIO_COLORS.textMuted }}>
                          {dayjs(h.at).format('DD/MM/YYYY HH:mm')}
                        </Text>
                      </>
                    ),
                  }))}
                />
              )}
            </div>
          )}
        </Col>
      </Row>
    </Card>
  );
}

/**
 * 🎁 MIS PREMIOS — lo que gané y en qué va mi envío.
 *
 * El ganador no debería tener que escribir por WhatsApp para saber si su
 * premio salió: ve el estado, el courier y el número de guía con el que
 * puede rastrear en la web del courier. Cuando se entrega, ve la foto.
 *
 * Deliberadamente NO muestra el costo del premio ni la boleta del
 * proveedor: eso es información interna del negocio.
 */
export default function MyPrizes() {
  const { data: prizes, demo } = useApiOrMock('/my-prizes', MOCK);

  if (!prizes?.length) {
    return (
      <Card size="small">
        <Empty
          image={<span style={{ fontSize: 46 }}>🎁</span>}
          description={
            <Space direction="vertical" size={2}>
              <Text>Aún no tienes premios ganados</Text>
              <Text style={{ fontSize: 12, color: MISIO_COLORS.textMuted }}>
                Cuando ganes un sorteo, aquí verás el envío paso a paso.
              </Text>
            </Space>
          }
        />
      </Card>
    );
  }

  // Separar premios en proceso (in_stock, transit) y entregados (delivered)
  const inProcess = prizes.filter(p => p.deliveryStatus !== 'delivered');
  const history = prizes.filter(p => p.deliveryStatus === 'delivered');

  return (
    <div>
      {demo && <Alert type="info" showIcon style={{ marginBottom: 12 }} message="Modo demo: premio de ejemplo." />}

      <Tabs 
        defaultActiveKey="1" 
        items={[
          {
            key: '1',
            label: `En proceso (${inProcess.length})`,
            children: (
              <Space direction="vertical" size={16} style={{ width: '100%' }}>
                {inProcess.length === 0 ? (
                  <Empty description="No tienes premios en proceso de entrega actualmente" />
                ) : (
                  inProcess.map(p => <PrizeCard key={p._id} p={p} />)
                )}
              </Space>
            )
          },
          {
            key: '2',
            label: `Historial (${history.length})`,
            children: (
              <Space direction="vertical" size={16} style={{ width: '100%' }}>
                {history.length === 0 ? (
                  <Empty description="Aún no tienes premios en tu historial" />
                ) : (
                  history.map(p => <PrizeCard key={p._id} p={p} />)
                )}
              </Space>
            )
          }
        ]}
      />
    </div>
  );
}
