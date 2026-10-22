import { ListOrdered, Square } from 'lucide-react';

const pad = (n) => String(n).padStart(2, '0');

export default function BottomBar({ elapsed, target, extended, onStop, onOpenRecord }) {
  const pct = Math.min(100, (elapsed / target) * 100);
  return (
    <footer className="relative z-40 flex shrink-0 items-center gap-2 pb-[max(env(safe-area-inset-bottom),8px)] pl-[max(env(safe-area-inset-left),10px)] pr-[max(env(safe-area-inset-right),10px)] pt-2">
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-1.5">
          <span className="tabular font-mono text-lg font-light leading-none text-white">
            {pad(Math.floor(elapsed / 60))}:{pad(elapsed % 60)}
          </span>
          <span className="font-mono text-[9px] tracking-[0.2em] text-white/35">/ {target}s</span>
        </div>
        <div className="mt-1.5 h-1 w-full overflow-hidden rounded-full bg-white/10">
          <div
            className="h-full rounded-full transition-[width] duration-500 ease-linear"
            style={{
              width: `${pct}%`,
              background: extended
                ? 'linear-gradient(90deg,#7c5cff,#a78bfa)'
                : 'linear-gradient(90deg,#00cc6a,#00ff88)',
            }}
          />
        </div>
      </div>

      <button
        onClick={onOpenRecord}
        className="flex h-10 items-center gap-1.5 rounded-xl border border-white/10 bg-white/[0.04] px-3 text-[12px] font-medium text-white/80 transition-colors hover:bg-white/10"
      >
        <ListOrdered className="h-3.5 w-3.5" />
        Registro
      </button>
      <button
        onClick={onStop}
        className="flex h-10 items-center gap-1.5 rounded-xl border px-3 text-[12px] font-medium transition-colors"
        style={{ borderColor: 'rgba(239,68,68,0.35)', background: 'rgba(239,68,68,0.1)', color: '#ef4444' }}
      >
        <Square className="h-3.5 w-3.5" fill="currentColor" />
        Detener
      </button>
    </footer>
  );
}