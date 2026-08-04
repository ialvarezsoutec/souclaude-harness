# Tasks: Monitor de tokens en terminal (`souclaude monitor`)

**Spec**: [spec.md](./spec.md)
**Plan**: [plan.md](./plan.md)
**Estimated total**: ~14-16 horas (27 tareas)
**Status**: in progress

---

## Reglas de escritura

- Un commit por task, con footer `Refs: <ID-task>`. No en batch al final.
- ID de task: `SHS-H3-T<nn>` (`SHS-H3-T01`…`SHS-H3-T27`). Primer spec del hito → bloque
  `T01`-`T99` (no hace falta el padding a 3 dígitos del template porque el plan aprobado
  ya numeró T01…T27; se respeta esa numeración literal).
- Regla de asignación de modelo (del plan aprobado): `mecanica` → **Sonnet** ·
  `estandar` → **Sonnet** · `compleja` → **Opus**.

> **Excepción documentada (adaptadores/renderers complejos)**: T07, T09, T13, T15 y T16
> son componentes únicos y verificables en aislamiento (árbol agregado, tailer
> incremental, composición de snapshot, renderer TTY, layout con overflow). Fragmentarlos
> no mejoraría la testabilidad — cada uno es una sola responsabilidad cohesiva que ya
> excede los 15-30 min de un task mecánico. Van clasificados `compleja` y asignados a
> Opus en vez de fragmentarse en tasks artificiales.

---

## Estado real verificado en disco (2026-08-04, T27)

Reverificado en disco para T27 (no se confía en lo reportado por otras tareas): se listó
`src/monitor/`, `src/commands/`, `test/` y se corrió `npm test`.

- **Implementadas, presentes en disco y con `npm test` en verde**: T01-T18, T20-T22,
  T24, T26. Incluye el comando completo (`src/commands/monitor.js`, 272 líneas,
  wireado en `src/cli.js`) y `node bin/cli.mjs monitor --once` corre sin excepción
  sobre proyectos reales de esta máquina.
- **T19 — `--emit-router`**: `src/monitor/adapters/router-log-writer.js` (249 líneas)
  existe, está wireado en `src/cli.js` (flags `--emit-router`, `--hito`, `--task`,
  `--agente`, `--resultado`, `--rework`, `--motivo`) y aparece en `node bin/cli.mjs
  --help`. Se marca hecha.
- **T25 — test e2e del comando**: `test/monitor-cmd.test.js` (326 líneas) existe, pero
  al correrlo (`node --test test/monitor-cmd.test.js`) el archivo falla como suite
  (`ERR_TEST_FAILURE`, exit code 1) aunque sus dos subtests visibles pasan — huele a un
  handle sin cerrar o una excepción no capturada fuera de un `test()`. **No se marca
  como hecha**: el archivo está en disco pero no verificado.
- **T23 — árbol agregado sobre fixtures**: `test/monitor-view.test.js` no existe en
  disco. Pendiente. (La cobertura del árbol agregado hoy vive dentro de
  `test/monitor-domain.test.js`, pero eso no es lo que T23 pide como archivo propio.)
- **Fila nueva — presenter**: `src/monitor/adapters/panel-presenter.js` (403 líneas) no
  estaba en el plan original. Apareció al construir T16/T18: el dominio (`arbol.js`)
  produce un árbol anidado proyecto→sesión→agente→modelo, pero el panel (`panel-layout.js`,
  `plain-renderer.js`) consume filas planas ya ordenadas y recortadas a `--top`. El
  presenter es el adaptador que aplana ese árbol — sin él, `panel-layout`/`plain-renderer`
  tendrían que conocer la forma del dominio, violando P2. Se agrega como fila propia
  abajo, no dentro de T16.

Los checkboxes de abajo reflejan exactamente esto: `[x]` solo si el archivo existe **y**
lo que lo verifica pasa; sin marca si está en curso, sin verificar o pendiente.

---

## Tabla de tareas

