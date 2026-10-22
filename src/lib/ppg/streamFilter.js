/**
 * Filtro causal en flujo (muestra a muestra).
 * ─────────────────────────────────────────────────────────────
 * A diferencia de filtfilt sobre una ventana deslizante, un filtro causal con
 * estado NUNCA reescribe el pasado: cada muestra, una vez emitida, es
 * definitiva. Eso elimina el parpadeo del borde de avance y los falsos picos
 * que aparecían cuando la ventana se recalculaba en cada fotograma.
 */
import { designButterworthBandpass } from '../dsp.js';

export class BiquadCascade {
  constructor(sections) {
    this.s = sections.map((c) => ({ ...c, z1: 0, z2: 0 }));
  }

  /** Forma transpuesta II: estable y con mínimo error numérico */
  process(x) {
    let v = x;
    for (const q of this.s) {
      const y = q.b0 * v + q.z1;
      q.z1 = q.b1 * v - q.a1 * y + q.z2;
      q.z2 = q.b2 * v - q.a2 * y;
      v = y;
    }
    return v;
  }

  reset() {
    for (const q of this.s) { q.z1 = 0; q.z2 = 0; }
  }
}

/** Paso-bajo biquad (RBJ) */
export function designLowpass(fc, fs, Q = Math.SQRT1_2) {
  const w0 = 2 * Math.PI * fc / fs;
  const cos = Math.cos(w0);
  const alpha = Math.sin(w0) / (2 * Q);
  const a0 = 1 + alpha;
  return {
    b0: (1 - cos) / 2 / a0,
    b1: (1 - cos) / a0,
    b2: (1 - cos) / 2 / a0,
    a1: (-2 * cos) / a0,
    a2: (1 - alpha) / a0,
  };
}

/** Pasabanda cardíaco 0,5–4,5 Hz + paso-bajo adicional a 4 Hz (rechazo de ruido de cámara) */
export function designCardiacFilter(fs) {
  return [...designButterworthBandpass(0.5, 4.5, fs), designLowpass(4.0, fs)];
}