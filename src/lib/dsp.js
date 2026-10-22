/** Shared DSP primitives and secondary, uncalibrated vital-sign estimates.
 * Live heartbeat detection lives ONLY in ppg/beatTracker.js.
 * Published methods inform this implementation; they do not validate this app.
 */

// ─────────────────────────────────────────────────────────────
// MATH UTILITIES
// ─────────────────────────────────────────────────────────────

export function mean(arr) {
  if (!arr.length) return 0;
  let s = 0;
  for (let i = 0; i < arr.length; i++) s += arr[i];
  return s / arr.length;
}

export function std(arr) {
  if (arr.length < 2) return 0;
  const m = mean(arr);
  let s = 0;
  for (let i = 0; i < arr.length; i++) s += (arr[i] - m) ** 2;
  return Math.sqrt(s / (arr.length - 1));
}

export function populationStd(arr) {
  const m = mean(arr);
  return Math.sqrt(mean(arr.map(v => (v - m) ** 2)));
}

export function detrend(arr) {
  const n = arr.length;
  if (n < 2) return arr.slice();
  let sx = 0, sy = 0, sxy = 0, sxx = 0;
  for (let i = 0; i < n; i++) {
    sx += i; sy += arr[i];
    sxy += i * arr[i]; sxx += i * i;
  }
  const denom = n * sxx - sx * sx;
  const slope = denom !== 0 ? (n * sxy - sx * sy) / denom : 0;
  const intercept = (sy - slope * sx) / n;
  return arr.map((v, i) => v - (slope * i + intercept));
}

export function normalizeSignal(arr) {
  if (!arr.length) return [];
  let mn = arr[0], mx = arr[0];
  for (let i = 1; i < arr.length; i++) {
    if (arr[i] < mn) mn = arr[i];
    if (arr[i] > mx) mx = arr[i];
  }
  const range = mx - mn;
  if (range < 1e-10) return arr.map(() => 0);
  return arr.map(v => (v - mn) / range * 2 - 1);
}

/** Zero-mean, unit-variance normalization (robust input for detectors) */
export function zscore(arr) {
  const n = arr.length;
  if (n < 2) return arr.map(() => 0);
  const m = mean(arr);
  const s = std(arr);
  if (s < 1e-12) return arr.map(() => 0);
  const out = new Array(n);
  for (let i = 0; i < n; i++) out[i] = (arr[i] - m) / s;
  return out;
}

/** 95th percentile of |signal| — robust amplitude estimator */
export function p95abs(arr) {
  if (!arr.length) return 0;
  const s = arr.map(Math.abs).sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor(s.length * 0.95))] || 0;
}

/**
 * Normalized autocorrelation → fundamental period with sub-lag interpolation.
 * Picks the FIRST strong peak (avoids locking onto the 2nd harmonic period),
 * which is the standard failure mode of plain argmax autocorrelation.
 */
export function autocorrPeriod(signal, fs, minHz = 0.5, maxHz = 3.5) {
  const empty = { lagSamples: 0, hz: 0, strength: 0 };
  const n = signal.length;
  if (n < fs * 3) return empty;
  const m = mean(signal);
  const lo = Math.max(2, Math.floor(fs / maxHz));
  const hi = Math.min(Math.floor(n / 2), Math.ceil(fs / minHz));
  if (hi <= lo) return empty;
  const r = new Float64Array(hi + 2);
  for (let lag = lo - 1; lag <= hi + 1; lag++) {
    let xy = 0, xx = 0, yy = 0;
    for (let i = 0; i < n - lag; i++) {
      const a = signal[i] - m, b = signal[i + lag] - m;
      xy += a * b; xx += a * a; yy += b * b;
    }
    r[lag] = xx * yy > 1e-20 ? xy / Math.sqrt(xx * yy) : 0;
  }
  const peaks = [];
  for (let lag = lo; lag <= hi; lag++) {
    // An endpoint of a monotonic correlation curve is NOT a periodic peak.
    if (r[lag] > 0 && r[lag] > r[lag - 1] && r[lag] >= r[lag + 1]) peaks.push(lag);
  }
  if (!peaks.length) return empty;
  const best = Math.max(...peaks.map(lag => r[lag]));
  const chosen = peaks.find(lag => r[lag] >= 0.85 * best);
  const a = r[chosen - 1], b = r[chosen], c = r[chosen + 1];
  const den = a - 2 * b + c;
  const offset = Math.abs(den) > 1e-12 ? Math.max(-0.5, Math.min(0.5, 0.5 * (a - c) / den)) : 0;
  const lagSamples = chosen + offset;
  const hz = fs / lagSamples;
  return hz < minHz || hz > maxHz ? empty : { lagSamples, hz, strength: Math.min(1, b) };
}


