/**
 * Hooks de resolución para `node --test`.
 * ─────────────────────────────────────────────────────────────
 * Vite resuelve `@/…` hacia `src/` y omite la extensión; Node no. Estos hooks
 * replican exactamente esa resolución para poder correr los tests del dominio
 * (detección, continuidad, morfología) sin bundler y sin dependencias extra.
 */
import { pathToFileURL } from 'node:url';

const base = pathToFileURL(`${process.cwd()}/src/`).href;
const exts = ['.js', '.jsx', '/index.js', '/index.jsx'];

export async function resolve(specifier, context, nextResolve) {
  const spec = specifier.startsWith('@/')
    ? new URL(specifier.slice(2), base).href
    : specifier;
  try {
    return await nextResolve(spec, context);
  } catch (err) {
    if (!spec.startsWith('file:')) throw err;
    for (const ext of exts) {
      try {
        return await nextResolve(spec + ext, context);
      } catch {
        // se prueba la siguiente extensión
      }
    }
    throw err;
  }
}
