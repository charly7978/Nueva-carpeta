/**
 * BeatTracker — detección de latidos en flujo, con latidos DEFINITIVOS
 * ─────────────────────────────────────────────────────────────
 * Recibe la señal filtrada con ganancia de pantalla, pero la reconstruye en
 * unidades AC/DC antes de detectar: la ganancia nunca participa en el tiempo.
 *
 *  1. Pico local confirmado (máximo en ±2 muestras) con interpolación parabólica
 *     sub-muestra (sin prometer precisión superior al hardware). Cada latido
 *     lleva también su VALLE (pie de la onda) y sus valores absolutos.
 *  2. Prominencia adaptativa (pico − valle previo) frente a la mediana de los
 *     latidos aceptados; período refractario derivado del ritmo seguido.
 *     La prominencia sigue la amplitud medida; no baja por un ritmo esperado.
 *     La ventana de morfología se adapta al período para no mezclar pulsos.
 *  3. Validación de cada intervalo RR contra la mediana reciente; resincroniza
 *     si el ritmo cambia de verdad (4 intervalos coherentes entre sí).
 *  4. No rellena huecos ni recupera candidatos débiles por ritmo esperado.
 *  5. SQI por latido: correlación de la forma de cada pulso con la plantilla
 *     y con el pulso anterior. Un latido con forma rota no cuenta para la FC.
 *  6. Cada intervalo se etiqueta frente al ritmo de referencia (prematuro /
 *     pausa) y se marca como sospechoso si cruza muestras inválidas (artefacto):
 *     un hueco por movimiento nunca se confunde con una arritmia.
 *  7. La FC solo se publica (bloqueo) con ≥5 intervalos válidos y dispersión
 *     < 12 %. Si no hay latidos durante varios segundos, se retira.
 */
import { median, mean, populationStd as sd } from '@/lib/dsp';
import { pulseWindow } from '@/lib/ppg/pulseMorphology';

const CAP = 512;

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
const dot = (a, b) => {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i] * b[i];
  return s;
};

export class BeatTracker {
  constructor(fs = 30) {
    this.fs = fs;
    this.beats = [];
    this.reset();
  }

  reset() {
    this.n = 0;
    this.lastT = 0;
    this.Y = new Float32Array(CAP);
    this.T = new Float64Array(CAP);
    this.S = new Float32Array(CAP);   // escala absoluta (AC/DC) de cada muestra
    this.W = new Float32Array(CAP);   // peso de confianza 0..1
    this.V = new Uint8Array(CAP);
    this.beats.length = 0;
    this.ibis = [];
    this.outliers = [];
    this.proms = [];
    this.steeps = [];
    this.pending = [];
    this.template = null;
    this.prevWin = null;
    this.badRun = 0;
    this.lastBeat = null;
    this.prevRawIbi = 0;
    this.beatCount = 0;
    this.hintHz = 0;
    this.hintLobed = false;
    this.hintStrength = 0;
    this.invalidAt = -Infinity;
    this.lastConfirmed = null;
    this.hrIbi = 0;
    this.cv = 1;
    this.validCount = 0;
    this.harmonic = null;
    this.hrFromSpectrum = null;
    this.hrSmooth = null;
    this.lastHrUpdate = null;
    this.locked = false;
    this.everLocked = false;
    this.sessMaxPeak = null;
    this.sessMinValley = null;
  }

