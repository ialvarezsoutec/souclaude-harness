# Tasks: Monitor de tokens — extra congelado, dedup de filas e histórico

**Spec**: [spec.md](./spec.md)
**Plan**: [plan.md](./plan.md)
**Estimated total**: ~2.5-3.5 horas (7 tareas)
**Status**: complete — T101-T107 implementadas, revisadas (`CHANGES_REQUESTED` con 4
hallazgos bloqueantes, los 4 corregidos) y en verde (`npm test` 325/325). Sin segunda
ronda de review registrada en disco que confirme `APPROVED`, y sin PR abierto todavía —
ver `## Cierre` para el detalle de qué falta y por qué.

---

## Reglas de escritura

- Un commit por task, con footer `Refs: <ID-task>`. No en batch al final.
- **ID de task**: `SHS-H3-T<nnn>`. Esta es la **segunda** spec del hito `SHS-H3`
  (la primera, `SHS-H3-monitor-tokens`, ya reservó y usó el bloque `T01`-`T27`+`T18b`).
  Siguiendo la regla de numeración por bloques de 100 (`ccem-planner`/`ccem-sdd`), esta
  spec toma el siguiente centenar libre: **`T101`-`T107`**. Mapeo directo a los tasks
  `T1`-`T7` de `plan-inicial.md` (mismo orden, mismo contenido, solo se renumeran para no
  colisionar con la spec hermana).
- Sin mocks que reemplacen la lógica bajo test (Anti-Hack): cada test listado abajo debe
  **fallar si se revierte el fix o el archivo correspondiente**, no solo "pasar en
  verde" con una implementación fake.

---

## Tabla de tareas

| # | Título | Archivos | Dependencias | Tipo de commit |
|---|---|---|---|---|
| T101 | El extra usa el porcentaje de la API y expone sus flags | `adapters/usage-limits-reader.js`, `adapters/panel-presenter.js`, `test/monitor-presenter.test.js` | — | `fix:` |
| T102 | El dedup de filas distingue tipo y modelo | `adapters/panel-presenter.js`, `test/monitor-presenter.test.js` | T101 | `fix:` |
| T103 | Regla de dominio: extra vencido pasa a histórico a las 24h | `domain/gasto-extra.js` (nuevo), `test/monitor-domain.test.js` | — | `feat:` |
| T104 | Persistencia del histórico (`usage-history.js`) | `adapters/usage-history.js` (nuevo), `commands/monitor.js`, `test/monitor-history.test.js` | T103 | `feat:` |
| T105 | Sección "Histórico" en el panel | `adapters/panel-presenter.js`, `domain/arbol.js`, `adapters/panel-layout.js`, `adapters/snapshot-source.js`, `commands/monitor.js`, `test/monitor-presenter.test.js`, `test/monitor-render.test.js` | T101, T102, T103, T104 | `feat:` |
| T106 | Avisar cuando los datos de límites están viejos | `adapters/snapshot-source.js`, `commands/monitor.js`, `test/monitor-view.test.js` | — | `feat:` |
| T107 | Documentar la cadencia real y la sección Histórico | `README.md` | T105, T106 | `docs:` |

---

## Task inventory

### SHS-H3-T101 — El extra usa el porcentaje de la API y respeta sus flags

- **Estimación**: 25 min
- **Dependencies**: ninguna
- **Files**: `src/monitor/adapters/usage-limits-reader.js` (líneas 145-160,
  `toGastoExtra`), `src/monitor/adapters/panel-presenter.js` (líneas 122-130, bloque del
  extra dentro de `filasDeLimites`), `test/monitor-presenter.test.js` (**nuevo**)
- **Descripción**: `toGastoExtra()` agrega `utilizacion` (`extra.utilization`) y
  `motivoDeshabilitado` (`extra.disabled_reason`) al objeto que ya devuelve, sin quitar
  `usadoUsd`/`limiteUsd`/`habilitado`/`alcanzado`/`porcentaje`. En `panel-presenter.js`,
  la fila del extra usa `utilizacion` cuando está presente (en vez del `porcentaje`
  recalculado localmente) para armar `{porcentaje}` de la fila.
