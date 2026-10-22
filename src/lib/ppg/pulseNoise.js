import { median } from '@/lib/dsp';

/** Curvature contains real pulse harmonics at high HR; it is not all noise.
 * A strong measured period permits a second estimate from RAW cycle residuals.
 * No predicted samples, synthetic pulses or reduced acceptance thresholds. */
export function pulseNoise(raw, fs, period) {
  const first = Math.max(2, raw.length - fs * 2);
  const curvature = [];
  for (let i = first; i < raw.length; i++) {
    curvature.push(Math.abs(raw[i] - 2 * raw[i - 1] + raw[i - 2]));
  }
  const noise = median(curvature) / (0.6745 * Math.sqrt(6));
  const lag = period.lagSamples;
  if (!(period.strength >= 0.7 && lag > 2 && raw.length >= 3 * lag + 2)) return noise;
  const residuals = [];
  for (let i = Math.max(first, Math.ceil(lag)); i < raw.length; i++) {
    const position = i - lag, lo = Math.floor(position), fraction = position - lo;
    const previous = raw[lo] + fraction * (raw[lo + 1] - raw[lo]);
    residuals.push(raw[i] - previous);
  }
  const center = median(residuals);
  const residualNoise = median(residuals.map(value => Math.abs(value - center))) / (0.6745 * Math.sqrt(2));
  return Math.min(noise, residualNoise);
}