  /**
   * Tira la adquisición en curso sin tocar el contador de latidos: se usa cuando
   * la señal deja de ser válida (dedo retirado o vuelto a poner). Ninguna lectura
   * anterior sobrevive al cambio, pero el registro de la sesión no retrocede.
   */
  dropAcquisition() {
    this.n = 0;
    this.Y.fill(0);
    this.T.fill(0);
    this.S.fill(0);
    this.W.fill(0);
    this.V.fill(0);
    this.invalidAt = -Infinity;
    this.lastConfirmed = null;
    this.hintHz = 0;
    this.hintLobed = false;
    this.beats.length = 0;
    this.ibis = [];
    this.outliers = [];
    this.proms = [];
    this.steeps = [];
    this.pending = [];
    this.template = null;
    this.prevWin = null;
    this.badRun = 0;
    this.lastBeat = null;
    this.locked = false;
    this.everLocked = false;
    this.hrSmooth = null;
    this.lastHrUpdate = null;
    this.hrIbi = 0;
    this.validCount = 0;
    this.cv = 1;
    this.prevRawIbi = 0;
  }

  /**
   * Marca una frontera de artefacto sin destruir el historial de intervalos.
   * Los intervalos que la cruzan quedan marcados como sus (sospechosos).
   */
  markBoundary(t) {
    this.invalidAt = t;
  }

  /** Re-siembra sólo la plantilla de forma tras un cambio de canal. */
  resetTemplate() {
    this.template = null;
    this.prevWin = null;
    this.badRun = 0;
  }
   _y(k) { return this.Y[k % CAP]; }
   _t(k) { return this.T[k % CAP]; }

  // ── Entrada de una muestra ─────────────────────────────────
  /** @param scale escala absoluta (fracción AC/DC) de la muestra, para dar valores reales */
  push(t, y, ok = true, scale = 1, weight = 1) {
    const i = this.n % CAP;
    this.T[i] = t;
    this.Y[i] = y * scale;
    this.S[i] = scale;
    this.W[i] = weight;
    this.V[i] = ok ? 1 : 0;
    this.n++;
    this.lastT = t;

    const events = [];
    if (!ok) {
      // Un !ok aislado no destruye el bloqueo ni fija frontera destructiva.
      this.prevRawIbi = 0;
    }
    if (ok && this.n >= 6) this._checkPeak(this.n - 3);
    this._finalize(events);
    return events;
  }

  // ── Referencias de ritmo ───────────────────────────────────
  _validIbis(limit = 8, currentOnly = true) {
    return this.ibis
      .filter(e => e.a.confirmed && e.b.confirmed && !e.a.bad && !e.b.bad
        && !e.b.sus && (!currentOnly || e.a.t > this.invalidAt))
      .slice(-limit);
  }

  _refRR() {
    const v = this._validIbis(8, false).filter(e => this.lastT - e.t < 14).map(e => e.v);
    return v.length >= 2 ? median(v) : v.length === 1 ? v[0] : 0;
  }

  _classify(ibi) {
    if (ibi < 0.27 || ibi > 2.2) { this.prevRawIbi = ibi; return false; }
    const basis = this._refRR() || this.prevRawIbi;
    this.prevRawIbi = ibi;
    if (!basis) return false;
    return ibi >= 0.72 * basis && ibi <= 1.38 * basis;
  }

  _resolveLobe(kept) {
    if (!this.hintHz || (this.hintStrength || 0) < 0.7 || !kept || kept.length < 4) {
      return { factor: 1, confidence: 0 };
    }
    const doubleHz = 2 * this.hintHz;
    const last4 = kept.slice(-4);
    const allDouble = last4.every((v) => {
      const hz = 1 / v;
      return hz >= 0.88 * doubleHz && hz <= 1.12 * doubleHz;
    });
    if (!allDouble) return { factor: 1, confidence: 0 };
    return { factor: 2, confidence: Math.min(1, this.hintStrength) };
  }
  _upstrokeCross(pIdx, footIdx, troughValue, peakValue) {
    const half = troughValue + 0.5 * (peakValue - troughValue);
    let prevK = footIdx;
    let prevV = this._y(footIdx);
    for (let k = footIdx + 1; k <= pIdx; k++) {
      const v = this._y(k);
      if (prevV <= half && v >= half) {
        const frac = (half - prevV) / (v - prevV + 1e-12);
        const tPrev = this._t(prevK);
        const tCurr = this._t(k);
        return tPrev + frac * (tCurr - tPrev);
      }
      prevK = k;
      prevV = v;
    }
    return this._t(pIdx);
  }

