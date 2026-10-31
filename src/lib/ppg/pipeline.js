/** Camera frames → uniformly sampled, causal PPG → quality-validated beats.
 * No synthetic beats, fixed colour-amplitude ratios or whole-window refiltering.
 */
import { RingBuffer, median, mean, populationStd as sd } from '@/lib/dsp';
import { BiquadCascade, designCardiacFilter, designMorphologyFilter, designTremorFilter } from '@/lib/ppg/streamFilter';
import { BeatTracker } from '@/lib/ppg/beatTracker';
import { RhythmAnalyzer, IRREGULAR_KINDS } from '@/lib/ppg/rhythm';
import { assessChannel, robustScale, MIN_PULSE_SCALE } from '@/lib/ppg/signalQuality';
import { bandNoise } from '@/lib/ppg/bandNoise';
import commonModeArtifact from '@/lib/ppg/colourEvidence';
import { detectPulseFeatures } from '@/lib/ppg/pulseFeatures';
import { ArtifactGuard } from '@/lib/ppg/artifactGuard';
import RateDisplay from '@/lib/ppg/rateDisplay';

export const FS = 30;
const CH = ['r', 'g', 'b'];
const BASE_TAU = 1.6;
const X_CLAMP = 0.06;

export class PPGPipeline {
  constructor({ store = null, bufferSeconds = 15 } = {}) {
    this.fs = FS;
    this.dt = 1 / FS;
    this.store = store;
    const cap = FS * bufferSeconds + 60;
    this.bufX = CH.map(() => new RingBuffer(cap));
    this.hist = CH.map(() => new RingBuffer(FS * 8));
    this.dxh = CH.map(() => new RingBuffer(FS * 4));
    this.filters = CH.map(() => new BiquadCascade(designCardiacFilter(FS)));
    // Rama de temblor (4.5–12 Hz): mide vibración, nunca decide latidos.
    this.tremorFilters = CH.map(() => new BiquadCascade(designTremorFilter(FS)));
    this.tremorHist = CH.map(() => new RingBuffer(FS * 3));
    // Canal de dibujo: mismo instante, filtro que NO deforma la morfología
    this.morphHist = CH.map(() => new RingBuffer(FS * 4));
    this.morphFilters = CH.map(() => new BiquadCascade(designMorphologyFilter(FS)));
    this.morphScale = [0, 0, 0];
    this.morphTarget = [0, 0, 0];
    this.tremorScale = [0, 0, 0];
    this.tracker = new BeatTracker(FS);
    this.rhythm = new RhythmAnalyzer();
    this.artifacts = new ArtifactGuard();
    this.rateDisplay = new RateDisplay();
    // Extremos de la sesión medidos en el canal de morfología (el que se dibuja)
    this.morphSess = { maxPeak: null, minValley: null, amps: [] };
    this.reset();
  }

  reset() {
    this.morphSess = { maxPeak: null, minValley: null, amps: [] };
    this.prev = null;
    this.nextT = 0;
    this.frameIntervals = [];
    this.frameInterval = this.dt;
    this.frameCount = 0;
    this.finger = false;
    this.contact = false;
    this.usable = [true, true, true];
    this.sel = 1;
    this.disturbed = false;
    this.interruptedAt = null;
    this.interruptionReset = false;
    this.opticalIssue = null;
    this.rateDisplay.reset();
    this.artifacts.reset();
    this.tracker.reset();
    this._dropSignal(0);
  }

