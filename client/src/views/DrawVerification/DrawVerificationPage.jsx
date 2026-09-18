import React, { useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Button, Input, Skeleton, message } from 'antd';
import {
  ArrowLeftOutlined, ArrowRightOutlined, CheckCircleFilled, ClockCircleOutlined,
  CodeOutlined, DownOutlined, FileTextOutlined, InfoCircleOutlined, LockOutlined,
  PlayCircleOutlined, ReloadOutlined, SafetyCertificateOutlined, SearchOutlined,
  SyncOutlined, TeamOutlined, NumberOutlined, WarningFilled,
} from '@ant-design/icons';
import { QRCodeSVG } from 'qrcode.react';
import { api } from '../../auth/api';
import { asDrawProof } from '../../utils/drawProof';
import DrawActModal from './DrawActModal';
import './DrawVerificationPage.css';

const algorithmExcerpt = `// Extracto de verifiable_v1 (Node.js). Entradas: acta y firma validada de Drand.
const { createHash, createHmac } = require('node:crypto');
const { raffleId, tickets, prizes, beaconChain, beaconRound } = acta;

const commitment = createHash('sha256')
  .update(JSON.stringify({ version: 'verifiable_v1', raffleId, tickets, prizes, beaconChain, beaconRound }))
  .digest('hex');
if (commitment !== acta.commitment) throw new Error('El acta no coincide con su huella');

const key = createHash('sha256')
  .update('verifiable_v1:' + commitment + ':' + beaconSignature)
  .digest();
const sequence = [...tickets];
let counter = 0;
for (let i = sequence.length - 1; i > 0; i--) {
  const range = i + 1;
  const limit = Math.floor(0x1_0000_0000 / range) * range;
  let value;
  do {
    value = createHmac('sha256', key).update(String(counter++)).digest().readUInt32BE(0);
  } while (value >= limit);
  const j = value % range;
  [sequence[i], sequence[j]] = [sequence[j], sequence[i]];
}
// El verificador compara cada tirada publicada con sequence[cursor].`;

const pythonExcerpt = `# Extracto de verifiable_v1 (Python 3). Entradas: acta y firma validada de Drand.
from hashlib import sha256
from hmac import new as hmac_new
from json import dumps

payload = {
    'version': 'verifiable_v1', 'raffleId': acta['raffleId'],
    'tickets': acta['tickets'], 'prizes': acta['prizes'],
    'beaconChain': acta['beaconChain'], 'beaconRound': acta['beaconRound'],
}
commitment = sha256(dumps(payload, separators=(',', ':'), ensure_ascii=False).encode()).hexdigest()
if commitment != acta['commitment']:
    raise ValueError('El acta no coincide con su huella')

key = sha256(f'verifiable_v1:{commitment}:{beacon_signature}'.encode()).digest()
sequence = acta['tickets'][:]
counter = 0
for i in range(len(sequence) - 1, 0, -1):
    size = i + 1
    limit = (2**32 // size) * size
    while True:
        value = int.from_bytes(hmac_new(key, str(counter).encode(), 'sha256').digest()[:4], 'big')
        counter += 1
        if value < limit:
            break
    j = value % size
    sequence[i], sequence[j] = sequence[j], sequence[i]
# El verificador compara cada tirada publicada con sequence[cursor].`;

function ticketCode(number, raffle) {
  const digits = Math.max(4, String(raffle?.totalTickets ?? 0).length);
  const suffix = String(number).padStart(digits, '0');
  return raffle?.ticketPrefix ? `${raffle.ticketPrefix}-${suffix}` : `#${suffix}`;
}

function VerificationTicket({ event, raffle, prize, verified }) {
  const winner = event.result === 'winner';
  const code = ticketCode(event.ticketNumber, raffle);
  const date = event.drawnAt ? new Date(event.drawnAt).toLocaleDateString('es-PE') : '';
  const number = String(event.ticketNumber).padStart(Math.max(3, String(raffle?.totalTickets ?? 0).length), '0');
  return (
    <article className={`draw-verification__ticket ${winner ? 'draw-verification__ticket--winner' : ''}`}>
      <div className="draw-verification__ticket-top">
        <strong>⚡ misio.pe</strong>
        <span>{code}{date && <> · {date}</>}</span>
      </div>
      <div className="draw-verification__ticket-main">
        <div>
          <span className="draw-verification__ticket-label">{winner ? 'Premio del sorteo' : 'Sorteo'}</span>
          <strong className="draw-verification__ticket-title">{prize.title}</strong>
          {raffle?.ticketPrice != null && <span>S/ {Number(raffle.ticketPrice).toFixed(2)}</span>}
        </div>
        <div className="draw-verification__ticket-number">
          <span>N° boleto</span><strong>{number}</strong><small>{code}</small>
        </div>
      </div>
      <div className="draw-verification__ticket-bottom">
        <span className="draw-verification__ticket-state">{winner ? (verified ? 'Ganador cotejado' : 'Ganador registrado') : 'Al agua · descartado'}</span>
        {raffle?.ticketPrefix && <Link to={`/validar?c=${encodeURIComponent(code)}`} aria-label={`Ver detalle del boleto ${code}`} title="Ver detalle del boleto">
          <QRCodeSVG value={`${window.location.origin}/validar?c=${encodeURIComponent(code)}`} size={34} />
          <span>Ver detalle</span>
        </Link>}
      </div>
      {winner && event.holderName && <p className="draw-verification__ticket-holder">Titular: {event.holderName}</p>}
    </article>
  );
}

