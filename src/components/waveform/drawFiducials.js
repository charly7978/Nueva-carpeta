/**
 * Marcas de morfología sobre el trazado.
 * ─────────────────────────────────────────────────────────────
 * Cada latido se rotula con los puntos que la señal realmente tiene:
 *   P1          pico sistólico (máximo del pulso)
 *   ESCOTADURA  mínimo dicrótico (cierre aórtico)
 *   P2          pico diastólico / onda reflejada
 *   PIE         valle previo al frente sistólico
 *   MESETA      tramo plano real (saturación), dibujado, no disimulado
 *
 * Los valores van en % de modulación AC/DC, medidos sobre la misma traza que se
 * dibuja. Solo el último latido lleva texto —es el que se está mirando—; el
 * resto deja sus marcas para que la onda siga siendo legible a velocidad de
 * monitor, y nunca se rotula debajo del panel de métricas.
 */
const RED = '255,77,94';
const GREEN = '0,255,136';
const BLUE = '125,211,252';
const MONO = '"JetBrains Mono", ui-monospace, monospace';
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

const pct = (v) => (Number.isFinite(v) ? `${v >= 0 ? '+' : '−'}${Math.abs(v).toFixed(2)}%` : '—');

/** Etiqueta con fondo: legible sobre rejilla, trazo y relleno */
function chip(ctx, text, x, y, color, fs, align = 'center') {
  const padX = 5;
  const h = fs + 7;
  const w = ctx.measureText(text).width + padX * 2;
  const left = align === 'center' ? x - w / 2 : align === 'right' ? x - w : x;
  const top = y - h / 2;
  ctx.fillStyle = 'rgba(3,8,14,0.82)';
  ctx.strokeStyle = `rgba(${color},0.35)`;
  ctx.lineWidth = 1;
  ctx.beginPath();
  if (ctx.roundRect) ctx.roundRect(left, top, w, h, 4);
  else ctx.rect(left, top, w, h);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = `rgba(${color},0.96)`;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, left + padX, y + 0.5);
}