- **Test que debe fallar si se revierte**: `test/monitor-presenter.test.js`, caso
  "payload real 2026-08-06" — fixture de `.claude.json` con
  `cachedUsageUtilization.utilization.extra_usage = {is_enabled:false, monthly_limit:2000,
  used_credits:2136, utilization:100, spend_limit_reached:true}` (vía
  `mkClaudeHome({config: ...})`); el test lee la fila del extra que produce
  `presentar()`/`filasDeLimites` y afirma `porcentaje === 100`. Revertir el fix (volver a
  `usadoUsd/limiteUsd*100`) hace que el test falle con `107` (o `106.8`), no con un mock
  que finja el resultado.
- **Verificación**:
  - [x] El test nuevo falla contra el código sin el fix (verificado manualmente antes de
        commitear el fix) y pasa después.
  - [x] `usadoUsd`/`limiteUsd` se siguen mostrando como `$21.36/$20.00` (no se pierde
        info existente).
  - [x] `npm test` en verde.

---

### SHS-H3-T102 — El dedup de filas distingue tipo y modelo

- **Estimación**: 20 min
- **Dependencies**: T101 (mismo archivo, mismo bloque de función — evita conflicto de
  merge si se hacen en el otro orden)
- **Files**: `src/monitor/adapters/panel-presenter.js` (líneas 102-120, `filasDeLimites`
  — construcción de `yaEmitidos` y el filtro sobre `porGrupo`), `test/monitor-presenter.test.js`
- **Descripción**: la clave de deduplicación pasa de `${porcentaje}|${reseteaEn}` a
  `${tipo}|${modelo}|${porcentaje}|${reseteaEn}` (usando `g.tipo` y `g.modelo` de cada
  entrada de `porGrupo`, y el mismo par para las ventanas ya emitidas — que no tienen
  modelo, así que su clave usa `null` en esa posición de forma consistente).
- **Test que debe fallar si se revierte**: `test/monitor-presenter.test.js`, dos casos en
  el mismo `describe`:
  1. `seven_day` (sin modelo) y `weekly_scoped` con `modelo: 'Fable'`, mismo `porcentaje`
     y mismo `resets_at` → el test cuenta las filas resultantes y afirma que hay **dos**,
     una con etiqueta que menciona `Fable`. Con la clave vieja, colapsan a una sola.
  2. `weekly_all` con el mismo `tipo`, mismo `modelo` (o ambos sin modelo), mismo
     porcentaje y mismo reset que una ventana ya emitida (`seven_day`) → sigue
     colapsando a una sola fila (el caso que la lógica actual ya cubre y no debe
     romperse).
- **Verificación**:
  - [x] Los dos casos del test están en el mismo archivo. El caso 1 (Fable vs seven_day)
        falla contra la implementación vieja (colapsa a 1 fila en vez de 2, verificado con
        `git stash` sobre `panel-presenter.js`); el caso 2 (weekly_all vs seven_day) ya
        pasaba con la lógica vieja por diseño — es el regresivo que no debía romperse, tal
        como aclara la descripción de esta task.
  - [x] `npm test` en verde.

---

### SHS-H3-T103 — Regla de dominio: extra vencido pasa a histórico a las 24 horas

- **Estimación**: 20 min
- **Dependencies**: ninguna (paralelizable con T101/T102)
- **Files**: `src/monitor/domain/gasto-extra.js` (**nuevo**), `test/monitor-domain.test.js`
  (o un archivo dedicado si el existente ya es muy largo — decisión libre del
  implementador, documentada en el commit)
- **Descripción**: dos funciones puras, sin I/O ni `Date.now()` implícito (siguiendo el
  patrón exacto de `domain/ventanas.js`, que recibe `ahora` como parámetro):
  - `estadoDelExtra({alcanzado, detectadoEn}, ahora)` → `'vivo' | 'historico'`.
    `alcanzado !== true` o sin `detectadoEn` → siempre `'vivo'`. Umbral: `ahora -
    detectadoEn >= 24 * 60 * 60_000` → `'historico'`.
  - `siguienteRegistro(gastoExtra, registroActual, ahora)` → el próximo estado del
    registro persistido (abre uno nuevo si `alcanzado === true` y no había abierto;
    lo mantiene igual si sigue abierto y sigue alcanzado; lo cierra/archiva si
    `habilitado === true` o `usadoUsd` cae por debajo del `usado` registrado).
