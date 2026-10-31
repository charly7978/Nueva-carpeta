# Implementation Plan

[Overview]
Hacer que la medición PPG sobreviva a micro-movimientos (temblor, nervios, pulso tembloroso) sin perder ni un ápice de exactitud, eliminando la causa exacta del corte actual: el estimador de calidad mide ruido de banda ancha sobre la señal CRUDA y, por tanto, se derrumba ante cualquier vibración fuera de la banda cardíaca, aunque el filtro ya la haya eliminado.

Medición de partida (sonda `scripts/tremor-probe.mjs` y `scripts/tremor-signal.mjs`, 72 lpm, 30 fps, 40 s):

| modulación DC | estado final | % bloqueado | HR publicado |
|---|---|---|---|
| 0 % | locked | 100 % | correcto |
| 0.14 % | locked | 100 % | correcto |
| 0.28 % | searching | 3.5 % | 7 muestras, luego nada |
| 0.56 % | searching | 0 % | nunca |
| 1 % | searching | 0 % | nunca |

Y sin embargo, con 0.56 % de modulación por temblor la señal **ya filtrada** conserva una correlación de 0.968 con el pulso limpio de referencia, con la misma energía en banda cardíaca (0.0021 en todos los casos) y todo el residuo estrictamente por encima de 3.5 Hz (0.00062 → 0.00084 → 0.00182). Es decir: **la señal útil es correcta y la aplicación la está tirando a la basura**.

La cadena de destrucción, verificada instrumentando el pipeline:

1. `pulseNoise()` estima ruido como curvatura de segundo orden y residuo de ciclo sobre la señal **cruda** (`signalQuality.assessChannel` le pasa `bufX`). El temblor de 5–11 Hz infla ambos términos de forma lineal con su amplitud: `snr` cae 7.87 → 2.28 → 1.01 → 0.38 cuando la amplitud sube 0 → 0.1 → 0.2 → 0.6.
2. `viable` exige `snr ≥ 2.5` (o ≥ 2 en histéresis) en `signalQuality.js`. Con 0.28 % de modulación el SNR ya es 2.28: el canal deja de ser viable.
3. `sigOk` (`pipeline._grid`) incluye `evidence[sel].viable`. Sin evidencia viable, **todos** los fotogramas se empujan al tracker como inválidos (`V=0`): 1141 de 1201 muestras no-ok en la sonda.
4. `beatTracker._checkPeak` exige `V=1` en la vecindad ±2 del pico y entre pie y pico; sin muestras válidas no hay ningún latido. `validCount=0` para siempre, `cv=1`.
5. `getState` añade el golpe final: `gate` incluye `sigOk` y `stale` se dispara con que la última muestra sea imperfecta. De ahí el "se entrecorta": el número desaparece, la traza se corta y el estado vuelve a `searching`/`artifact` aunque la onda esté perfectamente medida.

Al abrir artificialmente ese gate (`forceOk`) aparece el **segundo defecto**, que hay que arreglar en el mismo trabajo porque de lo contrario la solución degradaría la calidad: el detector de latidos emite candidatos espurios (42 "latidos" en 25 s con señal limpia cuando la verdad son 30; 91 con temblor de 0.28 %), y un artefacto *periódico* pasa el filtro de forma (`q`) y el de intervalos regulares (`cv = 0.05`) produciendo una tasa falsa de 2–3× (144–218 lpm equivalentes). Hoy sólo lo evita la comprobación armónica de `getState`, que a su vez está detrás del gate roto. Por tanto: abrir el gate **exige** arbitraje espectral de la tasa.

El enfoque no reescribe la arquitectura —que ya es correcta (filtro causal, tracker en flujo, evidencia espectral independiente)—, sino que repara tres decisiones concretas: **qué se mide como ruido**, **qué invalida una muestra** y **quién arbitra la tasa cuando los intervalos y el espectro discrepan**. Se añade una rama de frecuencia dedicada (4.5–12 Hz) que mide el temblor de forma ortogonal al pulso, para degradar la confianza de forma gradual en lugar de cerrar la puerta.