  _checkPeak(p) {
    const y0 = this._y(p);
    const ym = this._y(p - 1);
    const ymm = this._y(p - 2);
    const yp = this._y(p + 1);
    const yq = this._y(p + 2);
    // Máximo de la vecindad ±2: tolera un rizado de ruido en la rama descendente
    if (!(y0 > ym && y0 > ymm && y0 >= yp && y0 > yq)) return;
    for (let k = p - 2; k <= p + 2; k++) if (!this.V[k % CAP]) return;

    const den = ym - 2 * y0 + yp;
    const off = Math.abs(den) > 1e-9 ? clamp(0.5 * (ym - yp) / den, -0.5, 0.5) : 0;
    const tp = this._t(p) + off / this.fs;
    const yv = y0 - 0.25 * (ym - yp) * off;   // valor del vértice de la parábola

    // Prominencia: pico − valle entre el latido anterior y éste
    const ref = this._refRR();
    const period = ref || (this.hintHz > 0 ? 1 / this.hintHz : 1);
    // Absolute prominence, not screen gain. Local energy bootstraps the detector.
    let energy = 0;
    const first = Math.max(0, this.n - Math.round(2 * this.fs));
    for (let k = first; k < this.n; k++) energy += this._y(k) ** 2;
    const rms = Math.sqrt(energy / Math.max(1, this.n - first));
    if (this.lastConfirmed && tp - this.lastConfirmed.t > Math.max(3, 2.5 * period)) {
      this.proms.length = 0;
      this.steeps.length = 0;
    }
    const promMin = Math.max(7.5e-5, this.proms.length >= 3 ? 0.3 * median(this.proms) : 1.1 * rms);
    let look = Math.round(Math.min(1.2, 0.7 * period) * this.fs);
    if (this.lastBeat) look = Math.min(look, p - this.lastBeat.idx - 1);
    const kmin = Math.max(0, this.n - CAP + 2);
    let trough = y0;
    let tk = p;
    for (let k = p - 1; k >= p - look && k >= kmin; k--) {
      const v = this._y(k);
      if (v < trough) { trough = v; tk = k; }
      // Nearest substantial local foot, not the absolute minimum of a long
      // inter-beat gap: that minimum can falsely turn a sharp pulse into drift.
      if (k > kmin && v <= this._y(k - 1) && v < this._y(k + 1) && yv - v >= promMin) {
        trough = v; tk = k; break;
      }
    }
    const scale = this.S[p % CAP];
    if (!(scale > 0)) return;
    const prom = look >= 3 ? yv - trough : 0;

    const tm = this._upstrokeCross(p, tk, trough, yv);

    const vt = this._t(tk);
    // Rounded sample windows plus parabolic peak timing can extend the bound
    // by one sample. Without this tolerance, clean single-lobed pulses vanish.
    if (tp - vt < 0.065 || tp - vt > Math.min(1.1, 0.7 * period) + 1 / this.fs) return;
    // Muestras inválidas entre pie y pico: umbral tolerante 25 % (tolera rizado de temblor en el flanco).
    let invalidBetween = 0, totalBetween = 0;
    for (let k = tk; k <= p; k++) { totalBetween++; if (!this.V[k % CAP]) invalidBetween++; }
    const noiseFrac = totalBetween > 0 ? invalidBetween / totalBetween : 0;
    if (noiseFrac > 0.25) return;
    // Peso de confianza por muestras de baja calidad (W < 0.5) entre pie y pico.
    let lowWeight = 0;
    for (let k = tk; k <= p; k++) if (this.W[k % CAP] < 0.5) lowWeight++;
    const weightNoise = totalBetween > 0 ? lowWeight / totalBetween : 0;
     const c = {
       t: tp, idx: p, y: y0 / scale, yv: yv / scale, prom,
       // Relative rise speed, independent of perfusion/amplitude modulation.
       steep: 1 / Math.max(1 / this.fs, tp - vt),
       vt, vy: trough / Math.max(1e-12, this.S[tk % CAP]),
       pk: yv * 100,                         // actual filtered % AC/DC
       vl: trough * 100,
       tm, noise: weightNoise,
     };

    // A two-beat pattern can dominate autocorrelation. It must not impose a
    // long refractory interval that systematically deletes premature pulses.
    const minGap = this.hintLobed && this.hintHz > 0
      ? Math.max(0.27, 0.57 / this.hintHz)
      : Math.max(0.27, Math.min(0.36, 0.45 * period));

    const lb = this.lastBeat;
    // Timing alone never lowers the evidence needed to accept a pulse.
    if (prom < promMin) return;
    // Un "pulso" varias veces mayor que los anteriores es movimiento, no latido
    if (this.proms.length >= 3 && prom > 4 * median(this.proms)) return;
    // Subida demasiado lenta frente a los pulsos aceptados: rizado del filtro, no latido
    if (this.steeps.length >= 4 && c.steep < 0.35 * median(this.steeps)) return;

    if (lb && tp - lb.t < minGap) {
      // Un pico claramente mayor y muy próximo sustituye al anterior (era una
      // ondulación dicrótica o ruido); si no, se descarta como candidato.
      if (!lb.confirmed && prom > (this.hintLobed ? 1.15 : 1.3) * lb.prom
        && tp - lb.t < (this.hintLobed ? minGap : 0.5 * (ref || 0.8))) {
        this._undoLast();
      } else return;
    }
    this._accept(c);
  }

