import React from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Button, Card, Col, Row, Space, Typography, Tag, Progress, Collapse, Avatar,
  Statistic, Divider,
} from 'antd';
import {
  ThunderboltFilled, SafetyCertificateFilled, EyeFilled, TrophyFilled,
  GiftFilled, ShopFilled, FireFilled, SmileFilled, CheckCircleFilled,
  WhatsAppOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import { MISIO_COLORS } from '../../theme/misioTheme';
import { useAuth } from '../../auth/AuthContext';
import { useApiOrMock } from '../../hooks/useApiOrMock';
import { SERVER_URL } from '../../auth/api';

const { Title, Text, Paragraph } = Typography;
const { Timer } = Statistic;

const MOCK_RAFFLES = [
  { _id: 'r1', title: 'iPhone 16 Pro Max', ticketPrice: 5, totalTickets: 400, soldCount: 287,
    images: [], status: 'active', drawDate: new Date(Date.now() + 86400000).toISOString() },
];
const MOCK_WINNERS = [
  { _id: 'w1', title: 'PlayStation 5 Slim', winnerName: 'CARL… MEND…', winnerCode: 'PS5-0087',
    images: [], deliveryStatus: 'delivered', updatedAt: new Date().toISOString() },
  { _id: 'w2', title: 'S/ 1,500 en efectivo', winnerName: 'MARI… FERN…', winnerCode: 'CASH-0102',
    images: [], deliveryStatus: 'delivered', updatedAt: new Date().toISOString() },
];

/** Bloque de sección con título centrado — ritmo visual constante. */
const Section = ({ eyebrow, title, sub, children, id }) => (
  <div id={id} style={{ margin: '64px 0' }}>
    <div style={{ textAlign: 'center', marginBottom: 28 }}>
      {eyebrow && (
        <Text style={{ color: MISIO_COLORS.primary, fontWeight: 700, fontSize: 12,
          letterSpacing: 2, textTransform: 'uppercase' }}>
          {eyebrow}
        </Text>
      )}
      <Title level={2} style={{ margin: '6px 0 8px', fontSize: 'clamp(24px, 4vw, 34px)' }}>
        {title}
      </Title>
      {sub && (
        <Paragraph style={{ color: MISIO_COLORS.textMuted, maxWidth: 620, margin: '0 auto', fontSize: 15 }}>
          {sub}
        </Paragraph>
      )}
    </div>
    {children}
  </div>
);

/**
 * 🚀 LANDING (/ para visitantes, /bienvenido siempre).
 *
 * Página de conversión construida sobre principios de psicología del
 * comportamiento — cada sección ataca una barrera concreta:
 *  1. AVERSIÓN A LA PÉRDIDA invertida: el dolor de perder pesa el doble
 *     que el placer de ganar (Kahneman) → Cashback lo mitiga.
 *  2. FLUIDEZ COGNITIVA: 3 pasos, frases cortas — lo fácil de entender
 *     se percibe como más verdadero.
 *  3. TRANSPARENCIA ANTI-ESTAFA: explicamos el negocio ANTES de que lo
 *     pregunten; la duda no resuelta mata la conversión.
 *  4. PRUEBA SOCIAL: ganadores reales con evidencia de entrega.
 *  5. ESCASEZ REAL (nunca falsa): boletos que quedan y cuenta regresiva
 *     tomados de la BD.
 *  6. EFECTO DOTACIÓN: "elige TU número" — lo elegido se siente propio.
 *  7. RECIPROCIDAD: bono de bienvenida al registrarse.
 *  8. AVERSIÓN A LA AMBIGÜEDAD: FAQ que responde lo incómodo.
 *  9. PICO-FINAL: cierre fuerte con la promesa repetida.
 */
export default function Landing() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { data: raffles } = useApiOrMock('/raffles', MOCK_RAFFLES);
  const { data: winners } = useApiOrMock('/raffles/winners', MOCK_WINNERS);

  const active = raffles.filter((r) => ['active', 'live'].includes(r.status));
  const featured = active[0];
  const soldPct = featured
    ? Math.round(((featured.soldCount ?? 0) / (featured.totalTickets || 1)) * 100)
    : 0;

  const go = (path) => () => navigate(path);

  return (
    <div>
      {/* ═══ 1. HERO — la promesa en 5 palabras ═══════════════════════
          Aversión a la pérdida invertida: el titular ataca el ÚNICO
          motivo por el que la gente no compra un boleto: "y si pierdo". */}
      <div className="glass-hero fade-in-up">
        <span className="float-chip" style={{ marginBottom: 14 }}>
          ⚡ Hecho en Tumbes para todo el Perú
        </span>
        <Title style={{ margin: '14px 0 10px', fontSize: 'clamp(32px, 6vw, 56px)', lineHeight: 1.05 }}>
          Juega por el premio.<br />
          <span className="gradient-animate">Nunca pierdas tu plata.</span>
        </Title>
        <Paragraph style={{ color: MISIO_COLORS.textMuted, fontSize: 'clamp(15px, 2vw, 19px)',
          maxWidth: 620, margin: '0 auto 22px' }}>
          En Misio, si tu boleto no gana, <Text strong>una parte vuelve a ti</Text> como
          saldo de canje para nuestra tienda. Se llama <Text strong>Cashback Garantizado</Text> y es
          nuestra regla de consuelo.
        </Paragraph>
        <Space size="middle" wrap style={{ justifyContent: 'center' }}>
          <Button type="primary" size="large" className="btn-marketero" onClick={go(user ? '/sorteos' : '/login')}
            style={{ height: 60, paddingInline: 40, fontSize: 18 }}>
            🎟️ {user ? 'Ver sorteos activos' : 'Crear mi cuenta gratis'}
          </Button>
          <Button size="large" href="#como-funciona" style={{ height: 60, paddingInline: 30, fontSize: 18, fontWeight: 600 }}>
            ¿Cómo funciona?
          </Button>
        </Space>
        <div style={{ marginTop: 28, display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
          <span className="float-chip" style={{ animationDelay: '0s' }}>✅ Reembolso garantizado</span>
          <span className="float-chip" style={{ animationDelay: '1s' }}>🔴 Sorteos en vivo</span>
          <span className="float-chip" style={{ animationDelay: '2s' }}>📕 Libro de Reclamaciones</span>
          <span className="float-chip" style={{ animationDelay: '3s' }}>🚚 Envío a todo el país</span>
        </div>
      </div>

      {/* ═══ 2. EL CONTRASTE — anclaje: rifa normal vs Misio ═══════════
          Poner el "antes" al lado del "después" hace que el beneficio se
          sienta enorme sin exagerar nada. */}
      <Section
        eyebrow="La diferencia"
        title="Una rifa normal te cobra por perder"
        sub="Compara lo que pasa cuando tu número no sale."
      >
        <Row gutter={[16, 16]} justify="center">
          <Col xs={24} md={11} className="fade-in-up" style={{ animationDelay: '0.1s' }}>
            <Card className="glass-card" hoverable={false} style={{ height: '100%', borderColor: 'color-mix(in srgb, var(--z-danger) 40%, transparent)' }}>
              <Text style={{ fontSize: 12, color: MISIO_COLORS.danger, fontWeight: 700 }}>
                RIFA DE TODA LA VIDA
              </Text>
              <Title level={4} style={{ marginTop: 6 }}>Pagas S/ 5 · No ganas</Title>
              <Space direction="vertical" size={6} style={{ marginTop: 10 }}>
                <Text style={{ color: MISIO_COLORS.textMuted }}>❌ Tus S/ 5 se fueron</Text>
                <Text style={{ color: MISIO_COLORS.textMuted }}>❌ Te quedas con un papelito</Text>
                <Text style={{ color: MISIO_COLORS.textMuted }}>❌ Nunca sabes si el sorteo fue real</Text>
              </Space>
              <Divider style={{ margin: '14px 0' }} />
              <Text strong style={{ color: MISIO_COLORS.danger, fontSize: 18 }}>
                Te quedas con S/ 0
              </Text>
            </Card>
          </Col>
          <Col xs={24} md={11} className="fade-in-up" style={{ animationDelay: '0.2s' }}>
            <Card className="glass-card ant-card-hoverable" hoverable style={{ height: '100%', borderColor: MISIO_COLORS.primary }}>
              <Text style={{ fontSize: 12, color: MISIO_COLORS.saldoGreen, fontWeight: 700 }}>
                ⚡ MISIO
              </Text>
              <Title level={4} style={{ marginTop: 6 }}>Pagas S/ 5 · No ganas</Title>
              <Space direction="vertical" size={6} style={{ marginTop: 10 }}>
                <Text><CheckCircleFilled style={{ color: MISIO_COLORS.saldoGreen }} /> Tus S/ 5 vuelven como saldo de canje</Text>
                <Text><CheckCircleFilled style={{ color: MISIO_COLORS.saldoGreen }} /> Los cambias por productos de la tienda</Text>
                <Text><CheckCircleFilled style={{ color: MISIO_COLORS.saldoGreen }} /> Viste el sorteo EN VIVO, con tu número</Text>
              </Space>
              <Divider style={{ margin: '14px 0' }} />
              <Text strong className="saldo-glow" style={{ fontSize: 18 }}>
                Te quedas con S/ 5 para gastar
              </Text>
            </Card>
          </Col>
        </Row>
      </Section>

      {/* ═══ 3. CÓMO FUNCIONA — fluidez cognitiva: 3 pasos ════════════ */}
      <Section
        id="como-funciona"
        eyebrow="Cómo se usa"
        title="Tres pasos. Nada más."
        sub="Desde que entras hasta que el premio llega a tu puerta."
      >
        <Row gutter={[16, 16]}>
          {[
            { n: '1', icon: '🎟️', t: 'Elige TU número', d: 'Entra a un sorteo, mira la grilla y toca el número que te da suerte — el de tu cumpleaños, el de tu equipo, el que sea. Ese número es tuyo desde ese momento.' },
            { n: '2', icon: '📱', t: 'Paga con Yape o tu saldo', d: 'Yapeas, subes tu constancia y confirmamos. Si ya tienes saldo, es un toque y listo.' },
            { n: '3', icon: '🔴', t: 'Mira el sorteo en vivo', d: 'Transmitimos con la ruleta en pantalla y la lista de participantes visible. ¿Ganaste? Te lo enviamos con seguimiento. ¿No? Tu plata ya está de vuelta.' },
          ].map((s) => (
            <Col xs={24} md={8} key={s.n} className="fade-in-up" style={{ animationDelay: `${s.n * 0.15}s` }}>
              <Card className="glass-card ant-card-hoverable" hoverable style={{ height: '100%' }}>
                <Space align="start">
                  <div style={{
                    width: 34, height: 34, borderRadius: '50%', display: 'grid', placeItems: 'center',
                    background: MISIO_COLORS.primary, color: '#fff', fontWeight: 800, flexShrink: 0,
                  }}>
                    {s.n}
                  </div>
                  <div>
                    <div style={{ fontSize: 30, lineHeight: 1 }}>{s.icon}</div>
                    <Title level={5} style={{ margin: '8px 0 4px' }}>{s.t}</Title>
                    <Text style={{ color: MISIO_COLORS.textMuted, fontSize: 13 }}>{s.d}</Text>
                  </div>
                </Space>
              </Card>
            </Col>
          ))}
        </Row>
      </Section>

      {/* ═══ 4. TRANSPARENCIA — matar la duda "¿y esto es estafa?" ════
          La objeción que no se dice en voz alta es la que hace perder la
          venta. La respondemos antes de que la piensen. */}
      <Section
        eyebrow="Sin letra chica"
        title="¿Y ustedes de qué viven?"
        sub="La pregunta más justa del mundo. Esta es la respuesta completa."
      >
        <Card className="glass-card fade-in-up" hoverable={false} style={{ maxWidth: 760, margin: '0 auto' }}>
          <Paragraph style={{ fontSize: 15 }}>
            Cuando tu boleto no gana, tu plata vuelve como <Text strong>saldo de canje</Text>: sirve
            para llevarte productos de nuestra tienda. Nosotros compramos esos productos al por
            mayor, así que tú recibes el valor completo de tu boleto y a nosotros nos queda el
            margen del producto.
          </Paragraph>
          <Paragraph style={{ fontSize: 15, marginBottom: 0 }}>
            <Text strong>Todos ganan:</Text> tú nunca pierdes tu dinero, y nosotros vivimos de la
            tienda — no de tu mala suerte. Por eso podemos mostrar cada sorteo en vivo: no
            necesitamos que pierdas.
          </Paragraph>
          <Divider />
          <Row gutter={[16, 16]}>
            {[
              { i: <EyeFilled style={{ color: MISIO_COLORS.electricBlue }} />, t: 'Sorteos en vivo',
                d: 'Con la ruleta en pantalla y la lista de participantes a la vista. Nada de "ya se sorteó, confía".' },
              { i: <SafetyCertificateFilled style={{ color: MISIO_COLORS.saldoGreen }} />, t: 'Entregas con evidencia',
                d: 'Cada ganador aparece publicado con su boleto y la foto de la entrega.' },
              { i: <ThunderboltFilled style={{ color: MISIO_COLORS.primary }} />, t: 'Reglas escritas',
                d: 'Libro de Reclamaciones virtual (Ley 29571) y términos claros. Reclamas y respondemos.' },
            ].map((b) => (
              <Col xs={24} md={8} key={b.t}>
                <div style={{ fontSize: 22 }}>{b.i}</div>
                <Text strong style={{ display: 'block', marginTop: 4 }}>{b.t}</Text>
                <Text style={{ color: MISIO_COLORS.textMuted, fontSize: 12 }}>{b.d}</Text>
              </Col>
            ))}
          </Row>
        </Card>
      </Section>

      {/* ═══ 5. ESCASEZ REAL — el sorteo de verdad, con datos de la BD ══ */}
      {featured && (
        <Section eyebrow="Ahora mismo" title="Este sorteo está corriendo"
          sub="Los números que quedan son de verdad — sin cuentas regresivas falsas.">
          <Card className="glass-card ant-card-hoverable fade-in-up" style={{ maxWidth: 680, margin: '0 auto', borderColor: MISIO_COLORS.primary }} hoverable
            onClick={go(`/rifa/${featured._id}`)}>
            <Row gutter={[20, 16]} align="middle">
              <Col xs={24} sm={9}>
                {featured.images?.length > 0 ? (
                  <img src={`${SERVER_URL}${featured.images[0]}`} alt={featured.title}
                    style={{ width: '100%', aspectRatio: '1', objectFit: 'cover', borderRadius: 12 }} />
                ) : (
                  <div style={{ fontSize: 62, textAlign: 'center', padding: '24px 0',
                    background: 'var(--z-bg-elevated)', borderRadius: 12 }}>🎁</div>
                )}
              </Col>
              <Col xs={24} sm={15}>
                {featured.status === 'live' && <Tag color={MISIO_COLORS.danger}>🔴 EN VIVO AHORA</Tag>}
                <Title level={4} style={{ margin: '6px 0' }}>{featured.title}</Title>
                <Space size="large" wrap style={{ marginBottom: 10 }}>
                  <div>
                    <Text style={{ fontSize: 11, color: MISIO_COLORS.textMuted, display: 'block' }}>Tu boleto</Text>
                    <Text className="saldo-glow" style={{ fontSize: 22, fontWeight: 700 }}>
                      S/ {featured.ticketPrice}
                    </Text>
                  </div>
                  {featured.drawDate && (
                    <div>
                      <Text style={{ fontSize: 11, color: MISIO_COLORS.textMuted, display: 'block' }}>Se sortea en</Text>
                      <Timer type="countdown" value={dayjs(featured.drawDate).valueOf()} format="D[d] HH:mm:ss"
                        valueStyle={{ fontSize: 18, color: MISIO_COLORS.electricBlue }} />
                    </div>
                  )}
                </Space>
                {/* Efecto Zeigarnik: una barra a medio llenar incomoda —
                    el cerebro quiere completarla. Y el dato es real. */}
                <Progress percent={soldPct} showInfo={false} strokeColor={MISIO_COLORS.primary} />
                <Text style={{ fontSize: 12, color: MISIO_COLORS.textMuted }}>
                  Quedan <Text strong style={{ color: MISIO_COLORS.prizeGold }}>
                    {(featured.totalTickets ?? 0) - (featured.soldCount ?? 0)} números
                  </Text> libres de {featured.totalTickets}
                </Text>
                <Button type="primary" block style={{ marginTop: 12 }}>
                  Elegir mi número de la suerte →
                </Button>
              </Col>
            </Row>
          </Card>
        </Section>
      )}

      {/* ═══ 6. QUÉ ENCONTRARÁS — el catálogo de la casa ══════════════ */}
      <Section eyebrow="Qué hay adentro" title="Misio es más que sorteos"
        sub="Cuatro formas de pasarla bien — todas conectadas a tu misma cuenta.">
        <Row gutter={[16, 16]}>
          {[
            { i: <GiftFilled style={{ color: MISIO_COLORS.primary }} />, t: 'Sorteos con Cashback',
              d: 'Elige tus números, míralo en vivo. Si no ganas, recuperas una parte como saldo.', to: '/sorteos', cta: 'Ver sorteos' },
            { i: <ShopFilled style={{ color: MISIO_COLORS.saldoGreen }} />, t: 'Tienda',
              d: 'Canjea tu saldo o compra directo: productos con fotos, stock y envío.', to: '/tienda', cta: 'Ver tienda' },
            { i: <SmileFilled style={{ color: MISIO_COLORS.prizeGold }} />, t: 'Bingo gratis',
              d: 'Crea tu sala, pasa el código a tus amigos y jueguen. Gratis, siempre.', to: '/bingo', cta: 'Jugar bingo' },
          ].map((c) => (
            <Col xs={24} sm={12} lg={8} key={c.t} className="fade-in-up" style={{ animationDelay: '0.2s' }}>
              <Card className="glass-card ant-card-hoverable" hoverable style={{ height: '100%' }} onClick={go(c.to)}>
                <div style={{ fontSize: 30 }}>{c.i}</div>
                <Title level={5} style={{ margin: '10px 0 4px' }}>{c.t}</Title>
                <Text style={{ color: MISIO_COLORS.textMuted, fontSize: 13 }}>{c.d}</Text>
                <Button type="link" style={{ padding: 0, marginTop: 8 }}>{c.cta} →</Button>
              </Card>
            </Col>
          ))}
        </Row>
      </Section>

      {/* ═══ 7. PRUEBA SOCIAL — ganadores REALES ══════════════════════
          "Gente como yo ya ganó" es más persuasivo que cualquier adjetivo
          que podamos escribir sobre nosotros mismos. */}
      {winners.length > 0 && (
        <Section eyebrow="Prueba social" title="Ellos ya se lo llevaron"
          sub="Cada sorteo termina con un ganador real. Los publicamos todos, con su boleto y su entrega.">
          <Row gutter={[16, 16]} justify="center">
            {winners.slice(0, 3).map((w, idx) => (
              <Col xs={24} sm={12} lg={7} key={w._id || idx} className="fade-in-up" style={{ animationDelay: `${idx * 0.15}s` }}>
                <Card className="glass-card ant-card-hoverable" hoverable onClick={go('/ganadores')}>
                  {w.evidencePhotoUrl || w.images?.[0] ? (
                    <img src={`${SERVER_URL}${w.evidencePhotoUrl || w.images[0]}`} alt={w.title}
                      style={{ width: '100%', aspectRatio: '4/3', objectFit: 'cover', borderRadius: 10 }} />
                  ) : (
                    <div style={{ fontSize: 46, textAlign: 'center', padding: '18px 0',
                      background: 'var(--z-bg-elevated)', borderRadius: 10 }}>🏆</div>
                  )}
                  <Space style={{ marginTop: 10 }}>
                    <Avatar style={{ background: MISIO_COLORS.prizeGold, color: '#3d2e00' }}>🏆</Avatar>
                    <div>
                      <Text strong style={{ fontSize: 13, display: 'block' }}>{w.winnerName}</Text>
                      <Text style={{ fontSize: 11, color: MISIO_COLORS.textMuted }}>
                        ganó {w.title}
                      </Text>
                    </div>
                  </Space>
                </Card>
              </Col>
            ))}
          </Row>
          <div style={{ textAlign: 'center', marginTop: 18 }}>
            <Button onClick={go('/ganadores')} icon={<TrophyFilled />}>
              Ver todos los ganadores
            </Button>
          </div>
        </Section>
      )}

      {/* ═══ 8. FAQ — aversión a la ambigüedad ════════════════════════ */}
      <Section id="faq" title="Preguntas frecuentes">
        <div className="fade-in-up" style={{ maxWidth: 680, margin: '0 auto' }}>
          <Collapse
            accordion
            items={[
              {
                key: '1', label: '¿En serio me devuelven mi dinero si no gano?',
                children: <Text>Sí, el valor completo del boleto — automáticamente, apenas termina el sorteo. Vuelve como saldo de canje: sirve para llevarte productos de nuestra tienda. No es un cupón de descuento ni tiene fecha de vencimiento.</Text>,
              },
              {
                key: '2', label: '¿Puedo retirar ese saldo en efectivo?',
                children: <Text>No. El saldo de canje se usa en la tienda de Misio — así funciona el modelo y así podemos devolverte el 100%. Lo que sí es dinero real es el saldo que tú recargas: con ese compras boletos y productos de venta.</Text>,
              },
              {
                key: '3', label: '¿Cómo sé que el sorteo no está arreglado?',
                children: <Text>Porque lo ves. Transmitimos en vivo con la ruleta girando y la lista de participantes en pantalla; el resultado lo elige el servidor al azar antes de que la ruleta se detenga. Además publicamos a cada ganador con su código de boleto y la foto de la entrega.</Text>,
              },
              {
                key: '4', label: '¿Cómo pago? ¿Necesito tarjeta?',
                children: <Text>No. Pagas con Yape o Plin — yapeas al número que te mostramos, subes tu constancia y confirmamos tu compra. También puedes usar el saldo que ya tengas en tu cuenta.</Text>,
              },
              {
                key: '5', label: '¿Envían a mi ciudad?',
                children: <Text>Sí, a todo el Perú con seguimiento. Solo completa tu dirección en Mi Perfil para que podamos despachar apenas ganes.</Text>,
              },
              {
                key: '6', label: '¿Tiene algún costo registrarse?',
                children: <Text>Ninguno. Crear tu cuenta es gratis, el Bingo es gratis y puedes mirar todos los sorteos sin pagar nada. Solo pagas si decides comprar un boleto o un producto.</Text>,
              },
            ]}
          />
        </div>
      </Section>

      {/* ═══ 9. CIERRE — regla del pico-final ════════════════════════ */}
      <div className="glass-hero fade-in-up" style={{ margin: '64px 16px', padding: '64px 20px' }}>
        <Title level={2} style={{ fontSize: 'clamp(24px, 4vw, 36px)', marginBottom: 8 }}>
          Lo peor que te puede pasar es <span className="saldo-glow">quedarte con tu plata</span>
        </Title>
        <Paragraph style={{ color: MISIO_COLORS.textMuted, maxWidth: 520, margin: '0 auto 20px' }}>
          Crea tu cuenta gratis, elige tu número de la suerte y míralo en vivo.
          Si no sale, tu saldo te espera en la tienda.
        </Paragraph>
        <Space wrap style={{ justifyContent: 'center' }}>
          <Button type="primary" size="large" className="z-cta" onClick={go(user ? '/sorteos' : '/login')}
            style={{ height: 48, paddingInline: 30, fontSize: 16 }}>
            {user ? '🎟️ Ir a los sorteos' : '⚡ Crear mi cuenta gratis'}
          </Button>
          <Button size="large" icon={<WhatsAppOutlined />} style={{ height: 48 }}
            onClick={() => window.open('https://wa.me/?text=' + encodeURIComponent('Mira Misio: sorteos donde si no ganas, tu plata vuelve como saldo. ' + window.location.origin), '_blank')}>
            Contarle a un amigo
          </Button>
        </Space>
        <div style={{ marginTop: 16 }}>
          <Text style={{ fontSize: 11, color: MISIO_COLORS.textMuted }}>
            Solo mayores de 18 años · Juega con responsabilidad
          </Text>
        </div>
      </div>
    </div>
  );
}
