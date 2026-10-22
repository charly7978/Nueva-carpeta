import { reportVitalsAccepted } from '@/lib/reportQuality';

/** Campos numéricos de una lectura guardada, en el orden en que se editan. */
export const RECORD_FIELDS = [
  { key: 'hr', label: 'Pulso', unit: 'bpm' },
  { key: 'spo2', label: 'SpO₂', unit: '%' },
  { key: 'resp_rate', label: 'Frec. respiratoria', unit: 'brpm' },
  { key: 'sbp', label: 'Sistólica', unit: 'mmHg' },
  { key: 'dbp', label: 'Diastólica', unit: 'mmHg' },
  { key: 'hrv_sdnn', label: 'HRV SDNN', unit: 'ms' },
  { key: 'hrv_rmssd', label: 'HRV RMSSD', unit: 'ms' },
  { key: 'hrv_lf_hf', label: 'LF/HF', unit: '' },
  { key: 'sqi', label: 'Calidad de señal', unit: '%' },
  { key: 'duration_s', label: 'Duración', unit: 's' },
];

const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);

/**
 * Convierte la lectura en vivo en el registro que se guarda.
 * Devuelve null si no llegó a haber pulso: sin pulso no hay nada que guardar.
 */
export function recordFromVitals(v, durationS) {
  if (!reportVitalsAccepted(v, durationS)) return null;
  const rec = {
    hr: num(v.hr),
    spo2: num(v.spo2),
    resp_rate: num(v.respRate),
    sbp: num(v.bp?.sbp),
    dbp: num(v.bp?.dbp),
    hrv_sdnn: num(v.hrv?.sdnn),
    hrv_rmssd: num(v.hrv?.rmssd),
    hrv_lf_hf: num(v.hrv?.lf_hf),
    sqi: num(v.sqi),
    duration_s: num(durationS),
    clean_duration_s: num(v.cleanSeconds),
  };
  return rec.hr ? rec : null;
}

export const formatWhen = (iso) =>
  new Date(iso).toLocaleString('es-ES', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });

export const summarize = (r) =>
  [
    r.hr ? `${r.hr} bpm` : null,
    r.spo2 ? `${r.spo2}% SpO₂` : null,
    r.sqi ? `SQI ${r.sqi}%` : null,
  ]
    .filter(Boolean)
    .join(' · ') || 'Sin datos';