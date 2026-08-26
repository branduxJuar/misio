/**
 * MOCK DATA CENTRAL DE MISIO
 * --------------------------
 * Todos los datos ficticios viven aquí para que, cuando el backend esté
 * listo, un dev junior solo tenga que reemplazar estos imports por
 * llamadas fetch/axios a /api/v1/* sin tocar los componentes.
 *
 * Las formas (shapes) replican exactamente los esquemas Mongoose del server.
 */

// ── Rifas activas (MarketplaceLanding) ────────────────────────────────
export const MOCK_RAFFLES = [
  {
    _id: 'raf_001',
    title: 'iPhone 16 Pro Max 256GB',
    description: 'Titanio negro, sellado, con boleta y garantía Apple Perú.',
    ticketPrice: 10,
    totalTickets: 500,
    soldTickets: 431,
    winningAttempt: 3,
    status: 'live',
    emoji: '📱',
  },
  {
    _id: 'raf_002',
    title: 'PlayStation 5 Slim + 2 mandos',
    description: 'Edición disco 1TB, incluye EA FC 26 físico.',
    ticketPrice: 8,
    totalTickets: 400,
    soldTickets: 265,
    winningAttempt: 4,
    status: 'active',
    emoji: '🎮',
  },
  {
    _id: 'raf_003',
    title: 'Scooter eléctrico Xiaomi Pro 4',
    description: '45 km de autonomía, ideal para tráfico limeño.',
    ticketPrice: 12,
    totalTickets: 350,
    soldTickets: 98,
    winningAttempt: 3,
    status: 'active',
    emoji: '🛴',
  },
  {
    _id: 'raf_004',
    title: 'S/ 1,500 en efectivo (Yape directo)',
    description: 'Transferencia inmediata al ganador, en vivo.',
    ticketPrice: 5,
    totalTickets: 600,
    soldTickets: 512,
    winningAttempt: 5,
    status: 'active',
    emoji: '💵',
  },
];

// ── Usuario demo (UserDashboard) ──────────────────────────────────────
export const MOCK_USER = {
  _id: 'usr_778',
  name: 'Carla Mendoza',
  dni: '74581236',
  phone: '+51 987 654 321',
  role: 'user',
  walletBalance: 47.0,
};

export const MOCK_USER_TICKETS = [
  { _id: 'tk_01', raffleTitle: 'iPhone 16 Pro Max 256GB', ticketNumber: 287, status: 'active', date: '2026-07-01' },
  { _id: 'tk_02', raffleTitle: 'iPhone 16 Pro Max 256GB', ticketNumber: 288, status: 'active', date: '2026-07-01' },
  { _id: 'tk_03', raffleTitle: 'Smart TV LG 55" OLED', ticketNumber: 104, status: 'burned_al_agua', date: '2026-06-20' },
  { _id: 'tk_04', raffleTitle: 'AirPods Pro 2', ticketNumber: 45, status: 'winner', date: '2026-06-05' },
  { _id: 'tk_05', raffleTitle: 'S/ 800 en efectivo', ticketNumber: 312, status: 'burned_al_agua', date: '2026-05-28' },
];

export const MOCK_TRANSACTIONS = [
  { _id: 'tx_01', type: 'deposit_yape', amount: 50, status: 'completed', date: '2026-07-01 10:15' },
  { _id: 'tx_02', type: 'ticket_purchase', amount: -20, status: 'completed', date: '2026-07-01 10:18' },
  { _id: 'tx_03', type: 'cero_perdida_refund', amount: 12, status: 'completed', date: '2026-06-21 21:40' },
  { _id: 'tx_04', type: 'cero_perdida_refund', amount: 5, status: 'completed', date: '2026-05-29 22:05' },
  { _id: 'tx_05', type: 'marketplace_purchase', amount: -15, status: 'completed', date: '2026-05-30 09:12' },
];

// ── Tienda de canjes (Marketplace interno) ────────────────────────────
export const MOCK_STORE_ITEMS = [
  { _id: 'st_01', name: 'Gift card Rappi S/ 20', price: 20, emoji: '🛵' },
  { _id: 'st_02', name: 'Recarga Claro/Movistar S/ 15', price: 15, emoji: '📶' },
  { _id: 'st_03', name: '5 boletos extra (cualquier rifa)', price: 40, emoji: '🎟️' },
  { _id: 'st_04', name: 'Gift card Steam S/ 50', price: 50, emoji: '🕹️' },
];