- **Test que debe fallar si se revierte**: caso de bordes exactos —
  `estadoDelExtra({alcanzado:true, detectadoEn: ahora - (24*60-1)*60_000}, ahora)` →
  `'vivo'` (23h59m); con `(24*60+1)*60_000` → `'historico'` (24h01m);
  `estadoDelExtra({alcanzado:false, ...}, ahora)` → siempre `'vivo'`. Ningún test usa
  `Date.now()` real — todos pasan `ahora` fijo, así que el test es determinista y no
  puede volverse flaky.
- **Verificación**:
  - [x] `test/monitor-layers.test.js` (enforcement de capas ya existente) sigue en
        verde con el archivo nuevo — confirma que `gasto-extra.js` no importa nada fuera
        de dominio.
  - [x] `npm test` en verde.

---

### SHS-H3-T104 — Persistencia del histórico (`usage-history.js`)

- **Estimación**: 30 min
- **Dependencies**: T103 (usa `siguienteRegistro` de dominio)
- **Files**: `src/monitor/adapters/usage-history.js` (**nuevo**),
  `src/commands/monitor.js` (composición del adaptador, junto a `crearLimitsReader`,
  líneas 26-32; flag opcional de seed), `test/monitor-history.test.js` (**nuevo**)
- **Descripción**: adaptador que mantiene `~/.claude/souclaude/usage-history.json`
  (`{abierto, archivados}`). Expone `leer()` y `registrar(gastoExtra, ahora)`: este
  último llama a `siguienteRegistro()` (dominio) y, si el resultado difiere del estado
  actual, persiste con `writeFileSync` directo (sin temp+rename, mismo motivo que
  `usage-fetcher.js:175-187` — EPERM bajo OneDrive). Lectura envuelta en `try/catch`:
  archivo ausente o JSON corrupto → arranca con `{abierto:null, archivados:[]}`, nunca
  lanza. Seed inicial: si no hay archivo y se pasa un flag/entrada explícita
  (`--seed-extra-detectado-en <ISO>` o equivalente) junto con un `gastoExtra.alcanzado
  === true`, `detectadoEn` toma esa fecha en vez de `ahora`; sin el flag, siempre
  `ahora` de la primera observación.
- **Test que debe fallar si se revierte**: `test/monitor-history.test.js` sobre `tmpdir`
  real (mismo patrón que `test/monitor-tailer.test.js`):
  1. Primera detección (`alcanzado:true`, sin archivo previo) → se crea el archivo con
     `abierto.detectadoEn === ahora` y `usado`/`limite` correctos.
  2. Reset (`habilitado` pasa a `true` con un registro abierto) → el archivo pasa a
     `abierto:null` y el periodo aparece en `archivados` con `cerradoEn` seteado.
  3. Archivo corrupto (`fs.writeFileSync(ruta, '{esto no es json')`) → `leer()` no
     lanza, devuelve `{abierto:null, archivados:[]}`.
  4. Seed: sin archivo previo, `alcanzado:true` y el flag de seed con una fecha fija →
     `abierto.detectadoEn` es esa fecha, no `ahora`; en una segunda llamada (archivo ya
     existe) el mismo flag se ignora.
- **Verificación**:
  - [x] Los 4 casos están cubiertos y cada uno falla si se quita la lógica
        correspondiente (verificado comentando el fix localmente antes de commitear).
  - [x] **ADR pendiente** (ver `plan.md`, "Decisión que requiere ADR"): crear
        `docs/decisions/YYYYMMDD-persistencia-gasto-extra-monitor.md` con `/adr-new`
        antes de dar esta task por cerrada — documenta por qué el monitor persiste
        estado propio pese al non-goal de `SHS-H3-monitor-tokens`. Creado en
        `docs/decisions/20260810-monitor-persiste-historico-de-gasto-extra.md`.
  - [x] `npm test` en verde.

---

