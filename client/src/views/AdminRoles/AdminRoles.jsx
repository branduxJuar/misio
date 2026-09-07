import React, { useEffect, useState } from 'react';
import { Typography, Card, Table, Button, Space, Tag, Popconfirm, Modal, Form, Input, Checkbox } from 'antd';
import { api } from '../../auth/api';
import { MISIO_COLORS } from '../../theme/misioTheme';
import { ADMIN_MENU } from '../AdminShell/AdminShell';

const { Title, Text } = Typography;

export default function AdminRoles() {
  const [customRoles, setCustomRoles] = useState([]);
  const [editingRole, setEditingRole] = useState(null);
  const [saving, setSaving] = useState(false);
  const [roleForm] = Form.useForm();
  
  useEffect(() => {
    api('/settings/custom-roles').then((r) => setCustomRoles(r || [])).catch(() => {});
  }, []);

  useEffect(() => {
    if (editingRole) {
      roleForm.setFieldsValue({
        name: editingRole.name || '',
        permissions: editingRole.permissions || []
      });
    } else {
      roleForm.resetFields();
    }
  }, [editingRole, roleForm]);

  const saveRole = async (values) => {
    try {
      setSaving(true);
      const newRole = {
        id: editingRole?.id || `custom_${Date.now()}`,
        name: values.name.trim().toUpperCase(),
        permissions: values.permissions || []
      };
      const isEdit = customRoles.some(r => r.id === newRole.id);
      const nextRoles = isEdit 
        ? customRoles.map(r => r.id === newRole.id ? newRole : r)
        : [...customRoles, newRole];
        
      await api('/settings/custom-roles', { method: 'PUT', body: { roles: nextRoles } });
      setCustomRoles(nextRoles);
      setEditingRole(null);
    } catch (err) { console.error(err); } finally { setSaving(false); }
  };
  
  const removeRole = async (id) => {
    try {
      const nextRoles = customRoles.filter(r => r.id !== id);
      await api('/settings/custom-roles', { method: 'PUT', body: { roles: nextRoles } });
      setCustomRoles(nextRoles);
    } catch (err) { console.error(err); }
  };

  return (
    <div>
      <Space wrap style={{ marginBottom: 16, width: '100%', justifyContent: 'space-between' }}>
        <Title level={3} style={{ margin: 0 }}>🔑 Roles y Permisos</Title>
      </Space>

      <div style={{ width: '100%' }}>
        <Card
          title="🔑 Roles Personalizados"
          style={{ marginTop: 20 }}
          extra={<Button type="primary" onClick={() => setEditingRole({ isNew: true, name: '', permissions: [] })}>+ Crear Rol</Button>}
        >
          <Text style={{ fontSize: 14, color: MISIO_COLORS.textMuted, display: 'block', marginBottom: 16 }}>
            Crea roles a medida (ej. "Contador", "Soporte") y asígnales los módulos a los que tendrán acceso.
          </Text>
          
          <Table 
            dataSource={customRoles}
            rowKey="id"
            pagination={false}
            scroll={{ x: 'max-content' }}
            columns={[
              { title: 'Nombre del Rol', dataIndex: 'name', width: 200, render: (n) => <Text strong>{n}</Text> },
              {
                title: 'Módulos Permitidos', dataIndex: 'permissions',
                render: (perms) => (
                  <Space wrap size={[4, 4]}>
                    {perms.map(p => {
                      const module = ADMIN_MENU.flatMap(g => g.items).find(i => i.perm === p);
                      return <Tag key={p} color="blue">{module?.label || p}</Tag>;
                    })}
                  </Space>
                )
              },
              {
                title: 'Acciones', width: 110,
                render: (_, record) => (
                  <Space>
                    <Button size="small" onClick={() => setEditingRole(record)}>Editar</Button>
                    <Popconfirm title="¿Eliminar rol?" onConfirm={() => removeRole(record.id)}>
                      <Button size="small" danger type="text">✕</Button>
                    </Popconfirm>
                  </Space>
                )
              }
            ]}
          />
        </Card>
      </div>

      <Modal
        title={editingRole?.isNew ? '✨ Crear Rol Personalizado' : '✏️ Editar Rol'}
        open={!!editingRole}
        onCancel={() => setEditingRole(null)}
        footer={null}
        destroyOnHidden
      >
        <Form 
          form={roleForm} 
          layout="vertical" 
          onFinish={saveRole}
          initialValues={{ name: editingRole?.name, permissions: editingRole?.permissions || [] }}
        >
          <Form.Item 
            name="name" 
            label="Nombre del Rol" 
            rules={[
              { required: true, message: 'El nombre es requerido' },
              {
                validator: async (_, value) => {
                  if (!value) return;
                  const upper = value.toUpperCase().trim();
                  if (['ADMINISTRADOR', 'ADMIN', 'MASTER'].includes(upper)) {
                    return Promise.reject(new Error('Este nombre está reservado por el sistema'));
                  }
                }
              }
            ]}
            getValueFromEvent={(e) => e.target.value.toUpperCase()}
          >
            <Input placeholder="EJ. CONTADOR" />
          </Form.Item>
          <div style={{ marginBottom: 12 }}>
            <Space>
              <Button 
                size="small" 
                onClick={() => {
                  const allPerms = Object.keys(ADMIN_MENU.flatMap(g => g.items).reduce((acc, m) => {
                    acc[m.perm] = true; return acc;
                  }, {}));
                  roleForm.setFieldsValue({ permissions: allPerms });
                }}
              >
                Seleccionar todo
              </Button>
              <Button 
                size="small" 
                type="text" 
                onClick={() => roleForm.setFieldsValue({ permissions: [] })}
              >
                Limpiar
              </Button>
            </Space>
          </div>
          <Form.Item name="permissions" label="Módulos Permitidos">
            <Checkbox.Group style={{ width: '100%' }}>
              <Space direction="vertical" size={4} style={{ width: '100%' }}>
                {Object.values(
                  ADMIN_MENU.flatMap(g => g.items).reduce((acc, m) => {
                    if (!acc[m.perm]) acc[m.perm] = { ...m };
                    else acc[m.perm].label += ` / ${m.label}`;
                    return acc;
                  }, {})
                ).map((m) => (
                  <Checkbox key={m.perm} value={m.perm}>
                    {m.label} <Text style={{ fontSize: 12, color: MISIO_COLORS.textMuted }}>({ADMIN_MENU.find(g => g.items.some(i => i.perm === m.perm))?.group})</Text>
                  </Checkbox>
                ))}
              </Space>
            </Checkbox.Group>
          </Form.Item>
          <Button type="primary" htmlType="submit" loading={saving} block size="large">
            Guardar Rol
          </Button>
        </Form>
      </Modal>
    </div>
  );
}
