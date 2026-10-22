import { autocorrPeriod, mean, detrend, powerSpectrum } from '@/lib/dsp';
import harmonicAmbiguity from '@/lib/ppg/harmonicAmbiguity';

/** Compare measured cycles, never infer beats by halving a displayed rate. */
function correlation(signal, lag) {
  const center = mean(signal);
  let xy = 0, xx = 0, yy = 0;
  for (let i = 0; i + Math.ceil(lag) < signal.length; i++) {
    const position = i + lag, k = Math.floor(position);
    const a = signal[i] - center;
    const b = signal[k] + (position - k) * (signal[k + 1] - signal[k]) - center;
    xy += a * b; xx += a * a; yy += b * b;
  }
  return xx * yy > 1e-20 ? xy / Math.sqrt(xx * yy) : 0;
}

export default function pulsePeriod(signal, fs, freqs, magnitudes, raw = signal) {
  const initial = autocorrPeriod(signal, fs, 0.5, 3.5);
  if (!initial.hz) return { ...initial, ambiguous: false, lobed: false };
  let ambiguous = harmonicAmbiguity(freqs, magnitudes, initial.hz, fs, signal.length);
  if (ambiguous && signal.length * initial.hz / (2 * fs) >= 4) {
    // A single late frame/lighting transient creates broad spectral side lobes.
    // A genuine alternating cycle must recur in BOTH independent half-windows.
    const middle = Math.floor(raw.length / 2);
    ambiguous = [raw.slice(0, middle), raw.slice(middle)].every(part => {
      const spectrum = powerSpectrum(detrend(part), fs);
      return harmonicAmbiguity(spectrum.freqs, spectrum.magnitudes, initial.hz, fs, part.length, 2);
    });
  }
  let period = initial;
  if (ambiguous) {
    // A secondary lobe may repeat every half cycle. Accept the full cycle ONLY
    // when it matches the measured waveform materially better across >=3 cycles.
    const lag = initial.lagSamples * 2;
    let bestLag = lag, best = correlation(signal, lag);
    for (let offset = -1; offset <= 1; offset += 0.25) {
      const candidate = lag + offset, value = correlation(signal, candidate);
      if (value > best) { best = value; bestLag = candidate; }
    }
    const short = correlation(signal, initial.lagSamples);
    if (fs / bestLag >= 0.5 && signal.length >= 3 * bestLag
      && best >= 0.8 && best - short >= 0.035) {
      period = { hz: fs / bestLag, lagSamples: bestLag, strength: best };
    } else return { ...initial, ambiguous: true, lobed: false };
  }
  const half = correlation(signal, period.lagSamples / 2);
  return { ...period, ambiguous: false, lobed: period.strength >= 0.8 && half >= 0.25 };
}