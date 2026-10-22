/** Recursos de dibujo que se crean una vez por tamaño (rejilla, brillos, degradados) */
export const GREEN = '0,255,136';
export const RED = '255,59,78';

/** Sprite de brillo pre-renderizado: dibujarlo es mucho más barato que shadowBlur */
export function glowSprite(rgb, size = 64) {
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  grd.addColorStop(0, `rgba(${rgb},1)`);
  grd.addColorStop(0.25, `rgba(${rgb},0.55)`);
  grd.addColorStop(1, `rgba(${rgb},0)`);
  g.fillStyle = grd;
  g.fillRect(0, 0, size, size);
  return c;
}

/** Fondo clínico: degradado, rejilla milimetrada, línea de base y viñeta */
export function buildGridLayer(W, H, dpr, rgb, zeroY) {
  const c = document.createElement('canvas');
  c.width = Math.round(W * dpr);
  c.height = Math.round(H * dpr);
  const o = c.getContext('2d');
  o.setTransform(dpr, 0, 0, dpr, 0, 0);

  const red = rgb === RED;
  const bg = o.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, red ? '#16060a' : '#050c15');
  bg.addColorStop(1, red ? '#080205' : '#02050a');
  o.fillStyle = bg;
  o.fillRect(0, 0, W, H);

  const cell = W > 900 ? 16 : 12;
  const grid = (step, alpha, width) => {
    o.strokeStyle = `rgba(${rgb},${alpha})`;
    o.lineWidth = width;
    o.beginPath();
    for (let x = step; x < W; x += step) {
      const p = Math.round(x) + 0.25;
      o.moveTo(p, 0); o.lineTo(p, H);
    }
    for (let y = step; y < H; y += step) {
      const p = Math.round(y) + 0.25;
      o.moveTo(0, p); o.lineTo(W, p);
    }
    o.stroke();
  };
  grid(cell, 0.07, 0.5);
  grid(cell * 5, 0.17, 0.9);

  o.strokeStyle = 'rgba(255,255,255,0.11)';
  o.lineWidth = 1;
  o.setLineDash([3, 6]);
  o.beginPath();
  o.moveTo(0, Math.round(zeroY) + 0.5);
  o.lineTo(W, Math.round(zeroY) + 0.5);
  o.stroke();
  o.setLineDash([]);

  const v = o.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.3, W / 2, H / 2, Math.max(W, H) * 0.78);
  v.addColorStop(0, 'rgba(0,0,0,0)');
  v.addColorStop(1, 'rgba(0,0,0,0.5)');
  o.fillStyle = v;
  o.fillRect(0, 0, W, H);
  return c;
}

/** Trazo con estela: tenue a la izquierda, brillante en el lápiz */
export function traceGradient(ctx, W, rgb) {
  const g = ctx.createLinearGradient(0, 0, W, 0);
  g.addColorStop(0, `rgba(${rgb},0.45)`);
  g.addColorStop(0.5, `rgba(${rgb},0.85)`);
  g.addColorStop(0.9, `rgba(${rgb},1)`);
  g.addColorStop(1, 'rgba(255,255,255,1)');
  return g;
}

export function fillGradient(ctx, lay, rgb) {
  const g = ctx.createLinearGradient(0, lay.padTop, 0, lay.zeroY);
  g.addColorStop(0, `rgba(${rgb},0.34)`);
  g.addColorStop(1, `rgba(${rgb},0)`);
  return g;
}

/** Halo que precede al lápiz: da profundidad al borde por el que entra la señal */
export function penColumn(ctx, W, rgb) {
  const penX = W - 14;
  const g = ctx.createLinearGradient(Math.max(0, penX - W * 0.24), 0, penX, 0);
  g.addColorStop(0, `rgba(${rgb},0)`);
  g.addColorStop(1, `rgba(${rgb},0.12)`);
  return g;
}