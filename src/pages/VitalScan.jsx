import { useState, useEffect, useRef, useCallback } from 'react';
import { base44 } from '@/api/base44Client';
import { PPGEngine, WARMUP_SAMPLES, EXTENDED_BUFFER_SECONDS } from '../lib/ppgEngine';
import { reportPdfBase64, reportFileName } from '@/lib/clinicalReport';
import useClinicalReport from '@/hooks/use-clinical-report';
import WaveStage from '../components/monitor/WaveStage';
import MonitorHud from '../components/monitor/MonitorHud';
import StartOverlay from '../components/monitor/StartOverlay';
import RecordsSheet from '../components/monitor/RecordsSheet';
import RecordEditor from '../components/monitor/RecordEditor';
import BpCalibrationDialog from '../components/monitor/BpCalibrationDialog';
import { makeCalibration } from '../lib/ppg/bpModel';
import { useFullscreen } from '../hooks/use-fullscreen';
import { useBeatCue } from '../hooks/use-beat-cue';

const STATUS_MSGS = {
  requesting_camera: 'Solicitando acceso a la cámara…',
  torch_on: 'Flash activado',
  torch_unavailable: 'Flash no disponible — actívalo manualmente',
  simulating: 'Preparando señal de verificación…',
  running: 'Cámara activa',
  stopped: 'Detenido',
};

// El modo del monitor sigue el estado real de la señal, no solo la app
const SIGNAL_MODES = {
  locked: 'live',
  acquiring: 'acquiring',
  recovering: 'recovering',
  artifact: 'artifact',
  lost: 'error',
  searching: 'acquiring',
  nofinger: 'nofinger',
};

