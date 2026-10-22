import MetricTile from './MetricTile';
import BpTile from './BpTile';

const signed = (v) => (v == null ? null : `${v >= 0 ? '+' : '−'}${Math.abs(v).toFixed(2)}`);

/**
 * Bento Grid de displays del monitor clínico.
 * En vertical: tira de 3 columnas optimizada en la parte inferior.
 * En horizontal (landscape): barra lateral derecha que aprovecha el ancho panorámico.
 */
export default function MetricsGrid({ vitals, onCalibrate }) {
  const v = vitals || {};
  const p = v.peaks || {};
  const amp = p.avgAmp != null ? p.avgAmp.toFixed(2) : null;
  const agi = v.bpFeatures?.agi != null ? signed(v.bpFeatures.agi) : null;

  return (
    <div className="grid shrink-0 grid-cols-3 auto-rows-[clamp(56px,8.6dvh,92px)] gap-2 px-2.5 pb-1 landscape:h-full landscape:w-[min(35vw,410px)] landscape:grid-cols-2 landscape:auto-rows-fr landscape:px-0 landscape:pr-2.5">
      <MetricTile label="SpO₂ est." value={v.spo2} unit="%" color="#22d3ee" />
      <MetricTile label="Resp. est." value={v.respRate} unit="rpm" color="#facc15" />
      <MetricTile label="Perfusión" value={v.pi} unit="%" color="#34d399" />
      <BpTile bp={v.bp} onCalibrate={onCalibrate} />
      <MetricTile label="Intervalo RR" value={v.ibiMs} unit="ms" color="#38bdf8" />
      <MetricTile label="HRV RMSSD" value={v.hrv?.rmssd} unit="ms" color="#c4b5fd" />
      <MetricTile label="Vascular AGI" value={agi} unit="" color="#fb923c" />
      <MetricTile label="Valle mín" value={signed(p.minValley)} unit="%AC" color="#818cf8" />
      <MetricTile label="Amplitud P–V" value={amp} unit="%AC" color="#f472b6" className="landscape:col-span-2" />
    </div>
  );
}