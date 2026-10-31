# Plan: Robustez PPG frente a micro-movimiento (temblor)

## Objetivo (Fase 0)

Hacer que la medición PPG sobreviva a micro-movimientos (temblor, nervios, pulso tembloroso) sin perder exactitud, eliminando la causa exacta del corte actual: el estimador de calidad mide ruido de banda ancha sobre la señal CRUDA y se derrumba ante cualquier vibración fuera de la banda cardíaca, aunque el filtro ya la haya eliminado.

**Criterio de aceptación (medido por la sonda convertida en test permanente):** entre 0 % y 1 % de modulación por temblor, FC dentro de ±2 lpm de la verdad, `locked` ≥ 90 % del tiempo tras los primeros 12 s, cero reinicios de adquisición, y la suite actual de 32 tests sigue pasando sin cambios.

## Hallazgos de investigación (Fase 1)

### H1 — Causa raíz verificada (instrumentación del pipeline)
- `pulseNoise()` (src/lib/ppg/pulseNoise.js) estima ruido como curvatura de segundo orden y residuo de ciclo sobre la señal **cruda** (`signalQuality.assessChannel` le pasa `bufX`).
- El temblor de 5–11 Hz infla ambos términos linealmente con su amplitud: `snr` cae 7.87 → 2.28 → 1.01 → 0.38 cuando la amplitud sube 0 → 0.1 → 0.2 → 0.6.
- `viable` exige `snr ≥ 2.5` (o ≥ 2 en histéresis) en signalQuality.js. Con 0.28 % de modulación el SNR ya es 2.28: el canal deja de ser viable.
- `sigOk` (pipeline._grid) incluye `evidence[sel].viable`. Sin evidencia viable, todos los fotogramas se empujan al tracker como inválidos (`V=0`): 1141 de 1201 muestras no-ok en la sonda.
- `beatTracker._checkPeak` exige `V=1` en la vecindad ±2 del pico y entre pie y pico; sin muestras válidas no hay ningún latido. `validCount=0` para siempre, `cv=1`.
- `getState` añade el golpe final: `gate` incluye `sigOk` y `stale` se dispara con que la última muestra sea imperfecta.
- Fuente: instrumentación propia (scripts/tremor-probe.mjs, tremor-signal.mjs, tremor-diag.mjs), confirmada.

### H2 — La señal útil ya es correcta
- Con 0.56 % de modulación por temblor la señal **ya filtrada** conserva correlación 0.968 con el pulso limpio de referencia, misma energía en banda cardíaca (0.0021 en todos los casos) y todo el residuo estrictamente por encima de 3.5 Hz (0.00062 → 0.00084 → 0.00182).
- Fuente: sonda propia (tremor-signal.mjs).

### H3 — Segundo defecto: candidatos espurios al abrir el gate
- Con `forceOk` aparecen 42 "latidos" en 25 s con señal limpia (verdad: 30) y 91 con temblor 0.28 %.
- Un artefacto *periódico* pasa el filtro de forma (`q`) y el de intervalos regulares (`cv = 0.05`) produciendo tasa falsa de 2–3× (144–218 lpm equivalentes).
- Hoy sólo lo evita la comprobación armónica de `getState`, que a su vez está detrás del gate roto.
- Fuente: sonda propia (tremor-probe.mjs).

### H4 — Literatura: fiducial point para timing de latidos
- Hemon & Phillips (2010, City University London): el punto de **amplitud media** (middle-amplitude) y el cruce del máximo gradiente son los más adecuados para PRV; el pico (máximo) introduce sesgo dependiente de rigidez arterial.
- Eerikäinen et al. (IEEE EMBC 2014): el método de **máxima primera derivada** produce los menores errores de período cardíaco frente a ECG (r²=0.987 para PPG).
- Zaguan (Universidad de Zaragoza): nM (middle-amplitude), n*A (ápice de primera derivada) y nT (tangentes) son los puntos más adecuados; el ápice y el pie son menos precisos.
- Conclusión: el cruce del 50 % de la prominencia en la subida (middle-amplitude) es una elección validada por la literatura para la base de RR.
- Fuente: [1] Hemon & Phillips, "Earlobe photoplethysmography", City University; [2] Eerikäinen et al., IEEE EMBC 2014; [3] "Optimal Fiducial Points for Pulse Rate Variability", Zaguan.

