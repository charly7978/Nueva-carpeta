import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { PPGPipeline } from '@/lib/ppg/pipeline';
import { TraceStore } from '@/lib/ppg/traceStore';
import { reportVitalsAccepted } from '@/lib/reportQuality';

function capture({ fps = 30, mode = 'clean', bpm = 72 } = {}) {
  const store = new TraceStore(), pipeline = new PPGPipeline({ store });
  const states = [];
  let lastCount = 0, resets = 0;
  for (let i = 0; i < fps * 38; i++) {
    const t = i / fps;
    if (mode === 'gap' && t >= 25 && t < 25.1) continue;
    const phase = t * bpm / 60 % 1;
    const gaussian = (center, width) => Math.exp(-0.5 * ((phase - center) / width) ** 2);
    const pulse = mode === 'flat' ? 0 : mode === 'noise' ? 0.0004 * Math.sin(i * 71.43)
      : 0.008 * (gaussian(0.15, 0.055) + 0.3 * gaussian(0.65, 0.07) - 0.25);
    const finger = mode !== 'remove' || t < 25;
    const contact = finger && !(mode === 'blip' && i === fps * 25);
    const usable = mode === 'clipped' ? [false, true, false] : [true, true, true];
    const dc = mode === 'clipped' ? [255, 65, 2] : [150, 65, 32];
    pipeline.push(100 + t, ...dc.map((v, c) => v * (1 - pulse * (1 + 0.2 * c))),
      100 + t, finger, { contact, usable });
    if (pipeline.count < lastCount) resets++;
    lastCount = pipeline.count;
    const state = pipeline.getState();
    if (i % Math.max(1, Math.round(fps / 5)) === 0) states.push({ ...state, t });
  }
  return { pipeline, states, resets, store };
}

for (const fps of [15, 30, 60]) test(`real ${fps}-fps samples acquire the same pulse`, () => {
  const { states } = capture({ fps });
  const accepted = states.filter(s => s.hr != null);
  assert.ok(accepted.length > 60);
  assert.ok(accepted.every(s => Math.abs(s.hr - 72) <= 3));
});
for (const mode of ['blip', 'gap']) test(`${mode} recovers without restarting acquisition`, () => {
  const { states, resets } = capture({ mode });
  assert.equal(resets, 0);
  const recovery = states.find(s => s.t > 25.2 && s.hr != null);
  assert.ok(recovery && recovery.t < 29, 'recovery requires fresh beats, not a full warmup');
  assert.ok(states.filter(s => s.t >= 30).every(s => s.state === 'locked'));
  const held = states.find(s => s.hrHeld);
  assert.ok(held);
  assert.equal(held.hr, null);
  assert.equal(reportVitalsAccepted({ ...held, sqi: 100, cleanSeconds: 20 }, 40), false);
});
for (const mode of ['flat', 'noise']) test(`${mode} never becomes a pulse`, () => {
  const { states } = capture({ mode });
  assert.ok(states.every(s => s.hr == null));
});
test('finger removal clears current and held values immediately', () => {
  const { states } = capture({ mode: 'remove' });
  assert.ok(states.some(s => s.hr != null));
  assert.ok(states.filter(s => s.t >= 25).every(s => s.hr == null && s.displayHr == null));
});
test('individually clipped/dark channels do not block a good channel', () => {
  const { pipeline } = capture({ mode: 'clipped' });
  assert.equal(pipeline.getState().hr, 72);
  assert.equal(pipeline.channel, 'g');
});
test('trace interpolation does not bridge an invalid sample', () => {
  const store = new TraceStore();
  store.push(1, 0, 1); store.push(1.033, NaN, 1.033); store.push(1.066, 1, 1.066);
  assert.ok(Number.isNaN(store.sampleAt(1.05)));
  assert.ok(store.penTime(1.09) < store.lastT);
});