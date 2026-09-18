import React, { useState } from 'react';
import { Button, Modal, message } from 'antd';
import { CloseOutlined, DownloadOutlined, FileTextOutlined, SafetyCertificateOutlined, TrophyFilled } from '@ant-design/icons';
import { downloadDrawActPdf } from './downloadDrawActPdf';
import { drawActFacts } from './drawActFacts';
import './DrawActModal.css';

const ticketCode = (number, raffle) => {
  const digits = Math.max(4, String(raffle?.totalTickets ?? 0).length);
  const suffix = String(number).padStart(digits, '0');
  return raffle?.ticketPrefix ? `${raffle.ticketPrefix}-${suffix}` : `#${suffix}`;
};

export default function DrawActModal({ open, onClose, proof, raffle, title, status }) {
  const [downloading, setDownloading] = useState(false);
  const events = proof.events.slice().sort((a, b) => a.prizeIndex - b.prizeIndex || a.attempt - b.attempt);
  const lastDraw = proof.events.map((event) => event.drawnAt).filter(Boolean).sort().at(-1);
  const statusLabel = status === 'valid' ? 'Tiradas cotejadas' : status === 'invalid' ? 'Discrepancias detectadas' : 'Cotejo pendiente';
  const facts = drawActFacts(proof, lastDraw, raffle);
  const prizeDescription = typeof raffle?.description === 'string' ? raffle.description.trim() : '';
  const conclusion = status === 'valid'
    ? 'El cotejo confirma que las tiradas registradas coinciden con la mecánica publicada.'
    : status === 'invalid'
      ? 'El cotejo encontró discrepancias; el resultado requiere revisión.'
      : 'El cotejo del resultado aún está pendiente.';

  async function savePdf() {
    setDownloading(true);
    try {
      await downloadDrawActPdf({ proof, raffle, title, status, statusLabel, events, lastDraw });
    } catch {
      message.error('No se pudo generar el PDF. Inténtalo de nuevo.');
    } finally {
      setDownloading(false);
    }
  }

  return (
    <Modal open={open} onCancel={onClose} footer={null} closable={false} title={null} width={680} className="draw-act-modal" centered destroyOnHidden>
      <div className="draw-act__toolbar">
        <strong><FileTextOutlined aria-hidden="true" /> ACTA PÚBLICA DEL SORTEO</strong>
        <div>
          <Button icon={<DownloadOutlined />} loading={downloading} onClick={savePdf} disabled={!proof.dossier || proof.dossier.status !== 'validated'} title={!proof.dossier || proof.dossier.status !== 'validated' ? 'Debes adjuntar el expediente notarial para descargar el acta' : ''}>Descargar PDF</Button>
          <button type="button" className="draw-act__close" onClick={onClose} aria-label="Cerrar acta"><CloseOutlined /></button>
        </div>
      </div>
      <div className="draw-act__scroll">
        <article className="draw-act__sheet" aria-label={`Acta pública de ${title}`} onContextMenu={(e) => e.preventDefault()} onCopyCapture={(e) => e.preventDefault()} onCutCapture={(e) => e.preventDefault()} style={{ userSelect: 'none', WebkitUserSelect: 'none' }}>
          <div className="draw-act__seal"><SafetyCertificateOutlined aria-hidden="true" /></div>
          <h2>ACTA DE COTEJO PÚBLICO DEL SORTEO</h2>
          <p className="draw-act__subtitle">Registro transparente y verificable</p>
          <p className="draw-act__reference">ID de registro: {proof.raffleId}</p>

          <p className="draw-act__intro">Por medio del presente documento, se deja constancia pública del sorteo <strong>{title}</strong>, identificado en <strong>misio.pe</strong> con el ID <strong>{proof.raffleId}</strong>. Se registran los boletos participantes, {proof.prizes.length > 1 ? `las reglas de sus ${proof.prizes.length} premios` : 'la mecánica aplicada'} y las extracciones realizadas. {conclusion}</p>

          <dl className="draw-act__details">
            {facts.map(({ label, value }) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}
          </dl>

          <h3>{status === 'valid' ? 'Secuencia de extracciones cotejadas:' : 'Secuencia de extracciones registradas:'}</h3>
          {events.length ? <div className="draw-act__table-scroll"><table>
            <thead><tr><th>Extracción</th><th>N.º Boleto</th><th>Código</th><th>Dictamen de Regla</th></tr></thead>
            <tbody>{events.map((event) => <tr key={`${event.prizeIndex}-${event.attempt}`} className={event.result === 'winner' ? 'is-winner' : ''}>
              <td>Tirada {String(event.attempt).padStart(2, '0')}{proof.prizes.length > 1 && <small>{proof.prizes[event.prizeIndex]?.title}</small>}</td>
              <td>#{String(event.ticketNumber).padStart(3, '0')}</td>
              <td>{ticketCode(event.ticketNumber, raffle)}</td>
              <td>{event.result === 'winner'
                ? <span className="draw-act__verdict draw-act__verdict--winner"><TrophyFilled aria-hidden="true" /> {status === 'valid' ? 'GANADOR VERIFICADO' : status === 'invalid' ? 'GANADOR EN REVISIÓN' : 'GANADOR REGISTRADO'}</span>
                : <span className="draw-act__verdict draw-act__verdict--water"><span aria-hidden="true">💧</span> Al agua (Descartado)</span>}</td>
            </tr>)}</tbody>
          </table></div> : <p className="draw-act__empty">Aún no hay extracciones registradas.</p>}

          {raffle?.drawProtocol !== 'legacy' && (
            <div className="draw-act__hashes">
              <div><span>Huella SHA-256 del acta</span><code>{proof.commitment}</code></div>
              <div><span>Firma de Drand</span><code>{proof.beaconSignature || 'Aún no disponible'}</code></div>
            </div>
          )}
          {raffle?.drawProtocol === 'legacy' ? (
            <p className="draw-act__notice">Esta acta es generada automáticamente a partir del registro del sorteo físico. La <strong>constatación notarial</strong> (validación humana) acredita formalmente que las tiradas registradas corresponden con los ganadores extraídos en el evento.</p>
          ) : (
            <p className="draw-act__notice">Esta acta es generada automáticamente y <strong>verificada criptográficamente</strong>. La huella permite detectar alteraciones en el padrón o en las reglas. La <strong>constatación notarial</strong> (validación humana) acredita formalmente el proceso, mientras que la verificación técnica garantiza que las tiradas no han sido manipuladas por software.</p>
          )}
          <div className="draw-act__attestations">
            <div className="draw-act__attestation draw-act__attestation--notary" style={proof.dossier?.status === 'validated' ? { borderColor: '#87d068', background: '#f6ffed' } : {}}>
              <span className="draw-act__attestation-mark" style={proof.dossier?.status === 'validated' ? { color: '#52c41a' } : {}}>{proof.dossier?.status === 'validated' ? 'CONSTATADO' : 'Pendiente'}</span>
              <strong style={proof.dossier?.status === 'validated' ? { color: '#237804' } : {}}>CONSTATACIÓN NOTARIAL</strong>
              <small style={proof.dossier?.status === 'validated' ? { color: '#389e0d' } : {}}>{proof.dossier?.certifierName ? `${proof.dossier.certifierRole || 'Certificador'}: ${proof.dossier.certifierName}` : 'Sin firma notarial asociada'}</small>
            </div>
            <div className={`draw-act__attestation draw-act__attestation--${status}`}>
              <span className="draw-act__attestation-mark">{status === 'valid' ? 'MISIO · VERIFICADO' : status === 'invalid' ? 'MISIO · REVISAR' : 'MISIO · PENDIENTE'}</span>
              <strong>COTEJO TÉCNICO MISIO.PE</strong>
              <small>{statusLabel} · SHA-256 y Drand</small>
            </div>
          </div>
        </article>
      </div>
    </Modal>
  );
}
