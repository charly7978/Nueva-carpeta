/** Shared pulse-band correlation is NOT evidence of movement: real PPG is
 * correlated across colours. Reject only abrupt common-mode jumps in the raw
 * fractional channels. Steady periodic light remains an optical ambiguity.
 */
import { median } from '@/lib/dsp';

export default function commonModeArtifact(histories, evidence, fs) {
  const deltas = evidence.map((e, c) => {
    if (!e?.viable) return null;
    const raw = histories[c].tail(fs * 2);
    if (raw.length < fs) return null;
    const diff = raw.slice(1).map((v, i) => v - raw[i]);
    const center = median(diff);
    const noise = 1.4826 * median(diff.map(v => Math.abs(v - center)));
    // A sharp, repeated physiological upstroke is not an unexplained jump.
    // Compare with the preceding measured cycle only when periodicity is strong;
    // displacement is independently checked using the optical spatial profiles.
    const lag = e.strength >= 0.7 && e.hz > 0 ? fs / e.hz : 0;
    const residual = diff.map((value, i) => {
      const position = i - lag, lo = Math.floor(position);
      if (!lag || lo < 0 || lo + 1 >= i) return value;
      const previous = diff[lo] + (position - lo) * (diff[lo + 1] - diff[lo]);
      return value - previous;
    });
    return { diff: residual, threshold: Math.max(0.004, 8 * noise) };
  }).filter(Boolean);
  if (deltas.length < 2) return false;
  for (let back = 1; back <= Math.round(fs * 0.25); back++) {
    const jumps = deltas.map(d => d.diff[d.diff.length - back]);
    for (const sign of [-1, 1]) {
      if (jumps.filter((v, i) => sign * v > deltas[i].threshold).length >= 2) return true;
    }
  }
  return false;
}