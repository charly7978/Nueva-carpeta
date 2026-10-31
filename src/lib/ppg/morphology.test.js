import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { detectPulseFeatures } from '@/lib/ppg/pulseFeatures';
import { monotoneSlopes } from '@/components/waveform/drawTrace';

const FS = 30;
const G = (t, mu, s) => Math.exp(-(((t - mu) ** 2) / (2 * s * s)));

/** Pulso sintético con P1 en 0.62 s, pie en 0.50, escotadura en ~0.73 y P2 en 0.80 */
function pulseAt(t) {
  return 1.0 * G(t, 0.62, 0.045)
    - 0.30 * G(t, 0.50, 0.060)
    - 0.18 * G(t, 0.735, 0.030)
    + 0.45 * G(t, 0.80, 0.050);
}

function fakeStore(duration, valueAt, absAt = (t) => valueAt(t) * 100) {
  const n = Math.round(duration * FS) + 1;
  const times = new Float64Array(n);
  const values = new Float32Array(n);
  const abs = new Float32Array(n);
  for (let k = 0; k < n; k++) {
    const t = k / FS;
    times[k] = t;
    values[k] = valueAt(t);
    abs[k] = absAt(t);
  }
  const firstIndex = 0;
  return {
    n, cap: n, firstIndex,
    lastT: times[n - 1],
    timeAt: (k) => times[k],
    valueAt: (k) => values[k],
    absAt: (k) => abs[k],
    indexAt(t) {
      let lo = 0;
      let hi = n - 1;
      if (t <= times[lo]) return lo;
      if (t >= times[hi]) return hi;
      while (hi - lo > 1) {
        const mid = (lo + hi) >> 1;
        if (times[mid] <= t) lo = mid; else hi = mid;
      }
      return lo;
    },
  };
}

const beat = { t: 0.62, vt: 0.50, ibi: 0.85, confirmed: true, bad: false };

test('reconoce pico sistólico, pie, escotadura y pico diastólico en su instante', () => {
  const store = fakeStore(1.4, pulseAt);
  const fx = detectPulseFeatures(store, beat, null);
  assert.ok(fx, 'la morfología debe reconocerse');
  assert.ok(Math.abs(fx.peak.t - 0.62) <= 0.02, `P1 en ${fx.peak.t.toFixed(3)}`);
  assert.ok(Math.abs(fx.foot.t - 0.50) <= 0.03, `pie en ${fx.foot.t.toFixed(3)}`);
  assert.ok(fx.notch, 'debe existir escotadura dicrótica');
  assert.ok(Math.abs(fx.notch.t - 0.73) <= 0.035, `escotadura en ${fx.notch.t.toFixed(3)}`);
  assert.ok(fx.diastolic, 'debe existir pico diastólico');
  assert.ok(Math.abs(fx.diastolic.t - 0.80) <= 0.035, `P2 en ${fx.diastolic.t.toFixed(3)}`);
  assert.equal(fx.plateau, null, 'un pico redondeado no es una meseta');
  // Los valores absolutos viajan en % AC/DC, sobre la misma muestra
  assert.ok(Math.abs(fx.peak.abs - pulseAt(fx.peak.t) * 100) < 6);
  assert.ok(fx.peak.v > fx.notch.v && fx.diastolic.v > fx.notch.v);
});

test('una onda sin escotadura no inventa escotadura ni P2', () => {
  const smooth = (t) => 1.0 * G(t, 0.62, 0.075);
  const store = fakeStore(1.4, smooth);
  const fx = detectPulseFeatures(store, beat, null);
  assert.ok(fx);
  assert.equal(fx.notch, null);
  assert.equal(fx.diastolic, null);
});

test('la meseta de saturación se detecta y se devuelve tal cual', () => {
  // Saturación real: el sensor recorta el pico, así que varias muestras quedan
  // exactamente en el techo. No es un pico redondeado, es un tope del ADC.
  const clipped = (t) => Math.min(0.9, 1.35 * G(t, 0.62, 0.07));
  const store = fakeStore(1.4, clipped);
  const fx = detectPulseFeatures(store, beat, null);
  assert.ok(fx);
  assert.ok(fx.plateau, 'el recorte plano debe marcarse como meseta');
  assert.ok(fx.plateau.t1 - fx.plateau.t0 >= 0.06, 'la meseta tiene anchura real');
  assert.ok(Math.abs(fx.plateau.v - 0.9) < 1e-3);
});

test('la ventana incompleta no devuelve morfología inventada', () => {
  const store = fakeStore(0.7, pulseAt); // termina justo después del pico
  assert.equal(detectPulseFeatures(store, beat, null), null);
});

test('PCHIP no sobreoscila y conserva cada muestra', () => {
  const ts = [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6];
  const vs = [0, 0, 0, 1, 1, 0.2, 0];
  const m = monotoneSlopes(ts, vs, 0, ts.length - 1);
  for (let k = 0; k < ts.length - 1; k++) {
    const h = ts[k + 1] - ts[k];
    const lo = Math.min(vs[k], vs[k + 1]);
    const hi = Math.max(vs[k], vs[k + 1]);
    for (let s = 0; s <= 20; s++) {
      const u = s / 20;
      const h00 = (1 + 2 * u) * (1 - u) * (1 - u);
      const h10 = u * (1 - u) * (1 - u);
      const h01 = u * u * (3 - 2 * u);
      const h11 = u * u * (u - 1);
      const y = h00 * vs[k] + h10 * h * m[k] + h01 * vs[k + 1] + h11 * h * m[k + 1];
      assert.ok(y >= lo - 1e-9 && y <= hi + 1e-9,
        `tramo ${k} en u=${u}: ${y} fuera de [${lo}, ${hi}]`);
    }
  }
});

test('PCHIP aplana el extremo: tangente nula donde la señal deja de subir', () => {
  const ts = [0, 1, 2, 3];
  const vs = [0, 1, 1, 0];
  const m = monotoneSlopes(ts, vs, 0, ts.length - 1);
  assert.equal(m[1], 0);
  assert.equal(m[2], 0);
});
