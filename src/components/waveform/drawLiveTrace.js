import { smoothPath, indexAtOrAfter } from '@/components/waveform/drawTrace';
import { flaggedSpans } from '@/components/waveform/drawBeats';

/** Missing/invalid capture produces a gap, never an invented connecting pulse. */
export default function drawLiveTrace(ctx, { px, py, pt, m, lay, rgb, pulse, gradients, key, beats, t0, alert, width }) {
  const lw = (width < 520 ? 2.4 : 4) * (1 + pulse * 0.18);
  const spans = alert ? [] : flaggedSpans(beats, t0);
  const draw = (first, last) => {
    if (last - first < 1) return;
    const path = smoothPath(px, py, first, last);
    const area = new Path2D(path);
    area.lineTo(px[last], lay.zeroY); area.lineTo(px[first], lay.zeroY); area.closePath();
    ctx.fillStyle = gradients[`fl${key}`]; ctx.fill(area);
    ctx.lineJoin = ctx.lineCap = 'round';
    ctx.strokeStyle = `rgba(${rgb},${0.2 + pulse * 0.16})`;
    ctx.lineWidth = lw + 6; ctx.stroke(path);
    ctx.strokeStyle = gradients[`tr${key}`]; ctx.lineWidth = lw; ctx.stroke(path);
    for (const [a, b] of spans) {
      const i0 = Math.max(first, indexAtOrAfter(pt, m, a));
      const i1 = Math.min(last, indexAtOrAfter(pt, m, b));
      if (i1 <= i0) continue;
      ctx.strokeStyle = '#ff3b4e'; ctx.lineWidth = lw + 0.4;
      ctx.stroke(smoothPath(px, py, i0, i1));
    }
  };
  let start = -1;
  for (let i = 0; i < m; i++) {
    const valid = Number.isFinite(py[i]);
    if (!valid || (i > 0 && pt[i] - pt[i - 1] > 0.12)) {
      if (start >= 0) draw(start, i - 1);
      start = -1;
    }
    if (valid && start < 0) start = i;
  }
  if (start >= 0) draw(start, m - 1);
}