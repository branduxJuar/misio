import React, { useState, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { Card, Input, Button, Typography, Space, Tag, Divider, Spin, message } from 'antd';
import { SearchOutlined, CheckCircleOutlined, CloseCircleOutlined, UserOutlined, ClockCircleOutlined, ShopOutlined, TrophyOutlined, PhoneOutlined } from '@ant-design/icons';
import { MISIO_COLORS } from '../../theme/misioTheme';
import { api } from '../../auth/api';
import dayjs from 'dayjs';

const { Title, Text, Paragraph } = Typography;

export default function TicketValidation() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [code, setCode] = useState(searchParams.get('c') || '');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);

  useEffect(() => {
    if (code) {
      validate();
    }
    // eslint-disable-next-line
  }, []);

  const validate = async () => {
    if (!code.trim()) {
      message.warning('Ingresa un código de boleto válido');
      return;
    }
    
    setLoading(true);
    setResult(null);
    try {
      const res = await api(`/tickets/validate/${code.trim().toUpperCase()}`);
      setResult(res);
      // Update URL to reflect the code so it can be shared
      navigate(`/validar?c=${code.trim().toUpperCase()}`, { replace: true });
    } catch (err) {
      setResult({ valid: false, message: 'Boleto no encontrado o código inválido' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ maxWidth: 600, margin: '40px auto', padding: '0 20px', minHeight: '60vh' }}>
      
      <div style={{ textAlign: 'center', marginBottom: 30 }}>
        <div style={{ fontSize: 40, color: MISIO_COLORS.primary, marginBottom: 10 }}>
          ⚡ Misio
        </div>
        <Title level={2} style={{ fontFamily: 'Outfit, sans-serif', fontWeight: 900, textTransform: 'uppercase', color: '#0f172a', margin: 0 }}>
          Validador de Boletos
        </Title>
        <Paragraph style={{ color: '#64748b', marginTop: 10 }}>
          Ingresa el código de tu boleto (ej. VIA-0027) para verificar su validez oficial.
        </Paragraph>
      </div>

      <Card 
        style={{ borderRadius: 16, border: 'none', boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1)' }}
        styles={{ body: { padding: 30 } }}
      >
        <Space.Compact style={{ width: '100%', marginBottom: 20 }} size="large">
          <Input 
            placeholder="VIA-0027" 
            value={code}
            onChange={e => setCode(e.target.value.toUpperCase())}
            onPressEnter={validate}
            prefix={<SearchOutlined style={{ color: '#cbd5e1' }} />}
            style={{ fontWeight: 'bold', fontSize: 18 }}
            maxLength={10}
          />
          <Button type="primary" onClick={validate} loading={loading} style={{ background: MISIO_COLORS.primary, fontWeight: 'bold', width: 120 }}>
            Verificar
          </Button>
        </Space.Compact>

        {loading && (
          <div style={{ textAlign: 'center', padding: '40px 0' }}>
            <Spin size="large" />
            <div style={{ marginTop: 16, color: '#64748b' }}>Consultando base de datos segura...</div>
          </div>
        )}

        {!loading && result && (
          <div style={{ marginTop: 20 }}>
            {result.valid ? (
              <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', padding: 24, borderRadius: 12 }}>
                <div style={{ textAlign: 'center', marginBottom: 20 }}>
                  <CheckCircleOutlined style={{ fontSize: 48, color: '#16a34a', marginBottom: 10 }} />
                  <Title level={3} style={{ color: '#166534', margin: 0, fontFamily: 'Outfit, sans-serif' }}>
                    ¡Boleto Válido!
                  </Title>
                  <Text style={{ color: '#15803d', fontWeight: 600 }}>Registrado en el sistema Misio Oficial</Text>
                </div>
                
                <Divider style={{ borderColor: '#bbf7d0', margin: '16px 0' }} />
                
                <Space direction="vertical" size="middle" style={{ width: '100%' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Text type="secondary" style={{ color: '#166534' }}><TrophyOutlined /> Sorteo</Text>
                    <Text strong style={{ fontSize: 16, color: '#14532d' }}>{result.ticket.raffleTitle}</Text>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Text type="secondary" style={{ color: '#166534' }}><ClockCircleOutlined /> Fecha de Sorteo</Text>
                    <Text strong style={{ color: '#14532d' }}>{dayjs(result.ticket.raffleDate).format('DD/MM/YYYY HH:mm')}</Text>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Text type="secondary" style={{ color: '#166534' }}><UserOutlined /> Registrado a nombre de</Text>
                    <Text strong style={{ color: '#14532d' }}>{result.ticket.buyerName}</Text>
                  </div>
                  {result.ticket.buyerPhone && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <Text type="secondary" style={{ color: '#166534' }}><PhoneOutlined /> Contacto vinculado</Text>
                      <Text strong style={{ color: '#14532d' }}>{result.ticket.buyerPhone}</Text>
                    </div>
                  )}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Text type="secondary" style={{ color: '#166534' }}><ShopOutlined /> Vía de compra</Text>
                    <Tag color="green">{result.ticket.channel}</Tag>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Text type="secondary" style={{ color: '#166534' }}>Estado Actual</Text>
                    <Tag color={result.ticket.status === 'active' ? 'success' : 'default'} style={{ margin: 0 }}>
                      {result.ticket.status === 'active' ? 'EN PARTICIPACIÓN' : result.ticket.status.toUpperCase()}
                    </Tag>
                  </div>
                </Space>
              </div>
            ) : (
              <div style={{ background: '#fef2f2', border: '1px solid #fecaca', padding: 30, borderRadius: 12, textAlign: 'center' }}>
                <CloseCircleOutlined style={{ fontSize: 48, color: '#ef4444', marginBottom: 10 }} />
                <Title level={4} style={{ color: '#991b1b', margin: '0 0 10px 0', fontFamily: 'Outfit, sans-serif' }}>
                  {result.message}
                </Title>
                <Paragraph style={{ color: '#7f1d1d', margin: 0 }}>
                  Por favor, verifica que el código ingresado sea correcto (incluyendo los guiones). Si el problema persiste, contacta con el organizador.
                </Paragraph>
              </div>
            )}
          </div>
        )}
      </Card>
      
      <div style={{ textAlign: 'center', marginTop: 30, color: '#94a3b8', fontSize: 12 }}>
        Plataforma oficial de verificación Misio. Todas las transacciones son auditadas.
      </div>
    </div>
  );
}
