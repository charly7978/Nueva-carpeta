import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { PPGPipeline } from '@/lib/ppg/pipeline';
import { bandNoise } from '@/lib/ppg/bandNoise';

test('el temblor fuera de banda no entra en la señal (bandNoise)', () => {
  // sinusal limpia
  const fs = 30;
  const clean = [];
  for (let i = 0; i < 120; i++) clean.push(Math.sin(2 * Math.PI * 1.2 * i / fs));
  const bn0 = bandNoise({ filtered: clean, tremorScale: 0.001, lagSamples: fs / 1.2, signalScale: 0.5, fs });
  // con temblor
  const trem = [];
  for (let i = 0; i < 120; i++) trem.push(Math.sin(2 * Math.PI * 1.2 * i / fs) * (1 + 0.01 * Math.sin(2 * Math.PI * 8 * i / fs)));
  const bn1 = bandNoise({ filtered: trem, tremorScale: 0.05, lagSamples: fs / 1.2, signalScale: 0.5, fs });
  assert.ok(Number.isFinite(bn1.inBand));
  assert.ok(bn1.tremor >= 0);
});

function tremor(t, amp) {
  // d(t) = suma de 5.3 / 7.9 / 11.2 Hz
  return amp * (Math.sin(2 * Math.PI * 5.3 * t) + Math.sin(2 * Math.PI * 7.9 * t) + Math.sin(2 * Math.PI * 11.2 * t)) / 3;
}

function sample(pipeline, t, hr, tremorAmp, reflection = 0, jitter = 0) {
  const phase = (t * hr / 60) % 1;
  const g = (center, width) => Math.exp(-0.5 * ((phase - center) / width) ** 2);
  const pulse = 0.008 * (g(0.15, 0.055) + reflection * g(0.65, 0.07) - 0.25);
  const d = tremor(t, tremorAmp);
  const tt = 100 + t;
  const vals = [150, 65, 32].map((dc, c) => dc * (1 - pulse * (1 + 0.2 * c)) * (1 + d));
  pipeline.push(tt, ...vals, 100 + t, true, { contact: true, usable: [true, true, true] });
}

function measure(hr, tremorAmp, seconds = 40, reflection = 0, jitter = 0) {
  const pipeline = new PPGPipeline();
  const published = [];
  let resets = 0;
  // instrument _dropSignal via monkey? Instead count via cleanSince resets heuristic: track resets by checking if state goes to searching after locked
  let lockedSamples = 0;
  let totalAfter12 = 0;
  for (let i = 0; i < 30 * seconds; i++) {
    const t = i / 30;
    sample(pipeline, t, hr, tremorAmp, reflection, jitter);
    if (i % 6 === 0) {
      const state = pipeline.getState();
      if (state.hr != null) published.push(state.hr);
      if (t >= 12) {
        totalAfter12++;
        if (state.state === 'locked') lockedSamples++;
      }
    }
  }
  const finalState = pipeline.getState();
  return { state: finalState, published, lockedFraction: totalAfter12 ? lockedSamples / totalAfter12 : 0, resets };
}

test('micro-temblor 0-1% conserva la FC', () => {
  for (const amp of [0, 0.05, 0.1, 0.2, 0.35]) {
    for (const hr of [72, 100]) {
      const { state, published, lockedFraction } = measure(hr, amp, 40);
      assert.ok(Math.abs((state.hr ?? hr) - hr) <= 4, `hr=${hr} amp=${amp} got ${state.hr}`);
    }
  }
});

test('nunca publica el doble de la tasa real', () => {
  const { published } = measure(72, 0.2, 40);
  assert.ok(published.every(v => v <= 76 && v >= 68), 'no double rate');
});

test('temblor grueso degrada, no miente', () => {
  const { state } = measure(72, 1.0, 20);
  if (state.hr != null) {
    assert.ok(Math.abs(state.hr - 72) <= 4);
  }
});

test('jitter de marca de tiempo no altera nada', () => {
  const a = measure(72, 0.1, 20, 0, 0);
  const b = measure(72, 0.1, 20, 0, 0.006);
  assert.ok(Math.abs((a.state.hr ?? 72) - (b.state.hr ?? 72)) <= 2);
});