  _undoLast() {
    const b = this.beats.pop();
    if (!b) return;
    this.ibis = this.ibis.filter((e) => e.b !== b);
    this.pending = this.pending.filter((x) => x !== b);
    this.outliers = this.outliers.filter((o) => o.beat !== b);
    this.lastBeat = this.beats[this.beats.length - 1] || null;
  }

  _accept(c) {
    const prev = this.lastBeat;
     const prevTm = prev ? (prev.tm != null ? prev.tm : prev.t) : null;
     const curTm = c.tm != null ? c.tm : c.t;
     const ibi = prev ? curTm - prevTm : null;
    const ref0 = this._refRR();

    // ¿El intervalo cruza muestras inválidas? Entonces no es un dato de ritmo fiable
    let sus = !!prev?.bad;
    if (prev) {
      for (let k = Math.max(prev.idx + 1, this.n - CAP); k < c.idx; k++) {
        if (!this.V[k % CAP]) { sus = true; break; }
      }
    }
    // Etiqueta frente al ritmo seguido: P = adelantado, L = pausa larga
    const ratio = prev && ref0 ? ibi / ref0 : null;
    let rhy = null;
    if (ratio != null && !sus) {
      if (ratio < 0.8 && ibi >= 0.28) rhy = 'P';
      else if (ratio > 1.45 && ibi <= 2.6) rhy = 'L';
    }

    const period = ref0 || (this.hintHz > 0 ? 1 / this.hintHz : ibi || 0.8);
     const beat = {
       id: null,
       pre: Math.max(2, Math.round(this.fs * Math.min(0.24, 0.28 * period))),
       post: Math.max(3, Math.round(this.fs * Math.min(0.32, 0.42 * period))),
       settle: this.hintLobed && !this.lastConfirmed ? Math.ceil(this.fs * 0.58 / this.hintHz) : 0,
       t: c.t, tm: c.tm != null ? c.tm : c.t, idx: c.idx, y: c.yv, prom: c.prom, steep: c.steep,
       vt: c.vt, vy: c.vy,
       pk: c.pk, vl: c.vl, amp: c.pk - c.vl,
       ibi,
       ibiValid: false,
       q: null,
       bad: false,
       confirmed: false,
       sus, ratio, rhy,
       noise: c.noise ?? 0,
       w: 1,
     };

    if (prev) {
      beat.ibiValid = !sus && this._classify(beat.ibi);
      if (beat.ibiValid) {
        this.ibis.push({ v: beat.ibi, t: c.t, a: prev, b: beat });
        if (this.ibis.length > 120) this.ibis.shift();
        this.outliers.length = 0;
      } else if (!sus) {
        this.outliers.push({ ibi: beat.ibi, beat, prev });
        if (this.outliers.length > 4) this.outliers.shift();
        // Cambio de ritmo real: 4 intervalos coherentes entre sí → resincronizar
        if (this.outliers.length === 4) {
          const m = median(this.outliers.map((o) => o.ibi));
          if (m > 0.28 && this.outliers.every((o) => Math.abs(o.ibi - m) <= 0.08 * m)) {
            this.ibis = this.outliers.map((o) => ({ v: o.ibi, t: o.beat.t, a: o.prev, b: o.beat }));
            this.outliers.forEach((o) => { o.beat.ibiValid = true; });
            this.outliers.length = 0;
          }
        }
      }
    }

    this.beats.push(beat);
    if (this.beats.length > 60) this.beats.shift();
    this.lastBeat = beat;
    this.pending.push(beat);
    // A candidate is NOT a beat event. Its complete shape is validated below.
  }

