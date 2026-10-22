/**
 * Presión arterial estimada a partir de la morfología del pulso (PWA-PPG).
 *
 * Ninguna medida óptica da presión absoluta sin una referencia: todo dispositivo
 * sin manguito validado, y las guías AHA/ESH, exigen calibrar con un manguito y
 * recalibrar periódicamente. Este módulo sigue ese esquema: la lectura del
 * manguito fija el anclaje y los rasgos de la onda (aumento, tiempo de cresta,
 * anchura, frecuencia) desplazan la estimación desde ese anclaje. Sin
 * calibración solo se ofrece una referencia poblacional con banda ancha.
 *
 * Las sensibilidades tienen orden de magnitud coherente con la literatura de
 * PWA-PPG, pero no son un modelo entrenado: la estimación es orientativa.
 */

const SBP_RANGE = [70, 210];
const DBP_RANGE = [40, 140];

const K = {
  hr: { sbp: 0.25, dbp: 0.12 },     // por lpm
  aix: { sbp: 35, dbp: 15 },        // por unidad (0..1)
  crest: { sbp: 0.05, dbp: 0.02 },  // por ms (cresta más corta → más presión)
  width: { sbp: 0.02, dbp: 0.03 },  // por ms
};

const clamp = (v, [lo, hi]) => Math.max(lo, Math.min(hi, v));

export function estimateBloodPressure(features, calibration) {
  if (!features) return null;

  // Sin anclaje: referencia poblacional, marcada como no calibrada y con banda ancha.
  if (!calibration || calibration.sbp == null || calibration.dbp == null) {
    const sbp = clamp(
      118 + (features.hr - 68) * K.hr.sbp + features.aix * K.aix.sbp * 0.6 + (740 - features.crest) * 0.03,
      SBP_RANGE
    );
    const dbp = clamp(
      74 + (features.hr - 68) * K.hr.dbp + features.aix * K.aix.dbp * 0.6 + (740 - features.crest) * 0.012,
      DBP_RANGE
    );
    return {
      sbp: Math.round(sbp),
      dbp: Math.round(dbp),
      sbpLo: Math.round(sbp - 20), sbpHi: Math.round(sbp + 20),
      dbpLo: Math.round(dbp - 14), dbpHi: Math.round(dbp + 14),
      calibrated: false,
      stale: false,
    };
  }

  const hr0 = calibration.hr ?? features.hr;
  const aix0 = calibration.aix ?? features.aix;
  const crest0 = calibration.crest ?? features.crest;
  const width0 = calibration.width ?? features.width;

  const sbp = clamp(
    calibration.sbp
      + K.hr.sbp * (features.hr - hr0)
      + K.aix.sbp * (features.aix - aix0)
      + K.crest.sbp * (crest0 - features.crest)
      + K.width.sbp * (width0 - features.width),
    SBP_RANGE
  );
  const dbp = clamp(
    calibration.dbp
      + K.hr.dbp * (features.hr - hr0)
      + K.aix.dbp * (features.aix - aix0)
      + K.crest.dbp * (crest0 - features.crest)
      + K.width.dbp * (width0 - features.width),
    DBP_RANGE
  );

  // La calibración caduca: pasados 30 días la banda se ensancha de forma visible.
  const ageDays = calibration.at ? (Date.now() - new Date(calibration.at).getTime()) / 86400000 : 0;
  const stale = ageDays > 30;
  const grow = stale ? Math.min(18, (ageDays - 30) * 0.5) : 0;

  return {
    sbp: Math.round(sbp),
    dbp: Math.round(dbp),
    sbpLo: Math.round(sbp - 9 - grow), sbpHi: Math.round(sbp + 9 + grow),
    dbpLo: Math.round(dbp - 7 - grow * 0.6), dbpHi: Math.round(dbp + 7 + grow * 0.6),
    calibrated: true,
    stale,
  };
}

/** Anclaje a partir de la lectura del manguito y la onda capturada en ese momento. */
export function makeCalibration({ sbp, dbp }, features) {
  if (!Number.isFinite(sbp) || !Number.isFinite(dbp) || !Number.isInteger(sbp)
    || !Number.isInteger(dbp) || sbp < 70 || sbp > 250 || dbp < 40 || dbp > 150 || sbp <= dbp) {
    throw new Error('Introduce una lectura válida del tensiómetro, en mmHg enteros.');
  }
  return {
    sbp: Math.round(sbp),
    dbp: Math.round(dbp),
    hr: features?.hr ?? null,
    aix: features?.aix ?? null,
    crest: features?.crest ?? null,
    width: features?.width ?? null,
    at: new Date().toISOString(),
  };
}