export function median(arr) {
  if (!arr.length) return 0;
  const s = arr.slice().sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/**
 * Hampel filter — robust outlier / motion-artifact removal.
 * Robust median-based outlier suppression: replaces
 * samples deviating more than nSigma * (1.4826·MAD) from the local
 * median with that median, preserving the time base.
 */
export function hampelFilter(signal, windowSize = 7, nSigma = 3) {
  const n = signal.length;
  if (n < windowSize) return signal.slice();
  const half = windowSize >> 1;
  const out = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const lo = Math.max(0, i - half);
    const hi = Math.min(n - 1, i + half);
    const win = [];
    for (let j = lo; j <= hi; j++) win.push(signal[j]);
    const med = median(win);
    const mad = median(win.map(v => Math.abs(v - med)));
    const sigma = 1.4826 * mad;
    out[i] = (sigma > 1e-9 && Math.abs(signal[i] - med) > nSigma * sigma) ? med : signal[i];
  }
  return Array.from(out);
}

// ─────────────────────────────────────────────────────────────
// BUTTERWORTH IIR BANDPASS — 4th-order SOS cascade
// ─────────────────────────────────────────────────────────────

export function designButterworthBandpass(lowHz, highHz, fs) {
  // Pre-warp the analog edge frequencies (bilinear transform)
  const wl = 2 * Math.tan(Math.PI * lowHz / fs);
  const wh = 2 * Math.tan(Math.PI * highHz / fs);
  const BW = wh - wl;
  const W0sq = wl * wh;
  // Digital geometric centre of the band — where the response is normalised
  const wc = 2 * Math.PI * Math.sqrt(lowHz * highHz) / fs;

  // 4-pole Butterworth band-pass = 2nd-order LP prototype transformed.
  // The prototype pole set is conjugate-symmetric, so ONE prototype pole
  // (theta = pi/4) already produces all four BP poles: two roots, each with
  // its conjugate — i.e. exactly two biquads.
  const theta = Math.PI / 4;
  const pr = -Math.sin(theta);
  const pi_ = Math.cos(theta);

  // LP→BP frequency transform: s² − BW·p·s + W0² = 0
  const br = BW * pr, bi = BW * pi_;
  const discRe = br * br - bi * bi - 4 * W0sq;
  const discIm = 2 * br * bi;
  const mag = Math.hypot(discRe, discIm);
  const ang = Math.atan2(discIm, discRe) / 2;
  const sqRe = Math.sqrt(mag) * Math.cos(ang);
  const sqIm = Math.sqrt(mag) * Math.sin(ang);

  const poles = [
    { re: (br + sqRe) / 2, im: (bi + sqIm) / 2 },
    { re: (br - sqRe) / 2, im: (bi - sqIm) / 2 },
  ];

  const sections = [];
  for (const s of poles) {
    // Bilinear transform z = (2 + s) / (2 − s)
    const nr = 2 + s.re, ni = s.im;
    const dr = 2 - s.re, di = -s.im;
    const d2 = dr * dr + di * di;
    const zr = (nr * dr + ni * di) / d2;
    const zi = (ni * dr - nr * di) / d2;

    // Denominator (z − z)(z − z*) = z² + a1·z + a2
    const a1 = -2 * zr;
    const a2 = zr * zr + zi * zi;

    // Numerator: band-pass zeros at z = +1 and z = −1 → 1 − z⁻²,
    // normalised to unit gain at the centre frequency.
    const c1r = Math.cos(wc), c1i = Math.sin(wc);
    const c2r = Math.cos(2 * wc), c2i = Math.sin(2 * wc);
    const numMag = Math.hypot(c2r - 1, c2i);
    const denMag = Math.hypot(c2r + a1 * c1r + a2, c2i + a1 * c1i);
    const gain = denMag > 1e-12 ? numMag / denMag : 1;

    sections.push({ b0: 1 / gain, b1: 0, b2: -1 / gain, a1, a2 });
  }
  return sections;
}

