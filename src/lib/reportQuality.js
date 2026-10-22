/** Conservative reporting gates; none of these thresholds is clinical validation. */
export const REPORT_MIN_SQI = 75;
export const REPORT_MIN_CLEAN_S = 10;
export const REPORT_MIN_DURATION_S = 20;

export function reportVitalsAccepted(v, durationS) {
  return v?.state === 'locked' && Number.isFinite(v.hr) && v.hr > 0
    && Number.isFinite(v.sqi) && v.sqi >= REPORT_MIN_SQI
    && Number.isFinite(v.cleanSeconds) && v.cleanSeconds >= REPORT_MIN_CLEAN_S
    && Number.isFinite(durationS) && durationS >= REPORT_MIN_DURATION_S;
}

export function reportRhythmAccepted(v, durationS) {
  const r = v?.rhythm;
  return reportVitalsAccepted(v, durationS) && r?.trusted === true
    && r.n >= 10 && r.shapeQ >= 0.8 && r.trustFrac >= 0.85
    && r.kind === r.raw && r.stableSeconds >= 3;
}

export const reportHistoryQuery = (ownerId) => ({
  created_by_id: ownerId,
  sqi: { $gte: REPORT_MIN_SQI },
  clean_duration_s: { $gte: REPORT_MIN_CLEAN_S },
  duration_s: { $gte: REPORT_MIN_DURATION_S },
});