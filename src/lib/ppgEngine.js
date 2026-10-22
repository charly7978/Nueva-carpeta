/**
 * VitalScan PPG Engine v6 — adquisición por fotograma real
 * ─────────────────────────────────────────────────────────────
 * Captura
 *  - Una muestra por FOTOGRAMA REAL de cámara (requestVideoFrameCallback) con su
 *    marca de tiempo de captura. La versión anterior muestreaba con rAF a 60 Hz
 *    y descartaba por tiempo: duplicaba y saltaba fotogramas, lo que mete
 *    jitter de ±16 ms en cada intervalo entre latidos.
 *  - ROI central promediado espacialmente; flash encendido.
 *
 * Procesado → ver ./ppg/pipeline.js (filtro causal, canal automático,
 * detección latido a latido con validación y SQI por pulso).
 *
 * Este archivo solo conecta cámara ↔ pipeline ↔ interfaz y calcula las
 * constantes lentas (SpO₂, respiración, HRV, presión estimada).
 * ─────────────────────────────────────────────────────────────
 */
import { median } from '@/lib/dsp';
import { PPGPipeline, FS } from '@/lib/ppg/pipeline';
import { PPGSimulator } from '@/lib/ppg/simulator';
import { TraceStore } from '@/lib/ppg/traceStore';
import { analyzeOpticalFrame } from '@/lib/ppg/opticalFrame';
import { FrameWatchdog } from '@/lib/ppg/frameWatchdog';
import { CaptureStabilizer } from '@/lib/ppg/captureStabilizer';

export const NOMINAL_FPS = FS;
export const BUFFER_SECONDS = 15;
export const EXTENDED_BUFFER_SECONDS = 60;
export const WARMUP_SECONDS = 5;
export const WARMUP_SAMPLES = FS * WARMUP_SECONDS;

export const CAPTURE_SIZE = 128;
export const CAPTURE_SRC_FRACTION = 0.5;
export const ROI_FRACTION = 0.62;

const EMPTY_SLOW = { spo2: null, hrv: null, respRate: null, bp: null };

/** Mensaje comprensible para cada fallo de cámara del navegador */
function cameraError(e) {
  const name = e?.name || '';
  if (name === 'NotAllowedError' || name === 'SecurityError') {
    return new Error('Permiso de cámara denegado. Actívalo en el navegador y vuelve a intentarlo.');
  }
  if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
    return new Error('No se ha encontrado ninguna cámara en este dispositivo.');
  }
  if (name === 'NotReadableError' || name === 'TrackStartError') {
    return new Error('La cámara está ocupada por otra aplicación. Ciérrala y vuelve a intentarlo.');
  }
  if (name === 'OverconstrainedError') {
    return new Error('La cámara no admite la configuración solicitada.');
  }
  return new Error(e?.message || 'No se pudo acceder a la cámara.');
}

export class PPGEngine {
  /**
   * @param onFrame  (data) por fotograma — la interfaz lo limita a ~5 Hz
   * @param onVitals (vitals) en cada latido y como mínimo cada segundo
   * @param onStatus ({type})
   * @param options  {{ extended?: boolean, simulate?: boolean, store?: any, onVideo?: any, onBeat?: any, calibration?: any, rhythm?: any }}
   */
  constructor(onFrame, onVitals, onStatus, options = {}) {
    this.extended = !!options.extended;
    this.simulate = options.simulate === true;
    this.onFrame = onFrame;
    this.onVitals = onVitals;
    this.onStatus = onStatus;
    // La interfaz monta el <video> en el DOM en cuanto existe: iOS exige que el
    // elemento esté en el documento para reproducir el flujo de la cámara.
    this.onVideo = options.onVideo || null;
    // Aviso por latido real (bip + vibración); lo decide quien construye el motor
    this.onBeat = options.onBeat || null;

    // Presencia de dedo con histéresis: ver _updateFinger
    this.finger = this.simulate;
    this.fingerOn = null;
    this.fingerOff = null;

    // El trazado lo lee el lienzo directamente de aquí: nunca pasa por React
    this.store = options.store || new TraceStore(this.extended ? 2200 : 1400);
    this.pipeline = new PPGPipeline({
      store: this.store,
      bufferSeconds: this.extended ? EXTENDED_BUFFER_SECONDS : BUFFER_SECONDS,
    });
    this.sim = this.simulate ? new PPGSimulator(options.rhythm) : null;

    // Anclaje de calibración con manguito (ver lib/ppg/bpModel.js)
    this.calibration = options.calibration || null;
    this.bpFeatures = null;
    this.metricsWorker = null;
    this.metricsPending = false;
    this.metricsSeq = 0;

    this.slow = EMPTY_SLOW;
    this.lastSlow = 0;
    this.lastEmit = 0;
    this.beatLatencyMs = null;
    this.lastSignalState = null;
    this.lastStateCheck = -Infinity;
    this.clockOffsetMs = null;
    this.watchdog = new FrameWatchdog(() => {
      if (!this.running) return;
      this.pipeline.suspend();
      this.lastSignalState = 'artifact';
      this._emitVitals(performance.now(), { ...this.pipeline.getState(), state: 'artifact', hr: null });
    });

    // Telemetría de cámara
    this.fps = NOMINAL_FPS;
    this.lastFrameT = 0;
    this.prevR = null;
    this.diffHist = [];
    this.lastMediaTime = -1;

    this.stream = null;
    this.captureStabilizer = null;
    this.video = null;
    this.canvas = null;
    this.ctx = null;
    this.vfcId = null;
    this.rafId = null;
    this.running = false;
  }

