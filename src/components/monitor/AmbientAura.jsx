import { useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

/**
 * AmbientAura — Iluminación volumétrica reactiva y partículas biométricas
 * ────────────────────────────────────────────────────────────────────────
 * Genera una atmósfera inmersiva de grado médico futurista detrás del HUD.
 * Pulsa de forma reactiva con cada latido detectado y conmuta su tonalidad
 * ante alertas de arritmias o estados de señal.
 * ────────────────────────────────────────────────────────────────────────
 */

const THEMES = {
  standby: {
    primary: 'rgba(139, 124, 255, 0.12)',
    secondary: 'rgba(0, 240, 255, 0.06)',
    accent: '#8b7cff',
  },
  live: {
    primary: 'rgba(0, 255, 136, 0.14)',
    secondary: 'rgba(0, 240, 255, 0.08)',
    accent: '#00ff88',
  },
  acquiring: {
    primary: 'rgba(251, 191, 36, 0.12)',
    secondary: 'rgba(245, 158, 11, 0.06)',
    accent: '#fbbf24',
  },
  recovering: {
    primary: 'rgba(34, 211, 238, 0.12)',
    secondary: 'rgba(139, 124, 255, 0.06)',
    accent: '#22d3ee',
  },
  artifact: {
    primary: 'rgba(245, 158, 11, 0.14)',
    secondary: 'rgba(239, 68, 68, 0.06)',
    accent: '#f59e0b',
  },
  alert: {
    primary: 'rgba(255, 51, 102, 0.22)',
    secondary: 'rgba(255, 0, 85, 0.14)',
    accent: '#ff3366',
  },
  error: {
    primary: 'rgba(239, 68, 68, 0.16)',
    secondary: 'rgba(185, 28, 28, 0.08)',
    accent: '#ef4444',
  },
};

export default function AmbientAura({ mode = 'standby', beatId = 0, isArrhythmia = false }) {
  const canvasRef = useRef(null);

  const themeKey = isArrhythmia ? 'alert' : THEMES[mode] ? mode : 'standby';
  const theme = THEMES[themeKey] || THEMES.standby;

  // Fondo con partículas sutiles flotantes (GPU Canvas ligero)
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let width = 0;
    let height = 0;
    let animId = 0;

    const resize = () => {
      width = canvas.width = window.innerWidth;
      height = canvas.height = window.innerHeight;
    };
    resize();
    window.addEventListener('resize', resize);

    const count = Math.min(28, Math.floor(window.innerWidth / 45));
    const particles = Array.from({ length: count }, () => ({
      x: Math.random() * width,
      y: Math.random() * height,
      vx: (Math.random() - 0.5) * 0.35,
      vy: (Math.random() - 0.5) * 0.35,
      radius: Math.random() * 1.5 + 0.8,
      alpha: Math.random() * 0.28 + 0.1,
    }));

    const render = () => {
      ctx.clearRect(0, 0, width, height);

      // Partículas
      for (let i = 0; i < particles.length; i++) {
        const p = particles[i];
        p.x += p.vx;
        p.y += p.vy;
        if (p.x < 0) p.x = width;
        if (p.x > width) p.x = 0;
        if (p.y < 0) p.y = height;
        if (p.y > height) p.y = 0;

        ctx.beginPath();
        ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255, 255, 255, ${p.alpha * 0.55})`;
        ctx.fill();

        // Enlaces moleculares tenues entre nodos cercanos
        for (let j = i + 1; j < particles.length; j++) {
          const p2 = particles[j];
          const dx = p.x - p2.x;
          const dy = p.y - p2.y;
          const distSq = dx * dx + dy * dy;
          if (distSq < 110 * 110) {
            const dist = Math.sqrt(distSq);
            ctx.beginPath();
            ctx.moveTo(p.x, p.y);
            ctx.lineTo(p2.x, p2.y);
            ctx.strokeStyle = `rgba(0, 240, 255, ${0.06 * (1 - dist / 110)})`;
            ctx.lineWidth = 0.6;
            ctx.stroke();
          }
        }
      }

      animId = requestAnimationFrame(render);
    };

    render();

    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener('resize', resize);
    };
  }, []);

  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden z-0">
      {/* Halo radial expansivo */}
      <motion.div
        animate={{
          background: `radial-gradient(ellipse 70% 55% at 50% 48%, ${theme.primary} 0%, ${theme.secondary} 45%, transparent 75%)`,
        }}
        transition={{ duration: 0.8, ease: 'easeInOut' }}
        className="absolute inset-0 filter blur-[70px] opacity-90"
      />

      {/* Pulso dinámico en cada latido cardíaco */}
      <AnimatePresence>
        {beatId > 0 && (
          <motion.div
            key={beatId}
            initial={{ scale: 0.85, opacity: 0.45 }}
            animate={{ scale: 1.35, opacity: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.65, ease: [0.16, 1, 0.3, 1] }}
            className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full filter blur-[50px] pointer-events-none"
            style={{
              width: 'min(90vw, 520px)',
              height: 'min(90vw, 520px)',
              background: `radial-gradient(circle, ${theme.primary} 0%, transparent 70%)`,
            }}
          />
        )}
      </AnimatePresence>

      {/* Cuadrícula de partículas sutiles */}
      <canvas ref={canvasRef} className="absolute inset-0 block h-full w-full opacity-65" />

      {/* Micro-textura de línea de barrido clínica */}
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.035]"
        style={{
          backgroundImage: 'linear-gradient(rgba(255,255,255,0.08) 1px, transparent 1px)',
          backgroundSize: '100% 4px',
        }}
      />
    </div>
  );
}