  /** One reset path: keep the session count, discard ALL current evidence. */
  _dropSignal(t, keepTrace = false) {
    this.cleanSince = null;
    this.usableSince = [null, null, null];
    this.tracker.dropAcquisition();
    this.rhythm.reset();
    this.base = [null, null, null];
    this.scale = [0, 0, 0];
    this.targetScale = [0, 0, 0];
    this.lastX = [null, null, null];
    this.dxScale = [Infinity, Infinity, Infinity];
    this.win = [[], [], []];
    this.evidence = [null, null, null];
    this.count = 0;
    this.lastT = t;
    this.lastAnalysis = -1;
    this.selSince = t;
    this.challenger = -1;
    this.challengeCount = 0;
    this.lockSince = null;
    this.artifactUntil = t + 0.8;
    this.periodicity = 0;

    this.commonMode = false;
    this.sigOk = false;
    this.qualityOk = false;
    this._pk = null;
    this.bufX.forEach(b => b.clear());
    this.hist.forEach(b => b.clear());
    this.dxh.forEach(b => b.clear());
    this.filters.forEach(f => f.reset());
    this.tremorFilters.forEach(f => f.reset());
    this.tremorHist.forEach(b => b.clear());
    this.morphHist.forEach(b => b.clear());
    this.morphScale = [0, 0, 0];
    this.morphTarget = [0, 0, 0];
    this.tremorScale = [0, 0, 0];
    if (this.store) {
      if (!keepTrace) this.store.clear();
      this.store.beats = this.tracker.beats;
    }
  }

  get channel() { return CH[this.sel]; }
  get ready() { return this.count >= FS * 4; }

  suspend() {
    this.rateDisplay.reset();
    this.prev = null;
    this.disturbed = false;
    this.artifacts.reset();
    this._dropSignal(this.lastT);
  }

  push(t, r, g, b, wall = t, finger = true, optical = {}) {
    const events = [];
    if (![t, r, g, b, wall].every(Number.isFinite)) return events;
    // Duplicated/out-of-order callbacks never reset or add camera samples.
    if (this.prev && t <= this.prev.t) return events;
    if (finger !== this.finger) {
      this.finger = finger;
      this.rateDisplay.reset();
      this._dropSignal(t, true);
      this.prev = null;
    }
    this.lastT = t;
    this.contact = optical.contact ?? finger;
    this.usable = optical.usable ?? [true, true, true];
    this.opticalIssue = optical.issue || null;
    // A saturated red channel must not block usable green/blue acquisition.
    if (!this.usable[this.sel] && this.usable.some(Boolean)) {
      this.sel = this.usable.findIndex(Boolean);
      this.selSince = t;
      this.tracker.markBoundary(t);
      this.tracker.resetTemplate();
      this.rhythm.reset();
      this.lockSince = null;
      this.artifactUntil = Math.max(this.artifactUntil, t + 0.6);
    }
    if (!finger) {
      if (this.store) this.store.push(t, NaN, wall, NaN, 0);
      this.prev = null;
      this.disturbed = false;
      this.artifacts.reset();
      return events;
    }
    if (this.prev) {
      const gap = t - this.prev.t;
      const typical = this.frameInterval;
      if (gap > 0.2) {
        // No evidence, no interpolation across a suspended camera.
        this._dropSignal(t, true);
        this.prev = null;
        this.frameIntervals = [];
        this.frameInterval = this.dt;
      } else {
        if (gap > Math.max(0.12, 2.5 * typical)) this.artifactUntil = Math.max(this.artifactUntil, t + 0.5);
        this.frameIntervals.push(gap);
        if (this.frameIntervals.length > 45) this.frameIntervals.shift();
        if (++this.frameCount % 6 === 0) this.frameInterval = median(this.frameIntervals);
      }
    }
    const cur = [r, g, b];
    const level = this.artifacts.update(t, cur, this.usable, optical.spatial, this.contact, this.sel);
    const disturbed = t < this.artifacts.until;
    // Brief disturbances invalidate intervals, not all acquisition history.
    // A sustained disruption resets ONCE, never again on quarantine exit.
    if (this.artifacts.bad) {
      this.interruptedAt ??= t;
      if (!this.interruptionReset && t - this.interruptedAt >= 0.65) {
        this._dropSignal(t, true);
        this.interruptionReset = true;
      }
    } else {
      this.interruptedAt = null;
      this.interruptionReset = false;
    }
    this.disturbed = disturbed;
    if (!this.prev) { this.prev = { t, v: cur }; this.nextT = t; }
    const p = this.prev;
    while (this.nextT <= t + 1e-9) {
      const span = t - p.t;
      const fraction = span > 1e-9 ? Math.max(0, Math.min(1, (this.nextT - p.t) / span)) : 1;
      const v = cur.map((value, c) => p.v[c] + fraction * (value - p.v[c]));
      this._grid(this.nextT, v, wall, events);
      this.nextT += this.dt;
    }
    this.prev = { t, v: cur };
    return events;
  }