export function applySOSFilter(sos, signal) {
  let x = signal.slice();
  for (const { b0, b1, b2, a1, a2 } of sos) {
    const y = new Float64Array(x.length);
    let w1 = 0, w2 = 0;
    for (let i = 0; i < x.length; i++) {
      // Direct Form II transposed
      const w0 = x[i] - a1 * w1 - a2 * w2;
      y[i] = b0 * w0 + b1 * w1 + b2 * w2;
      w2 = w1; w1 = w0;
    }
    x = Array.from(y);
  }
  return x;
}

/** Zero-phase forward+backward filtering (no phase distortion) */
export function filtfilt(sos, signal) {
  if (signal.length < 4) return signal.slice();
  const fwd = applySOSFilter(sos, signal);
  const rev = applySOSFilter(sos, fwd.slice().reverse());
  return rev.reverse();
}

// ─────────────────────────────────────────────────────────────
// MOVING AVERAGE — kernel for Elgendi detector
// ─────────────────────────────────────────────────────────────

export function movingAverage(signal, windowSamples) {
  const w = Math.max(1, Math.round(windowSamples));
  const out = new Float64Array(signal.length);
  let sum = 0;
  for (let i = 0; i < signal.length; i++) {
    sum += signal[i];
    if (i >= w) sum -= signal[i - w];
    out[i] = sum / Math.min(w, i + 1);
  }
  return Array.from(out);
}

// ─────────────────────────────────────────────────────────────
// ELGENDI (2013) PPG PEAK DETECTOR
// Offline event-block estimator used only by secondary metrics, not live HR.
// Inspired by Elgendi's two-moving-average method; not a validated port.
// ─────────────────────────────────────────────────────────────

export function elgendiPeakDetector(ppgSignal, fs) {
  const n = ppgSignal.length;
  if (n < Math.round(fs * 2)) return { systolic: [], beats: [], rrIntervals: [] };

  // Step 1: Square signal to amplify peaks, suppress noise
  const squared = ppgSignal.map(v => Math.max(0, v) ** 2);

  // Step 2: Two MAs — W1 (peak window ~111ms), W2 (beat window ~667ms)
  const W1 = Math.max(2, Math.round(0.111 * fs));
  const W2 = Math.max(4, Math.round(0.667 * fs));
  const ma_peak = movingAverage(squared, W1);
  const ma_beat = movingAverage(squared, W2);

  // Step 3: Thresholded event blocks
  // beta=0.02 per Elgendi's recommendation
  const beta = 0.02;
  const sqMean = mean(squared);

  const blocks = [];
  let inBlock = false, blockStart = 0;
  for (let i = 0; i < n; i++) {
    const threshold = ma_beat[i] + beta * sqMean;
    if (!inBlock && ma_peak[i] > threshold) {
      inBlock = true; blockStart = i;
    } else if (inBlock && ma_peak[i] <= threshold) {
      blocks.push({ start: blockStart, end: i - 1 });
      inBlock = false;
    }
  }
  if (inBlock) blocks.push({ start: blockStart, end: n - 1 });

  // Step 4: Reject blocks shorter than 30% of W2 (noise rejection)
  const minWidth = Math.round(0.3 * W2);
  const validBlocks = blocks.filter(b => b.end - b.start >= minWidth);

  // Step 5: Systolic peak = maximum of original signal within each block
  const systolic = [];
  for (const block of validBlocks) {
    let maxVal = -Infinity, maxIdx = block.start;
    for (let i = block.start; i <= block.end; i++) {
      if (ppgSignal[i] > maxVal) { maxVal = ppgSignal[i]; maxIdx = i; }
    }
    systolic.push(maxIdx);
  }

  // Step 6: Refractory period enforcement (min 250ms between beats)
  const minRR_samples = Math.round(0.25 * fs);
  const beats = [];
  for (let i = 0; i < systolic.length; i++) {
    if (beats.length === 0 || systolic[i] - beats[beats.length - 1] >= minRR_samples) {
      beats.push(systolic[i]);
    } else if (ppgSignal[systolic[i]] > ppgSignal[beats[beats.length - 1]]) {
      beats[beats.length - 1] = systolic[i]; // replace with higher amplitude peak
    }
  }

  // Step 7: RR intervals in milliseconds
  const rrIntervals = beats.slice(1).map((p, i) => (p - beats[i]) / fs * 1000);

  return { systolic: beats, beats, rrIntervals };
}