  /** Fija el anclaje de presión; se aplica en el siguiente ciclo lento */
  setCalibration(calibration) {
    this.calibration = calibration || null;
    this.metricsSeq++;
    this.lastSlow = 0;
  }

  // ── Ciclo de vida ──────────────────────────────────────────
  async start() {
    this.pipeline.reset();
    this.metricsWorker = new Worker(new URL('./ppg/metricsWorker.js', import.meta.url), { type: 'module' });
    this.metricsWorker.onmessage = ({ data }) => {
      this.metricsPending = false;
      if (!this.running || data.id !== this.metricsSeq || this.lastSignalState !== 'locked') return;
      this.slow = data.slow;
      this.bpFeatures = data.bpFeatures;
    };

    if (this.simulate) {
      this.onStatus({ type: 'simulating' });
      this.running = true;
      this.onStatus({ type: 'running' });
      this.rafId = requestAnimationFrame((now) => this._simFrame(now));
      return;
    }

    this.onStatus({ type: 'requesting_camera' });

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      throw new Error(
        typeof window !== 'undefined' && window.isSecureContext === false
          ? 'La cámara requiere una conexión segura (https).'
          : 'Este navegador no permite el acceso a la cámara.'
      );
    }

    this.stream = await this._openCamera();

    // Flash: si el dispositivo lo admite, es lo que ilumina el dedo
    const [track] = this.stream.getVideoTracks();
    let caps = {};
    try { caps = track && track.getCapabilities ? track.getCapabilities() : {}; } catch { caps = {}; }
    if (caps && caps.torch) {
      try {
        await track.applyConstraints(/** @type {any} */ ({ advanced: [{ torch: true }] }));
        this.onStatus({ type: 'torch_on' });
      } catch {
        this.onStatus({ type: 'torch_unavailable' });
      }
    } else {
      this.onStatus({ type: 'torch_unavailable' });
    }

    this.video = document.createElement('video');
    this.video.setAttribute('playsinline', '');
    this.video.setAttribute('webkit-playsinline', '');
    this.video.autoplay = true;
    this.video.muted = true;
    this.video.playsInline = true;
    this.video.srcObject = this.stream;

    if (this.onVideo) this.onVideo(this.video);

    try {
      await this.video.play();
    } catch {
      /* algunos navegadores rechazan la promesa aunque el flujo ya está activo */
    }

    await new Promise((resolve) => {
      if (this.video.readyState >= 2) return resolve();
      let done = false;
      const finish = () => { if (!done) { done = true; resolve(); } };
      this.video.onloadeddata = finish;
      this.video.oncanplay = finish;
      setTimeout(finish, 2500);
    });

    this.canvas = document.createElement('canvas');
    this.canvas.width = CAPTURE_SIZE;
    this.canvas.height = CAPTURE_SIZE;
    this.ctx = this.canvas.getContext('2d', { willReadFrequently: true });

