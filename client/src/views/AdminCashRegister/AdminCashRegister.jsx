import React, { useMemo, useState } from 'react';
import { Card, Col, Row, Typography, Table, Tag, Button, Modal, Form, Input, Select, InputNumber, Alert, Statistic, Space, Divider, message, Empty } from 'antd';
import { AppstoreAddOutlined, LockOutlined, UnlockOutlined, RetweetOutlined, UploadOutlined, DollarOutlined, EyeOutlined, DownloadOutlined } from '@ant-design/icons';
import { useApiOrMock } from '../../hooks/useApiOrMock';
import { api } from '../../auth/api';
import { MISIO_COLORS } from '../../theme/misioTheme';

const { Title, Text } = Typography;

export default function AdminCashRegister() {
  const [msgApi, contextHolder] = message.useMessage();
  const [openingModal, setOpeningModal] = useState(false);
  const [closingModal, setClosingModal] = useState(false);
  const [expenseModal, setExpenseModal] = useState(false);
  const [openForm] = Form.useForm();
  const [closeForm] = Form.useForm();
  const [expenseForm] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [detailsModalOpen, setDetailsModalOpen] = useState(false);
  const [currentDetails, setCurrentDetails] = useState(null);
  const [loadingDetails, setLoadingDetails] = useState(false);

  const { data: registers, refresh: refreshRegisters } = useApiOrMock('/cash/registers', []);
  const { data: shiftData, refresh: refreshShift } = useApiOrMock('/cash/my-shift', null);
  const { data: closedShifts, refresh: refreshHistory } = useApiOrMock('/cash/shifts-history', []);

  const shift = shiftData?.shift;
  const movements = shiftData?.movements || [];
  const deposits = shiftData?.deposits || [];

  const handleOpenShift = async (values) => {
    setLoading(true);
    try {
      await api('/cash/open-shift', {
        method: 'POST',
        body: { registerId: values.registerId, openingBalance: values.openingBalance || 0 }
      });
      msgApi.success('Caja abierta correctamente');
      setOpeningModal(false);
      openForm.resetFields();
      refreshRegisters();
      refreshShift();
    } catch (err) {
      msgApi.error(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleCloseShift = async (values) => {
    setLoading(true);
    try {
      await api('/cash/close-shift', {
        method: 'POST',
        body: { closingBalance: values.closingBalance }
      });
      msgApi.success('Caja cerrada correctamente');
      setClosingModal(false);
      closeForm.resetFields();
      refreshRegisters();
      refreshShift();
      refreshHistory();
    } catch (err) {
      msgApi.error(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleAddExpense = async (values) => {
    setLoading(true);
    try {
      await api('/cash/movement', { method: 'POST', body: JSON.stringify(values) });
      msgApi.success('Movimiento registrado');
      setExpenseModal(false);
      expenseForm.resetFields();
      refreshShift();
    } catch (err) {
      msgApi.error(err.message || 'Error al registrar movimiento');
    } finally {
      setLoading(false);
    }
  };

  const handleViewShift = async (shiftId) => {
    setDetailsModalOpen(true);
    setLoadingDetails(true);
    setCurrentDetails(null);
    try {
      const res = await api(`/cash/shifts/${shiftId}`);
      setCurrentDetails(res);
    } catch (err) {
      msgApi.error('Error al cargar detalle del turno');
      setDetailsModalOpen(false);
    } finally {
      setLoadingDetails(false);
    }
  };

  const handleDownloadExcel = async () => {
    if (!currentDetails) return;
    
    const rows = [];
    currentDetails.movements.forEach(m => {
      rows.push({
        Fecha: new Date(m.createdAt).toLocaleString(),
        Tipo: m.type,
        Monto: m.amount,
        Motivo: m.description || ''
      });
    });
    currentDetails.deposits.forEach(d => {
      rows.push({
        Fecha: new Date(d.createdAt).toLocaleString(),
        Tipo: 'RECARGA YAPE',
        Monto: d.amount,
        Motivo: 'Recarga confirmada'
      });
    });
    
    // Ordenar por fecha descendente igual que en la tabla
    rows.sort((a, b) => new Date(b.Fecha).getTime() - new Date(a.Fecha).getTime());
    
    const XLSX = await import('xlsx');
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Movimientos");
    
    XLSX.writeFile(wb, `turno_caja_${currentDetails.shift._id}.xlsx`);
  };

  const handleCreateRegister = async () => {
    const name = window.prompt("Nombre de la nueva caja (Ej: Yape Juan, BCP Empresa)");
    if (!name) return;
    try {
      await api('/cash/registers', { method: 'POST', body: { name } });
      msgApi.success('Caja creada');
      refreshRegisters();
    } catch (err) {
      msgApi.error(err.message);
    }
  };

  if (!shift) {
    return (
      <div style={{ padding: 24, maxWidth: 1200, margin: '0 auto', textAlign: 'center' }}>
        {contextHolder}
        <Title level={2}>Cierre de Caja (Arqueo)</Title>
        <Alert
          type="warning"
          showIcon
          message="No tienes un turno de caja abierto"
          description="Debes abrir un turno en alguna de las cajas para poder confirmar pagos de Yape y registrar movimientos."
          style={{ marginBottom: 24, textAlign: 'left' }}
        />
        <Card title="Cajas Registradoras Disponibles" extra={<Button onClick={handleCreateRegister}>+ Crear Caja</Button>}>
          <Row gutter={[16, 16]}>
            {registers.map(reg => (
              <Col xs={24} sm={12} md={8} key={reg._id}>
                <Card size="small" type="inner" style={{ opacity: reg.status === 'OPEN' ? 0.5 : 1 }}>
                  <Statistic 
                    title={reg.name} 
                    value={reg.status === 'OPEN' ? 'Ocupada' : 'Disponible'} 
                    valueStyle={{ fontSize: 16, color: reg.status === 'OPEN' ? MISIO_COLORS.textMuted : MISIO_COLORS.success }}
                  />
                  <Button 
                    type="primary" 
                    block 
                    style={{ marginTop: 12 }} 
                    disabled={reg.status === 'OPEN'}
                    onClick={() => {
                      openForm.setFieldsValue({ registerId: reg._id, openingBalance: 0 });
                      setOpeningModal(true);
                    }}
                  >
                    Abrir esta caja
                  </Button>
                </Card>
              </Col>
            ))}
            {registers.length === 0 && <Text type="secondary">No hay cajas creadas.</Text>}
          </Row>
        </Card>

        <Modal title="Abrir Caja" open={openingModal} onCancel={() => setOpeningModal(false)} footer={null}>
          <Form form={openForm} layout="vertical" onFinish={handleOpenShift}>
            <Form.Item name="registerId" hidden><Input /></Form.Item>
            <Form.Item name="openingBalance" label="Saldo Inicial (Efectivo/Banco)" rules={[{ required: true }]}>
              <InputNumber style={{ width: '100%' }} prefix="S/" min={0} step={0.1} />
            </Form.Item>
            <Button type="primary" htmlType="submit" loading={loading} block>Abrir Caja</Button>
          </Form>
        </Modal>

        <Card title="Historial de Cierres de Caja" style={{ marginTop: 24 }}>
          <Table
            dataSource={closedShifts}
            rowKey="_id"
            size="small"
            pagination={{ pageSize: 10 }}
            scroll={{ x: 'max-content' }}
            columns={[
              { title: 'Fecha Cierre', dataIndex: 'closedAt', render: d => new Date(d).toLocaleString() },
              { title: 'Caja', dataIndex: ['registerId', 'name'] },
              { title: 'Cajero', dataIndex: ['openedBy', 'name'] },
              { title: 'Apertura', dataIndex: 'openingBalance', render: a => `S/ ${a.toFixed(2)}` },
              { title: 'Cierre (Real)', dataIndex: 'closingBalance', render: a => <Text strong>S/ {a.toFixed(2)}</Text> },
              { title: 'Esperado (Sistema)', dataIndex: 'expectedBalance', render: a => `S/ ${a.toFixed(2)}` },
              { 
                title: 'Discrepancia', 
                dataIndex: 'discrepancy', 
                render: d => {
                  if (d === 0) return <Tag color="green">S/ 0.00 (Cuadró)</Tag>;
                  if (d > 0) return <Tag color="orange">+ S/ {d.toFixed(2)} (Sobra)</Tag>;
                  return <Tag color="red">- S/ {Math.abs(d).toFixed(2)} (Falta)</Tag>;
                }
              },
              {
                title: 'Acciones',
                render: (_, record) => (
                  <Button type="text" icon={<EyeOutlined />} onClick={() => handleViewShift(record._id)} />
                )
              }
            ]}
          />
        </Card>

        <Modal 
          title={<><EyeOutlined /> Detalle del Turno</>}
          open={detailsModalOpen} 
          onCancel={() => setDetailsModalOpen(false)} 
          footer={[
            <Button key="close" onClick={() => setDetailsModalOpen(false)}>Cerrar</Button>,
            <Button key="download" type="primary" icon={<DownloadOutlined />} onClick={handleDownloadExcel} disabled={!currentDetails || loadingDetails} style={{ background: '#217346' }}>
              Descargar Excel
            </Button>
          ]}
          width={800}
        >
          {loadingDetails ? (
            <div style={{ textAlign: 'center', padding: '40px 0' }}>Cargando detalles...</div>
          ) : currentDetails ? (
            <div>
              <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
                <Col span={8}><Text type="secondary">Apertura:</Text><br/><Text strong>S/ {currentDetails.shift.openingBalance?.toFixed(2) ?? '0.00'}</Text></Col>
                <Col span={8}><Text type="secondary">Cierre (Declarado):</Text><br/><Text strong>S/ {currentDetails.shift.closingBalance?.toFixed(2) || 'N/A'}</Text></Col>
                <Col span={8}><Text type="secondary">Discrepancia:</Text><br/><Text strong type={currentDetails.shift.discrepancy === 0 ? 'success' : 'danger'}>S/ {currentDetails.shift.discrepancy?.toFixed(2) || '0.00'}</Text></Col>
              </Row>
              
              <Title level={5}>Movimientos & Recargas</Title>
              <Table
                dataSource={[
                  ...currentDetails.movements, 
                  ...currentDetails.deposits.map(d => ({ _id: d._id, type: 'RECARGA YAPE', amount: d.amount, description: 'Recarga confirmada', createdAt: d.createdAt }))
                ].sort((a,b) => new Date(b.createdAt) - new Date(a.createdAt))}
                rowKey="_id"
                size="small"
                pagination={{ pageSize: 10 }}
                columns={[
                  { title: 'Fecha', dataIndex: 'createdAt', render: d => new Date(d).toLocaleString() },
                  { title: 'Tipo', dataIndex: 'type', render: t => <Tag color={t==='EXPENSE'?'red':t==='WITHDRAWAL'?'orange':t==='RECARGA YAPE'?'green':'blue'}>{t}</Tag> },
                  { title: 'Monto', dataIndex: 'amount', render: a => `S/ ${a.toFixed(2)}` },
                  { title: 'Motivo', dataIndex: 'description' }
                ]}
              />
            </div>
          ) : (
            <Empty />
          )}
        </Modal>

      </div>
    );
  }

  return (
    <div style={{ padding: 24, maxWidth: 1200, margin: '0 auto' }}>
      {contextHolder}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <Title level={2} style={{ margin: 0 }}>Caja: {shift.registerId?.name}</Title>
        <Space>
          <Button type="primary" danger icon={<LockOutlined />} onClick={() => setClosingModal(true)}>Cerrar Caja</Button>
        </Space>
      </div>

      <Row gutter={[16, 16]}>
        <Col xs={24} sm={8}>
          <Card>
            <Statistic title="Saldo Inicial" value={shift.openingBalance} precision={2} prefix="S/" />
          </Card>
        </Col>
        <Col xs={24} sm={8}>
          <Card>
            <Statistic 
              title="Ingresos (Yape/Ventas/Otros)" 
              value={deposits.reduce((a, b) => a + b.amount, 0) + movements.filter(m => m.type === 'INCOME').reduce((a, b) => a + b.amount, 0)} 
              precision={2} 
              prefix="S/" 
              valueStyle={{ color: MISIO_COLORS.success }} 
            />
          </Card>
        </Col>
        <Col xs={24} sm={8}>
          <Card>
            <Statistic title="Egresos Manuales" value={movements.filter(m => m.type !== 'INCOME').reduce((a, b) => a + b.amount, 0)} precision={2} prefix="S/" valueStyle={{ color: MISIO_COLORS.danger }} />
          </Card>
        </Col>
      </Row>

      <Card 
        style={{ marginTop: 24, background: '#f8fafc', borderColor: '#cbd5e1' }}
        title="Saldo Esperado en Caja (Cuadre)"
        extra={<Button type="primary" ghost icon={<UploadOutlined />} onClick={() => setExpenseModal(true)}>Registrar Gasto/Retiro</Button>}
      >
        <Statistic 
          value={shiftData.calculatedExpected} 
          precision={2} 
          prefix="S/" 
          valueStyle={{ fontSize: 32, fontWeight: 700, color: MISIO_COLORS.electricBlue }}
        />
        <Text type="secondary">Este es el monto exacto que debes tener en esta cuenta/billetera al momento de cerrar.</Text>
      </Card>

      <Row gutter={[24, 24]} style={{ marginTop: 24 }}>
        <Col xs={24} md={12}>
          <Card title="Últimas Recargas (Yape)" size="small">
            <Table
              dataSource={deposits}
              rowKey="_id"
              pagination={{ pageSize: 5 }}
              size="small"
              columns={[
                { title: 'Fecha', dataIndex: 'createdAt', render: d => new Date(d).toLocaleTimeString() },
                { title: 'Monto', dataIndex: 'amount', render: a => `S/ ${a.toFixed(2)}` },
                { title: 'Estado', dataIndex: 'status', render: s => <Tag color="green">{s}</Tag> }
              ]}
            />
          </Card>
        </Col>
        <Col xs={24} md={12}>
          <Card title="Ingresos Manuales / Ventas" size="small">
            <Table
              dataSource={movements.filter(m => m.type === 'INCOME')}
              rowKey="_id"
              pagination={{ pageSize: 5 }}
              size="small"
              columns={[
                { title: 'Fecha', dataIndex: 'createdAt', render: d => new Date(d).toLocaleTimeString() },
                { title: 'Monto', dataIndex: 'amount', render: a => `S/ ${a.toFixed(2)}` },
                { title: 'Motivo', dataIndex: 'description' }
              ]}
            />
          </Card>
        </Col>
        <Col xs={24} md={12}>
          <Card title="Gastos / Retiros / Ajustes" size="small">
            <Table
              dataSource={movements.filter(m => m.type !== 'INCOME')}
              rowKey="_id"
              pagination={{ pageSize: 5 }}
              size="small"
              columns={[
                { title: 'Tipo', dataIndex: 'type', render: t => <Tag color={t==='EXPENSE'?'red':t==='WITHDRAWAL'?'orange':'green'}>{t}</Tag> },
                { title: 'Monto', dataIndex: 'amount', render: a => `S/ ${a.toFixed(2)}` },
                { title: 'Motivo', dataIndex: 'description' }
              ]}
            />
          </Card>
        </Col>
      </Row>

      <Card title="Historial de Cierres de Caja" style={{ marginTop: 24 }}>
        <Table
          dataSource={closedShifts}
          rowKey="_id"
          size="small"
          pagination={{ pageSize: 10 }}
          scroll={{ x: 'max-content' }}
          columns={[
            { title: 'Fecha Cierre', dataIndex: 'closedAt', render: d => new Date(d).toLocaleString() },
            { title: 'Caja', dataIndex: ['registerId', 'name'] },
            { title: 'Cajero', dataIndex: ['openedBy', 'name'] },
            { title: 'Apertura', dataIndex: 'openingBalance', render: a => `S/ ${a.toFixed(2)}` },
            { title: 'Cierre (Real)', dataIndex: 'closingBalance', render: a => <Text strong>S/ {a.toFixed(2)}</Text> },
            { title: 'Esperado (Sistema)', dataIndex: 'expectedBalance', render: a => `S/ ${a.toFixed(2)}` },
            { 
              title: 'Discrepancia', 
              dataIndex: 'discrepancy', 
              render: d => {
                if (d === 0) return <Tag color="green">S/ 0.00 (Cuadró)</Tag>;
                if (d > 0) return <Tag color="orange">+ S/ {d.toFixed(2)} (Sobra)</Tag>;
                return <Tag color="red">- S/ {Math.abs(d).toFixed(2)} (Falta)</Tag>;
              }
            },
            {
              title: 'Acciones',
              render: (_, record) => (
                <Button type="text" icon={<EyeOutlined />} onClick={() => handleViewShift(record._id)} />
              )
            }
          ]}
        />
      </Card>

      {/* MODALS */}
      <Modal title="Cerrar Caja (Arqueo)" open={closingModal} onCancel={() => setClosingModal(false)} footer={null}>
        <Alert type="info" showIcon message={`Saldo Esperado: S/ ${shiftData.calculatedExpected.toFixed(2)}`} style={{ marginBottom: 16 }} />
        <Form form={closeForm} layout="vertical" onFinish={handleCloseShift}>
          <Form.Item name="closingBalance" label="Saldo Real (Lo que hay físicamente o en el banco)" rules={[{ required: true }]}>
            <InputNumber style={{ width: '100%' }} prefix="S/" min={0} step={0.1} />
          </Form.Item>
          <Button type="primary" danger htmlType="submit" loading={loading} block>Declarar Saldo y Cerrar Turno</Button>
        </Form>
      </Modal>

      <Modal title="Registrar Movimiento Manual" open={expenseModal} onCancel={() => setExpenseModal(false)} footer={null}>
        <Form form={expenseForm} layout="vertical" onFinish={handleAddExpense}>
          <Form.Item name="type" label="Tipo de Movimiento" rules={[{ required: true }]}>
            <Select>
              <Select.Option value="EXPENSE">Gasto Operativo (Publicidad, internet, etc)</Select.Option>
              <Select.Option value="WITHDRAWAL">Retiro de Utilidades (Remesa)</Select.Option>
              <Select.Option value="INCOME">Ingreso Extraordinario</Select.Option>
            </Select>
          </Form.Item>
          <Form.Item name="amount" label="Monto" rules={[{ required: true }]}>
            <InputNumber style={{ width: '100%' }} prefix="S/" min={0.1} step={0.1} />
          </Form.Item>
          <Form.Item name="description" label="Descripción / Motivo" rules={[{ required: true }]}>
            <Input.TextArea rows={2} />
          </Form.Item>
          <Button type="primary" htmlType="submit" loading={loading} block>Guardar Movimiento</Button>
        </Form>
      </Modal>

      <Modal 
        title={<><EyeOutlined /> Detalle del Turno</>}
        open={detailsModalOpen} 
        onCancel={() => setDetailsModalOpen(false)} 
        footer={[
          <Button key="close" onClick={() => setDetailsModalOpen(false)}>Cerrar</Button>,
          <Button key="download" type="primary" icon={<DownloadOutlined />} onClick={handleDownloadExcel} disabled={!currentDetails || loadingDetails} style={{ background: '#217346' }}>
            Descargar Excel
          </Button>
        ]}
        width={800}
      >
        {loadingDetails ? (
          <div style={{ textAlign: 'center', padding: '40px 0' }}>Cargando detalles...</div>
        ) : currentDetails ? (
          <div>
            <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
              <Col span={8}><Text type="secondary">Apertura:</Text><br/><Text strong>S/ {currentDetails.shift.openingBalance?.toFixed(2) ?? '0.00'}</Text></Col>
              <Col span={8}><Text type="secondary">Cierre (Declarado):</Text><br/><Text strong>S/ {currentDetails.shift.closingBalance?.toFixed(2) || 'N/A'}</Text></Col>
              <Col span={8}><Text type="secondary">Discrepancia:</Text><br/><Text strong type={currentDetails.shift.discrepancy === 0 ? 'success' : 'danger'}>S/ {currentDetails.shift.discrepancy?.toFixed(2) || '0.00'}</Text></Col>
            </Row>
            
            <Title level={5}>Movimientos & Recargas</Title>
            <Table
              dataSource={[
                ...currentDetails.movements, 
                ...currentDetails.deposits.map(d => ({ _id: d._id, type: 'RECARGA YAPE', amount: d.amount, description: 'Recarga confirmada', createdAt: d.createdAt }))
              ].sort((a,b) => new Date(b.createdAt) - new Date(a.createdAt))}
              rowKey="_id"
              size="small"
              pagination={{ pageSize: 10 }}
              columns={[
                { title: 'Fecha', dataIndex: 'createdAt', render: d => new Date(d).toLocaleString() },
                { title: 'Tipo', dataIndex: 'type', render: t => <Tag color={t==='EXPENSE'?'red':t==='WITHDRAWAL'?'orange':t==='RECARGA YAPE'?'green':'blue'}>{t}</Tag> },
                { title: 'Monto', dataIndex: 'amount', render: a => `S/ ${a.toFixed(2)}` },
                { title: 'Motivo', dataIndex: 'description' }
              ]}
            />
          </div>
        ) : (
          <Empty />
        )}
      </Modal>

    </div>
  );
}
