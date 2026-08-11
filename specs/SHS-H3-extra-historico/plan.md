# Plan: Monitor de tokens — extra congelado, dedup de filas e histórico

**Spec**: [spec.md](./spec.md)
**Status**: implemented — T101-T107 completadas, revisadas y con los 4 hallazgos
bloqueantes del review corregidos (`npm test` 325/325). Ver `tasks.md` → `## Cierre` para
lo que sigue pendiente (PR, firmoff en vivo del owner).
**Owner**: Ignacio A
**Creado**: 2026-08-10
**Aprobado**: 2026-08-10 — aprobación humana registrada en la sesión del orquestador
(este plan precisa el plan de investigación `plan-inicial.md`, ya aprobado por el owner
antes de escribir spec/plan/tasks).

---

## Reglas de escritura

- Aquí va el CÓMO técnico. La spec (`spec.md`) es input — no se duplican goals ni
  journeys.
- Este plan **transcribe y precisa** `plan-inicial.md` (investigación ya aprobada por el
  humano): mismas causas raíz, mismos 6 archivos + tests, mismo alcance. Donde
  `plan-inicial.md` dejaba una decisión abierta (p. ej. "domain/ventanas.js o
  consumo.js"), este plan la resuelve de forma explícita y la justifica en "Research
  notes" — eso es exactamente el trabajo de un `plan.md`, no una ampliación de alcance.

---

## Stack decisions

### Runtime y dependencias

- Tecnología elegida: Node.js core (`node:fs`, `node:path`), sin dependencias nuevas —
  mismo criterio que `SHS-H3-monitor-tokens` (RNF-01 de esa spec).
- Rationale: los tres bugs son de presentación y de un adaptador de persistencia trivial
  (leer/escribir un JSON). No hay volumen de dato ni concurrencia que justifique una
  librería.
- Componentes existentes reutilizados: `domain/ventanas.js` (patrón de función pura que
  recibe `ahora`, se replica para la regla nueva), el canal `vista.avisos` ya existente
  (`snapshot-source.js:95-103`), el patrón de escritura directa sin temp+rename ya
  documentado en `usage-fetcher.js:175-187` (EPERM bajo OneDrive).
- Componentes nuevos: `src/monitor/domain/gasto-extra.js`,
  `src/monitor/adapters/usage-history.js`.

---

## Architecture

```
                 ┌───────────────────────────┐
                 │ commands/monitor.js        │  crea usageHistory (T104) y lo pasa a
                 │                            │  snapshot-source (T105, lectura) Y lo
                 │                            │  llama tras buildView (T104, escritura)
                 └─────────────┬──────────────┘
                                ▼
                 ┌───────────────────────────┐
                 │ application/build-view.js  │  (sin cambios: sigue delegando
                 │                            │   toda la agregación al dominio)
                 └─────────────┬──────────────┘
                                ▼
     ┌──────────────────────────────────────────────────┐
     │ domain/arbol.js (construirVista)                  │
     │  - snapshot.limites        -> vista.limites        │ (ya existía)
     │  - snapshot.registroExtra  -> vista.historico       │ (NUEVO, usa gasto-extra.js)
     │  + marca vista.limites.gastoExtra.historico         │
     └───────────────────────────┬────────────────────────┘
                                  ▲
                 ┌────────────────┴─────────────────┐
                 │ adapters/snapshot-source.js        │
                 │  - limitsReader.read()  (ya existía)│
                 │  - usageHistory.leer() -> registroExtra (T105, SOLO lectura;
                 │    el registrar()/decisión de abrir-cerrar vive en
                 │    commands/monitor.js, después de buildView — T104)
                 │  - usageFetcher.estado() -> avisos  (NUEVO, dentro del paso 5, T106)
                 └────────────────┬────────────────────┘
                                  │
              ┌───────────────────┼────────────────────┐
              ▼                   ▼                    ▼
   usage-limits-reader.js  usage-history.js (NUEVO)  usage-fetcher.js (sin cambios,
   (toGastoExtra ampliado)  (lee/escribe                solo se lee su estado())
                             usage-history.json)

                 ┌───────────────────────────┐
                 │ adapters/panel-presenter.js │  consume vista.historico +
                 │  (presentar)                │  vista.limites.gastoExtra.historico;
                 │                            │  dedup con tipo+modelo (RF-02)
                 └─────────────┬──────────────┘
                                ▼
                 ┌───────────────────────────┐
                 │ adapters/panel-layout.js    │  nueva sección "Histórico" al pie;
                 │                            │  la fila histórica no entra al orden
                 │                            │  por severidad ni al título LIMITE N%
                 └───────────────────────────┘
```

Descripción del flujo (una vuelta de reloj) — **corregida tras el ajuste de T105** para
reflejar cómo quedó realmente repartido entre T104 y T105 (ver "Nota de ajuste" arriba):
1. `snapshot-source.js` lee `limites` como ya hacía (paso 5, sin tocar su forma) y, apenas
   los tiene, agrega al snapshot devuelto `registroExtra: usageHistory.leer()` (**solo
   lectura**, sin decidir nada) — el mismo objeto `{abierto, archivados}` que ya persiste
   `usage-history.js` (T104). La **decisión** de abrir/mantener/cerrar el registro
   (`usageHistory.registrar()`, que sí llama a `siguienteRegistro()` de dominio) sigue
   ocurriendo donde T104 la dejó: en `commands/monitor.js`, **después** de `buildView`,
   con el `gastoExtra` recién construido en `vista.limites.gastoExtra` — por eso el
   registro que ve un tick es el que quedó escrito en el tick anterior, nunca el de sí
   mismo (un desfase de un tick, aceptable: el gasto extra no cambia segundo a segundo).
2. En el mismo paso 5, `usageFetcher.estado()` (ya existente, hoy sin consumidor real) se
   traduce a un aviso si hay fallos/backoff.
3. `domain/arbol.js` (`construirVista`), que ya recibe `ahora` desde `build-view.js`
   (`buildView` lee el reloj una sola vez por tick), usa
   `gasto-extra.js::estadoDelExtra(gastoExtra, registroExtra.abierto, ahora)` para decidir
   `vivo | historico` y arma `vista.historico` + marca
   `vista.limites.gastoExtra.historico`.
4. `panel-presenter.js` (usado por el panel en vivo y por `renderPlain`) separa filas
   vivas de históricas usando esos campos del **modelo de dominio ya canónico** — no
   reimplementa la regla.
5. `renderJson` (`plain-renderer.js:43-45`) sigue exponiendo el modelo de dominio **sin
   transformar**: como `vista.historico` ahora es parte de ese modelo, `--json` lo expone
   gratis, sin romper la regla documentada en ese archivo ("no transforma nada, el panel
   consume la proyección aparte").

**Regla de dependencias** (P2, sin cambios respecto a `SHS-H3-monitor-tokens`):
`adapters → application → domain`. `gasto-extra.js` no importa nada fuera de sí mismo;
`usage-history.js` es un adaptador y puede importar de dominio pero no al revés.

---

## Data contracts

### Input — payload real de la API (verificado 2026-08-10, sin cambios)

```js
// extra_usage dentro de cachedUsageUtilization.utilization (o del fetcher)
{ is_enabled: false, monthly_limit: 2000, used_credits: 2136,
  utilization: 100, disabled_reason: "org_level_disabled_until",
  spend_limit_reached: true }
// decimal_places (default 2) ya se usa en usage-limits-reader.js:147-150 para pasar
// monthly_limit/used_credits de centavos a dolares: 2136/100 = 21.36, 2000/100 = 20.00
```

### Output — campos nuevos/ampliados del modelo de dominio

```js
// usage-limits-reader.js: toGastoExtra() (hoy usage-limits-reader.js:145-160)
{
  habilitado,          // ya existía (linea 154)
  usadoUsd, limiteUsd, // ya existian
  porcentaje,          // RECALCULADO localmente (linea 151) — se sigue exponiendo,
                        // por si algun consumidor lo necesita, pero deja de ser lo
                        // que usa panel-presenter.js para pintar la fila
  utilizacion,          // NUEVO: extra.utilization tal cual la trae la API (100)
  motivoDeshabilitado,  // NUEVO: extra.disabled_reason ("org_level_disabled_until" | null)
  alcanzado,            // ya existía (linea 158)
}

// domain/gasto-extra.js — PeriodoDeGastoExtra: la forma persistida y la que viaja
// dentro de vista.historico
{ detectadoEn: <epoch ms>, usado: <number USD>, limite: <number USD>,
  moneda: 'USD', cerradoEn: <epoch ms> | null }

// usage-history.json en disco (~/.claude/souclaude/usage-history.json)
{ abierto: PeriodoDeGastoExtra | null, archivados: PeriodoDeGastoExtra[] }

// snapshot devuelto por snapshot-source.js — campo nuevo
{ ...campos existentes, registroExtra: { abierto: PeriodoDeGastoExtra | null } }

// VistaMonitor (domain/arbol.js) — campos nuevos/ampliados
{
  ...campos existentes,
  limites: { ...campos existentes,
    gastoExtra: { ...campos existentes de toGastoExtra, historico: boolean } },
  historico: [ { usado, limite, moneda, detectadoEn } ],  // 0 o 1 hoy; array por
                                                            // consistencia con el resto
                                                            // de VistaMonitor (serie,
                                                            // proyectos, avisos...)
}
```

### Transformations clave

- [ ] `toGastoExtra` deja de ser la única fuente del porcentaje mostrado: expone
      `utilizacion`/`motivoDeshabilitado` sin dejar de exponer lo que ya calculaba.
- [ ] La clave de dedup de `filasDeLimites` (panel-presenter.js) pasa de
      `${porcentaje}|${reseteaEn}` a `${tipo}|${modelo}|${porcentaje}|${reseteaEn}`.
- [ ] `estadoDelExtra(gastoExtra, registroAbierto, ahora)`: función pura, `'vivo' |
      'historico'` según si `ahora - registroAbierto.detectadoEn >= 24h` y
      `gastoExtra.alcanzado === true`.
- [ ] `siguienteRegistro(gastoExtra, registroActual, ahora)`: función pura (reducer) que
      decide si el registro persistido se abre, se mantiene igual o se cierra/archiva,
      dado el `gastoExtra` recién leído. El adaptador `usage-history.js` solo persiste lo
      que esta función devuelve — la decisión de negocio es pura y testeable sin FS.
- [ ] `construirVista` arma `vista.historico` y marca
      `vista.limites.gastoExtra.historico` combinando `snapshot.registroExtra` con
      `estadoDelExtra`.
- [ ] `presentar()` dos secciones en vez de una: `limites` (solo filas vivas) y una nueva
      `historico` (filas atenuadas, sin severidad).

---

## Mapa de archivos

| Archivo | Cambio | Task |
|---|---|---|
| `src/monitor/adapters/usage-limits-reader.js` | `toGastoExtra` (líneas 145-160): agregar `utilizacion`/`motivoDeshabilitado` sin quitar nada existente | T101 |
| `src/monitor/adapters/panel-presenter.js` | `filasDeLimites` (líneas 95-135): usar `utilizacion` en vez de recalcular (RF-01); clave de dedup con `tipo`+`modelo` (líneas 108-120, RF-02); separar filas vivas/históricas usando `vista.historico`/`gastoExtra.historico` (RF-05) | T101, T102, T105 |
| `src/monitor/domain/gasto-extra.js` (**nuevo**) | `estadoDelExtra()` + `siguienteRegistro()`, funciones puras, sin I/O ni `Date.now()` | T103 |
| `src/monitor/adapters/usage-history.js` (**nuevo**) | Persistencia de `~/.claude/souclaude/usage-history.json`; usa `siguienteRegistro()` de dominio, escritura directa sin temp+rename | T104 |
| `src/monitor/domain/arbol.js` | `construirVista`: agregar `vista.historico` y `vista.limites.gastoExtra.historico` a partir de `snapshot.registroExtra` | T105 |
| `src/monitor/adapters/snapshot-source.js` | Paso 5 (líneas 95-103): consumir `usageFetcher.estado()` para avisos (RF-06, **T106** — el parámetro `usageFetcher` en sí no alcanza; hace falta que `commands/monitor.js` lo inyecte de verdad, ver esa fila); recibir/componer `usageHistory` y agregar `registroExtra` (resultado de `usageHistory.leer()`) al snapshot devuelto (**T105**, no T104 — ver nota de ajuste abajo) | T105, T106 |
| `src/monitor/adapters/panel-layout.js` | Nueva sección "Histórico" al pie, atenuada; excluida del orden por `UMBRAL_ALARMA` (línea 70) y del título `LIMITE N%` (líneas 273-281) | T105 |
| `src/commands/monitor.js` | T104: crea `usageHistory` (`crearUsageHistory`, flag de seed) y lo cablea solo para **escribir** (`registrarHistorico()` tras `buildView`). T105: le pasa además ese mismo `usageHistory` a `createSnapshotSource` para que pueda **leerlo** antes de `construirVista` — sin esto, `snapshot.registroExtra` nunca existe y `--json` no puede incluir `historico`. T106: extrae `createUsageFetcher({paths})` de adentro de `crearLimitsReader` a una variable propia y la comparte con `createSnapshotSource` — sin esto, `createSnapshotSource` recibe el parámetro `usageFetcher` pero nadie se lo pasa en producción, y el aviso de RF-06 nunca aparece fuera de los tests (mismo tipo de hueco que T105, ver nota de ajuste en `tasks.md` → T106) | T104 (escritura), T105 (lectura), T106 (fetcher compartido) |
| `README.md` | Documentar condiciones de "sin refresco de red" (hoy solo `--no-refresh`, línea 86 — falta CI/`--claude-home`, ver `src/commands/monitor.js:27`) y la sección Histórico + `usage-history.json` | T107 |
| `test/monitor-presenter.test.js` (**nuevo**) | Cobertura de RF-01, RF-02 y la separación vivas/históricas de RF-05 — `panel-presenter.js` tiene hoy cero tests | T101, T102, T105 |
| `test/monitor-domain.test.js` (o archivo dedicado) | Cobertura de la regla pura `estadoDelExtra` (RF-03) con bordes de 24h | T103 |
| `test/monitor-history.test.js` (**nuevo**) | Cobertura de `usage-history.js` sobre FS temporal: detección, sellado, archivo corrupto/ausente, seed explícito | T104 |
| `test/monitor-view.test.js` | Extender la integración existente de `createSnapshotSource` con el caso de aviso por backoff (RF-06) y con `vista.historico` end-to-end | T106 |
| `test/monitor-render.test.js` | Snapshot del layout con la sección Histórico al pie, sin marco rojo ni `LIMITE N%` en el título | T105 |

**Nada más se toca.** `CHANGELOG.md` y `notes.md` quedan fuera salvo que T107 encuentre
necesario anotar un gotcha puntual (decisión de implementación, no de alcance).

**Nota de ajuste (post-T104)**: el cableado de *lectura* de `usage-history.js` hacia
`snapshot-source.js`/`construirVista` se movió de T104 a T105 porque T104 implementó,
por fidelidad a `tasks.md` en su versión original, solo el lado de **escritura**
(`registrarHistorico()` tras `buildView`); ver la nota completa en `tasks.md` → T105.

**Nota de ajuste (post-T106)**: mismo tipo de hueco — `tasks.md` en su versión original
solo listaba `snapshot-source.js` para T106, así que el parámetro `usageFetcher` quedó
aceptado por `createSnapshotSource` pero sin nadie que lo inyecte en producción; se
agrega `commands/monitor.js` al alcance de T106 (compartir el `usageFetcher` entre
`createLimitsReader` y `createSnapshotSource`); ver la nota completa en `tasks.md` →
T106.

---

## Constitution alignment

| Principio | Veredicto | Cómo aplica |
|---|---|---|
| **P1** — Contratos antes que tecnologías | cumple | `estadoDelExtra`/`siguienteRegistro` son funciones puras en lenguaje de dominio (`gastoExtra`, `registroAbierto`, `ahora`), sin depender de la forma del JSON de la API ni de cómo se persiste. `usage-history.js` es el único adaptador que conoce la ruta del archivo; reemplazarlo (otro formato, otra ubicación) no toca el dominio. |
| **P2** — Hexagonal con enforcement | cumple | `gasto-extra.js` vive en `domain/`, sin `node:fs` ni `Date.now()` — enforcement ya existente (`test/monitor-layers.test.js`, corregido en `SHS-H3-T26`) lo cubre sin cambios. `usage-history.js` es un adaptador puro de I/O que delega la decisión de negocio al dominio. |
| **P3** — Medir antes de optimizar | cumple | No hay optimización de performance en este plan: es un fix de lógica + un archivo JSON minúsculo (un registro abierto + una lista corta de archivados). |
| **P4** — Modularidad por capas | cumple | `gasto-extra.js` es un archivo de dominio nuevo, de una sola responsabilidad, igual que `precios.js`/`actividad.js`/`ventanas.js`. No se agrupa por feature ("historico/") sino por capa, como el resto de `src/monitor/`. |
| **P5** — Observabilidad | cumple, alcance acotado | El aviso de datos viejos (RF-06) es la pieza de observabilidad de este plan; usa el canal `vista.avisos` ya existente, no crea uno nuevo. |
| **P6** — Human-in-the-loop | cumple | La única escritura nueva es `usage-history.json`, y solo registra hechos que la propia API ya informó (montos y flags), nunca datos inventados. El seed de la fecha `2026-08-06` requiere una entrada explícita del humano (flag), nunca se aplica por defecto. |
| **P9** — Simplicity First | cumple | Un archivo de dominio de ~20-30 líneas, un adaptador de persistencia sin dependencias, reutilización íntegra del canal de avisos existente. No se crea un puerto (`RegistroExtraPort`) nuevo porque no hay un segundo adaptador real ni un fake adicional más allá del que ya usan los tests (fakes de FS por tmpdir, mismo patrón que `usage-fetcher.js`). |
| **P10** — Surgical Changes | cumple | Los archivos existentes que se tocan (`usage-limits-reader.js`, `panel-presenter.js`, `arbol.js`, `snapshot-source.js`, `panel-layout.js`, `commands/monitor.js`) reciben cambios quirúrgicos, acotados a las líneas citadas en la tabla de arriba. No se reordena ni se "mejora" nada adyacente. |

### Decisión que requiere ADR: se reintroduce persistencia propia del monitor

`specs/SHS-H3-monitor-tokens/spec.md` (Non-goals) dice explícitamente: *"Persistencia de
histórico propio. El monitor lee el estado actual de los jsonl en cada tick; no mantiene
su propia base de datos ni agrega una fuente de verdad nueva."* Este plan la contradice
**deliberadamente, y solo para el gasto extra**: sin un registro en disco es imposible
saber cuándo se detectó por primera vez el límite alcanzado (el dato no está en ningún
otro lado — la API solo informa el estado actual, no el historial). Es una decisión de
arquitectura real (nueva fuente de verdad, nuevo adaptador con estado persistente) y,
según la regla de `AGENTS.md` ("si un task cambia la arquitectura... su cierre exige...
un ADR en `docs/decisions/`"), **necesita un ADR antes de cerrar T104**. Se deja anotado
aquí y en `tasks.md`; no bloquea escribir `spec.md`/`plan.md`/`tasks.md`, pero sí bloquea
dar T104 por cerrada sin el ADR (`/adr-new`).

---

## Dependencies

### Deben existir ANTES de empezar

- [x] `src/monitor/domain/ventanas.js` — patrón de función pura con `ahora` inyectado, se
      replica en `gasto-extra.js`.
- [x] `src/monitor/adapters/usage-fetcher.js` (`estado()`, líneas 63-65) — ya existe, solo
      falta un consumidor real (T106).
- [x] `src/monitor/adapters/snapshot-source.js` (canal `avisos`, líneas 95-103) — ya
      existe, se reutiliza tal cual.
- [x] `test/helpers-monitor.js` (`mkClaudeHome` con `config`) — ya existe, permite
      fixturear `cachedUsageUtilization.utilization.extra_usage` con el payload real sin
      tocar la red.

### Se crean DURANTE

- [ ] `src/monitor/domain/gasto-extra.js`, `src/monitor/adapters/usage-history.js`,
      `test/monitor-presenter.test.js`, `test/monitor-history.test.js`.

### Se modifican DURANTE

- [ ] `src/monitor/adapters/usage-limits-reader.js`, `panel-presenter.js`, `arbol.js`,
      `snapshot-source.js`, `panel-layout.js`, `src/commands/monitor.js`, `README.md`,
      `test/monitor-domain.test.js`, `test/monitor-view.test.js`,
      `test/monitor-render.test.js`.

---

## Risks y mitigaciones

| Risk | Impact | Likelihood | Mitigation |
|------|--------|-----------|------------|
| El umbral de 24h queda como lógica ad-hoc en el adaptador en vez de regla de dominio, y ningún test lo detecta | M | M | `test/monitor-layers.test.js` (ya existente) falla si `gasto-extra.js` no cumple las reglas de dominio puro; se agrega ahí, no en un archivo nuevo sin enforcement |
| `usage-history.json` corrupto tumba el panel completo | H | Baja | Lectura con `try/catch`, arranca vacío ante cualquier fallo de parseo — mismo patrón que `usage-fetcher.js::readCache` |
| El nuevo campo `vista.historico` rompe algún consumidor existente de `--json` que no lo espera | L | Baja | Es un campo aditivo (nunca se quita ni se renombra uno existente); `renderJson` sigue siendo `JSON.stringify(vista)` sin transformación |
| La clave de dedup nueva (`tipo+modelo+porcentaje+reset`) deja de deduplicar un caso real que hoy sí colapsaba a propósito | M | Baja | Test explícito del caso "duplicado real" (`weekly_all` == `seven_day`) además del caso "colisión falsa" (`Fable` vs `seven_day`) |
| El seed manual de `detectadoEn` se aplica sin querer en cada arranque en vez de una sola vez | M | Baja | El seed solo actúa si **no** hay registro persistido todavía; una vez que existe `usage-history.json`, el flag se ignora — test dedicado |

---

## Research notes

### D1: Ubicación de la regla de 24h — archivo nuevo `domain/gasto-extra.js`, no `ventanas.js` ni `consumo.js`

`plan-inicial.md` dejaba abierto "domain/ventanas.js o consumo.js". Ninguno de los dos
encaja: `ventanas.js` opera sobre `EventoDeUso` (tokens por llamada) y buckets horarios;
`consumo.js` es el acumulador monoide de tokens/costo. La regla de 24h no opera sobre
ninguno de los dos — opera sobre `{alcanzado, detectadoEn}` de un gasto extra, un
concepto distinto. Un archivo nuevo, chico y de una sola responsabilidad, sigue el mismo
patrón que ya usa el resto de `src/monitor/domain/` (un archivo por concepto: precios,
eventos, consumo, ventanas, actividad, arbol, formato) y evita forzar una relación que no
existe entre "cuándo un gasto extra pasa a histórico" y "cómo se agrupan tokens en
buckets horarios".
**Alternativa descartada**: meterlo en `ventanas.js` — se descarta porque acoplaría dos
conceptos sin relación real y complicaría el archivo que ya cubre el bucketing horario
(RF-06 de la spec hermana).

### D2: `--json` expone `vista.historico` sin romper "renderJson no transforma nada"

`plain-renderer.js:9-11` documenta como regla dura que `renderJson` expone el modelo de
DOMINIO tal cual, y que el panel consume la proyección aparte de `panel-presenter.js`.
Si la separación vivas/históricas viviera solo en `panel-presenter.js`, `--json` nunca
podría exponer `historico` sin violar esa regla (o sin agregar una segunda ruta de datos
que puede divergir con el tiempo — exactamente el antipatrón que D3 de `plan.md` de
`SHS-H3-monitor-tokens` ya había descartado). Por eso `vista.historico` se construye en
`domain/arbol.js` (el modelo canónico), y `panel-presenter.js` solo lo consume — igual
que ya consume `vista.limites`.
**Alternativa descartada**: calcular `historico` únicamente en `panel-presenter.js` y
hacer que `--json` llame a `presentar()` en vez de exponer el dominio crudo — se
descarta porque cambiaría el contrato ya documentado de `renderJson` para todos los
demás campos, no solo para este.

### D3: La decisión de abrir/cerrar el registro es un reducer puro, la mecánica de leer/escribir es del adaptador

Separar `siguienteRegistro()` (pura, testeable sin FS) de `usage-history.js` (adaptador
que solo llama a esa función y persiste lo que devuelve) evita que la lógica de negocio
("¿esto es un reset?") quede enterrada dentro de un `try/catch` de I/O, donde sería
mucho más difícil de testear con los bordes exactos (justo en el instante del reset, con
igualdad exacta de `usedCredits`, etc.).
**Alternativa descartada**: resolver todo dentro de `usage-history.js` sin una función
pura separada — más rápido de escribir, pero el test de "detecta el reset" quedaría
atado a un `tmpdir` real en vez de a datos en memoria, y sería un test más lento y menos
preciso en los bordes.

---

## Implementation strategy

### Approach

- [ ] Rollout: incremental, un commit por task (T101-T107), sin feature flag — es
      aditivo salvo por los tres archivos con bug real (`usage-limits-reader.js`,
      `panel-presenter.js`), que se corrigen con test de regresión en el mismo commit.
- [ ] Test strategy: unit sobre `gasto-extra.js` con fechas fijas; integración de
      `usage-history.js` sobre FS temporal; integración de `panel-presenter.js` sobre
      fixtures de payload real; e2e sobre `--json`/`--once` para confirmar `historico` en
      la salida.

### Rollback plan

Cada task es un commit independiente y reversible por separado: revertir T101/T102
regresa al bug original (extra en 107%, dedup por porcentaje+reset) sin afectar T103-T106
(que son aditivos). No hay migración de datos que deshacer: `usage-history.json` es un
archivo nuevo que, si se revierte T104, simplemente deja de leerse (no rompe nada que ya
exista).

---

## Observability

- **Métricas**: no aplica una capa nueva — el propio panel sigue siendo la superficie de
  observabilidad del consumo.
- **Logs**: el aviso de RF-06 usa el canal `vista.avisos` ya existente; no se agrega
  logging a archivo.
- **Alertas**: sin cambios a los códigos de salida (`0`/`1`/`2`) — una fila histórica
  deliberadamente **no** cuenta para la alarma del header ni para el exit code, porque ya
  no es información accionable (RF-05).
- **Dashboard**: el panel en sí, sección "Histórico" nueva al pie.

---

## Checklist antes de avanzar a Tasks

- [x] ¿Plan alineado con constitución (verificado punto por punto)? Sí. El ADR que este
      plan pedía (D: persistencia propia del monitor) ya está creado — ver el punto de
      ADRs abajo.
- [x] ¿Data contracts completos y sin ambigüedad? Sí — `PeriodoDeGastoExtra`,
      `usage-history.json`, `snapshot.registroExtra` y los campos nuevos de
      `VistaMonitor` documentados.
- [x] ¿Risks identificados con mitigación concreta? Sí, 5 riesgos con mitigación
      puntual.
- [x] ¿Dependencies verificadas como existentes o planeadas? Sí.
- [x] ¿Developer lead aprobó el plan? Sí — 2026-08-10, en la sesión del orquestador (ver
      `Aprobado` en el encabezado).
- [x] ¿ADRs creados para decisiones significativas? Sí —
      `docs/decisions/20260810-monitor-persiste-historico-de-gasto-extra.md`, verificado
      en disco y confirmado por el `reviewer`
      (`progress/SHS-H3-extra-historico/review.md`, sección Constitución: "Arquitectura
      documentada - OK").
