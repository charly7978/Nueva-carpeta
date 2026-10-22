import { Heart } from 'lucide-react';
import HrTrend from '@/components/monitor/HrTrend';

export default function HeartRateReadout({ bpm, irregular, beatId, arrhythmia, tacho, held }) {
  const tone = held ? 'text-muted-foreground' : arrhythmia ? 'text-destructive' : 'text-primary';
  return (
    <div className="flex max-w-full items-start gap-2">
      <div className={`mt-3 grid h-8 w-8 shrink-0 place-items-center rounded-full bg-card/80 ${tone}`}>
        <Heart key={beatId ?? 0} className="h-4 w-4" fill={bpm != null && !held ? 'currentColor' : 'none'} />
      </div>
      <div className="min-w-0">
        <p className="font-mono text-[10px] text-muted-foreground">{held ? 'Última lectura válida' : irregular ? 'FC media' : 'Frecuencia cardíaca'}</p>
        <div className="flex items-baseline gap-1.5">
          <span className={`tabular font-mono text-[clamp(46px,11.5vmin,118px)] font-light leading-none ${held || bpm == null ? 'text-muted-foreground' : arrhythmia ? 'text-destructive' : 'text-foreground'}`}>
            {bpm ?? '--'}
          </span>
          <span className="font-mono text-[10px] text-muted-foreground">BPM</span>
        </div>
        {held ? <p className="mt-1 text-[10px] text-muted-foreground">Recuperando señal…</p> : <HrTrend tacho={tacho} />}
      </div>
    </div>
  );
}