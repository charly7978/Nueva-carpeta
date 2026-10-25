/**
 * TraceStore — puente entre el motor y el renderizador.
 * El motor escribe muestras (≈30 Hz, con marca de tiempo real) y el lienzo las
 * lee en su propio bucle de 60+ fps. Nada pasa por React, así que dibujar no
 * provoca renders ni recoge basura.
 *
 * Cada muestra guarda DOS valores del mismo instante:
 *  - `v`: señal de morfología normalizada por la ganancia de pantalla (lo que se
 *    dibuja; misma forma que la señal real, amplitud adaptada al lienzo).
 *  - `a`: la misma muestra en unidades absolutas AC/DC (%). Sirve para rotular
 *    los puntos fiduciales con el valor fisiológico real y no con píxeles.
 */
const PEN_LAG = 0.075; // measured-sample buffer: smooth 15/30-fps capture without extrapolation

export class TraceStore {
  constructor(cap = 1200) {
    this.cap = cap;
    this.t = new Float64Array(cap);
    this.v = new Float32Array(cap);
    this.a = new Float32Array(cap);
    this.beats = [];
    // Ganancia de pantalla vigente en cada muestra, para poder reconstruir el
    // valor absoluto de un punto dibujado (ver absAt).
    this.g = new Float32Array(cap);
    this.clear();
  }

  clear() {
    this.n = 0;
    this.offset = null;
    this.beats = [];
  }

  get size() { return Math.min(this.n, this.cap); }
  get lastT() { return this.n ? this.t[(this.n - 1) % this.cap] : 0; }

  /** @param t instante de la muestra (s)  @param wall instante de llegada (s, performance.now()/1000) */
  push(t, v, wall, abs = NaN, gain = NaN) {
    const i = this.n % this.cap;
    this.t[i] = t;
    this.v[i] = v;
    this.a[i] = abs;
    this.g[i] = gain;
    this.n++;

    // Retardo de llegada: sube de inmediato con cada fotograma tardío y baja muy
    // despacio. Así el lápiz nunca espera a un dato que aún no ha llegado → avance
    // a velocidad constante, sin tirones, con la mínima latencia que lo permite.
    const off = wall - t;
    if (this.offset === null) this.offset = off;
    else if (off > this.offset) this.offset += 0.35 * (off - this.offset);
    else this.offset += 0.004 * (off - this.offset);
  }

  timeAt(k) { return this.t[k % this.cap]; }
  valueAt(k) { return this.v[k % this.cap]; }
  absAt(k) { return this.a[k % this.cap]; }
  get firstIndex() { return Math.max(0, this.n - this.cap); }

  /** Instante que el lápiz debe mostrar ahora: avanza con el reloj, nunca pasa del último dato */
  penTime(nowSec) {
    if (!this.n || this.offset === null) return 0;
    return Math.min(nowSec - this.offset - PEN_LAG, this.lastT);
  }

  /** Índice de la muestra más cercana (no posterior) al instante t dentro de la ventana viva */
  indexAt(t) {
    const first = this.firstIndex;
    let lo = first;
    let hi = this.n - 1;
    if (hi < lo) return -1;
    if (t <= this.timeAt(lo)) return lo;
    if (t >= this.timeAt(hi)) return hi;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (this.timeAt(mid) <= t) lo = mid; else hi = mid;
    }
    return lo;
  }

  /** Valor interpolado linealmente en el instante t */
  sampleAt(t) {
    for (let k = this.n - 1; k > this.firstIndex; k--) {
      const t1 = this.timeAt(k);
      const t0 = this.timeAt(k - 1);
      if (t1 >= t && t0 <= t) {
        const f = t1 > t0 ? (t - t0) / (t1 - t0) : 1;
        return this.valueAt(k - 1) + f * (this.valueAt(k) - this.valueAt(k - 1));
      }
      if (t1 < t) break;
    }
    return this.n ? this.valueAt(this.n - 1) : 0;
  }
}
