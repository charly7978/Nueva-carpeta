/**
 * Señal de verificación: un dedo sobre la lente modelado físicamente.
 * La reflectancia DISMINUYE con el volumen de sangre, el AC/DC es ~1,5 % y hay
 * respiración, deriva de iluminación y ruido de sensor. Pasa por el mismo
 * procesamiento que la cámara real, así que sirve para comprobar el monitor.
 *
 * Ritmos: 'normal' (con arritmia sinusal respiratoria), 'pvc' (extrasístoles
 * aisladas con pausa compensatoria), 'bigeminy' (un latido prematuro tras cada
 * normal) y 'af' (intervalos aleatorios, irregularmente irregular).
 */
const G = (p, mu, s) => Math.exp(-((p - mu) * (p - mu)) / (2 * s * s));

/**
 * Onda de pulso fisiológica completa, para que la señal de verificación muestre
 * lo mismo que se quiere poder leer en una medición real:
 *   frente sistólico rápido → PICO SISTÓLICO (P1) → caída con ESCOTADURA
 *   DICRÓTICA (cierre aórtico) → PICO DIASTÓLICO o de reflexión (P2) → cola
 *   diastólica hasta el PIE.
 * La suma de tres gaussianas (la versión anterior) no tiene mínimo entre P1 y
 * P2, así que no podía mostrar escotadura: era una onda de dos jorobas sin
 * fisiología. Aquí la escotadura es explícita y su profundidad es finita.
 * Amplitud 0..1 sobre la fase 0..1 del ciclo.
 */
function ppgTemplate(phase) {
  const p = phase < 0 ? phase + 1 : phase;
  return 1.0 * G(p, 0.2, 0.055)      // P1 sistólico
    - 0.05 * G(p, 0.345, 0.028)      // escotadura dicrótica
    + 0.4 * G(p, 0.43, 0.055)        // P2 diastólico (onda reflejada)
    + 0.1 * G(p, 0.7, 0.11);         // cola diastólica
}

function gauss() {
  return (Math.random() + Math.random() + Math.random() - 1.5) * 0.8;
}

const PULSE_S = 0.88;   // duración de un pulso (s) en los ritmos por eventos
// Media del área del pulso: restarla deja la señal centrada en la línea de base
const PULSE_MEAN = 0.22;

export class PPGSimulator {
  constructor(rhythm = 'normal') {
    this.rhythm = rhythm;
    this.phase = 0.15;
    this.T = 0;
    this.last = null;
    this.ev = { nextT: null, nextAmp: 1, nextKind: 'A', until: 8, active: [] };
  }

  _normalHr() {
    return 68 + 5.5 * Math.sin(2 * Math.PI * 0.22 * this.T) + 1.6 * Math.sin(2 * Math.PI * 0.07 * this.T);
  }

  /** Qué viene tras un latido de tipo `last`: separación, amplitud y tipo del siguiente */
  _next(last) {
    const N = 60 / this._normalHr();
    const e = this.ev;
    switch (this.rhythm) {
      case 'af':
        return { gap: 0.42 + Math.random() * 0.8, amp: 0.6 + Math.random() * 0.5, kind: 'A' };
      case 'bigeminy':
        return last === 'A'
          ? { gap: 0.55 * N, amp: 0.6, kind: 'E' }
          : { gap: 1.45 * N, amp: 1.05, kind: 'A' };
      case 'trigeminy':
        if (last === 'E') return { gap: 1.45 * N, amp: 1.1, kind: 'A' };
        e.cnt = (e.cnt || 0) + 1;
        return e.cnt % 2 === 0
          ? { gap: 0.55 * N, amp: 0.6, kind: 'E' }
          : { gap: N, amp: 1, kind: 'A' };
      case 'pvc':
        if (last === 'E') return { gap: 1.45 * N, amp: 1.12, kind: 'A' };
        if (--e.until <= 0) {
          e.until = 7 + Math.floor(Math.random() * 5);
          return { gap: 0.55 * N, amp: 0.55, kind: 'E' };
        }
        return { gap: N, amp: 1, kind: 'A' };
      default:
        return { gap: N, amp: 1, kind: 'A' };
    }
  }

  _eventPulse(t) {
    const e = this.ev;
    if (e.nextT === null) e.nextT = t + 0.2;
    while (e.nextT <= t) {
      e.active.push({ t0: e.nextT, a: e.nextAmp });
      const nx = this._next(e.nextKind);
      e.nextT += nx.gap;
      e.nextAmp = nx.amp;
      e.nextKind = nx.kind;
    }
    e.active = e.active.filter((b) => t - b.t0 < 1.3 * PULSE_S);
    let s = 0;
    for (const b of e.active) s += b.a * ppgTemplate((t - b.t0) / PULSE_S);
    return (s - PULSE_MEAN) * 0.016;
  }

  /** Devuelve [r, g, b] para el instante t (s) */
  sample(t) {
    const dt = this.last === null ? 0 : t - this.last;
    this.last = t;
    this.T += dt;

    let pulse;
    if (this.rhythm === 'normal') {
      // Frecuencia con arritmia sinusal respiratoria
      this.phase += (this._normalHr() / 60) * dt;
      if (this.phase >= 1) this.phase -= 1;
      pulse = (ppgTemplate(this.phase) - PULSE_MEAN) * 0.016;
    } else {
      pulse = this._eventPulse(t);
    }

    const resp = 0.0035 * Math.sin(2 * Math.PI * 0.24 * this.T);
    const drift = 0.0025 * Math.sin(2 * Math.PI * 0.045 * this.T);
    const noise = gauss() * 0.0005;
    const m = 1 - pulse + resp + drift + noise;

    return [
      210 * (1 - (pulse * 0.55) + resp + drift + noise),
      96 * m,
      60 * (1 - (pulse * 0.4) + resp + drift + noise),
    ];
  }
}