| # | Título | Archivos | Dependencias | Clase | Modelo |
|---|---|---|---|---|---|
| T01 | Tabla de precios, alias y cálculo de costo | `domain/precios.js` | — | mecanica | Sonnet |
| T02 | Normalizador línea jsonl → EventoDeUso | `domain/eventos.js` | — | estandar | Sonnet |
| T03 | Acumulador Consumo + dedup por `message.id` | `domain/consumo.js` | T01,T02 | estandar | Sonnet |
| T04 | Ventanas de tiempo, parseo de duraciones, buckets horarios | `domain/ventanas.js` | T02 | mecanica | Sonnet |
| T05 | Clasificador de actividad | `domain/actividad.js` | T02 | estandar | Sonnet |
| T06 | Formato puro: tokens, dinero, duración, barra, sparkline, `displayWidth`, `columns` | `domain/formato.js` | — | estandar | Sonnet |
| T07 | Árbol agregado proyecto→sesión→agente→modelo | `domain/arbol.js` | T01-T05 | **compleja** | **Opus** |
| T08 | Rutas de `~/.claude` e índice de archivos | `adapters/claude-home.js` | — | mecanica | Sonnet |
| T09 | Tailer incremental (offset, resto, truncado, prefiltro) | `adapters/jsonl-tailer.js` | T08 | **compleja** | **Opus** |
| T10 | `sessions/*.json` + pid vivo | `adapters/session-reader.js` | T08 | mecanica | Sonnet |
| T11 | Límites desde `.claude.json` con cache por mtime | `adapters/usage-limits-reader.js` | T08 | estandar | Sonnet |
| T12 | Puertos + caso de uso `build-view` | `application/*` | T07 | estandar | Sonnet |
| T13 | SnapshotSource: compone y mantiene estado entre ticks | `adapters/snapshot-source.js` | T09-T12 | **compleja** | **Opus** |
| T14 | `caps.js`: TTY, columnas, color, Unicode vs ASCII | `adapters/caps.js` | — | mecanica | Sonnet |
| T15 | Renderer TTY: alternate buffer, frames, resize, teclas, cleanup | `adapters/tty-renderer.js` | T06,T12,T14 | **compleja** | **Opus** |
| T16 | Layout del panel: secciones, presupuesto de altura, overflow, breakpoints | `adapters/panel-layout.js` | T06,T14 | **compleja** | **Opus** |
| T17 | Renderer plano + JSON/NDJSON | `adapters/plain-renderer.js` | T06,T12,T16 | mecanica | Sonnet |
| T18 | Comando `monitor` + wiring en `cli.js` + help + exit codes | `commands/monitor.js`, `cli.js` | T13,T15,T17 | estandar | Sonnet |
| T18b | Presenter: aplana el árbol anidado del dominio a filas planas para el panel | `adapters/panel-presenter.js` | T07,T16 | estandar | Sonnet |
| T19 | Writer de `model-router.jsonl` + `--emit-router` | `adapters/router-log-writer.js` | T12,T18 | estandar | Sonnet |
| T20 | Helper de fixtures de `~/.claude` falso | `test/helpers-monitor.js` | T08 | estandar | Sonnet |
| T21 | Tests de dominio (dedup, costos, ventanas, actividad, formato) | `test/monitor-domain.test.js` | T20,T01-T06 | estandar | Sonnet |
| T22 | Tests del tailer (incremental, línea partida, truncado, error) | `test/monitor-tailer.test.js` | T20,T09 | estandar | Sonnet |
| T23 | Test del árbol agregado sobre fixtures | `test/monitor-view.test.js` | T20,T07,T13 | estandar | Sonnet |
| T24 | Tests de render (ancho exacto a 80/100, sin ANSI con `color:false`) | `test/monitor-render.test.js` | T16,T17 | estandar | Sonnet |
| T25 | Test e2e del comando (`--once --json`) | `test/monitor-cmd.test.js` | T18,T20 | estandar | Sonnet |
| T26 | Test de enforcement de capas P2 | `test/monitor-layers.test.js` | T01-T07 | mecanica | Sonnet |
| T27 | Docs: README, CHANGELOG, notes.md | `README.md`, `CHANGELOG.md`, `notes.md` | T18 | mecanica | Sonnet |

---

## Task inventory (estado)

- [x] **SHS-H3-T01** — Tabla de precios, alias y cálculo de costo.
      `src/monitor/domain/precios.js` · mecanica · Sonnet
      Verificación: implementado en disco (82 líneas). Falta la cobertura de T21
      (números de costo hardcodeados en el test, precio intro de sonnet antes/después del
      2026-08-31, alias desconocido).

