import { Activity, Maximize2, Minimize2, Volume2, VolumeX } from 'lucide-react';

const MODE_META = {
  standby: { label: 'EN ESPERA', color: '#94a3b8' },
  nofinger: { label: 'COLOCA EL DEDO', color: '#fbbf24' },
  acquiring: { label: 'ADQUIRIENDO', color: '#fbbf24' },
  artifact: { label: 'AJUSTANDO SEÑAL', color: '#f59e0b' },
  recovering: { label: 'RECUPERANDO', color: '#22d3ee' },
  live: { label: 'EN VIVO', color: '#00ff88' },
  error: { label: 'SIN SEÑAL', color: '#ef4444' },
};

function Chip({ color, children }) {
  return (
    <span
      className="rounded-full border px-2 py-[3px] font-mono text-[9px] tracking-[0.16em]"
      style={{ borderColor: `${color}55`, color, background: `${color}14` }}
    >
      {children}
    </span>
  );
}

export default function TopBar({ mode, simulated, fullscreen, cue, sqi }) {
  const meta = MODE_META[mode] || MODE_META.standby;
  return (
    <header className="flex shrink-0 flex-wrap items-center justify-between gap-2 pb-1.5 pl-[max(env(safe-area-inset-left),10px)] pr-[max(env(safe-area-inset-right),10px)] pt-[max(env(safe-area-inset-top),8px)]">
      <div className="flex min-w-0 items-center gap-2">
        <span className="grid h-7 w-7 place-items-center rounded-lg border border-primary/25 bg-primary/10">
          <Activity className="h-4 w-4 text-primary" />
        </span>
        <h1 className="font-display text-[15px] font-semibold leading-none tracking-tight">
          Vital<span className="text-primary">Scan</span>
        </h1>
      </div>

      <div className="flex items-center gap-1.5 max-[360px]:w-full max-[360px]:justify-end">
        {simulated && <Chip color="#a78bfa">DEMO</Chip>}
        {mode === 'live' && sqi > 0 && (
          <Chip color={sqi >= 75 ? '#00ff88' : sqi >= 45 ? '#fbbf24' : '#ef4444'}>SQI {sqi}%</Chip>
        )}
        <Chip color={meta.color}>{meta.label}</Chip>
        {cue && (
          <button
            onClick={cue.toggle}
            aria-label={cue.enabled ? 'Silenciar el aviso de latido' : 'Activar el aviso de latido'}
            className="grid h-7 w-7 place-items-center rounded-lg border border-white/10 bg-white/[0.04] transition-colors hover:bg-white/10"
            style={{ color: cue.enabled ? '#00ff88' : 'rgba(255,255,255,0.45)' }}
          >
            {cue.enabled ? <Volume2 className="h-3.5 w-3.5" /> : <VolumeX className="h-3.5 w-3.5" />}
          </button>
        )}
        {fullscreen.supported && (
          <button
            onClick={fullscreen.toggle}
            aria-label={fullscreen.isFullscreen ? 'Salir de pantalla completa' : 'Pantalla completa'}
            className="grid h-7 w-7 place-items-center rounded-lg border border-white/10 bg-white/[0.04] text-white/70 transition-colors hover:bg-white/10"
          >
            {fullscreen.isFullscreen ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
          </button>
        )}
      </div>
    </header>
  );
}