  // ── FC desde los intervalos validados ──────────────────────
  _updateHR(t, smooth) {
    const entries = this._validIbis(8, false).filter((e) => t - e.t < 14);
    const list = entries.map((e) => e.v);
    if (list.length < 3) {
      this.validCount = list.length;
      if (list.length < 3) this.locked = false;
      return;
    }
    const m = median(list);
    const keptEntries = entries.filter((e) => Math.abs(e.v - m) <= 0.2 * m);
    const kept = keptEntries.map((e) => e.v);
    const weights = keptEntries.map((e) => (e.b && e.b.w != null ? e.b.w : 1));
    const wSum = weights.reduce((a, b) => a + b, 0) || 1;
    const wMean = (vals, ws) => {
      let s = 0, sw = 0;
      for (let i = 0; i < vals.length; i++) { s += vals[i] * ws[i]; sw += ws[i]; }
      return sw > 0 ? s / sw : (vals.length ? vals.reduce((a,b)=>a+b,0)/vals.length : 0);
    };
    const mu = wMean(kept, weights);
    // hrIbi from last 5 (weighted)
    const last5Entries = keptEntries.slice(-5);
    const last5Vals = last5Entries.map((e) => e.v);
    const last5Weights = last5Entries.map((e) => (e.b && e.b.w != null ? e.b.w : 1));
    this.hrIbi = 60 / Math.max(1e-9, wMean(last5Vals, last5Weights));
    this.cv = Math.sqrt(kept.reduce((s, v) => s + (v - mu) ** 2, 0) / Math.max(1, kept.length - 1)) / mu;
    this.validCount = kept.length;

    // Arbitraje de armónico: si los intervalos son ≈2× el espectro, es doble conteo.
    const lobe = this._resolveLobe(kept);
    if (lobe.factor === 2) {
      this.harmonic = 'double';
      this.hrFromSpectrum = 60 * this.hintHz;
      this.hrIbi = 60 * this.hintHz;
    } else {
      this.harmonic = null;
      this.hrFromSpectrum = null;
    }
    const recent = this.beats.slice(-13).filter(b => b.ibi != null && !b.sus && b.t > this.invalidAt && b.q != null);
    const good = recent.length ? recent.filter(b => b.ibiValid && b.confirmed && !b.bad && !b.sus).length / recent.length : 0;

    const qs = this.beats.slice(-6).filter(b => b.confirmed && t - b.t < 10).map(b => b.q);
    const shape = qs.length >= 4 ? mean(qs) : 0;

    const fresh = this._validIbis(2).length >= 2;
    if (fresh && kept.length >= 4 && this.cv < 0.16 && good >= 0.4 && shape >= 0.4) {
      this.locked = true;
      this.everLocked = true;
    } else if (kept.length < 4 || this.cv > 0.22 || good < 0.3 || shape < 0.3) {
      this.locked = false;
    }
    if (this.locked && (smooth || this.hrSmooth == null)) {
      const dt = this.lastHrUpdate == null ? 0 : Math.max(0, t - this.lastHrUpdate);
      const tau = this.cv < 0.08 && good >= 0.9 && shape >= 0.85 ? 1.25 : 2.5;
      const alpha = 1 - Math.exp(-dt / tau);
      this.hrSmooth = this.hrSmooth == null ? this.hrIbi : this.hrSmooth + alpha * (this.hrIbi - this.hrSmooth);
      this.lastHrUpdate = t;
    }
  }

