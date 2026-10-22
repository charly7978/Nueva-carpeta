import { useId } from 'react';

export default function HrTrend({ tacho }) {
  const gradientId = useId();
  const rates = (tacho || [])
    .filter((p) => p.ok && p.ms > 250)
    .map((p) => 60000 / p.ms)
    .slice(-24);

  if (rates.length < 5) return null;

  const lo = Math.min(...rates);
  const hi = Math.max(...rates);
  const span = Math.max(8, hi - lo);

  const points = rates.map((v, i) => {
    const x = (i * 84) / (rates.length - 1);
    const y = 22 - ((v - lo) * 18) / span;
    return { x, y };
  });

  const lineD = points.map((p, i) => `${i ? 'L' : 'M'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
  const areaD = `${lineD} L${points[points.length - 1].x.toFixed(1)},24 L${points[0].x.toFixed(1)},24 Z`;
  const lastPoint = points[points.length - 1];

  return (
    <div className="mt-1 flex items-center gap-2">
      <div className="relative">
        <svg width="86" height="26" viewBox="0 0 86 26" aria-hidden="true" className="overflow-visible">
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#00ff88" stopOpacity="0.35" />
              <stop offset="100%" stopColor="#00ff88" stopOpacity="0.0" />
            </linearGradient>
          </defs>

          {/* Área sombreada con degradado */}
          <path d={areaD} fill={`url(#${gradientId})`} />

          {/* Línea de tendencia clínica */}
          <path
            d={lineD}
            fill="none"
            stroke="#00ff88"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          />

          {/* Punto guía brillante en el extremo actual */}
          {lastPoint && (
            <>
              <circle cx={lastPoint.x} cy={lastPoint.y} r="3" fill="#00ff88" />
              <circle cx={lastPoint.x} cy={lastPoint.y} r="6" fill="#00ff88" opacity="0.3" className="animate-ping" />
            </>
          )}
        </svg>
      </div>
      <span className="font-mono text-[9px] uppercase tracking-[0.14em] text-white/45">
        Tendencia
      </span>
    </div>
  );
}