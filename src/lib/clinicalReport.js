import { jsPDF } from 'jspdf';
import { reportVitalsAccepted, reportRhythmAccepted, REPORT_MIN_SQI } from '@/lib/reportQuality';

const mean = (a) => (a.length ? a.reduce((s, v) => s + v, 0) / a.length : null);
const nums = (a) => a.filter((v) => typeof v === 'number' && Number.isFinite(v));

const fmt = (v, d = 1) => (v == null ? '--' : Number(v).toFixed(d));

const stamp = (iso) =>
  new Date(iso).toLocaleString('es-ES', {
    day: '2-digit', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });

/**
 * Resumen clínico de la sesión: valores promedio, variabilidad del ritmo y alertas.
 * Se construye con la lectura final, con los latidos aceptados durante la medición
 * y con el historial de lecturas guardadas, que aporta promedios y alertas acumuladas.
 */
export function buildClinicalReport({ beats = [], vitals, durationS, patient, historySummary = null }) {
  const eligible = reportVitalsAccepted(vitals, durationS);
  const rhythmOk = reportRhythmAccepted(vitals, durationS);
  const accepted = eligible ? beats.filter(b => b.verified === true && b.sqi >= REPORT_MIN_SQI) : [];
  const hrs = nums(accepted.map(b => b.hr));
  const ibis = nums(accepted.map(b => b.ibi));
  const measured = eligible ? vitals : null;
  const hrv = rhythmOk && vitals.rhythm.kind === 'regular'
    && vitals.hrv?.n >= 20 && vitals.hrv.durationS >= 20 ? vitals.hrv : null;
  const rhythm = rhythmOk ? vitals.rhythm : null;
  const averages = [
    { label: 'Frecuencia cardiaca media', value: fmt(mean(hrs) ?? measured?.hr, 0), unit: 'bpm' },
    { label: 'Frecuencia cardiaca minima / maxima', value: hrs.length ? `${fmt(Math.min(...hrs), 0)} / ${fmt(Math.max(...hrs), 0)}` : '--', unit: 'bpm' },
    { label: 'Intervalo entre latidos (IBI) medio', value: fmt(mean(ibis), 0), unit: 'ms' },
    { label: 'SpO2 estimada (no validada)', value: fmt(measured?.spo2, 0), unit: '%' },
    { label: 'Respiracion estimada', value: fmt(measured?.respRate, 0), unit: 'brpm' },
    { label: measured?.bp
      ? (measured.bp.calibrated ? 'Presion estimada (anclada a manguito)' : 'Presion estimada (referencia poblacional)')
      : 'Presion estimada', value: measured?.bp ? `${fmt(measured.bp.sbp, 0)} / ${fmt(measured.bp.dbp, 0)}` : '--', unit: 'mmHg' },
    { label: 'Indice envejecimiento vascular (AGI)', value: measured?.bpFeatures?.agi != null ? fmt(measured.bpFeatures.agi, 2) : '--', unit: '' },
    { label: 'Indice de aumento arterial (AIx)', value: measured?.bpFeatures?.aix != null ? fmt(measured.bpFeatures.aix, 2) : '--', unit: '' },
    { label: 'Latidos incluidos con calidad aceptada', value: String(accepted.length), unit: '' },
    { label: 'Duracion de la medicion', value: fmt(durationS, 0), unit: 's' },
    { label: 'Tramo continuo de senal aceptada', value: fmt(vitals?.cleanSeconds ?? 0, 1), unit: 's' },
  ];
  const variability = [
    { label: 'SDNN (registro corto orientativo)', value: fmt(hrv?.sdnn, 0), unit: 'ms' },
    { label: 'RMSSD', value: fmt(hrv?.rmssd, 0), unit: 'ms' },
    { label: 'pNN50', value: fmt(hrv?.pnn50, 0), unit: '%' },
    { label: 'Poincare SD1 (variabilidad corta/vagal)', value: fmt(hrv?.sd1, 1), unit: 'ms' },
    { label: 'Poincare SD2 (variabilidad larga)', value: fmt(hrv?.sd2, 1), unit: 'ms' },
    { label: 'Ratio Poincare SD1/SD2', value: fmt(hrv?.sd1_sd2, 2), unit: '' },
    { label: 'Coeficiente de variacion (CV)', value: fmt(hrv?.cv, 1), unit: '%' },
    { label: 'LF/HF (requiere registro suficiente)', value: fmt(hrv?.lf_hf, 2), unit: '' },
  ];
  const alerts = [];
  if (!eligible) alerts.push({ level: 'info', title: 'Medicion no interpretable con suficiente confianza',
    detail: 'Se requieren al menos 20 s de medicion, 10 s continuos de senal aceptada y calidad igual o superior al 75%. Movimiento, luz variable o perdida de contacto invalidan la lectura; no indican una alteracion cardiaca.' });
  else if (!rhythmOk) alerts.push({ level: 'info', title: 'Ritmo no evaluable con suficiente confianza',
    detail: 'No hay suficientes intervalos de buena calidad y un patron persistente. No se infieren arritmias ni ausencia de ellas.' });
  if (rhythm && ['warn', 'alert'].includes(rhythm.severity)) {
    alerts.push({ level: rhythm.severity,
      title: rhythm.kind === 'irregular' ? 'Patron de pulso irregular (orientativo)' : rhythm.label,
      detail: `${rhythm.detail || 'Patron persistente en intervalos de calidad aceptada.'} Requiere confirmacion con ECG; no es un diagnostico.` });
    if (rhythm.nPremature) alerts.push({ level: 'warn', title: `${rhythm.nPremature} intervalo(s) corto(s) compatibles con latido prematuro`, detail: 'Patron orientativo con pausa posterior, excluyendo intervalos que cruzan artefactos.' });
    if (rhythm.nPause) alerts.push({ level: 'warn', title: `${rhythm.nPause} intervalo(s) prolongado(s)`, detail: 'Solo se incluyen intervalos que no cruzan muestras invalidadas.' });
  }
  if (eligible && !hrv) alerts.push({ level: 'info', title: 'HRV no evaluable',
    detail: 'Se requieren al menos 20 intervalos consecutivos aceptados, 20 s de intervalos y ritmo regular. LF/HF se omite en registros demasiado cortos. La camara no equivale a un ECG.' });
  if (measured?.bp) alerts.push({ level: 'info', title: 'Presion arterial estimada, no diagnostica',
    detail: `Estimacion por morfologia del pulso${measured.bp.calibrated ? ', anclada a una lectura de manguito' : ', sin calibracion (referencia poblacional)'}. Banda ${measured.bp.sbpLo}-${measured.bp.sbpHi} / ${measured.bp.dbpLo}-${measured.bp.dbpHi} mmHg. No sustituye a un tensiometro validado.` });
  if (measured?.spo2 != null) alerts.push({ level: 'info', title: 'Estimacion de SpO2 no diagnostica',
    detail: 'La SpO2 calculada por camara no esta validada para activar alertas clinicas; confirmar con un pulsioximetro validado.' });
  return {
    generatedAt: new Date().toISOString(), patient: patient || 'Usuario', durationS,
    averages, variability, rhythm, alerts,
    history: historySummary || { count: 0, eligibleCount: 0, averages: [], alerts: [] },
    vitals: measured,
    hrv,
    acceptedBeats: accepted,
  };
}

