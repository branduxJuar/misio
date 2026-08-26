import React, { useEffect, useState } from 'react';
import { Card, List, Tag, Typography, Empty, Button, message, Tabs, Space } from 'antd';
import { MailOutlined, GiftOutlined, CheckOutlined, InboxOutlined } from '@ant-design/icons';
import { api } from '../../auth/api';
import { MISIO_COLORS } from '../../theme/misioTheme';
import dayjs from 'dayjs';

const { Text, Paragraph } = Typography;

/**
 * 📬 Buzón de correo interno del usuario. Aquí recibe los códigos de sus
 * canjes virtuales (gift cards, recargas), resaltados y copiables.
 * Ahora dividido en "Nuevos" (no leídos) e "Historial" (leídos).
 */
export default function Inbox() {
  const [msgs, setMsgs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [msgApi, ctx] = message.useMessage();

  const load = () => {
    api('/inbox').then((list) => setMsgs(Array.isArray(list) ? list : []))
      .catch(() => {}).finally(() => setLoading(false));
  };
  
  useEffect(() => {
    load();
    // Ya no se marca automáticamente como leído, el usuario debe interactuar
  }, []);

  const markAsRead = async (id) => {
    try {
      await api(`/inbox/${id}/read`, { method: 'PATCH' });
      msgApi.success('Mensaje guardado en el historial');
      setMsgs((prev) => prev.map(m => m._id === id ? { ...m, read: true } : m));
    } catch (err) {
      msgApi.error('Error al actualizar el mensaje');
    }
  };

  const unreadMsgs = msgs.filter(m => !m.read);
  const readMsgs = msgs.filter(m => m.read);

  const renderMessageItem = (m, isUnread) => (
    <List.Item
      style={{
        display: 'block',
        background: isUnread ? '#ecfdf5' : '#ffffff',
        borderLeft: isUnread ? `4px solid #047857` : '4px solid transparent',
        border: isUnread ? '1px solid #d1fae5' : '1px solid #f1f5f9',
        padding: '16px 20px',
        borderRadius: 8,
        marginBottom: 10,
        boxShadow: isUnread ? '0 4px 12px rgba(4, 120, 87, 0.06)' : 'none',
        transition: 'all 0.2s ease',
      }}
    >
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div style={{ flex: '1 1 200px' }}>
          <Text strong style={{ fontSize: 16, color: '#0f172a' }}>
            {m.kind === 'code' && <GiftOutlined style={{ color: '#047857', marginRight: 8 }} />}
            {m.subject}
            {isUnread && (
              <Tag style={{ marginLeft: 10, borderRadius: 10, background: '#d1fae5', color: '#047857', border: 'none', fontWeight: 700 }}>
                Nuevo
              </Tag>
            )}
          </Text>
          <Paragraph style={{ margin: '8px 0', color: isUnread ? '#334155' : '#64748b', fontSize: 14 }}>
            {m.body}
          </Paragraph>
          
          {m.kind === 'code' && m.code && (
            <div style={{
              background: '#ecfdf5', border: `2px dashed #059669`,
              borderRadius: 10, padding: '12px 16px', textAlign: 'center', marginTop: 12, width: '100%', maxWidth: 350
            }}>
              <Text style={{ fontSize: 20, fontWeight: 800, color: '#047857', letterSpacing: 2 }} copyable={{
                text: m.code,
                onCopy: () => msgApi.success('Código copiado ✓'),
              }}>
                {m.code}
              </Text>
            </div>
          )}
        </div>
        
        <Space direction="vertical" align="end">
          <Text style={{ fontSize: 12, color: '#94a3b8' }}>
            {dayjs(m.createdAt).format('DD/MM HH:mm')}
          </Text>
          {isUnread && (
            <Button
              type="text"
              size="small"
              icon={<CheckOutlined />}
              onClick={() => markAsRead(m._id)}
              style={{ color: '#047857', fontWeight: 600, marginTop: 8 }}
            >
              Marcar como leído
            </Button>
          )}
        </Space>
      </div>
    </List.Item>
  );

  const items = [
    {
      key: '1',
      label: `Nuevos (${unreadMsgs.length})`,
      children: unreadMsgs.length === 0 ? (
        <div style={{ padding: '32px 0', textAlign: 'center' }}>
          <InboxOutlined style={{ fontSize: 48, color: '#94a3b8', marginBottom: 12 }} />
          <Text style={{ display: 'block', color: '#64748b', fontSize: 15 }}>No tienes correos nuevos en este momento</Text>
        </div>
      ) : (
        <List dataSource={unreadMsgs} renderItem={(m) => renderMessageItem(m, true)} />
      ),
    },
    {
      key: '2',
      label: `Leídos (${readMsgs.length})`,
      children: readMsgs.length === 0 ? (
        <div style={{ padding: '32px 0', textAlign: 'center' }}>
          <Text style={{ display: 'block', color: '#94a3b8', fontSize: 14 }}>No tienes mensajes antiguos en tu historial</Text>
        </div>
      ) : (
        <List dataSource={readMsgs} renderItem={(m) => renderMessageItem(m, false)} />
      ),
    },
  ];

  return (
    <Card
      title={<span style={{ color: '#0f172a', fontWeight: 600, fontSize: 16 }}><MailOutlined style={{ color: '#047857', marginRight: 8 }} />Bandeja de Entrada</span>}
      loading={loading}
      styles={{ body: { padding: '16px 24px 24px' } }}
      style={{
        borderRadius: 12,
        boxShadow: '0 4px 12px rgba(0,0,0,0.05)',
        border: '1px solid #e2e8f0',
        background: '#ffffff',
      }}
    >
      {ctx}
      <Tabs defaultActiveKey="1" items={items} />
    </Card>
  );
}
