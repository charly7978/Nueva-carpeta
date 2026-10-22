import { detrend, powerSpectrum } from '@/lib/dsp';
import { pulseNoise } from '@/lib/ppg/pulseNoise';
import pulsePeriod from '@/lib/ppg/pulsePeriod';

export const MIN_PULSE_SCALE = 1.5e-4;
export const MIN_HZ = 0.5;
export const MAX_HZ = 3.5;

export function robustScale(samples) {
  if (samples.length < 8) return 0;
  const a = samples.map(Math.abs).sort((x, y) => x - y);
  return 0.8 * a[Math.floor(a.length * 0.7)];
}

/** Independent evidence: raw-channel noise, spectral concentration and
 * filtered periodicity. These are engineering gates, not clinical validation.
 * Raw curvature and measured-cycle residuals estimate noise without treating
 * fast pulse harmonics as sensor noise. Filtering alone is never evidence.
 */
export function assessChannel(rawSamples, filteredSamples, scale, fs, usable, previous = null) {
  const empty = { score: 0, strength: 0, hz: 0, snr: 0, concentration: 0, viable: false, ambiguous: false };
  if (!usable || rawSamples.length < fs * 4 || scale < MIN_PULSE_SCALE) return empty;
  // Shorten evidence only after a fast pulse has been independently acquired.
  // Keep the longer window at rest and during initial acquisition.
  const seconds = previous?.viable && previous.hz >= 1.5 ? 4 : 8;
  const raw = rawSamples.slice(-fs * seconds), filtered = filteredSamples.slice(-fs * seconds);
  const { freqs, magnitudes } = powerSpectrum(detrend(raw), fs);
  const ac = pulsePeriod(filtered, fs, freqs, magnitudes, raw);
  const noise = pulseNoise(raw, fs, ac);
  const snr = scale / Math.max(3e-5, noise);
  if (!ac.hz) return { ...empty, snr };
  const width = Math.max(0.15, fs / raw.length);
  let total = 0, pulse = 0;
  for (let i = 0; i < freqs.length; i++) {
    const hz = freqs[i];
    if (hz < MIN_HZ || hz > 8) continue;
    const power = magnitudes[i] ** 2;
    total += power;
    if (Math.abs(hz - ac.hz) <= width || Math.abs(hz - 2 * ac.hz) <= width) pulse += power;
  }
  const concentration = total > 1e-15 ? pulse / total : 0;
  const ambiguous = ac.ambiguous;
  // Schmitt thresholds: marginal spectral fluctuations must not repeatedly
  // erase an otherwise validated acquisition. Gross noise still closes the gate.
  const holding = previous?.viable === true;
  const viable = holding
    ? snr >= 2 && concentration >= 0.3 && ac.strength >= 0.2
    : snr >= 2.5 && concentration >= 0.4 && ac.strength >= 0.3;
  const value = ac.strength * concentration * Math.min(1, snr / 6);
  const accepted = viable && !ambiguous;
  const score = accepted ? (previous?.viable ? 0.65 * previous.score + 0.35 * value : value) : 0;
  return { score, strength: ac.strength, hz: ac.hz, snr, concentration, viable: accepted, ambiguous, lobed: ac.lobed };
}