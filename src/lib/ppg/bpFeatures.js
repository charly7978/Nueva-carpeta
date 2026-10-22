/**
 * Caracterización morfológica de la onda de pulso (PWA) para presión arterial.
 *
 * Se alinean varios latidos por su pie de onda y se promedian en una plantilla
 * estable; de ahí se extraen los rasgos que la literatura de PWA-PPG relaciona
 * con la presión: índice de aumento (onda reflejada), tiempo de cresta, anchura
 * a mitad de altura y frecuencia cardiaca. La plantilla reduce el ruido de un
 * latido aislado sin suavizar la morfología que aporta la información.
 */
import { elgendiPeakDetector, normalizeSignal } from '@/lib/dsp';

const MAX_BEATS = 20;
const MIN_BEATS = 4;

/** Pies de onda: mínimo local inmediatamente anterior a cada pico sistólico. */
function findFeet(signal, fs, peaks) {
  return peaks.map((p, i) => {
    const back = i > 0 ? Math.min(p - peaks[i - 1], Math.round(fs * 0.45)) : Math.round(fs * 0.3);
    let foot = Math.max(0, p - 1);
    for (let j = Math.max(0, p - back); j < p; j++) if (signal[j] < signal[foot]) foot = j;
    return foot;
  });
}

/** Plantilla media de los últimos latidos, alineada por el pie de onda. */
function averageTemplate(signal, fs, peaks) {
  const use = peaks.slice(-MAX_BEATS);
  if (use.length < MIN_BEATS) return null;

  const feet = findFeet(signal, fs, use);
  const rr = [];
  for (let i = 1; i < use.length; i++) rr.push(use[i] - use[i - 1]);
  const sorted = rr.slice().sort((a, b) => a - b);
  const medRR = sorted[Math.floor(sorted.length / 2)] || 0;
  const len = Math.round(Math.min(medRR, fs * 1.2));
  if (len < Math.round(fs * 0.35)) return null;

  const segs = [];
  for (let i = 0; i < use.length - 1; i++) {
    const start = feet[i];
    if (feet[i + 1] - start < len * 0.6) continue; // latido recortado por el siguiente
    const seg = signal.slice(start, start + len);
    if (seg.length === len) segs.push(seg);
  }
  if (segs.length < MIN_BEATS - 1) return null;

  const tpl = new Array(len).fill(0);
  for (const s of segs) for (let i = 0; i < len; i++) tpl[i] += s[i];
  for (let i = 0; i < len; i++) tpl[i] /= segs.length;
  return { tpl, n: segs.length };
}

export function extractBpFeatures(filteredSignal, fs, hr) {
  if (!filteredSignal || filteredSignal.length < fs * 6) return null;
  if (!(hr > 35 && hr < 200)) return null;

  const norm = normalizeSignal(filteredSignal);
  const { beats } = elgendiPeakDetector(norm, fs);
  if (!beats || beats.length < MIN_BEATS) return null;

  const t = averageTemplate(norm, fs, beats);
  if (!t) return null;
  const { tpl, n } = t;
  const len = tpl.length;

  // Pie y pico sistólico de la plantilla
  let foot = 0;
  for (let i = 1; i < Math.round(len * 0.3); i++) if (tpl[i] < tpl[foot]) foot = i;
  let peak = foot;
  for (let i = foot; i < len; i++) if (tpl[i] > tpl[peak]) peak = i;
  if (peak <= foot) return null;

  const pp = tpl[peak] - tpl[foot];
  if (!(pp > 1e-9)) return null;

  // Tiempo de cresta (pie → pico) y anchura a mitad de altura
  const crest = ((peak - foot) / fs) * 1000;
  const half = tpl[foot] + pp * 0.5;
  let rise = foot;
  for (let i = foot; i <= peak; i++) if (tpl[i] >= half) { rise = i; break; }
  let fall = peak;
  for (let i = len - 1; i >= peak; i--) if (tpl[i] >= half) { fall = i; break; }
  const width = ((fall - rise) / fs) * 1000;

  // Onda reflejada: muesca dicrota y pico posterior → índice de aumento
  const end = Math.min(len - 1, peak + Math.round(len * 0.55));
  let notch = -1;
  for (let i = peak + 1; i < end; i++) {
    if (tpl[i] <= tpl[i - 1] && tpl[i] < tpl[i + 1]) { notch = i; break; }
  }
  let refl = notch;
  if (notch > 0) for (let i = notch; i <= end; i++) if (tpl[i] > tpl[refl]) refl = i;
  const aix = notch > 0 && refl > notch
    ? Math.max(0, Math.min(1, (tpl[refl] - tpl[notch]) / pp))
    : 0;

  return {
    hr: Math.round(hr),
    aix: Math.round(aix * 1000) / 1000,
    crest: Math.round(crest),
    width: Math.round(width),
    beats: n,
  };
}