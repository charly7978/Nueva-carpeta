import { motion } from 'framer-motion';
import { Dna, ShieldAlert, HeartPulse } from 'lucide-react';

export default function HRVPanel({ hrv }) {
  if (!hrv) return null;

  const metrics = [
    { label: 'SDNN', value: hrv.sdnn ? `${hrv.sdnn} ms` : '--', desc: 'Variabilidad global total' },
    { label: 'RMSSD', value: hrv.rmssd ? `${hrv.rmssd} ms` : '--', desc: 'Tono vagal parasimpático' },
    { label: 'pNN50', value: hrv.pnn50 !== undefined ? `${hrv.pnn50}%` : '--', desc: 'Pares RR > 50 ms' },
    { label: 'LF/HF', value: hrv.lf_hf !== undefined ? hrv.lf_hf.toFixed(2) : '--', desc: 'Balance autonómico ANS' },
    { label: 'SD1', value: hrv.sd1 ? `${hrv.sd1} ms` : '--', desc: 'Poincaré transversal (rápido)' },
    { label: 'SD2', value: hrv.sd2 ? `${hrv.sd2} ms` : '--', desc: 'Poincaré longitudinal (lento)' },
    { label: 'SD1/SD2', value: hrv.sd1_sd2 !== undefined ? hrv.sd1_sd2.toFixed(2) : '--', desc: 'Ratio autonómico' },
    { label: 'SampEn', value: hrv.sampen != null ? hrv.sampen.toFixed(2) : (hrv.cv ? `${hrv.cv}%` : '--'), desc: hrv.sampen != null ? 'Entropía de muestra' : 'Coeficiente Variación' },
  ];

  let stress = { label: 'Balance Normal', color: '#00ff88', pct: 50 };
  if (hrv.lf_hf) {
    if (hrv.lf_hf < 1.5) {
      stress = { label: 'Tono Parasimpático (Relajado)', color: '#00ff88', pct: 30 };
    } else if (hrv.lf_hf < 2.8) {
      stress = { label: 'Balance Autonómico Estable', color: '#fbbf24', pct: 55 };
    } else {
      stress = { label: 'Predominio Simpático (Estrés/Fatiga)', color: '#ff3366', pct: 85 };
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
      className="rounded-3xl border border-purple-500/25 bg-gradient-to-br from-purple-950/20 via-card/90 to-background p-4 sm:p-5 shadow-2xl backdrop-blur-2xl"
    >
      {/* Header con título y badge de estrés */}
      <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
        <div className="flex items-center gap-2.5">
          <div className="grid h-9 w-9 place-items-center rounded-xl border border-purple-400/30 bg-purple-400/10 text-purple-300 shadow-[0_0_15px_rgba(167,139,250,0.2)]">
            <Dna className="h-5 w-5" />
          </div>
          <div>
            <h4 className="font-display text-[15px] font-bold text-white leading-none">
              Variabilidad de Frecuencia Cardíaca
            </h4>
            <span className="font-mono text-[9px] uppercase tracking-[0.2em] text-purple-300/70 block mt-1">
              Espectro HRV · Dominio del tiempo y Poincaré
            </span>
          </div>
        </div>

        <span
          className="rounded-full border px-3 py-1 font-mono text-[10px] font-semibold tracking-wider"
          style={{
            borderColor: `${stress.color}45`,
            background: `${stress.color}15`,
            color: stress.color,
            boxShadow: `0 0 14px ${stress.color}20`,
          }}
        >
          {stress.label}
        </span>
      </div>

      {/* Calibrador de Balance Autonómico (ANS) */}
      <div className="mb-4 rounded-2xl border border-white/[0.08] bg-white/[0.03] p-3">
        <div className="flex items-center justify-between text-[11px] mb-1.5 font-mono">
          <span className="text-emerald-400 flex items-center gap-1">
            <HeartPulse className="h-3 w-3" /> Parasimpático (Vagal)
          </span>
          <span className="text-white/40">LF/HF: {hrv.lf_hf ? hrv.lf_hf.toFixed(2) : '--'}</span>
          <span className="text-rose-400 flex items-center gap-1">
            <ShieldAlert className="h-3 w-3" /> Simpático (Estrés)
          </span>
        </div>
        <div className="relative h-2 w-full overflow-hidden rounded-full bg-white/10">
          <div
            className="absolute inset-y-0 left-0 rounded-full transition-all duration-700 ease-out"
            style={{
              width: `${stress.pct}%`,
              background: 'linear-gradient(90deg, #00ff88 0%, #fbbf24 50%, #ff3366 100%)',
              boxShadow: `0 0 10px ${stress.color}`,
            }}
          />
        </div>
      </div>

      {/* Grid de Métricas Bento */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {metrics.map((m) => (
          <div
            key={m.label}
            className="group relative flex flex-col items-center justify-between overflow-hidden rounded-2xl border border-white/[0.07] bg-white/[0.025] p-3 text-center transition-all hover:bg-white/[0.06] hover:border-purple-400/30"
          >
            <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-white/45">
              {m.label}
            </span>
            <span
              className="tabular my-1.5 font-mono text-[16px] sm:text-[18px] font-bold"
              style={{ color: '#c4b5fd', textShadow: '0 0 12px rgba(196,181,253,0.3)' }}
            >
              {m.value}
            </span>
            <span className="text-[10px] leading-tight text-white/40 line-clamp-1">
              {m.desc}
            </span>
          </div>
        ))}
      </div>
    </motion.div>
  );
}