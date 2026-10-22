import { motion } from 'framer-motion';

export default function HRVPanel({ hrv }) {
  if (!hrv) return null;

  const metrics = [
    { label: 'SDNN', value: hrv.sdnn ? `${hrv.sdnn}ms` : '--', desc: 'Variabilidad global' },
    { label: 'RMSSD', value: hrv.rmssd ? `${hrv.rmssd}ms` : '--', desc: 'Corto plazo' },
    { label: 'pNN50', value: hrv.pnn50 !== undefined ? `${hrv.pnn50}%` : '--', desc: 'Tono parasimpático' },
    { label: 'LF/HF', value: hrv.lf_hf !== undefined ? hrv.lf_hf.toFixed(2) : '--', desc: 'Balance ANS' },
  ];

  let stress = null;
  if (hrv.lf_hf) {
    if (hrv.lf_hf < 1.5) stress = { label: 'Relajado', color: '#00ff88' };
    else if (hrv.lf_hf < 3) stress = { label: 'Normal', color: '#fbbf24' };
    else stress = { label: 'Estresado', color: '#ef4444' };
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
      className="rounded-2xl border p-4"
      style={{
        borderColor: 'rgba(139,124,255,0.28)',
        background: 'linear-gradient(160deg, rgba(139,124,255,0.10), rgba(255,255,255,0.015))',
      }}
    >
      <div className="mb-3 flex items-center justify-between">
        <span className="font-mono text-[10px] uppercase tracking-[0.26em]" style={{ color: '#a78bfa' }}>
          Análisis HRV
        </span>
        {stress && (
          <span
            className="rounded-full px-2.5 py-0.5 font-mono text-[10px] tracking-[0.12em]"
            style={{ background: `${stress.color}1f`, color: stress.color }}
          >
            {stress.label}
          </span>
        )}
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {metrics.map((m) => (
          <div
            key={m.label}
            className="flex flex-col items-center rounded-xl border border-white/[0.05] p-2.5 text-center"
            style={{ background: 'rgba(255,255,255,0.025)' }}
          >
            <span className="font-mono text-[10px] tracking-[0.16em]" style={{ color: 'rgba(255,255,255,0.35)' }}>
              {m.label}
            </span>
            <span className="tabular mt-1 font-mono text-sm font-medium" style={{ color: '#a78bfa' }}>{m.value}</span>
            <span className="mt-0.5 text-[9px] leading-tight" style={{ color: 'rgba(255,255,255,0.22)' }}>{m.desc}</span>
          </div>
        ))}
      </div>
    </motion.div>
  );
}