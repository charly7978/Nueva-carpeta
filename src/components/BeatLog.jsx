import { motion } from 'framer-motion';
import { Activity } from 'lucide-react';

const EASE = [0.22, 1, 0.36, 1];
const MAX_ROWS = 40;

const latencyColor = (ms) =>
  ms == null ? 'rgba(255,255,255,0.25)' : ms < 60 ? '#00ff88' : ms < 150 ? '#22d3ee' : '#fbbf24';

const clock = (s) =>
  `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;

const ROW = 'grid grid-cols-[36px_44px_1fr_58px_62px] items-center gap-1';

/** Registro de cada latido: intervalo, pulso y latencia real de detección */
export default function BeatLog({ beats = [] }) {
  const rows = beats.slice(0, MAX_ROWS);
  const lats = beats.map((b) => b.latency).filter((v) => v != null);
  const avg = lats.length ? Math.round(lats.reduce((a, b) => a + b, 0) / lats.length) : null;
  const max = lats.length ? Math.max(...lats) : null;

  return (
    <section
      className="overflow-hidden rounded-2xl border border-white/[0.07]"
      style={{ background: 'linear-gradient(180deg, rgba(255,255,255,0.04), rgba(255,255,255,0.01))' }}
    >
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-white/[0.05] px-3.5 py-2.5">
        <div className="flex items-center gap-2">
          <Activity className="h-3.5 w-3.5 text-primary" />
          <span className="font-mono text-[10px] uppercase tracking-[0.24em] text-white/45">
            Registro de latidos
          </span>
        </div>
        <div className="flex items-center gap-3 font-mono text-[9px] uppercase tracking-[0.14em] text-white/35">
          <span>{beats.length} latidos</span>
          <span>
            Lat. media{' '}
            <span className="tabular" style={{ color: latencyColor(avg) }}>
              {avg ?? '--'} ms
            </span>
          </span>
          <span>
            Máx <span className="tabular text-white/55">{max ?? '--'} ms</span>
          </span>
        </div>
      </header>

      <div className={`${ROW} border-b border-white/[0.04] px-3.5 py-1.5 font-mono text-[8px] uppercase tracking-[0.16em] text-white/25`}>
        <span>#</span>
        <span>Tiempo</span>
        <span className="text-right">IBI</span>
        <span className="text-right">Pulso</span>
        <span className="text-right">Latencia</span>
      </div>

      {rows.length === 0 ? (
        <p className="px-3.5 py-6 text-center font-mono text-[10px] uppercase tracking-[0.2em] text-white/25">
          Esperando latidos…
        </p>
      ) : (
        <div className="max-h-[188px] overflow-y-auto">
          {rows.map((b) => (
            <motion.div
              key={b.id}
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.3, ease: EASE }}
              className={`${ROW} border-b border-white/[0.03] px-3.5 py-1.5 font-mono text-[10px] last:border-b-0`}
            >
              <span className="text-white/30">#{b.id}</span>
              <span className="text-white/45">{clock(b.elapsed)}</span>
              <span
                className="tabular text-right"
                style={{ color: b.ibi != null ? '#00ff88' : 'rgba(255,255,255,0.25)' }}
              >
                {b.ibi ?? '--'}
                <span className="ml-0.5 text-[8px] text-white/25">ms</span>
              </span>
              <span className="tabular text-right text-white/70">
                {b.hr ?? '--'}
                <span className="ml-0.5 text-[8px] text-white/25">bpm</span>
              </span>
              <span className="tabular text-right" style={{ color: latencyColor(b.latency) }}>
                {b.latency ?? '--'}
                <span className="ml-0.5 text-[8px] text-white/25">ms</span>
              </span>
            </motion.div>
          ))}
        </div>
      )}
    </section>
  );
}