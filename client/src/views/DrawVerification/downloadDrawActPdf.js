import { drawActFacts } from './drawActFacts.js';

const ticketCode = (number, raffle) => {
  const digits = Math.max(4, String(raffle?.totalTickets ?? 0).length);
  const suffix = String(number).padStart(digits, '0');
  return raffle?.ticketPrefix ? `${raffle.ticketPrefix}-${suffix}` : `#${suffix}`;
};

export async function createDrawActPdf({ proof, raffle, title, status, statusLabel, events, lastDraw }) {
  const { jsPDF } = await import('jspdf');
  const pdf = new jsPDF({ unit: 'mm', format: 'a4' });
  const left = 16;
  const contentWidth = 178;
  const bottom = 278;
  let y = 24;

  const pageHeader = (continued = false) => {
    pdf.setFillColor(23, 34, 53);
    pdf.rect(0, 0, 210, 16, 'F');
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(9);
    pdf.setTextColor(255, 255, 255);
    pdf.text(continued ? 'MISIO.PE  /  ACTA PUBLICA DE COTEJO  /  CONTINUACION' : 'MISIO.PE  /  ACTA PUBLICA DE COTEJO', left, 10);
  };
  const ensureSpace = (height) => {
    if (y + height <= bottom) return false;
    pdf.addPage();
    pageHeader(true);
    y = 24;
    return true;
  };
  const writeLines = (value, { size = 10, bold = false, color = [37, 52, 75], gap = 2, width = contentWidth } = {}) => {
    pdf.setFont('helvetica', bold ? 'bold' : 'normal');
    pdf.setFontSize(size);
    pdf.setTextColor(...color);
    const lines = pdf.splitTextToSize(String(value), width);
    const lineHeight = size * 0.46;
    ensureSpace(lines.length * lineHeight + gap);
    pdf.text(lines, left, y);
    y += lines.length * lineHeight + gap;
  };
  pageHeader();
  pdf.setTextColor(23, 34, 53);
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(17);
  pdf.text('ACTA DE COTEJO PUBLICO DEL SORTEO', 105, y + 2, { align: 'center' });
  y += 10;
  pdf.setFontSize(9);
  pdf.setTextColor(104, 121, 146);
  pdf.text('REGISTRO TRANSPARENTE Y VERIFICABLE', 105, y, { align: 'center' });
  y += 5;
  pdf.setTextColor(12, 116, 95);
  pdf.text(`ID de registro: ${proof.raffleId}`, 105, y, { align: 'center' });
  y += 10;
  pdf.setDrawColor(220, 229, 240);
  pdf.line(left, y, 194, y);
  y += 8;

  const prizeDescription = typeof raffle?.description === 'string' ? raffle.description.trim() : '';
  const conclusion = status === 'valid'
    ? 'El cotejo confirma que las tiradas registradas coinciden con la mecánica publicada.'
    : status === 'invalid'
      ? 'El cotejo encontró discrepancias; el resultado requiere revisión.'
      : 'El cotejo del resultado aún está pendiente.';
  writeLines(`Por medio del presente documento, se deja constancia pública del sorteo ${title}${prizeDescription ? ` (${prizeDescription})` : ''}, identificado en misio.pe con el ID ${proof.raffleId}. Se registran los boletos participantes, ${proof.prizes.length > 1 ? `las reglas de sus ${proof.prizes.length} premios` : 'la mecánica aplicada'} y las extracciones realizadas. ${conclusion}`, { size: 9.5, color: [69, 86, 109], gap: 7 });

  const fields = drawActFacts(proof, lastDraw);
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(9);
  const fieldRows = fields.map(({ label, value }) => {
    const lines = pdf.splitTextToSize(value, 98);
    return { label, lines, height: Math.max(7, lines.length * 4.2 + 2) };
  });
  const boxHeight = fieldRows.reduce((total, row) => total + row.height, 9);
  ensureSpace(boxHeight + 4);
  pdf.setFillColor(248, 251, 255);
  pdf.setDrawColor(220, 229, 240);
  pdf.roundedRect(left, y - 4, contentWidth, boxHeight, 2, 2, 'FD');
  y += 2;
  fieldRows.forEach(({ label, lines, height }) => {
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(9);
    pdf.setTextColor(101, 116, 138);
    pdf.text(label, left + 4, y);
    pdf.setFont('helvetica', 'bold');
    pdf.setTextColor(37, 52, 75);
    pdf.text(lines, 190, y, { align: 'right' });
    y += height;
  });
  y += 7;

  writeLines(status === 'valid' ? 'SECUENCIA DE EXTRACCIONES COTEJADAS:' : 'SECUENCIA DE EXTRACCIONES REGISTRADAS:', { size: 10, bold: true, gap: 4 });

  const widths = [31, 29, 36, 82];
  const labels = ['Extracción', 'N.º Boleto', 'Código', 'Dictamen de Regla'];
  const tableHeader = () => {
    ensureSpace(9);
    pdf.setFillColor(241, 246, 252);
    pdf.rect(left, y - 4, contentWidth, 9, 'F');
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(8);
    pdf.setTextColor(72, 91, 115);
    let x = left;
    labels.forEach((label, index) => { pdf.text(label, x + 2, y + 1); x += widths[index]; });
    y += 7;
  };
  tableHeader();
  if (!events.length) writeLines('Aún no hay extracciones registradas.', { size: 9 });
  events.forEach((event) => {
    const prizeName = proof.prizes[event.prizeIndex]?.title ?? `Premio ${event.prizeIndex + 1}`;
    const verdict = event.result === 'winner'
      ? status === 'valid' ? 'GANADOR VERIFICADO' : status === 'invalid' ? 'GANADOR EN REVISIÓN' : 'GANADOR REGISTRADO'
      : 'Al agua (Descartado)';
    const values = [`Tirada ${String(event.attempt).padStart(2, '0')}${proof.prizes.length > 1 ? ` · ${prizeName}` : ''}`, `#${String(event.ticketNumber).padStart(3, '0')}`, ticketCode(event.ticketNumber, raffle), verdict];
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(8);
    const cells = values.map((value, column) => pdf.splitTextToSize(value, widths[column] - 4));
    const height = Math.max(9, ...cells.map((lines) => lines.length * 3.6 + 4));
    if (ensureSpace(height + 2)) tableHeader();
    if (event.result === 'winner') {
      pdf.setFillColor(255, 251, 236);
      pdf.rect(left, y - 3, contentWidth, height, 'F');
    }
    let x = left;
    cells.forEach((lines, column) => {
      pdf.setFont('helvetica', column === 3 && event.result === 'winner' ? 'bold' : 'normal');
      const verdictColor = column === 3
        ? event.result === 'winner' ? [152, 81, 10] : [23, 99, 123]
        : [37, 52, 75];
      pdf.setTextColor(...verdictColor);
      pdf.text(lines, x + 2, y + 1);
      x += widths[column];
    });
    y += height;
    pdf.setDrawColor(227, 234, 243);
    pdf.line(left, y - 3, 194, y - 3);
  });

  y += 8;
  const writeHash = (label, value) => {
    writeLines(label, { size: 9, bold: true, color: [92, 109, 130], gap: 2 });
    pdf.setFont('courier', 'normal');
    pdf.setFontSize(8);
    pdf.setTextColor(52, 73, 96);
    const chunks = String(value).match(/.{1,64}/g) ?? ['Aún no disponible'];
    ensureSpace(chunks.length * 4 + 4);
    chunks.forEach((chunk) => { pdf.text(chunk, left, y); y += 4; });
    y += 4;
  };
  writeHash('Huella SHA-256 del acta', proof.commitment);
  writeHash('Firma de Drand', proof.beaconSignature || 'Aún no disponible');
  writeLines('Esta acta es generada automáticamente y verificada criptográficamente. La huella permite detectar alteraciones en el padrón o en las reglas. La constatación notarial (validación humana) acredita formalmente el proceso, mientras que la verificación técnica garantiza que las tiradas no han sido manipuladas por software.', { size: 8, color: [101, 116, 138] });

  ensureSpace(35);
  y += 3;
  pdf.setDrawColor(220, 229, 240);
  pdf.line(left, y, 194, y);
  y += 13;
  const attestations = [
    { 
      x: 60, 
      mark: proof.dossier ? 'CONSTATADO' : 'Pendiente', 
      title: 'CONSTATACION NOTARIAL', 
      detail: proof.dossier ? `${proof.dossier.certifierRole}: ${proof.dossier.certifierName}` : 'Sin firma notarial asociada', 
      color: proof.dossier ? [12, 116, 95] : [86, 103, 127] 
    },
    {
      x: 150,
      mark: status === 'valid' ? 'MISIO · VERIFICADO' : status === 'invalid' ? 'MISIO · REVISAR' : 'MISIO · PENDIENTE',
      title: 'COTEJO TECNICO MISIO.PE',
      detail: `${statusLabel} · SHA-256 y Drand`,
      color: status === 'valid' ? [12, 116, 95] : status === 'invalid' ? [180, 35, 59] : [154, 103, 0],
    },
  ];
  attestations.forEach(({ x, mark, title: attestationTitle, detail, color }) => {
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(9);
    pdf.setTextColor(...color);
    pdf.text(mark, x, y, { align: 'center' });
    pdf.setDrawColor(174, 189, 208);
    pdf.line(x - 22, y + 3, x + 22, y + 3);
    pdf.setFontSize(7.5);
    pdf.setTextColor(52, 69, 93);
    pdf.text(attestationTitle, x, y + 8, { align: 'center' });
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(7);
    pdf.setTextColor(133, 147, 168);
    pdf.text(detail, x, y + 14, { align: 'center' });
  });
  y += 17;

  const pages = pdf.getNumberOfPages();
  for (let page = 1; page <= pages; page++) {
    pdf.setPage(page);
    pdf.setDrawColor(220, 229, 240);
    pdf.line(left, 285, 194, 285);
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(8);
    pdf.setTextColor(101, 116, 138);
    pdf.text('misio.pe · Registro público del sorteo', left, 290);
    pdf.text(`${page} / ${pages}`, 194, 290, { align: 'right' });
  }

  return pdf;
}

export async function downloadDrawActPdf(options) {
  const pdf = await createDrawActPdf(options);
  pdf.save(`acta-cotejo-${options.proof.raffleId}.pdf`);
}