  _grid(t, v, wall, events) {
    // A dark/noisy blue channel must not reset a clean red/green pulse.
    const steps = v.map((value, c) => this.usable[c] && this.base[c] > 12
      && Math.abs(value - this.base[c]) > Math.max(3, 0.15 * this.base[c]));
    if (steps[this.sel] || steps.filter(Boolean).length >= 2) {
      // Salto de DC > 15 %: re-siembra base, marca frontera, sigue (no _dropSignal).
      for (let c = 0; c < 3; c++) {
        if (steps[c]) this.base[c] = v[c];
      }
      this.tracker.markBoundary(t);
      // no reset de adquisición completa
    }
    this.count++;
    this.lastT = t;
    const alpha = 1 - Math.exp(-this.dt / BASE_TAU);
    const filtered = [0, 0, 0];
    const morph = [0, 0, 0];
    let selectedArtifact = false;
    for (let c = 0; c < 3; c++) {
      this.base[c] = this.base[c] === null ? v[c] : this.base[c] + alpha * (v[c] - this.base[c]);
      const raw = this.base[c] > 8 ? (v[c] - this.base[c]) / this.base[c] : 0;
      const x = Math.max(-X_CLAMP, Math.min(X_CLAMP, raw));
      const dx = this.lastX[c] === null ? 0 : Math.abs(x - this.lastX[c]);
      this.lastX[c] = x;
      this.dxh[c].push(dx);
      if (c === this.sel && (Math.abs(raw) > X_CLAMP || dx > Math.max(0.0006, 8 * this.dxScale[c]))) selectedArtifact = true;
      this.bufX[c].push(x);
       const clean = this._cleanSample(c, x);
       filtered[c] = this.filters[c].process(-clean);
       this.hist[c].push(filtered[c]);
       // Rama de temblor (ortogonal): mide vibración 4.5–12 Hz sobre la misma muestra limpia.
       const tremorSample = this.tremorFilters[c].process(-clean);
       this.tremorHist[c].push(tremorSample);
       // Mismo instante, otro filtro: el de morfología (0,1–10 Hz, orden 2), que
      // conserva escotadura dicrótica, pico diastólico y frente sistólico.
      morph[c] = this.morphFilters[c].process(-clean);
      this.morphHist[c].push(morph[c]);
    }
    // Robust sorting at 5 Hz, rather than six sorts per camera sample.
    if (this.count % 6 === 0) {
      for (let c = 0; c < 3; c++) {
       this.targetScale[c] = robustScale(this.hist[c].tail(FS * 4));
       this.morphTarget[c] = robustScale(this.morphHist[c].tail(FS * 4));
       this.tremorScale[c] = robustScale(this.tremorHist[c].tail(FS * 2));
       const d = this.dxh[c].tail(FS * 4).sort((a, b) => a - b);
        this.dxScale[c] = this.count > FS * 2 ? Math.max(1e-6, d[Math.floor(d.length * 0.75)] || 0) : Infinity;
      }
    }
    // Smooth display gain continuously, never in 200-ms amplitude steps.
    // BeatTracker reconstructs the absolute signal before detecting extrema.
    const gainAlpha = 1 - Math.exp(-this.dt / 1.2);
    // La ganancia del dibujo se mueve más despacio que la de detección: un cambio
    // de amplitud no debe reescalar la onda visible. Y es LINEAL: escalar la traza
    // completa conserva la forma; comprimirla muestra a muestra la destruye.
    const morphAlpha = 1 - Math.exp(-this.dt / 2.4);
    for (let c = 0; c < 3; c++) {
      const target = Math.max(MIN_PULSE_SCALE, this.targetScale[c]);
      this.scale[c] = this.scale[c] > 0 ? this.scale[c] + gainAlpha * (target - this.scale[c]) : target;
      const mTarget = Math.max(MIN_PULSE_SCALE, this.morphTarget[c]);
      this.morphScale[c] = this.morphScale[c] > 0
        ? this.morphScale[c] + morphAlpha * (mTarget - this.morphScale[c]) : mTarget;
    }
    if (selectedArtifact) this.artifactUntil = Math.max(this.artifactUntil, t + 0.8);
    const second = Math.floor(this.count / FS);
    if (this.ready && second !== this.lastAnalysis) {
      this.lastAnalysis = second;
      this._analyzeChannels(t);
    }
    const scale = this.scale[this.sel];
    const samplingOk = this.frameIntervals.length >= 12 && this.frameInterval <= 1 / 12;
    const ev = this.evidence[this.sel];
    this.sigOk = this.ready && samplingOk && this.contact && this.usable[this.sel]
      && this.targetScale[this.sel] >= MIN_PULSE_SCALE && !!ev && ev.hz > 0 && !this.commonMode;
    this.qualityOk = this.sigOk && !!ev?.viable && !this.commonMode;
    const y = scale > 0 ? filtered[this.sel] / scale : 0;
    if (Math.abs(filtered[this.sel]) > 5.5 * Math.max(scale, this.targetScale[this.sel])) {
      this.artifactUntil = Math.max(this.artifactUntil, t + 0.8);
    }
    const ok = this.sigOk && !this.disturbed && t >= this.artifactUntil;
    const gross = this.artifacts.level === 2;
    // weight de confianza por calidad (temblor, SNR en banda)
    const tremorRatio = this.evidence[this.sel]?.tremorRatio ?? 0;
    const weight = this.qualityOk ? Math.max(0.25, Math.min(1, 1 - 0.6 * tremorRatio)) : 0.3;
    this.cleanSince = ok ? (this.cleanSince ?? t) : null;
    this.usableSince = this.usableSince.map((since, c) =>
      this.usable[c] && this.contact && !this.disturbed ? (since ?? t) : null);
    events.push(...this.tracker.push(t, y, ok, scale, weight));
    if (ok && this.tracker.locked) this.lockSince ??= t;
    else this.lockSince = null;
    // Trazado: la MORFOLOGÍA, no la señal de detección. `abs` viaja en % AC/DC
    // para que los rótulos de pico, valle y escotadura sean fisiológicos y para
    // que la meseta de saturación se vea tal cual, sin suavizarla.
    const drawn = this.contact && this.usable[this.sel] && !gross && t >= this.artifactUntil;
    const mScale = this.morphScale[this.sel];
    const mVal = morph[this.sel];
    if (this.store) {
      this.store.push(t, drawn && mScale > 0 ? mVal / mScale : NaN, wall,
        drawn ? mVal * 100 : NaN, mScale);
    }
  }