- [x] **SHS-H3-T02** — Normalizador línea jsonl → `EventoDeUso`.
      `src/monitor/domain/eventos.js` · estandar · Sonnet · depende de: ninguna
      Verificación: implementado en disco (126 líneas). Falta T21 (caso
      `isApiErrorMessage: true` descartado sin `usage`).

- [x] **SHS-H3-T03** — Acumulador `Consumo` + dedup por `message.id`.
      `src/monitor/domain/consumo.js` · estandar · Sonnet · depende de: T01, T02
      Verificación: implementado en disco (140 líneas). Falta el test no negociable de
      dedup (T21): "3 líneas con el mismo `message.id` → 1 llamada".

- [x] **SHS-H3-T04** — Ventanas de tiempo, parseo de duraciones, buckets horarios.
      `src/monitor/domain/ventanas.js` · mecanica · Sonnet · depende de: T02
      Verificación: implementado en disco (114 líneas). Falta T21.

- [x] **SHS-H3-T05** — Clasificador de actividad.
      `src/monitor/domain/actividad.js` · estandar · Sonnet · depende de: T02
      Verificación: implementado en disco (74 líneas). Falta T21 (`pid = process.pid` →
      vivo; `pid = 999999` → muerto).

- [x] **SHS-H3-T06** — Formato puro: tokens, dinero, duración, barra, sparkline,
      `displayWidth`, `columns`.
      `src/monitor/domain/formato.js` · estandar · Sonnet · depende de: ninguna
      Verificación: implementado en disco (324 líneas). Falta T21/T24 (`displayWidth('日本語')
      === 6`, `displayWidth(pc.red('abc')) === 3`).

- [x] **SHS-H3-T07** — Árbol agregado proyecto→sesión→agente→modelo.
      `src/monitor/domain/arbol.js` · **compleja** · **Opus** · depende de: T01-T05
      Verificación: implementado en disco (471 líneas). Cubierto por
      `test/monitor-domain.test.js` (T21), en verde.

- [x] **SHS-H3-T08** — Rutas de `~/.claude` e índice de archivos.
      `src/monitor/adapters/claude-home.js` · mecanica · Sonnet · depende de: ninguna
      Verificación: implementado en disco (152 líneas).

- [x] **SHS-H3-T09** — Tailer incremental (offset, resto, truncado, prefiltro).
      `src/monitor/adapters/jsonl-tailer.js` · **compleja** · **Opus** · depende de: T08
      Verificación: implementado en disco (176 líneas). Cubierto por
      `test/monitor-tailer.test.js` (T22), en verde: línea partida, truncado, archivo
      ilegible → `vista.avisos`.

- [x] **SHS-H3-T10** — `sessions/*.json` + pid vivo.
      `src/monitor/adapters/session-reader.js` · mecanica · Sonnet · depende de: T08
      Verificación: implementado en disco (81 líneas).

- [x] **SHS-H3-T11** — Límites desde `.claude.json` con cache por mtime.
      `src/monitor/adapters/usage-limits-reader.js` · estandar · Sonnet · depende de: T08
      Verificación: implementado en disco (117 líneas). Cubierto por
      `test/monitor-domain.test.js` (T21), en verde.

- [x] **SHS-H3-T12** — Puertos + caso de uso `build-view`.
      `src/monitor/application/ports.js`, `src/monitor/application/build-view.js` ·
      estandar · Sonnet · depende de: T07
      Verificación: implementados en disco (49 y 39 líneas).

- [x] **SHS-H3-T13** — `SnapshotSource`: compone y mantiene estado entre ticks.
      `src/monitor/adapters/snapshot-source.js` · **compleja** · **Opus** · depende de:
      T09-T12
      Verificación: implementado en disco (179 líneas).

- [x] **SHS-H3-T14** — `caps.js`: TTY, columnas, color, Unicode vs ASCII.
      `src/monitor/adapters/caps.js` · mecanica · Sonnet · depende de: ninguna
      Verificación: implementado en disco (80 líneas).

