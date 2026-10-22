/**
 * Exportación estándar de datos biomédicos (HL7 FHIR & CSV)
 * ─────────────────────────────────────────────────────────────
 * Genera bundles FHIR JSON estándar (HL7 FHIR Release 4 / LOINC)
 * y archivos CSV de series de intervalos entre latidos (IBI / RR)
 * para interoperabilidad médica con historias clínicas electrónicas (EHR).
 * ─────────────────────────────────────────────────────────────
 */

/**
 * Genera un recurso HL7 FHIR Observation individual.
 */
function makeObservation({ id, code, display, value, unit, ucumCode, effectiveDateTime, subjectRef, components = null }) {
  const obs = {
    resourceType: 'Observation',
    id,
    meta: {
      profile: ['http://hl7.org/fhir/StructureDefinition/vitalsigns'],
    },
    status: 'final',
    category: [
      {
        coding: [
          {
            system: 'http://terminology.hl7.org/CodeSystem/observation-category',
            code: 'vital-signs',
            display: 'Vital Signs',
          },
        ],
        text: 'Vital Signs',
      },
    ],
    code: {
      coding: [
        {
          system: 'http://loinc.org',
          code,
          display,
        },
      ],
      text: display,
    },
    subject: {
      reference: subjectRef,
    },
    effectiveDateTime,
  };

  if (value != null && Number.isFinite(value)) {
    obs.valueQuantity = {
      value: Math.round(value * 10) / 10,
      unit,
      system: 'http://unitsofmeasure.org',
      code: ucumCode,
    };
  }

  if (Array.isArray(components) && components.length > 0) {
    obs.component = components;
  }

  return obs;
}

/**
 * Genera un Bundle FHIR R4 completo con todas las observaciones registradas.
 */
export function generateFhirBundle(report, user = null) {
  const patientId = user?.id ? `Patient/${user.id}` : 'Patient/anonymous-user';
  const effectiveDateTime = report.generatedAt || new Date().toISOString();
  const vitals = report.vitals || {};
  const hrv = report.hrv || vitals.hrv;
  const entries = [];

  // 1. Frecuencia Cardíaca (LOINC 8867-4)
  const hr = vitals.hr ?? (report.averages.find(a => a.label.includes('cardiaca media'))?.value);
  if (hr && Number.isFinite(Number(hr))) {
    entries.push({
      fullUrl: `urn:uuid:observation-hr-${Date.now()}`,
      resource: makeObservation({
        id: 'observation-heart-rate',
        code: '8867-4',
        display: 'Heart rate',
        value: Number(hr),
        unit: 'beats/minute',
        ucumCode: '/min',
        effectiveDateTime,
        subjectRef: patientId,
      }),
    });
  }

  // 2. Frecuencia Respiratoria estimada (LOINC 9279-1)
  if (vitals.respRate != null && Number.isFinite(Number(vitals.respRate))) {
    entries.push({
      fullUrl: `urn:uuid:observation-resp-${Date.now()}`,
      resource: makeObservation({
        id: 'observation-respiratory-rate',
        code: '9279-1',
        display: 'Respiratory rate',
        value: Number(vitals.respRate),
        unit: 'breaths/minute',
        ucumCode: '/min',
        effectiveDateTime,
        subjectRef: patientId,
      }),
    });
  }

  // 3. SpO2 estimada (LOINC 2708-6)
  if (vitals.spo2 != null && Number.isFinite(Number(vitals.spo2))) {
    entries.push({
      fullUrl: `urn:uuid:observation-spo2-${Date.now()}`,
      resource: makeObservation({
        id: 'observation-oxygen-saturation',
        code: '2708-6',
        display: 'Oxygen saturation in Arterial blood',
        value: Number(vitals.spo2),
        unit: '%',
        ucumCode: '%',
        effectiveDateTime,
        subjectRef: patientId,
      }),
    });
  }

  // 4. Presión Arterial (LOINC 85354-9 Panel, con componentes sistólico 8480-6 y diastólico 8462-4)
  if (vitals.bp && Number.isFinite(vitals.bp.sbp) && Number.isFinite(vitals.bp.dbp)) {
    entries.push({
      fullUrl: `urn:uuid:observation-bp-${Date.now()}`,
      resource: makeObservation({
        id: 'observation-blood-pressure',
        code: '85354-9',
        display: 'Blood pressure panel with all children optional',
        value: null,
        unit: null,
        ucumCode: null,
        effectiveDateTime,
        subjectRef: patientId,
        components: [
          {
            code: {
              coding: [{ system: 'http://loinc.org', code: '8480-6', display: 'Systolic blood pressure' }],
            },
            valueQuantity: {
              value: Math.round(vitals.bp.sbp),
              unit: 'mmHg',
              system: 'http://unitsofmeasure.org',
              code: 'mm[Hg]',
            },
          },
          {
            code: {
              coding: [{ system: 'http://loinc.org', code: '8462-4', display: 'Diastolic blood pressure' }],
            },
            valueQuantity: {
              value: Math.round(vitals.bp.dbp),
              unit: 'mmHg',
              system: 'http://unitsofmeasure.org',
              code: 'mm[Hg]',
            },
          },
        ],
      }),
    });
  }

  // 5. Métricas HRV (SDNN: LOINC 80404-7, RMSSD: LOINC 89025-1)
  if (hrv?.sdnn != null) {
    entries.push({
      fullUrl: `urn:uuid:observation-sdnn-${Date.now()}`,
      resource: makeObservation({
        id: 'observation-hrv-sdnn',
        code: '80404-7',
        display: 'R-R interval.standard deviation (SDNN)',
        value: Number(hrv.sdnn),
        unit: 'milliseconds',
        ucumCode: 'ms',
        effectiveDateTime,
        subjectRef: patientId,
      }),
    });
  }
  if (hrv?.rmssd != null) {
    entries.push({
      fullUrl: `urn:uuid:observation-rmssd-${Date.now()}`,
      resource: makeObservation({
        id: 'observation-hrv-rmssd',
        code: '89025-1',
        display: 'R-R interval.root mean square difference (RMSSD)',
        value: Number(hrv.rmssd),
        unit: 'milliseconds',
        ucumCode: 'ms',
        effectiveDateTime,
        subjectRef: patientId,
      }),
    });
  }

  // 6. Índice de Envejecimiento Vascular (AGI - Takazawa APG)
  if (vitals.bpFeatures?.agi != null) {
    entries.push({
      fullUrl: `urn:uuid:observation-agi-${Date.now()}`,
      resource: {
        resourceType: 'Observation',
        id: 'observation-vascular-aging-index',
        status: 'final',
        category: [
          {
            coding: [{ system: 'http://terminology.hl7.org/CodeSystem/observation-category', code: 'exam', display: 'Exam' }],
          },
        ],
        code: {
          text: 'Vascular Aging Index (SDPPG / APG AGI)',
        },
        subject: { reference: patientId },
        effectiveDateTime,
        valueQuantity: {
          value: vitals.bpFeatures.agi,
          unit: 'score',
        },
      },
    });
  }

  return {
    resourceType: 'Bundle',
    id: `bundle-vitals-${Date.now()}`,
    type: 'collection',
    timestamp: effectiveDateTime,
    entry: entries,
  };
}

