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
export const MIN_TREMOR_RATIO = 1.2;
export const MAX_TREMOR_CONFIDENCE_PENALTY = 1.5;

export function assessChannel(rawSamples, filteredSamples, scale, fs, usable, previous = null, noise = null) {
  const empty = { score: 0, strength: 0, hz: 0, snr: 0, snrBroad: 0, concentration: 0, viable: false, ambiguous: false, tremorRatio: 0, noiseInBand: 0, noiseOutBand: 0 };
  if (!usable || rawSamples.length < fs * 4 || scale < MIN_PULSE_SCALE) {
    return { ...empty, snr: 0, tremorRatio: noise?.tremor ?? 0 };
  }
  const seconds = previous?.viable && previous.hz >= 1.5 ? 4 : 8;
  const raw = rawSamples.slice(-fs * seconds), filtered = filteredSamples.slice(-fs * seconds);
  const { freqs, magnitudes } = powerSpectrum(detrend(raw), fs);
  const ac = pulsePeriod(filtered, fs, freqs, magnitudes, raw);
  // Ruido en banda: si se pasa noise, usarlo; si no, legado (curvatura sobre crudo).
  let inBandNoise;
  let tremorRatio = 0;
  if (noise) {
    inBandNoise = noise.inBand;
    tremorRatio = noise.tremor ?? 0;
  } else {
    const legacy = pulseNoise(raw, fs, ac);
    inBandNoise = legacy;
    tremorRatio = 0;
  }
  const snrBroad = scale / Math.max(3e-5, (noise ? (noise.inBand + noise.outBand) : inBandNoise));
  const snr = scale / Math.max(3e-5, inBandNoise || 3e-5);
  if (!ac.hz) return { ...empty, snr, snrBroad, tremorRatio, noiseInBand: inBandNoise, noiseOutBand: noise?.outBand ?? 0 };
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
  const holding = previous?.viable === true;
  const tremorActive = tremorRatio > 0.1;
  // Bajo temblor se relajan los umbrales de SNR/concentración/fuerza para no cerrar la puerta;
  // sin temblor se mantienen estrictos (protección contra reflexión/lóbulo secundario).
  const snrEnter = tremorActive ? 1.8 : (holding ? 2 : 2.5);
  const snrHold = tremorActive ? 1.5 : (holding ? 1.8 : 2);
  const concEnter = tremorActive ? 0.3 : (holding ? 0.3 : 0.4);
  const concHold = tremorActive ? 0.25 : (holding ? 0.3 : 0.3);
  const strEnter = tremorActive ? 0.2 : (holding ? 0.2 : 0.3);
  const strHold = tremorActive ? 0.15 : (holding ? 0.2 : 0.2);
  const viable = holding
    ? snr >= snrHold && tremorRatio <= 1.6 && concentration >= concHold && ac.strength >= strHold
    : snr >= snrEnter && tremorRatio <= MIN_TREMOR_RATIO && concentration >= concEnter && ac.strength >= strEnter;
  const value = ac.strength * concentration * Math.min(1, snr / 6);
  const accepted = viable && !ambiguous;
  const penalty = 1 / (1 + 1.5 * tremorRatio);
  const valuePenalized = value * penalty;
  const score = accepted ? (previous?.viable ? 0.65 * previous.score + 0.35 * valuePenalized : valuePenalized) : 0;
  return {
    score, strength: ac.strength, hz: ac.hz, snr, snrBroad, concentration,
    viable: accepted, ambiguous, lobed: ac.lobed, tremorRatio,
    noiseInBand: inBandNoise, noiseOutBand: noise?.outBand ?? 0,
  };
}