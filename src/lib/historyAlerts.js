import { base44 } from '@/api/base44Client';
import { reportHistoryQuery } from '@/lib/reportQuality';

const fmt = (v, d = 0) => Number.isFinite(v) ? v.toFixed(d) : '--';
const FIELDS = ['hr', 'spo2', 'resp_rate', 'sbp', 'dbp', 'hrv_sdnn', 'hrv_rmssd', 'sqi'];
const ROWS = [
  ['hr', 'Pulso medio', 'bpm'], ['spo2', 'SpO2 estimada media', '%'],
  ['resp_rate', 'Respiración estimada media', 'brpm'],
  ['sbp', 'Presión sistólica estimada media', 'mmHg'], ['dbp', 'Presión diastólica estimada media', 'mmHg'],
  ['hrv_sdnn', 'HRV SDNN medio', 'ms'], ['hrv_rmssd', 'HRV RMSSD medio', 'ms'],
  ['sqi', 'Calidad de señal media', '%'],
];

/** Server aggregates cover the complete personal history, not a loaded page.
 * Missing quality provenance is NOT inferred retrospectively for old records.
 * Unvalidated camera SpO2/BP and short-window SDNN do not trigger clinical alerts. */
export async function loadHistorySummary(ownerId) {
  const own = { created_by_id: ownerId };
  const accepted = reportHistoryQuery(ownerId);
  const alertQuery = hr => base44.entities.VitalRecord.aggregate({
    query: { ...accepted, hr }, max: ['created_date'],
  });
  const [count, aggregate, high, low, poor] = await Promise.all([
    base44.entities.VitalRecord.count(own),
    base44.entities.VitalRecord.aggregate({ query: accepted, avg: FIELDS }),
    alertQuery({ $gte: 100 }), alertQuery({ $lt: 50 }),
    base44.entities.VitalRecord.count({ ...own, sqi: { $lt: 60 } }),
  ]);
  const stats = aggregate.rows?.[0] || {};
  const averages = ROWS.map(([key, label, unit]) => ({ label, value: fmt(stats[`avg_${key}`]), unit }));
  const alerts = [];
  for (const [result, title] of [[high, 'Pulso medio elevado repetido'], [low, 'Pulso medio bajo repetido']]) {
    const row = result.rows?.[0];
    if (row?.count >= 2) alerts.push({
      level: 'warn', title, count: row.count, lastAt: row.max_created_date,
      detail: 'Umbral orientativo repetido en al menos dos mediciones con señal aceptada; requiere confirmación, no implica un diagnóstico ni acredita reposo.',
    });
  }
  if (poor) alerts.push({ level: 'info', title: 'Lecturas de baja calidad excluidas', count: poor,
    detail: 'No se utilizan para inferir alteraciones del pulso.' });
  return { count, eligibleCount: stats.count || 0, averages, alerts };
}