### H5 — Literatura: artefactos de movimiento en PPG
- Charlton et al. (2022), "Detecting beats in the photoplethysmogram: benchmarking open-source algorithms", Physiol. Meas. — compara 15 detectores vs ECG en 8 conjuntos; rendimiento dependiente de movimiento y ritmo, sin detector universal.
- Mather et al. (2024), Frontiers Digital Health — concordancia principalmente en condiciones controladas.
- Movimiento periódico puede confundirse con cadencia y no se resuelve de forma general con filtrado de banda (review Sensors 2023, "Photoplethysmographic sensors, potential and limitations").
- Conclusión: medir el temblor como componente fuera de banda (4.5–12 Hz) y degradar confianza gradualmente es un enfoque consistente con la literatura; no se promete inmunidad a artefactos periódicos indistinguibles.
- Fuente: [4] Charlton et al. 2022; [5] Mather et al. 2024; [6] Sensors 2023 review.

### H6 — Literatura: MAD y escala robusta
- El factor 1.4826 convierte MAD a desviación estándar equivalente para distribución normal. Es el estándar (Hampel, Leys et al. 2013).
- El código existente ya usa `1.4826 · MAD` en `pulseNoise.js` y `hampelFilter`. Consistente.

### H7 — Literatura: filtros RBJ biquad
- Los biquads RBJ (Robert Bristow-Johnson) son el estándar de facto para filtros IIR de segundo orden en tiempo real. El código existente ya los usa en `streamFilter.js` (designLowpass, designHighpass).
- La cascada pasabanda 4.5–12 Hz se implementa como HP 4.5 + LP 12, dos biquads. Consistente con el patrón existente.

## Decisiones técnicas (Fase 2)

### D1 — Qué se mide como ruido
- **Decisión:** medir ruido EN BANDA cardíaca (sobre señal filtrada) para `snr`, y ruido FUERA de banda (rama 4.5–12 Hz) para `tremorRatio`.
- **Justificación:** H1 muestra que el ruido de banda ancha (curvatura de 2º orden) se infla por vibración fuera de banda. La señal filtrada ya elimina esa vibración; medir ruido sobre ella separa "el pulso no se distingue" de "el dedo vibra".
- **Descartado:** mantener `pulseNoise` sobre crudo (causa raíz del bug); usar FFT de banda ancha (no distingue banda).

### D2 — Qué invalida una muestra
- **Decisión:** separar `sigOk` (estructural: ready, samplingOk, contact, usable, escala mínima, sin modo común, hz>0) de `qualityOk` (viable && !commonMode). `ok` del tracker = `sigOk && !gross`; `weight` = calidad.
- **Justificación:** H1 muestra que mezclar calidad (SNR) con validez de base de tiempo hace que el gate se cierre por temblor. Separar permite que el tracker siga funcionando con muestras ponderadas.
- **Descartado:** mantener `viable` en `sigOk` (causa del corte); invalidar por temblor (degrada sin necesidad).

### D3 — Quién arbitra la tasa
- **Decisión:** `_resolveLobe()` compara tasa de intervalos con `hintHz` (espectro). Si intervalos ≈ 2× hintHz durante ≥4 intervalos y evidencia fuerte (strength ≥0.7), marca `harmonic='double'`, descarta un latido de cada dos para FC (nunca para morfología/ritmo) y expone `hrFromSpectrum`.
- **Justificación:** H3 muestra que el detector emite candidatos espurios periódicos que pasan filtros de forma e intervalos. El espectro es la referencia independiente.
- **Descartado:** bloquear taquicardia real (donde hintHz también sube); usar sólo intervalos (no detecta armónico); usar sólo espectro (menos preciso en tiempo).