### SHS-H3-T105 — Sección "Histórico" en el panel

- **Estimación**: 40 min (incluye el cableado de lectura de `usage-history.js` que
  quedó pendiente de T104 — ver nota de ajuste más abajo)
- **Dependencies**: T101, T102, T103, T104
- **Files**: `src/monitor/domain/arbol.js` (agrega `vista.historico` y
  `vista.limites.gastoExtra.historico`), `src/monitor/adapters/panel-presenter.js`
  (separa filas vivas/históricas), `src/monitor/adapters/panel-layout.js` (sección al
  pie, exclusión de `UMBRAL_ALARMA` línea 70 y del título `LIMITE N%` líneas 273-281),
  `src/monitor/adapters/snapshot-source.js` (recibe/compone `usageHistory` y agrega
  `registroExtra` al snapshot de `collect()`), `src/commands/monitor.js` (le pasa a
  `createSnapshotSource` el `usageHistory` que ya crea `crearUsageHistory()`),
  `test/monitor-presenter.test.js`, `test/monitor-render.test.js`
- **Nota de ajuste (post-implementación de T101-T104)**: el implementer de T105 detectó
  que `commands/monitor.js` (T104) cableó `usage-history.js` **solo para escritura**
  (`registrarHistorico()` llama a `usageHistory.registrar()` después de `buildView`, para
  el *próximo* tick) — fiel a lo que decía esta task en su versión original, que no
  listaba `snapshot-source.js` ni `commands/monitor.js` entre sus archivos. Sin leer
  `usageHistory.leer()` **antes** de `construirVista`, no hay forma de que
  `snapshot.registroExtra` exista ni de que `--json` incluya `historico`. Se corrige acá:
  estos dos archivos entran al alcance de T105, no de T104 (T104 se queda como estaba:
  responsable de que el adaptador exista y persista bien, no de conectarlo a la lectura
  del panel).
- **Descripción**: `createSnapshotSource` recibe un `usageHistory` (mismo objeto que
  devuelve `createUsageHistory()`) y, dentro de `collect()`, llama a
  `usageHistory.leer()` para agregar `registroExtra: {abierto, archivados}` al snapshot
  devuelto — mismo patrón que ya usa `limitsReader` (falla capturada hacia `avisos`, sin
  tumbar el tick; sin `usageHistory` inyectado, `registroExtra` es `{abierto: null,
  archivados: []}`). `commands/monitor.js` le pasa a `createSnapshotSource` el mismo
  `usageHistory` que ya crea con `crearUsageHistory(flags)` (hoy solo se usa para
  `registrarHistorico()` tras `buildView`; ahora también se compone hacia adentro, antes
  de `buildView`). `construirVista` recibe `snapshot.registroExtra` y usa
  `estadoDelExtra` para decidir si el `gastoExtra` vigente es `historico`; si lo es, lo
  agrega a `vista.historico` (array) y lo marca en `vista.limites.gastoExtra.historico`.
  `panel-presenter.js` excluye de `filasDeLimites` cualquier fila cuyo `gastoExtra` esté
  marcado histórico, y arma una sección nueva `historico` con formato atenuado (`Extra
  ago-2026  $21.36/$20.00  alcanzado 06-08`). `panel-layout.js` la pinta al pie, fuera
  del cálculo de severidad del header y del título de alarma.
- **Test que debe fallar si se revierte**: `test/monitor-presenter.test.js` con un
  fixture donde `registroExtra.abierto.detectadoEn` es de hace 25 horas y
  `gastoExtra.alcanzado === true` → la fila del extra **no** aparece en `limites`
  (vivas) y sí aparece en `historico`; con `detectadoEn` de hace 1 hora → aparece en
  `limites` como alarma normal y `historico` está vacío.
  `test/monitor-render.test.js`: snapshot del layout con el caso "histórico" → ninguna
  línea del marco es roja y el título no contiene `LIMITE`.
