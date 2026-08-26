import React, { useState } from 'react';
import { Modal, Form, Input, Button, Typography, message } from 'antd';
import { LockOutlined, EyeTwoTone, EyeInvisibleOutlined } from '@ant-design/icons';
import { api } from '../auth/api';
import { useAuth } from '../auth/AuthContext';

const { Text } = Typography;

/**
 * 🔒 CAMBIO FORZADO DE CONTRASEÑA.
 *
 * Cuando el admin resetea la clave de un usuario, esta queda TEMPORAL
 * (mustChangePassword=true). Al entrar, este modal se abre y NO se puede
 * cerrar: el usuario debe crear su propia contraseña antes de usar el
 * sistema. Así la clave temporal que le dio el admin nunca queda fija.
 */
export default function ForcePasswordChange() {
  const { user, refreshUser } = useAuth();
  const [submitting, setSubmitting] = useState(false);
  const [msgApi, contextHolder] = message.useMessage();

  const open = !!user?.mustChangePassword;

  return (
    <Modal
      open={open}
      closable={false}
      maskClosable={false}
      keyboard={false}
      footer={null}
      title="🔒 Crea tu contraseña"
      centered
    >
      {contextHolder}
      <Text style={{ display: 'block', marginBottom: 16, color: '#999' }}>
        Estás usando una contraseña temporal. Por seguridad, crea tu propia
        contraseña para continuar.
      </Text>
      <Form layout="vertical" onFinish={async (v) => {
        setSubmitting(true);
        try {
          await api('/auth/change-password', {
            method: 'POST',
            body: { newPassword: v.newPassword, force: true },
          });
          msgApi.success('Contraseña actualizada ✓');
          await refreshUser();
        } catch (err) { msgApi.error(err.message); }
        finally { setSubmitting(false); }
      }}>
        <Form.Item name="newPassword" label="Nueva contraseña"
          rules={[
            { required: true, message: 'Ingresa tu nueva contraseña' },
            { min: 8, message: 'Mínimo 8 caracteres' },
            { pattern: /^(?=.*[a-zA-Z])(?=.*\d)/, message: 'Debe tener letras y números' },
          ]}>
          <Input.Password prefix={<LockOutlined />} size="large"
            iconRender={(vis) => (vis ? <EyeTwoTone /> : <EyeInvisibleOutlined />)} />
        </Form.Item>
        <Form.Item name="confirm" label="Repite la contraseña"
          dependencies={['newPassword']}
          rules={[
            { required: true, message: 'Repite tu contraseña' },
            ({ getFieldValue }) => ({
              validator(_, value) {
                return !value || getFieldValue('newPassword') === value
                  ? Promise.resolve()
                  : Promise.reject(new Error('Las contraseñas no coinciden'));
              },
            }),
          ]}>
          <Input.Password prefix={<LockOutlined />} size="large"
            iconRender={(vis) => (vis ? <EyeTwoTone /> : <EyeInvisibleOutlined />)} />
        </Form.Item>
        <Button type="primary" htmlType="submit" block size="large" loading={submitting}>
          Guardar y continuar
        </Button>
      </Form>
    </Modal>
  );
}