  // ── SQI por latido (forma del pulso) ───────────────────────
  _windowVec(beat) { return pulseWindow(this, beat); }

  _finalize(events) {
    while (this.pending.length && this.pending[0].idx
      + Math.max(this.pending[0].post, this.pending[0].settle || 0) <= this.n - 1) {
      const b = this.pending.shift();
      const vec = this._windowVec(b);
      const corruptedRise = this.invalidAt >= (b.vt ?? (b.t - 0.2)) && this.invalidAt <= b.t;
      if (!vec || corruptedRise) {
        b.bad = true;
        b.q = 0;
        b.ibiValid = false;
        continue;
      }

      // One isolated pulse cannot validate its own morphology.
      if (!this.template) {
        this.template = vec;
        this.prevWin = vec;
        b.q = 0;
        b.bad = true;
        b.ibiValid = false;
        continue;
      }
      let q = 0;
      if (this.template) {
        const qt = dot(vec, this.template);
        const qp = this.prevWin ? dot(vec, this.prevWin) : -1;
        q = Math.max(qt, qp);
        // La plantilla estaba mal sembrada: dos pulsos seguidos coherentes la reemplazan
        if (qt < 0.5 && qp >= 0.85) this.template = vec;
      }
       b.q = q;
       b.w = clamp(q * (1 - 0.7 * (b.noise ?? 0)), 0.2, 1);

       if (q < 0.3) {
         b.bad = true;
         this.badRun++;
         if (this.badRun >= 6) { this.template = vec; this.badRun = 0; }
         this._updateHR(this.lastT, false);
       } else {
         this.badRun = 0;
         b.confirmed = true;
         b.id = ++this.beatCount;
         this.lastConfirmed = b;
         this.proms.push(b.prom);
         this.steeps.push(b.steep);
         if (this.proms.length > 8) this.proms.shift();
         if (this.steeps.length > 8) this.steeps.shift();
         if (this.sessMaxPeak === null || b.pk > this.sessMaxPeak) this.sessMaxPeak = b.pk;
         if (this.sessMinValley === null || b.vl < this.sessMinValley) this.sessMinValley = b.vl;
         this._updateHR(this.lastT, true);
         events.push({ type: 'beat', beat: b });
       }
      if (q >= 0.8) {
        const blend = new Float32Array(vec.length);
        let nrm = 0;
        for (let i = 0; i < vec.length; i++) { blend[i] = 0.8 * this.template[i] + 0.2 * vec[i]; nrm += blend[i] * blend[i]; }
        nrm = Math.sqrt(nrm) || 1;
        for (let i = 0; i < vec.length; i++) blend[i] /= nrm;
        this.template = blend;
      }
       this.prevWin = vec;
    }
  }

