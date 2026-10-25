/**
 * Puntos fiduciales del pulso, medidos SOBRE LA MISMA TRAZA QUE SE DIBUJA.
 * ─────────────────────────────────────────────────────────────
 * Morfología del PPG (Allen 2007; Yu et al. 2025, «ideal PPG morphology»):
 * pie → frente sistólico → PICO SISTÓLICO (P1) → ESCOTADURA DICRÓTICA (cierre
 * aórtico) → PICO DIASTÓLICO / onda reflejada (P2) → decaimiento.
 *
 * Se busca en el canal de morfología del TraceStore (0,1–10 Hz), no en el de
 * detección: así el marcador cae exactamente donde el ojo ve el pico y el valor
 * rotulado es el de la muestra dibujada. Si la ventana del latido todavía no ha
 * llegado completa, devuelve null: nunca se inventa el tramo que falta.
 *
 * Una MESETA solo se declara cuando hay un tramo realmente plano en el extremo
 * (saturación del sensor). Se muestra tal cual, sin disimularla, y no se
 * confunde con el vértice redondeado de un pico normal.
 */

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

/** Vértice parabólico sobre tres muestras: tiempo y valor sub-muestra */
function refine(store, i) {
  const y0 = store.valueAt(i - 1);
  const y1 = store.valueAt(i);
  const y2 = store.valueAt(i + 1);
  const den = y0 - 2 * y1 + y2;
  const off = Math.abs(den) > 1e-12 ? clamp((0.5 * (y1 - y0)) / den, -0.5, 0.5) : 0;
  const t0 = store.timeAt(i - 1);
  const t2 = store.timeAt(i + 1);
  const dt = (t2 - t0) / 2;
  const a0 = store.absAt(i - 1);
  const a1 = store.absAt(i);
  const a2 = store.absAt(i + 1);
  return {
    i,
    t: store.timeAt(i) + off * dt,
    v: y1 - 0.25 * (y0 - y2) * off,
    abs: Number.isFinite(a1) ? a1 + 0.5 * off * (a2 - a0) : a1,
  };
}

/** Extremo dentro de [from, to] con refinado sub-muestra */
function extremum(store, from, to, max) {
  let best = -1;
  let bestV = max ? -Infinity : Infinity;
  for (let k = from; k <= to; k++) {
    const v = store.valueAt(k);
    if (!Number.isFinite(v)) continue;
    if (max ? v > bestV : v < bestV) { bestV = v; best = k; }
  }
  if (best < 0) return null;
  const lo = Math.max(from, best - 1);
  const hi = Math.min(to, best + 1);
  if (hi - lo < 2) return { i: best, t: store.timeAt(best), v: bestV, abs: store.absAt(best) };
  return refine(store, Math.min(hi - 1, Math.max(lo + 1, best)));
}

/** Meseta real: ≥4 muestras planas pegadas al extremo del tramo (saturación) */
function findPlateau(store, from, to, range) {
  const tol = Math.max(1e-7, 0.02 * range);
  let top = -Infinity;
  for (let k = from; k <= to; k++) {
    const v = store.valueAt(k);
    if (Number.isFinite(v) && v > top) top = v;
  }
  if (!Number.isFinite(top)) return null;
  let start = -1;
  let bestStart = -1;
  let bestLen = 0;
  for (let k = from; k <= to; k++) {
    const v = store.valueAt(k);
    const flat = Number.isFinite(v) && k < to
      && Math.abs(store.valueAt(k + 1) - v) <= tol
      && Math.abs(v - top) <= 0.12 * range;
    if (flat) { if (start < 0) start = k; continue; }
    if (start >= 0) {
      if (k - start > bestLen) { bestLen = k - start; bestStart = start; }
      start = -1;
    }
  }
  if (bestStart < 0 || bestLen < 4) return null;
  const t0 = store.timeAt(bestStart);
  const t1 = store.timeAt(bestStart + bestLen);
  if (t1 - t0 < 0.06) return null;
  const mid = store.absAt(bestStart + (bestLen >> 1));
  return { t0, t1, v: top, abs: mid };
}

/**
 * @param store TraceStore con la morfología
 * @param beat  latido confirmado del BeatTracker
 * @param next  latido siguiente (o null)
 */
export function detectPulseFeatures(store, beat, next) {
  if (!store || store.n < 8 || !beat) return null;
  const pen = store.lastT;
  const period = next ? Math.max(0.3, next.t - beat.t) : (beat.ibi || 0.85);
  const end = Math.min(pen - 1e-3, beat.t + Math.min(0.62, 0.78 * period));
  if (end < beat.t + 0.16) return null; // ventana incompleta

  const i0 = store.indexAt(beat.vt - 0.05);
  const iEnd = store.indexAt(end);
  if (iEnd - i0 < 6) return null;

  const peak = extremum(store, i0, iEnd, true);
  const foot = peak ? extremum(store, i0, peak.i, false) : null;
  if (!peak || !foot) return null;
  const range = peak.v - foot.v;
  if (!(range > 1e-6)) return null;

  // Escotadura dicrótica y pico diastólico: mínimo local tras el pico y rebote posterior
  let notch = null;
  let diastolic = null;
  const after = Math.min(iEnd, peak.i + Math.max(3, Math.round(0.05 * 30)));
  if (iEnd - after >= 4) {
    const trough = extremum(store, after, iEnd, false);
    if (trough) {
      const back = extremum(store, trough.i, iEnd, true);
      if (back && back.v - trough.v >= 0.06 * range && peak.v - trough.v >= 0.12 * range) {
        notch = trough;
        if (back.v - peak.v >= -0.02 * range) diastolic = back;
      }
    }
  }

  return {
    peak,
    foot,
    notch,
    diastolic,
    plateau: findPlateau(store, i0, iEnd, range),
    amp: range,
    period,
  };
}