/**
 * Genera el contenido de un archivo CSV con la serie completa de latidos.
 */
export function generateBeatsCsv(beats = [], report = null) {
  const headers = ['beat_index', 'elapsed_seconds', 'ibi_ms', 'instantaneous_hr', 'sqi_percent', 'verified_quality'];
  const rows = beats.map((b, idx) => [
    b.id ?? idx + 1,
    b.elapsed ?? '',
    b.ibi != null ? Math.round(b.ibi) : '',
    b.hr != null ? Math.round(b.hr) : '',
    b.sqi != null ? Math.round(b.sqi) : '',
    b.verified ? 'true' : 'false',
  ]);

  const metaHeader = [
    `# VitalScan / PulseVector Exportación de Intervalos Inter-latido (IBI)`,
    `# Fecha de generación: ${report?.generatedAt || new Date().toISOString()}`,
    `# Total latidos registrados: ${beats.length}`,
    headers.join(','),
  ];

  return [...metaHeader, ...rows.map(r => r.join(','))].join('\n');
}

/**
 * Dispara la descarga del Bundle HL7 FHIR en formato JSON.
 */
export function downloadFhirJson(report, user = null) {
  const bundle = generateFhirBundle(report, user);
  const blob = new Blob([JSON.stringify(bundle, null, 2)], { type: 'application/fhir+json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const dateStr = new Date(report.generatedAt || Date.now()).toISOString().slice(0, 10);
  a.href = url;
  a.download = `vitalscan_fhir_${dateStr}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Dispara la descarga del CSV con los intervalos latido a latido.
 */
export function downloadBeatsCsv(beats, report = null) {
  const csv = generateBeatsCsv(beats, report);
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const dateStr = new Date(report?.generatedAt || Date.now()).toISOString().slice(0, 10);
  a.href = url;
  a.download = `vitalscan_beats_${dateStr}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
