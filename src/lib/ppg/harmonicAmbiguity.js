/** A repeatable subharmonic can be a second lobe of one pulse, not another
 * heartbeat. Do not guess by halving/doubling HR; withhold ambiguous evidence.
 * The power threshold is an engineering safeguard, not clinical validation. */
export default function harmonicAmbiguity(freqs, magnitudes, hz, fs, samples, minCycles = 3) {
  const half = hz / 2;
  if (half < 0.5 || samples * half / fs < minCycles) return false;
  const width = Math.max(0.04, 0.4 * fs / samples);
  let pulsePower = 0, halfPower = 0;
  for (let i = 1; i < freqs.length - 1; i++) {
    const power = magnitudes[i] ** 2;
    if (Math.abs(freqs[i] - hz) <= width) pulsePower = Math.max(pulsePower, power);
    if (Math.abs(freqs[i] - half) <= width && magnitudes[i] > magnitudes[i - 1]
      && magnitudes[i] >= magnitudes[i + 1]) halfPower = Math.max(halfPower, power);
  }
  return pulsePower > 1e-15 && halfPower >= 0.003 * pulsePower;
}