// ─────────────────────────────────────────────────────────────
// FFT — Cooley-Tukey Radix-2 DIT
// ─────────────────────────────────────────────────────────────

export function fft(re, im) {
  const n = re.length;
  if ((n & (n - 1)) !== 0) throw new Error('FFT size must be power of 2');
  const bits = Math.round(Math.log2(n));
  // Bit-reversal permutation
  for (let i = 0; i < n; i++) {
    let j = 0;
    for (let b = 0; b < bits; b++) j = (j << 1) | ((i >> b) & 1);
    if (j > i) {
      [re[i], re[j]] = [re[j], re[i]];
      [im[i], im[j]] = [im[j], im[i]];
    }
  }
  // Butterfly stages
  for (let len = 2; len <= n; len <<= 1) {
    const half = len >> 1;
    const ang = -2 * Math.PI / len;
    const wRe = Math.cos(ang), wIm = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let twRe = 1, twIm = 0;
      for (let j = 0; j < half; j++) {
        const uRe = re[i + j], uIm = im[i + j];
        const vRe = re[i + j + half] * twRe - im[i + j + half] * twIm;
        const vIm = re[i + j + half] * twIm + im[i + j + half] * twRe;
        re[i + j] = uRe + vRe;       im[i + j] = uIm + vIm;
        re[i + j + half] = uRe - vRe; im[i + j + half] = uIm - vIm;
        const nr = twRe * wRe - twIm * wIm;
        twIm = twRe * wIm + twIm * wRe;
        twRe = nr;
      }
    }
  }
  return { Re: re, Im: im };
}

export function powerSpectrum(signal, fs) {
  const n = signal.length;
  let fftSize = 1;
  while (fftSize < n * 4) fftSize <<= 1;
  // Hamming window
  const re = new Float64Array(fftSize);
  const im = new Float64Array(fftSize);
  for (let i = 0; i < n; i++) {
    const w = 0.54 - 0.46 * Math.cos(2 * Math.PI * i / (n - 1));
    re[i] = signal[i] * w;
  }
  const { Re, Im } = fft(re, im);
  const half = fftSize >> 1;
  const freqs = new Float64Array(half);
  const magnitudes = new Float64Array(half);
  for (let i = 0; i < half; i++) {
    freqs[i] = i * fs / fftSize;
    magnitudes[i] = Math.sqrt(Re[i] * Re[i] + Im[i] * Im[i]) / n;
  }
  return { freqs, magnitudes };
}

export function dominantFrequency(signal, fs, minHz, maxHz) {
  const { freqs, magnitudes } = powerSpectrum(signal, fs);
  let bestMag = -Infinity, bestIdx = -1;
  for (let i = 0; i < freqs.length; i++) {
    if (freqs[i] >= minHz && freqs[i] <= maxHz && magnitudes[i] > bestMag) {
      bestMag = magnitudes[i]; bestIdx = i;
    }
  }
  if (bestIdx <= 0 || bestIdx >= freqs.length - 1) return freqs[bestIdx] || 0;
  // Parabolic peak interpolation for sub-bin frequency accuracy
  const a = magnitudes[bestIdx - 1];
  const b = magnitudes[bestIdx];
  const c = magnitudes[bestIdx + 1];
  const p = 0.5 * (a - c) / (a - 2 * b + c + 1e-12);
  return freqs[bestIdx] + p * (fs / (magnitudes.length * 2));
}

/** Uncalibrated RGB ratio estimate; not a substitute for a pulse oximeter. */
export function computeSpO2Ratio(xRed, xGreen, fs) {
  if (xRed.length < fs * 4 || xGreen.length < fs * 4) return null;

  const sos = designButterworthBandpass(0.6, 3.5, fs);
  const a = filtfilt(sos, detrend(xRed));
  const b = filtfilt(sos, detrend(xGreen));

  const ampR = p95abs(a);
  const ampG = p95abs(b);
  if (ampG < 1e-9) return null;

  const R = ampR / ampG;
  if (!(R > 0.2 && R < 3)) return null;

  const spo2 = 110 - 25 * R;
  return Math.min(100, Math.max(85, Math.round(spo2 * 10) / 10));
}