Criterio de aceptación (medido por la misma sonda, convertida en test permanente): entre 0 % y 1 % de modulación por temblor, FC dentro de ±2 lpm de la verdad, `locked` ≥ 90 % del tiempo tras los primeros 12 s, cero reinicios de adquisición, y la suite actual de 32 tests sigue pasando sin cambios.

[Types]
Se amplía el contrato de evidencia y de muestra del tracker; no se introduce ningún tipo nuevo de dominio (el proyecto es JS con JSDoc).

```js
// signalQuality.assessChannel → objeto de evidencia (ampliado)
/** @typedef {Object} ChannelEvidence
 * @property {number} score          confianza 0..1 (ya existe)
 * @property {number} strength       autocorrelación del período (ya existe)
 * @property {number} hz             frecuencia cardíaca medida (ya existe)
 * @property {number} snr            AHORA: relación señal/ruido EN BANDA cardíaca
 * @property {number} snrBroad       SNR de banda ancha (informativo, ya no decide)
 * @property {number} tremorRatio    NUEVO: ruido 4.5–12 Hz / amplitud del pulso (0 = quieto)
 * @property {number} noiseInBand    NUEVO: ruido en banda (AC/DC) usado por snr
 * @property {number} noiseOutBand   NUEVO: ruido fuera de banda (AC/DC)
 * @property {number} concentration  concentración espectral (ya existe)
 * @property {boolean} viable        AHORA: exige snrEnBanda y tremorRatio acotado
 * @property {boolean} ambiguous     (ya existe)
 * @property {boolean} lobed         (ya existe)
 */

// bandNoise.bandNoise → descomposición de ruido (función pura, testeable)
/** @typedef {Object} NoiseSplit
 * @property {number} inBand    desviación robusta del residuo de ciclo sobre la señal FILTRADA
 * @property {number} outBand   desviación robusta del residuo fuera de banda
 * @property {number} tremor    índice de temblor normalizado (outBand / amplitud en banda)
 */

// beatTracker.push → nueva firma
//   push(t, y, ok = true, scale = 1, weight = 1)
// `ok`      validez de BASE DE TIEMPO (hueco, dedo, recorte, salto común). Sólo esto invalida muestras.
// `weight`  confianza 0..1 por calidad (temblor, SNR en banda). No invalida; pondera.
/** @typedef {Object} Beat    (campos añadidos)
 * @property {number} tm      instante del cruce del 50 % en la subida (base de los RR)
 * @property {number} noise   fracción 0..1 de muestras de baja confianza entre pie y pico
 * @property {number} w       peso del intervalo (0..1) derivado de q y noise
 */

// artifactGuard.update → veredicto graduado en vez de booleano
/** @typedef {0|1|2} ArtifactLevel  0 = limpio, 1 = micro (temblor), 2 = grueso (estructural) */
```

No cambian `RateDisplay.update`, `TraceStore`, `PPGEngine` ni la forma de `getState()` (sólo se añade `stableSeconds` y `tremor` como campos informativos para la UI).

[Files]
Ocho archivos: dos nuevos, seis modificados, ninguno eliminado.

**Nuevos**

- `src/lib/ppg/bandNoise.js` — descomposición de ruido en banda / fuera de banda. Funciones puras, sin estado, sin dependencias del pipeline (importa `median`/`mean` de `@/lib/dsp`). Es el núcleo del arreglo: separa "el pulso no se distingue" de "el dedo vibra".
- `src/lib/ppg/tremor.test.js` — suite de regresión con el modelo de temblor de la sonda (micro-movimiento multiplicativo 5–11 Hz, 0–1.7 % de DC, jitter temporal ±6 ms, tres frecuencias cardíacas y dos canales). Se añade a `npm test`.

