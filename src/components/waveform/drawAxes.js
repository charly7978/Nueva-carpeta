/**
 * Ejes de la regla del monitor.
 * ─────────────────────────────────────────────────────────────
 * Un trazado solo es honesto si se puede leer: la ordenada muestra el porcentaje
 * real de modulación AC/DC (la misma unidad de los puntos fiduciales) y la
 * abscisa, segundos respecto al lápiz. Las marcas se derivan del escalado real
 * del lienzo, así que lo que dice el eje es exactamente lo que mide la rejilla.
 *
 * Se dibujan por fotograma (pocas marcas): el coste es despreciable y la regla
 * nunca se queda desfasada de la ganancia ni de la velocidad del lápiz.
 */

const MONO = '"JetBrains Mono", ui-monospace, monospace';

/** Paso "bonito" (1, 2 o 5 × 10^k) que deja el eje con unas pocas marcas */
function niceStep(span, target = 4) {
  if (!(span > 0)) return 1;
  const raw = span / target;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const norm = raw / mag;
  const mult = norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 5 ? 5 : 10;
  return mult * mag;
}

const fmt = (v) => (Math.abs(v) >= 1 ? v.toFixed(1) : v.toFixed(2));

/**
 * @param pctPerPx % AC/DC por píxel (0 = eje de amplitud no disponible)
 * @param pps      píxeles por segundo
 * @param penT     instante del lápiz
 * @param rangeT   instante del borde izquierdo visible
 */
export function drawAxes(ctx, { W, H, lay, rgb, pps, penT, rangeT, pctPerPx, fs = 10, penX = W - 14 }) {
  const red = rgb !== '0,255,136';
  const ink = red ? 'rgba(255,140,150,0.78)' : 'rgba(150,240,205,0.72)';
  const faint = red ? 'rgba(255,90,105,0.22)' : 'rgba(0,255,136,0.2)';
  ctx.font = `500 ${fs}px ${MONO}`;
  ctx.lineWidth = 1;
  ctx.setLineDash([]);

  // ── Ordenada: % de modulación AC/DC ──
  if (pctPerPx > 0) {
    const spanPct = (lay.band / 2) * pctPerPx;
    const step = niceStep(spanPct, 3);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    for (let v = step; v <= spanPct * 1.001; v += step) {
      for (const sign of [1, -1]) {
        const y = lay.zeroY - (sign * v) / pctPerPx;
        if (y < 8 || y > H - 8) continue;
        ctx.strokeStyle = faint;
        ctx.beginPath();
        ctx.moveTo(0, Math.round(y) + 0.5);
        ctx.lineTo(9, Math.round(y) + 0.5);
        ctx.stroke();
        ctx.fillStyle = ink;
        ctx.fillText(`${sign > 0 ? '+' : '−'}${fmt(v)}`, 12, y);
      }
    }
    ctx.strokeStyle = faint;
    ctx.beginPath();
    ctx.moveTo(0, Math.round(lay.zeroY) + 0.5);
    ctx.lineTo(9, Math.round(lay.zeroY) + 0.5);
    ctx.stroke();
    ctx.fillStyle = ink;
    ctx.fillText('0', 12, lay.zeroY);
  }

  // ── Abscisa: segundos hasta el lápiz ──
  // Va dentro del borde inferior de la banda: por debajo del trazo (su excursión
  // negativa es pequeña) y por encima de las tarjetas del HUD, sin taparse con
  // nada. Fuera de la banda chocaría con el panel inferior.
  if (pps > 0) {
    const secStep = niceStep(W / pps, W < 520 ? 3 : 5);
    const start = Math.ceil(rangeT / secStep) * secStep;
    const base = lay.padTop + lay.band - 18;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    for (let s = start; s <= penT + 1e-6; s += secStep) {
      const x = penX + (s - penT) * pps;
      if (x < 6 || x > W - 24) continue;
      const rel = s - penT;
      ctx.strokeStyle = faint;
      ctx.beginPath();
      ctx.moveTo(Math.round(x) + 0.5, base);
      ctx.lineTo(Math.round(x) + 0.5, base + 6);
      ctx.stroke();
      ctx.fillStyle = ink;
      ctx.fillText(rel === 0 ? '0' : `${rel.toFixed(secStep < 1 ? 1 : 0)}s`, x, base + 8);
    }
  }
}
