/** RR-adaptive morphology: fixed-duration windows overlap neighbouring beats
 * at high rates. Resample a bounded, detrended pulse segment instead.
 * Correlation checks shape, not amplitude; it cannot establish clinical validity.
 */
export function pulseWindow(tracker, beat, points = 32) {
  const { idx, pre, post } = beat;
  const first = idx - pre, last = idx + post;
  if (first < Math.max(0, tracker.n - tracker.Y.length) || last >= tracker.n) return null;
  for (let k = first; k <= last; k++) if (!tracker.V[k % tracker.Y.length]) return null;
  const a = tracker._y(first), slope = (tracker._y(last) - a) / (last - first);
  const vec = new Float32Array(points);
  let mean = 0, energy = 0;
  for (let j = 0; j < points; j++) {
    const x = j * (last - first) / (points - 1), k = Math.floor(x);
    const lo = tracker._y(first + k), hi = tracker._y(Math.min(last, first + k + 1));
    vec[j] = lo + (x - k) * (hi - lo) - a - slope * x;
    mean += vec[j];
  }
  mean /= points;
  for (let j = 0; j < points; j++) { vec[j] -= mean; energy += vec[j] ** 2; }
  if (energy < 1e-16) return null;
  const norm = Math.sqrt(energy);
  for (let j = 0; j < points; j++) vec[j] /= norm;
  return vec;
}