**Modificados**

- `src/lib/ppg/signalQuality.js`
  - `assessChannel` recibe un parámetro nuevo `noise` (`NoiseSplit`) calculado por el pipeline; usa `noise.inBand` para `snr` y `noise.tremor` para `tremorRatio`.
  - `viable` pasa a `snr ≥ 2.2 && tremorRatio ≤ 1.2 && concentration ≥ 0.4 && ac.strength ≥ 0.3` (histéresis: 1.8 / 1.6 / 0.3).
  - `score` se multiplica por un factor suave `1 / (1 + 1.5 * tremorRatio)` en vez de anularse; se conserva el suavizado `0.65·anterior + 0.35·nuevo` y se añade un segundo suavizado sobre `tremorRatio`.
  - Se exporta `MIN_TREMOR_RATIO = 1.2` y `MAX_TREMOR_CONFIDENCE_PENALTY` como constantes nombradas.

- `src/lib/ppg/pipeline.js`
  - Constructor: nueva cascada por canal `this.tremorFilters = CH.map(() => new BiquadCascade(designTremorFilter(FS)))` y sus buffers `this.tremorHist = CH.map(() => new RingBuffer(FS * 3))`.
  - `_grid`: alimenta la rama de temblor con la MISMA muestra limpia (`this._cleanSample`) y, en la ventana de análisis de 5 Hz (`count % 6`), calcula `this.tremorScale[c] = robustScale(this.tremorHist[c].tail(FS * 2))`.
  - `_analyzeChannels`: construye `noise` con `bandNoise({ raw, filtered, lagSamples, inBand, outBand })` y lo pasa a `assessChannel`.
  - `sigOk` se parte en dos: `this.sigOk` (estructural: ready, samplingOk, contact, usable, escala mínima, sin modo común, `evidence.hz > 0`) y `this.qualityOk` (`evidence.viable && !commonMode`). `ok` del tracker = `sigOk && !gross`; `weight` = `qualityOk ? clamp(1 - 0.6*tremorRatio, 0.25, 1) : 0.3`.
  - `_dropSignal`: NO borrar `tracker.beats`/`ibis` cuando la causa es micro-movimiento; se conserva la variante completa sólo para pérdida estructural (dedo, hueco, canal nuevo).
  - `_grid` `steps` (salto de DC > 15 %): en vez de `_dropSignal` completo, re-siembra `base[c]` con la muestra actual, marca frontera (`tracker.markBoundary(t)`) y sigue. Un deslizamiento del dedo deja de costar 7 latidos.
  - Trazado: `drawn` pasa a depender sólo de `gross`, no de `disturbed`.
  - `getState`: `gate` usa `sigOk && qualityOk`; `cleanSeconds` sigue siendo estricto (es el que autoriza el informe clínico) y se añade `stableSeconds` (tiempo desde `cleanSince` sin exigir calidad), `tremor` (0..1 para la UI).
  - Cambio de canal: en vez de `tracker.dropAcquisition()`, `tracker.markBoundary(t)` + `tracker.resetTemplate()`. Recuperar tarda 2 latidos en lugar de 7.

