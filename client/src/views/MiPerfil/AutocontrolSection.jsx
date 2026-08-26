import React, { useState, useEffect } from 'react';
import { Card, Col, Row, Typography, Input, Select, Button, Modal, Alert, message, Space, Tag } from 'antd';
import { SafetyCertificateOutlined, ExclamationCircleOutlined, ClockCircleOutlined, CheckCircleOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import ReactMarkdown from 'react-markdown';
import { api } from '../../auth/api';

const { Title, Text, Paragraph } = Typography;

/**
 * 🛡️ SECCIÓN DE AUTOCONTROL Y JUEGO RESPONSABLE
 * Permite definir un límite de gasto mensual, límite de tiempo diario o autoexclusión.
 * Con regla obligatoria de 24 horas de espera para desactivar o modificar un límite activo.
 */
export default function AutocontrolSection({ profile = {}, demo = false, refresh, refreshUser }) {
  const [msgApi, contextHolder] = message.useMessage();
  const [loading, setLoading] = useState(false);
  
  // Inputs del formulario
  const [spendInput, setSpendInput] = useState('');
  const [timeInput, setTimeInput] = useState(undefined);

  // Modal de confirmación para espera de 24 horas
  const [modalOpen, setModalOpen] = useState(false);
  const [pendingAction, setPendingAction] = useState(null);

  // Contenido administrable desde el CMS (Admin > Contenido y Marca)
  const [termsContent, setTermsContent] = useState(null);
  useEffect(() => {
    api('/settings/legal')
      .then((res) => {
        if (res?.autocontrol) setTermsContent(res.autocontrol);
      })
      .catch(() => {});
  }, []);

  const autocontrol = profile.autocontrol || { option: 'none' };
  const isOptionActive = autocontrol.option !== 'none';
  const isPendingDisable = !!autocontrol.pendingDisableAt && Date.now() < new Date(autocontrol.pendingDisableAt).getTime();

  useEffect(() => {
    if (autocontrol.monthlySpendLimit) setSpendInput(String(autocontrol.monthlySpendLimit));
    if (autocontrol.dailyTimeLimit) setTimeInput(String(autocontrol.dailyTimeLimit));
  }, [autocontrol.monthlySpendLimit, autocontrol.dailyTimeLimit]);

  const handleSave = async (option, val) => {
    if (demo) {
      return msgApi.info('Modo demo: la configuración de autocontrol requiere conectar al backend.');
    }

    if (option === 'monthly_spend' && (!val || Number(val) <= 0)) {
      return msgApi.warning('Por favor ingresa un monto mensual válido en Soles.');
    }
    if (option === 'daily_time' && !val) {
      return msgApi.warning('Por favor selecciona la cantidad de horas diarias.');
    }

    // Si ya tiene una opción activa y no es un reinicio tras 24h, requiere confirmación obligatoria de 24h
    if (isOptionActive && !isPendingDisable && (autocontrol.option !== option || option === 'exclusion')) {
      setPendingAction({ type: 'switch_or_change', targetOption: option, value: val });
      setModalOpen(true);
      return;
    }

    // Si no había control o está cambiando sin conflicto
    executeSave({
      option,
      monthlySpendLimit: option === 'monthly_spend' ? Number(val) : undefined,
      dailyTimeLimit: option === 'daily_time' ? Number(val) : undefined,
    });
  };

  const executeSave = async (body) => {
    setLoading(true);
    try {
      await api('/users/me/autocontrol', {
        method: 'PATCH',
        body,
      });
      msgApi.success('Configuración de Autocontrol guardada con éxito ✓');
      refresh?.();
      refreshUser?.();
      setModalOpen(false);
    } catch (err) {
      if (err.message?.includes('espera obligatorio de 24 horas') || err.message?.includes('activo')) {
        setPendingAction({ type: 'disable_only' });
        setModalOpen(true);
      } else {
        msgApi.error(err.message);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleConfirmDisable = async () => {
    setLoading(true);
    try {
      await api('/users/me/autocontrol', {
        method: 'PATCH',
        body: { confirmDisable: true },
      });
      msgApi.success('Solicitud registrada. Por seguridad, el límite se liberará automáticamente en 24 horas.');
      refresh?.();
      refreshUser?.();
      setModalOpen(false);
    } catch (err) {
      msgApi.error(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleCancelDisable = async () => {
    setLoading(true);
    try {
      await api('/users/me/autocontrol', {
        method: 'PATCH',
        body: { cancelDisable: true },
      });
      msgApi.success('Has cancelado la desactivación. Tu protección de Autocontrol sigue activa ✓');
      refresh?.();
      refreshUser?.();
    } catch (err) {
      msgApi.error(err.message);
    } finally {
      setLoading(false);
    }
  };

  const renderActiveBadgeText = () => {
    switch (autocontrol.option) {
      case 'monthly_spend':
        return `Límite de Gasto Mensual: S/ ${Number(autocontrol.monthlySpendLimit || 0).toFixed(2)}`;
      case 'daily_time':
        return `Límite de Tiempo Diario: ${autocontrol.dailyTimeLimit} hora(s)`;
      case 'exclusion':
        return `Autoexclusión Indefinida Activada`;
      default:
        return 'Ninguno';
    }
  };

  return (
    <div style={{ maxWidth: 860, margin: '0 auto', paddingBottom: 20 }}>
      {contextHolder}
      
      {/* Cabecera visual de Autocontrol */}
      <div style={{ textAlign: 'center', marginBottom: 28 }}>
        <Title level={3} style={{ color: '#047857', letterSpacing: '1px', textTransform: 'uppercase', margin: '0 0 10px 0', fontWeight: 800 }}>
          Te ayudamos a establecer tus límites
        </Title>
        <Text style={{ color: '#64748b', fontSize: 15, maxWidth: 650, display: 'inline-block', lineHeight: 1.5 }}>
          Podrás gestionar de forma responsable tus actividades de juego en tu cuenta. Antes de configurar
          tus límites, por favor, lee cuidadosamente los siguientes términos y condiciones.
        </Text>
      </div>

      {/* Alerta de Estado Activo o En Desactivación Programada (24h) */}
      {isOptionActive && (
        <div style={{ marginBottom: 24 }}>
          {isPendingDisable ? (
            <Alert
              type="warning"
              showIcon
              icon={<ClockCircleOutlined style={{ fontSize: 24, color: '#f59e0b' }} />}
              message={<Text strong style={{ fontSize: 16 }}>⏳ Desactivación programada en 24 horas</Text>}
              description={
                <div style={{ marginTop: 6 }}>
                  <p style={{ margin: '0 0 12px 0', color: '#475569' }}>
                    Solicistate desactivar o cambiar tu límite actual (<b>{renderActiveBadgeText()}</b>). 
                    Por normas de Juego Responsable y protección de tu bienestar, la desactivación se completará automáticamente el{' '}
                    <b>{dayjs(autocontrol.pendingDisableAt).format('DD/MM/YYYY a las HH:mm')}</b>. 
                    Hasta entonces, tu límite actual continúa protegiéndote.
                  </p>
                  <Button size="small" type="primary" danger onClick={handleCancelDisable} loading={loading}>
                    Cancelar desactivación y mantener límite
                  </Button>
                </div>
              }
              style={{ borderRadius: 12, padding: 18, border: '1px solid #fef3c7', background: '#fffbeb', boxShadow: '0 4px 12px rgba(0,0,0,0.03)' }}
            />
          ) : (
            <Alert
              type="success"
              showIcon
              icon={<CheckCircleOutlined style={{ fontSize: 24, color: '#10b981' }} />}
              message={<Text strong style={{ fontSize: 16, color: '#065f46' }}>✅ Autocontrol Activo: {renderActiveBadgeText()}</Text>}
              description={
                <div style={{ marginTop: 6 }}>
                  <p style={{ margin: '0 0 12px 0', color: '#475569' }}>
                    Solo puedes tener una opción de autocontrol activa a la vez. Si deseas desactivar tu límite actual o pasase a otra opción, 
                    el sistema requerirá una espera obligatoria de 24 horas tras la confirmación.
                  </p>
                  <Button size="small" style={{ border: '1px solid #047857', color: '#047857', fontWeight: 600 }} onClick={() => { setPendingAction({ type: 'disable_only' }); setModalOpen(true); }}>
                    Solicitar desactivación o cambio de límite (Espera de 24h)
                  </Button>
                </div>
              }
              style={{ borderRadius: 12, padding: 18, border: '1px solid #d1fae5', background: '#ecfdf5', boxShadow: '0 4px 12px rgba(0,0,0,0.03)' }}
            />
          )}
        </div>
      )}

      {/* Grilla de Opciones de Límites */}
      <Row gutter={[20, 20]}>
        {/* 1. LÍMITE DE GASTO MENSUAL */}
        <Col xs={24} md={12}>
          <Card 
            style={{ 
              borderRadius: 16, border: '1px solid #e2e8f0', height: '100%', 
              boxShadow: '0 4px 15px rgba(13, 148, 136, 0.05)', background: '#ffffff',
              display: 'flex', flexDirection: 'column'
            }}
            styles={{ body: { flex: 1, display: 'flex', flexDirection: 'column', padding: '24px' } }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 16 }}>
              <div style={{
                width: 52, height: 52, borderRadius: '50%', border: '3.5px solid #047857',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: '#ecfdf5', color: '#047857', fontWeight: 900, fontSize: 20, flexShrink: 0
              }}>
                S/.
              </div>
              <Title level={5} style={{ margin: 0, color: '#047857', fontSize: 18, fontWeight: 700 }}>
                Límite de gasto mensual:
              </Title>
            </div>
            
            <Text style={{ color: '#4b5563', fontSize: 13.5, flex: 1, marginBottom: 20, lineHeight: 1.5 }}>
              Establece un monto máximo que puedes gastar cada mes en tus actividades de juego.
            </Text>

            <div style={{ marginTop: 'auto' }}>
              <Text strong style={{ display: 'block', color: '#374151', fontSize: 14, marginBottom: 6 }}>
                Soles:
              </Text>
              <Input 
                size="large" 
                placeholder="Ej. 100.00" 
                type="number" 
                value={spendInput} 
                onChange={(e) => setSpendInput(e.target.value)}
                style={{ borderRadius: 8, borderColor: '#cbd5e1', marginBottom: 14 }}
              />
              <Button 
                type="primary" 
                size="large" 
                block 
                loading={loading}
                style={{ background: '#047857', fontWeight: 600, borderRadius: 8, height: 44 }}
                onClick={() => handleSave('monthly_spend', spendInput)}
              >
                Guardar
              </Button>
            </div>
          </Card>
        </Col>

        {/* 2. LÍMITE DE TIEMPO DIARIO */}
        <Col xs={24} md={12}>
          <Card 
            style={{ 
              borderRadius: 16, border: '1px solid #e2e8f0', height: '100%', 
              boxShadow: '0 4px 15px rgba(13, 148, 136, 0.05)', background: '#ffffff',
              display: 'flex', flexDirection: 'column'
            }}
            styles={{ body: { flex: 1, display: 'flex', flexDirection: 'column', padding: '24px' } }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 16 }}>
              <div style={{
                width: 52, height: 52, borderRadius: '50%', border: '3.5px solid #047857',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: '#ecfdf5', color: '#047857', fontWeight: 900, fontSize: 19, flexShrink: 0
              }}>
                24<span style={{ fontSize: 11, marginLeft: 1 }}>h</span>
              </div>
              <Title level={5} style={{ margin: 0, color: '#047857', fontSize: 18, fontWeight: 700 }}>
                Límite de tiempo diario
              </Title>
            </div>

            <Text style={{ color: '#4b5563', fontSize: 13.5, flex: 1, marginBottom: 20, lineHeight: 1.5 }}>
              Define la cantidad máxima de horas que puedes estar conectado a nuestra web.
            </Text>

            <div style={{ marginTop: 'auto' }}>
              <Text strong style={{ display: 'block', color: '#374151', fontSize: 14, marginBottom: 6 }}>
                Horas:
              </Text>
              <Select
                size="large"
                style={{ width: '100%', marginBottom: 14 }}
                placeholder="Seleccione"
                value={timeInput}
                onChange={(val) => setTimeInput(val)}
                options={[
                  { value: '1', label: '1 hora al día' },
                  { value: '2', label: '2 horas al día' },
                  { value: '3', label: '3 horas al día' },
                  { value: '4', label: '4 horas al día' },
                  { value: '5', label: '5 horas al día' },
                  { value: '6', label: '6 horas al día' },
                  { value: '8', label: '8 horas al día' },
                ]}
              />
              <Button 
                type="primary" 
                size="large" 
                block 
                loading={loading}
                style={{ background: '#047857', fontWeight: 600, borderRadius: 8, height: 44 }}
                onClick={() => handleSave('daily_time', timeInput)}
              >
                Guardar
              </Button>
            </div>
          </Card>
        </Col>

        {/* 3. AUTOEXCLUSIÓN INDEFINIDA */}
        <Col xs={24}>
          <Card 
            style={{ 
              borderRadius: 16, border: '1px solid #e2e8f0', 
              boxShadow: '0 4px 15px rgba(13, 148, 136, 0.05)', background: '#ffffff',
            }}
            styles={{ body: { padding: '24px' } }}
          >
            <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 20 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 16, flex: 1, minWidth: '280px' }}>
                <div style={{
                  width: 52, height: 52, borderRadius: '50%', border: '3.5px solid #047857',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  background: '#ecfdf5', color: '#047857', fontWeight: 900, fontSize: 19, flexShrink: 0
                }}>
                  24<span style={{ fontSize: 11, marginLeft: 1 }}>h</span>
                </div>
                <div>
                  <Title level={5} style={{ margin: '0 0 4px 0', color: '#047857', fontSize: 18, fontWeight: 700 }}>
                    Autoexclusión
                  </Title>
                  <Text style={{ color: '#4b5563', fontSize: 14, lineHeight: 1.5, display: 'block' }}>
                    Establece la autoexclusión de tiempo indefinido para la recarga y compra de los juegos.
                  </Text>
                </div>
              </div>
              
              <Button 
                type="primary" 
                size="large"
                loading={loading}
                style={{ 
                  background: '#047857', fontWeight: 600, borderRadius: 8, 
                  minWidth: 200, height: 44, padding: '0 32px' 
                }}
                onClick={() => handleSave('exclusion')}
              >
                Establecer
              </Button>
            </div>
          </Card>
        </Col>
      </Row>

      {/* TÉRMINOS Y CONDICIONES DE AUTOCONTROL (Editables desde Admin > Contenido) */}
      <div style={{ marginTop: 36, padding: '28px 32px', background: '#f8fafc', borderRadius: 16, border: '1px solid #e2e8f0' }}>
        {termsContent ? (
          <div className="z-legal-content">
            <ReactMarkdown>{termsContent}</ReactMarkdown>
          </div>
        ) : (
          <>
            <Title level={5} style={{ color: '#0f172a', margin: '0 0 14px 0', fontSize: 16, fontWeight: 800 }}>
              Términos y Condiciones de Autocontrol
            </Title>
            
            <Paragraph style={{ color: '#475569', fontSize: 14, lineHeight: 1.6, marginBottom: 16 }}>
              Dispones de tres opciones de autocontrol, pero únicamente puedes elegir solo una de ellas a la vez:
            </Paragraph>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14, color: '#334155', fontSize: 14, lineHeight: 1.6 }}>
              <div>
                <b style={{ color: '#1e293b' }}>1. Límite de gasto mensual:</b> Si eliges esta opción podrás consumir hasta el monto límite que establezcas. 
                La contabilización del gasto se reiniciará automáticamente el primer día de cada mes calendario, independientemente de cuando lo hayas configurado. 
                Si deseas cambiar el monto o elegir el límite de tiempo diario, debes hacerlo antes del fin del mes en curso para que se aplique el cambio en el siguiente mes.
              </div>

              <div>
                <b style={{ color: '#1e293b' }}>2. Límite de tiempo diario:</b> Si eliges esta opción podrás jugar únicamente el tiempo diario establecido. 
                Si cierras tu sesión antes de alcanzar el límite y luego vuelves a iniciar sesión podrás seguir jugando hasta que alcances dicho límite, 
                en caso superes el tiempo ya no podrás jugar ese día y deberás esperar hasta el día siguiente.
              </div>

              <div>
                <b style={{ color: '#1e293b' }}>3. Autoexclusión indefinida:</b> No podrás jugar ni recargar saldo desde el momento que configures esta opción, 
                pero esta opción no te impedirá retirar tus premios ganados.
              </div>

              <div style={{ marginTop: 4 }}>
                <b style={{ color: '#1e293b' }}>Ten en cuenta que:</b>
                <ul style={{ marginTop: 8, paddingLeft: 20, display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 0 }}>
                  <li>Una vez alcanzado el límite de tiempo diario o de gasto mensual no podrás realizar más apuestas o jugar en tu cuenta hasta que empiece el nuevo día o mes según sea el caso.</li>
                  <li>Puedes cambiar o desactivar tus límites de autocontrol una vez cada 24 horas.</li>
                </ul>
              </div>

              <div style={{ 
                marginTop: 14, padding: '16px 20px', background: '#ecfdf5', borderLeft: '4px solid #10b981', 
                borderRadius: '0 8px 8px 0', color: '#065f46', fontWeight: 700, textAlign: 'center', fontSize: 14.5 
              }}>
                Conoce tus límites y juega de manera responsable. Tu bienestar es nuestra prioridad.
              </div>
            </div>
          </>
        )}
      </div>

      {/* MODAL DE CONFIRMACIÓN DE ESPERA DE 24 HORAS */}
      <Modal
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        title={
          <Space>
            <ExclamationCircleOutlined style={{ color: '#f59e0b', fontSize: 22 }} />
            <span style={{ color: '#0f172a', fontWeight: 700 }}>Confirmar Desactivación o Cambio (Espera de 24h)</span>
          </Space>
        }
        footer={[
          <Button key="back" onClick={() => setModalOpen(false)}>
            Volver
          </Button>,
          <Button 
            key="confirm" 
            type="primary" 
            style={{ background: '#047857', fontWeight: 600 }}
            loading={loading}
            onClick={handleConfirmDisable}
          >
            Confirmar y esperar 24 horas
          </Button>,
        ]}
      >
        <div style={{ paddingTop: 10, color: '#334155', fontSize: 14.5, lineHeight: 1.6 }}>
          <p>
            Actualmente tienes configurada una opción de Autocontrol en tu cuenta (<b>{renderActiveBadgeText()}</b>).
          </p>
          <p>
            Por tu seguridad, bienestar y conforme a las normas de <b>Juego Responsable</b>, para retirar un límite o flexibilizarlo, 
            es obligatoria una etapa de reflexión con un <b>período de espera de 24 horas</b> tras tu confirmación.
          </p>
          <p style={{ background: '#f8fafc', padding: 12, borderRadius: 8, borderLeft: '3px solid #f59e0b', margin: '14px 0 0 0' }}>
            ⏳ <b>¿Qué ocurrirá tras confirmar?</b><br />
            Tu límite actual se mantendrá totalmente activo durante las siguientes 24 horas. Una vez transcurrido el plazo, 
            la restricción se levantará de manera automática.
          </p>
        </div>
      </Modal>
    </div>
  );
}
