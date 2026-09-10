import React, { useState, useEffect } from 'react';
import { Modal, Typography, Button, Checkbox, message, Space } from 'antd';
import { GiftOutlined, CopyOutlined } from '@ant-design/icons';
import { api } from '../auth/api';
import { useAuth } from '../auth/AuthContext';

const { Title, Text, Paragraph } = Typography;

export default function CampaignPopup() {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [campaignMsg, setCampaignMsg] = useState(null);
  const [dontShowAgain, setDontShowAgain] = useState(false);

  const dismissedKey = user?._id
    ? `dismissedCampaigns:${user._id}`
    : 'dismissedCampaigns';

  const readDismissed = () => {
    try {
      const stored = JSON.parse(localStorage.getItem(dismissedKey) || '[]');
      const legacy = JSON.parse(localStorage.getItem('dismissedCampaigns') || '[]');
      return [
        ...(Array.isArray(legacy) ? legacy : []),
        ...(Array.isArray(stored) ? stored : []),
      ].filter((value, index, values) => values.indexOf(value) === index);
    } catch {
      return [];
    }
  };

  useEffect(() => {
    if (!user?._id) return undefined;

    const fetchInbox = async () => {
      try {
        const messages = await api('/inbox');
        if (messages && messages.length > 0) {
          // Se conserva por usuario y por código para que una misma promo
          // no reaparezca aunque el backend cree otro mensaje con otro _id.
          const dismissedIds = readDismissed();
          
          const promoMsg = messages.find(msg => 
            msg.kind === 'code' &&
            !dismissedIds.includes(msg._id) &&
            (!msg.code || !dismissedIds.includes(`code:${msg.code}`))
          );

          if (promoMsg) {
            setCampaignMsg(promoMsg);
            setOpen(true);
          }
        }
      } catch (error) {
        console.error('Error fetching inbox for campaign popup:', error);
      }
    };

    fetchInbox();
  }, [user?._id, dismissedKey]);

  const handleClose = () => {
    if (dontShowAgain && campaignMsg) {
      const dismissedIds = readDismissed();
      if (campaignMsg._id && !dismissedIds.includes(campaignMsg._id)) {
        dismissedIds.push(campaignMsg._id);
      }
      if (campaignMsg.code && !dismissedIds.includes(`code:${campaignMsg.code}`)) {
        dismissedIds.push(`code:${campaignMsg.code}`);
      }
      localStorage.setItem(dismissedKey, JSON.stringify(dismissedIds));
    }
    setOpen(false);
  };

  const copyCode = () => {
    if (campaignMsg?.code) {
      navigator.clipboard.writeText(campaignMsg.code);
      message.success('C�digo copiado al portapapeles');
    }
  };

  if (!campaignMsg) return null;

  return (
    <Modal
      open={open}
      onCancel={handleClose}
      footer={null}
      centered
      closable={true}
      styles={{ body: { textAlign: 'center', padding: '24px' } }}
    >
      <GiftOutlined style={{ fontSize: 64, color: '#1890ff', marginBottom: 16 }} />
      <Title level={3}>{campaignMsg.subject}</Title>
      
      <Paragraph style={{ fontSize: 16, marginBottom: 24, whiteSpace: 'pre-line' }}>
        {campaignMsg.body}
      </Paragraph>

      {campaignMsg.code && (
        <div style={{ 
          background: '#f0f2f5', 
          padding: '16px', 
          borderRadius: '8px', 
          marginBottom: '24px',
          border: '2px dashed #1890ff'
        }}>
          <Text type="secondary" style={{ display: 'block', marginBottom: 8 }}>
            Tu C�digo Promocional:
          </Text>
          <Space>
            <Text strong style={{ fontSize: 24, letterSpacing: 2 }}>{campaignMsg.code}</Text>
            <Button type="primary" icon={<CopyOutlined />} onClick={copyCode}>
              Copiar
            </Button>
          </Space>
        </div>
      )}

      <div style={{ marginTop: 24, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Checkbox 
          checked={dontShowAgain} 
          onChange={(e) => setDontShowAgain(e.target.checked)}
        >
          No volver a mostrar
        </Checkbox>
        <Button type="primary" onClick={handleClose}>
          Entendido
        </Button>
      </div>
    </Modal>
  );
}
