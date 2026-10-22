/**
 * TraceStore — puente entre el motor y el renderizador.
 * El motor escribe muestras (≈30 Hz, con marca de tiempo real) y el lienzo las
 * lee en su propio bucle de 60+ fps. Nada pasa por React, así que dibujar no
 * provoca renders ni recoge basura.
 */
const PEN_LAG = 0.075; // measured-sample buffer: smooth 15/30-fps capture without extrapolation

export class TraceStore {
  constructor(cap = 1200) {
    this.cap = cap;
    this.t = new Float64Array(cap);
    this.v = new Float32Array(cap);
    this.beats = [];
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
  push(t, v, wall) {
    const i = this.n % this.cap;
    this.t[i] = t;
    this.v[i] = v;
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
  get firstIndex() { return Math.max(0, this.n - this.cap); }

  /** Instante que el lápiz debe mostrar ahora: avanza con el reloj, nunca pasa del último dato */
  penTime(nowSec) {
    if (!this.n || this.offset === null) return 0;
    return Math.min(nowSec - this.offset - PEN_LAG, this.lastT);
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