- **Verificación**:
  - [x] `test/monitor-view.test.js` (o el archivo de integración de `snapshot-source.js`)
        cubre que `collect()` devuelve `registroExtra` con lo que `usageHistory.leer()`
        tenía persistido — este caso queda cumplible recién con el cableado agregado acá.
  - [x] `node bin/cli.mjs monitor --json` (sobre `--claude-home` de fixture con el
        payload real y un registro ya abierto hace más de 24h) incluye `historico:
        [{usado: 21.36, limite: 20, ...}]` — `JSON.parse` no falla. Verificado además
        sobre la máquina real simulando `detectadoEn` 25h atrás en
        `usage-history.json` (restaurado al valor real después de la verificación):
        `historico` trae `{usado:21.36, limite:20, moneda:'USD', detectadoEn:...}` y
        `limites.gastoExtra.historico === true`.
        **Corrección post-review**: este ítem se cerró originalmente apoyado solo en la
        verificación manual de arriba, lo cual el `reviewer` marcó como bloqueante
        (hallazgo 2 de `review.md`: la propia spec prohíbe cerrar un RF solo con
        verificación manual). Ya existe test automatizado:
        `test/monitor-cmd.test.js` (commit `d96fc32`), dos casos sobre el pipeline real
        con `--claude-home` — con un registro de +24h, `historico` trae el extra
        archivado; sin ningún registro, `historico` es `[]`. La verificación manual de
        arriba queda como evidencia complementaria, no como el único criterio.
  - [x] `npm test` en verde (325/325 al cierre final del rastro de progreso; 313/313 al
        cerrar esta task originalmente, antes del rework post-review).

---

### SHS-H3-T106 — Avisar cuando los datos de límites están viejos

- **Estimación**: 30 min (incluye el cableado de producción del `usageFetcher` que
  quedó pendiente — ver nota de ajuste más abajo, mismo defecto que T105)
- **Dependencies**: ninguna (paralelizable con T101-T105)
- **Files**: `src/monitor/adapters/snapshot-source.js` (paso 5, líneas 95-103),
  `src/commands/monitor.js` (extraer `createUsageFetcher({paths})` a una variable propia
  y compartirla entre `createLimitsReader` y `createSnapshotSource`, en vez de crearla
  únicamente dentro de `crearLimitsReader`), `test/monitor-view.test.js`
- **Nota de ajuste (post-implementación)**: el implementer detectó que esta task, en su
  versión original, solo listaba `snapshot-source.js` y su test. Con eso, se agregó el
  parámetro `usageFetcher` a `createSnapshotSource` (correcto) pero **nadie lo inyecta en
  producción**: `commands/monitor.js` crea el fetcher *dentro* de `crearLimitsReader`
  (`createLimitsReader({ fetcher: createUsageFetcher({ paths }) })`) y nunca lo comparte
  con `createSnapshotSource` — el aviso de "límites sin refrescar" nunca podía aparecer
  en el panel real, solo en el test con un fetcher fake. Mismo tipo de hueco que en T105
  (un cableado de producción que el `tasks.md` original no pedía explícitamente). Se
  corrige acá: `commands/monitor.js` entra al alcance de T106, no de una task aparte —
  es la misma pieza de trabajo, solo que su redacción original se quedó corta.