### D4 — Tiempo de latido
- **Decisión:** usar cruce del 50 % de la prominencia en la subida (`tm`) como base de todos los RR; conservar ápice (`t`) para morfología, fiduciales y dibujo.
- **Justificación:** H4 confirma que el punto de amplitud media es el más preciso para PRV. El ápice depende de rigidez arterial y presión.
- **Descartado:** usar ápice para RR (introduce variabilidad); usar pie (más sensible a ruido de base).

### D5 — Guardia de artefactos graduada
- **Decisión:** niveles 0/1/2. Sólo nivel 2 fija cuarentena. Nunca extender `until` si ya está en cuarentena. Umbral adaptativo aprende sólo en nivel 0, techo 8 %.
- **Justificación:** H1 muestra que la cuarentena perpetua (`if (bad) this.until = t + 0.6`) es un bug. Un usuario nervioso no debe autoencerrarse.
- **Descartado:** booleano (actual); extender cuarentena (bug).

### D6 — Cambio de canal / saltos de DC
- **Decisión:** en saltos de DC > 15 %, re-siembra `base[c]`, marca frontera (`tracker.markBoundary`), sigue. En cambio de canal: `markBoundary` + `resetTemplate` (no `dropAcquisition`).
- **Justificación:** el cambio de canal actual reinicia toda la adquisición (costa 7 latidos). La nueva approach recupera en 2 latidos.
- **Descartado:** `dropAcquisition` completo (costoso); no hacer nada (fase distinta).

## Opciones descartadas (Fase 2)

1. **Reescribir la arquitectura completa** — descartado: la arquitectura actual (filtro causal, tracker en flujo, evidencia espectral independiente) es correcta; el bug es de tres decisiones concretas.
2. **Añadir acelerómetro / referencia de movimiento** — descartado: el proyecto es web (cámara de teléfono), no hay acelerómetro fiable en todos los dispositivos; la rama de temblor (4.5–12 Hz) es la alternativa sin hardware adicional.
3. **Filtrar el temblor de la señal de detección** — descartado: el temblor está fuera de banda cardíaca (5–11 Hz vs 0.5–3.5 Hz); el filtro cardíaco ya lo elimina. El problema es la *medición de calidad*, no la señal.
4. **Usar filtfilt (cero-fase) para la rama de temblor** — descartado: el proyecto usa filtros causales con estado (nunca filtfilt en vivo) para evitar reescribir el pasado. La rama de temblor sigue el mismo patrón.
5. **Reducir umbrales de SNR** — descartado: relajar umbrales degradaría la calidad; la solución es medir el ruido correcto, no bajar la barra.

## Diseño (Fase 3)

### Arquitectura
No se reescribe la arquitectura. Se reparan tres decisiones concretas:
1. **Qué se mide como ruido** (bandNoise.js + assessChannel)
2. **Qué invalida una muestra** (pipeline gate de dos niveles)
3. **Quién arbitra la tasa** (beatTracker._resolveLobe)

Se añade una rama de frecuencia dedicada (4.5–12 Hz) que mide el temblor de forma ortogonal al pulso, para degradar la confianza gradualmente.

### Tipos (JSDoc, no TypeScript nuevo)
- `ChannelEvidence` ampliado: `snr` (en banda), `snrBroad` (informativo), `tremorRatio`, `noiseInBand`, `noiseOutBand`.
- `NoiseSplit`: `{ inBand, outBand, tremor }`.
- `Beat` ampliado: `tm` (cruce de subida), `noise` (fracción baja confianza), `w` (peso).
- `ArtifactLevel`: `0|1|2`.

### Archivos
**Nuevos:**
- `src/lib/ppg/bandNoise.js` — descomposición de ruido en banda/fuera de banda. Funciones puras, sin estado, sin dependencias del pipeline (importa `median`/`mean` de `@/lib/dsp`).
- `src/lib/ppg/tremor.test.js` — suite de regresión con el modelo de temblor de la sonda. Se añade a `npm test`.

