/**
 * Anotaciones de cada latido sobre la onda: valor del pico (máximo), valor del
 * valle (mínimo) y, en rojo, los latidos que rompen el ritmo.
 */
const RED_HEX = '#ff4d5e';
const TAGS = { P: 'PREMATURO', L: 'PAUSA' };

const signed = (v) => `${v >= 0 ? '+' : '−'}${Math.abs(v).toFixed(2)}`;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

function label(ctx, text, x, y, color) {
  ctx.lineJoin = 'round';
  ctx.lineWidth = 3.5;
  ctx.strokeStyle = 'rgba(2,6,12,0.92)';
  ctx.strokeText(text, x, y);
  ctx.fillStyle = color;
  ctx.fillText(text, x, y);
}

function dot(ctx, x, y, r, color) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
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

function markBeat(ctx, b, o) {
  const { xOf, yOf, W, lay, alert, sprites, fs } = o;
  const base = lay.padTop + lay.band;
  const flag = b.rhy === 'P' || b.rhy === 'L';
  const red = flag || alert;
  const x = xOf(b.t);
  const y = yOf(b.y);
  const lx = clamp(x, 28, W - 28);

  ctx.strokeStyle = red ? 'rgba(255,77,94,0.30)' : 'rgba(0,255,136,0.16)';
  ctx.lineWidth = 1;
  ctx.setLineDash([2, 4]);
  ctx.beginPath(); ctx.moveTo(x, y + 6); ctx.lineTo(x, base); ctx.stroke();
  ctx.setLineDash([]);

  if (b.vt != null && b.vy != null) {
    const vx = xOf(b.vt);
    const vy = yOf(b.vy);
    // Valle: anillo hueco para distinguirlo del pico a simple vista
    ctx.strokeStyle = red ? 'rgba(255,77,94,0.7)' : 'rgba(56,189,248,0.7)';
    ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.arc(vx, vy, 5.5, 0, Math.PI * 2); ctx.stroke();
    dot(ctx, vx, vy, 2.6, red ? RED_HEX : '#38bdf8');
    label(ctx, signed(b.vl), clamp(vx, 28, W - 28), vy + fs + 6, red ? RED_HEX : '#7dd3fc');
  }

  ctx.drawImage(sprites[red ? 'red' : 'white'], x - 12, y - 12, 24, 24);
  dot(ctx, x, y, 3, red ? RED_HEX : '#e8fff4');
  label(ctx, signed(b.pk), lx, Math.max(fs + 2, y - 11), red ? RED_HEX : '#c8ffe6');

  // El latido más reciente late sobre el trazo: la detección se ve al instante
  if (o.newest != null && b.id === o.newest) {
    const ph = (performance.now() % 1000) / 1000;
    ctx.strokeStyle = `rgba(${red ? '255,77,94' : '0,255,136'},${0.75 - ph * 0.65})`;
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(x, y, 10 + ph * 16, 0, Math.PI * 2); ctx.stroke();
  }

  if (flag) {
    // Alerta de arritmia: barra sobre el trazo y anillo que pulsa en tiempo real
    ctx.strokeStyle = 'rgba(255,77,94,0.5)';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([4, 4]);
    ctx.beginPath(); ctx.moveTo(x, lay.padTop - 4); ctx.lineTo(x, base + 4); ctx.stroke();
    ctx.setLineDash([]);
    const ph = (performance.now() % 900) / 900;
    ctx.strokeStyle = `rgba(255,77,94,${0.85 - ph * 0.7})`;
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(x, y, 9 + ph * 14, 0, Math.PI * 2); ctx.stroke();
    ctx.strokeStyle = RED_HEX;
    ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(x, y, 9, 0, Math.PI * 2); ctx.stroke();
    const ms = b.ibi != null ? ` ${Math.round(b.ibi * 1000)} ms` : '';
    label(ctx, TAGS[b.rhy] + ms, lx, Math.max(fs + 2, y - 11 - fs - 4), RED_HEX);
  }
}

export function drawBeats(ctx, o) {
  const { beats, t0, xOf, W, fs } = o;
  ctx.font = `600 ${fs}px "JetBrains Mono", ui-monospace, monospace`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  let newest = null;
  for (let i = beats.length - 1; i >= 0; i--) {
    const b = beats[i];
    if (b && b.confirmed && !b.bad) { newest = b.id; break; }
  }
  o.newest = newest;
  for (let i = 0; i < beats.length; i++) {
    const b = beats[i];
    if (!b || !b.confirmed || b.bad || b.t < t0 - 0.3) continue;
    if (xOf(b.t) > W + 20) continue;
    markBeat(ctx, b, o);
  }
}