import React, { useEffect, useState } from 'react';
import {
  Modal, Typography, InputNumber, Input, Button, Space, Radio, Image, Alert,
  Steps, message, Divider, Tag,
} from 'antd';
import { QrcodeOutlined, WalletFilled } from '@ant-design/icons';
import { MISIO_COLORS } from '../theme/misioTheme';
import { api, SERVER_URL } from '../auth/api';
import { useAuth } from '../auth/AuthContext';

const { Text, Title } = Typography;

/**
 * SPRINT 3 — Modal de recarga/pago con QR.
 *
 * Dos usos:
 *  - Recarga libre desde "Mi Misio": el usuario elige el monto.
 *  - Pago del carrito desde el detalle de rifa: monto FIJO + intención
 *    de compra (al confirmar el operador, los números se compran solos).
 *
 * Flujo: elegir método (configurados por el admin) → ver QR + cuenta →
 * pagar en su app → ingresar N° de operación → registrar (nace pending).
 */
export default function RechargeModal({
  open,
  onClose,
  fixedAmount = null, // Si viene del carrito: monto exacto
  purchaseIntent = null, // { raffleId, ticketNumbers } — auto-compra al confirmar
  onRegistered = () => {},
}) {
  const [msgApi, contextHolder] = message.useMessage();
  const { refreshUser } = useAuth();
  const [methods, setMethods] = useState([]);
  const [methodId, setMethodId] = useState(null);
  const [amount, setAmount] = useState(fixedAmount ?? 20);
  const [operationNumber, setOperationNumber] = useState('');
  const [promoCode, setPromoCode] = useState('');
  const [promoValid, setPromoValid] = useState(null); // null, 'loading', 'valid', 'invalid'
  const [promoMessage, setPromoMessage] = useState('');
  const [availablePromos, setAvailablePromos] = useState([]);
  const [step, setStep] = useState(0); // 0: monto+método · 1: QR+operación
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setStep(0);
    setOperationNumber('');
    setPromoCode('');
    setPromoValid(null);
    setPromoMessage('');
    setAmount(fixedAmount ?? 20);
    api('/payments/methods')
      .then((m) => {
        setMethods(m);
        setMethodId(m[0]?._id ?? null);
      })
      .catch(() => setMethods([]));

    api('/inbox')
      .then((messages) => {
        if (messages && messages.length > 0) {
          const promos = messages.filter(m => m.kind === 'code' && m.code).map(m => m.code);
          setAvailablePromos([...new Set(promos)]);
        }
      })
      .catch(() => setAvailablePromos([]));
  }, [open, fixedAmount]);

  const method = methods.find((m) => m._id === methodId);

  const register = async () => {
    if (!operationNumber || !operationNumber.trim()) {
      msgApi.error(`El número de operación es obligatorio para validar tu pago de ${method?.name ?? 'Yape / Plin'}.`);
      return;
    }
    if (operationNumber.trim().length < 4) {
      msgApi.error('El número de operación ingresado es demasiado corto. Verifícalo en tu app.');
      return;
    }
    setBusy(true);
    try {
      await api('/transactions/deposit', {
        method: 'POST',
        body: {
          amount,
          type: 'deposit_yape',
          methodName: method?.name,
          operationNumber: operationNumber.trim(),
          purchaseIntent: purchaseIntent ?? undefined,
          promoCode: promoValid === 'valid' ? promoCode : undefined,
        },
      });
      msgApi.success(
        purchaseIntent
          ? '¡Pago registrado! Cuando el operador lo confirme, tus números se comprarán automáticamente y te avisaremos.'
          : '¡Recarga registrada! El operador la confirmará en minutos y tu saldo aparecerá solo.',
        7,
      );
      onRegistered();
      onClose();
    } catch (err) {
      msgApi.error(err.message);
    } finally {
      setBusy(false);
    }
  };

  const validatePromo = async () => {
    if (!promoCode.trim()) return;
    setPromoValid('loading');
    try {
      const res = await api('/promocodes/validate', {
        method: 'POST',
        body: { code: promoCode, type: 'bonus_recharge' },
      });
      setPromoValid('valid');
      setPromoMessage(`¡Código válido! Recibirás ${res.value}% extra al confirmar tu pago.`);
    } catch (err) {
      setPromoValid('invalid');
      setPromoMessage(err.message || 'Código inválido o expirado.');
    }
  };

  return (
    <Modal
      open={open}
      onCancel={() => { refreshUser?.(); onClose(); }}
      footer={null}
      title={
        <>
          <WalletFilled style={{ color: MISIO_COLORS.saldoGreen }} />{' '}
          {purchaseIntent ? 'Pagar tus números con Yape/Plin' : 'Recargar saldo contable'}
        </>
      }
      destroyOnHidden
    >
      {contextHolder}
      <Steps
        size="small"
        current={step}
        items={[{ title: 'Monto y método' }, { title: 'Paga y registra' }]}
        style={{ marginBottom: 20 }}
      />

      {methods.length === 0 && (
        <Alert
          type="warning" showIcon style={{ marginBottom: 16 }}
          message="No hay métodos de pago configurados todavía (el admin los configura en Pagos)."
        />
      )}

      {step === 0 && (
        <Space direction="vertical" size="middle" style={{ width: '100%' }}>
          <div>
            <Text style={{ color: MISIO_COLORS.textMuted }}>Monto a {purchaseIntent ? 'pagar' : 'recargar'} (S/)</Text>
            <InputNumber
              min={1}
              value={amount}
              onChange={(v) => setAmount(v ?? 1)}
              disabled={!!fixedAmount}
              size="large"
              style={{ width: '100%', marginTop: 6 }}
            />
            {fixedAmount && (
              <Text style={{ fontSize: 12, color: MISIO_COLORS.textMuted }}>
                Monto exacto de tu carrito — yapea esta cantidad EXACTA.
              </Text>
            )}
          </div>

          <div>
            <Text style={{ color: MISIO_COLORS.textMuted }}>Método de pago</Text>
            <Radio.Group
              value={methodId}
              onChange={(e) => setMethodId(e.target.value)}
              style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 6 }}
            >
              {methods.map((m) => (
                <Radio.Button key={m._id} value={m._id}
                  style={{ height: 'auto', padding: '10px 14px', borderRadius: 10 }}>
                  <strong>{m.name}</strong>
                  <div style={{ fontSize: 12, color: MISIO_COLORS.textMuted }}>
                    {m.holderName} · {m.accountNumber}
                  </div>
                </Radio.Button>
              ))}
            </Radio.Group>
          </div>

          <Divider style={{ margin: '8px 0' }} />

          <div>
            <Text style={{ color: MISIO_COLORS.textMuted }}>¿Tienes un código promocional?</Text>
            <Space.Compact style={{ width: '100%', marginTop: 6 }}>
              <Input
                placeholder="Ej. NUEVO2026"
                value={promoCode}
                onChange={(e) => setPromoCode(e.target.value.toUpperCase())}
                style={{ textTransform: 'uppercase' }}
                disabled={promoValid === 'loading' || promoValid === 'valid'}
              />
              <Button 
                type="primary" 
                onClick={validatePromo}
                loading={promoValid === 'loading'}
                disabled={!promoCode || promoValid === 'valid'}
              >
                {promoValid === 'valid' ? 'Aplicado' : 'Validar'}
              </Button>
            </Space.Compact>
            {promoValid === 'valid' && <Text type="success" style={{ display: 'block', fontSize: 12, marginTop: 4 }}>{promoMessage}</Text>}
            {promoValid === 'invalid' && <Text type="danger" style={{ display: 'block', fontSize: 12, marginTop: 4 }}>{promoMessage}</Text>}
            
            {availablePromos.length > 0 && promoValid !== 'valid' && (
              <div style={{ marginTop: 8 }}>
                <Text style={{ fontSize: 12, color: MISIO_COLORS.textMuted }}>Cupones disponibles:</Text>
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '4px' }}>
                  {availablePromos.map(code => (
                    <Button 
                      key={code} 
                      size="small" 
                      type="dashed"
                      onClick={() => setPromoCode(code)}
                      style={{ color: MISIO_COLORS.primary, borderColor: MISIO_COLORS.primary }}
                    >
                      {code}
                    </Button>
                  ))}
                </div>
              </div>
            )}
          </div>

          <Button type="primary" size="large" block disabled={!method} onClick={() => setStep(1)} style={{ marginTop: 8 }}>
            Ver QR de pago
          </Button>
        </Space>
      )}

      {step === 1 && method && (
        <Space direction="vertical" size="middle" style={{ width: '100%', textAlign: 'center' }}>
          {/* EL QR DE PAGO configurado por el admin */}
          {method.qrImageUrl ? (
            <Image
              src={`${SERVER_URL}${method.qrImageUrl}`}
              width={220}
              style={{ borderRadius: 14, border: `2px solid ${MISIO_COLORS.primary}` }}
            />
          ) : (
            <div style={{ width: 220, height: 220, margin: '0 auto', borderRadius: 14,
              background: MISIO_COLORS.bgElevated, display: 'grid', placeItems: 'center' }}>
              <QrcodeOutlined style={{ fontSize: 64, color: MISIO_COLORS.textMuted }} />
            </div>
          )}

          <div>
            <Title level={4} style={{ margin: 0 }}>
              {method.name} · <span className="saldo-glow">S/ {Number(amount).toFixed(2)}</span>
            </Title>
            <Text style={{ color: MISIO_COLORS.textMuted }}>
              {method.holderName} — <Text code copyable>{method.accountNumber}</Text>
            </Text>
            {method.instructions && (
              <>
                <br />
                <Text style={{ fontSize: 12, color: MISIO_COLORS.textMuted }}>{method.instructions}</Text>
              </>
            )}
          </div>

          <Divider style={{ margin: '4px 0' }} />

          <div style={{ textAlign: 'left', background: MISIO_COLORS.bgElevated, padding: '12px 14px', borderRadius: 12, border: '1px solid #333', width: '100%' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
              <Text strong style={{ color: MISIO_COLORS.textMain, fontSize: 13 }}>
                N° de Operación o Código <span style={{ color: '#ff4d4f' }}>*</span>
              </Text>
              <Tag color="error" style={{ margin: 0, fontSize: 10, fontWeight: 700 }}>OBLIGATORIO</Tag>
            </div>
            <Text style={{ fontSize: 11, color: MISIO_COLORS.textMuted, display: 'block', marginBottom: 8, lineHeight: 1.4 }}>
              {purchaseIntent
                ? `Para verificar y procesar la compra de tus tickets, debes escribir el número o código de operación que emitió ${method?.name ?? 'Yape / Plin'} al transferir.`
                : `Para comprobar y acreditar tu saldo en Misio, es indispensable ingresar el número de operación que emitió ${method?.name ?? 'tu app de pago'}.`}
            </Text>
            <Input
              placeholder={`Ej: 03482715 (N° de ${method?.name ?? 'Yape/Plin'})`}
              value={operationNumber}
              onChange={(e) => setOperationNumber(e.target.value)}
              status={!operationNumber.trim() ? 'error' : ''}
              size="large"
              maxLength={30}
              style={{ fontWeight: 600, fontSize: 15 }}
            />
            {!operationNumber.trim() && (
              <Text style={{ fontSize: 11, color: '#ff4d4f', marginTop: 6, display: 'block' }}>
                ⚠️ Ingresa el número de operación de tu comprobante para poder continuar.
              </Text>
            )}
          </div>

          <Button
            type="primary"
            size="large"
            block
            loading={busy}
            disabled={!operationNumber.trim() || operationNumber.trim().length < 4}
            onClick={register}
            style={{ marginTop: 4, height: 46, fontWeight: 600 }}
          >
            Ya pagué — registrar mi {purchaseIntent ? 'compra de tickets' : 'recarga'}
          </Button>
          <Button type="text" block onClick={() => setStep(0)}>← Cambiar método o monto</Button>
        </Space>
      )}
    </Modal>
  );
}
