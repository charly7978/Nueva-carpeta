import MetricTile from './MetricTile';
import BpTile from './BpTile';

const signed = (v) => (v == null ? null : `${v >= 0 ? '+' : '−'}${Math.abs(v).toFixed(2)}`);

/**
 * Displays del monitor, flotando sobre la onda. En vertical: tira de 3 columnas
 * al pie. En horizontal: columna lateral que ocupa todo el alto.
 */
export default function MetricsGrid({ vitals, onCalibrate }) {
  const v = vitals || {};
  const p = v.peaks || {};
  const amp = p.avgAmp != null ? p.avgAmp.toFixed(2) : null;
  const agi = v.bpFeatures?.agi != null ? signed(v.bpFeatures.agi) : null;

  return (
    <div className="grid shrink-0 grid-cols-3 auto-rows-[clamp(50px,8.4dvh,88px)] gap-1.5 px-2 landscape:h-full landscape:w-[min(34vw,400px)] landscape:grid-cols-2 landscape:auto-rows-fr landscape:px-0 landscape:pr-2">
      <MetricTile label="SpO₂ est." value={v.spo2} unit="%" color="#22d3ee" />
      <MetricTile label="Resp. est." value={v.respRate} unit="rpm" color="#facc15" />
      <MetricTile label="Perfusión" value={v.pi} unit="%" color="#34d399" />
      <BpTile bp={v.bp} onCalibrate={onCalibrate} />
      <MetricTile label="Intervalo RR" value={v.ibiMs} unit="ms" color="#e2e8f0" />
      <MetricTile label="HRV RMSSD" value={v.hrv?.rmssd} unit="ms" color="#c4b5fd" />
      <MetricTile label="Vascular AGI" value={agi} unit="" color="#fb923c" />
      <MetricTile label="Valle mín" value={signed(p.minValley)} unit="%AC" color="#38bdf8" />
      <MetricTile label="Amplitud P–V" value={amp} unit="%AC" color="#f0abfc" className="landscape:col-span-2" />
    </div>
  );
}