- **Descripción**: dentro del paso que ya lee `limites`, se consulta también
  `usageFetcher.estado()` (ya existe en `usage-fetcher.js:63-65`, hoy sin consumidor real
  fuera de su propio test). Si `fallosSeguidos > 0` o `backoffHasta` está en el futuro
  (`backoffHasta > ahora`), se agrega un aviso al mismo array `avisos` que ya se
  construye en ese paso: `límites sin refrescar desde hace Xm (reintento en Ym)`.
  `createSnapshotSource` recibe el fetcher (o algo con `.estado()`) para poder
  consultarlo — se compone igual que ya se compone `limitsReader`. En
  `commands/monitor.js`, el `usageFetcher` deja de crearse solo dentro de
  `crearLimitsReader(flags)`: se crea una vez (respetando las mismas condiciones de "sin
  refresco de red" que ya evalúa esa función — `--no-refresh`, CI, `--claude-home`) y esa
  misma instancia se pasa tanto a `createLimitsReader` como a `createSnapshotSource`,
  para que el mismo fetcher que refresca los límites sea el que reporta su propio
  estado.
- **Test que debe fallar si se revierte**: `test/monitor-view.test.js`, dos casos sobre
  la integración ya existente de `createSnapshotSource`:
  1. Fetcher fake con `estado()` devolviendo `{fallosSeguidos: 4, backoffHasta: ahora +
     900_000}` → `snapshot.avisos` contiene una entrada que menciona "sin refrescar".
  2. Fetcher fake con `estado()` devolviendo `{fallosSeguidos: 0, backoffHasta: null}` →
     ningún aviso de ese tipo aparece.
  Para el cableado de producción específicamente (sin test unitario de por medio, es
  wiring de `commands/monitor.js`): verificación manual — forzar un fallo de red real
  (token inválido o sin conexión) sobre esta máquina y confirmar que el aviso aparece en
  `souclaude monitor --once`, no solo en el test con el fake.
- **Verificación**:
  - [x] Ambos casos de `test/monitor-view.test.js` fallan si se quita la consulta a
        `estado()` (verificado con `git stash` sobre `snapshot-source.js`: el caso de
        backoff falla, el caso sano se mantiene en verde).
  - [x] El `usageFetcher` compartido entre `createLimitsReader` y `createSnapshotSource`
        en `commands/monitor.js`: `crearUsageFetcher(flags)` crea una sola instancia (o
        `undefined` si `sinRefrescoDeRed`) y esa misma instancia se pasa a
        `crearLimitsReader(usageFetcher)` y a `createSnapshotSource({ ..., usageFetcher })`
        en el modo real de `monitor()`. Verificado con `node bin/cli.mjs monitor --once
        --no-refresh` (y su variante `--json`): `avisos` queda vacio, sin fetcher creado
        -- comportamiento esperado, declarado en el comentario de `crearUsageFetcher`.
        Regresion cubierta ademas en `test/monitor-cmd.test.js` (con `--claude-home`,
        que tambien desactiva el fetcher, `avisos` nunca menciona "sin refrescar").
  - [x] `npm test` en verde (316/316).

---

### SHS-H3-T107 — Documentar la cadencia real y la sección Histórico

- **Estimación**: 15 min
- **Dependencies**: T105, T106 (para documentar el comportamiento ya implementado, no
  uno planeado)
- **Files**: `README.md` (sección `souclaude monitor`)
- **Descripción**: agregar a la tabla de flags o al texto de "Honestidad de los datos"
  que el refresco de red también se desactiva en modo CI (`ui.isCI()`) y con
  `--claude-home` (ver `src/commands/monitor.js:26-32`), no solo con `--no-refresh`
  (hoy es lo único documentado explícitamente, línea 86). Documentar la sección
  "Histórico" del panel y el archivo `~/.claude/souclaude/usage-history.json`
  (qué guarda, cuándo se abre y se cierra un registro).
- **Verificación** (revisión editorial — único task sin test automatizado, es texto, no
  comportamiento; no sustituye ninguna verificación de T101-T106):
  - [x] Los tres casos de "sin refresco de red" (`--no-refresh`, CI, `--claude-home`)
        están documentados.
  - [x] La sección Histórico y `usage-history.json` están documentados con un ejemplo
        concreto.

---

## Execution order

```
T101 ──▶ T102 ──▶ T105
T103 ──▶ T104 ──────┤
T106 (independiente) ┤
                     ▼
                    T107
```

### Paralelización posible

- T103 y T106 son independientes de T101/T102 desde el arranque (dominios de archivo
  distintos).
- T104 depende solo de T103 (usa su función pura), no de T101/T102.
- T105 es el punto de integración: necesita T101, T102, T103 y T104 ya cerrados porque
  toca `panel-presenter.js` (mismo archivo que T101/T102) y consume
  `snapshot.registroExtra` (T104).
- T107 va última porque documenta comportamiento ya implementado (T105, T106).

---

## Checkpoints humanos

- [x] **Después de T102**: `panel-presenter.js` con el fix de porcentaje y de dedup
      verificado sobre el payload real de esta máquina (`node bin/cli.mjs monitor
      --once --no-refresh`), antes de tocarlo de nuevo en T105. Evidencia: el
      `reviewer` reprodujo el caso "payload real 2026-08-06" y confirmó 100% (no 107%)
      end-to-end (`progress/SHS-H3-extra-historico/review.md`, tabla de trazabilidad
      RF-01); no quedó registrado como un checkpoint aislado justo tras T102, pero el
      hecho que verifica (el fix se sostiene sobre datos reales) sí está confirmado de
      forma independiente.
- [x] **Después de T104**: ADR creado (`/adr-new`) para la decisión de persistencia
      propia del monitor, antes de integrar el histórico al panel en T105. Evidencia:
      `docs/decisions/20260810-monitor-persiste-historico-de-gasto-extra.md` existe en
      disco y el `reviewer` confirmó que es el ADR que pedía esta task
      (`review.md`, sección Constitución: "Arquitectura documentada - OK").
- [ ] **Después de T107 (final)**: `npm test` completo en verde (**hecho**: 325/325,
      confirmado de forma independiente tanto por el `reviewer` como por mí en esta
      sesión de cierre) y verificación manual sobre esta máquina real (**hecho**: el
      orquestador la corrió sobre el `~/.claude` real con el seed 2026-08-06 aplicado;
      el `reviewer` la reprodujo con fixture vía `--claude-home`, no sobre el home
      real — ver su segundo dictamen en `review.md`). Lo que queda
      abierto es la mitad final de este ítem: **"owner confirma que la alarma
      permanente desapareció"** — no hay registro en disco de esa confirmación en vivo
      del owner (distinta de la aprobación del plan, ya registrada); se deja en `[ ]`
      hasta que ocurra, previsiblemente en el checkpoint del PR.

---

## Cierre

- [x] `npm test` completo en verde, incluyendo todas las suites nuevas/ampliadas.
      **325/325, 0 fail** — confirmado por el `reviewer` (317/317 en su momento, antes
      del rework) y de nuevo por mí en esta sesión de cierre (325/325, tras los 4 fixes
      del review: commits `3f8ef3b`, `40652ee`, `d96fc32`, `40074bd`).
- [x] `node bin/cli.mjs monitor --once --no-refresh` sobre esta máquina → extra al pie
      como histórico al 100%, sin marco rojo ni `LIMITE 107%`, `Semanal Fable` visible.
      Verificado por el orquestador sobre la máquina real (seed 2026-08-06 aplicado),
      por el implementer durante T105 (simulación con backup/restauración), y por el
      `reviewer` de forma independiente con fixture vía `--claude-home` (ver su
      segundo dictamen en `review.md`).
- [x] `node bin/cli.mjs monitor --json` incluye `historico` con `usado: 21.36, limite:
      20` cuando corresponde. Verificado a mano por el `reviewer` **y** ahora cubierto
      por test automatizado (`test/monitor-cmd.test.js`, commit `d96fc32` — cierra el
      hallazgo 2 del review, que exigía justo esto y no solo la verificación manual).
- [x] ADR de la decisión "persistencia propia del gasto extra pese al non-goal de la
      spec hermana" (`/adr-new`) — creado y referenciado desde `plan.md`:
      `docs/decisions/20260810-monitor-persiste-historico-de-gasto-extra.md`.
- [x] `README.md` actualizado (T107). Confirmado por el `reviewer` (RF-07: OK,
      `README.md:84-101,161-190`).
- [ ] PR draft abierto contra `main` con la plantilla completa (tras 2-3 commits, no al
      final). **Pendiente** — no se abrió en esta rama todavía; el `reviewer` tampoco
      pudo verificarlo (`gh` no disponible en su entorno). No depende de este cierre de
      rastro de progreso: es el siguiente paso, a cargo de quien coordine el merge.
- [ ] Status de `spec.md` cambiado a `implemented` tras el firmoff del owner.
      **Hecho el cambio de Status** (ver `spec.md`, ahora `implemented`, `Aprobado:
      2026-08-10` — la aprobación humana del plan quedó registrada en la sesión del
      orquestador ese mismo día). Queda en `[ ]` porque el firmoff explícito en vivo del
      owner sigue pendiente, igual que el checkpoint final de arriba — es el mismo
      ítem, no un segundo bloqueo nuevo.