const M = 18;
const W = 210;
const H = 297;
/** @type {[number, number, number]} */ const INK = [26, 32, 44];
/** @type {[number, number, number]} */ const MUTED = [110, 120, 135];
/** @type {[number, number, number]} */ const ACCENT = [0, 170, 110];
const WARN = [200, 120, 0];
const DANGER = [200, 45, 60];

function heading(doc, text, y) {
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(...ACCENT);
  doc.text(text.toUpperCase(), M, y);
  doc.setDrawColor(225, 230, 235);
  doc.setLineWidth(0.3);
  doc.line(M, y + 1.8, W - M, y + 1.8);
  return y + 8;
}

function rows(doc, items, y) {
  doc.setFontSize(9.5);
  items.forEach((it) => {
    y = ensure(doc, y, 9);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...MUTED);
    doc.text(it.label, M, y);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...INK);
    const value = it.unit ? `${it.value} ${it.unit}` : it.value;
    doc.text(value, W - M, y, { align: 'right' });
    doc.setDrawColor(240, 243, 246);
    doc.line(M, y + 1.8, W - M, y + 1.8);
    y += 7.5;
  });
  return y + 4;
}

/** Salta de página cuando el contenido restante no cabe, para no cortar secciones. */
function ensure(doc, y, need) {
  if (y + need <= H - M - 12) return y;
  doc.addPage();
  return M;
}

