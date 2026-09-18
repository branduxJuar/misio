import React, { useState, useEffect } from 'react';
import { Modal, Form, Input, Button, Upload, Select, message, Alert, Spin } from 'antd';
import { UploadOutlined, SafetyCertificateOutlined, LinkOutlined, FilePdfOutlined, EyeOutlined } from '@ant-design/icons';
import { api, tokenStore, BASE_URL } from '../../auth/api';

export default function DossierModal({ raffle, open, onClose }) {
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(false);
  const [fileList, setFileList] = useState([]);
  const [currentDossier, setCurrentDossier] = useState(null);
  const [msgApi, contextHolder] = message.useMessage();

  useEffect(() => {
    if (open && raffle) {
      loadDossier();
    } else {
      setFileList([]);
      setCurrentDossier(null);
    }
  }, [open, raffle]);

  const loadDossier = async () => {
    setFetching(true);
    try {
      const d = await api(`/raffles/${raffle._id}/dossier`);
      if (d && d._id) {
        setCurrentDossier(d);
        form.setFieldsValue({
          certifierName: d.certifierName,
          certifierRole: d.certifierRole,
          reference: d.reference,
          videoPlatform: d.videoPlatform,
          videoUrl: d.videoUrl,
        });
      }
    } catch (e) {
      console.error('Error cargando dossier:', e);
      // Ignorar, probablemente no hay dossier
    } finally {
      setFetching(false);
    }
  };

  const onFinish = async (values) => {
    // If we want to validate (i.e. they uploaded a file), it will be handled by the backend.
    setLoading(true);
    const formData = new FormData();
    if (fileList.length > 0) {
      const fileToUpload = fileList[0].originFileObj || fileList[0];
      formData.append('file', fileToUpload);
    }
    if (values.certifierName) formData.append('certifierName', values.certifierName);
    if (values.certifierRole) formData.append('certifierRole', values.certifierRole);
    if (values.reference) formData.append('reference', values.reference);
    if (values.videoPlatform) formData.append('videoPlatform', values.videoPlatform);
    if (values.videoUrl) formData.append('videoUrl', values.videoUrl);

    try {
      await api.postFormData(`/raffles/${raffle._id}/dossier`, formData);
      msgApi.success('Expediente guardado correctamente.');
      onClose();
    } catch (e) {
      msgApi.error(e.message || 'Error al guardar el expediente');
    } finally {
      setLoading(false);
    }
  };

  const uploadProps = {
    onRemove: () => setFileList([]),
    beforeUpload: (file) => {
      const isJpgOrPngOrPdf = file.type === 'image/jpeg' || file.type === 'image/png' || file.type === 'image/webp' || file.type === 'application/pdf';
      if (!isJpgOrPngOrPdf) {
        msgApi.error('Solo puedes subir archivos JPG/PNG/WEBP o PDF!');
      } else {
        setFileList([file]);
      }
      return false; // Prevent automatic upload
    },
    fileList,
  };

  const handleDownloadOriginal = async () => {
    try {
      const token = tokenStore.get();
      const res = await fetch(`${BASE_URL}/raffles/${raffle._id}/dossier/download`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!res.ok) throw new Error('No se pudo descargar');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      window.open(url, '_blank');
    } catch (e) {
      msgApi.error('No se pudo descargar el archivo original');
    }
  };

  const isReadOnly = currentDossier && currentDossier.status === 'validated';

  return (
    <Modal
      title={<><SafetyCertificateOutlined /> Expediente Notarial y Evidencia</>}
      open={open}
      onCancel={onClose}
      footer={isReadOnly ? <Button onClick={onClose} type="primary">Cerrar</Button> : null}
      destroyOnHidden
      width={isReadOnly ? 500 : 520}
    >
      {contextHolder}
      <Spin spinning={fetching}>
        <Form form={form} layout="vertical" onFinish={onFinish}>
          {isReadOnly ? (
            <div>
              <Alert
                message="Expediente Registrado y Validado"
                description="La información legal ha sido adjuntada exitosamente a la firma criptográfica pública de este sorteo."
                type="success"
                showIcon
                style={{ marginBottom: 20 }}
              />
              <div style={{ background: '#f5f5f5', padding: 16, borderRadius: 8, marginBottom: 16 }}>
                <p style={{ margin: '0 0 8px' }}><strong><SafetyCertificateOutlined /> Certificador:</strong> {currentDossier.certifierName || 'No especificado'}</p>
                <p style={{ margin: '0 0 8px' }}><strong>Cargo:</strong> {currentDossier.certifierRole || 'No especificado'}</p>
                <p style={{ margin: '0 0 8px' }}><strong>Referencia / Expediente:</strong> {currentDossier.reference || 'N/A'}</p>
                
                {currentDossier.videoUrl && (
                  <p style={{ margin: '0 0 8px' }}>
                    <strong><LinkOutlined /> Video de Respaldo ({currentDossier.videoPlatform}):</strong> <br/>
                    <a href={currentDossier.videoUrl} target="_blank" rel="noreferrer" style={{ wordBreak: 'break-all' }}>
                      {currentDossier.videoUrl}
                    </a>
                  </p>
                )}
              </div>
              
              <div style={{ textAlign: 'center', marginTop: 24 }}>
                {currentDossier.originalFilePath ? (
                  <>
                    <Button type="primary" size="large" icon={<EyeOutlined />} onClick={handleDownloadOriginal}>
                      Ver Documento Privado (PDF/Img)
                    </Button>
                    <div style={{ color: '#888', marginTop: 8, fontSize: 12 }}>
                      Este archivo es exclusivo para la administración y auditoría.
                    </div>
                  </>
                ) : (
                  <div style={{ color: '#888', fontStyle: 'italic' }}>
                    Aún no se ha adjuntado el documento notarial.
                  </div>
                )}
              </div>
            </div>
          ) : (
            <>
              <Form.Item 
                label="Constatación Notarial (Documento)" 
                name="file"
                extra={<span style={{ color: '#888', fontSize: 12 }}>Este archivo es privado para auditoría, pero validará el acta públicamente.</span>}
              >
                <Upload {...uploadProps} maxCount={1} accept=".jpg,.png,.webp,.pdf">
                  <Button icon={<UploadOutlined />}>Seleccionar Constancia (PDF/Img)</Button>
                </Upload>
              </Form.Item>
              
              <Form.Item label="Cargo del Certificador (Ej. Notario de Lima)" name="certifierRole">
                <Input placeholder="Notario Público" />
              </Form.Item>

              <Form.Item label="Nombre del Certificador" name="certifierName">
                <Input placeholder="Dr. Juan Pérez" />
              </Form.Item>

              <Form.Item label="Referencia / N.º Expediente" name="reference">
                <Input placeholder="Acta N° 12345" />
              </Form.Item>

              <div style={{ borderTop: '1px solid #eee', margin: '16px 0' }} />

              <Form.Item label="Plataforma de Video (Opcional)" name="videoPlatform">
                <Select placeholder="Selecciona" allowClear>
                  <Select.Option value="youtube">YouTube</Select.Option>
                  <Select.Option value="kick">Kick</Select.Option>
                  <Select.Option value="local">Local</Select.Option>
                </Select>
              </Form.Item>

              <Form.Item label="URL del Video (Transmisión) (Opcional)" name="videoUrl">
                <Input prefix={<LinkOutlined />} placeholder="https://youtube.com/watch?v=..." />
              </Form.Item>

              <Form.Item style={{ marginTop: 24, marginBottom: 0, textAlign: 'right' }}>
                <Button onClick={onClose} style={{ marginRight: 8 }}>Cancelar</Button>
                <Button type="primary" htmlType="submit" loading={loading}>Guardar (Borrador / Validar)</Button>
              </Form.Item>
            </>
          )}
        </Form>
      </Spin>
    </Modal>
  );
}