  /** Delayed Hampel centre; its fixed delay cancels in inter-beat intervals. */
  _cleanSample(c, x) {
    const w = this.win[c];
    w.push(x);
    if (w.length > 5) w.shift();
    if (w.length < 5) return 0;
    const med = w.slice().sort((a, b) => a - b)[2];
    return Math.abs(w[2] - med) > 6 * this.dxScale[c] ? med : w[2];
  }

  _analyzeChannels(t) {
    this.evidence = CH.map((_, c) => {
      const prevHz = this.evidence[c]?.hz || 0;
      const lag = prevHz > 0 ? FS / prevHz : 0;
      const bn = bandNoise({
        filtered: this.hist[c].tail(FS * 8),
        tremorScale: this.tremorScale[c],
        lagSamples: lag,
        signalScale: this.targetScale[c],
        fs: FS,
      });
      return assessChannel(
        this.bufX[c].tail(FS * 8), this.hist[c].tail(FS * 8), this.targetScale[c], FS, this.usable[c], this.evidence[c], bn,
      );
    });
    let best = this.sel;
    for (let c = 0; c < 3; c++) {
      if (this.evidence[c].score > this.evidence[best].score) best = c;
    }
    const current = this.evidence[this.sel];
    const challenging = best !== this.sel && this.evidence[best].viable
      && (!current.viable || (t - this.selSince >= 8 && this.evidence[best].score > 1.5 * current.score + 0.05));
    if (challenging) {
      this.challengeCount = this.challenger === best ? this.challengeCount + 1 : 1;
      this.challenger = best;
    } else { this.challenger = -1; this.challengeCount = 0; }
    if (challenging && this.challengeCount >= (current.viable ? 3 : 2)) {
      this.sel = best;
      this.selSince = t;
      // Cambio de canal: markBoundary + resetTemplate (no dropAcquisition).
      this.tracker.markBoundary(t);
      this.tracker.resetTemplate();
      this.rhythm.reset();
      this.lockSince = null;
      this.artifactUntil = Math.max(this.artifactUntil, t + 0.6);
    }
    this.commonMode = commonModeArtifact(this.bufX, this.evidence, FS);
    const chosen = this.evidence[this.sel];
    this.periodicity = chosen.strength;
    this.tracker.hintHz = chosen.viable ? chosen.hz : 0;
    this.tracker.hintLobed = chosen.viable && chosen.lobed === true;
    this.tracker.hintStrength = chosen.viable ? chosen.strength : 0;
  }

