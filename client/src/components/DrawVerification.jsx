import React from 'react';
import { Button } from 'antd';
import { SafetyCertificateFilled } from '@ant-design/icons';

export default function DrawVerification({ raffleId, block = false, legacy = false }) {
  return (
    <Button 
      href={`/cotejar-resultado/${raffleId}`} 
      icon={<SafetyCertificateFilled />} 
      block={block}
      style={{
        background: 'linear-gradient(110deg, #137d68 0%, #0a4346 100%)',
        borderColor: 'transparent',
        color: '#fff',
        fontWeight: 600,
        borderRadius: 24,
        boxShadow: '0 4px 12px rgba(10, 67, 70, 0.25)'
      }}
    >
      Detalles del sorteo
    </Button>
  );
}