// ─────────────────────────────────────────────────────────────
// HRV ANALYSIS — time-domain + spectral (interpolated RR series)
// ─────────────────────────────────────────────────────────────

function interpolateRRUniform(rrIntervals, targetFs) {
  if (rrIntervals.length < 4) return null;

  // Build cumulative time axis (seconds)
  const times = [0];
  for (let i = 0; i < rrIntervals.length; i++) {
    times.push(times[i] + rrIntervals[i] / 1000);
  }
  const totalTime = times[times.length - 1];
  const nPoints = Math.max(32, 1 << Math.ceil(Math.log2(totalTime * targetFs)));

  // Piecewise-linear interpolation onto uniform grid
  const out = new Float64Array(nPoints);
  let lo = 0;
  for (let k = 0; k < nPoints; k++) {
    const t = k / targetFs;
    if (t >= totalTime) { out[k] = rrIntervals[rrIntervals.length - 1]; continue; }
    while (lo < times.length - 2 && times[lo + 1] <= t) lo++;
    const dt = times[lo + 1] - times[lo];
    const frac = dt > 0 ? (t - times[lo]) / dt : 0;
    const v0 = rrIntervals[Math.min(lo, rrIntervals.length - 1)];
    const v1 = rrIntervals[Math.min(lo + 1, rrIntervals.length - 1)];
    out[k] = v0 + frac * (v1 - v0);
  }
  return Array.from(out);
}

/**
 * Sample Entropy (SampEn) — cuantifica la complejidad e irregularidad de la serie RR.
 * m = 2 (dimensión embebida), r = 0.2 * std (tolerancia de similitud).
 */
export function sampleEntropy(arr, m = 2, r = null) {
  const n = arr.length;
  if (n < m + 4) return null;
  const tolerance = r !== null ? r : 0.2 * std(arr);
  if (tolerance <= 1e-9) return null;

  let b = 0;
  let a = 0;

  for (let i = 0; i < n - m; i++) {
    for (let j = i + 1; j < n - m; j++) {
      let matchM = true;
      for (let k = 0; k < m; k++) {
        if (Math.abs(arr[i + k] - arr[j + k]) > tolerance) {
          matchM = false;
          break;
        }
      }
      if (matchM) {
        b++;
        if (Math.abs(arr[i + m] - arr[j + m]) <= tolerance) {
          a++;
        }
      }
    }
  }

  if (b === 0 || a === 0) return null;
  return Math.round(-Math.log(a / b) * 100) / 100;
}

export function computeHRV(rrIntervals) {
  if (rrIntervals.length < 2) {
    return { sdnn: 0, rmssd: 0, pnn50: 0, lf_hf: 0, sd1: 0, sd2: 0, sd1_sd2: 0, cv: 0, sampen: null };
  }

  const sdnn = std(rrIntervals);
  const diffs = rrIntervals.slice(1).map((v, i) => v - rrIntervals[i]);
  const rmssd = Math.sqrt(mean(diffs.map(d => d * d)));
  const pnn50 = (diffs.filter(d => Math.abs(d) > 50).length / diffs.length) * 100;
  const meanRR = mean(rrIntervals);
  const cv = meanRR > 0 ? (sdnn / meanRR) * 100 : 0;

  // Poincaré plot metrics: SD1 (corto plazo / vagal) y SD2 (largo plazo)
  const sd1 = rmssd / Math.SQRT2;
  const sd2Radicand = 2 * sdnn * sdnn - (rmssd * rmssd) / 2;
  const sd2 = sd2Radicand > 0 ? Math.sqrt(sd2Radicand) : sd1;
  const sd1_sd2 = sd2 > 1e-6 ? sd1 / sd2 : 0;
  const sampen = rrIntervals.length >= 10 ? sampleEntropy(rrIntervals) : null;

  // Spectral LF/HF via properly interpolated uniform RR series
  let lf_hf = 0;
  if (rrIntervals.length >= 8) {
    const rrFs = 4;
    const uniformRR = interpolateRRUniform(rrIntervals, rrFs);
    if (uniformRR) {
      const detrendedRR = detrend(uniformRR);
      const { freqs, magnitudes } = powerSpectrum(detrendedRR, rrFs);
      let lfPow = 0, hfPow = 0;
      const df = freqs.length > 1 ? freqs[1] - freqs[0] : 1;
      for (let i = 0; i < freqs.length; i++) {
        const p = magnitudes[i] * magnitudes[i] * df;
        if (freqs[i] >= 0.04 && freqs[i] <= 0.15) lfPow += p;
        if (freqs[i] > 0.15 && freqs[i] <= 0.4)  hfPow += p;
      }
      lf_hf = hfPow > 1e-12 ? lfPow / hfPow : 0;
    }
  }

  return {
    sdnn:    Math.round(sdnn    * 10) / 10,
    rmssd:   Math.round(rmssd   * 10) / 10,
    pnn50:   Math.round(pnn50   * 10) / 10,
    lf_hf:   Math.round(lf_hf   * 100) / 100,
    sd1:     Math.round(sd1     * 10) / 10,
    sd2:     Math.round(sd2     * 10) / 10,
    sd1_sd2: Math.round(sd1_sd2 * 100) / 100,
    cv:      Math.round(cv      * 10) / 10,
    sampen,
  };
}

