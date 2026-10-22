import { motion } from 'framer-motion';
import { Camera, Hand, ShieldCheck, Play, Dna, Waves, Activity, Sparkles } from 'lucide-react';
import { triggerHaptic, HapticPattern } from '@/utils/haptics';

const STEPS = [
  {
    icon: Camera,
    title: 'Cámara trasera + Flash',
    desc: 'El flash se enciende automáticamente para iluminar el lecho capilar',
  },
  {
    icon: Hand,
    title: 'Contacto constante',
    desc: 'Cubre suavemente la lente y el flash con la yema del dedo índice',
  },
  {
    icon: ShieldCheck,
    title: 'Estabilidad de captura',
    desc: 'Mantén la mano quieta y apoyada durante 30 s para máxima precisión',
  },
];

const RHYTHMS = [
  { id: 'normal', name: 'Ritmo Sinusal', code: 'NSR', badge: 'Normal' },
  { id: 'pvc', name: 'Extrasístoles', code: 'PVC', badge: 'Prematuro' },
  { id: 'bigeminy', name: 'Bigeminismo', code: 'BIG', badge: 'Patrón 2:1' },
  { id: 'trigeminy', name: 'Trigeminismo', code: 'TRI', badge: 'Patrón 3:1' },
  { id: 'af', name: 'Fibrilación Auricular', code: 'AFib', badge: 'Irregular' },
];

