/**
 * RhythmAnalyzer — arritmias a partir del patrón de los intervalos entre latidos
 * ─────────────────────────────────────────────────────────────
 * Solo analiza latidos de forma fiable (SQI por pulso) y nunca intervalos que
 * crucen un artefacto: un hueco por movimiento no es una pausa cardíaca.
 *
 * El patrón se reconoce con la diferencia relativa media entre intervalos
 * separados L latidos, dL = media(|RRᵢ − RRᵢ₋ₗ|) / RR_medio:
 *   · bigeminismo   d1 grande, d2 ≈ 0   (corto-largo-corto-largo…)
 *   · trigeminismo  d1,d2 grandes, d3 ≈ 0
 *   · irregular     d1 ≈ d2 ≈ d3 grandes, sin repetición (irregularmente irregular)
 *   · extrasístole  un intervalo corto seguido de una pausa compensatoria
 * Un diagnóstico necesita un ECG: esto es un cribado orientativo.
 */
import { median, mean, populationStd as sdev } from '@/lib/dsp';

const WIN_S = 24;      // ventana de análisis
const MIN_N = 7;       // intervalos fiables mínimos
const HOLD_S = 12;     // un evento aislado se mantiene visible este tiempo


export const RHYTHM_INFO = {
  analyzing: { label: 'Analizando ritmo', short: 'ANALIZANDO', sev: 'idle' },
  regular: { label: 'Ritmo regular', short: 'REGULAR', sev: 'ok' },
  ectopic: { label: 'Latido prematuro', short: 'PREMATURO', sev: 'warn' },
  pause: { label: 'Pausa detectada', short: 'PAUSA', sev: 'warn' },
  ectopic_freq: { label: 'Latidos prematuros frecuentes', short: 'EXTRASÍSTOLES', sev: 'alert' },
  bigeminy: { label: 'Patrón bigeminal', short: 'BIGEMINISMO', sev: 'alert' },
  trigeminy: { label: 'Patrón trigeminal', short: 'TRIGEMINISMO', sev: 'alert' },
  irregular: { label: 'Ritmo irregular · posible FA', short: 'IRREGULAR', sev: 'alert' },
};

/** Ritmos en los que el pulso es válido aunque los intervalos no sean regulares */
export const IRREGULAR_KINDS = new Set(['ectopic_freq', 'bigeminy', 'trigeminy', 'irregular']);

const EMPTY = {
  trusted: false, n: 0, meanHR: null, rmssd: null, sdnn: null,
  irregularity: null, nPremature: 0, nPause: 0, rate: null, shapeQ: 0, trustFrac: 0,
};

export class RhythmAnalyzer {
  constructor() { this.reset(); }

  reset() {
    this.kind = 'analyzing';
    this.cand = 'analyzing';
    this.candT = 0;
  }

  _result(kind, extra, detail) {
    const info = RHYTHM_INFO[kind];
    return { ...EMPTY, ...extra, kind, label: info.label, short: info.short, severity: info.sev, detail };
  }

