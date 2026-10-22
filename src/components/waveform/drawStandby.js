/** En espera: el lápiz recorre la línea de base dejando una estela */
const SWEEP_MS = 3800;
const TAIL = 280;

export function drawStandby(ctx, W, H, s, rgb) {
  const now = performance.now();
  if (!s.t0) s.t0 = now;
  const x = (((now - s.t0) % SWEEP_MS) / SWEEP_MS) * W;
  const y = s.lay ? s.lay.zeroY : H / 2;
  const x0 = Math.max(0, x - TAIL);

  const g = ctx.createLinearGradient(x0, 0, x, 0);
  g.addColorStop(0, `rgba(${rgb},0)`);
  g.addColorStop(1, `rgba(${rgb},0.95)`);
  ctx.lineCap = 'round';
  ctx.strokeStyle = g;
  ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(x0, y); ctx.lineTo(x, y); ctx.stroke();
  ctx.drawImage(s.sprites.ok, x - 15, y - 15, 30, 30);
}