  // ── Estado para la interfaz ────────────────────────────────
  snapshot(t) {
    this._updateHR(t, false);
    const age = this.lastConfirmed ? t - this.lastConfirmed.t : Infinity;
    const ref = this._refRR() || 1;
    const recentBeats = this.beats.filter(b => b.confirmed && b.t > this.invalidAt).slice(-8);
    const recentValid = recentBeats.filter(b => b.ibiValid && !b.bad && !b.sus).length;
    const recentFrac = recentBeats.length ? recentValid / recentBeats.length : 0;
    const stale = !this.lastConfirmed
      || age > Math.max(3.2, 2.6 * ref)
      || (this.lastConfirmed.t <= this.invalidAt && age > Math.max(1.8, 1.5 * ref))
      || (recentBeats.length >= 4 && recentFrac < 0.4 && age > 1.5);
    if (stale) { this.locked = false; this.hrSmooth = null; }

    const recent = this.beats.filter(b => b.confirmed && b.t > this.invalidAt).slice(-8);
    const qs = recent.filter((b) => b.q != null).map((b) => b.q);
    // Intervals crossing a known interruption are excluded, not counted as
    // malformed beats; at least two entirely fresh intervals are still required.
    const eligible = recent.filter(b => b.ibi != null && !b.sus);
    const goodFrac = eligible.length ? eligible.filter(b => b.ibiValid && !b.bad).length / eligible.length : 0;
    const quality = stale || !recent.length
      ? 0
      : Math.round(100 * clamp(mean(qs.length ? qs : [0.5]), 0, 1) * goodFrac);

    const lastValid = this._validIbis(1)[0];
    const lb = this.lastConfirmed;
    const lbOk = lb && !stale && !lb.sus && lb.ibi != null && lb.ibi >= 0.28 && lb.ibi <= 2.2;
    return {
      locked: this.locked && !stale,
      stale,
      hr: this.locked && !stale && this.hrSmooth != null ? Math.round(this.hrSmooth) : null,
      hrPreview: !stale && this.validCount >= 3 ? Math.round(this.hrIbi) : null,
      hrInst: lbOk ? Math.round(60 / lb.ibi) : null,
      cv: this.cv,
      validCount: this.validCount,
      quality,
      ibiMs: lastValid ? Math.round(lastValid.v * 1000) : null,
      beatCount: this.beatCount,
      everLocked: this.everLocked,
      harmonic: this.harmonic,
      hrFromSpectrum: this.hrFromSpectrum,
      lastBeat: lb && lb.t > this.invalidAt
        ? {
          id: lb.id,
          ibiMs: lbOk ? Math.round(lb.ibi * 1000) : null,
          pk: lb.pk, vl: lb.vl, amp: lb.amp, rhy: lb.rhy,
        }
        : null,
    };
  }

  /** Picos y valles: último latido, extremos de la sesión y amplitud reciente */
  peakStats() {
    const rec = this.beats.filter(b => b.confirmed && !b.bad && b.t > this.invalidAt && b.pk != null).slice(-12);
    const last = rec[rec.length - 1] || null;
    const amps = rec.map((b) => b.amp);
    const am = mean(amps);
    return {
      last: last ? { peak: last.pk, valley: last.vl, amp: last.amp } : null,
      maxPeak: this.sessMaxPeak,
      minValley: this.sessMinValley,
      avgAmp: amps.length ? am : null,
      ampVar: amps.length >= 3 && am > 0 ? (sd(amps) / am) * 100 : null,
    };
  }

  /** Intervalos RR validados (ms) para HRV */
  validIbiMs(limit = 60) {
    const entries = this._validIbis(limit);
    let start = entries.length - 1;
    while (start > 0 && entries[start - 1].b === entries[start].a) start--;
    return entries.slice(Math.max(0, start)).map(e => e.v * 1000);
  }

  /** Serie de intervalos latido a latido para el tacograma */
  tacho(n = 32) {
    const out = [];
    for (const b of this.beats.slice(-(n + 1))) {
      if (b.confirmed && b.ibi != null) out.push({ ms: Math.round(b.ibi * 1000), ok: b.ibiValid && !b.bad && !b.sus, rhy: b.rhy });
    }
    return out;
  }
}