  /**
   * @param beats lista de latidos del BeatTracker (cronológica)
   * @param t     instante actual (s)
   * @param gate  false mientras haya movimiento o no haya señal
   */
  update(beats, t, gate = true) {
    const win = [];
    for (let i = beats.length - 1; i >= 0; i--) {
      if (t - beats[i].t > WIN_S) break;
      win.push(i);
    }
    win.reverse();

    const qOk = b => b.confirmed && !b.bad && b.q >= 0.65;
    const rr = [];
    let cand = 0;
    for (const i of win) {
      if (i === 0) continue;
      const b = beats[i];
      cand++;
      if (b.ibi == null || b.sus || b.ibi < 0.3 || b.ibi > 2.6) continue;
      if (!qOk(b) || !qOk(beats[i - 1])) continue;
      rr.push({ v: b.ibi, i, b });
    }
    const n = rr.length;
    const trustFrac = cand ? n / cand : 0;
    const qs = win.map((i) => beats[i].q).filter((q) => q != null);
    const shapeQ = qs.length ? mean(qs) : 0;

    if (!gate || n < MIN_N || trustFrac < 0.75 || shapeQ < 0.6) {
      this.kind = 'analyzing';
      this.cand = 'analyzing';
      this.candT = t;
      const why = !gate ? 'Señal inestable — mantén el dedo quieto'
        : n < MIN_N ? 'Reuniendo latidos fiables…'
          : 'Forma de pulso inestable';
      return this._result('analyzing', { n, trustFrac, shapeQ }, why);
    }

    // ── Métricas de los intervalos ───────────────────────────
    const vals = rr.map((x) => x.v);
    const ref = median(vals);
    const meanRR = mean(vals);
    const cv = sdev(vals) / meanRR;

    // Normalizado por la media (no la mediana): en un patrón corto-largo la mediana
    // cae en un extremo u otro y falsearía la escala
    const dl = (L) => {
      let s = 0;
      let c = 0;
      for (let k = L; k < n; k++) {
        if (rr[k].i - rr[k - L].i === L) { s += Math.abs(rr[k].v - rr[k - L].v) / meanRR; c++; }
      }
      return c >= 3 ? s / c : null;
    };
    const d1 = dl(1);
    const d2 = dl(2);
    const d3 = dl(3);

    let sq = 0;
    let sc = 0;
    for (let k = 1; k < n; k++) {
      if (rr[k].i - rr[k - 1].i === 1) { sq += (rr[k].v - rr[k - 1].v) ** 2; sc++; }
    }
    const rmssd = sc ? Math.sqrt(sq / sc) : 0;
    const nR = rmssd / meanRR;
    const dev = vals.filter((v) => Math.abs(v - ref) / ref > 0.15).length / n;

    // ── Eventos: latido adelantado + pausa compensatoria, y pausas ────
    const ectopic = rr.filter((x, k) => x.b.rhy === 'P'
      && (x.b.q == null || x.b.q >= 0.5)
      && rr[k + 1] && rr[k + 1].i === x.i + 1 && rr[k + 1].v > 1.1 * ref);
    const nPre = ectopic.length;
    const nPre12 = ectopic.filter((x) => t - x.b.t <= HOLD_S).length;
    const pauseEv = rr.find((x) => t - x.b.t <= HOLD_S && x.v > 1.8 * ref);

    // Las marcas de la onda quedan solo para lo confirmado: un prematuro es el que
    // lleva pausa detrás, una pausa es la que supera claramente el ritmo
    const isEctopic = new Set(ectopic);
    rr.forEach((x, k) => {
      const hasNext = rr[k + 1] && rr[k + 1].i === x.i + 1;
      if (x.b.rhy === 'P' && hasNext && !isEctopic.has(x)) x.b.rhy = null;
      if (x.b.rhy === 'L' && x.v <= 1.6 * ref) x.b.rhy = null;
    });

    // ── Clasificación ────────────────────────────────────────
    let kind = 'regular';
    let detail = `Variabilidad ${Math.round(cv * 100)} % · intervalos estables`;
    if (n >= 8 && d1 != null && d2 != null && d1 >= 0.2 && d2 <= 0.3 && d2 <= 0.4 * d1) {
      kind = 'bigeminy';
      detail = 'Alternancia corto-largo repetida: un latido prematuro tras cada normal';
    } else if (n >= 9 && d1 != null && d2 != null && d3 != null
      && d1 >= 0.2 && d2 >= 0.2 && d3 <= 0.3 && d3 <= 0.4 * Math.min(d1, d2)) {
      kind = 'trigeminy';
      detail = 'Un latido prematuro cada tres, patrón que se repite';
    } else if (n >= 10 && d1 != null && d2 != null && d3 != null
      && cv >= 0.11 && nR >= 0.14 && dev >= 0.35 && Math.min(d2, d3) >= 0.7 * d1) {
      kind = 'irregular';
      detail = `Intervalos sin patrón repetitivo (variabilidad ${Math.round(cv * 100)} %)`;
    } else if (nPre >= 3) {
      kind = 'ectopic_freq';
      detail = `${nPre} latidos adelantados con pausa compensatoria en ${WIN_S} s`;
    } else if (nPre12 >= 1) {
      kind = 'ectopic';
      detail = 'Latido adelantado seguido de pausa compensatoria';
    } else if (pauseEv) {
      kind = 'pause';
      detail = `Intervalo de ${pauseEv.v.toFixed(1)} s entre latidos`;
    }

    // Histéresis: un diagnóstico cambia solo si el nuevo persiste
    if (kind !== this.cand) { this.cand = kind; this.candT = t; }
    const need = kind === 'regular'
      ? (this.kind === 'analyzing' ? 1 : 4)
      : kind === 'ectopic' || kind === 'pause' ? 0 : 2;
    if (t - this.candT >= need) this.kind = kind;

    const shown = this.kind;
    const meanHR = 60 / meanRR;
    return this._result(shown, {
      trusted: true,
      n,
      meanHR,
      rmssd: Math.round(rmssd * 1000),
      sdnn: Math.round(sdev(vals) * 1000),
      irregularity: Math.round(dev * 100),
      nPremature: nPre,
      nPause: rr.filter((x) => x.b.rhy === 'L').length,
      rate: meanHR < 50 ? 'brady' : meanHR > 100 ? 'tachy' : 'normal',
      shapeQ,
      trustFrac,
      raw: kind,
      stableSeconds: Math.max(0, t - this.candT),
      metrics: { d1, d2, d3, cv, nR, dev },
    }, shown === kind ? detail : RHYTHM_INFO[shown].label);
  }
}