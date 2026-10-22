import { Camera, Hand, Lock, Play, Dna, Waves, Activity } from 'lucide-react';

const STEPS = [
  { icon: Camera, text: 'Cámara trasera: el flash se enciende solo' },
  { icon: Hand, text: 'Cubre lente y flash con la yema del dedo' },
  { icon: Lock, text: 'Mantén firme y quieto unos 30 segundos' },
];

const RHYTHMS = [
  ['normal', 'Normal'],
  ['pvc', 'Extrasístoles'],
  ['bigeminy', 'Bigeminismo'],
  ['trigeminy', 'Trigeminismo'],
  ['af', 'Fibrilación'],
];

export default function IdlePanel({
  onStart, onStartDemo, extendedMode, onToggleExtended, demoRhythm, onDemoRhythm,
}) {
  return (
    <div className="w-[min(92vw,420px)] space-y-3 rounded-3xl border border-white/10 bg-card/80 p-4 shadow-2xl">
      <div className="flex items-center gap-3">
        <span className="grid h-10 w-10 place-items-center rounded-xl border border-primary/25 bg-primary/10">
          <Activity className="h-5 w-5 text-primary" />
        </span>
        <div>
          <h2 className="font-display text-lg font-semibold leading-none">
            Vital<span className="text-primary">Scan</span>
          </h2>
          <p className="mt-1 font-mono text-[9px] uppercase tracking-[0.24em] text-white/40">Monitor cardíaco · PPG</p>
        </div>
      </div>

      <div className="space-y-2">
        {STEPS.map((s) => (
          <div key={s.text} className="flex items-center gap-3">
            <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg border border-white/[0.07] bg-white/[0.03] text-primary">
              <s.icon className="h-3.5 w-3.5" />
            </span>
            <p className="text-[12px] text-white/70">{s.text}</p>
          </div>
        ))}
      </div>

      <button
        onClick={onToggleExtended}
        className="flex w-full items-center justify-between rounded-xl border px-3 py-2.5 text-left transition-colors"
        style={{
          borderColor: extendedMode ? 'rgba(139,124,255,0.45)' : 'rgba(255,255,255,0.08)',
          background: extendedMode ? 'rgba(139,124,255,0.12)' : 'rgba(255,255,255,0.025)',
        }}
      >
        <span className="flex items-center gap-2.5">
          <Dna className="h-4 w-4" style={{ color: extendedMode ? '#a78bfa' : 'rgba(255,255,255,0.4)' }} />
          <span className="text-[12px] font-medium text-white/85">Modo extendido · 60 s (HRV preciso)</span>
        </span>
        <span
          className="flex h-5 w-9 shrink-0 items-center rounded-full px-0.5 transition-colors"
          style={{ background: extendedMode ? '#8b7cff' : 'rgba(255,255,255,0.12)' }}
        >
          <span
            className="h-4 w-4 rounded-full bg-white shadow transition-transform"
            style={{ transform: extendedMode ? 'translateX(16px)' : 'translateX(0)' }}
          />
        </span>
      </button>

      <button
        onClick={onStart}
        className="flex w-full items-center justify-center gap-2 rounded-2xl py-3.5 text-sm font-semibold text-[#04120b] transition-transform active:scale-[0.97]"
        style={{
          background: extendedMode ? 'linear-gradient(135deg,#a78bfa,#7c5cff)' : 'linear-gradient(135deg,#00ff88,#00cc6a)',
          boxShadow: '0 16px 40px -18px rgba(0,255,136,0.8)',
        }}
      >
        <Play className="h-4 w-4" fill="currentColor" />
        Iniciar medición
      </button>

      <div className="space-y-2 rounded-xl border border-[rgba(139,124,255,0.25)] bg-[rgba(139,124,255,0.06)] p-2.5">
        <p className="font-mono text-[9px] uppercase tracking-[0.2em] text-[#a78bfa]">Demo sin cámara · ritmo simulado</p>
        <div className="flex flex-wrap gap-1.5">
          {RHYTHMS.map(([id, name]) => (
            <button
              key={id}
              onClick={() => onDemoRhythm(id)}
              className="rounded-full border px-2.5 py-1 text-[10px] transition-colors"
              style={{
                borderColor: demoRhythm === id ? '#a78bfa' : 'rgba(255,255,255,0.1)',
                background: demoRhythm === id ? 'rgba(139,124,255,0.25)' : 'transparent',
                color: demoRhythm === id ? '#e9e3ff' : 'rgba(255,255,255,0.5)',
              }}
            >
              {name}
            </button>
          ))}
        </div>
        <button
          onClick={onStartDemo}
          className="flex w-full items-center justify-center gap-2 rounded-lg border border-[rgba(139,124,255,0.35)] py-2 text-[12px] font-medium text-[#a78bfa]"
        >
          <Waves className="h-3.5 w-3.5" />
          Probar el monitor (no mide tu pulso)
        </button>
      </div>
    </div>
  );
}