  /**
   * Public heart rate: slew-limited and briefly held, so a momentary loss of
   * confirmation neither blanks the number nor makes it jump. Real signal loss
   * clears it through _dropSignal.
   */
  _displayHR(target, t) {
    return this.rateDisplay.update(target, t).value;
  }

  /**
   * Pico, valle y amplitud del ÚLTIMO latido medidos sobre el canal de
   * morfología, que es exactamente el que se dibuja. Así el número del panel y
   * la etiqueta sobre la onda no pueden contradecirse.
   */
  _morphPeaks(t) {
    if (!this.store || this.store.n < 8) return null;
    const beats = this.tracker.beats;
    for (let i = beats.length - 1; i >= 0; i--) {
      const b = beats[i];
      if (!b || !b.confirmed || b.bad) continue;
      if (this._pkFor !== b.id) {
        const fx = detectPulseFeatures(this.store, b, beats[i + 1] || null);
        // El latido más reciente aún no tiene su morfología completa: se usa el
        // anterior en vez de dejar el panel en blanco medio segundo de cada ciclo.
        if (!fx) continue;
        this._pkFor = b.id;
        const peak = fx.peak.abs;
        const valley = fx.foot.abs;
        const amp = Number.isFinite(peak) && Number.isFinite(valley) ? peak - valley : null;
        this._pk = { peak, valley, amp, t };
        // Extremos y dispersión de la sesión, en la misma unidad que las etiquetas
        const sess = this.morphSess;
        if (Number.isFinite(peak)) sess.maxPeak = sess.maxPeak == null ? peak : Math.max(sess.maxPeak, peak);
        if (Number.isFinite(valley)) sess.minValley = sess.minValley == null ? valley : Math.min(sess.minValley, valley);
        if (amp != null) {
          sess.amps.push(amp);
          if (sess.amps.length > 12) sess.amps.shift();
        }
      }
      return this._pk;
    }
    return null;
  }

