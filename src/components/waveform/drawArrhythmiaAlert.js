/**
 * Aviso de arritmia en tiempo real sobre el trazo. Aparece mientras haya latidos
 * marcados (prematuro / pausa) dentro de la ventana visible o el ritmo esté en
 * alerta. Es un aviso de cribado, no un diagnóstico.
 */
const RED = '255,77,94';

export function drawArrhythmiaAlert(ctx, { alert, flagged, W, lay, label, fs = 11 }) {
  if (!alert && !flagged) return;
  const text = label ? `ARRITMIA · ${label}` : 'ARRITMIA';
  const ph = (performance.now() % 1000) / 1000;

  ctx.font = `700 ${fs}px "JetBrains Mono", ui-monospace, monospace`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const w = ctx.measureText(text).width + 34;
  const h = fs + 14;
  const x = W / 2;
  const y = lay.padTop - h / 2 - 6;
  if (y - h / 2 < 4) return;

  ctx.fillStyle = `rgba(${RED},${0.18 + ph * 0.12})`;
  ctx.strokeStyle = `rgba(${RED},${0.65 + ph * 0.3})`;
  ctx.lineWidth = 1.3;
  ctx.beginPath();
  if (ctx.roundRect) ctx.roundRect(x - w / 2, y - h / 2, w, h, h / 2);
  else ctx.rect(x - w / 2, y - h / 2, w, h);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = `rgba(${RED},0.95)`;
  ctx.fillText(text, x, y + 0.5);
}