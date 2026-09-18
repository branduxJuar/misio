export function getPrintableTombolaTickets(tickets, raffleStatus) {
  return raffleStatus === 'completed' ? tickets : tickets.filter((ticket) => ticket.status === 'active');
}

export async function createTombolaPdf(tickets, { accountId, downloadedAt } = {}) {
  const slips = tickets.slice().sort((a, b) => a.ticketNumber - b.ticketNumber);
  if (!slips.length || slips.some(({ ticketNumber, code }) =>
    !Number.isSafeInteger(ticketNumber) || ticketNumber < 1
    || !/^[A-Z0-9]{2,6}-\d{3,}$/i.test(code ?? '')
    || Number(code.split('-')[1]) !== ticketNumber)
    || new Set(slips.map(({ ticketNumber }) => ticketNumber)).size !== slips.length) {
    throw new Error('La lista de boletos activos está vacía o contiene códigos inválidos.');
  }
  const downloadDate = new Date(downloadedAt);
  if (!/^[a-f0-9]{24}$/i.test(String(accountId ?? '')) || Number.isNaN(downloadDate.getTime())) {
    throw new Error('No se pudo identificar la cuenta o la fecha de descarga.');
  }

  const dateLabel = new Intl.DateTimeFormat('es-PE', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: 'America/Lima',
  }).format(downloadDate).replace(',', '');

  const { jsPDF } = await import('jspdf');
  const pdf = new jsPDF({ unit: 'mm', format: 'a4', compress: true });
  const columns = 4;
  const rows = 10;
  const marginX = 10;
  const marginY = 11;
  const cellWidth = (210 - marginX * 2) / columns;
  const cellHeight = (297 - marginY * 2) / rows;
  const perPage = columns * rows;

  for (let page = 0; page < Math.ceil(slips.length / perPage); page++) {
    if (page > 0) pdf.addPage();
    pdf.setDrawColor(170, 178, 188);
    pdf.setLineWidth(0.2);
    pdf.setLineDashPattern([1.2, 1.2], 0);
    slips.slice(page * perPage, (page + 1) * perPage).forEach(({ code }, index) => {
      const column = index % columns;
      const row = Math.floor(index / columns);
      const x = marginX + (column + 0.5) * cellWidth;
      const top = marginY + row * cellHeight;
      const bottom = top + cellHeight;
      pdf.rect(marginX + column * cellWidth, top, cellWidth, cellHeight);
      pdf.setFont('courier', 'bold');
      pdf.setFontSize(18);
      pdf.setFontSize(Math.min(18, 18 * (cellWidth - 5) / pdf.getTextWidth(code)));
      pdf.setTextColor(30, 40, 52);
      pdf.text(code, x, top + 14, { align: 'center' });
      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(6.5);
      pdf.setTextColor(76, 88, 102);
      pdf.text(`misio.pe  ${dateLabel}`, x, bottom - 5.5, { align: 'center' });
      pdf.setFont('courier', 'normal');
      pdf.setFontSize(7);
      pdf.text(`CUENTA ${accountId.slice(-12).toUpperCase()}`, x, bottom - 2.5, { align: 'center' });
    });
    pdf.setLineDashPattern([], 0);
  }

  return pdf;
}
