import { median } from '@/lib/dsp';

/**
 * Separa el ruido en banda cardíaca del ruido fuera de banda.
 * @param {Object} params
 * @param {number[]} params.filtered   señal ya filtrada (canal de detección), AC/DC
 * @param {number}   params.tremorScale desviación robusta de la rama 4.5–12 Hz, AC/DC
 * @param {number}   params.lagSamples  período medido en muestras (0 si no hay)
 * @param {number}   params.signalScale desviación robusta de la señal en banda, AC/DC
 * @param {number}   params.fs
 * @returns {{inBand:number, outBand:number, tremor:number}}
 */
export function bandNoise({ filtered, tremorScale, lagSamples, signalScale, fs }) {
  const arr = filtered || [];
  const n = arr.length;
  let inBand;
  if (lagSamples && lagSamples > 2 && n >= Math.ceil(lagSamples) + 2) {
    const lag = lagSamples;
    const residuals = [];
    for (let i = Math.max(2, Math.ceil(lag)); i < n; i++) {
      const position = i - lag;
      const lo = Math.floor(position);
      if (lo + 1 >= n) break;
      const fraction = position - lo;
      const previous = arr[lo] + fraction * (arr[lo + 1] - arr[lo]);
      residuals.push(arr[i] - previous);
    }
    if (residuals.length >= 4) {
      const center = median(residuals);
      const mad = median(residuals.map(v => Math.abs(v - center)));
      inBand = (1.4826 * mad) / Math.sqrt(2);
    }
  }
  if (inBand == null) {
    const curv = [];
    for (let i = 2; i < n; i++) {
      curv.push(Math.abs(arr[i] - 2 * arr[i - 1] + arr[i - 2]));
    }
    if (curv.length >= 4) {
      const center = median(curv);
      const mad = median(curv.map(v => Math.abs(v - center)));
      inBand = (1.4826 * mad) / Math.sqrt(6);
    } else {
      inBand = 0;
    }
  }
  if (!Number.isFinite(inBand) || inBand < 0) inBand = 0;
  const outBand = Math.max(0, (tremorScale || 0) - 0.15 * inBand);
  const tremor = outBand / Math.max(1e-9, signalScale || 1e-9);
  return { inBand, outBand, tremor };
}