export default function VitalScan() {
  const engineRef = useRef(null);
  const [appState, setAppState] = useState('idle'); // idle | starting | running | error
  const [statusMsg, setStatusMsg] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  // El trazado vive en un almacén fuera de React: el lienzo lo lee en su
  // propio bucle de 60 fps, así ningún fotograma de cámara provoca un render.
  const storeRef = useRef(null);
  const rhythmRef = useRef({});
  const lastUiRef = useRef(0);
  const lastBeatRef = useRef(-1);

  const [previewVideo, setPreviewVideo] = useState(null);
  const [beats, setBeats] = useState([]);
  const [vitals, setVitals] = useState(null);
  const [fingerDetected, setFingerDetected] = useState(false);
  const [fingerConfidence, setFingerConfidence] = useState(0);
  const [sampleCount, setSampleCount] = useState(0);
  const [motionLevel, setMotionLevel] = useState(0);
  const [extendedMode, setExtendedMode] = useState(false);
  const [simulated, setSimulated] = useState(false);
  const [demoRhythm, setDemoRhythm] = useState('normal');
  const [recordOpen, setRecordOpen] = useState(false);
  const [records, setRecords] = useState([]);
  const [editing, setEditing] = useState(null);
  const [user, setUser] = useState(null);
  const [calibration, setCalibration] = useState(null);
  const [calibOpen, setCalibOpen] = useState(false);
  const measureStartRef = useRef(0);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const elapsedTimerRef = useRef(null);

  const fullscreen = useFullscreen();
  const cue = useBeatCue();
  const targetSeconds = extendedMode ? EXTENDED_BUFFER_SECONDS : 30;
  const warmupProgress = Math.min(1, sampleCount / WARMUP_SAMPLES);

  const handleFrame = useCallback((data) => {
    const now = performance.now();
    if (now - lastUiRef.current < 200) return;
    lastUiRef.current = now;

    setSampleCount(data.sampleCount);
    setFingerDetected(!!data.finger);
    setFingerConfidence(data.fingerConfidence);
    setMotionLevel(data.motionLevel || 0);
  }, []);

  const handleVitals = useCallback((v) => {
    setVitals(v);
    rhythmRef.current = { alert: v.rhythm?.severity === 'alert', label: v.rhythm?.short };

    // Cada latido nuevo añade una fila al registro, con su latencia real
    if (v.beatCount !== lastBeatRef.current) {
      const isNew = v.beatCount > 0 && v.beatCount > lastBeatRef.current && v.lastBeat;
      lastBeatRef.current = v.beatCount;
      if (isNew) {
        const entry = {
          id: v.beatCount,
          elapsed: Math.max(0, Math.round((Date.now() - measureStartRef.current) / 1000)),
          ibi: v.lastBeat.ibiMs,
          hr: v.hr,
          latency: v.beatLatencyMs,
          sqi: v.sqi,
          verified: v.state === 'locked' && v.sqi >= 75 && v.cleanSeconds >= 10,
        };
        setBeats((prev) => [entry, ...prev].slice(0, 60));
      }
    }
  }, []);

  const handleStatus = useCallback((s) => {
    setStatusMsg(STATUS_MSGS[s.type] || s.type);
    if (s.type === 'running') setAppState('running');
    if (s.type === 'stopped') setAppState('idle');
  }, []);

  /** Lecturas guardadas: historial que se abre desde «Registro» para corregir o borrar */
  const loadRecords = useCallback(async () => {
    const { items } = await base44.entities.VitalRecord.list({ sort: '-created_date', limit: 50 });
    setRecords(items);
  }, []);

  const clinicalReport = useClinicalReport(user, loadRecords);

  const saveRecord = async (id, values) => {
    await base44.entities.VitalRecord.update(id, values);
    await loadRecords();
  };

  const deleteRecord = async (id) => {
    await base44.entities.VitalRecord.delete(id);
    await loadRecords();
  };

  /** Calibración con manguito: ancla la estimación a la onda capturada ahora mismo */
  const saveCalibration = async ({ sbp, dbp }) => {
    const next = makeCalibration({ sbp, dbp }, vitals?.bpFeatures);
    await base44.auth.updateMe({ bp_calibration: next });
    setCalibration(next);
    engineRef.current?.setCalibration(next);
  };

  const clearCalibration = async () => {
    await base44.auth.updateMe({ bp_calibration: null });
    setCalibration(null);
    engineRef.current?.setCalibration(null);
  };

  /** Envía el informe en PDF al correo de la propia cuenta */
  const emailReport = async (rep) => {
    if (!user?.email) return;
    await base44.integrations.Core.SendEmail({
      to: user.email,
      subject: `Informe clínico PulseVector · ${new Date(rep.generatedAt).toLocaleDateString('es-ES')}`,
      body: 'Adjuntamos el informe clínico en PDF de tu última medición en PulseVector.',
      attachments: [{ filename: reportFileName(rep), content: reportPdfBase64(rep) }],
    });
  };

  const openEditor = (record) => {
    setRecordOpen(false); // un solo panel a la vez: se cierra el registro y se abre el editor
    setEditing(record);
  };

  const startMeasurement = async (simulate = false) => {
    fullscreen.enter(); // dentro del gesto del usuario: el navegador solo lo permite aquí
    cue.unlock();       // ídem para el audio del aviso de latido
    setAppState('starting');
    setErrorMsg('');
    setVitals(null);
    setSampleCount(0);
    setSimulated(simulate);
    setPreviewVideo(null);
    setBeats([]);
    clinicalReport.reset();
    rhythmRef.current = {};
    lastBeatRef.current = -1;

    measureStartRef.current = Date.now();
    setElapsedSeconds(0);
    elapsedTimerRef.current = setInterval(() => {
      setElapsedSeconds(Math.floor((Date.now() - measureStartRef.current) / 1000));
    }, 500);

    const engine = new PPGEngine(handleFrame, handleVitals, handleStatus, {
      extended: extendedMode,
      simulate,
      rhythm: demoRhythm,
      onVideo: setPreviewVideo,
      onBeat: cue.play,
      calibration,
    });
    engineRef.current = engine;
    storeRef.current = engine.store;

    try {
      await engine.start();
    } catch (e) {
      engine.stop();
      setErrorMsg(e.message || 'No se pudo acceder a la cámara. Comprueba los permisos e inténtalo de nuevo.');
      setAppState('error');
    }
  };

  const stopMeasurement = async () => {
    if (!engineRef.current) return;
    // Lo primero es devolver la app a reposo: la parada tiene que verse siempre.
    setAppState('idle');
    const last = vitals;
    const lastBeats = beats;
    const durationS = Math.round((Date.now() - measureStartRef.current) / 1000);

    if (engineRef.current) {
      engineRef.current.stop();
      engineRef.current = null;
    }
    if (elapsedTimerRef.current) {
      clearInterval(elapsedTimerRef.current);
      elapsedTimerRef.current = null;
    }
    cue.stop();
    setSimulated(false);
    storeRef.current = null;
    rhythmRef.current = {};
    lastBeatRef.current = -1;
    setPreviewVideo(null);
    setBeats([]);
    setVitals(null);
    setSampleCount(0);
    setFingerDetected(false);
    setFingerConfidence(0);
    setMotionLevel(0);

    // La lectura se guarda al terminar: así «Registro» tiene un historial real
    // que abrir, corregir y borrar.
    if (simulated) return; // Demo data must never become a personal measurement.
    setRecordOpen(true);
    await clinicalReport.generate({ vitals: last, beats: lastBeats, durationS });
  };

  useEffect(() => {
    return () => {
      if (engineRef.current) engineRef.current.stop();
      if (elapsedTimerRef.current) clearInterval(elapsedTimerRef.current);
    };
  }, []);

  useEffect(() => {
    loadRecords();
    base44.auth.me().then((u) => {
      setUser(u);
      setCalibration(u?.bp_calibration || null);
    });
  }, [loadRecords]);

  const monitorMode =
    appState === 'running' ? (SIGNAL_MODES[vitals?.state] || 'acquiring')
      : appState === 'starting' ? 'acquiring'
        : appState === 'error' ? 'error'
          : 'standby';

  return (
    <div
      className="fixed inset-x-0 top-0 flex select-none flex-col overflow-hidden bg-background font-body text-foreground"
      style={{ height: '100dvh' }}
    >
      {/* El monitor ocupa la pantalla completa; los displays flotan encima */}
      <WaveStage
        mode={monitorMode}
        storeRef={storeRef}
        rhythmRef={rhythmRef}
        level={vitals?.rhythm?.severity}
      />

      <MonitorHud
        mode={monitorMode}
        vitals={vitals}
        video={previewVideo}
        simulated={simulated}
        fullscreen={fullscreen}
        cue={cue}
        running={appState === 'running'}
        elapsed={elapsedSeconds}
        target={targetSeconds}
        extended={extendedMode}
        onStop={stopMeasurement}
        onOpenRecord={() => setRecordOpen(true)}
        onCalibrate={() => setCalibOpen(true)}
        feedback={{
          mode: monitorMode,
          simulated,
          fingerDetected,
          fingerConfidence,
          motionLevel,
          pulseAmbiguous: vitals?.pulseAmbiguous,
          signalIssue: vitals?.signalIssue,
          hrHeld: vitals?.hrHeld,
          warmupProgress,
        }}
      />

      <StartOverlay
        appState={appState}
        statusMsg={statusMsg}
        errorMsg={errorMsg}
        onStart={() => startMeasurement(false)}
        onStartDemo={() => startMeasurement(true)}
        onRetry={() => setAppState('idle')}
        extendedMode={extendedMode}
        onToggleExtended={() => setExtendedMode((v) => !v)}
        demoRhythm={demoRhythm}
        onDemoRhythm={setDemoRhythm}
      />

      <RecordsSheet
        open={recordOpen}
        onOpenChange={setRecordOpen}
        beats={beats}
        hrv={vitals?.hrv}
        records={records}
        onEdit={openEditor}
        report={clinicalReport.report}
        reportBusy={clinicalReport.busy}
        reportError={clinicalReport.error}
        onRetryReport={clinicalReport.retry}
        onEmail={emailReport}
      />

      <BpCalibrationDialog
        open={calibOpen}
        onOpenChange={setCalibOpen}
        calibration={calibration}
        features={vitals?.bpFeatures}
        onSave={saveCalibration}
        onClear={clearCalibration}
      />

      {editing && (
        <RecordEditor
          key={editing.id}
          record={editing}
          onOpenChange={(o) => { if (!o) setEditing(null); }}
          onSave={saveRecord}
          onDelete={deleteRecord}
        />
      )}
    </div>
  );
}