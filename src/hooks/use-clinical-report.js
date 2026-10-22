import { useRef, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { buildClinicalReport } from '@/lib/clinicalReport';
import { loadHistorySummary } from '@/lib/historyAlerts';
import { recordFromVitals } from '@/lib/vitalRecords';

/** Complete the report only after saving and refreshing its personal history. */
export default function useClinicalReport(user, refreshRecords) {
  const [report, setReport] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [pending, setPending] = useState(null);
  const generation = useRef(0);
  const generate = async (session, saved = false) => {
    const current = ++generation.current;
    setBusy(true);
    setError('');
    setReport(null);
    let persisted = saved;
    try {
      if (!user?.id) throw new Error('Inicia sesión para generar tu informe personal.');
      const payload = recordFromVitals(session.vitals, session.durationS);
      if (payload && !persisted) {
        await base44.entities.VitalRecord.create(payload);
        persisted = true;
      }
      const historySummary = await loadHistorySummary(user.id);
      if (current !== generation.current) return;
      setReport(buildClinicalReport({ ...session, patient: user.full_name || user.email || 'Usuario', historySummary }));
      setPending(null);
      await refreshRecords();
    } catch (e) {
      if (current !== generation.current) return;
      setPending({ session, saved: persisted });
      setError(e.message || 'No se pudo preparar el informe. Puedes reintentarlo.');
    } finally { if (current === generation.current) setBusy(false); }
  };
  return { report, busy, error, generate,
    reset: () => { generation.current++; setBusy(false); setReport(null); setError(''); setPending(null); },
    retry: () => pending && generate(pending.session, pending.saved) };
}