/** Bloque de alertas, con su marca de color y el detalle. Compartido por medición e historial. */
function alertList(doc, list, y, emptyText) {
  if (!list.length) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9.5);
    doc.setTextColor(...ACCENT);
    doc.text(emptyText, M, y);
    return y + 10;
  }
  list.forEach((a) => {
    if (y > H - M - 26) { doc.addPage(); y = M; }
    const color = a.level === 'alert' ? DANGER : a.level === 'warn' ? WARN : MUTED;
    doc.setFillColor(...color);
    doc.rect(M, y - 3.2, 1.4, 4.4, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9.5);
    doc.setTextColor(...INK);
    doc.text(a.count ? `${a.title} · ${a.count} lectura(s)` : a.title, M + 5, y);
    y += 5;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(...MUTED);
    const detail = a.lastAt ? `${a.detail} Última: ${stamp(a.lastAt)}.` : a.detail;
    const lines = doc.splitTextToSize(detail, W - 2 * M - 5);
    doc.text(lines, M + 5, y);
    y += lines.length * 4.2 + 5;
  });
  return y + 4;
}

/** Documento PDF del informe clínico. */
export function buildReportPdf(report) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  let y = M;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(20);
  doc.setTextColor(...INK);
  doc.text('PulseVector', M, y);
  doc.setFontSize(11);
  doc.setTextColor(...ACCENT);
  doc.text('Informe clinico de la medicion', M, y + 6);

  y += 14;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(...MUTED);
  doc.text(`Generado: ${stamp(report.generatedAt)}`, W - M, M, { align: 'right' });
  doc.text(`Paciente: ${report.patient}`, W - M, M + 5, { align: 'right' });

  y = heading(doc, 'Valores promedio', y);
  y = rows(doc, report.averages, y);

  y = heading(doc, 'Variabilidad del ritmo cardiaco', y);
  y = rows(doc, report.variability, y);

  y = ensure(doc, y, 34);
  y = heading(doc, 'Alertas de la medicion', y);
  y = alertList(doc, report.alerts, y, 'Sin alertas de ritmo detectadas durante la medicion.');

  if (report.rhythm?.detail) {
    y = ensure(doc, y, 20);
    y = heading(doc, 'Ritmo observado', y);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9.5);
    doc.setTextColor(...INK);
    const lines = doc.splitTextToSize(`${report.rhythm.label}. ${report.rhythm.detail}`, W - 2 * M);
    doc.text(lines, M, y);
    y += lines.length * 4.6 + 6;
  }

  // Historial completo: promedios de todas las lecturas guardadas y alertas acumuladas.
  y = ensure(doc, y, 66);
  y = heading(doc, `Historial: ${report.history.eligibleCount} de ${report.history.count} lecturas con calidad verificada`, y);
  y = rows(doc, report.history.averages, y);

  y = ensure(doc, y, 30);
  y = heading(doc, 'Alertas del historial', y);
  y = alertList(doc, report.history.alerts, y, 'Sin umbrales repetidos en lecturas aceptadas; no descarta alteraciones.');

  const footer = doc.splitTextToSize(
    'PPG por camara: orientativo, no diagnostico. Pulso, SpO2 y presion son estimaciones que requieren confirmacion con equipos validados. Movimiento y luz pueden invalidar datos. Datos antiguos sin trazabilidad de calidad excluidos de alertas.',
    W - 2 * M
  );
  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(...MUTED);
    doc.text(footer, M, H - M - 8);
  }

  return doc;
}

export const reportFileName = (report) =>
  `informe-pulsevector-${report.generatedAt.slice(0, 10)}.pdf`;

export const downloadReportPdf = (report) => buildReportPdf(report).save(reportFileName(report));

export const reportPdfBase64 = (report) =>
  buildReportPdf(report).output('datauristring').split(',')[1];