import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { PPGPipeline } from '@/lib/ppg/pipeline';
import { estimateBloodPressure, makeCalibration } from '@/lib/ppg/bpModel';
import { recordFromVitals } from '@/lib/vitalRecords';

function sample(pipeline, t, hr, reflection = 0) {
  const phase = (t * hr / 60) % 1;
  const g = (center, width) => Math.exp(-0.5 * ((phase - center) / width) ** 2);
  const pulse = 0.008 * (g(0.15, 0.055) + reflection * g(0.65, 0.07) - 0.25);
  pipeline.push(100 + t, ...[150, 65, 32].map((dc, c) => dc * (1 - pulse * (1 + 0.2 * c))),
    100 + t, true, { contact: true, usable: [true, true, true] });
}

function measure(hr, reflection, seconds = 30) {
  const pipeline = new PPGPipeline();
  const published = [];
  for (let i = 0; i < 30 * seconds; i++) {
    sample(pipeline, i / 30, hr, reflection);
    if (i % 6 === 0) {
      const state = pipeline.getState();
      if (state.hr != null) published.push(state.hr);
    }
  }
  return { state: pipeline.getState(), published };
}

for (const hr of [60, 72, 100]) {
  test(`single-lobed ${hr} bpm survives sample-window rounding`, () => {
    const { state, published } = measure(hr, 0);
    assert.equal(state.state, 'locked');
    assert.ok(Math.abs(state.hr - hr) <= 3);
    assert.ok(published.every(value => Math.abs(value - hr) <= 3));
  });
  for (const reflection of [0.3, 0.7, 0.9]) {
    test(`secondary lobe ${reflection} at ${hr} bpm never publishes double HR`, () => {
      const { state, published } = measure(hr, reflection);
      assert.ok(published.every(value => Math.abs(value - hr) <= 3));
      if (reflection <= 0.3) {
        assert.equal(state.state, 'locked', 'a distinguishable second lobe must not prevent acquisition');
        assert.ok(published.length > 30);
      } else if (state.hr == null) assert.equal(state.pulseAmbiguous, true);
    });
  }
}

test('irregular fallback cannot publish a double-rate conflict', () => {
  const p = new PPGPipeline();
  p.finger = p.contact = p.sigOk = true;
  p.lastT = 20;
  p.evidence[p.sel] = { hz: 1, strength: 0.95, viable: true };
  p.tracker.snapshot = () => ({ stale: false, locked: false, hrPreview: 120 });
  p.rhythm.update = () => ({ trusted: true, n: 20, shapeQ: 0.95, meanHR: 120, kind: 'bigeminy' });
  const state = p.getState();
  assert.notEqual(state.state, 'locked');
  assert.equal(state.hr, null);
  assert.equal(state.pulseAmbiguous, true);
});

test('published HR is slew-limited and held through brief dropouts', () => {
  const p = new PPGPipeline();
  assert.equal(p._displayHR(120, 0), 120);
  assert.equal(p._displayHR(200, 0.2), 121);   // ≤5 lpm/s
  assert.equal(p._displayHR(null, 0.4), 121);  // held, not blanked
  assert.equal(p._displayHR(null, 4), null);   // retired once unsupported
});

test('a cuff reading anchors the optical estimate and narrows its band', () => {
  const features = { hr: 72, aix: 0.3, crest: 180, width: 250 };
  const free = estimateBloodPressure(features, null);
  assert.equal(free.calibrated, false);
  const reference = makeCalibration({ sbp: 126, dbp: 82 }, features);
  const anchored = estimateBloodPressure(features, reference);
  assert.equal(anchored.calibrated, true);
  assert.ok(Math.abs(anchored.sbp - 126) <= 2);
  assert.ok(anchored.sbpHi - anchored.sbpLo < free.sbpHi - free.sbpLo);
  assert.throws(() => makeCalibration({ sbp: 82, dbp: 126 }, features));
  assert.throws(() => makeCalibration({ sbp: NaN, dbp: 82 }, features));
});

test('saved camera measurements carry the BP estimate', () => {
  const record = recordFromVitals({ state: 'locked', hr: 72, sqi: 95, cleanSeconds: 20,
    bp: { sbp: 118, dbp: 76 } }, 30);
  assert.equal(record.hr, 72);
  assert.equal(record.sbp, 118);
  assert.equal(record.dbp, 76);
});