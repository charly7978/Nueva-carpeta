/**
 * Trazado de la onda: interpolación cúbica MONÓTONA (PCHIP, Fritsch–Carlson
 * 1980) convertida a Bézier.
 *
 * Por qué no Catmull-Rom: una spline cardinal clásica sobreoscila entre muestras,
 * así que dibuja un pico donde la señal no lo tiene y aplana el que sí existe.
 * Fritsch & Carlson dan las condiciones necesarias y suficientes para que cada
 * tramo sea monótono; con tangentes nulas en los extremos y el límite circular
 * α² + β² ≤ 9, la curva pasa EXACTAMENTE por cada muestra, no supera los valores
 * medidos y reproduce mesetas como mesetas. Lo que se ve es lo que se midió.
 *
 * Cada tramo cúbico de Hermite se escribe como Bézier con
 *   C1 = P_i + h·m_i/3,  C2 = P_{i+1} − h·m_{i+1}/3
 * que es exactamente el mismo polinomio, sin aproximación.
 */

/** Tangentes PCHIP para los puntos [i0, i1] (ambos inclusive). */
function monotoneSlopes(xs, ys, i0, i1) {
  const n = i1 - i0 + 1;
  const m = new Float64Array(n);
  if (n < 2) return m;
  const h = new Float64Array(n - 1);
  const delta = new Float64Array(n - 1);
  for (let k = 0; k < n - 1; k++) {
    const a = i0 + k;
    h[k] = xs[a + 1] - xs[a];
    delta[k] = h[k] > 1e-9 ? (ys[a + 1] - ys[a]) / h[k] : 0;
  }
  if (n === 2) {
    m[0] = m[1] = delta[0];
    return m;
  }

  // Interior: media armónica ponderada; 0 si los tramos cambian de signo (extremo real)
  for (let k = 1; k < n - 1; k++) {
    const d0 = delta[k - 1];
    const d1 = delta[k];
    if (d0 * d1 <= 0) { m[k] = 0; continue; }
    const w1 = 2 * h[k] + h[k - 1];
    const w2 = h[k] + 2 * h[k - 1];
    m[k] = (w1 + w2) / (w1 / d0 + w2 / d1);
  }

  // Extremos: fórmula de tres puntos, recortada para no salirse del tramo
  const edge = (d0, d1, h0, h1) => {
    const t = ((2 * h0 + h1) * d0 - h0 * d1) / (h0 + h1);
    if (t * d0 <= 0) return 0;
    if (d0 * d1 <= 0 && Math.abs(t) > 3 * Math.abs(d0)) return 3 * d0;
    return t;
  };
  m[0] = edge(delta[0], delta[1], h[0], h[1]);
  m[n - 1] = edge(delta[n - 2], delta[n - 3], h[n - 2], h[n - 3]);

  // Segunda pasada Fritsch–Carlson: si (α, β) cae fuera del círculo de radio 3,
  // se proyecta sobre él. Garantiza monotonía en TODOS los tramos.
  for (let k = 0; k < n - 1; k++) {
    if (Math.abs(delta[k]) < 1e-12) { m[k] = 0; m[k + 1] = 0; continue; }
    const alpha = m[k] / delta[k];
    const beta = m[k + 1] / delta[k];
    const r = alpha * alpha + beta * beta;
    if (r > 9) {
      const tau = 3 / Math.sqrt(r);
      m[k] = tau * alpha * delta[k];
      m[k + 1] = tau * beta * delta[k];
    }
  }
  return m;
}

/** Curva monótona que pasa por todas las muestras y nunca se sale de ellas. */
export function monotonePath(xs, ys, i0, i1) {
  const p = new Path2D();
  p.moveTo(xs[i0], ys[i0]);
  const n = i1 - i0 + 1;
  if (n < 2) return p;
  const m = monotoneSlopes(xs, ys, i0, i1);
  for (let k = 0; k < n - 1; k++) {
    const a = i0 + k;
    const dx = xs[a + 1] - xs[a];
    const third = dx / 3;
    p.bezierCurveTo(
      xs[a] + third, ys[a] + m[k] * third,
      xs[a + 1] - third, ys[a + 1] - m[k + 1] * third,
      xs[a + 1], ys[a + 1],
    );
  }
  return p;
}

/** Nombre histórico: todos los trazados usan ya la interpolación monótona. */
export const smoothPath = monotonePath;

/** Primer índice (de m) cuya marca de tiempo es ≥ time */
export function indexAtOrAfter(ts, m, time) {
  let i = 0;
  while (i < m - 1 && ts[i] < time) i++;
  return i;
}
