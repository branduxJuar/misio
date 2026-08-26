import React, { useState } from 'react';
import { Card, Form, Input, Button, Typography, message, Result } from 'antd';
import { LockOutlined, EyeTwoTone, EyeInvisibleOutlined } from '@ant-design/icons';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../../auth/api';
import { MISIO_COLORS } from '../../theme/misioTheme';

const { Title, Text } = Typography;

/**
 * 🔑 CREAR NUEVA CONTRASEÑA — el usuario llega desde el enlace del correo
 * (/reset-password?token=xxx). Valida el token y aplica la clave.
 */
export default function ResetPassword() {
  const [params] = useSearchParams();
  const token = params.get('token');
  const navigate = useNavigate();
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [msgApi, contextHolder] = message.useMessage();

  if (!token) {
    return (
      <div style={{ maxWidth: 460, margin: '60px auto', padding: 20 }}>
        <Result status="warning" title="Enlace inválido"
          subTitle="El enlace de recuperación no es válido o está incompleto. Pide uno nuevo desde el login."
          extra={<Button type="primary" onClick={() => navigate('/login')}>Ir al login</Button>} />
      </div>
    );
  }

  if (done) {
    return (
      <div style={{ maxWidth: 460, margin: '60px auto', padding: 20 }}>
        {contextHolder}
        <Result status="success" title="¡Contraseña actualizada!"
          subTitle="Ya puedes iniciar sesión con tu nueva contraseña."
          extra={<Button type="primary" onClick={() => navigate('/login')}>Iniciar sesión</Button>} />
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 460, margin: '60px auto', padding: 20 }}>
      {contextHolder}
      <Card>
        <Title level={4} style={{ marginTop: 0 }}>Crea tu nueva contraseña</Title>
        <Text style={{ color: MISIO_COLORS.textMuted, fontSize: 13 }}>
          Elige una contraseña de al menos 8 caracteres, con letras y números.
        </Text>
        <Form layout="vertical" style={{ marginTop: 18 }} onFinish={async (v) => {
          setSubmitting(true);
          try {
            await api('/auth/reset-password', { method: 'POST', body: { token, password: v.password } });
            setDone(true);
          } catch (err) { msgApi.error(err.message); }
          finally { setSubmitting(false); }
        }}>
          <Form.Item name="password" label="Nueva contraseña"
            rules={[
              { required: true, message: 'Ingresa tu nueva contraseña' },
              { min: 8, message: 'Mínimo 8 caracteres' },
              { pattern: /^(?=.*[a-zA-Z])(?=.*\d)/, message: 'Debe tener letras y números' },
            ]}>
            <Input.Password prefix={<LockOutlined />} size="large"
              iconRender={(vis) => (vis ? <EyeTwoTone /> : <EyeInvisibleOutlined />)} />
          </Form.Item>
          <Form.Item name="confirm" label="Repite la contraseña"
            dependencies={['password']}
            rules={[
              { required: true, message: 'Repite tu contraseña' },
              ({ getFieldValue }) => ({
                validator(_, value) {
                  return !value || getFieldValue('password') === value
                    ? Promise.resolve()
                    : Promise.reject(new Error('Las contraseñas no coinciden'));
                },
              }),
            ]}>
            <Input.Password prefix={<LockOutlined />} size="large"
              iconRender={(vis) => (vis ? <EyeTwoTone /> : <EyeInvisibleOutlined />)} />
          </Form.Item>
          <Button type="primary" htmlType="submit" block size="large" loading={submitting} style={{ height: 46 }}>
            Guardar contraseña
          </Button>
        </Form>
      </Card>
    </div>
  );
}
