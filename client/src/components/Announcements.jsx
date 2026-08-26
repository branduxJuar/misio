import React, { useEffect, useState } from 'react';
import { Modal, Typography, Tag, Space, Button } from 'antd';
import { BellFilled, InfoCircleFilled, WarningFilled, GiftFilled } from '@ant-design/icons';
import { api, SERVER_URL } from '../auth/api';
import { useAuth } from '../auth/AuthContext';

const { Title, Paragraph } = Typography;

const SEEN_KEY = 'misio_seen_announcements';

const ICONS = {
  info: <InfoCircleFilled style={{ color: '#0284c7' }} />,
  warning: <WarningFilled style={{ color: '#f59e0b' }} />,
  promo: <GiftFilled style={{ color: '#22c55e' }} />,
};

/**
 * 📢 ANUNCIOS EMERGENTES — el admin crea un aviso y TODOS lo ven.
 *
 * El usuario marca "Entendido" y no le vuelve a aparecer (se guarda en
 * localStorage qué IDs ya cerró). Si el admin crea uno nuevo, aparece
 * para todos, incluidos los que ya cerraron los anteriores.
 */
export default function Announcements() {
  const { user } = useAuth();
  const [pending, setPending] = useState([]);
  const [current, setCurrent] = useState(null);

  useEffect(() => {
    const fetchAnn = () => {
      api('/settings/announcements')
        .then((all) => {
          const active = (all || []).filter((a) => {
            if (!a.active) return false;
            if (a.target === 'users' && !user) return false;
            if (a.target === 'guests' && user) return false;
            
            // Lógica de programación de publicación y expiración
            const now = Date.now();
            if (a.publishAt) {
              if (now < new Date(a.publishAt).getTime()) return false;
            }
            if (a.expiresAt) {
              if (now > new Date(a.expiresAt).getTime()) return false;
            }
            return true;
          });
          const seen = JSON.parse(localStorage.getItem(SEEN_KEY) || '[]');
          const sessionSeen = JSON.parse(sessionStorage.getItem('misio_seen_always_show') || '[]');
          
          const unseen = active.filter((a) => {
            if (a.alwaysShow) return !sessionSeen.includes(a.id);
            return !seen.includes(a.id);
          });
          setPending(unseen);
          if (unseen.length > 0) setCurrent(unseen[0]);
        })
        .catch(() => {});
    };
    fetchAnn();
    window.addEventListener('misio-announcements-updated', fetchAnn);
    return () => window.removeEventListener('misio-announcements-updated', fetchAnn);
  }, [user]);

  const dismiss = () => {
    if (!current) return;
    if (current.alwaysShow) {
      const sessionSeen = JSON.parse(sessionStorage.getItem('misio_seen_always_show') || '[]');
      if (!sessionSeen.includes(current.id)) sessionSeen.push(current.id);
      sessionStorage.setItem('misio_seen_always_show', JSON.stringify(sessionSeen));
    } else {
      const seen = JSON.parse(localStorage.getItem(SEEN_KEY) || '[]');
      if (!seen.includes(current.id)) seen.push(current.id);
      localStorage.setItem(SEEN_KEY, JSON.stringify(seen));

      if (user) {
        api(`/settings/announcements/${current.id}/read`, { method: 'POST' }).catch(() => {});
      }
    }
    const rest = pending.filter((a) => a.id !== current.id);
    setPending(rest);
    setCurrent(rest.length > 0 ? rest[0] : null);
  };

  if (!current) return null;

  return (
    <Modal
      open
      footer={
        <Button type="primary" block size="large" onClick={dismiss}>
          Entendido ✓
        </Button>
      }
      closable={false}
      centered
      width={Math.min(500, window.innerWidth - 32)}
    >
      <Space direction="vertical" size={12} style={{ width: '100%', textAlign: 'center', padding: '12px 0' }}>
        <div style={{ fontSize: 36 }}>{ICONS[current.type] ?? ICONS.info}</div>
        <Space>
          <Tag color={current.type === 'promo' ? 'success' : current.type === 'warning' ? 'warning' : 'processing'}>
            {current.type === 'promo' ? '🎁 Promoción' : current.type === 'warning' ? '⚠️ Aviso' : 'ℹ️ Información'}
          </Tag>
          {current.alwaysShow && <Tag color="error">Campaña Activa</Tag>}
        </Space>
        <Title level={4} style={{ margin: 0 }}>{current.title}</Title>
        <div 
          className="rich-text-content"
          style={{ fontSize: 14, textAlign: 'left', background: 'var(--z-bg-elevated)', padding: 12, borderRadius: 8, width: '100%' }}
          dangerouslySetInnerHTML={{ __html: current.body }} 
        />
        {pending.length > 1 && (
          <Paragraph style={{ fontSize: 11, color: '#999' }}>
            {pending.length - 1} aviso(s) más después de este
          </Paragraph>
        )}
      </Space>
    </Modal>
  );
}
