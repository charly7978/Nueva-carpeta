// Registra los hooks de resolución de `@/` antes de que arranque el runner.
import { register } from 'node:module';

register('./node-alias-hooks.mjs', import.meta.url);
