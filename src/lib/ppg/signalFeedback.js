/** Guidance comes from capture/validation, not from red-channel pulse amplitude. */
export default function signalFeedback({ mode, fingerDetected, fingerConfidence, pulseAmbiguous,
  warmupProgress, simulated, signalIssue, hrHeld }) {
  if (mode === 'standby') return null;
  if (!simulated && !fingerDetected) return { key: 'finger', tone: 'warn', title: 'Apoya el dedo suavemente',
    detail: 'Cubre la cámara trasera y el flash sin apretar. Apoya la mano.' };
  const issues = {
    dark: ['Falta iluminación', 'Cubre también el flash; comprueba que esté encendido.'],
    clipped: ['Demasiada luz o presión', 'Afloja un poco el dedo sin descubrir la lente.'],
    contact: ['Ajusta el contacto', `Cubre toda la lente sin apretar · contacto ${fingerConfidence ?? 0}%.`],
    motion: ['Estabilizando la señal', 'Apoya la mano; no necesitas retirar ni recolocar el dedo.'],
    sampling: ['Esperando a la cámara', 'Mantén la app visible y cierra otras aplicaciones de cámara.'],
  };
  if (issues[signalIssue]) return { key: signalIssue, tone: 'warn', title: issues[signalIssue][0], detail: issues[signalIssue][1] };
  if (pulseAmbiguous) return { key: 'ambiguous', tone: 'warn', title: 'Comprobando el pulso',
    detail: 'La forma aún no es inequívoca. Mantén un contacto suave y quieto.' };
  if (hrHeld) return { key: 'recovering', tone: 'info', title: 'Recuperando la lectura',
    detail: 'El número atenuado es el último válido, no una nueva medición.' };
  if (warmupProgress < 1) return { key: 'warmup', tone: 'info', title: 'Ajustando la captura',
    detail: 'Mantén el dedo apoyado suavemente.', progress: warmupProgress };
  if (mode !== 'live') return { key: 'search', tone: 'info', title: 'Confirmando latidos',
    detail: 'La onda se muestra mientras comprobamos su calidad.' };
  return { key: 'locked', tone: 'ok', title: 'Pulso detectado', detail: 'Lectura orientativa · no sustituye un equipo médico.' };
}