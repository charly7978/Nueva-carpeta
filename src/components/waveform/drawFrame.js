/**
 * Fotograma del monitor: compone todo lo que se ve sobre el lienzo.
 * ─────────────────────────────────────────────────────────────
 * Orden de pintado pensado para que nada tape la señal:
 *   rejilla cacheada → guías de latido → relleno y trazo → puntos fiduciales →
 *   aviso de arritmia → regla (ejes) → lápiz.
 * La traza se dibuja con PCHIP y ganancia lineal, así que lo que aparece en
 * pantalla es la señal medida, sin picos inventados ni mesetas artificiales.
 */
import { GREEN, RED, buildGridLayer } from './canvasAssets';
import drawLiveTrace from './drawLiveTrace';
import { drawBeats } from './drawBeats';
import { drawArrhythmiaAlert } from './drawArrhythmiaAlert';
import { drawStandby } from './drawStandby';
import { drawAxes } from './drawAxes';
import { drawFiducials } from './drawFiducials';
import { collectWindow, updateGain, gainToPixels } from './traceWindow';
import { collectFiducials } from './fiducialItems';

const MAXPTS = 1400;
const MONO = '"JetBrains Mono", ui-monospace, monospace';
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

/**
 * Leyenda de instrumento, al pie de la banda: ahí la señal no llega (su
 * excursión negativa es pequeña), así que nunca tapa el pico ni el valle.
 * En pantallas estrechas se queda solo la línea de identificación.
 */
function drawCaption(ctx, W, lay, fs) {
  const y0 = lay.padTop + lay.band - (fs + 8) * 2 - 22;
  ctx.font = `600 ${fs}px ${MONO}`;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  // x = 48: deja libre la columna donde el eje de amplitud escribe sus marcas.
  ctx.fillStyle = 'rgba(170,255,220,0.4)';
  ctx.fillText('PPG · MORFOLOGÍA 0,1–10 Hz · ESCALA AUTO', 48, y0);
  if (W >= 620) {
    ctx.fillStyle = 'rgba(170,255,220,0.28)';
    ctx.fillText('P1 PICO SISTÓLICO   ◇ ESCOTADURA   P2 ONDA REFLEJADA   ○ PIE', 48, y0 + fs + 5);
  }
}

/**
 * @param ctx    contexto 2D del lienzo
 * @param canvas elemento (para leer nada más que el tamaño)
 * @param s      estado compartido con el componente (W, H, dpr, lay, layers, grads, sprites)
 */