- [x] **SHS-H3-T15** — Renderer TTY: alternate buffer, frames, resize, teclas, cleanup.
      `src/monitor/adapters/tty-renderer.js` · **compleja** · **Opus** · depende de: T06,
      T12, T14
      Verificación: implementado en disco (243 líneas).

- [x] **SHS-H3-T16** — Layout del panel: secciones, presupuesto de altura, overflow,
      breakpoints.
      `src/monitor/adapters/panel-layout.js` · **compleja** · **Opus** · depende de: T06,
      T14
      Verificación: implementado en disco (980 líneas). Cubierto por
      `test/monitor-render.test.js` (T24), en verde (contrato de ancho exacto en 90
      combinaciones).

- [x] **SHS-H3-T17** — Renderer plano + JSON/NDJSON.
      `src/monitor/adapters/plain-renderer.js` · mecanica · Sonnet · depende de: T06, T12,
      T16
      Verificación: implementado en disco (50 líneas).

- [x] **SHS-H3-T18** — Comando `monitor` + wiring en `cli.js` + help + exit codes.
      `src/commands/monitor.js`, `src/cli.js` · estandar · Sonnet · depende de: T13, T15,
      T17
      Verificación: implementado en disco (272 líneas), registrado en `src/cli.js`
      (`COMMANDS`, `--help`). `node bin/cli.mjs monitor --once` corre sin excepción sobre
      proyectos reales de esta máquina; exit codes 0/1/2 confirmados manualmente.

- [x] **SHS-H3-T18b** — Presenter: aplana el árbol anidado del dominio a filas planas.
      `src/monitor/adapters/panel-presenter.js` · estandar · Sonnet · depende de: T07, T16
      **No estaba en el plan original.** Se agregó al construir T16/T18: el dominio
      produce un árbol proyecto→sesión→agente→modelo (T07), pero `panel-layout.js` y
      `plain-renderer.js` consumen filas ya planas, ordenadas y recortadas a `--top`.
      Sin este adaptador, el renderer tendría que conocer la forma del árbol de dominio
      — violación de P2. Verificación: implementado en disco (403 líneas).

- [x] **SHS-H3-T19** — Writer de `model-router.jsonl` + `--emit-router`.
      `src/monitor/adapters/router-log-writer.js` · estandar · Sonnet · depende de: T12,
      T18
      Verificación: implementado en disco (249 líneas). Wireado en `src/cli.js`
      (`--emit-router`, `--hito`, `--task`, `--agente`, `--resultado`, `--rework`,
      `--motivo`) y aparece en `node bin/cli.mjs --help`.

- [x] **SHS-H3-T20** — Helper de fixtures de `~/.claude` falso.
      `test/helpers-monitor.js` · estandar · Sonnet · depende de: T08
      Verificación: implementado en disco (209 líneas).

- [x] **SHS-H3-T21** — Tests de dominio (dedup, costos, ventanas, actividad, formato).
      `test/monitor-domain.test.js` · estandar · Sonnet · depende de: T20, T01-T06
      Verificación: implementado en disco (388 líneas), en verde.

- [x] **SHS-H3-T22** — Tests del tailer (incremental, línea partida, truncado, error).
      `test/monitor-tailer.test.js` · estandar · Sonnet · depende de: T20, T09
      Verificación: implementado en disco (302 líneas), en verde.

- [ ] **SHS-H3-T23** — Test del árbol agregado sobre fixtures.
      `test/monitor-view.test.js` · estandar · Sonnet · depende de: T20, T07, T13
      Verificación: `test/monitor-view.test.js` no existe en disco. Pendiente. (Hoy la
      cobertura del árbol agregado vive dentro de `test/monitor-domain.test.js`, pero eso
      no sustituye el archivo propio que pide esta task.)

- [x] **SHS-H3-T24** — Tests de render (ancho exacto a 80/100, sin ANSI con
      `color:false`).
      `test/monitor-render.test.js` · estandar · Sonnet · depende de: T16, T17
      Verificación: implementado en disco (407 líneas), en verde.

- [ ] **SHS-H3-T25** — Test e2e del comando (`--once --json`). **En curso**: el archivo
      ya existe en disco (326 líneas) pero al correrlo solo (`node --test
      test/monitor-cmd.test.js`) la suite falla (`ERR_TEST_FAILURE`, exit 1) aunque los
      dos subtests visibles pasan — no se marca como hecho hasta que quede en verde.
      `test/monitor-cmd.test.js` · estandar · Sonnet · depende de: T18, T20
      Verificación pendiente: aislar y corregir la causa del `ERR_TEST_FAILURE` (huele a
      handle sin cerrar o excepción fuera de un `test()`).