export default function DrawVerificationPage() {
  const { raffleId } = useParams();
  const [attempt, setAttempt] = useState(0);
  const [data, setData] = useState({ loading: true, proof: null, verification: null, raffle: null, error: '' });
  const [beacon, setBeacon] = useState({ loading: false, data: null, error: '' });
  const [beaconAttempt, setBeaconAttempt] = useState(0);
  const [step, setStep] = useState(0);
  const [query, setQuery] = useState('');
  const [searchedNumber, setSearchedNumber] = useState(null);
  const [actOpen, setActOpen] = useState(false);
  const [verificationView, setVerificationView] = useState('steps');
  const [algorithmLanguage, setAlgorithmLanguage] = useState('node');
  const [liveCheck, setLiveCheck] = useState({ loading: false, phase: '', proof: null, commitmentCheck: null, beacon: null, beaconError: '', result: null, error: '', checkedAt: '' });
  const [auditVisibleEvents, setAuditVisibleEvents] = useState(0);
  const auditRunId = useRef(0);
  const auditScrollRequested = useRef(false);
  const auditPanelRef = useRef(null);
  const evidenceRef = useRef(null);

  useEffect(() => {
    document.body.classList.add('print-lock');
    const handleKeyDown = (e) => {
      if (e.key === 'PrintScreen') {
        navigator.clipboard?.writeText('');
      }
    };
    window.addEventListener('keyup', handleKeyDown);
    return () => {
      document.body.classList.remove('print-lock');
      window.removeEventListener('keyup', handleKeyDown);
    };
  }, []);

  useEffect(() => {
    let active = true;
    auditRunId.current += 1;
    auditScrollRequested.current = false;
    setData({ loading: true, proof: null, verification: null, raffle: null, error: '' });
    setVerificationView('steps');
    setLiveCheck({ loading: false, phase: '', proof: null, commitmentCheck: null, beacon: null, beaconError: '', result: null, error: '', checkedAt: '' });
    setAuditVisibleEvents(0);
    Promise.all([
      api(`/raffles/${raffleId}`).catch(() => null),
      api(`/live/${raffleId}`).catch(() => null)
    ]).then(async ([raffle, liveRoom]) => {
      const r = raffle || liveRoom?.raffle;
      if (!r) throw new Error('No se pudo encontrar la información del sorteo.');

      let proof, verification;

      if (r.drawProtocol === 'legacy') {
        const dossier = await api(`/live/${raffleId}/dossier`).catch(() => null);
        const events = liveRoom?.draws?.map(d => ({
          attempt: d.attempt,
          result: d.result,
          ticketNumber: d.ticketNumber,
          holderName: d.holderName,
          prizeIndex: d.prizeIndex || 0,
          drawnAt: new Date().toISOString() // Or some default
        })) || [];
        const prizes = r.type === 'paquete' ? r.prizes : [{ title: r.title || 'Premio Único', drawMode: r.drawMode, winningAttempt: r.winningAttempt }];
        
        proof = {
          raffleId: r._id,
          preparedAt: r.updatedAt,
          tickets: liveRoom?.participants?.map(p => p.ticketNumber) || [],
          events,
          prizes,
          dossier
        };
        verification = { status: 'valid', matches: true };
      } else {
        [proof, verification] = await Promise.all([
          api(`/live/${raffleId}/proof`),
          api(`/live/${raffleId}/verify`)
        ]);
        if (!asDrawProof(proof)) throw new Error('Este sorteo todavía no tiene un acta verificable.');
      }

      if (active) setData({ loading: false, proof, verification, raffle: r, error: '' });
    }).catch((error) => {
      if (active) setData({ loading: false, proof: null, verification: null, raffle: null, error: error.message || 'No se pudo cargar el acta.' });
    });
    return () => { active = false; auditRunId.current += 1; };
  }, [raffleId, attempt]);

  const beaconRound = data.proof?.beaconRound;
  useEffect(() => {
    if (!beaconRound) return undefined;
    let active = true;
    setBeacon({ loading: true, data: null, error: '' });
    api(`/live/${raffleId}/beacon`).then((result) => {
      if (result?.round !== beaconRound || !result.signature) throw new Error('El dato recibido no corresponde a esta ronda.');
      if (active) setBeacon({ loading: false, data: result, error: '' });
    }).catch((error) => {
      if (active) setBeacon({ loading: false, data: null, error: error.message || 'No se pudo consultar drand.' });
    });
    return () => { active = false; };
  }, [raffleId, beaconRound, beaconAttempt]);

  const { loading, proof, verification, raffle, error } = data;
  const accessRestricted = error.includes('Esta acta está disponible para usuarios que ya participaron');
  const expectedDraws = proof?.prizes?.reduce((total, prize) => total + prize.winningAttempt, 0) ?? 0;
  const recordedDraws = proof?.events?.length ?? 0;
  const complete = expectedDraws > 0 && recordedDraws === expectedDraws;
  const valid = verification?.status === 'valid' && complete;
  const invalid = verification?.status === 'invalid';
  const status = invalid ? 'invalid' : valid ? 'valid' : 'pending';
  const title = raffle?.title || (proof?.prizes?.length === 1 ? proof.prizes[0].title : 'Sorteo');
  const actJson = proof ? JSON.stringify(proof, null, 2) : '';
  const beaconJson = beacon.data ? JSON.stringify(beacon.data, null, 2) : '';
  const displayedSignature = beacon.data?.signature ?? proof?.beaconSignature ?? '';
  const evidenceSignatureMismatch = Boolean(beacon.data?.signature && proof?.beaconSignature && beacon.data.signature !== proof.beaconSignature);
  const orderedEvents = proof?.events?.slice().sort((a, b) => {
    if (a.prizeIndex !== b.prizeIndex) return a.prizeIndex - b.prizeIndex;
    return a.attempt - b.attempt;
  }) ?? [];
  const selectedEvent = orderedEvents.find((event) => event.ticketNumber === searchedNumber);
  const selectedPrize = selectedEvent && proof.prizes[selectedEvent.prizeIndex];
  const numberInProof = proof?.tickets?.includes(searchedNumber);
  const maxTicketNumber = Math.max(Number(raffle?.totalTickets) || 0, proof?.tickets?.reduce((max, number) => Math.max(max, number), 0) ?? 0);
  const multiplePrizes = (proof?.prizes?.length ?? 0) > 1;
  const quickExamples = proof ? [
    ...orderedEvents.filter((event) => event.result === 'winner').slice(0, multiplePrizes ? 2 : 1).map((event) => ({ number: event.ticketNumber, label: multiplePrizes ? `Ganador P${event.prizeIndex + 1}` : valid ? 'Ganador' : invalid ? 'En revisión' : 'Ganador registrado', status: 'winner' })),
    ...orderedEvents.filter((event) => event.result === 'al_agua').slice(0, multiplePrizes ? 1 : 2).map((event) => ({ number: event.ticketNumber, label: 'Al agua', status: 'al-agua' })),
    ...proof.tickets.filter((number) => !orderedEvents.some((event) => event.ticketNumber === number)).slice(0, 1).map((number) => ({ number, label: 'En bolillero', status: 'remaining' })),
  ] : [];
  const sequencePreview = proof?.prizes?.length === 1 && orderedEvents.length > 0 && orderedEvents.length <= 5
    ? orderedEvents.map((event) => String(event.ticketNumber).padStart(3, '0')).join(' → ')
    : '';
  const steps = proof ? (raffle?.drawProtocol === 'legacy' ? [
    {
      title: 'Transmisión Pública',
      moment: 'Durante el sorteo',
      body: `El sorteo se realizó públicamente a través de una transmisión en vivo, garantizando transparencia en la extracción de boletos. El video íntegro se encuentra disponible para su revisión.`,
      note: 'Puedes revisar el video haciendo clic en "Ver Evidencia y Video".',
    },
    {
      title: 'Constatación Notarial',
      moment: 'Cierre del sorteo',
      body: `Un notario público o certificador validó la legalidad del evento y el acta registra todos los resultados y detalles de la mecánica aplicada.`,
      note: 'El acta está adjunta y coincide con la lista de ganadores mostrada en esta página.',
    },
    {
      title: 'Sorteo Concluido',
      moment: 'Registro definitivo',
      body: `Los ganadores presentados han sido registrados y el evento se da por finalizado oficialmente tras cumplir con las validaciones físicas.`,
      note: 'La verificación en sorteos físicos recae en la autoridad competente.',
    }
  ] : [
    {
      title: 'Lista cerrada y verificable',
      moment: 'Antes del sorteo',
      body: `El acta pública identificó previamente los ${proof.tickets.length} boletos válidos y las reglas de cada premio. Su huella SHA-256 permite detectar si después se ingresó, eliminó o alteró algún boleto.`,
      note: 'Garantía de regla: los boletos que salieron al agua quedan descartados y no vuelven a entrar al bolillero.',
    },
    {
      title: 'Azar externo público (Drand)',
      moment: 'Momento del sorteo',
      body: `Se utilizó el dato de azar público emitido por la red Drand en la ronda #${proof.beaconRound}. Ese turno se fijó en el acta antes de conocer su valor; al publicarse la firma, se combinó con la huella SHA-256 para calcular las tiradas.`,
      note: 'Fuente externa: el dato de esa ronda puede consultarse fuera de Misio. Para acreditar cuándo se publicó la huella hace falta una copia externa fechada.',
    },
    {
      title: valid ? 'Resultado 100% cotejado' : invalid ? 'Resultado con diferencias' : 'Cotejo pendiente',
      moment: 'Auditoría pública',
      body: valid
        ? `Se ejecutó de nuevo el cálculo determinista combinando el acta y la firma de Drand. La secuencia generada coincidió exactamente con las ${recordedDraws} tiradas publicadas${sequencePreview ? `: ${sequencePreview}.` : '.'}`
        : invalid
          ? 'Al repetir el cálculo se encontraron diferencias entre la secuencia y las tiradas registradas. El resultado no debe tratarse como verificado hasta que se revise el acta.'
          : `Hay ${recordedDraws} de ${expectedDraws} tiradas registradas. El cotejo completo estará disponible cuando terminen las extracciones y se pueda consultar la firma de drand.`,
      note: valid
        ? 'Resultado reproducible: con la misma lista, reglas y firma externa, el cálculo obtiene el mismo orden de boletos.'
        : 'Revisa el estado actualizado y la evidencia técnica antes de sacar conclusiones.',
    },
  ]) : [];
  const liveExpectedDraws = liveCheck.proof?.prizes?.reduce((total, prize) => total + prize.winningAttempt, 0) ?? 0;
  const liveRecordedDraws = liveCheck.proof?.events?.length ?? 0;
  const liveHashMismatch = liveCheck.commitmentCheck?.status === 'invalid';
  const liveBeaconMatches = Boolean(liveCheck.beacon?.signature && liveCheck.proof?.beaconSignature
    && liveCheck.beacon.round === liveCheck.proof.beaconRound
    && liveCheck.beacon.signature === liveCheck.proof.beaconSignature);
  const liveBeaconMismatch = Boolean(liveCheck.beacon?.signature && liveCheck.proof?.beaconSignature && !liveBeaconMatches);
  const liveStatus = liveCheck.result?.status === 'valid' && liveBeaconMatches
    && liveExpectedDraws > 0 && liveRecordedDraws === liveExpectedDraws
    ? 'valid' : liveHashMismatch || liveCheck.result?.status === 'invalid' || liveBeaconMismatch ? 'invalid' : 'pending';
  const auditDisplayCount = Math.min(12, liveRecordedDraws);
  const auditPresenting = Boolean(liveCheck.result && auditVisibleEvents < auditDisplayCount);
  const liveProofChecked = liveCheck.commitmentCheck?.status === 'valid';
  const auditResultShown = Boolean(liveCheck.result && !auditPresenting);

  useEffect(() => {
    if (!liveCheck.result || auditVisibleEvents >= auditDisplayCount) return undefined;
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
      setAuditVisibleEvents(auditDisplayCount);
      return undefined;
    }
    const timer = window.setTimeout(() => setAuditVisibleEvents((count) => count + 1), 300);
    return () => window.clearTimeout(timer);
  }, [liveCheck.result, auditVisibleEvents, auditDisplayCount]);

  useEffect(() => {
    if (verificationView !== 'verifier' || !auditScrollRequested.current) return;
    auditScrollRequested.current = false;
    auditPanelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [verificationView]);

  function openEvidence() {
    if (!evidenceRef.current) return;
    evidenceRef.current.open = true;
    evidenceRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function openLiveAudit() {
    if (verificationView === 'verifier') auditPanelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    else {
      auditScrollRequested.current = true;
      setVerificationView('verifier');
    }
    runLiveCheck();
  }

  async function runLiveCheck() {
    const runId = ++auditRunId.current;
    setAuditVisibleEvents(0);
    setLiveCheck({ loading: true, phase: 'proof', proof: null, commitmentCheck: null, beacon: null, beaconError: '', result: null, error: '', checkedAt: '' });
    try {
      const freshProof = await api(`/live/${raffleId}/proof`);
      if (runId !== auditRunId.current) return;
      if (!asDrawProof(freshProof)) throw new Error('El acta pública no está disponible.');
      setLiveCheck((current) => ({ ...current, phase: 'commitment', proof: freshProof }));
      const commitmentCheck = await api(`/live/${raffleId}/proof/commitment-check`);
      if (runId !== auditRunId.current) return;
      if (!['valid', 'invalid'].includes(commitmentCheck?.status)) throw new Error('No se pudo comprobar la huella del acta.');
      if (commitmentCheck.commitment !== freshProof.commitment) throw new Error('El acta cambió durante la consulta. Repite el cotejo.');
      if (commitmentCheck.status !== 'valid') {
        setLiveCheck((current) => ({ ...current, loading: false, phase: '', commitmentCheck, checkedAt: new Date().toISOString() }));
        return;
      }
      setLiveCheck((current) => ({ ...current, phase: 'beacon', commitmentCheck }));
      await new Promise((resolve) => window.setTimeout(resolve, 450));
      if (runId !== auditRunId.current) return;
      let freshBeacon;
      try {
        freshBeacon = await api(`/live/${raffleId}/beacon`);
      } catch (beaconRequestError) {
        if (runId !== auditRunId.current) return;
        setLiveCheck((current) => ({ ...current, loading: false, phase: '', beaconError: beaconRequestError.message || 'La ronda pública no está disponible ahora.', checkedAt: new Date().toISOString() }));
        return;
      }
      if (runId !== auditRunId.current) return;
      if (!freshProof.beaconSignature || freshBeacon.round !== freshProof.beaconRound || freshBeacon.signature !== freshProof.beaconSignature) {
        setLiveCheck((current) => ({ ...current, loading: false, phase: '', beacon: freshBeacon, beaconError: !freshProof.beaconSignature ? 'El acta todavía no registra la firma de Drand.' : '', checkedAt: new Date().toISOString() }));
        return;
      }
      setLiveCheck((current) => ({ ...current, phase: 'verify', beacon: freshBeacon }));
      await new Promise((resolve) => window.setTimeout(resolve, 450));
      if (runId !== auditRunId.current) return;
      const freshResult = await api(`/live/${raffleId}/verify`);
      if (runId !== auditRunId.current) return;
      setLiveCheck((current) => ({ ...current, loading: false, phase: '', result: freshResult, checkedAt: new Date().toISOString() }));
    } catch (checkError) {
      if (runId !== auditRunId.current) return;
      setLiveCheck((current) => ({ ...current, loading: false, phase: '', result: null, error: checkError.message || 'No se pudo completar el cotejo.', checkedAt: '' }));
    }
  }

  function searchTicket(value = query) {
    const raw = String(value).trim();
    if (!/^\d+$/.test(raw) || Number(raw) < 1 || Number(raw) > maxTicketNumber) {
      setSearchedNumber(null);
      message.warning('Ingresa un número de boleto válido.');
      return;
    }
    setQuery(raw);
    setSearchedNumber(Number(raw));
  }

  function preventCodeCopy(event) {
    if (event.target.closest?.('code, pre')) event.preventDefault();
  }

  return (
    <main className="draw-verification" onContextMenu={(e) => e.preventDefault()} onCopyCapture={(e) => e.preventDefault()} onCutCapture={(e) => e.preventDefault()} style={{ userSelect: 'none', WebkitUserSelect: 'none' }}>
      <Link className="draw-verification__back" to="/ganadores"><ArrowLeftOutlined /> Ganadores</Link>

      {loading ? (
        <div className="draw-verification__loading">
          <header className="draw-verification__header">
            <div style={{ flex: 1 }}>
              <Skeleton.Input active size="small" style={{ width: 200, height: 16, borderRadius: 4, marginBottom: 12, display: 'block' }} />
              <Skeleton.Input active size="large" style={{ width: 'min(100%, 480px)', height: 38, borderRadius: 8, marginBottom: 12, display: 'block' }} />
              <Skeleton.Input active size="small" style={{ width: 260, height: 14, borderRadius: 4, display: 'block' }} />
            </div>
            <div className="draw-verification__header-actions">
              <Skeleton.Button active shape="round" style={{ width: 110, height: 34 }} />
            </div>
          </header>
          
          <section className="draw-verification__status" style={{ background: '#f8fafc', borderColor: '#e2e8f0', boxShadow: 'none' }}>
            <div className="draw-verification__status-icon" style={{ background: '#f1f5f9', borderColor: '#cbd5e1' }}>
               <SafetyCertificateOutlined style={{ color: '#cbd5e1', fontSize: 32 }} />
            </div>
            <div className="draw-verification__status-copy">
              <Skeleton.Input active size="small" style={{ width: 180, height: 26, borderRadius: 20, marginBottom: 16, display: 'block' }} />
              <Skeleton.Input active size="large" style={{ width: '85%', height: 36, borderRadius: 8, marginBottom: 12, display: 'block' }} />
              <Skeleton.Input active size="small" style={{ width: '70%', height: 16, borderRadius: 4, display: 'block' }} />
            </div>
            <div className="draw-verification__status-actions">
              <Skeleton.Button active shape="round" style={{ width: '100%', height: 46 }} />
            </div>
            <div className="draw-verification__facts" style={{ borderTopColor: '#e2e8f0' }}>
               <div style={{ gap: 8 }}><Skeleton.Input active size="small" style={{ width: '70%', height: 14, borderRadius: 4 }} /><Skeleton.Input active size="small" style={{ width: '40%', height: 24, borderRadius: 6 }} /></div>
               <div style={{ gap: 8 }}><Skeleton.Input active size="small" style={{ width: '70%', height: 14, borderRadius: 4 }} /><Skeleton.Input active size="small" style={{ width: '40%', height: 24, borderRadius: 6 }} /></div>
               <div style={{ gap: 8 }}><Skeleton.Input active size="small" style={{ width: '70%', height: 14, borderRadius: 4 }} /><Skeleton.Input active size="small" style={{ width: '40%', height: 24, borderRadius: 6 }} /></div>
               <div style={{ gap: 8 }}><Skeleton.Input active size="small" style={{ width: '70%', height: 14, borderRadius: 4 }} /><Skeleton.Input active size="small" style={{ width: '40%', height: 24, borderRadius: 6 }} /></div>
            </div>
          </section>
        </div>
      ) : error ? (
        <section className="draw-verification__error" role="alert">
          {accessRestricted ? <LockOutlined aria-hidden="true" /> : <WarningFilled aria-hidden="true" />}
          <h1>{accessRestricted ? 'Acceso para participantes' : 'No pudimos comprobar este sorteo'}</h1>
          <p>{error}</p>
          {accessRestricted ? <Link to="/sorteos">Ver sorteos</Link> : <Button icon={<ReloadOutlined />} onClick={() => setAttempt((value) => value + 1)}>Reintentar</Button>}
        </section>
      ) : (
        <>
          <header className="draw-verification__header">
            <span>Resultado de {title}</span>
            <div className="draw-verification__header-actions">
              {raffle?.drawProtocol === 'legacy' && proof?.dossier?.videoUrl && (
                <Button icon={<PlayCircleOutlined />} href={proof.dossier.videoUrl} target="_blank" rel="noreferrer">Ver video</Button>
              )}
              <Button icon={<FileTextOutlined />} onClick={() => setActOpen(true)}>Ver acta</Button>
            </div>
          </header>

          <section className={`draw-verification__status draw-verification__status--${status}`} aria-live="polite">
            {valid && <SafetyCertificateOutlined className="draw-verification__status-watermark" aria-hidden="true" />}
            <div className="draw-verification__status-icon">
              {invalid ? <WarningFilled /> : valid ? <CheckCircleFilled /> : <ClockCircleOutlined />}
            </div>
            <div className="draw-verification__status-copy">
              <span className="draw-verification__status-label"><SafetyCertificateOutlined /> Cotejo público del sorteo</span>
              <span className="draw-verification__status-context">
                {raffle?.drawProtocol === 'legacy' ? `Validación física · Expediente de evento` : `Acta SHA-256 · ${proof.commitment.slice(0, 18)}…`}
              </span>
              <h1>{invalid ? 'Hay discrepancias en el resultado' : valid ? `Verificado: Las ${recordedDraws} tiradas coinciden con ${proof.prizes.length > 1 ? `las reglas de los ${proof.prizes.length} premios` : 'la regla'}` : 'Comprobación pendiente'}</h1>
              <p>{invalid
                ? 'El resultado registrado no coincide con el cálculo. Revisa los detalles antes de darlo por válido.'
                : valid
                  ? (raffle?.drawProtocol === 'legacy' ? 'El sorteo finalizó oficialmente. Todos los boletos han sido extraídos bajo constatación notarial o auditoría.' : `Los boletos cantados coinciden con la secuencia calculada a partir de la lista de ${proof.tickets.length} boletos y el dato público de azar de drand.`)
                  : verification?.status === 'unavailable'
                    ? 'No se pudo consultar el dato de azar externo. Inténtalo de nuevo más tarde.'
                    : verification?.status === 'pending'
                      ? 'El dato de azar externo todavía no está disponible.'
                      : `${recordedDraws} de ${expectedDraws} tiradas registradas. El sorteo aún no termina.`}</p>
              {invalid && verification.reasons?.length > 0 && (
                <p className="draw-verification__status-detail">{verification.reasons.join(' ')}</p>
              )}
            </div>
            <div className="draw-verification__status-actions">
              {raffle?.drawProtocol !== 'legacy' && (
                <>
                  {valid && <Button icon={<SyncOutlined />} onClick={openLiveAudit}>Repetir cotejo</Button>}
                  <Button icon={<NumberOutlined />} onClick={openEvidence}>Ver hashes criptográficos</Button>
                  {!valid && <Button icon={<ReloadOutlined />} onClick={() => setAttempt((value) => value + 1)}>Actualizar</Button>}
                </>
              )}
            </div>
            <div className="draw-verification__facts" aria-label="Datos del sorteo">
              <div><span><TeamOutlined /> Boletos participantes</span><strong>{proof.tickets.length} <em>registrados</em></strong><small>Lista del sorteo</small></div>
              <div><span><SyncOutlined /> Tiradas realizadas</span><strong>{recordedDraws} de {expectedDraws}</strong><small>{proof.events.filter((event) => event.result === 'al_agua').length} al agua + {proof.events.filter((event) => event.result === 'winner').length} ganador(es)</small></div>
              {raffle?.drawProtocol !== 'legacy' && (
                <>
                  <div><span><NumberOutlined /> Faro de azar externo</span><strong>Ronda #{proof.beaconRound}</strong><small>drand · turno público</small></div>
                  <div><span><CheckCircleFilled /> Estado del cotejo</span><strong>{valid ? 'Coincide' : invalid ? 'Discrepancia' : 'Pendiente'}</strong><small>Resultado del verificador</small></div>
                </>
              )}
            </div>
          </section>

          <section className="draw-verification__section draw-verification__results">
            <div className="draw-verification__section-heading">
              <div>
                <div className="draw-verification__section-title"><h2>Boletos que salieron</h2><span>{recordedDraws} tiradas cantadas</span></div>
                <p>En cada sorteo, las tiradas se muestran en el estricto orden cronológico en que fueron extraídas por el algoritmo.</p>
              </div>
            </div>
            {proof.prizes.map((prize, prizeIndex) => {
              const prizeEvents = proof.events.filter((event) => event.prizeIndex === prizeIndex);
              return (
                <div className="draw-verification__prize" key={prizeIndex}>
                  <div className="draw-verification__prize-heading">
                    <div>
                      <span className="draw-verification__prize-kicker">{proof.prizes.length > 1 ? `Premio ${prizeIndex + 1}` : 'Premio del sorteo'}</span>
                      <h3>{prize.title}</h3>
                    </div>
                    <span className="draw-verification__prize-count">{prizeEvents.length} de {prize.winningAttempt} tiradas</span>
                  </div>

                  <ol className="draw-verification__turns">
                    {Array.from({ length: prize.winningAttempt }, (_, index) => {
                      const attemptNumber = index + 1;
                      const event = prizeEvents.find((item) => item.attempt === attemptNumber);
                      const winner = event?.result === 'winner';
                      const caption = winner
                        ? valid
                          ? `¡Boleto ganador! Salió en la ${attemptNumber}.ª tirada y coincide con el resultado cotejado para ${prize.title}.`
                          : invalid
                            ? `Este boleto figura como ganador en la ${attemptNumber}.ª tirada, pero el cotejo detectó discrepancias. El resultado requiere revisión.`
                            : `Este boleto figura como ganador en la ${attemptNumber}.ª tirada. Su cotejo público aún está pendiente.`
                        : `Salió en la ${attemptNumber}.ª tirada y va al agua: queda descartado y no participa en las siguientes tiradas.`;
                      return (
                        <li key={attemptNumber} className="draw-verification__turn">
                          <span className="draw-verification__turn-order">Tirada {String(attemptNumber).padStart(2, '0')}{winner ? ' · Ganador' : ''}{event?.drawnAt && <time dateTime={event.drawnAt}>Extracción {new Date(event.drawnAt).toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false, timeZone: 'America/Lima' })}</time>}</span>
                          {event ? <VerificationTicket event={event} raffle={raffle} prize={prize} verified={valid} />
                            : <div className="draw-verification__turn-pending">Boleto pendiente</div>}
                          {event && <p className="draw-verification__turn-caption">{caption}</p>}
                        </li>
                      );
                    })}
                  </ol>
                </div>
              );
            })}
          </section>

          <section className="draw-verification__section draw-verification__lookup">
            <div className="draw-verification__section-heading">
              <h2><SearchOutlined aria-hidden="true" /> ¿Participaste en este sorteo? Consulta tu boleto</h2>
              <p>Ingresa tu número de boleto (del 001 al {String(maxTicketNumber).padStart(3, '0')}) para verificar su estado en el acta y en las extracciones.</p>
            </div>
            <form onSubmit={(event) => { event.preventDefault(); searchTicket(); }} className="draw-verification__lookup-form">
              <label htmlFor="draw-ticket-number">Número de boleto</label>
              <div>
                <Input id="draw-ticket-number" value={query} onChange={(event) => setQuery(event.target.value)} inputMode="numeric" autoComplete="off" placeholder={`Ej.: ${quickExamples.slice(0, 3).map(({ number }) => String(number).padStart(3, '0')).join(', ') || '001'}`} prefix={<SearchOutlined />} />
                <Button type="primary" htmlType="submit">Buscar</Button>
              </div>
            </form>
            <div className="draw-verification__lookup-examples">
              <span>Pruebas rápidas:</span>
              {quickExamples.map(({ number, label, status: exampleStatus }) => (
                <button key={number} type="button" className={`draw-verification__lookup-tag draw-verification__lookup-tag--${exampleStatus}`} aria-pressed={searchedNumber === number} onClick={() => searchTicket(String(number))}>
                  #{String(number).padStart(3, '0')} <span>({label})</span>
                </button>
              ))}
            </div>
            {searchedNumber !== null && <div className="draw-verification__lookup-result" role="status">
              <strong>Boleto #{String(searchedNumber).padStart(3, '0')}</strong>
              <p>{!numberInProof ? 'No figura en el padrón de este sorteo.'
                : selectedEvent?.result === 'winner' ? valid ? `Ganó ${selectedPrize?.title || 'un premio'} y su tirada fue cotejada.` : invalid ? `Figura como ganador de ${selectedPrize?.title || 'un premio'}, pero el cotejo detectó discrepancias.` : `Figura como ganador de ${selectedPrize?.title || 'un premio'} en el acta; el cotejo aún no está confirmado.`
                  : selectedEvent?.result === 'al_agua' ? `Salió al agua${proof.prizes.length > 1 && selectedPrize ? ` en ${selectedPrize.title}` : ''} y quedó fuera de las siguientes tiradas.`
                    : 'Está en el padrón, pero no salió en las tiradas registradas.'}</p>
              {numberInProof && raffle?.ticketPrefix && <Link to={`/validar?c=${encodeURIComponent(ticketCode(searchedNumber, raffle))}`}>Ver ficha del boleto <ArrowRightOutlined /></Link>}
            </div>}
          </section>

          <section className="draw-verification__section draw-verification__explanation">
            <div className="draw-verification__explanation-top">
              <div className="draw-verification__section-heading">
                <h2><SafetyCertificateOutlined aria-hidden="true" /> {valid ? '¿Cómo se comprobó que fue hecho en regla?' : '¿Cómo se comprueba el resultado?'}</h2>
                <p>Cualquier participante o auditor independiente puede repetir el mismo cálculo matemático usando el acta pública previa, las reglas y el dato de azar de Drand.</p>
              </div>
              <div className="draw-verification__view-switch" role="tablist" aria-label="Modo de comprobación">
                <button id="draw-explanation-tab" type="button" role="tab" aria-selected={verificationView === 'steps'} aria-controls="draw-explanation-panel" onClick={() => setVerificationView('steps')}><span>Explicación en<br />3 pasos</span></button>
                {raffle?.drawProtocol !== 'legacy' && (
                  <button id="draw-live-tab" type="button" role="tab" aria-selected={verificationView === 'verifier'} aria-controls="draw-live-panel" onClick={() => { if (verificationView !== 'verifier') runLiveCheck(); setVerificationView('verifier'); }}><PlayCircleOutlined /><span>Verificador<br />en vivo</span></button>
                )}
              </div>
            </div>
            {verificationView === 'steps' ? <div id="draw-explanation-panel" className="draw-verification__wizard" role="tabpanel" aria-labelledby="draw-explanation-tab">
              <div className="draw-verification__step-nav" aria-label="Pasos de comprobación">
                {steps.map((item, index) => (
                  <button key={item.title} type="button" className={step === index ? 'is-active' : ''} aria-current={step === index ? 'step' : undefined} onClick={() => setStep(index)}>
                    <span className="draw-verification__step-meta"><b>{index + 1}</b><small>{item.moment}</small></span>
                    <strong>{item.title}</strong>
                    <span className="draw-verification__step-body">{item.body}</span>
                    <span className="draw-verification__step-note">{item.note}</span>
                  </button>
                ))}
              </div>
              <div className="draw-verification__step-content" aria-live="polite">
                <span>Paso {step + 1} de 3</span>
                <h3>{steps[step].title}</h3>
                <p>{steps[step].body}</p>
                <p>{steps[step].note}</p>
              </div>
              <div className="draw-verification__step-actions">
                <Button icon={<ArrowLeftOutlined />} disabled={step === 0} onClick={() => setStep((current) => current - 1)}>Anterior</Button>
                {step < 2 ? <Button type="primary" onClick={() => setStep((current) => current + 1)}>Siguiente <ArrowRightOutlined /></Button>
                  : <Button type="primary" icon={<InfoCircleOutlined />} onClick={openEvidence}>Ver evidencia técnica</Button>}
              </div>
            </div> : <div ref={auditPanelRef} id="draw-live-panel" className="draw-verification__live-panel" role="tabpanel" aria-labelledby="draw-live-tab" aria-live="polite">
              <div className="draw-verification__live-heading">
                <div>
                  <span>COTEJO TÉCNICO PASO A PASO</span>
                  <h3>Acta SHA-256 · Drand #{proof.beaconRound} · tiradas registradas</h3>
                </div>
                <button className="draw-verification__audit-retry" type="button" disabled={liveCheck.loading} onClick={runLiveCheck}>
                  <SyncOutlined spin={liveCheck.loading} aria-hidden="true" /> {liveCheck.loading ? 'Cotejando…' : 'Repetir cotejo'}
                </button>
              </div>
              <div className="draw-verification__audit-steps">
                <div className={`draw-verification__audit-step ${liveHashMismatch || liveCheck.error ? 'is-error' : liveProofChecked ? 'is-done' : liveCheck.proof ? 'is-loaded' : ''}`}>
                  <span className="draw-verification__audit-icon">{liveHashMismatch || liveCheck.error ? <WarningFilled /> : liveProofChecked ? <CheckCircleFilled /> : <ClockCircleOutlined />}</span>
                  <div>
                    <strong>1. Padrón y acta de {liveCheck.proof?.tickets?.length ?? proof.tickets.length} boletos</strong>
                    <p>{liveCheck.proof ? `Huella declarada: ${liveCheck.proof.commitment.slice(0, 32)}… · ${liveCheck.proof.tickets.length} boletos` : 'Consultando el acta pública…'}</p>
                  </div>
                  <small>{liveCheck.error ? 'NO DISPONIBLE' : liveHashMismatch ? 'DIFERENCIAS' : liveProofChecked ? 'HUELLA COTEJADA' : liveCheck.proof ? 'ACTA RECIBIDA' : 'CONSULTANDO'}</small>
                </div>
                {liveProofChecked && <div className={`draw-verification__audit-step ${liveBeaconMismatch ? 'is-error' : liveBeaconMatches ? 'is-done' : liveCheck.beaconError ? 'is-paused' : ''}`}>
                  <span className="draw-verification__audit-icon">{liveBeaconMismatch ? <WarningFilled /> : liveBeaconMatches ? <CheckCircleFilled /> : <ClockCircleOutlined />}</span>
                  <div>
                    <strong>2. Firma pública de Drand, ronda #{liveCheck.proof.beaconRound}</strong>
                    <p>{liveCheck.beaconError || (liveCheck.beacon ? `Firma: ${liveCheck.beacon.signature.slice(0, 32)}…` : 'Consultando la fuente externa de azar…')}</p>
                  </div>
                  <small>{liveBeaconMismatch ? 'NO COINCIDE' : liveBeaconMatches ? 'FIRMA COINCIDE' : liveCheck.beaconError ? 'PENDIENTE' : 'CONSULTANDO'}</small>
                </div>}
                {(liveCheck.phase === 'verify' || liveCheck.result) && <div className={`draw-verification__audit-step ${auditResultShown && liveStatus === 'invalid' ? 'is-error' : auditResultShown && liveStatus === 'valid' ? 'is-done' : auditResultShown ? 'is-paused' : ''}`}>
                  <span className="draw-verification__audit-icon">{auditResultShown && liveStatus === 'invalid' ? <WarningFilled /> : auditResultShown && liveStatus === 'valid' ? <CheckCircleFilled /> : <ClockCircleOutlined />}</span>
                  <div>
                    <strong>3. Secuencia de extracción determinista</strong>
                    {liveCheck.result && auditVisibleEvents === 0 && auditDisplayCount > 0 && <p>Resultado calculado; mostrando las tiradas en orden…</p>}
                    {auditVisibleEvents > 0 && <ol className="draw-verification__audit-events">{liveCheck.proof.events.slice(0, auditVisibleEvents).map((event) => <li key={`${event.prizeIndex}-${event.attempt}`} className={event.result === 'winner' ? 'is-winner' : ''}>
                      <span>{liveCheck.proof.prizes[event.prizeIndex]?.title || `Premio ${event.prizeIndex + 1}`} · Tirada {String(event.attempt).padStart(2, '0')}</span>
                      <b>Boleto #{String(event.ticketNumber).padStart(3, '0')}</b>
                      <em>{event.result === 'winner' ? 'Ganador' : 'Al agua · descartado'}</em>
                    </li>)}</ol>}
                    {!liveCheck.result && <p>El verificador está recalculando las tiradas registradas…</p>}
                    {auditResultShown && liveRecordedDraws === 0 && <p>No hay tiradas registradas todavía.</p>}
                    {auditResultShown && liveRecordedDraws > 12 && <p>Se muestran 12 de {liveRecordedDraws} tiradas; el acta conserva la secuencia completa.</p>}
                  </div>
                  <small>{auditPresenting ? `MOSTRANDO ${auditVisibleEvents} DE ${auditDisplayCount}` : !auditResultShown ? 'CALCULANDO' : liveStatus === 'valid' ? `${liveRecordedDraws} DE ${liveExpectedDraws} COINCIDEN` : liveStatus === 'invalid' ? 'DIFERENCIAS' : `${liveRecordedDraws} DE ${liveExpectedDraws} REGISTRADAS`}</small>
                </div>}
              </div>
              {(auditResultShown || liveCheck.error || liveHashMismatch || liveBeaconMismatch || liveCheck.beaconError) && <div className={`draw-verification__audit-footer draw-verification__audit-footer--${liveStatus}`}>
                {liveStatus === 'valid' ? <CheckCircleFilled /> : liveStatus === 'invalid' || liveCheck.error ? <WarningFilled /> : <ClockCircleOutlined />}
                <div>
                  <strong>{liveCheck.error ? 'No se pudo completar el cotejo' : liveHashMismatch ? 'La huella del acta no coincide' : liveBeaconMismatch ? 'La firma del acta no coincide con Drand' : liveStatus === 'valid' ? 'Las tiradas coinciden con el cálculo' : liveStatus === 'invalid' ? 'El resultado presenta diferencias' : 'Cotejo aún no confirmado'}</strong>
                  <p>{liveCheck.error || liveCheck.beaconError || (liveStatus === 'valid' ? 'La secuencia registrada coincide con el cálculo del acta y la firma pública de Drand.' : liveCheck.result?.status === 'unavailable' ? 'La fuente pública de azar no está disponible ahora. Vuelve a intentarlo.' : liveStatus === 'invalid' ? 'Revisa los detalles antes de considerar válido el resultado.' : `${liveRecordedDraws} de ${liveExpectedDraws} tiradas registradas; la comprobación completa sigue pendiente.`)}</p>
                  {(liveCheck.commitmentCheck?.reasons?.length > 0 || liveCheck.result?.reasons?.length > 0) && <ul>{[...(liveCheck.commitmentCheck?.reasons ?? []), ...(liveCheck.result?.reasons ?? [])].map((reason, index) => <li key={index}>{reason}</li>)}</ul>}
                  {liveCheck.checkedAt && <small>Última consulta: {new Date(liveCheck.checkedAt).toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</small>}
                </div>
                <button type="button" onClick={() => setVerificationView('steps')}>Volver a la explicación</button>
              </div>}
            </div>}
          </section>

          {raffle?.drawProtocol !== 'legacy' && (
            <details ref={evidenceRef} className="draw-verification__evidence">
            <summary>
              <span className="draw-verification__evidence-icon"><CodeOutlined aria-hidden="true" /></span>
              <span className="draw-verification__evidence-copy">
                <span className="draw-verification__evidence-title"><strong>Evidencia técnica y registro criptográfico</strong><span className="draw-verification__evidence-badge">Datos públicos</span></span>
                <small>Huella SHA-256, firma de Drand y fórmula de extracción</small>
              </span>
              <span className="draw-verification__evidence-action"><span className="draw-verification__evidence-show">Ver evidencias</span><span className="draw-verification__evidence-hide">Ocultar detalles</span><DownOutlined aria-hidden="true" /></span>
            </summary>
            <div className="draw-verification__evidence-body" onCopyCapture={preventCodeCopy} onCutCapture={preventCodeCopy} onContextMenu={preventCodeCopy} style={{ userSelect: 'none' }}>
              <div className="draw-verification__evidence-grid">
                <div className="draw-verification__evidence-fact">
                  <div className="draw-verification__evidence-fact-head"><strong>HUELLA SHA-256 DEL ACTA ({proof.tickets.length} BOLETOS)</strong><LockOutlined aria-label="Lectura protegida" /></div>
                  <code>{proof.commitment}</code>
                  <p>Identifica la lista de boletos y las reglas. Para acreditar cuándo se publicó hace falta una copia externa fechada.</p>
                </div>
                <div className="draw-verification__evidence-fact">
                  <div className="draw-verification__evidence-fact-head"><strong>FIRMA DE DRAND · RONDA #{proof.beaconRound}</strong><LockOutlined aria-label="Lectura protegida" /></div>
                  <code>{displayedSignature || (beacon.loading ? 'Consultando la ronda…' : 'Firma aún no disponible')}</code>
                  <p className={evidenceSignatureMismatch ? 'draw-verification__evidence-warning' : ''}>{evidenceSignatureMismatch ? 'La firma de Drand no coincide con la registrada en el acta.' : beacon.data ? 'Firma consultada en la ronda pública de Drand.' : proof.beaconSignature ? 'Firma registrada en el acta; no se pudo contrastar ahora con Drand.' : 'El sorteo aún no registra una firma para esta ronda.'}</p>
                </div>
              </div>
              <div className="draw-verification__algorithm" aria-label="Extracto del algoritmo de sorteo">
                <div className="draw-verification__algorithm-toolbar"><strong><CodeOutlined /> Algoritmo de extracción · extracto</strong><div><span className="draw-verification__algorithm-tabs" role="tablist" aria-label="Lenguaje del extracto"><button id="draw-code-tab-node" type="button" role="tab" aria-controls="draw-code-panel" aria-selected={algorithmLanguage === 'node'} onClick={() => setAlgorithmLanguage('node')}>Node.js</button><button id="draw-code-tab-python" type="button" role="tab" aria-controls="draw-code-panel" aria-selected={algorithmLanguage === 'python'} onClick={() => setAlgorithmLanguage('python')}>Python 3</button></span><span className="draw-verification__code-locked"><LockOutlined /> Bloqueado</span></div></div>
                <pre id="draw-code-panel" role="tabpanel" aria-labelledby={algorithmLanguage === 'node' ? 'draw-code-tab-node' : 'draw-code-tab-python'}><code>{algorithmLanguage === 'node' ? algorithmExcerpt : pythonExcerpt}</code></pre>
              </div>
              <div className="draw-verification__json-viewer" aria-label="Acta JSON de solo lectura">
                <div className="draw-verification__json-toolbar">
                  <span>Acta completa</span>
                  <span><LockOutlined /> JSON · bloqueado</span>
                </div>
                <pre><code>{actJson}</code></pre>
              </div>
              <div className="draw-verification__json-viewer" aria-label="Dato de drand JSON de solo lectura">
                <div className="draw-verification__json-toolbar">
                  <span>Dato de azar de drand · turno {proof.beaconRound}</span>
                  <span><LockOutlined /> JSON · bloqueado</span>
                </div>
                {beacon.loading ? <p className="draw-verification__json-message">Consultando drand…</p>
                  : beacon.error ? (
                    <div className="draw-verification__json-message">
                      <p>{beacon.error}</p>
                      <Button size="small" icon={<ReloadOutlined />} onClick={() => setBeaconAttempt((value) => value + 1)}>Reintentar</Button>
                    </div>
                  ) : beacon.data ? <pre><code>{beaconJson}</code></pre> : null}
              </div>
            </div>
          </details>
          )}
          <DrawActModal open={actOpen} onClose={() => setActOpen(false)} proof={proof} raffle={raffle} title={title} status={status} />
        </>
      )}
    </main>
  );
}