function dot(ctx, x, y, r, color) {
  ctx.fillStyle = `rgba(3,8,14,0.9)`;
  ctx.beginPath();
  ctx.arc(x, y, r + 1.2, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = `rgba(${color},1)`;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
}

function ring(ctx, x, y, r, color) {
  ctx.strokeStyle = `rgba(${color},0.95)`;
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.stroke();
}

function diamond(ctx, x, y, r, color) {
  ctx.fillStyle = 'rgba(3,8,14,0.9)';
  ctx.strokeStyle = `rgba(${color},0.95)`;
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.moveTo(x, y - r);
  ctx.lineTo(x + r, y);
  ctx.lineTo(x, y + r);
  ctx.lineTo(x - r, y);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
}

/**
 * @param items  [{ fx, label, newest }] de más antiguo a más reciente
 */
export function drawFiducials(ctx, { items, xOf, yOf, W, lay, alert, fs = 11, timeNow }) {
  if (!items.length) return;
  ctx.font = `600 ${fs}px ${MONO}`;
  ctx.lineJoin = 'round';
  const textFs = Math.max(9, fs - 1);
  ctx.font = `600 ${textFs}px ${MONO}`;

  const topLimit = lay.padTop - 2;
  const botLimit = lay.padTop + lay.band + 2;

  // Fuera del área de trazado no se marca nada. El texto va SOLO en el último
  // latido —el que se está mirando— y nunca bajo el panel de métricas: ahí las
  // cifras ya están escritas y duplicarlas encima de la onda solo estorba.
  const roomRight = W >= 900 ? W * 0.62 : W - 40;
  const chipX = (x) => clamp(x, 44, Math.max(70, roomRight - 44));
  // En un móvil el pulso ocupa pocos píxeles: tres rótulos se pisarían. Ahí
  // solo se escribe el pico sistólico; las demás marcas siguen dibujadas.
  const detailed = W >= 620;

  // Se rotula el último latido que cae en zona despejada: en horizontal el más
  // reciente queda siempre bajo el panel, y ahí sus cifras ya están escritas.
  let labelIndex = -1;
  for (let n = 0; n < items.length; n++) {
    const x = xOf(items[n].fx.peak.t);
    if (x >= 52 && x < roomRight) labelIndex = n;
  }

  for (let n = 0; n < items.length; n++) {
    const { fx, flagged } = items[n];
    const peakX = xOf(fx.peak.t);
    if (peakX < 52 || peakX > W - 4) continue;
    const newest = n === items.length - 1;
    const showText = n === labelIndex;
    const accent = flagged || alert ? RED : GREEN;

    // ── Meseta: corchete sobre el tramo plano ──
    if (fx.plateau) {
      const x0 = xOf(fx.plateau.t0);
      const x1 = xOf(fx.plateau.t1);
      const y = yOf(fx.plateau.v);
      if (x1 - x0 > 3) {
        ctx.strokeStyle = 'rgba(255,205,90,0.9)';
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.moveTo(x0, y - 10);
        ctx.lineTo(x1, y - 10);
        ctx.moveTo(x0, y - 13);
        ctx.lineTo(x0, y - 7);
        ctx.moveTo(x1, y - 13);
        ctx.lineTo(x1, y - 7);
        ctx.stroke();
        if (showText) {
          ctx.fillStyle = 'rgba(255,205,90,0.95)';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'bottom';
          ctx.fillText('MESETA', (x0 + x1) / 2, y - 15);
        }
      }
    }

    // ── Pie / valle ──
    const fxFoot = xOf(fx.foot.t);
    const fyFoot = yOf(fx.foot.v);
    ring(ctx, fxFoot, fyFoot, 4, BLUE);
    if (showText && detailed) {
      const y = clamp(fyFoot + textFs + 9, topLimit, botLimit + textFs);
      chip(ctx, `PIE ${pct(fx.foot.abs)}`, chipX(fxFoot), y, BLUE, textFs);
    }

    // ── Escotadura dicrótica ──
    if (fx.notch) {
      const nx = xOf(fx.notch.t);
      const ny = yOf(fx.notch.v);
      diamond(ctx, nx, ny, 4.2, '255,205,90');
      if (showText && detailed) {
        const y = clamp(ny + textFs + 10, topLimit, botLimit + textFs);
        chip(ctx, 'ESCOTADURA', chipX(nx), y, '255,205,90', textFs);
      }
    }

    // ── Pico diastólico (onda reflejada) ──
    if (fx.diastolic) {
      const dx = xOf(fx.diastolic.t);
      const dy = yOf(fx.diastolic.v);
      dot(ctx, dx, dy, 2.6, '125,211,252');
      if (showText && detailed) {
        const y = clamp(dy - textFs - 8, topLimit + textFs, botLimit);
        chip(ctx, `P2 ${pct(fx.diastolic.abs)}`, chipX(dx), y, BLUE, textFs);
      }
    }

    // ── Pico sistólico ──
    const px = peakX;
    const py = yOf(fx.peak.v);
    dot(ctx, px, py, 3.4, accent);
    ring(ctx, px, py, 6.4, accent);
    if (showText) {
      const y = clamp(py - textFs - 12, topLimit + textFs, botLimit);
      chip(ctx, `P1 ${pct(fx.peak.abs)}`, chipX(px), y, accent, textFs);
    }

    // El latido más reciente late: la detección se ve en el mismo instante
    if (newest && Number.isFinite(timeNow)) {
      const ph = (timeNow % 900) / 900;
      ctx.strokeStyle = `rgba(${accent},${0.7 - ph * 0.6})`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(px, py, 9 + ph * 15, 0, Math.PI * 2);
      ctx.stroke();
    }
  }
}
