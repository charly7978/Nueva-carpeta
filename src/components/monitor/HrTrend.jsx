export default function HrTrend({ tacho }) {
  const rates = (tacho || []).filter(p => p.ok && p.ms > 250).map(p => 60000 / p.ms).slice(-24);
  if (rates.length < 6) return null;
  const lo = Math.min(...rates), span = Math.max(8, Math.max(...rates) - lo);
  const d = rates.map((v, i) => `${i ? 'L' : 'M'}${(i * 74 / (rates.length - 1)).toFixed(1)},${(20 - (v - lo) * 20 / span).toFixed(1)}`).join(' ');
  return (
    <div className="mt-1 flex items-center gap-1.5 text-primary">
      <svg width="74" height="22" viewBox="0 -1 74 22" aria-hidden="true">
        <path d={d} fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <span className="font-mono text-[9px] text-muted-foreground">tendencia</span>
    </div>
  );
}