export function createFrameRenderer(ctx, canvas, s) {
  const pt = new Float64Array(MAXPTS);
  const rv = new Float32Array(MAXPTS);
  const px = new Float32Array(MAXPTS);
  const py = new Float32Array(MAXPTS);
  const fxCache = new Map();
  let gain = 0;

  return function frame(store, rhythm, live) {
    const { W, H, dpr, lay } = s;
    if (!W || !lay) return;

    const alert = !!rhythm?.alert;
    const rgb = alert ? RED : GREEN;
    const lk = alert ? 'Red' : 'Ok';
    const fs = W < 520 ? 10 : 12;
    if (!s.layers[lk]) s.layers[lk] = buildGridLayer(W, H, dpr, rgb, lay);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.drawImage(s.layers[lk], 0, 0, W, H);
    // Halo de llegada de la señal: bajo el trazo, nunca encima
    ctx.fillStyle = s.grads[`pen${lk}`];
    ctx.fillRect(0, 0, W, H);

    // En horizontal el panel de métricas ocupa la derecha: el trazado reserva esa
    // columna, así el lápiz y el último latido nunca quedan bajo una tarjeta.
    const plotW = W >= 900 ? W * 0.64 : W;
    const pps = plotW < 360 ? plotW / 3 : clamp(plotW * 0.45, 150, 480);
    const penX = plotW - 14;
    const nowSec = performance.now() / 1000;

    if (!live || !store || store.n < 5) {
      ctx.fillStyle = s.grads[`pen${lk}`];
      ctx.fillRect(0, 0, W, H);
      drawStandby(ctx, W, H, s, rgb);
      drawAxes(ctx, { W, H, lay, rgb, pps, penT: 0, rangeT: -penX / pps, pctPerPx: 0, fs, penX });
      return;
    }

    const pen = store.penTime(nowSec);
    const t0 = pen - penX / pps - 0.1;
    const xOf = (t) => penX + (t - pen) * pps;

    const m = collectWindow(store, t0, pen, pt, rv, MAXPTS);
    if (m < 3) {
      drawStandby(ctx, W, H, s, rgb);
      drawAxes(ctx, { W, H, lay, rgb, pps, penT: 0, rangeT: -penX / pps, pctPerPx: 0, fs, penX });
      return;
    }

    // Ganancia lineal única para toda la traza: la forma no se toca
    gain = updateGain(gain, rv, m);
    const scalePx = gainToPixels(lay.band, gain);
    const yOf = (v) => lay.zeroY - v * scalePx;
    for (let i = 0; i < m; i++) {
      px[i] = xOf(pt[i]);
      py[i] = Number.isFinite(rv[i]) ? yOf(rv[i]) : NaN;
    }

    const beats = store.beats || [];
    let lastBeat = null;
    for (let i = beats.length - 1; i >= 0; i--) {
      if (beats[i].confirmed && !beats[i].bad) { lastBeat = beats[i]; break; }
    }
    const since = lastBeat ? pen - lastBeat.t : 9;
    const pulse = lastBeat && since >= 0 && since < 1 ? Math.exp(-since * 4.5) : 0;

    // Guías de latido y marcas de ritmo, por debajo del trazo
    drawBeats(ctx, { beats, t0, xOf, yOf, W, lay, alert, fs });

    drawLiveTrace(ctx, {
      px, py, pt, m, lay, rgb, pulse, gradients: s.grads, key: lk,
      beats, t0, alert, width: W,
    });

    // Morfología rotulada sobre la misma traza que se acaba de pintar
    const items = collectFiducials(store, beats, fxCache);
    drawFiducials(ctx, { items, xOf, yOf, W, lay, alert, fs, timeNow: performance.now() });

    let flagged = false;
    for (let i = beats.length - 1; i >= 0; i--) {
      const b = beats[i];
      if (!b || b.t < t0 - 0.3) break;
      if (b.confirmed && !b.bad && !b.sus && (b.rhy === 'P' || b.rhy === 'L')) { flagged = true; break; }
    }
    drawArrhythmiaAlert(ctx, { alert, flagged, W, lay, label: rhythm?.label, fs });

    // Regla real: % de modulación AC/DC en ordenada, segundos en abscisa
    let mScale = 0;
    if (store.n > 0) {
      const g = store.g[(store.n - 1) % store.cap];
      if (Number.isFinite(g) && g > 0) mScale = g;
    }
    // La leyenda se pinta ANTES que la regla: si coinciden, manda el eje. Y se
    // sube lo justo para no rozar las marcas de tiempo.
    drawCaption(ctx, W, lay, fs - 1);
    drawAxes(ctx, {
      W, H, lay, rgb, pps, penT: pen, rangeT: t0,
      pctPerPx: mScale > 0 ? (mScale * 100) / scalePx : 0, fs, penX,
    });

    // Lápiz: columna de barrido y brillo en la punta, que late con cada pulso
    ctx.fillStyle = `rgba(${rgb},${0.3 + pulse * 0.45})`;
    ctx.fillRect(penX - 0.75, lay.padTop - 6, 1.5, lay.band + 12);
    if (Number.isFinite(py[m - 1])) {
      const gsz = 38 + pulse * 28;
      ctx.globalAlpha = 0.88 + pulse * 0.12;
      ctx.drawImage(s.sprites[alert ? 'red' : 'ok'], px[m - 1] - gsz / 2, py[m - 1] - gsz / 2, gsz, gsz);
      ctx.globalAlpha = 1;
    }
  };
}
