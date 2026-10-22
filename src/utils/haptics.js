/**
 * Haptic Touch Engine — Web Vibration & Tactile Feedback
 * ─────────────────────────────────────────────────────────────
 * Brinda micro-interacciones táctiles reales sincronizadas con
 * la física de la interfaz y los latidos cardíacos.
 * Se degrada de forma segura e imperceptible si el dispositivo
 * no cuenta con hardware de vibración o permisos (ej. iOS Safari).
 * ─────────────────────────────────────────────────────────────
 */

export const HapticPattern = {
  LIGHT: 8,              // Micro-tick para hover o cambio de selector
  SELECTION: 12,         // Toque de selección / tab
  TAP: 16,               // Pulsación de botón estándar
  BEAT: 10,              // Latido cardíaco en tiempo real
  SUCCESS: [12, 35, 18], // Doble tick suave al confirmar calibración o guardado
  WARNING: [25, 40, 25], // Doble pulso al detectar arritmia o artefacto
  START: [20, 50, 30],   // Inicio de escaneo
  STOP: [20, 30],        // Parada
};

/**
 * Dispara una pulsación háptica de manera segura
 * @param {number | number[]} pattern Duración en ms o array de patrón [vibrar, pausar, vibrar]
 */
export function triggerHaptic(pattern = HapticPattern.TAP) {
  if (typeof window === 'undefined') return;
  try {
    if ('vibrate' in navigator && typeof navigator.vibrate === 'function') {
      navigator.vibrate(pattern);
    }
  } catch {
    // Silently continue on unsupported devices
  }
}
