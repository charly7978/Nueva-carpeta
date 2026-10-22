import { useEffect, useState } from 'react';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

/** Ancla la estimación óptica con una lectura real de manguito. */
export default function BpCalibrationDialog({ open, onOpenChange, calibration, features, onSave, onClear }) {
  const [sbp, setSbp] = useState('');
  const [dbp, setDbp] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (open) { setSbp(''); setDbp(''); setBusy(false); setError(''); }
  }, [open]);

  const s = Number(sbp);
  const d = Number(dbp);
  const valid = Number.isInteger(s) && Number.isInteger(d)
    && s >= 70 && s <= 250 && d >= 40 && d <= 150 && s > d;

  const submit = async () => {
    if (!valid || busy) return;
    setBusy(true);
    setError('');
    try {
      await onSave({ sbp: s, dbp: d });
      onOpenChange(false);
    } catch (e) {
      setError(e.message || 'No se pudo guardar la referencia.');
    } finally { setBusy(false); }
  };

  const clear = async () => {
    if (busy) return;
    setBusy(true);
    setError('');
    try { await onClear(); onOpenChange(false); }
    catch (e) { setError(e.message || 'No se pudo quitar la referencia.'); }
    finally { setBusy(false); }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Calibración de presión arterial</DialogTitle>
          <DialogDescription>
            Introduce la lectura de un tensiómetro tomada ahora mismo. La estimación por cámara se
            ancla a ese valor y sigue los cambios de la onda. Sin calibración solo hay referencia
            poblacional, con banda ancha y sin validez diagnóstica.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-1">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="bp-sbp">Sistólica (mmHg)</Label>
              <Input
                id="bp-sbp" inputMode="numeric" placeholder="120"
                value={sbp} onChange={(e) => setSbp(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="bp-dbp">Diastólica (mmHg)</Label>
              <Input
                id="bp-dbp" inputMode="numeric" placeholder="80"
                value={dbp} onChange={(e) => setDbp(e.target.value)}
              />
            </div>
          </div>

          <p className="text-xs text-muted-foreground">
            {features
              ? `Onda capturada: ${features.beats} latidos · aumento ${Math.round(features.aix * 100)} % · cresta ${features.crest} ms`
              : 'Sin onda válida todavía: la calibración se aplicará en cuanto haya pulso estable.'}
          </p>
          {error && <p role="alert" className="text-xs text-destructive">{error}</p>}

          {calibration?.at && (
            <p className="text-xs text-muted-foreground">
              Calibración actual: {calibration.sbp}/{calibration.dbp} mmHg ·{' '}
              {new Date(calibration.at).toLocaleDateString('es-ES')}
            </p>
          )}
        </div>

        <DialogFooter className="gap-2">
          {calibration && (
            <Button variant="ghost" onClick={clear} disabled={busy}>Quitar calibración</Button>
          )}
          <Button onClick={submit} disabled={!valid || busy}>Calibrar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}