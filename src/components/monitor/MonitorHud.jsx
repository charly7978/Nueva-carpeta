import TopBar from './TopBar';
import MetricsGrid from './MetricsGrid';
import BottomBar from './BottomBar';
import CameraPreview from '../CameraPreview';
import FeedbackOverlay from '../FeedbackOverlay';
import { RhythmBadge, LastBeatReadout } from './StageReadouts';
import HeartRateReadout from '@/components/monitor/HeartRateReadout';

/**
 * Displays del monitor sumergidos en la onda: todo flota con transparencias
 * sobre el trazado, que sigue ocupando la pantalla completa por detrás.
 */
export default function MonitorHud({
  mode, vitals, video, simulated, feedback, fullscreen, cue,
  running, elapsed, target, extended, onStop, onOpenRecord, onCalibrate,
}) {
  const rhythm = vitals?.rhythm;
  const sev = rhythm?.severity;
  const arrhythmia = sev === 'warn' || sev === 'alert';
  const bpm = vitals?.displayHr ?? vitals?.hr;
  const live = running;

  return (
    <div className="absolute inset-0 z-10 flex flex-col">
      {/* Veladuras: dan contraste al texto sin tapar la onda */}
      <div className="pointer-events-none absolute inset-x-0 top-0 h-28 bg-gradient-to-b from-background/85 via-background/35 to-transparent" />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-80 bg-gradient-to-t from-background/92 via-background/45 to-transparent" />

      <TopBar mode={mode} simulated={simulated} fullscreen={fullscreen} cue={cue} sqi={vitals?.sqi} />

      <div className="flex min-h-0 flex-1 flex-col landscape:flex-row landscape:gap-2">
        <div className="relative min-h-0 flex-1">
          <div className="pointer-events-none absolute left-3 top-1">
            <HeartRateReadout
              bpm={bpm}
              held={!!vitals?.hrHeld}
              irregular={!!vitals?.hrIrregular}
              beatId={vitals?.beatCount}
              arrhythmia={arrhythmia}
              tacho={vitals?.tacho}
            />
          </div>

          <div className="absolute right-3 top-1 h-16 w-16 overflow-hidden rounded-2xl border border-white/12 bg-white/[0.05] shadow-[0_12px_34px_-14px_rgba(0,0,0,0.95)] backdrop-blur-md landscape:h-20 landscape:w-28">
            <CameraPreview video={video} simulated={simulated} active={live} compact />
          </div>

          <div className="pointer-events-none absolute inset-x-3 bottom-2 flex items-end justify-between gap-2 max-[360px]:flex-wrap">
            <RhythmBadge rhythm={rhythm} />
            <LastBeatReadout last={vitals?.peaks?.last} sqi={vitals?.sqi || 0} />
          </div>

          <FeedbackOverlay {...feedback} />
        </div>

        <MetricsGrid vitals={vitals} onCalibrate={onCalibrate} />
      </div>

      {running ? (
        <BottomBar
          elapsed={elapsed}
          target={target}
          extended={extended}
          onStop={onStop}
          onOpenRecord={onOpenRecord}
        />
      ) : (
        <div className="h-[max(env(safe-area-inset-bottom),8px)]" />
      )}
    </div>
  );
}