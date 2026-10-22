import { motion } from 'framer-motion';
import { AlertTriangle } from 'lucide-react';

const ALERT = '#ff4d5e';
const signed = (v) => (v == null ? '--' : `${v >= 0 ? '+' : '−'}${Math.abs(v).toFixed(2)}`);

/** Ritmo: verde si es regular, rojo parpadeante ante cualquier arritmia */
export function RhythmBadge({ rhythm }) {
  const sev = rhythm?.severity;
  const arr = sev === 'warn' || sev === 'alert';
  const color = arr ? ALERT : sev === 'ok' ? '#00ff88' : '#94a3b8';
  return (
    <div className="min-w-0">
      <motion.span
        animate={arr ? { opacity: [1, 0.5, 1] } : { opacity: 1 }}
        transition={arr ? { repeat: Infinity, duration: 1.1, ease: 'easeInOut' } : { duration: 0.2 }}
        className="inline-flex max-w-full items-center gap-1.5 rounded-full border px-2.5 py-1 font-mono text-[9px] tracking-[0.14em] sm:text-[10px]"
        style={{ borderColor: `${color}66`, color, background: `${color}1a` }}
      >
        {arr && <AlertTriangle className="h-3 w-3 shrink-0" />}
        <span className="truncate">{arr ? `ARRITMIA · ${rhythm.short}` : rhythm?.short || 'ANALIZANDO'}</span>
      </motion.span>
      <p className="mt-1 line-clamp-2 max-w-[220px] text-[10px] leading-snug text-white/45 sm:max-w-sm">
        {rhythm?.detail || rhythm?.label || 'Analizando ritmo'}
      </p>
    </div>
  );
}

/** Pico y valle del último latido + calidad de la señal */
export function LastBeatReadout({ last, sqi }) {
  const lit = Math.ceil((sqi / 100) * 5);
  const qColor = sqi >= 70 ? '#00ff88' : sqi >= 45 ? '#fbbf24' : sqi >= 20 ? '#fb923c' : '#ef4444';
  return (
    <div className="shrink-0 text-right">
      <p className="font-mono text-[8px] uppercase tracking-[0.2em] text-white/35">Último latido</p>
      <p className="tabular font-mono text-[12px] leading-tight sm:text-sm">
        <span style={{ color: '#a7f3d0' }}>▲ {signed(last?.peak)}</span>
        <span className="ml-2" style={{ color: '#38bdf8' }}>▼ {signed(last?.valley)}</span>
      </p>
      <div className="mt-1 flex items-center justify-end gap-1.5">
        <div className="flex items-end gap-[2px]">
          {Array.from({ length: 5 }, (_, i) => (
            <span
              key={i}
              className="w-[3px] rounded-full"
              style={{ height: `${5 + i * 2}px`, background: i < lit ? qColor : 'rgba(255,255,255,0.12)' }}
            />
          ))}
        </div>
        <span className="font-mono text-[9px] text-white/40">SQI {sqi}%</span>
      </div>
    </div>
  );
}

/** Resplandor rojo en los bordes mientras haya una arritmia */
export function AlertGlow({ level }) {
  if (level !== 'warn' && level !== 'alert') return null;
  const strong = level === 'alert';
  return (
    <motion.div
      className="pointer-events-none absolute inset-0"
      style={{ boxShadow: `inset 0 0 ${strong ? 90 : 60}px rgba(255,59,78,${strong ? 0.4 : 0.24})` }}
      animate={{ opacity: [0.5, 1, 0.5] }}
      transition={{ repeat: Infinity, duration: 1.2, ease: 'easeInOut' }}
    />
  );
}