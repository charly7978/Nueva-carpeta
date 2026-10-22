import { useState } from 'react';
import { motion } from 'framer-motion';
import { Info } from 'lucide-react';
import { triggerHaptic, HapticPattern } from '@/utils/haptics';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';

const METRIC_DETAILS = {
  'SpO₂ est.': {
    title: 'Saturación de Oxígeno (SpO₂ estimada)',
    normal: '95% – 100%',
    desc: 'Estimación espectrofotométrica de la fracción de hemoglobina oxigenada a partir de la relación de modulación del pulso capilar.',
    caution: 'Valores menores a 92% requieren confirmación con pulsioxímetro clínico.',
  },
  'Resp. est.': {
    title: 'Frecuencia Respiratoria (RIIV / RIAV)',
    normal: '12 – 20 rpm en reposo',
    desc: 'Calculada mediante la variación inducida por la respiración en la línea de base y la amplitud del pulso PPG.',
    caution: 'Respira de forma natural y sin forzar para evitar artefactos.',
  },
  'Perfusión': {
    title: 'Índice de Perfusión (PI)',
    normal: '0.5% – 5.0% (óptimo > 1.4%)',
    desc: 'Relación entre la señal pulsátil (AC) y la no pulsátil (DC). Evalúa el tono vasomotor periférico en la yema del dedo.',
    caution: 'Manos frías o vasoconstricción reducen el índice de perfusión.',
  },
  'Intervalo RR': {
    title: 'Intervalo entre Latidos (RR / IBI)',
    normal: '600 – 1000 ms (corresponde a 60–100 BPM)',
    desc: 'Tiempo exacto en milisegundos transcurrido entre dos ondas sistólicas consecutivas validadas.',
    caution: 'Variaciones constantes indican actividad fisiológica del sistema nervioso autónomo.',
  },
  'HRV RMSSD': {
    title: 'Variabilidad Cardíaca (RMSSD)',
    normal: '25 – 65 ms (depende de la edad)',
    desc: 'Raíz cuadrada del promedio de las diferencias sucesivas al cuadrado. Marcador por excelencia del tono parasimpático y recuperación.',
    caution: 'Mayor valor refleja mayor resiliencia ante el estrés físico y mental.',
  },
  'Vascular AGI': {
    title: 'Índice de Envejecimiento Vascular (AGI)',
    normal: '−0.80 a +0.10',
    desc: 'Derivado de la segunda derivada del pulso fotopletismográfico (SDPPG). Refleja distensibilidad y rigidez de las paredes arteriales.',
    caution: 'Valores más negativos indican arterias más elásticas y jóvenes.',
  },
  'Valle mín': {
    title: 'Valle Mínimo Diastólico',
    normal: '−0.8 a −1.5 %AC',
    desc: 'Mínima excursión negativa de la onda de pulso durante la fase de relajación diastólica.',
    caution: 'Utilizado para la validación de morfología y rechazo de ruido.',
  },
  'Amplitud P–V': {
    title: 'Amplitud Sistólica Pico–Valle',
    normal: '1.2 a 3.5 %AC',
    desc: 'Excursión dinámica total de la onda pulsátil arterial entre la sístole máxima y la diástole mínima.',
    caution: 'Una buena amplitud confirma un contacto óptico firme sobre la cámara.',
  },
};

/** Display numérico bento translúcido con toque háptico y ventana explicativa */
export default function MetricTile({ label, value, unit, color = '#22d3ee', className = '' }) {
  const [openInfo, setOpenInfo] = useState(false);
  const has = value != null;
  const detail = METRIC_DETAILS[label] || null;

  const handleTileClick = () => {
    if (detail) {
      triggerHaptic(HapticPattern.LIGHT);
      setOpenInfo(true);
    }
  };

  return (
    <>
      <motion.button
        type="button"
        onClick={handleTileClick}
        whileHover={{ scale: 1.02 }}
        whileTap={{ scale: 0.97 }}
        className={`group relative flex min-h-0 min-w-0 flex-col justify-between overflow-hidden rounded-2xl border px-3 py-2 text-left transition-all ${className}`}
        style={{
          borderColor: has ? `${color}35` : 'rgba(255, 255, 255, 0.08)',
          background: has
            ? `linear-gradient(155deg, ${color}20 0%, rgba(4, 9, 16, 0.65) 100%)`
            : 'linear-gradient(155deg, rgba(255, 255, 255, 0.04) 0%, rgba(4, 9, 16, 0.5) 100%)',
          backdropFilter: 'blur(16px)',
          boxShadow: has ? `0 8px 24px -10px ${color}25` : 'none',
        }}
      >
        {/* Línea reflectiva superior */}
        <span
          className="pointer-events-none absolute inset-x-3 top-0 h-px transition-opacity duration-500"
          style={{
            opacity: has ? 0.8 : 0.2,
            background: `linear-gradient(90deg, transparent, ${color}, transparent)`,
          }}
        />

        {/* Micro-esquina futurista */}
        <span
          className="pointer-events-none absolute top-1 right-1 h-1.5 w-1.5 border-t border-r rounded-tr"
          style={{ borderColor: `${color}60` }}
        />

        {/* Header de la tarjeta */}
        <div className="flex items-center justify-between gap-1 w-full">
          <span className="truncate font-mono text-[clamp(8px,1.5vmin,11px)] font-semibold uppercase tracking-[0.16em] text-white/55">
            {label}
          </span>
          {detail && (
            <Info className="h-3 w-3 shrink-0 text-white/20 opacity-0 group-hover:opacity-100 transition-opacity" />
          )}
        </div>

        {/* Valor y unidad con tipografía luminosa */}
        <div className="flex min-w-0 items-baseline gap-1.5">
          <motion.span
            key={String(value)}
            initial={{ opacity: 0.35, y: 3 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
            className="tabular truncate font-mono text-[clamp(18px,4.5vmin,44px)] font-light leading-none tracking-tight"
            style={{
              color: has ? color : 'rgba(255, 255, 255, 0.22)',
              textShadow: has ? `0 0 20px ${color}45` : 'none',
            }}
          >
            {has ? value : '--'}
          </motion.span>
          <span className="shrink-0 font-mono text-[clamp(8px,1.4vmin,11px)] text-white/40">
            {unit}
          </span>
        </div>
      </motion.button>

      {/* Modal explicativo de la métrica */}
      {detail && (
        <Dialog open={openInfo} onOpenChange={setOpenInfo}>
          <DialogContent className="max-w-sm rounded-[24px] border border-white/12 bg-card/95 p-5 backdrop-blur-2xl">
            <DialogHeader>
              <div className="flex items-center gap-2 mb-1">
                <span
                  className="h-2 w-2 rounded-full"
                  style={{ background: color, boxShadow: `0 0 10px ${color}` }}
                />
                <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-white/50">
                  Parámetro Clínico
                </span>
              </div>
              <DialogTitle className="font-display text-lg font-bold text-white">
                {detail.title}
              </DialogTitle>
              <DialogDescription className="text-white/60 text-xs mt-2 leading-relaxed">
                {detail.desc}
              </DialogDescription>
            </DialogHeader>

            <div className="mt-3 space-y-2.5 rounded-xl border border-white/[0.08] bg-white/[0.03] p-3 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-white/45">Rango fisiológico:</span>
                <span className="font-mono font-medium text-white/90">{detail.normal}</span>
              </div>
              <p className="text-[11px] text-white/40 border-t border-white/[0.06] pt-2 leading-snug">
                {detail.caution}
              </p>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}