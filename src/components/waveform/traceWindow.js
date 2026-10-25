/**
 * Ventana visible del trazado: muestreo y ganancia de pantalla.
 * ─────────────────────────────────────────────────────────────
 * Dos pasos separados a propósito:
 *  1. Se recogen las muestras cuyo instante cae dentro de la ventana visible y se
 *     mide su excursión real (|v| máximo). Ahí no se toca ningún valor.
 *  2. La ganancia se actualiza con ataque rápido y caída lenta, y se aplica
 *     des- pués a TODA la traza por igual. Escalar una vez es una transformación
 *     lineal: la forma no cambia. Comprimir muestra a muestra (lo que hacía la
 *     tangente hiperbólica anterior) sí la cambia y fabrica mesetas falsas.
 */

const MIN_AMP = 0.22;   // por debajo de esto la señal es ruido: no se amplía sin freno

/**
 * @param store  TraceStore con la morfología
 * @param t0     instante del borde izquierdo visible
 * @param pen    instante del lápiz
 * @param pt     Float64Array de tiempos de salida
 * @param rv     Float32Array de valores crudos de salida
 * @returns número de muestras escritas
 */
export function collectWindow(store, t0, pen, pt, rv, maxPts) {
  const first = store.firstIndex;
  let last = store.n - 1;
  while (last > first && store.timeAt(last) > pen) last--;
  let start = last;
  while (start > first && store.timeAt(start) >= t0) start--;

  let m = 0;
  for (let k = start; k <= last && m < maxPts; k++) {
    pt[m] = store.timeAt(k);
    rv[m] = store.valueAt(k);
    m++;
  }
  // El lápiz siempre tiene muestra: la interpolación lineal del último instante
  if (m && pt[m - 1] < pen - 1e-4 && m < maxPts) {
    pt[m] = pen;
    rv[m] = store.sampleAt(pen);
    m++;
  }
  return m;
}

/** Ganancia automática: sube rápido si la señal crece, baja despacio si decrece */
export function updateGain(gain, rv, m) {
  let peak = 0;
  for (let i = 0; i < m; i++) {
    const a = Math.abs(rv[i]);
    if (Number.isFinite(a) && a > peak) peak = a;
  }
  if (!(peak > 0)) return gain;
  const target = Math.max(MIN_AMP, peak * 0.92);
  if (!(gain > 0)) return target;
  const k = target > gain ? 0.22 : 0.05;
  return gain + (target - gain) * k;
}

/** Factor píxeles por unidad de señal, para una banda y una ganancia dadas */
export function gainToPixels(band, gain) {
  return (band * 0.44) / Math.max(MIN_AMP, gain);
}
