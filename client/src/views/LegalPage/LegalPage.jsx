import React, { useEffect, useState } from 'react';
import { Card, Result, Button, Skeleton } from 'antd';
import ReactMarkdown from 'react-markdown';
import { useNavigate } from 'react-router-dom';
import { api } from '../../auth/api';

/** Página legal genérica — renderiza markdown editable desde el CMS. */
export default function LegalPage({ which }) {
  const [content, setContent] = useState(null);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    api('/settings/legal')
      .then((pages) => setContent(pages?.[which] ?? ''))
      .catch(() => setContent(''))
      .finally(() => setLoading(false));
  }, [which]);

  if (loading) return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20, padding: 40 }}>
      <Skeleton.Input active block style={{ height: 40, width: 300, borderRadius: 8, marginBottom: 20 }} />
      <Skeleton active paragraph={{ rows: 10 }} />
    </div>
  );

  if (!content) {
    return (
      <div style={{ maxWidth: 720, margin: '40px auto', padding: 20 }}>
        <Result status="404" title="Contenido no disponible"
          extra={<Button type="primary" onClick={() => navigate('/')}>Volver al inicio</Button>} />
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 760, margin: '24px auto', padding: '0 16px' }}>
      <Card>
        <div className="z-legal-content"><ReactMarkdown>{content}</ReactMarkdown></div>
      </Card>
    </div>
  );
}