**Modificados:**
- `src/lib/ppg/signalQuality.js` — `assessChannel` acepta `noise` (último parámetro, opcional). `viable`: `snr ≥ 2.2 && tremorRatio ≤ 1.2 && concentration ≥ 0.4 && ac.strength ≥ 0.3` (histéresis: 1.8 / 1.6 / 0.3). `score` se multiplica por `1/(1+1.5*tremorRatio)`. Exporta `MIN_TREMOR_RATIO = 1.2`.
- `src/lib/ppg/pipeline.js` — cascada de temblor, gate de dos niveles, `_sampleVerdict`, `_dropSignal` no destructivo, cambio de canal no destructivo, saltos de DC re-siembra base.
- `src/lib/ppg/beatTracker.js` — `push(t, y, ok, scale, weight)`, `W[]`, `markBoundary`, `resetTemplate`, `_upstrokeCross`, `_resolveLobe`, `tm` para RR, `stale` por tiempo.
- `src/lib/ppg/artifactGuard.js` — niveles 0/1/2, no extensión de cuarentena, techo 8 %.
- `src/lib/ppg/streamFilter.js` — `designTremorFilter(fs)`: pasabanda 4.5–12 Hz.
- `src/lib/ppg/rateDisplay.js` — pendiente 5 lpm/s, retención 3.5 s.
- `package.json` — añadir `tremor.test.js` a `test`.

**Temporales a eliminar al terminar:** `scripts/tremor-probe.mjs`, `scripts/tremor-diag.mjs`, `scripts/tremor-signal.mjs`.

**No cambian:** `RateDisplay` API, `TraceStore`, `PPGEngine`, `getState()` (sólo se añade `stableSeconds` y `tremor` informativos).

### Funciones nuevas
```js
// bandNoise.js
export function bandNoise({ filtered, tremorScale, lagSamples, signalScale, fs })
// → { inBand, outBand, tremor }
// inBand  = 1.4826 · MAD(f[i] − f[i−lag]) / √2, con lag interpolado;
//           si no hay lag: 1.4826 · MAD(f[i] − 2f[i−1] + f[i−2]) / √6
// outBand = max(0, tremorScale − 0.15 · inBand)
// tremor  = outBand / max(1e-9, signalScale)
// Propiedad: con temblor 0–1 %, inBand no varía más de ±15 % y tremor crece monótonamente.

// streamFilter.js
export function designTremorFilter(fs)  // [designHighpass(4.5, fs), designLowpass(12, fs)]

// beatTracker.js
markBoundary(t)                          // → void; fija invalidAt = t
resetTemplate()                          // → void
_upstrokeCross(p, footIdx, troughValue, peakValue)  // → number (s)
_resolveLobe(kept)                       // → { factor: 1|2, confidence: number }

// pipeline.js
_sampleVerdict(t)                        // → { valid: boolean, weight: number, level: 0|1|2 }
```

### Funciones modificadas
```js
// signalQuality.js
export function assessChannel(rawSamples, filteredSamples, scale, fs, usable,
  previous = null, noise = null)
// noise = { inBand, outBand, tremor }. Sin noise se comporta como hoy.
// snr = scale / max(3e-5, noise?.inBand ?? noiseLegacy)
// tremorRatio = noise?.tremor ?? 0
// viable: snr ≥ 2.2 (hist. 1.8) && tremorRatio ≤ 1.2 && concentration ≥ 0.3/0.4
//         && strength ≥ 0.2/0.3 && !ambiguous
// score = value · 1/(1 + 1.5·tremorRatio), suavizado como hoy

// beatTracker.js
push(t, y, ok = true, scale = 1, weight = 1)
// weight se guarda en W[]; ok invalida (V=0) sólo por base de tiempo.
// _checkPeak exige V=1 en ±2 (igual), pero el rechazo por muestras inválidas
//   entre pie y pico pasa a umbral: > 20 % ⇒ rechaza; ≤ 20 % ⇒ acepta y marca noise.

// artifactGuard.js
update(t, rgb, usable, spatial, contact, selected) // → number (0|1|2)
// Se mantiene this.bad y this.disturbed por compatibilidad con pipeline.

// pipeline.js
_analyzeChannels(t)   // calcula noise y lo pasa a assessChannel
getState()            // gate = sigOk && qualityOk; añade stableSeconds y tremor
```

