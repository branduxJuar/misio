import React, { useEffect, useState, useRef, useMemo, useCallback } from 'react';
import ReactQuill from 'react-quill';
import 'react-quill/dist/quill.snow.css';
import {
  Card, Col, Row, Typography, Form, Input, Button, message, Upload, Space,
  Alert, Tag, ColorPicker, Divider, Image, Switch, Popconfirm, Select, Tabs,
  Table, Modal
} from 'antd';
import { SaveOutlined, UploadOutlined, EyeOutlined } from '@ant-design/icons';
import { MISIO_COLORS } from '../../theme/misioTheme';
import { useApiOrMock } from '../../hooks/useApiOrMock';
import { api, apiUpload, SERVER_URL } from '../../auth/api';
import { useSite } from '../../theme/SiteProvider';

const { Title, Text } = Typography;

/**
 * 🎨 CONTENIDO Y MARCA — el CMS del sitio.
 * Cambias nombre de la empresa, logo, color principal y los TEXTOS de la
 * landing y del "Quiénes somos" sin tocar código. Se guarda en settings
 * (clave "site") y el SiteProvider lo aplica en vivo a toda la app.
 */
export default function AdminContent() {
  const [msgApi, contextHolder] = message.useMessage();
  const site = useSite();
  const { data, demo, refresh } = useApiOrMock('/site', {});
  const demoRef = useRef(demo);
  useEffect(() => { demoRef.current = demo; }, [demo]);
  const [saving, setSaving] = useState(false);
  const [collageImages, setCollageImages] = useState([]);
  const [maint, setMaint] = useState({ enabled: false, message: '', resumeAt: null });
  const [announcements, setAnnouncements] = useState([]);
  const [editingAnn, setEditingAnn] = useState(null);
  const [isAnnModalOpen, setIsAnnModalOpen] = useState(false);
  const [refundPct, setRefundPct] = useState(50);
  const [legal, setLegal] = useState({ terms: '', privacy: '', howItWorks: '', autocontrol: '', raffleRules: '' });
  useEffect(() => {
    api('/settings/legal').then((l) => setLegal({
      terms: l?.terms ?? '', privacy: l?.privacy ?? '', howItWorks: l?.howItWorks ?? '', autocontrol: l?.autocontrol ?? '', raffleRules: l?.raffleRules ?? '',
    })).catch(() => {});
  }, []);
  useEffect(() => {
    api('/settings/refund-percentage').then(res => setRefundPct(res?.percentage ?? 50)).catch(() => {});
  }, []);
  const saveLegal = async () => {
    try {
      await api('/settings/legal', { method: 'PUT', body: legal });
      msgApi.success('Páginas legales guardadas ✓');
    } catch (err) { msgApi.error(err.message); }
  };
  const saveRefundPct = async (val) => {
    try {
      await api('/settings/refund-percentage', { method: 'PUT', body: { percentage: val } });
      msgApi.success('Porcentaje de Cashback guardado');
    } catch (err) { msgApi.error(err.message); }
  };
  const [annStats, setAnnStats] = useState({});

  useEffect(() => {
    const fetchData = () => {
      api('/settings/announcements').then((a) => setAnnouncements(a || [])).catch(() => {});
      api('/settings/announcements/stats').then((s) => setAnnStats(s || {})).catch(() => {});
    };
    fetchData();
    window.addEventListener('misio-announcements-updated', fetchData);
    return () => window.removeEventListener('misio-announcements-updated', fetchData);
  }, []);
  
  const reactQuillRef = useRef(null);
  const imageHandler = useCallback(() => {
    const input = document.createElement('input');
    input.setAttribute('type', 'file');
    input.setAttribute('accept', 'image/*');
    input.click();
    input.onchange = async () => {
      const file = input.files[0];
      if (file) {
        if (typeof demoRef.current !== 'undefined' && demoRef.current) return msgApi.error('Modo demo');
        try {
          // apiUpload asume que está exportado o disponible, lo importamos si no está
          const res = await apiUpload('/settings/upload-image', file);
          const quill = reactQuillRef.current.getEditor();
          const range = quill.getSelection(true);
          quill.insertEmbed(range.index, 'image', SERVER_URL + res.url);
        } catch (e) {
          msgApi.error('Error subiendo imagen: ' + e.message);
        }
      }
    };
  }, [msgApi]);

  const quillModules = useMemo(() => ({
    toolbar: {
      container: [
        [{ 'header': [1, 2, 3, false] }],
        ['bold', 'italic', 'underline', 'strike'],
        [{ 'color': [] }, { 'background': [] }],
        [{ 'list': 'ordered'}, { 'list': 'bullet' }, { 'align': [] }],
        ['link', 'image'],
        ['clean']
      ],
      handlers: { image: imageHandler }
    }
  }), [imageHandler]);

  const addAnnouncement = () => {
    setEditingAnn({
      id: `ann_${Date.now()}`,
      title: '',
      body: '',
      type: 'info',
      target: 'all',
      active: true,
      alwaysShow: false,
      createdAt: new Date().toISOString().slice(0, 16),
      publishAt: '',
      expiresAt: '',
      isNew: true
    });
    setIsAnnModalOpen(true);
  };
  const saveAnnouncementModal = () => {
    if (!editingAnn.title) return msgApi.warning('Ponle un título al aviso');
    let newAnnouncements;
    if (editingAnn.isNew) {
      const { isNew, ...rest } = editingAnn;
      newAnnouncements = [rest, ...announcements];
    } else {
      newAnnouncements = announcements.map(a => a.id === editingAnn.id ? editingAnn : a);
    }
    setAnnouncements(newAnnouncements);
    setIsAnnModalOpen(false);
    setEditingAnn(null);
    
    // Auto-guardar
    api('/settings/announcements', { method: 'PUT', body: { announcements: newAnnouncements } })
      .then(() => {
        msgApi.success('Aviso guardado y publicado');
        window.dispatchEvent(new Event('misio-announcements-updated'));
      })
      .catch((err) => msgApi.error(err.message));
  };
  const saveAnnouncements = async () => {
    try {
      await api('/settings/announcements', { method: 'PUT', body: { announcements } });
      msgApi.success('Anuncios guardados');
      window.dispatchEvent(new Event('misio-announcements-updated'));
    } catch (err) { msgApi.error(err.message); }
  };
  const removeAnnouncement = (id) => {
    const newAnn = announcements.filter((a) => a.id !== id);
    setAnnouncements(newAnn);
    api('/settings/announcements', { method: 'PUT', body: { announcements: newAnn } }).then(() => {
      window.dispatchEvent(new Event('misio-announcements-updated'));
    }).catch(()=>{});
  };
  useEffect(() => {
    api('/settings/maintenance').then(setMaint).catch(() => {});
  }, []);
  const toggleMaint = async (enabled) => {
    try {
      const res = await api('/settings/maintenance', {
        method: 'PUT', body: { enabled, message: maint.message },
      });
      setMaint(res);
      msgApi.success(enabled
        ? '🔧 Modo mantenimiento ACTIVADO — los usuarios ven un banner'
        : '✅ Modo mantenimiento DESACTIVADO — la plataforma está abierta');
    } catch (err) { msgApi.error(err.message); }
  };
  const [form] = Form.useForm();

  useEffect(() => {
    form.setFieldsValue({
      brandName: data.brandName,
      tagline: data.tagline,
      primaryColor: data.primaryColor,
      whatsapp: data.whatsapp,
      ...Object.fromEntries(Object.entries(data.landing ?? {}).map(([k, v]) => [`landing_${k}`, v])),
      ...Object.fromEntries(Object.entries(data.about ?? {}).map(([k, v]) => [`about_${k}`, v])),
      landing_chips: (data.landing?.chips ?? []).join('\n'),
    });
    setCollageImages((data.landing?.collageImages || []).map((url, i) => ({
      uid: `coll_${i}`,
      name: `image_${i}.jpg`,
      status: 'done',
      url: `${SERVER_URL}${url}`,
      response: { url }
    })));
  }, [data]); // eslint-disable-line react-hooks/exhaustive-deps

  const save = async (v) => {
    if (demo) return msgApi.info('Modo demo: conecta el backend.');
    setSaving(true);
    try {
      const color = typeof v.primaryColor === 'string'
        ? v.primaryColor
        : v.primaryColor?.toHexString?.() ?? data.primaryColor;
      await api('/settings/site', {
        method: 'PUT',
        body: {
          brandName: v.brandName,
          tagline: v.tagline,
          primaryColor: color,
          whatsapp: v.whatsapp,
          landing: {
            heroTitle: v.landing_heroTitle,
            heroHighlight: v.landing_heroHighlight,
            heroSubtitle: v.landing_heroSubtitle,
            ctaText: v.landing_ctaText,
            collageImages: collageImages.map((file) => file.response?.url || file.url.replace(SERVER_URL, '')).filter(Boolean),
            chips: (v.landing_chips ?? '').split('\n').map((c) => c.trim()).filter(Boolean).slice(0, 6),
            businessTitle: v.landing_businessTitle,
            businessText: v.landing_businessText,
            closingTitle: v.landing_closingTitle,
          },
          about: {
            title: v.about_title,
            intro: v.about_intro,
            location: v.about_location,
          },
        },
      });
      msgApi.success('Guardado ✓ — los cambios ya están en vivo para todos.');
      refresh();
      site.refresh();
    } catch (err) { msgApi.error(err.message); } finally { setSaving(false); }
  };

  const logoUploader = {
    showUploadList: false,
    accept: '.png,.jpg,.jpeg,.webp,.svg',
    customRequest: async ({ file, onSuccess, onError }) => {
      if (demo) return onError(new Error('demo'));
      try {
        await apiUpload('/settings/site/logo', file);
        msgApi.success('Logo actualizado 🖼️');
        onSuccess('ok');
        refresh();
        site.refresh();
      } catch (err) { msgApi.error(err.message); onError(err); }
    },
  };

  return (
    <div>
      {contextHolder}
      <Space wrap style={{ marginBottom: 16, width: '100%', justifyContent: 'space-between' }}>
        <Title level={3} style={{ margin: 0 }}>🎨 Contenido y marca</Title>
        <Button icon={<EyeOutlined />} onClick={() => window.open('/bienvenido', '_blank')}>
          Ver la landing
        </Button>
      </Space>

      {demo && <Alert type="info" showIcon style={{ marginBottom: 16 }} message="Modo demo." />}

      <Form form={form} layout="vertical" onFinish={save} requiredMark={false}>
        <Tabs
          tabPosition="left"
          items={[
            {
              key: 'identity',
              label: '🎨 Identidad visual',
              children: (
                <div style={{ maxWidth: 600 }}>
                  <Card title="🏷️ Identidad" style={{ marginBottom: 20 }}>
                    <Form.Item name="brandName" label="Nombre de la empresa"
                      rules={[{ required: true, min: 2, message: 'Pon el nombre' }]}>
                      <Input placeholder="Misio" />
                    </Form.Item>
                    <Form.Item name="tagline" label="Frase de marca (aparece en la pestaña del navegador)">
                      <Input placeholder="Sorteos donde nunca pierdes" />
                    </Form.Item>

                    <Divider style={{ margin: '8px 0 14px' }} />
                    <Text strong style={{ display: 'block', marginBottom: 8 }}>Logo</Text>
                    <Space align="center" style={{ marginBottom: 12 }}>
                      <div style={{
                        width: 62, height: 62, borderRadius: 12, display: 'grid', placeItems: 'center',
                        background: 'var(--z-bg-elevated)', border: '1px solid var(--z-border)',
                      }}>
                        {data.logoUrl
                          ? <Image src={`${SERVER_URL}${data.logoUrl}`} width={54} height={54}
                              style={{ objectFit: 'contain' }} />
                          : <span style={{ fontSize: 26 }}>⚡</span>}
                      </div>
                <Upload {...logoUploader}>
                  <Button icon={<UploadOutlined />} size="small">Subir logo</Button>
                </Upload>
              </Space>
              <Text style={{ fontSize: 11, color: MISIO_COLORS.textMuted, display: 'block' }}>
                PNG o SVG con fondo transparente, cuadrado. Se ve en la cabecera
                y en el panel.
              </Text>

              <Divider style={{ margin: '14px 0' }} />
              <Form.Item name="primaryColor" label="Color principal">
                <ColorPicker showText format="hex" />
              </Form.Item>
              <Text style={{ fontSize: 11, color: MISIO_COLORS.textMuted }}>
                Tiñe botones, enlaces y acentos en toda la app (claro y oscuro).
                El verde del dinero y el dorado de los premios no se tocan: son
                códigos que tus usuarios ya aprendieron.
              </Text>

              <Divider style={{ margin: '14px 0' }} />
              <Form.Item name="whatsapp" label="WhatsApp de contacto (opcional)">
                <Input placeholder="51987654321" />
              </Form.Item>
            </Card>
            </div>
            )
          },
          {
            key: 'landing',
            label: '🚀 Página Principal',
            children: (
              <div style={{ maxWidth: 800 }}>
                <Card title="🚀 Landing (la página que ven los visitantes)">
                  <Row gutter={12}>
                    <Col xs={24} sm={12}>
                      <Form.Item name="landing_heroTitle" label="Titular — primera línea">
                        <Input placeholder="Juega por el premio." />
                  </Form.Item>
                </Col>
                <Col xs={24} sm={12}>
                  <Form.Item name="landing_heroHighlight" label="Titular — línea resaltada (en verde)">
                    <Input placeholder="Nunca pierdas tu plata." />
                  </Form.Item>
                </Col>
              </Row>
              <Form.Item name="landing_heroSubtitle" label="Subtítulo (la promesa en una frase)">
                <Input.TextArea rows={2} />
              </Form.Item>

              <Divider style={{ margin: '20px 0' }} />
              <Title level={5}>🖼️ Collage Hero de Sorteos</Title>
              <Text style={{ display: 'block', marginBottom: 12, color: MISIO_COLORS.textMuted }}>
                Sube fotos para el fondo de la portada de sorteos (se mostrarán como polaroids desordenadas).
              </Text>
              <Upload
                listType="picture-card"
                fileList={collageImages}
                onChange={({ fileList }) => setCollageImages(fileList)}
                customRequest={async ({ file, onSuccess, onError }) => {
                  try {
                    const res = await apiUpload('/settings/upload-image', file);
                    onSuccess(res);
                  } catch (e) {
                    msgApi.error(e.message);
                    onError(e);
                  }
                }}
              >
                <div>
                  <UploadOutlined />
                  <div style={{ marginTop: 8 }}>Subir</div>
                </div>
              </Upload>
              <Divider style={{ margin: '20px 0' }} />

              <Row gutter={12}>
                <Col xs={24} sm={8}>
                  <Form.Item name="landing_ctaText" label="Texto del botón principal">
                    <Input placeholder="Crear mi cuenta gratis" />
                  </Form.Item>
                </Col>
                <Col xs={24} sm={16}>
                  <Form.Item name="landing_chips" label="Sellos de confianza (uno por línea, máx. 6)">
                    <Input.TextArea rows={3} placeholder={'✅ Reembolso garantizado\n🔴 Sorteos en vivo'} />
                  </Form.Item>
                </Col>
              </Row>

              <Divider>Sección de transparencia</Divider>
              <Form.Item name="landing_businessTitle" label="Título">
                <Input placeholder="¿Y ustedes de qué viven?" />
              </Form.Item>
              <Form.Item name="landing_businessText"
                label="Explicación del negocio (aquí se gana o se pierde la confianza)">
                <Input.TextArea rows={4} showCount maxLength={1200} />
              </Form.Item>
              <Form.Item name="landing_closingTitle" label="Título del cierre">
                <Input placeholder="Lo peor que te puede pasar es quedarte con tu plata" />
              </Form.Item>
            </Card>
            </div>
            )
          },
          {
            key: 'about',
            label: '🏢 Nosotros & Beneficios',
            children: (
              <div style={{ maxWidth: 800 }}>
                <Card title="🎁 Devolución (Cashback Garantizado)" style={{ marginBottom: 20, border: `2px solid ${MISIO_COLORS.primary}` }}>
                  <Text style={{ display: 'block', marginBottom: 12, color: MISIO_COLORS.textMuted }}>
                    Porcentaje del precio del boleto que vuelve como saldo de canje a los usuarios que no ganan un sorteo.
                  </Text>
                  <Space>
                    <Select
                      value={refundPct}
                      onChange={(val) => { setRefundPct(val); saveRefundPct(val); }}
                      style={{ width: 160 }}
                      options={[
                        { value: 100, label: '100% (Devuelve Todo)' },
                        { value: 75, label: '75%' },
                        { value: 50, label: '50% (Mitad)' },
                        { value: 30, label: '30%' },
                        { value: 25, label: '25%' },
                        { value: 0, label: '0% (Nada)' },
                      ]}
                    />
                    <Text strong>de devolución a billetera de canje</Text>
                  </Space>
                </Card>

                <Card title="🏢 Quiénes somos" style={{ marginTop: 20 }}>
              <Row gutter={12}>
                <Col xs={24} sm={16}>
                  <Form.Item name="about_title" label="Título">
                    <Input placeholder="Quiénes somos" />
                  </Form.Item>
                </Col>
                <Col xs={24} sm={8}>
                  <Form.Item name="about_location" label="Ubicación física">
                    <Input placeholder="Lima, Perú" />
                  </Form.Item>
                </Col>
              </Row>
              <Form.Item name="about_intro" label="Historia / presentación">
                <Input.TextArea rows={5} showCount maxLength={1500} />
              </Form.Item>
            </Card>
            </div>
            )
          },
          {
            key: 'legal',
            label: '⚖️ Legal',
            children: (
              <div style={{ maxWidth: 800 }}>

        {/* ── Páginas legales ────────────────────────────────────── */}
        <Card
          title="📄 Páginas legales y de contenido"
          size="small"
          style={{ marginTop: 20 }}
          extra={<Button size="small" type="primary" onClick={saveLegal}>Guardar</Button>}
        >
          <Alert type="warning" showIcon style={{ marginBottom: 14 }}
            message="Revisa estos textos con un abogado antes de operar con dinero real."
            description="Los textos por defecto son un punto de partida para Perú (Indecopi, Ley N° 29733), no asesoría legal. Completa los datos entre corchetes [ ]." />
          <Tabs
            items={[
              { key: 'howItWorks', label: '¿Cómo funciona?',
                children: <Input.TextArea rows={12} value={legal.howItWorks}
                  onChange={(e) => setLegal((l) => ({ ...l, howItWorks: e.target.value }))} /> },
              { key: 'terms', label: 'Términos y Condiciones',
                children: <Input.TextArea rows={12} value={legal.terms}
                  onChange={(e) => setLegal((l) => ({ ...l, terms: e.target.value }))} /> },
              { key: 'privacy', label: 'Política de Privacidad',
                children: <Input.TextArea rows={12} value={legal.privacy}
                  onChange={(e) => setLegal((l) => ({ ...l, privacy: e.target.value }))} /> },
              { key: 'autocontrol', label: 'Términos de Autocontrol',
                children: <Input.TextArea rows={12} value={legal.autocontrol}
                  onChange={(e) => setLegal((l) => ({ ...l, autocontrol: e.target.value }))} /> },
              { key: 'raffleRules', label: 'Bases del Sorteo',
                children: <Input.TextArea rows={12} value={legal.raffleRules}
                  onChange={(e) => setLegal((l) => ({ ...l, raffleRules: e.target.value }))} /> },
            ]}
          />
          <Text style={{ fontSize: 11, color: MISIO_COLORS.textMuted, display: 'block', marginTop: 8 }}>
            Usa Markdown: # título, ## subtítulo, **negrita**, - listas. Se ven en /como-funciona, /terminos, /privacidad y en Mi Perfil (Autocontrol).
          </Text>
        </Card>
            </div>
            )
          },
          {
            key: 'communications',
            label: '📢 Avisos',
            children: (
              <div style={{ maxWidth: 900 }}>
                <Card
                  title="📢 Historial de Anuncios"
                  size="small"
                  style={{ marginTop: 20 }}
                  extra={
                    <Space>
                      <Button size="small" onClick={addAnnouncement}>+ Nuevo aviso</Button>
                      <Button size="small" type="primary" onClick={saveAnnouncements}>Guardar cambios</Button>
                    </Space>
                  }
                >
                  <Text style={{ fontSize: 12, color: MISIO_COLORS.textMuted, display: 'block', marginBottom: 12 }}>
                    Mantén aquí tu historial de avisos. Desactívalos o cambia su fecha cuando ya no sean vigentes. 
                    Después de darle "Entendido", no les vuelve a aparecer ese mismo aviso.
                  </Text>
                  
                  <Table 
                    dataSource={announcements}
                    rowKey="id"
                    size="small"
                    pagination={{ pageSize: 5 }}
                    columns={[
                      {
                        title: 'Estado', dataIndex: 'active', width: 80,
                        render: (active, record) => (
                          <Switch size="small" checked={active} onChange={(v) => {
                            const newAnn = announcements.map(x => x.id === record.id ? { ...x, active: v } : x);
                            setAnnouncements(newAnn);
                            api('/settings/announcements', { method: 'PUT', body: { announcements: newAnn } }).then(() => {
                              window.dispatchEvent(new Event('misio-announcements-updated'));
                            }).catch(()=>{});
                          }} />
                        )
                      },
                      { title: 'Fecha', dataIndex: 'createdAt', width: 90, render: (d) => new Date(d).toLocaleDateString() },
                      { title: 'Tipo', dataIndex: 'type', width: 80, render: (t) => t === 'promo' ? '🎁' : t === 'warning' ? '⚠️' : 'ℹ️' },
                      { title: 'Publicación', dataIndex: 'publishAt', width: 120, render: (d) => d ? new Date(d).toLocaleString() : 'Inmediata' },
                      { title: 'Expira', dataIndex: 'expiresAt', width: 120, render: (d) => d ? new Date(d).toLocaleString() : 'Nunca' },
                      { title: 'Audiencia', dataIndex: 'target', width: 110, render: (t) => t === 'users' ? '👤 Registrados' : t === 'guests' ? '👻 Invitados' : '👥 Todos' },
                      {
                        title: 'Vistos',
                        width: 120,
                        render: (_, record) => {
                          if (record.target === 'guests') return <Text type="secondary" style={{ fontSize: 11 }}>N/A (Invitados)</Text>;
                          const stat = annStats[record.id];
                          if (!stat) return <Text type="secondary" style={{ fontSize: 11 }}>Cargando...</Text>;
                          const p = stat.total > 0 ? Math.round((stat.read / stat.total) * 100) : 0;
                          return (
                            <Space direction="vertical" size={0} style={{ width: '100%' }}>
                              <Text style={{ fontSize: 12 }}>{stat.read} / {stat.total}</Text>
                              <div style={{ width: '100%', height: 4, background: '#e5e7eb', borderRadius: 2 }}>
                                <div style={{ width: `${p}%`, height: '100%', background: 'var(--z-primary)', borderRadius: 2 }} />
                              </div>
                            </Space>
                          );
                        }
                      },
                      { title: 'Título', dataIndex: 'title' },
                      {
                        title: 'Acciones', width: 110,
                        render: (_, record) => (
                          <Space>
                            <Button size="small" onClick={() => { setEditingAnn({...record, createdAt: record.createdAt?.slice(0, 16), publishAt: record.publishAt?.slice(0, 16) || '', expiresAt: record.expiresAt?.slice(0, 16) || ''}); setIsAnnModalOpen(true); }}>Editar</Button>
                            <Button size="small" danger type="text" onClick={() => removeAnnouncement(record.id)}>✕</Button>
                          </Space>
                        )
                      }
                    ]}
                  />
                </Card>
              </div>
            )
          },
          {
            key: 'system',
            label: '🔧 Sistema',
            children: (
              <div style={{ maxWidth: 800 }}>
                <Card title="🔧 Modo mantenimiento" size="small" style={{ marginTop: 20 }}>
                  <Space direction="vertical" size={12} style={{ width: '100%' }}>
                    <Space>
                      <Popconfirm
                        title={maint.enabled ? '¿Desactivar el mantenimiento?' : '¿Activar el modo mantenimiento?'}
                        description={maint.enabled
                          ? 'La plataforma volverá a funcionar normalmente.'
                          : 'Los usuarios verán un banner y la API devolverá 503.'}
                        onConfirm={() => toggleMaint(!maint.enabled)}
                        okText={maint.enabled ? 'Desactivar' : 'Activar'}
                      >
                        <Switch checked={maint.enabled} checkedChildren="ON" unCheckedChildren="OFF" />
                      </Popconfirm>
                      <Text>{maint.enabled
                        ? <Tag color="warning">🔧 Los usuarios ven un banner de mantenimiento</Tag>
                        : <Tag color="success">✅ Plataforma abierta</Tag>}</Text>
                    </Space>
                    <Input
                      value={maint.message}
                      onChange={(e) => setMaint((m) => ({ ...m, message: e.target.value }))}
                      placeholder="Mensaje que ven los usuarios..."
                      onBlur={() => maint.enabled && toggleMaint(true)}
                    />
                    <Input
                      type="datetime-local"
                      value={maint.resumeAt ?? ''}
                      onChange={(e) => setMaint((m) => ({ ...m, resumeAt: e.target.value }))}
                      placeholder="Hora de vuelta (opcional)"
                      style={{ maxWidth: 260 }}
                      addonBefore="Volvemos a las:"
                    />
                  </Space>
                </Card>
              </div>
            )
          }
        ]} />

        <Card style={{ marginTop: 20, position: 'sticky', bottom: 12, zIndex: 5 }}
          styles={{ body: { padding: 12 } }}>
          <Space wrap style={{ width: '100%', justifyContent: 'space-between' }}>
            <Text style={{ fontSize: 12, color: MISIO_COLORS.textMuted }}>
              Los cambios se publican al instante para todos los visitantes.
            </Text>
            <Button type="primary" htmlType="submit" icon={<SaveOutlined />} loading={saving}>
              Guardar y publicar
            </Button>
          </Space>
        </Card>
      </Form>
      <Modal 
        title={<Title level={4} style={{ margin: 0 }}>{editingAnn?.isNew ? "✨ Crear nuevo aviso" : "✏️ Editar aviso"}</Title>}
        open={isAnnModalOpen} 
        onOk={saveAnnouncementModal} 
        onCancel={() => { setIsAnnModalOpen(false); setEditingAnn(null); }}
        okText="Guardar aviso"
        cancelText="Cancelar"
        width={750}
        centered
        styles={{ body: { paddingTop: 20 } }}
      >
        <style>{`.ql-editor { min-height: 160px; font-size: 15px; }`}</style>
        {editingAnn && (
          <Space direction="vertical" size={24} style={{ width: '100%' }}>
            
            <div>
              <Text strong style={{ display: 'block', marginBottom: 6 }}>Título del aviso</Text>
              <Input 
                size="large" 
                placeholder="Ej. ¡Lanzamos nueva función!" 
                value={editingAnn.title} 
                onChange={(e) => setEditingAnn({ ...editingAnn, title: e.target.value })} 
              />
            </div>

            <div>
              <Text strong style={{ display: 'block', marginBottom: 6 }}>Contenido del anuncio</Text>
              <div style={{ background: 'var(--z-bg-elevated)', borderRadius: 8, overflow: 'hidden', border: '1px solid var(--z-border)' }}>
                <ReactQuill 
                  ref={reactQuillRef}
                  theme="snow" 
                  value={editingAnn.body} 
                  onChange={(val) => setEditingAnn({ ...editingAnn, body: val })} 
                  modules={quillModules}
                />
              </div>
            </div>

            <Row gutter={[16, 16]}>
              <Col xs={24} sm={12} md={6}>
                <Text strong style={{ display: 'block', marginBottom: 6 }}>Tipo de aviso</Text>
                <Select 
                  size="large" 
                  style={{ width: '100%' }} 
                  value={editingAnn.type} 
                  onChange={(v) => setEditingAnn({ ...editingAnn, type: v })}
                  options={[ { value: 'info', label: 'ℹ️ Información' }, { value: 'warning', label: '⚠️ Aviso' }, { value: 'promo', label: '🎁 Promoción' } ]}
                />
              </Col>
              <Col xs={24} sm={12} md={6}>
                <Text strong style={{ display: 'block', marginBottom: 6 }}>Audiencia</Text>
                <Select 
                  size="large" 
                  style={{ width: '100%' }} 
                  value={editingAnn.target || 'all'} 
                  onChange={(v) => setEditingAnn({ ...editingAnn, target: v })}
                  options={[ { value: 'all', label: '👥 Todos' }, { value: 'users', label: '👤 Registrados' }, { value: 'guests', label: '👻 Invitados' } ]}
                />
              </Col>
              <Col xs={24} sm={12} md={6}>
                <Text strong style={{ display: 'block', marginBottom: 6 }}>Inicia (Opcional)</Text>
                <Input 
                  type="datetime-local" 
                  size="large" 
                  value={editingAnn.publishAt} 
                  onChange={(e) => setEditingAnn({ ...editingAnn, publishAt: e.target.value })} 
                />
              </Col>
              <Col xs={24} sm={12} md={6}>
                <Text strong style={{ display: 'block', marginBottom: 6 }}>Termina (Opcional)</Text>
                <Input 
                  type="datetime-local" 
                  size="large" 
                  value={editingAnn.expiresAt} 
                  onChange={(e) => setEditingAnn({ ...editingAnn, expiresAt: e.target.value })} 
                />
              </Col>
            </Row>

            <Divider style={{ margin: '4px 0' }} />

            <Row gutter={[16, 16]} align="middle" justify="space-between">
              <Col>
                <Card size="small" style={{ background: editingAnn.alwaysShow ? '#fff7ed' : 'var(--z-bg-elevated)', borderColor: editingAnn.alwaysShow ? '#fed7aa' : 'var(--z-border)' }}>
                  <Space size={16}>
                    <div>
                      <Text strong style={{ display: 'block', color: editingAnn.alwaysShow ? '#c2410c' : 'inherit', lineHeight: 1.2 }}>
                        {editingAnn.alwaysShow ? 'Campaña Agresiva (Fijo)' : 'Aviso normal'}
                      </Text>
                      <Text style={{ fontSize: 12, color: editingAnn.alwaysShow ? '#ea580c' : 'var(--z-text-muted)' }}>
                        {editingAnn.alwaysShow ? 'Se muestra CADA VEZ que recargan' : 'Se oculta si le dan a Entendido'}
                      </Text>
                    </div>
                    <Switch checked={editingAnn.alwaysShow} onChange={(v) => setEditingAnn({ ...editingAnn, alwaysShow: v })} />
                  </Space>
                </Card>
              </Col>
              <Col>
                <Card size="small" style={{ background: editingAnn.active ? '#f0fdf4' : '#fff1f2', borderColor: editingAnn.active ? '#bbf7d0' : '#fecdd3' }}>
                  <Space size={16}>
                    <div>
                      <Text strong style={{ display: 'block', color: editingAnn.active ? '#166534' : '#9f1239', lineHeight: 1.2 }}>
                        {editingAnn.active ? 'Aviso Activo' : 'Aviso Inactivo'}
                      </Text>
                      <Text style={{ fontSize: 12, color: editingAnn.active ? '#15803d' : '#be123c' }}>
                        {editingAnn.active ? 'Se mostrará a los usuarios' : 'Nadie podrá verlo'}
                      </Text>
                    </div>
                    <Switch checked={editingAnn.active} onChange={(v) => setEditingAnn({ ...editingAnn, active: v })} />
                  </Space>
                </Card>
              </Col>
            </Row>
          </Space>
        )}
      </Modal>
    </div>
  );
}