// ── Sala en vivo (LiveDrawRoom) ───────────────────────────────────────
export const MOCK_LIVE_RAFFLE = {
  _id: 'raf_001',
  title: 'iPhone 16 Pro Max 256GB',
  winningAttempt: 3,
  currentAttempt: 2,
  streamUrl: 'https://www.youtube.com/embed/live_stream_placeholder',
  viewers: 1243,
};

export const MOCK_PARTICIPANTS = [
  { name: 'Carla M.', ticketNumber: 287, city: 'Tumbes' },
  { name: 'Jorge R.', ticketNumber: 102, city: 'Lima' },
  { name: 'Fiorella T.', ticketNumber: 355, city: 'Arequipa' },
  { name: 'Miguel A.', ticketNumber: 44, city: 'Piura' },
  { name: 'Rosa Q.', ticketNumber: 219, city: 'Cusco' },
  { name: 'Diego V.', ticketNumber: 471, city: 'Trujillo' },
  { name: 'Lucía P.', ticketNumber: 130, city: 'Chiclayo' },
];

export const MOCK_DRAW_TIMELINE = [
  { attempt: 1, ticketNumber: 419, holder: 'Renzo C. (Huancayo)', result: 'al_agua', time: '21:04' },
  { attempt: 2, ticketNumber: 87, holder: 'Sandra L. (Lima)', result: 'al_agua', time: '21:09' },
  { attempt: 3, ticketNumber: null, holder: null, result: 'pending', time: null },
];

// ── ERP Logístico (AdminLogisticsDashboard) ───────────────────────────
export const MOCK_ERP_SUMMARY = {
  totalRevenue: 24350,
  totalCosts: 15820,
  netMargin: 8530,
  prizesInStock: 3,
  prizesInTransit: 2,
};

export const MOCK_ERP_INVENTORY = [
  {
    _id: 'erp_01',
    productName: 'iPhone 16 Pro Max 256GB',
    raffleTitle: 'iPhone 16 Pro Max 256GB',
    purchaseCost: 5200,
    revenue: 5000,
    winner: '— (rifa en vivo)',
    courier: '—',
    trackingNumber: '—',
    deliveryStatus: 'in_stock',
  },
  {
    _id: 'erp_02',
    productName: 'Smart TV LG 55" OLED',
    raffleTitle: 'Smart TV LG 55" OLED',
    purchaseCost: 3100,
    revenue: 4800,
    winner: 'Pedro Salas (Iquitos)',
    courier: 'Olva Courier',
    trackingNumber: 'OLV-88214-PE',
    deliveryStatus: 'transit',
  },
  {
    _id: 'erp_03',
    productName: 'AirPods Pro 2',
    raffleTitle: 'AirPods Pro 2',
    purchaseCost: 890,
    revenue: 2250,
    winner: 'Carla Mendoza (Tumbes)',
    courier: 'Shalom',
    trackingNumber: 'SHL-30471',
    deliveryStatus: 'delivered',
  },
  {
    _id: 'erp_04',
    productName: 'PlayStation 5 Slim',
    raffleTitle: 'PlayStation 5 Slim + 2 mandos',
    purchaseCost: 2400,
    revenue: 3200,
    winner: '— (en venta)',
    courier: '—',
    trackingNumber: '—',
    deliveryStatus: 'in_stock',
  },
  {
    _id: 'erp_05',
    productName: 'Scooter Xiaomi Pro 4',
    raffleTitle: 'Scooter eléctrico Xiaomi Pro 4',
    purchaseCost: 1980,
    revenue: 4200,
    winner: 'Ana Torres (Cajamarca)',
    courier: 'Marvisur',
    trackingNumber: 'MVS-11209-CJ',
    deliveryStatus: 'transit',
  },
];

/** Bitácora de envío del premio erp_02 (Timeline del panel admin). */
export const MOCK_SHIPPING_LOG = [
  { label: 'Premio comprado — boleta N° F001-8842 registrada', date: '25 jun, 11:20', status: 'done' },
  { label: 'Rifa completada — ganador: Pedro Salas (Iquitos)', date: '28 jun, 21:35', status: 'done' },
  { label: 'Datos de envío confirmados por WhatsApp', date: '29 jun, 09:10', status: 'done' },
  { label: 'Entregado a Olva Courier — guía OLV-88214-PE', date: '30 jun, 16:45', status: 'done' },
  { label: 'En tránsito Lima → Iquitos (vía aérea)', date: '02 jul, 08:00', status: 'current' },
  { label: 'Entrega + foto de evidencia', date: 'Estimado: 06 jul', status: 'pending' },
];