### Orden de implementación (dependencias explícitas)
1. **Rama de temblor** — `streamFilter.js`: `designTremorFilter`. `pipeline.js`: `tremorFilters`/`tremorHist`, alimentación con muestra limpia en `_grid`, `tremorScale[c]` en bloque `count % 6`. Verificación: ningún otro consumidor cambia; `npm test` verde.
2. **Descomposición de ruido** — crear `bandNoise.js`. Tests: (a) sinusal limpia → tremor≈0, inBand estable; (b) sinusal + 1 % a 5.3/7.9/11.2 Hz → inBand varía <15 %, tremor >0.5; (c) ruido blanco → inBand sube proporcionalmente.
3. **Calidad en banda** — `assessChannel` acepta `noise`. `_analyzeChannels` lo construye. Verificación: matriz de la sonda deja de cerrar el gate hasta ~1 %; 32 tests verdes (si alguno cae, ajustar `MIN_TREMOR_RATIO`, nunca relajar concentration/strength).
4. **Gate de dos niveles** — `_sampleVerdict` devuelve `{valid, weight, level}`; `sigOk` deja de incluir `viable`; nuevo `qualityOk`; `ok`/`weight` al tracker; `drawn` depende de `level < 2`. Verificación: `notOk` pasa de 95 % a <5 % con 0.56 % temblor.
5. **Tracker ponderado y base de tiempo no destructiva** — `W[]`, `push(..., weight)`, `markBoundary`, `resetTemplate`, sin vaciados de `pending`/`outliers` por muestra aislada, `stale` por tiempo. Verificación: recuperación tras hueco <4 s (`continuity.test.js`).
6. **Tiempo de latido por cruce de subida** — `_upstrokeCross` y uso de `tm` para todos los RR. Ápice `t` se conserva para morfología/fiduciales/dibujo. Verificación: `morphology.test.js` intacto; en sonda, desviación típica de RR con 0.56 % temblor baja ≥40 %.
7. **Arbitraje de armónico** — `_resolveLobe` + `harmonic` en snapshot; `getState` consume del tracker. Verificación: `measurement.test.js` "irregular fallback cannot publish a double-rate conflict" verde; nueva prueba: pulso 72 + temblor periódico nunca publica >76.
8. **Guardia de artefactos graduada** — niveles, no extensión de cuarentena, techo 8 %, aprendizaje sólo en nivel 0. Verificación: `continuity.test.js` (`blip`, `gap`, `remove`) intacto; nueva prueba: 3 s temblor continuo sin `_dropSignal`.
9. **`_dropSignal` y cambio de canal no destructivos** — re-siembra de `base` en saltos DC >15 %, `markBoundary` en cambios de canal. Verificación: en sonda, `resets` = 0 de 0 % a 1 % temblor.
10. **Presentación** — `rateDisplay` 5 lpm/s y retención 3.5 s; `stableSeconds` y `tremor` expuestos en `getState`.
11. **Consolidar la sonda como test** — `tremor.test.js` con modelo exacto de `scripts/tremor-*.mjs`; añadir a `package.json`. Ejecutar `npm test`, `npm run lint`, `npm run build`. Borrar los tres scripts temporales.

### Reglas de estilo (impuestas por código existente)
- Filtros causales con estado (nunca `filtfilt` sobre ventana en vivo).
- Nada de latidos sintéticos.
- Nada de umbrales "mágicos" sin constante nombrada.
- Comentarios en español explicando el *porqué* fisiológico.

## Tests (Fase 5)

### Nuevo `src/lib/ppg/tremor.test.js`
Modelo: `I_c(t) = DC_c · (1 − pulso) · (1 + 0.028·d(t)) · (1 + ruido)`, `d(t)` = suma de 5.3/7.9/11.2 Hz.

