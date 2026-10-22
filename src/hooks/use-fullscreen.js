import { useState, useEffect, useCallback } from 'react';

const current = () => document.fullscreenElement || /** @type {any} */ (document).webkitFullscreenElement || null;

/** Pantalla completa del documento (no disponible en iPhone: ahí se usa «Añadir a inicio») */
export function useFullscreen() {
  const [isFullscreen, setIsFullscreen] = useState(false);
  const root = typeof document !== 'undefined' ? document.documentElement : null;
  const supported = !!root && !!(root.requestFullscreen || /** @type {any} */ (root).webkitRequestFullscreen);

  useEffect(() => {
    const sync = () => setIsFullscreen(!!current());
    document.addEventListener('fullscreenchange', sync);
    document.addEventListener('webkitfullscreenchange', sync);
    return () => {
      document.removeEventListener('fullscreenchange', sync);
      document.removeEventListener('webkitfullscreenchange', sync);
    };
  }, []);

  const enter = useCallback(() => {
    if (!supported || current()) return;
    const req = root.requestFullscreen || /** @type {any} */ (root).webkitRequestFullscreen;
    Promise.resolve(req.call(root)).catch(() => {});
  }, [root, supported]);

  const exit = useCallback(() => {
    if (!current()) return;
    const out = document.exitFullscreen || /** @type {any} */ (document).webkitExitFullscreen;
    Promise.resolve(out.call(document)).catch(() => {});
  }, []);

  const toggle = useCallback(() => (current() ? exit() : enter()), [enter, exit]);

  return { isFullscreen, supported, enter, exit, toggle };
}