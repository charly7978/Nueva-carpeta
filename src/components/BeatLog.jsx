import { motion } from 'framer-motion';
import { Activity, Clock, Zap } from 'lucide-react';

const EASE = [0.16, 1, 0.3, 1];
const MAX_ROWS = 50;

const latencyColor = (ms) =>
  ms == null ? 'rgba(255,255,255,0.25)' : ms < 60 ? '#00ff88' : ms < 150 ? '#22d3ee' : '#fbbf24';

const clock = (s) =>
  `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;

const ROW = 'grid grid-cols-[42px_54px_1fr_68px_72px] items-center gap-2';

/** Registro de latidos latido a latido con latencia real de detección */
export default function BeatLog({ beats = [] }) {
  const rows = beats.slice(0, MAX_ROWS);
  const lats = beats.map((b) => b.latency).filter((v) => v != null);
  const avg = lats.length ? Math.round(lats.reduce((a, b) => a + b, 0) / lats.length) : null;
  const max = lats.length ? Math.max(...lats) : null;

  return (
    <section className="overflow-hidden rounded-3xl border border-white/10 bg-card/75 shadow-2xl backdrop-blur-2xl">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-white/[0.08] px-4 py-3">
        <div className="flex items-center gap-2.5">
          <div className="grid h-8 w-8 place-items-center rounded-xl border border-primary/30 bg-primary/10 text-primary">
            <Activity className="h-4 w-4" />
          </div>
          <div>
            <h4 className="font-display text-[14px] font-bold text-white leading-none">
              Serie Temporal de Latidos
            </h4>
            <span className="font-mono text-[9px] uppercase tracking-[0.2em] text-white/40 block mt-1">
              Registro continuo R-R / IBI
            </span>
          </div>
        </div>

        <div className="flex items-center gap-3 font-mono text-[10px] tracking-wider text-white/45">
          <span className="rounded-md border border-white/10 bg-white/[0.04] px-2 py-0.5 text-white/80">
            {beats.length} latidos
          </span>
          <span className="flex items-center gap-1">
            <Zap className="h-3 w-3 text-cyan-400" />
            Media:{' '}
            <span className="tabular font-bold" style={{ color: latencyColor(avg) }}>
              {avg ?? '--'} ms
            </span>
          </span>
          <span>
            Máx: <span className="tabular text-white/70">{max ?? '--'} ms</span>
          </span>
        </div>
      </header>

      {/* Cabecera de columnas */}
      <div className={`${ROW} border-b border-white/[0.05] px-4 py-2 font-mono text-[9px] uppercase tracking-[0.18em] text-white/35 bg-white/[0.02]`}>
        <span># ID</span>
        <span className="flex items-center gap-1">
          <Clock className="h-3 w-3" /> Tiempo
        </span>
        <span className="text-right">Intervalo IBI</span>
        <span className="text-right">Pulso</span>
        <span className="text-right">Latencia</span>
      </div>

      {rows.length === 0 ? (
        <div className="px-4 py-12 text-center font-mono text-[11px] uppercase tracking-[0.2em] text-white/35">
          <Activity className="mx-auto h-7 w-7 text-white/20 mb-2 animate-pulse" />
          Esperando primeros latidos confirmados…
        </div>
      ) : (
        <div className="max-h-[220px] overflow-y-auto divide-y divide-white/[0.03]">
          {rows.map((b) => (
            <motion.div
              key={b.id}
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.25, ease: EASE }}
              className={`${ROW} px-4 py-2 font-mono text-[11px] hover:bg-white/[0.04] transition-colors`}
            >
              <span className="text-white/30 font-semibold">#{b.id}</span>
              <span className="text-white/55 tabular">{clock(b.elapsed)}</span>
              <span
                className="tabular text-right font-medium"
                style={{ color: b.ibi != null ? '#00ff88' : 'rgba(255,255,255,0.25)' }}
              >
                {b.ibi ?? '--'}
                <span className="ml-1 text-[8px] text-white/30">ms</span>
              </span>
              <span className="tabular text-right font-semibold text-white/90">
                {b.hr ?? '--'}
                <span className="ml-1 text-[8px] text-white/30">bpm</span>
              </span>
              <span className="tabular text-right font-medium" style={{ color: latencyColor(b.latency) }}>
                {b.latency ?? '--'}
                <span className="ml-1 text-[8px] text-white/30">ms</span>
              </span>
            </motion.div>
          ))}
        </div>
      )}
    </section>
  );
}