import React, { useState, useEffect } from 'react';
import { Modal, Typography, Button, Checkbox, message, Space } from 'antd';
import { GiftOutlined, CopyOutlined } from '@ant-design/icons';
import { api } from '../auth/api';

const { Title, Text, Paragraph } = Typography;

export default function CampaignPopup() {
  const [open, setOpen] = useState(false);
  const [campaignMsg, setCampaignMsg] = useState(null);
  const [dontShowAgain, setDontShowAgain] = useState(false);

  useEffect(() => {
    const fetchInbox = async () => {
      try {
        const messages = await api('/inbox');
        if (messages && messages.length > 0) {
          // Find the latest message that looks like a campaign/promo and hasn't been dismissed
          const dismissedIds = JSON.parse(localStorage.getItem('dismissedCampaigns') || '[]');
          
          const promoMsg = messages.find(msg => 
            !dismissedIds.includes(msg._id) && msg.kind === 'code'
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
  }, []);

  const handleClose = () => {
    if (dontShowAgain && campaignMsg) {
      const dismissedIds = JSON.parse(localStorage.getItem('dismissedCampaigns') || '[]');
      dismissedIds.push(campaignMsg._id);
      localStorage.setItem('dismissedCampaigns', JSON.stringify(dismissedIds));
    }
    setOpen(false);
  };

  const copyCode = () => {
    if (campaignMsg?.code) {
      navigator.clipboard.writeText(campaignMsg.code);
      message.success('Código copiado al portapapeles');
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
      bodyStyle={{ textAlign: 'center', padding: '24px' }}
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
            Tu Código Promocional:
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