- `src/lib/ppg/beatTracker.js`
  - `push(t, y, ok, scale, weight)` guarda `W[i]` (Float32Array) además de `V[i]`.
  - `markBoundary(t)`: fija `invalidAt = t`, no borra latidos ni intervalos; los intervalos que lo cruzan quedan `sus` (ya existe el mecanismo).
  - `resetTemplate()`: sólo `template`, `prevWin`, `badRun`.
  - Tiempo de latido: nuevo `_upstrokeCross(p, troughValue, peakValue, footIdx)` que devuelve el instante del cruce del 50 % de la prominencia, interpolado linealmente. El latido guarda `t` (ápice, para morfología y fiduciales) y `tm` (cruce de subida, **base de todos los RR**).
  - `noise` por latido: fracción de muestras con `W < 0.5` entre `footIdx` y `p.idx`; `beat.w = clamp(q * (1 - 0.7*noise), 0.2, 1)`.
  - `_updateHR`: estimación robusta ponderada — mediana ponderada de los últimos 8 intervalos, `kept` por desviación ≤ 20 %, `hrIbi = 60 / mediaPonderada(últimos 5)`. `locked` exige `kept.length ≥ 4` (baja de 5) y `cv < 0.14` (sube de 0.12) con `shape ≥ 0.75`.
  - Arbitraje de armónico (nuevo `_resolveLobe()`): si `hintHz > 0` y la tasa de intervalos es ≈ 2× `hintHz` (±12 %) durante ≥ 4 intervalos consecutivos y la evidencia es fuerte (`strength ≥ 0.7`), se marca `harmonic = 'double'`, se descarta un latido de cada dos para la FC (nunca para la morfología ni el ritmo) y se expone `hrFromSpectrum`. Esto impide publicar 144 lpm de un pulso de 72 sin bloquear la taquicardia real (donde `hintHz` también sube).
  - `snapshot`: `stale` pasa a depender del tiempo desde el último latido confirmado (`age > max(3.2, 2.6*ref)`) y de la fracción de muestras válidas recientes, **no** de `lastConfirmed.t <= invalidAt` a secas.
  - En `push`, un `!ok` aislado ya no vacía `pending`/`outliers` (sólo `prevRawIbi = 0`).

- `src/lib/ppg/artifactGuard.js`
  - `update` devuelve `{ level, disturbed }`: `level = 2` en salto estructural / pérdida de contacto / desplazamiento espacial; `level = 1` cuando el salto está entre 0.6× y 1× del umbral adaptativo o el residuo fuera de banda del propio guardia está elevado; `level = 0` en el resto.
  - Sólo `level === 2` fija `this.until = t + 0.6`. **Nunca se extiende `until` si ya está en cuarentena** (bug actual: `if (bad) this.until = t + 0.6` produce cuarentena perpetua).
  - El umbral adaptativo sigue aprendiendo sólo con `level === 0` y sin techo artificial de 4 % (sube hasta 8 %) para que un usuario nervioso no se autoencierre.
  - Se conserva `SpatialMotionGuard` tal cual para el caso estructural.

- `src/lib/ppg/streamFilter.js`
  - Nueva `designTremorFilter(fs)`: pasabanda 4.5–12 Hz (paso-alto 4.5 + paso-bajo 12, dos biquads RBJ). La rama de temblor **nunca** toca la señal de detección ni de morfología.

- `src/lib/ppg/rateDisplay.js`
  - Límite de pendiente 9 → 5 lpm/s y ventana de retención 2.5 → 3.5 s (el número deja de "bailar" y de parpadear).

- `package.json`
  - `test`: añadir `src/lib/ppg/tremor.test.js` a la lista.

**Temporales a eliminar al terminar**: `scripts/tremor-probe.mjs`, `scripts/tremor-diag.mjs`, `scripts/tremor-signal.mjs` (su contenido se consolida dentro de `tremor.test.js`).

[Functions]
Seis funciones nuevas y seis modificadas; todas con firma completa.

**Nuevas**

