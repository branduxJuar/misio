import React, { useEffect, useState } from 'react';
import {
  Modal, Typography, InputNumber, Input, Button, Space, Radio, Image, Alert,
  message, Divider, Tag,
} from 'antd';
import { CheckCircleFilled, CheckOutlined, QrcodeOutlined, RightOutlined, WalletFilled } from '@ant-design/icons';
import { MISIO_COLORS } from '../theme/misioTheme';
import { api, SERVER_URL } from '../auth/api';
import { useAuth } from '../auth/AuthContext';

const { Text, Title } = Typography;

const looksLikePeruvianMobile = (value) => /^9\d{8}$/.test(value.replace(/[\s-]/g, ''));

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
  const [operationTouched, setOperationTouched] = useState(false);
  const [qrLoadFailed, setQrLoadFailed] = useState(false);
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
    setOperationTouched(false);
    setQrLoadFailed(false);
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

    if (purchaseIntent) {
      setAvailablePromos([]);
      return;
    }

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
  const operationValue = operationNumber.trim();
  const operationIsPhone = looksLikePeruvianMobile(operationValue);
  const operationInvalid = operationValue.length < 4 || operationIsPhone;

  const register = async () => {
    setOperationTouched(true);
    if (!operationNumber || !operationNumber.trim()) {
      msgApi.error(`El número de operación es obligatorio para validar tu pago de ${method?.name ?? 'Yape / Plin'}.`);
      return;
    }
    if (operationNumber.trim().length < 4) {
      msgApi.error('El número de operación ingresado es demasiado corto. Verifícalo en tu app.');
      return;
    }
    if (looksLikePeruvianMobile(operationNumber.trim())) {
      msgApi.error('No ingreses tu celular. Coloca el código de operación de tu comprobante.');
      return;
    }
    setBusy(true);
    try {
      await api('/transactions/deposit', {
        method: 'POST',
        idempotencyKey: crypto.randomUUID(),
        body: {
          amount,
          type: 'deposit_yape',
          methodName: method?.name,
          operationNumber: operationNumber.trim(),
          purchaseIntent: purchaseIntent ?? undefined,
          // El cupón de boletos se aplica una sola vez en el carrito.
          // Este modal conserva cupones únicamente para recargas de saldo.
          promoCode: !purchaseIntent && promoValid === 'valid' ? promoCode : undefined,
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
      className="misio-payment-modal"
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
      <nav className="payment-progress" aria-label="Progreso del pago">
        <button
          type="button"
          className={`payment-progress-step ${step === 0 ? 'is-current' : 'is-complete'}`}
          onClick={() => step === 1 && setStep(0)}
          aria-current={step === 0 ? 'step' : undefined}
        >
          <span className="payment-progress-marker">
            {step === 1 ? <CheckOutlined /> : '1'}
          </span>
          <span className="payment-progress-copy">
            <strong>Monto y método</strong>
            <small>{step === 1 ? 'Completado' : 'Elige cómo pagar'}</small>
          </span>
        </button>

        <span className={`payment-progress-line ${step === 1 ? 'is-complete' : ''}`} />

        <div
          className={`payment-progress-step ${step === 1 ? 'is-current' : 'is-pending'}`}
          aria-current={step === 1 ? 'step' : undefined}
        >
          <span className="payment-progress-marker">2</span>
          <span className="payment-progress-copy">
            <strong>Comprobante</strong>
            <small>Confirma tu pago</small>
          </span>
        </div>
      </nav>

      {methods.length === 0 && (
        <Alert
          type="warning" showIcon style={{ marginBottom: 16 }}
          message="No hay métodos de pago configurados todavía (el admin los configura en Pagos)."
        />
      )}

      {step === 0 && (
        <Space direction="vertical" size="middle" style={{ width: '100%' }}>
          {fixedAmount ? (
            <div className="payment-amount-summary">
              <Text className="payment-amount-label">Total exacto a pagar</Text>
              <div className="payment-amount-value">S/ {Number(amount).toFixed(2)}</div>
              <Text className="payment-amount-note">Envía exactamente este monto</Text>
            </div>
          ) : (
            <div>
              <Text strong>Monto a recargar</Text>
              <InputNumber
                min={1}
                prefix="S/"
                value={amount}
                onChange={(v) => setAmount(v ?? 1)}
                size="large"
                style={{ width: '100%', marginTop: 6 }}
              />
            </div>
          )}

          <div>
            <Text strong>Elige el método de pago</Text>
            <Radio.Group
              value={methodId}
              onChange={(e) => setMethodId(e.target.value)}
              className="payment-method-list"
            >
              {methods.map((m) => (
                <Radio.Button
                  key={m._id}
                  value={m._id}
                  className="payment-method-option"
                >
                  <div className="payment-method-copy">
                    <strong>{m.name}</strong>
                    <span>{m.holderName} · {m.accountNumber}</span>
                  </div>
                  <CheckCircleFilled className="payment-method-check" />
                </Radio.Button>
              ))}
            </Radio.Group>
          </div>

          {!purchaseIntent && (
            <>
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
            </>
          )}

          <Button
            type="primary"
            size="large"
            block
            disabled={!method}
            onClick={() => setStep(1)}
            icon={<RightOutlined />}
            iconPosition="end"
            className="payment-continue-button"
          >
            Continuar para pagar
          </Button>
        </Space>
      )}

      {step === 1 && method && (
        <Space direction="vertical" size="middle" className="payment-proof-step">
          {/* EL QR DE PAGO configurado por el admin */}
          <div className="payment-destination">
            {method.qrImageUrl && !qrLoadFailed ? (
              <Image
                src={`${SERVER_URL}${method.qrImageUrl}`}
                width={128}
                preview={false}
                onError={() => setQrLoadFailed(true)}
                className="payment-qr-image"
              />
            ) : (
              <div className="payment-qr-fallback">
                <QrcodeOutlined />
                <span>QR no disponible</span>
              </div>
            )}

            <div className="payment-destination-copy">
              <Text className="payment-step-kicker">PAGA AHORA</Text>
              <Title level={3} style={{ margin: '2px 0' }}>
                {method.name} · <span className="saldo-glow">S/ {Number(amount).toFixed(2)}</span>
              </Title>
              <Text style={{ color: MISIO_COLORS.textMuted }}>{method.holderName}</Text>
              <Text code copyable className="payment-account-number">{method.accountNumber}</Text>
              {method.instructions && (
                <Text className="payment-method-instructions">{method.instructions}</Text>
              )}
            </div>
          </div>

          <Divider style={{ margin: '4px 0' }} />

          <div className="payment-operation-form">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
              <Text strong style={{ color: MISIO_COLORS.textMain, fontSize: 13 }}>
                Código de operación <span style={{ color: '#ff4d4f' }}>*</span>
              </Text>
              <Tag color="error" style={{ margin: 0, fontSize: 10, fontWeight: 700 }}>OBLIGATORIO</Tag>
            </div>
            <Text style={{ fontSize: 11, color: MISIO_COLORS.textMuted, display: 'block', marginBottom: 8, lineHeight: 1.4 }}>
              {purchaseIntent
                ? `Para verificar tu compra, ingresa el código de operación que aparece en el comprobante de ${method?.name ?? 'Yape / Plin'}.`
                : `Para acreditar tu saldo, ingresa el código de operación que aparece en el comprobante de ${method?.name ?? 'tu app de pago'}.`}
            </Text>
            <Input
              placeholder="Ejemplo: 03482715"
              value={operationNumber}
              onChange={(e) => setOperationNumber(e.target.value.replace(/^\s+/, ''))}
              onBlur={() => setOperationTouched(true)}
              status={operationTouched && operationInvalid ? 'error' : ''}
              size="large"
              maxLength={30}
              autoComplete="off"
              style={{ fontWeight: 600, fontSize: 15 }}
            />
            {operationTouched && !operationValue ? (
              <Text style={{ fontSize: 11, color: '#ff4d4f', marginTop: 6, display: 'block' }}>
                Ingresa el código de operación del comprobante. No coloques tu número celular.
              </Text>
            ) : operationTouched && operationIsPhone ? (
              <Text style={{ fontSize: 11, color: '#ff4d4f', marginTop: 6, display: 'block' }}>
                Este valor parece un celular. Ingresa el código de operación del comprobante.
              </Text>
            ) : operationTouched && operationValue.length < 4 ? (
              <Text style={{ fontSize: 11, color: '#ff4d4f', marginTop: 6, display: 'block' }}>
                Revisa el comprobante: el código ingresado es demasiado corto.
              </Text>
            ) : null}
          </div>

          <Button
            type="primary"
            size="large"
            block
            loading={busy}
            disabled={operationInvalid}
            onClick={register}
            style={{ marginTop: 4, height: 46, fontWeight: 600 }}
          >
            Completar pago
          </Button>
          <Button type="text" block onClick={() => setStep(0)}>Cambiar método o monto</Button>
        </Space>
      )}
    </Modal>
  );
}
