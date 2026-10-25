/**
 * Anotaciones de RITMO sobre la onda.
 * ─────────────────────────────────────────────────────────────
 * Aquí solo se marca lo que rompe el ritmo: latido prematuro y pausa, con su
 * intervalo en milisegundos. La morfología de cada pulso (P1, escotadura, P2,
 * pie, meseta) la rotula drawFiducials sobre la traza real, así que este módulo
 * no repite valores de pico ni de valle: nunca dos etiquetas para el mismo punto.
 */
const RED_HEX = '#ff4d5e';
const TAGS = { P: 'PREMATURO', L: 'PAUSA' };

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

function label(ctx, text, x, y, color) {
  ctx.lineJoin = 'round';
  ctx.lineWidth = 3.5;
  ctx.strokeStyle = 'rgba(2,6,12,0.92)';
  ctx.strokeText(text, x, y);
  ctx.fillStyle = color;
  ctx.fillText(text, x, y);
}

/** Tramos de tiempo [desde, hasta] de la onda que deben pintarse en rojo */
export function flaggedSpans(beats, t0) {
  const out = [];
  for (let i = beats.length - 1; i >= 0; i--) {
    const b = beats[i];
    if (!b || b.t < t0 - 1) break;
    if (!b.confirmed || b.bad || b.sus) continue;
    if (b.rhy === 'P') out.push([b.vt - 0.04, b.t + 0.42]);
    else if (b.rhy === 'L') out.push([(beats[i - 1] ? beats[i - 1].t : b.t - 1) + 0.25, b.t + 0.3]);
  }
  return out;
}

export function drawBeats(ctx, o) {
  const { beats, t0, xOf, yOf, W, lay, alert, fs } = o;
  const base = lay.padTop + lay.band;
  ctx.font = `600 ${fs}px "JetBrains Mono", ui-monospace, monospace`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';

  for (let i = 0; i < beats.length; i++) {
    const b = beats[i];
    if (!b || !b.confirmed || b.bad || b.t < t0 - 0.3) continue;
    const x = xOf(b.t);
    if (x < -20 || x > W + 20) continue;
    const y = yOf(b.y);
    const flag = b.rhy === 'P' || b.rhy === 'L';

    // Guía vertical tenue de cada latido: referencia temporal, no decoración
    ctx.strokeStyle = flag ? 'rgba(255,77,94,0.26)' : 'rgba(0,255,136,0.12)';
    ctx.lineWidth = 1;
    ctx.setLineDash([2, 4]);
    ctx.beginPath();
    ctx.moveTo(x, Math.max(lay.padTop - 2, y - 8));
    ctx.lineTo(x, base + 2);
    ctx.stroke();
    ctx.setLineDash([]);

    if (!flag) continue;

    const lx = clamp(x, 34, W - 34);
    ctx.strokeStyle = 'rgba(255,77,94,0.5)';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(x, lay.padTop - 4);
    ctx.lineTo(x, base + 4);
    ctx.stroke();
    ctx.setLineDash([]);

    // Anillo que pulsa: se ve que el latido irregular acaba de entrar
    const ph = (performance.now() % 900) / 900;
    ctx.strokeStyle = `rgba(255,77,94,${0.85 - ph * 0.7})`;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(x, y, 9 + ph * 14, 0, Math.PI * 2);
    ctx.stroke();
    ctx.strokeStyle = RED_HEX;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(x, y, 9, 0, Math.PI * 2);
    ctx.stroke();

    const ms = b.ibi != null ? ` ${Math.round(b.ibi * 1000)} ms` : '';
    const text = TAGS[b.rhy] + ms;
    label(ctx, text, lx, Math.max(fs + 2, y - (alert ? 34 : 24)), RED_HEX);
  }
}