```js
// src/lib/ppg/bandNoise.js
/**
 * Separa el ruido en banda cardíaca del ruido fuera de banda.
 * @param {number[]} filtered   señal ya filtrada (canal de detección), AC/DC
 * @param {number}   tremorScale desviación robusta de la rama 4.5–12 Hz, AC/DC
 * @param {number}   lagSamples  período medido en muestras (0 si no hay)
 * @param {number}   signalScale desviación robusta de la señal en banda, AC/DC
 * @param {number}   fs
 * @returns {{inBand:number, outBand:number, tremor:number}}
 * inBand  = 1.4826 · MAD( f[i] − f[i−lag] ) / √2, con lag interpolado; si no hay lag,
 *           1.4826 · MAD( f[i] − 2f[i−1] + f[i−2] ) / √6 (curvatura EN BANDA).
 * outBand = max(0, tremorScale − 0.15 · inBand)  // la fuga de la banda cardíaca no es temblor
 * tremor  = outBand / max(1e-9, signalScale)
 * Propiedad exigida: con temblor de 0–1 % la señal de entrada, `inBand` no debe variar
 * más de ±15 % y `tremor` debe crecer monótonamente.
 */
export function bandNoise({ filtered, tremorScale, lagSamples, signalScale, fs })

// src/lib/ppg/streamFilter.js
/** Pasabanda 4.5–12 Hz: mide temblor, jamás decide latidos. */
export function designTremorFilter(fs)

// src/lib/ppg/beatTracker.js
/** Marca una frontera de artefacto sin destruir el historial de intervalos. */
markBoundary(t)                      // → void; fija invalidAt = t
/** Re-siembra sólo la plantilla de forma tras un cambio de canal. */
resetTemplate()                      // → void
/** Instante del cruce del 50 % de la prominencia en la subida, interpolado. */
_upstrokeCross(p, footIdx, troughValue, peakValue)  // → number (s)
/** Resuelve el doble conteo periódico comparando intervalos con el espectro medido. */
_resolveLobe(kept)                   // → { factor: 1|2, confidence: number }

// src/lib/ppg/pipeline.js
/** Veredicto único de validez de muestra y su peso de confianza. */
_sampleVerdict(t)                    // → { valid: boolean, weight: number, level: 0|1|2 }
```

**Modificadas**

```js
// src/lib/ppg/signalQuality.js
export function assessChannel(rawSamples, filteredSamples, scale, fs, usable,
  previous = null, noise = null)
// `noise` (último parámetro, opcional) = { inBand, outBand, tremor }.
// Sin `noise` se comporta como hoy (compatibilidad con los tests existentes).
// snr = scale / max(3e-5, noise?.inBand ?? noiseLegacy)
// tremorRatio = noise?.tremor ?? 0
// viable: snr ≥ 2.2 (histéresis 1.8) && tremorRatio ≤ 1.2 && concentration ≥ 0.3/0.4
//         && strength ≥ 0.2/0.3 && !ambiguous
// score  = value · 1/(1 + 1.5·tremorRatio), suavizado como hoy
// Errores: nunca lanza; devuelve `empty` con snr/tremorRatio informativos.

// src/lib/ppg/beatTracker.js
push(t, y, ok = true, scale = 1, weight = 1)
// weight se guarda en W[]; ok invalida (V=0) sólo por base de tiempo.
// _checkPeak exige V=1 en ±2 (igual), pero el rechazo por muestras inválidas
//   entre pie y pico pasa a umbral: > 20 % de muestras inválidas ⇒ rechaza;
//   ≤ 20 % ⇒ acepta y marca `noise`.

// src/lib/ppg/artifactGuard.js
update(t, rgb, usable, spatial, contact, selected) // → number (0|1|2)
// Se mantiene `this.bad` y `this.disturbed` por compatibilidad con pipeline.

// src/lib/ppg/pipeline.js
_analyzeChannels(t)   // calcula noise y lo pasa a assessChannel
getState()            // gate = sigOk && qualityOk; añade stableSeconds y tremor
rateDisplay.update()  // pendiente 5 lpm/s
```

**Contratos que NO cambian** (para no romper UI ni informe): `PPGEngine`, `TraceStore`, `getState().state` (`locked|acquiring|recovering|artifact|searching|lost|nofinger`), `getState().hr`, `quality` (sqi), `cleanSeconds`, `rhythm`, `peaks`, `reportVitalsAccepted` y sus umbrales 75 / 10 s / 20 s.

[Changes]
Orden de implementación con dependencias explícitas; cada paso deja el árbol compilando y los tests verdes.

