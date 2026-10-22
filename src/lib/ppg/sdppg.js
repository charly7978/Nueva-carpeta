/**
 * Second Derivative Photoplethysmogram (SDPPG / APG - Acceleration Plethysmogram)
 * ─────────────────────────────────────────────────────────────────────────────
 * Extrae las ondas características (a, b, c, d, e) de la segunda derivada del
 * pulso cardíaco para evaluar rigidez arterial y elasticidad vascular según
 * el modelo de Takazawa et al. (1998):
 *
 *   - Onda a: pico sistólico inicial positivo (aceleración máxima).
 *   - Onda b: inflexión / valle sistólico precoz (deceleración).
 *   - Onda c: re-aceleración sistólica tardía.
 *   - Onda d: deceleración sistólica tardía.
 *   - Onda e: onda dicrota diastólica precoz (rebote elástico).
 *
 * Índice de Envejecimiento Vascular (Vascular Aging Index - AGI):
 *   AGI = (b - c - d - e) / a
 * ─────────────────────────────────────────────────────────────────────────────
 */

/**
 * Filtro suavizador binomial de 5 puntos (equivalente a Savitzky-Golay de bajo orden).
 * Elimina el ruido de alta frecuencia sin alterar la fase temporal de las ondas.
 */
function smooth5(arr) {
  const n = arr.length;
  if (n < 5) return arr.slice();
  const out = new Float64Array(n);
  out[0] = arr[0];
  out[1] = (arr[0] + 2 * arr[1] + arr[2]) / 4;
  for (let i = 2; i < n - 2; i++) {
    out[i] = (arr[i - 2] + 4 * arr[i - 1] + 6 * arr[i] + 4 * arr[i + 1] + arr[i + 2]) / 16;
  }
  out[n - 2] = (arr[n - 3] + 2 * arr[n - 2] + arr[n - 1]) / 4;
  out[n - 1] = arr[n - 1];
  return Array.from(out);
}

/**
 * Calcula la segunda derivada numérica centrada d²x/dt².
 */
function secondDerivative(signal, dt) {
  const n = signal.length;
  if (n < 3) return new Float64Array(n).fill(0);
  const d2 = new Float64Array(n);
  const dt2 = dt * dt;
  for (let i = 1; i < n - 1; i++) {
    d2[i] = (signal[i + 1] - 2 * signal[i] + signal[i - 1]) / dt2;
  }
  d2[0] = d2[1];
  d2[n - 1] = d2[n - 2];
  return d2;
}

/**
 * Analiza la morfología de la plantilla de pulso para obtener las ondas SDPPG y el AGI.
 *
 * @param {number[]} template - Plantilla media normalizada del pulso.
 * @param {number} fs - Frecuencia de muestreo (Hz).
 * @returns {object|null} Rasgos SDPPG calculados o null si la morfología es insuficiente.
 */
export function analyzeSDPPG(template, fs) {
  if (!template || template.length < Math.round(fs * 0.35)) return null;

  const dt = 1 / fs;
  const smoothed = smooth5(template);
  const rawD2 = secondDerivative(smoothed, dt);
  const apg = smooth5(Array.from(rawD2));
  const len = apg.length;

  // 1. Onda a: Máximo positivo en el primer tercio del pulso (sístole temprana)
  const aSearchEnd = Math.min(len - 1, Math.round(len * 0.35));
  let aIdx = 1;
  for (let i = 2; i <= aSearchEnd; i++) {
    if (apg[i] > apg[aIdx]) aIdx = i;
  }
  const ampA = apg[aIdx];
  if (ampA <= 1e-6) return null; // Sin pico sistólico positivo claro

  // 2. Onda b: Mínimo local inmediatamente posterior a la onda a
  const bSearchEnd = Math.min(len - 1, aIdx + Math.round(len * 0.25));
  let bIdx = aIdx + 1;
  for (let i = aIdx + 1; i <= bSearchEnd; i++) {
    if (apg[i] < apg[bIdx]) bIdx = i;
  }
  const ampB = apg[bIdx];

  // 3. Onda c: Máximo local entre b y el 55% del pulso
  const cSearchEnd = Math.min(len - 1, Math.round(len * 0.55));
  let cIdx = bIdx + 1;
  for (let i = bIdx + 1; i <= cSearchEnd; i++) {
    if (apg[i] > apg[cIdx]) cIdx = i;
  }
  const ampC = apg[cIdx];

  // 4. Onda d: Mínimo local entre c y el 70% del pulso (deceleración sistólica tardía)
  const dSearchEnd = Math.min(len - 1, Math.round(len * 0.70));
  let dIdx = cIdx + 1;
  for (let i = cIdx + 1; i <= dSearchEnd; i++) {
    if (apg[i] < apg[dIdx]) dIdx = i;
  }
  const ampD = apg[dIdx];

  // 5. Onda e: Máximo diastólico en el tramo dicroto (60% al 85% del ciclo)
  const eSearchStart = Math.min(len - 1, Math.max(dIdx + 1, Math.round(len * 0.55)));
  const eSearchEnd = Math.min(len - 1, Math.round(len * 0.88));
  let eIdx = eSearchStart;
  for (let i = eSearchStart; i <= eSearchEnd; i++) {
    if (apg[i] > apg[eIdx]) eIdx = i;
  }
  const ampE = apg[eIdx];

  // Ratios normalizados respecto a la onda a
  const b_a = ampB / ampA;
  const c_a = ampC / ampA;
  const d_a = ampD / ampA;
  const e_a = ampE / ampA;

  // Vascular Aging Index: (b - c - d - e) / a
  const rawAgi = (ampB - ampC - ampD - ampE) / ampA;
  // AGI fisiológico acotado entre -1.5 (arterias muy elásticas / jóvenes) y +1.5 (arterias rígidas)
  const agi = Math.max(-1.5, Math.min(1.5, Math.round(rawAgi * 100) / 100));

  return {
    agi,
    ratios: {
      b_a: Math.round(b_a * 100) / 100,
      c_a: Math.round(c_a * 100) / 100,
      d_a: Math.round(d_a * 100) / 100,
      e_a: Math.round(e_a * 100) / 100,
    },
    waves: {
      a: { idx: aIdx, amp: Math.round(ampA * 100) / 100 },
      b: { idx: bIdx, amp: Math.round(ampB * 100) / 100 },
      c: { idx: cIdx, amp: Math.round(ampC * 100) / 100 },
      d: { idx: dIdx, amp: Math.round(ampD * 100) / 100 },
      e: { idx: eIdx, amp: Math.round(ampE * 100) / 100 },
    },
  };
}