- [x] **SHS-H3-T26** — Test de enforcement de capas P2.
      `test/monitor-layers.test.js` · mecanica · Sonnet · depende de: T01-T07
      Verificación: implementado en disco (130 líneas), en verde.

- [x] **SHS-H3-T27** — Docs: README, CHANGELOG, notes.md.
      `README.md`, `CHANGELOG.md`, `notes.md` · mecanica · Sonnet · depende de: T18
      Verificación: `README.md` suma la sección `souclaude monitor` (modos, flags,
      exit codes, `--emit-router`, bloque de honestidad de datos); `CHANGELOG.md` suma la
      entrada `[2.4.0]`; `notes.md` suma seis gotchas de la construcción del monitor.

---

## Olas de paralelismo

| Ola | Tareas | Nota |
|---|---|---|
| 1 | T01, T02, T06, T08, T14 | Sin dependencias. 5 en paralelo, todo Sonnet. **Completada y en disco.** |
| 2 | T03, T04, T05 ‖ T09, T10, T11 ‖ T20 | **Completada y en disco, verificada por T21/T22.** |
| 3 | T07 (Opus) ‖ T16 (Opus) ‖ T21 ‖ T22 ‖ T26 | **Completada y en disco, en verde.** |
| 4 | T12 → T13 (Opus) ‖ T15 (Opus) ‖ T17 ‖ T24 | **Completada y en disco, en verde.** |
| 5 | **T18 sola** | Único archivo compartido con el código existente: `src/cli.js`. Commit propio. **Completada** — `node bin/cli.mjs monitor --once` corre sin excepción sobre proyectos reales. |
| 6 | T18b ‖ T19 ‖ T23 ‖ T25 ‖ T27 | T18b (presenter, no planeada) y T19 (`--emit-router`) completadas y en disco. **T23 pendiente** (sin archivo). **T25 en curso** (archivo en disco, suite en rojo). T27 completada (este cambio). |

Único punto de contención real: **T18 toca `src/cli.js`**, compartido con los cinco
comandos existentes y donde los flags nuevos podrían colisionar semánticamente con
`--force`/`--dry-run`. Va sola, en su propio commit. Todo lo demás es subárbol virgen.

---

## Checkpoints humanos

- [x] **Después de la ola 2 (T03-T05, T09-T11, T20)**: confirmado — dominio completo y
      los tres lectores de adapters en disco y verificados.
- [x] **Después de T18**: confirmado en vivo — `node bin/cli.mjs monitor --once` corre
      sin excepción sobre los proyectos reales de esta máquina.
- [ ] **Después de T26 (final)**: `npm test` corrido (225 tests): 224 en verde, **1 en
      rojo** (`test/monitor-cmd.test.js`, T25 — ver nota arriba). No está en verde
      todavía; falta antes de abrir PR draft.

---

## Cierre

- [ ] `npm test` → 224/225 en verde. Falla `test/monitor-cmd.test.js` (T25): la suite
      completa termina en `ERR_TEST_FAILURE` aunque los subtests visibles pasan. Falta
      diagnosticar y corregir antes de dar el cierre por bueno.
- [x] `node bin/cli.mjs monitor --once` sobre esta máquina → panel con datos reales.
- [ ] `node bin/cli.mjs verify --strict` y `node bin/cli.mjs upgrade --dry-run --yes` —
      no re-verificados en esta pasada (T27 solo tocó docs); pendiente de confirmar antes
      del cierre.
- [x] `notes.md` actualizado (T27).
- [ ] ADR de la decisión "enforcement de P2 por test, no dependency-cruiser" (`/adr-new`,
      ver `plan.md`) — sigue pendiente, no es parte del alcance de T27.
- [ ] PR draft abierto contra `main` con la plantilla completa (tras 2-3 commits, no al
      final).
- [ ] Status de `spec.md` cambiado a `implemented` — sigue pendiente: falta cerrar T23,
      T25 y el ADR primero.