1. **Rama de temblor (base de todo lo demás)** — `streamFilter.js`: `designTremorFilter(fs)` = `[designHighpass(4.5, fs), designLowpass(12, fs)]`. `pipeline.js`: `tremorFilters`/`tremorHist`, alimentación con la muestra limpia en `_grid`, `tremorScale[c]` recalculado en el bloque `count % 6`. Verificación: ningún otro consumidor cambia todavía; `npm test` sigue verde.

2. **Descomposición de ruido** — crear `bandNoise.js` con las tres salidas y la propiedad exigida. Tests unitarios con señales sintéticas: (a) sinusal limpia → `tremor ≈ 0`, `inBand` estable; (b) sinusal + 1 % a 5.3/7.9/11.2 Hz → `inBand` varía < 15 %, `tremor` > 0.5; (c) ruido blanco → `inBand` sube proporcionalmente.

3. **Calidad en banda** — `signalQuality.assessChannel` acepta `noise` y lo usa para `snr`/`tremorRatio`/`viable`/`score`. Sin el parámetro se comporta como hoy. `pipeline._analyzeChannels` lo construye y lo pasa. Verificación: la matriz de la sonda debe dejar de cerrar el gate hasta ~1 % (todavía sin publicar HR, porque falta el tracker); los 32 tests deben seguir pasando (si alguno cae, el problema es de umbral: ajustar `MIN_TREMOR_RATIO`, nunca relajar `concentration`/`strength`).

4. **Gate de dos niveles en el pipeline** — `_sampleVerdict(t)` devuelve `{valid, weight, level}`; `sigOk` deja de incluir `viable`; nuevo `qualityOk`; `ok`/`weight` al tracker; `drawn` depende de `level < 2`. Verificación: con la sonda, `notOk` debe pasar de 95 % a < 5 % con 0.56 % de temblor.

5. **Tracker ponderado y base de tiempo no destructiva** — `W[]`, `push(..., weight)`, `markBoundary`, `resetTemplate`, eliminación de los vaciados de `pending`/`outliers` por muestra aislada, `stale` por tiempo. Verificación: recuperación tras hueco sigue en < 4 s (`continuity.test.js`).

6. **Tiempo de latido por cruce de subida** — `_upstrokeCross` y uso de `tm` para todos los RR (`ibi = c.tm - prev.tm`). El ápice `t` se conserva para morfología, `pulseFeatures` y dibujo, de modo que ninguna etiqueta se mueva. Verificación: `morphology.test.js` intacto; en la sonda, la desviación típica de RR con 0.56 % de temblor debe bajar al menos un 40 % frente a usar el ápice.

7. **Arbitraje de armónico** — `_resolveLobe` + `harmonic` en el snapshot; `getState` deja de necesitar `harmonicConflict` para el caso `double` (lo consume del tracker) pero lo mantiene como segunda barrera. Verificación: `measurement.test.js` "irregular fallback cannot publish a double-rate conflict" sigue verde; nueva prueba: pulso 72 + temblor periódico nunca publica > 76.

8. **Guardia de artefactos graduada** — niveles, no extensión de cuarentena, techo 8 %, aprendizaje sólo en nivel 0. Verificación: `continuity.test.js` (`blip`, `gap`, `remove`) intacto; nueva prueba: 3 s de temblor continuo no producen ni un `_dropSignal`.

9. **`_dropSignal` y cambio de canal no destructivos** — re-siembra de `base` en saltos de DC > 15 %, `markBoundary` en cambios de canal. Verificación: en la sonda, `resets` debe ser 0 de 0 % a 1 % de temblor.

10. **Presentación** — `rateDisplay` 5 lpm/s y retención 3.5 s; `stableSeconds` y `tremor` expuestos en `getState` (los consume `signalFeedback`/`MonitorHud` sin cambios obligatorios).