1. `micro-temblor 0–1 % conserva la FC` — amplitud ∈ {0, 0.05, 0.1, 0.2, 0.35}, FC ∈ {54, 72, 100}: `state.hr` dentro de ±2 lpm, `locked` ≥90 % posteriores a t=12 s, `resets === 0`.
2. `la calidad no baja con temblor leve` — `sqi` con amplitud 0.1 ≥ 0.9 × `sqi` con amplitud 0.
3. `nunca publica el doble de la tasa real` — amplitud 0.2, FC 72: ningún `hr` publicado >76 ni <68 en 40 s.
4. `jitter de marca de tiempo ±6 ms no altera nada` — mismos resultados que sin jitter.
5. `temblor grueso degrada, no miente` — amplitud 1.0: o `hr == null`, o `|hr − 72| ≤ 4`.
6. `no hay pérdida de adquisición` — contador de `_dropSignal` instrumentado = 0 durante 20 s con amplitud 0.2.
7. `el temblor fuera de banda no entra en la señal` — propiedad de `bandNoise`: `inBand` con 1 % temblor ≤ 1.15 × `inBand` sin temblor.

### Ampliaciones
- `measurement.test.js`: `lobe arbitration never halves a genuine tachycardia` (FC 160 + lóbulo secundario → se publica 160, no 80).
- `continuity.test.js`: `channel switch keeps interval history` (cambio de canal a los 15 s → vuelve a `locked` en ≤3 latidos).
- `morphology.test.js`: sin cambios (control de que el tiempo por cruce de subida no altera fiduciales).

### Casos límite
FC 54/72/100/160; reflexión diastólica 0/0.3/0.9; amplitudes de temblor 0–1.7 %; jitter ±6 ms; canales r/g/b con recorte individual; hueco de 100 ms; retirada de dedo.

### Rendimiento
Rama de temblor: 6 biquads por muestra (≈60 operaciones) + `robustScale` cada 6 muestras. `bandNoise`: mediana sobre ≤240 muestras dos veces por segundo. Coste despreciable frente a `powerSpectrum` (ya corre a 1 Hz). Sin asignaciones nuevas por fotograma salvo el objeto de evidencia (ya existente).

## Riesgos y mitigaciones

| Riesgo | Mitigación |
|---|---|
| `MIN_TREMOR_RATIO` demasiado estricto → rechaza pulsos válidos | Ajustar constante nombrada, nunca relajar concentration/strength |
| `_resolveLobe` bloquea taquicardia real | Condición exige hintHz que también sube en taquicardia; test explícito FC 160 |
| Cambio de `tm` rompe fiduciales | Ápice `t` se conserva para morfología/dibujo; morphology.test.js como control |
| Cuarentena perpetua (bug actual) | Nunca extender `until` si ya está en cuarentena |
| Rama de temblor introduce latencia | Filtro causal con estado, sin filtfilt; latencia inherente del biquad (aceptable) |
| Tests existentes caen | Sin cambios en contratos públicos; `assessChannel` sin `noise` se comporta como hoy |

## Verificación final (Fase 5)
1. `npm test` (32 actuales + nuevas) — todo verde.
2. `npm run lint` — sin errores.
3. `npm run build` — producción OK.
4. `node --import ./scripts/register-alias.mjs scripts/tremor-probe.mjs` — `steady% ≥ 90` y `maxErr ≤ 2` para amplitudes 0–0.35.
5. Borrar los tres scripts temporales.

## Cierre (Fase 6)
- Documentar resultado, decisiones y aprendizaje.
- Indicar literatura consultada (H4, H5, H6, H7) y cuál fue decisiva (H1 causa raíz, H4 fiducial point).
- Entregar únicamente cuando todas las verificaciones estén en verde.

## Notas de implementación
- El proyecto es JS con JSDoc (no TypeScript). Tipado vía JSDoc.
- Comandos: `npm run typecheck`, `npm run lint`, `npm run test`, `npm run build`.
- Rama por defecto: main. Flujo: commit + push a main.
- Tests usan `node --test` con `register-alias.mjs` para alias `@/`.