  getState() {
    const t = this.lastT;
    const s = this.tracker.snapshot(t);
    const evidence = this.evidence[this.sel];
    const gate = this.finger && this.contact && this.usable[this.sel] && this.sigOk && this.qualityOk
      && !this.disturbed && t >= this.artifactUntil && !s.stale;
    const cleanGate = gate && this.qualityOk;
    const intervalHR = s.hr ?? s.hrPreview;
    const agrees = evidence?.hz > 0 && intervalHR > 0
      && Math.abs(intervalHR / 60 - evidence.hz) <= 0.15 * evidence.hz;
    const confirmed = gate && s.locked && agrees && s.quality >= 30 && this.periodicity >= 0.3
      && this.lockSince !== null && t - this.lockSince >= (s.everLocked ? 0.35 : 1);
    const currentBeats = this.tracker.beats.filter(beat => beat.t > this.tracker.invalidAt);
    const rhythm = this.rhythm.update(currentBeats, t, gate);
    // Neither regular nor irregular paths may bypass half/double-rate conflicts.
    const harmonicConflict = evidence?.hz > 0 && [intervalHR, rhythm.meanHR].some(rate => {
      const ratio = rate / (60 * evidence.hz);
      return (ratio >= 1.7 && ratio <= 2.3) || (ratio >= 0.43 && ratio <= 0.59);
    });
    const irregular = gate && !confirmed && !harmonicConflict && rhythm.trusted && rhythm.n >= 10
      && rhythm.shapeQ >= 0.75 && IRREGULAR_KINDS.has(rhythm.kind) && rhythm.meanHR != null;
    const targetHR = confirmed ? s.hr : irregular ? Math.round(rhythm.meanHR) : null;
    const display = this.rateDisplay.update(targetHR, t);
    const shownHR = display.value;
    const holding = display.held && this.finger;
    let state;
    if (!this.finger) state = 'nofinger';
    else if (!this.contact || !this.usable[this.sel] || this.commonMode || this.disturbed || t < this.artifactUntil) state = 'artifact';
    else if (!this.ready || !this.sigOk) state = 'searching';
    else if (confirmed || irregular) state = 'locked';
    else if (holding) state = 'recovering';
    else if (s.stale && s.everLocked) state = 'lost';
    else state = 'acquiring';
    const quality = !gate ? 0 : irregular
      ? Math.round(100 * rhythm.shapeQ * rhythm.trustFrac) : s.quality;
    const amps = this.morphSess.amps;
    const avgAmp = amps.length ? mean(amps) : null;
    const ampVar = amps.length >= 3 && avgAmp > 0 ? (sd(amps) / avgAmp) * 100 : null;
    return {
      state,
      pulseAmbiguous: !!evidence?.ambiguous || (!confirmed && harmonicConflict),
      signalIssue: !this.finger ? 'contact' : this.opticalIssue
        || (!this.contact ? 'contact' : this.disturbed || t < this.artifactUntil ? 'motion'
          : this.frameIntervals.length >= 12 && this.frameInterval > 1 / 12 ? 'sampling' : null),
      displayHr: this.finger ? shownHR : null,
      hrHeld: holding,
      heldAge: holding ? display.age : null,
      cleanSeconds: gate && this.cleanSince !== null ? Math.max(0, t - this.cleanSince) : 0,
      stableSeconds: this.cleanSince !== null ? Math.max(0, t - this.cleanSince) : 0,
      hr: state === 'locked' ? shownHR : null,
      hrIrregular: irregular,
      hrInst: gate ? s.hrInst : null,
      hrPreview: gate && state === 'acquiring' && agrees ? s.hrPreview : null,
      ibiMs: gate ? s.ibiMs : null,
      cv: s.cv,
      validCount: gate ? s.validCount : 0,
      beatCount: s.beatCount,
      quality,
      rhythm,
      peaks: gate ? {
        last: this._morphPeaks(t),
        maxPeak: this.morphSess.maxPeak,
        minValley: this.morphSess.minValley,
        avgAmp,
        ampVar,
      } : {},
      lastBeat: gate ? s.lastBeat : null,
      pi: gate ? Math.round(2.83 * this.scale[this.sel] * 1000) / 10 : null,
      periodicity: this.finger ? this.periodicity : 0,
      tremor: this.finger ? Math.max(0, Math.min(1, this.evidence[this.sel]?.tremorRatio ?? 0)) : 0,
      channel: this.channel,
      finger: this.finger,
      tacho: gate ? this.tracker.tacho(32) : [],
    };
  }
}