11. **Consolidar la sonda como test** — `tremor.test.js` con el modelo exacto de `scripts/tremor-*.mjs`; añadir a `package.json`. Ejecutar `npm test` completo, `npm run lint` y `npm run build`. Borrar los tres scripts temporales.

Reglas de estilo impuestas por el código existente: filtros causales con estado (nunca `filtfilt` sobre ventana en vivo), nada de latidos sintéticos, nada de umbrales "mágicos" sin constante nombrada, comentarios en español explicando el *porqué* fisiológico igual que el resto del módulo.

[Tests]
Una suite nueva permanente y ampliación de las tres existentes; la sonda de diagnóstico se convierte en aserción numérica.

**Nuevo `src/lib/ppg/tremor.test.js`** (modelo de la sonda: `I_c(t) = DC_c · (1 − pulso) · (1 + 0.028·d(t)) · (1 + ruido)`, `d(t)` = suma de 5.3 / 7.9 / 11.2 Hz):

1. `micro-temblor 0–1 % conserva la FC` — para amplitud ∈ {0, 0.05, 0.1, 0.2, 0.35} y FC ∈ {54, 72, 100}: `state.hr` dentro de ±2 lpm, `locked` en ≥ 90 % de las muestras posteriores a t = 12 s, `resets === 0`.
2. `la calidad no baja con temblor leve` — `sqi` con amplitud 0.1 ≥ 0.9 × `sqi` con amplitud 0 (garantía explícita de "sin deteriorar la calidad").
3. `nunca publica el doble de la tasa real` — con amplitud 0.2 y FC 72, ningún `hr` publicado > 76 ni < 68 en 40 s; `pulseAmbiguous` puede ser `true` pero `hr` nunca es erróneo.
4. `jitter de marca de tiempo ±6 ms no altera nada` — mismos resultados que sin jitter (ya comprobado en la sonda: idéntico hasta 4 decimales).
5. `temblor grueso degrada, no miente` — amplitud 1.0: o `hr == null`, o `|hr − 72| ≤ 4`; prohibido un número fuera de rango.
6. `no hay pérdida de adquisición` — contador de `_dropSignal` instrumentado = 0 durante 20 s con amplitud 0.2.
7. `el temblor fuera de banda no entra en la señal` — propiedad de `bandNoise`: `inBand` con 1 % de temblor ≤ 1.15 × `inBand` sin temblor.

**Ampliaciones**

- `measurement.test.js`: caso `lobe arbitration never halves a genuine tachycardia` (FC 160 + lóbulo secundario → se publica 160, no 80).
- `continuity.test.js`: caso `channel switch keeps interval history` (cambio de canal a los 15 s → vuelve a `locked` en ≤ 3 latidos; hoy tarda ≈ 7).
- `morphology.test.js`: sin cambios; se ejecuta como control de que el tiempo por cruce de subida no altera los fiduciales (que siguen colgando del ápice `t`).

**Datos y casos límite**: FC 54/72/100/160; reflexión diastólica 0/0.3/0.9; amplitudes de temblor 0–1.7 %; jitter ±6 ms; canales r/g/b con recorte individual; hueco de 100 ms; retirada de dedo. Todos generados sin dependencias nuevas.

**Rendimiento**: la rama de temblor añade 6 biquads por muestra (≈ 60 operaciones) y un `robustScale` cada 6 muestras; `bandNoise` añade una mediana sobre ≤ 240 muestras dos veces por segundo. Coste despreciable frente a `powerSpectrum` (que ya corre a 1 Hz). Sin asignaciones nuevas por fotograma salvo el objeto de evidencia, ya existente.

**Verificación final**: `npm test` (32 actuales + nuevas), `npm run lint`, `npm run build`, y `node --import ./scripts/register-alias.mjs scripts/tremor-probe.mjs` mostrando `steady% ≥ 90` y `maxErr ≤ 2` para amplitudes 0–0.35 antes de borrar los scripts.