// ─────────────────────────────────────────────────────────────
// RESPIRATORY RATE — Multi-Modulation Fusion (BW + AM + FM)
// (Charlton et al., Physiological Measurement 2016)
// ─────────────────────────────────────────────────────────────

export function computeRespRate(filteredSignal, fs) {
  if (filteredSignal.length < fs * 12) return null;

  const candidates = [];

  // 1. Modulación BW (Baseline Wander): filtrado en la banda respiratoria [0.1, 0.6] Hz (6 a 36 brpm)
  try {
    const sosResp = designButterworthBandpass(0.1, 0.6, fs);
    const bwSignal = filtfilt(sosResp, filteredSignal);
    const bwFreq = dominantFrequency(bwSignal, fs, 0.1, 0.6);
    if (bwFreq >= 0.1 && bwFreq <= 0.6) {
      candidates.push({ source: 'BW', freq: bwFreq, weight: 1.2 });
    }
  } catch {
    /* Fallback si el filtro encuentra singularidades */
  }

  // 2. Modulaciones AM y FM a partir de la detección de picos sistólicos
  const norm = normalizeSignal(filteredSignal);
  const { beats } = elgendiPeakDetector(norm, fs);

  if (beats.length >= 4) {
    const beatTimes = beats.map(b => b / fs);
    const beatAmps = beats.map(b => filteredSignal[b]);
    const interpFs = 4;
    const totalTime = beatTimes[beatTimes.length - 1];
    const nPts = Math.max(16, 1 << Math.ceil(Math.log2(totalTime * interpFs)));

    // AM: envolvente de amplitud sistólica interpolada uniformemente a 4 Hz
    const amEnvelope = new Float64Array(nPts);
    let lo = 0;
    for (let k = 0; k < nPts; k++) {
      const t = k / interpFs;
      if (t >= totalTime) { amEnvelope[k] = beatAmps[beatAmps.length - 1]; continue; }
      while (lo < beatTimes.length - 2 && beatTimes[lo + 1] <= t) lo++;
      const dt = beatTimes[lo + 1] - beatTimes[lo];
      const frac = dt > 0 ? (t - beatTimes[lo]) / dt : 0;
      amEnvelope[k] = beatAmps[lo] + frac * (beatAmps[Math.min(lo + 1, beatAmps.length - 1)] - beatAmps[lo]);
    }
    const amFreq = dominantFrequency(Array.from(amEnvelope), interpFs, 0.1, 0.6);
    if (amFreq >= 0.1 && amFreq <= 0.6) {
      candidates.push({ source: 'AM', freq: amFreq, weight: 1.0 });
    }

    // FM: arritmia sinusal respiratoria (RSA) a partir de intervalos interlatido
    if (beats.length >= 6) {
      const ibis = [];
      const ibiTimes = [];
      for (let i = 1; i < beats.length; i++) {
        const dtMs = ((beats[i] - beats[i - 1]) / fs) * 1000;
        if (dtMs >= 300 && dtMs <= 1800) {
          ibis.push(dtMs);
          ibiTimes.push(beatTimes[i]);
        }
      }
      if (ibis.length >= 5) {
        const fmEnvelope = new Float64Array(nPts);
        let loIbi = 0;
        for (let k = 0; k < nPts; k++) {
          const t = k / interpFs;
          if (t >= totalTime) { fmEnvelope[k] = ibis[ibis.length - 1]; continue; }
          while (loIbi < ibiTimes.length - 2 && ibiTimes[loIbi + 1] <= t) loIbi++;
          const dt = ibiTimes[loIbi + 1] - ibiTimes[loIbi];
          const frac = dt > 0 ? (t - ibiTimes[loIbi]) / dt : 0;
          fmEnvelope[k] = ibis[loIbi] + frac * (ibis[Math.min(loIbi + 1, ibis.length - 1)] - ibis[loIbi]);
        }
        const fmFreq = dominantFrequency(Array.from(fmEnvelope), interpFs, 0.1, 0.6);
        if (fmFreq >= 0.1 && fmFreq <= 0.6) {
          candidates.push({ source: 'FM', freq: fmFreq, weight: 1.1 });
        }
      }
    }
  }

  // Fusión inteligente: búsqueda de consenso entre modulaciones dentro de ±0.05 Hz (~3 brpm)
  if (candidates.length >= 2) {
    let bestPair = null;
    let minDiff = Infinity;
    for (let i = 0; i < candidates.length; i++) {
      for (let j = i + 1; j < candidates.length; j++) {
        const diff = Math.abs(candidates[i].freq - candidates[j].freq);
        if (diff < minDiff) {
          minDiff = diff;
          bestPair = [candidates[i], candidates[j]];
        }
      }
    }
    if (bestPair && minDiff <= 0.05) {
      const [c1, c2] = bestPair;
      const fusedHz = (c1.freq * c1.weight + c2.freq * c2.weight) / (c1.weight + c2.weight);
      const fusedBrpm = fusedHz * 60;
      if (fusedBrpm >= 6 && fusedBrpm <= 36) {
        return Math.round(fusedBrpm * 10) / 10;
      }
    }
  }

  // Si no hay consenso binario, tomar el estimador principal disponible
  if (candidates.length > 0) {
    const primaryBrpm = candidates[0].freq * 60;
    if (primaryBrpm >= 6 && primaryBrpm <= 36) {
      return Math.round(primaryBrpm * 10) / 10;
    }
  }

  // Fallback: envolvente rectificada Hilbert
  const rectified = filteredSignal.map(v => Math.abs(v));
  const sos = designButterworthBandpass(0.1, 0.6, fs);
  const envelope = filtfilt(sos, rectified);
  const respFreq = dominantFrequency(envelope, fs, 0.1, 0.6);
  const rr = respFreq * 60;
  return (rr >= 6 && rr <= 36) ? Math.round(rr * 10) / 10 : null;
}

// ─────────────────────────────────────────────────────────────
// RING BUFFER — lock-free typed circular buffer
// ─────────────────────────────────────────────────────────────

export class RingBuffer {
  constructor(size) {
    this.size = size;
    this.buffer = new Float32Array(size);
    this.index = 0;
    this.count = 0;
  }

  push(value) {
    this.buffer[this.index] = value;
    this.index = (this.index + 1) % this.size;
    if (this.count < this.size) this.count++;
  }

  toArray() {
    if (this.count < this.size) {
      return Array.from(this.buffer.subarray(0, this.count));
    }
    const out = new Array(this.size);
    for (let i = 0; i < this.size; i++) {
      out[i] = this.buffer[(this.index + i) % this.size];
    }
    return out;
  }

  /** Most recent n samples, oldest → newest (no full-buffer copy) */
  tail(n) {
    const len = Math.min(n, this.count);
    const out = new Array(len);
    for (let i = 0; i < len; i++) {
      out[i] = this.buffer[(this.index - len + i + this.size * 2) % this.size];
    }
    return out;
  }

  get length()  { return this.count; }
  get isFull()  { return this.count === this.size; }
  clear()       { this.index = 0; this.count = 0; this.buffer.fill(0); }
}