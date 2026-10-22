import WaveformCanvas from '../WaveformCanvas';
import { AlertGlow } from './StageReadouts';

/** El monitor ocupa toda la pantalla: el trazado se dibuja de borde a borde. */
export default function WaveStage({ mode, storeRef, rhythmRef, level }) {
  const live = mode !== 'standby';
  return (
    <div className="absolute inset-0">
      <WaveformCanvas storeRef={storeRef} rhythmRef={rhythmRef} mode={live ? 'live' : 'standby'} />
      <AlertGlow level={level} />
    </div>
  );
}