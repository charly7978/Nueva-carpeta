/**
 * Curva suave que pasa exactamente por cada muestra (Catmull-Rom → Bézier).
 * A 30 Hz, unir muestras con rectas da un trazo poligonal; así la onda se ve
 * continua y los picos caen justo donde están los marcadores.
 */
export function smoothPath(xs, ys, i0, i1) {
  const p = new Path2D();
  p.moveTo(xs[i0], ys[i0]);
  for (let i = i0; i < i1; i++) {
    const a = i > i0 ? i - 1 : i;
    const d = i + 2 <= i1 ? i + 2 : i + 1;
    p.bezierCurveTo(
      xs[i] + (xs[i + 1] - xs[a]) / 6, ys[i] + (ys[i + 1] - ys[a]) / 6,
      xs[i + 1] - (xs[d] - xs[i]) / 6, ys[i + 1] - (ys[d] - ys[i]) / 6,
      xs[i + 1], ys[i + 1],
    );
  }
  return p;
}

/** Primer índice (de m) cuya marca de tiempo es ≥ time */
export function indexAtOrAfter(ts, m, time) {
  let i = 0;
  while (i < m - 1 && ts[i] < time) i++;
  return i;
}