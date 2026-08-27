import React from 'react';
import { Card, Col, Row, Typography, Timeline } from 'antd';
import { ThunderboltFilled, SafetyCertificateFilled, EyeFilled, HeartFilled } from '@ant-design/icons';
import { MISIO_COLORS } from '../../theme/misioTheme';

const { Title, Text, Paragraph } = Typography;

/** 🏢 QUIÉNES SOMOS (/nosotros) — la historia y las reglas del juego claras. */
export default function Nosotros() {
  return (
    <div style={{ maxWidth: 860, margin: '0 auto' }}>
      <div style={{ textAlign: 'center', margin: '8px 0 24px' }}>
        <Title level={2} style={{ marginBottom: 4 }}>
          <ThunderboltFilled style={{ color: MISIO_COLORS.primary }} /> Quiénes somos
        </Title>
        <Text style={{ color: MISIO_COLORS.textMuted }}>
          Misio — sorteos transparentes donde nunca pierdes.
        </Text>
      </div>

      <div className="glass-hero fade-in-up" style={{ padding: '40px 24px', marginBottom: 40, marginTop: 24 }}>
        <Paragraph style={{ fontSize: 'clamp(16px, 2vw, 19px)', color: MISIO_COLORS.textMuted, maxWidth: 720, margin: '0 auto', lineHeight: 1.6 }}>
          Misio nació con una idea simple: los sorteos tradicionales
          tienen un problema — cuando no ganas, tu dinero desaparece. Nosotros
          lo cambiamos con el modelo <Text strong className="saldo-glow" style={{ fontSize: 'inherit' }}>Cashback Garantizado</Text>:
          si tu boleto no gana, una parte de su valor vuelve a ti como saldo de
          canje para nuestra tienda. Juegas por el premio, pero nunca te vas
          con las manos vacías.
        </Paragraph>
      </div>

      <Row gutter={[16, 16]}>
        {[
          { icon: <EyeFilled style={{ color: MISIO_COLORS.electricBlue }} />, t: 'Transparencia total',
            c: 'Todos los sorteos se transmiten EN VIVO y la lista de participantes es visible durante el sorteo. La página de Ganadores muestra cada entrega con evidencia.' },
          { icon: <SafetyCertificateFilled style={{ color: MISIO_COLORS.saldoGreen }} />, t: 'Dinero protegido',
            c: 'Tus pagos se verifican uno a uno, cada movimiento queda en tu historial, y contamos con Libro de Reclamaciones virtual conforme a la Ley N° 29571.' },
          { icon: <EnvironmentOutlined style={{ color: MISIO_COLORS.primary }} />, t: 'Alcance Nacional',
            c: 'Operamos para todo el país: pagos con Yape/Plin, envíos a nivel nacional con seguimiento, y soporte en tu idioma y tu horario.' },
        ].map((b) => (
          <Col xs={24} md={8} key={b.t}>
            <Card className="glass-card" hoverable style={{ height: '100%' }} bodyStyle={{ padding: 28 }}>
              <div style={{ fontSize: 32, marginBottom: 16 }}>{b.icon}</div>
              <Title level={4} style={{ marginBottom: 12 }}>{b.t}</Title>
              <Paragraph style={{ color: MISIO_COLORS.textMuted, fontSize: 14, lineHeight: 1.5, margin: 0 }}>
                {b.c}
              </Paragraph>
            </Card>
          </Col>
        ))}
      </Row>

      <div style={{ marginTop: 40 }} className="fade-in-up">
        <Card className="glass-card" bodyStyle={{ padding: '32px 40px' }}>
          <Title level={3} style={{ marginBottom: 32, textAlign: 'center' }}>¿Cómo funciona?</Title>
          <Timeline
            style={{ maxWidth: 600, margin: '0 auto' }}
            items={[
              { children: <Text style={{ fontSize: 15 }}>Elige tu sorteo y tus números de la suerte en la grilla.</Text> },
              { children: <Text style={{ fontSize: 15 }}>Paga con tu saldo o con Yape — verificamos y te confirmamos.</Text> },
              { children: <Text style={{ fontSize: 15 }}>Mira el sorteo EN VIVO con la ruleta y la lista de participantes.</Text> },
              { children: <Text style={{ fontSize: 15 }}>¿Ganaste? Te lo enviamos con seguimiento y foto de entrega.</Text> },
              { children: <Text className="prize-glow" style={{ fontSize: 15, display: 'block' }}>¿No ganaste? Una parte de tu boleto vuelve como saldo de canje. Cashback Garantizado.</Text> },
            ]}
          />
        </Card>
      </div>
    </div>
  );
}
