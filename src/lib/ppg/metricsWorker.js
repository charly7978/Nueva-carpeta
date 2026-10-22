/** Secondary, unvalidated estimates run off the camera/canvas thread.
 * This worker never detects, schedules or synthesizes heartbeats.
 */
import { detrend, hampelFilter, designButterworthBandpass, filtfilt, computeSpO2Ratio, computeRespRate, computeHRV } from '@/lib/dsp';
import { estimateBloodPressure } from '@/lib/ppg/bpModel';
import { extractBpFeatures } from '@/lib/ppg/bpFeatures';

self.onmessage = ({ data }) => {
  const { id, raw, red, green, rr, fs, hr, calibration, regular, colourReliable } = data;
  const rrSeconds = rr.reduce((s, v) => s + v, 0) / 1000;
  const hrv = regular && rr.length >= 20 && rrSeconds >= 20 ? computeHRV(rr) : null;
  if (hrv) {
    hrv.durationS = rrSeconds;
    hrv.n = rr.length;
    if (rrSeconds < 120) hrv.lf_hf = null;
  }
  const broad = filtfilt(designButterworthBandpass(0.6, 4, fs), detrend(hampelFilter(raw, 9, 3)));
  const bpFeatures = hr > 30 ? extractBpFeatures(broad, fs, hr) : null;
  self.postMessage({
    id,
    bpFeatures,
    slow: {
      spo2: colourReliable ? computeSpO2Ratio(red, green, fs) : null,
      hrv,
      respRate: raw.length >= fs * 12 ? computeRespRate(broad, fs) : null,
      bp: estimateBloodPressure(bpFeatures, calibration),
    },
  });
};