    this.captureStabilizer = new CaptureStabilizer(track, caps, () => {
      if (!this.running) return;
      // Exposure/focus changes must never join old and new beat evidence.
      this.pipeline.suspend();
      this._emitVitals(performance.now(), this.pipeline.getState());
    });
    this.running = true;
    this.watchdog.start();
    this.onStatus({ type: 'running' });
    this._scheduleCameraFrame();
  }

  /**
   * Apertura tolerante: de la configuración ideal a la mínima viable.
   * Un permiso denegado no se arregla probando otra configuración, así que
   * se propaga de inmediato con un mensaje claro.
   */
  async _openCamera() {
    const attempts = [
      {
        video: {
          facingMode: { ideal: 'environment' },
          // The optical ROI is read at 128×128; extra video resolution only
          // increases capture work. Prefer more real frames, never invented ones.
          width: { ideal: 320 },
          height: { ideal: 240 },
          frameRate: { ideal: 60, max: 60 },
        },
        audio: false,
      },
      { video: { facingMode: { ideal: 'environment' } }, audio: false },
      { video: { facingMode: 'user' }, audio: false },
      { video: true, audio: false },
    ];

    let lastErr = null;
    for (const c of attempts) {
      try {
        return await navigator.mediaDevices.getUserMedia(c);
      } catch (e) {
        lastErr = e;
        if (e && (e.name === 'NotAllowedError' || e.name === 'SecurityError')) throw cameraError(e);
      }
    }
    throw cameraError(lastErr);
  }

  stop() {
    this.running = false;
    this.captureStabilizer?.stop();
    this.captureStabilizer = null;
    this.watchdog.stop();
    this.metricsWorker?.terminate();
    this.metricsWorker = null;
    this.metricsPending = false;
    this.metricsSeq++;
    if (this.rafId) cancelAnimationFrame(this.rafId);
    if (this.vfcId && this.video?.cancelVideoFrameCallback) this.video.cancelVideoFrameCallback(this.vfcId);
    if (this.stream) this.stream.getTracks().forEach((t) => t.stop());
    if (this.video) {
      try { this.video.pause(); } catch { /* el elemento puede estar ya desmontado */ }
      this.video.srcObject = null;
    }
    this.stream = null;
    this.video = null;
    this.vfcId = null;
    this.rafId = null;
    this.onStatus({ type: 'stopped' });
  }

  // ── Cámara real ────────────────────────────────────────────
  _scheduleCameraFrame() {
    if (!this.running) return;
    if (typeof this.video.requestVideoFrameCallback === 'function') {
      this.vfcId = this.video.requestVideoFrameCallback((now, meta) => this._cameraFrame(now, meta));
    } else {
      this.rafId = requestAnimationFrame((now) => this._cameraFrame(now, null));
    }
  }

  _cameraFrame(now, meta) {
    if (!this.running) return;
    if (document.hidden) { this.watchdog.stall(); this._scheduleCameraFrame(); return; }

    // Sin requestVideoFrameCallback: solo se procesa un fotograma NUEVO
    if (!meta) {
      const ct = this.video.currentTime;
      if (ct === this.lastMediaTime) { this._scheduleCameraFrame(); return; }
      this.lastMediaTime = ct;
    }

    if (this.video.readyState >= 2) this._processFrame(now, meta);
    this._scheduleCameraFrame();
  }

  _processFrame(now, meta) {
    // mediaTime timestamps the frame, not its delayed JavaScript callback.
    // Map its clock ONCE to performance.now(); never mix clock sources mid-session.
    const mediaMs = (meta?.mediaTime ?? this.video.currentTime) * 1000;
    if (!Number.isFinite(mediaMs)) return;
    if (this.clockOffsetMs === null) {
      const capture = Number.isFinite(meta?.captureTime) && Math.abs(meta.captureTime - now) < 1000
        ? meta.captureTime : now;
      this.clockOffsetMs = capture - mediaMs;
    }
    const tMs = mediaMs + this.clockOffsetMs;
    if (this.lastFrameT && tMs <= this.lastFrameT) return;
    this.watchdog.tick();

    if (this.lastFrameT > 0) {
      const dt = tMs - this.lastFrameT;
      if (dt > 0 && dt < 250) this.fps = this.fps * 0.92 + (1000 / dt) * 0.08;
    }
    this.lastFrameT = tMs;

    const vw = this.video.videoWidth || CAPTURE_SIZE;
    const vh = this.video.videoHeight || CAPTURE_SIZE;
    const src = Math.min(vw, vh) * CAPTURE_SRC_FRACTION;
    this.ctx.drawImage(this.video, (vw - src) / 2, (vh - src) / 2, src, src, 0, 0, CAPTURE_SIZE, CAPTURE_SIZE);

    const img = this.ctx.getImageData(0, 0, CAPTURE_SIZE, CAPTURE_SIZE);
    const optical = analyzeOpticalFrame(img, CAPTURE_SIZE, CAPTURE_SIZE, ROI_FRACTION);
    this._updateFinger(this.finger ? optical.contact : optical.present, tMs / 1000);
    this.captureStabilizer?.observe(optical, tMs / 1000);
    const [r, g, b] = optical.rgb;

    // Estabilidad frame a frame → nivel de movimiento (solo guía)
    const dR = this.prevR === null ? 0 : Math.abs(r - this.prevR);
    this.prevR = r;
    this.diffHist.push(dR);
    if (this.diffHist.length > 45) this.diffHist.shift();
    const motionLevel = Math.min(100, Math.round((dR / ((median(this.diffHist) || 0) * 6 + 2)) * 100));

    this._feed(tMs / 1000, r, g, b, optical.confidence, motionLevel, {
      usable: optical.usable, contact: optical.contact, spatial: optical.spatial, issue: optical.issue,
    });
  }

  /** Time-based contact hysteresis, independent of a 15/30/60-fps camera.
   * Raw contact still gates every sample immediately when the lens is uncovered.
   */
  _updateFinger(present, t) {
    if (present) {
      this.fingerOn ??= t;
      this.fingerOff = null;
      if (!this.finger && t - this.fingerOn >= 0.25) this.finger = true;
    } else {
      this.fingerOff ??= t;
      this.fingerOn = null;
      if (this.finger && t - this.fingerOff >= 0.2) this.finger = false;
    }
  }


  // ── Señal de verificación ──────────────────────────────────
  _simFrame(now) {
    if (!this.running) return;
    const t = now / 1000;
    const [r, g, b] = this.sim.sample(t);
    this._feed(t, r, g, b, 96, 0);
    this.rafId = requestAnimationFrame((n) => this._simFrame(n));
  }

  // ── Alimentación común ─────────────────────────────────────
  _feed(t, r, g, b, fingerConfidence, motionLevel, optical) {
    const wallMs = performance.now();
    const events = this.pipeline.push(t, r, g, b, wallMs / 1000, this.finger, optical);
    const confirmed = events.filter(e => e.type === 'beat');
    for (const event of confirmed) {
      const ms = Math.round(wallMs - event.beat.t * 1000);
      this.beatLatencyMs = ms >= 0 && ms < 3000 ? ms : null;
      if (this.onBeat) this.onBeat(event.beat);
    }

    this.onFrame({
      r, g, b,
      sampleCount: this.pipeline.count,
      finger: this.finger,
      fingerConfidence,
      motionLevel,
      fps: Math.round(this.simulate ? FS : this.fps),
    });

    const now = performance.now();
    if (confirmed.length || now - this.lastStateCheck >= 200) {
      this.lastStateCheck = now;
      const state = this.pipeline.getState();
      if (confirmed.length || state.state !== this.lastSignalState || now - this.lastEmit >= 1000) {
        this.lastEmit = now;
        this.lastSignalState = state.state;
        this._emitVitals(now, state);
      }
    }
  }

  _emitVitals(now, st) {
    if (st.state !== 'locked' || st.quality < 75 || st.cleanSeconds < 10) {
      this.slow = EMPTY_SLOW;
      this.bpFeatures = null;
      this.metricsSeq++;
      this.lastSlow = 0;
    } else if (!this.metricsPending && now - this.lastSlow >= 2000) {
      this.lastSlow = now;
      this._computeSlow(st);
    }
    this.onVitals({
      ...st,
      sqi: st.quality,
      beatLatencyMs: this.beatLatencyMs,
      spo2: [0, 1].every(c => this.pipeline.usableSince[c] !== null
        && this.pipeline.lastT - this.pipeline.usableSince[c] >= 10) ? this.slow.spo2 : null,
      hrv: st.rhythm?.trusted === true && st.rhythm.kind === 'regular'
        && st.rhythm.raw === 'regular' && st.rhythm.stableSeconds >= 3 ? this.slow.hrv : null,
      respRate: this.slow.respRate,
      bp: this.slow.bp,
      bpFeatures: this.bpFeatures,
    });
  }

  /** Constantes lentas: solo con el pulso bloqueado; nunca con un ritmo sin confirmar */
  _computeSlow(st) {
    if (st.state !== 'locked') { this.slow = EMPTY_SLOW; return; }

    const p = this.pipeline;
    const fs = p.fs;
    const idx = { r: 0, g: 1, b: 2 }[st.channel];
    const cleanSamples = Math.min(p.count, Math.max(0, Math.floor((p.lastT - p.tracker.invalidAt) * fs)));
    const raw = p.bufX[idx].tail(cleanSamples).map(v => -v);
    if (raw.length < fs * WARMUP_SECONDS) { this.slow = EMPTY_SLOW; return; }

    const win = Math.min(cleanSamples, Math.round(fs * 10));
    this.metricsPending = true;
    this.metricsWorker.postMessage({
      id: ++this.metricsSeq, raw, fs, hr: st.hr, calibration: this.calibration,
      red: p.bufX[0].tail(win), green: p.bufX[1].tail(win),
      rr: p.tracker.validIbiMs(120),
      regular: st.rhythm?.trusted === true && st.rhythm.kind === 'regular'
        && st.rhythm.raw === 'regular' && st.rhythm.stableSeconds >= 3,
      colourReliable: [0, 1].every(c => p.usableSince[c] !== null && p.lastT - p.usableSince[c] >= 10),
    });
  }
}