export default function IdlePanel({
  onStart,
  onStartDemo,
  extendedMode,
  onToggleExtended,
  demoRhythm,
  onDemoRhythm,
}) {
  const handleStart = () => {
    triggerHaptic(HapticPattern.START);
    onStart();
  };

  const handleStartDemo = () => {
    triggerHaptic(HapticPattern.START);
    onStartDemo();
  };

  const handleToggle = () => {
    triggerHaptic(HapticPattern.SELECTION);
    onToggleExtended();
  };

  const handleRhythmSelect = (id) => {
    triggerHaptic(HapticPattern.LIGHT);
    onDemoRhythm(id);
  };

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.94, y: 16 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
      className="relative w-[min(94vw,440px)] overflow-hidden rounded-[28px] border border-white/12 bg-card/85 p-5 shadow-[0_24px_60px_-15px_rgba(0,0,0,0.9),0_0_30px_rgba(0,255,136,0.06)] backdrop-blur-2xl"
    >
      {/* Línea reflectiva superior estilo vidrio líquido */}
      <div className="pointer-events-none absolute inset-x-6 top-0 h-px bg-gradient-to-r from-transparent via-white/35 to-transparent" />

      {/* Header con telemetry badge y núcleo holográfico */}
      <div className="flex items-center justify-between pb-3.5 border-b border-white/[0.08]">
        <div className="flex items-center gap-3">
          <div className="relative grid h-11 w-11 place-items-center rounded-2xl border border-primary/30 bg-primary/10 shadow-[0_0_20px_rgba(0,255,136,0.18)]">
            <Activity className="h-5 w-5 text-primary animate-pulse" />
            <span className="absolute -top-1 -right-1 flex h-2.5 w-2.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75" />
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-primary" />
            </span>
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <h2 className="font-display text-xl font-bold tracking-tight text-white">
                Vital<span className="text-primary">Scan</span>
              </h2>
              <span className="rounded-md border border-primary/30 bg-primary/10 px-1.5 py-0.5 font-mono text-[9px] font-semibold text-primary">
                PRO PPG
              </span>
            </div>
            <p className="font-mono text-[9px] uppercase tracking-[0.22em] text-white/45">
              Fotopletismografía óptica médica
            </p>
          </div>
        </div>

        {/* Micro-indicador de telemetría */}
        <div className="text-right">
          <span className="font-mono text-[8px] tracking-[0.16em] text-white/30 uppercase block">
            Frecuencia
          </span>
          <span className="font-mono text-[11px] font-medium text-emerald-400 tabular">
            60 FPS
          </span>
        </div>
      </div>

      {/* Animación central: Núcleo del sensor biométrico */}
      <div className="my-4 relative flex flex-col items-center justify-center py-2 overflow-hidden rounded-2xl border border-white/[0.06] bg-gradient-to-b from-white/[0.03] to-transparent">
        {/* Anillos concéntricos giratorios */}
        <div className="relative flex items-center justify-center h-28 w-28">
          <motion.div
            animate={{ rotate: 360 }}
            transition={{ repeat: Infinity, duration: 25, ease: 'linear' }}
            className="absolute inset-0 rounded-full border border-dashed border-primary/25"
          />
          <motion.div
            animate={{ rotate: -360 }}
            transition={{ repeat: Infinity, duration: 15, ease: 'linear' }}
            className="absolute inset-2 rounded-full border border-dotted border-accent/20"
          />
          <motion.div
            animate={{ scale: [1, 1.08, 1], opacity: [0.8, 1, 0.8] }}
            transition={{ repeat: Infinity, duration: 1.6, ease: 'easeInOut' }}
            className="grid h-16 w-16 place-items-center rounded-full border border-primary/45 bg-primary/15 shadow-[0_0_25px_rgba(0,255,136,0.35)]"
          >
            <span className="text-center font-mono text-[10px] font-bold text-white leading-tight">
              SENSOR
              <span className="block text-[8px] font-normal text-primary">LISTO</span>
            </span>
          </motion.div>
        </div>

        <p className="mt-2 text-center text-[11px] text-white/55">
          Algoritmo causal con rechazo de artefacto por movimiento
        </p>
      </div>

      {/* Tarjetas de pasos clínicos interactivos */}
      <div className="space-y-2 mb-4">
        {STEPS.map((s, idx) => (
          <motion.div
            key={s.title}
            whileHover={{ x: 2, backgroundColor: 'rgba(255, 255, 255, 0.05)' }}
            className="flex items-center gap-3 rounded-xl border border-white/[0.06] bg-white/[0.02] p-2.5 transition-colors"
          >
            <div className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-primary/25 bg-primary/10 text-primary">
              <s.icon className="h-4 w-4" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <span className="font-mono text-[9px] text-white/35 font-semibold">0{idx + 1}</span>
                <p className="text-[12px] font-medium text-white/90 leading-tight">{s.title}</p>
              </div>
              <p className="text-[11px] text-white/50 leading-tight truncate">{s.desc}</p>
            </div>
          </motion.div>
        ))}
      </div>

      {/* Switch modo extendido (60s) con haptic spring */}
      <motion.button
        type="button"
        onClick={handleToggle}
        whileHover={{ scale: 1.01 }}
        whileTap={{ scale: 0.98 }}
        className="mb-4 flex w-full items-center justify-between rounded-2xl border px-3.5 py-3 text-left transition-all"
        style={{
          borderColor: extendedMode ? 'rgba(167,139,250,0.5)' : 'rgba(255,255,255,0.09)',
          background: extendedMode
            ? 'linear-gradient(135deg, rgba(139,124,255,0.18), rgba(124,92,255,0.06))'
            : 'rgba(255,255,255,0.02)',
          boxShadow: extendedMode ? '0 0 24px rgba(139,124,255,0.15)' : 'none',
        }}
      >
        <div className="flex items-center gap-3 min-w-0">
          <div
            className="grid h-8 w-8 shrink-0 place-items-center rounded-xl border"
            style={{
              borderColor: extendedMode ? 'rgba(167,139,250,0.5)' : 'rgba(255,255,255,0.1)',
              background: extendedMode ? 'rgba(167,139,250,0.2)' : 'rgba(255,255,255,0.03)',
            }}
          >
            <Dna className="h-4 w-4" style={{ color: extendedMode ? '#c4b5fd' : 'rgba(255,255,255,0.4)' }} />
          </div>
          <div className="min-w-0">
            <span className="text-[12px] font-semibold text-white/90 block leading-tight">
              Modo Extendido · 60 segundos
            </span>
            <span className="font-mono text-[10px] text-white/45 truncate block">
              Variabilidad espectral HRV de alta resolución
            </span>
          </div>
        </div>

        {/* Interruptor tipo iOS con física suave */}
        <div
          className="flex h-6 w-11 shrink-0 items-center rounded-full p-0.5 transition-colors duration-300"
          style={{ background: extendedMode ? '#8b7cff' : 'rgba(255,255,255,0.14)' }}
        >
          <motion.div
            layout
            transition={{ type: 'spring', stiffness: 500, damping: 30 }}
            className="h-5 w-5 rounded-full bg-white shadow-md"
            style={{ marginLeft: extendedMode ? 'auto' : 0 }}
          />
        </div>
      </motion.button>

      {/* Botón Principal de Iniciar Medición */}
      <motion.button
        type="button"
        onClick={handleStart}
        whileHover={{ scale: 1.02 }}
        whileTap={{ scale: 0.97 }}
        className="group relative flex w-full items-center justify-center gap-2.5 overflow-hidden rounded-2xl py-4 text-[14px] font-bold text-[#021008] shadow-[0_16px_35px_-10px_rgba(0,255,136,0.7)] transition-all"
        style={{
          background: extendedMode
            ? 'linear-gradient(135deg, #c4b5fd, #8b7cff)'
            : 'linear-gradient(135deg, #00ff88, #00d977)',
        }}
      >
        {/* Shimmer light sweep */}
        <div className="pointer-events-none absolute inset-0 -translate-x-full animate-[shimmer_2.8s_infinite] bg-gradient-to-r from-transparent via-white/30 to-transparent" />
        <Play className="h-4 w-4 fill-current transition-transform group-hover:scale-110" />
        <span>Iniciar Medición</span>
      </motion.button>

      {/* Panel de Demo / Pruebas de Ritmo con Simulador */}
      <div className="mt-4 rounded-2xl border border-purple-500/25 bg-purple-950/20 p-3.5">
        <div className="flex items-center justify-between mb-2">
          <span className="flex items-center gap-1.5 font-mono text-[9px] uppercase tracking-[0.2em] text-purple-300">
            <Sparkles className="h-3 w-3 text-purple-400" />
            Demostración clínica · Sin cámara
          </span>
          <span className="font-mono text-[8px] text-purple-300/60 uppercase">
            Simulador
          </span>
        </div>

        {/* Selector de ritmo interactivo tipo chips */}
        <div className="flex flex-wrap gap-1.5 mb-3">
          {RHYTHMS.map((r) => {
            const active = demoRhythm === r.id;
            return (
              <motion.button
                key={r.id}
                type="button"
                onClick={() => handleRhythmSelect(r.id)}
                whileHover={{ scale: 1.04 }}
                whileTap={{ scale: 0.95 }}
                className="rounded-full border px-2.5 py-1 text-[11px] font-medium transition-all"
                style={{
                  borderColor: active ? '#a78bfa' : 'rgba(255,255,255,0.1)',
                  background: active ? 'rgba(167,139,250,0.3)' : 'rgba(255,255,255,0.03)',
                  color: active ? '#ffffff' : 'rgba(255,255,255,0.55)',
                  boxShadow: active ? '0 0 12px rgba(167,139,250,0.3)' : 'none',
                }}
              >
                {r.name}
              </motion.button>
            );
          })}
        </div>

        <motion.button
          type="button"
          onClick={handleStartDemo}
          whileHover={{ scale: 1.01 }}
          whileTap={{ scale: 0.98 }}
          className="flex w-full items-center justify-center gap-2 rounded-xl border border-purple-500/40 bg-purple-500/15 py-2.5 text-[12px] font-semibold text-purple-200 transition-colors hover:bg-purple-500/25"
        >
          <Waves className="h-4 w-4" />
          Probar simulador de ritmo ({RHYTHMS.find((r) => r.id === demoRhythm)?.name || 'Normal'})
        </motion.button>
      </div>
    </motion.div>
  );
}