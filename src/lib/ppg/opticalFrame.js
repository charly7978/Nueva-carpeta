/** Optical contact is a placement heuristic, never proof of a heartbeat.
 * Camera channels can clip independently; never select a clipped/dark channel.
 */
export function analyzeOpticalFrame(imageData, width, height, roiFraction = 0.62) {
  const { data } = imageData;
  const sum = [0, 0, 0], clipped = [0, 0, 0];
  const tiles = Array.from({ length: 4 }, () => [0, 0, 0]);
  const tileCounts = [0, 0, 0, 0];
  let n = 0, covered = 0, texture = 0;
  const marginX = Math.floor(width * (1 - roiFraction) / 2);
  const marginY = Math.floor(height * (1 - roiFraction) / 2);
  for (let y = marginY; y < height - marginY - 2; y += 2) {
    for (let x = marginX; x < width - marginX - 2; x += 2) {
      const i = (y * width + x) * 4;
      const r = data[i], g = data[i + 1], b = data[i + 2];
      const tile = (y >= height / 2 ? 2 : 0) + (x >= width / 2 ? 1 : 0);
      tileCounts[tile]++;
      if (r > 35 && r > 1.12 * g && r > 1.12 * b) covered++;
      texture += (Math.abs(r - data[i + 8]) + Math.abs(r - data[i + width * 8])) / Math.max(40, r);
      for (let c = 0; c < 3; c++) {
        sum[c] += data[i + c];
        tiles[tile][c] += data[i + c];
        if (data[i + c] <= 3 || data[i + c] >= 252) clipped[c]++;
      }
      n++;
    }
  }
  const rgb = sum.map(v => n ? v / n : 0);
  const usable = rgb.map((v, c) => v >= 12 && v <= 245 && clipped[c] / Math.max(1, n) < 0.2);
  const coverage = covered / Math.max(1, n);
  const smooth = texture / Math.max(1, n) < 0.12;
  const present = coverage >= 0.85 && smooth && rgb[0] >= 40;
  // Enter only on clear coverage; once placed, small texture/exposure changes
  // are not removal. Actual uncovered frames still close the sample gate.
  const contact = coverage >= 0.7 && rgb[0] >= 35;
  const confidence = Math.round(100 * coverage * (smooth ? 1 : 0.4));
  const spatial = rgb.map((mean, c) => tiles.map((tile, i) =>
    tile[c] / Math.max(1, tileCounts[i]) / Math.max(12, mean) - 1));
  const issue = !contact ? 'contact' : usable.some(Boolean) ? null
    : rgb.some(v => v >= 245) ? 'clipped' : 'dark';
  return { rgb, usable, present, contact, confidence, spatial, issue };
}