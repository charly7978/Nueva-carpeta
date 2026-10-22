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
    this.invalidAt = -Infinity;
    this.lastConfirmed = null;
    this.hrIbi = 0;
    this.cv = 1;
    this.validCount = 0;
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

  _y(k) { return this.Y[k % CAP]; }
  _t(k) { return this.T[k % CAP]; }

  // ── Entrada de una muestra ─────────────────────────────────
  /** @param scale escala absoluta (fracción AC/DC) de la muestra, para dar valores reales */
  push(t, y, ok = true, scale = 1) {
    const i = this.n % CAP;
    this.T[i] = t;
    // Detection operates in physical AC/DC units. Display AGC must never create
    // an extremum, alter morphology, or change the timing of a heartbeat.
    this.Y[i] = y * scale;
    this.S[i] = scale;
    this.V[i] = ok ? 1 : 0;
    this.n++;
    this.lastT = t;

    const events = [];
    if (!ok) {
      this.invalidAt = t;
      this.locked = false;
      // hrSmooth survives a single invalid sample: clearing it would restart the
      // smoothing from scratch and make the published rate jump. The staleness
      // check still retires a reading that stops being supported by beats.
      this.pending.length = 0;
      this.outliers.length = 0;
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

  // ── Detección de pico ──────────────────────────────────────
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

    const vt = this._t(tk);
    // Rounded sample windows plus parabolic peak timing can extend the bound
    // by one sample. Without this tolerance, clean single-lobed pulses vanish.
    if (tp - vt < 0.065 || tp - vt > Math.min(1.1, 0.7 * period) + 1 / this.fs) return;
    for (let k = tk; k <= p + 2; k++) if (!this.V[k % CAP]) return;
    const c = {
      t: tp, idx: p, y: y0 / scale, yv: yv / scale, prom,
      // Relative rise speed, independent of perfusion/amplitude modulation.
      steep: 1 / Math.max(1 / this.fs, tp - vt),
      vt, vy: trough / Math.max(1e-12, this.S[tk % CAP]),
      pk: yv * 100,                         // actual filtered % AC/DC
      vl: trough * 100,
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
    const ibi = prev ? c.t - prev.t : null;
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
      t: c.t, idx: c.idx, y: c.yv, prom: c.prom, steep: c.steep,
      vt: c.vt, vy: c.vy,
      pk: c.pk, vl: c.vl, amp: c.pk - c.vl,
      ibi,
      ibiValid: false,
      q: null,
      bad: false,
      confirmed: false,
      sus, ratio, rhy,
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
    const list = this._validIbis(8, false).filter((e) => t - e.t < 14).map((e) => e.v);
    if (list.length < 3) {
      this.validCount = list.length;
      if (list.length < 3) this.locked = false;
      return;
    }
    const m = median(list);
    const kept = list.filter((v) => Math.abs(v - m) <= 0.2 * m);
    const mu = mean(kept);
    // Keep eight intervals for validation, but estimate current HR from the
    // latest five: old recovery/workload intervals must not dominate exercise HR.
    this.hrIbi = 60 / mean(kept.slice(-5));
    this.cv = sd(kept) / mu;
    this.validCount = kept.length;

    // Fracción de latidos recientes con intervalo válido: el ruido de banda
    // estrecha produce picos "casi" regulares, pero nunca una secuencia limpia.
    const recent = this.beats.slice(-13).filter(b => b.ibi != null && !b.sus && b.t > this.invalidAt && b.q != null);
    const good = recent.length ? recent.filter(b => b.ibiValid && b.confirmed && !b.bad && !b.sus).length / recent.length : 0;

    // Semejanza de forma de los últimos pulsos: el ruido filtrado da picos casi
    // regulares pero con forma distinta cada vez; un pulso real se repite.
    const qs = this.beats.slice(-6).filter(b => b.confirmed && t - b.t < 10).map(b => b.q);
    const shape = qs.length >= 4 ? mean(qs) : 0;

    const fresh = this._validIbis(2).length >= 2;
    if (fresh && kept.length >= 5 && this.cv < 0.12 && good >= 0.75 && shape >= 0.78) {
      this.locked = true;
      this.everLocked = true;
    } else if (kept.length < 4 || this.cv > 0.2 || good < 0.55 || shape < 0.6) {
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
      if (!vec || b.t <= this.invalidAt) {
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

      if (!this.template) {
        this.template = vec;
      } else if (q >= 0.8) {
        const blend = new Float32Array(vec.length);
        let nrm = 0;
        for (let i = 0; i < vec.length; i++) { blend[i] = 0.8 * this.template[i] + 0.2 * vec[i]; nrm += blend[i] * blend[i]; }
        nrm = Math.sqrt(nrm) || 1;
        for (let i = 0; i < vec.length; i++) blend[i] /= nrm;
        this.template = blend;
      }
      this.prevWin = vec;

      if (q < 0.65) {
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
    }
  }

  // ── Estado para la interfaz ────────────────────────────────
  snapshot(t) {
    this._updateHR(t, false);
    const age = this.lastConfirmed ? t - this.lastConfirmed.t : Infinity;
    const ref = this._refRR() || 1;
    const stale = !this.lastConfirmed || this.lastConfirmed.t <= this.invalidAt
      || age > Math.max(3.2, 2.6 * ref);
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