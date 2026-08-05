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

## Estado real verificado en disco (2026-08-05, cierre T23/T25/T26)

Reverificado en disco: `npm test` completo, 290/290 en verde.

- **Todas las tasks T01-T27 implementadas y verificadas en disco.**
- **T23 — árbol agregado sobre fixtures**: `test/monitor-view.test.js` (457 líneas) ya
  estaba en disco (commit `fe58bb0`, de una pasada anterior no reflejada en este
  archivo). 23/23 en verde.
- **T25 — test e2e del comando**: el `ERR_TEST_FAILURE` documentado no reprodujo en esta
  pasada — dos corridas limpias de `node --test test/monitor-cmd.test.js`, 17/17, exit 0.
  Era flaky (handle/timing) o ya se corrigió como efecto colateral de trabajo posterior;
  no se encontró código que arreglar. Se marca hecha sobre la base de la evidencia actual.
- **T26 — bug real encontrado y corregido**: el enforcement de P2 (`sinComentariosDeLinea`
  en `test/monitor-layers.test.js`) marcaba `arbol.js` y `precios.js` como violación por
  usar `Date.now()` — pero el `Date.now()` detectado estaba **dentro de un comentario**
  que documenta, precisamente, que el dominio no lo usa. Causa: `/\/\/.*$/` sin la flag
  `s` nunca alcanza a matchear cuando la línea tiene un `\r` colgando al final (CRLF) —
  `.` no consume `\r` y `$` exige fin de string real, así que el `replace()` no hacía nada
  y el comentario completo sobrevivía. Corregido normalizando CRLF→LF antes de partir por
  línea, con test de regresión. Commit `3832c41`.
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

- [x] **SHS-H3-T23** — Test del árbol agregado sobre fixtures.
      `test/monitor-view.test.js` · estandar · Sonnet · depende de: T20, T07, T13 · commit
      `fe58bb0`
      Verificación: implementado en disco (457 líneas), 23/23 en verde.

- [x] **SHS-H3-T24** — Tests de render (ancho exacto a 80/100, sin ANSI con
      `color:false`).
      `test/monitor-render.test.js` · estandar · Sonnet · depende de: T16, T17
      Verificación: implementado en disco (407 líneas), en verde.

- [x] **SHS-H3-T25** — Test e2e del comando (`--once --json`).
      `test/monitor-cmd.test.js` · estandar · Sonnet · depende de: T18, T20
      Verificación: `node --test test/monitor-cmd.test.js` corrido dos veces seguidas,
      17/17 en verde ambas, exit 0. El `ERR_TEST_FAILURE` que bloqueaba esta task no
      reprodujo — no se encontró código que arreglar, se documenta como resuelto sobre
      evidencia actual, no sobre suposición.

- [x] **SHS-H3-T26** — Test de enforcement de capas P2. **Bug real encontrado y
      corregido** (no en el enforcement en sí, sino en el propio test que lo audita):
      `sinComentariosDeLinea` no limpiaba comentarios en archivos CRLF, así que un
      comentario que citaba `Date.now()` para explicar que el dominio NO lo usa se leía
      como una violación real. Corregido normalizando CRLF→LF antes de partir por línea,
      con test de regresión agregado.
      `test/monitor-layers.test.js` · mecanica · Sonnet · depende de: T01-T07 · commit
      `3832c41`
      Verificación: implementado en disco (140 líneas), 5/5 en verde.

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
| 6 | T18b ‖ T19 ‖ T23 ‖ T25 ‖ T27 | **Todas completadas.** T18b (presenter, no planeada) y T19 (`--emit-router`) ya estaban. T23 (archivo ya existía, sin reflejar en este doc), T25 (ERR_TEST_FAILURE no reprodujo) y T27 cerradas en esta pasada. |

Único punto de contención real: **T18 toca `src/cli.js`**, compartido con los cinco
comandos existentes y donde los flags nuevos podrían colisionar semánticamente con
`--force`/`--dry-run`. Va sola, en su propio commit. Todo lo demás es subárbol virgen.

---

## Checkpoints humanos

- [x] **Después de la ola 2 (T03-T05, T09-T11, T20)**: confirmado — dominio completo y
      los tres lectores de adapters en disco y verificados.
- [x] **Después de T18**: confirmado en vivo — `node bin/cli.mjs monitor --once` corre
      sin excepción sobre los proyectos reales de esta máquina.
- [x] **Después de T26 (final)**: `npm test` → 290/290 en verde.

---

## Cierre

- [x] `npm test` → 290/290 en verde.
- [x] `node bin/cli.mjs monitor --once` sobre esta máquina → panel con datos reales.
- [x] `node bin/cli.mjs verify --strict` limpio y `node bin/cli.mjs upgrade --dry-run
      --yes` corre sin excepción (conflictos esperados en archivos editados a mano:
      `CLAUDE.md`, `report-template.md` → `.new`).
- [x] `notes.md` actualizado (T27).
- [ ] ADR de la decisión "enforcement de P2 por test, no dependency-cruiser" (`/adr-new`,
      ver `plan.md`) — sigue pendiente, fuera del alcance de este cierre (T23/T25/T26).
- [ ] PR draft abierto contra `main` con la plantilla completa (tras 2-3 commits, no al
      final). **Nota**: esta rama tiene 3 commits de `SHS-H2-vault-clonado-seguro`
      mezclados en su historia por un checkout accidental durante la sesión — decisión
      del dueño: dejarlos, se limpian después si hace falta. El PR de esta rama va a
      mostrar ese diff extra (`vault.js`, `cli.js`, `specs/SHS-H2-vault-clonado-seguro/`)
      hasta que alguien lo resuelva con un rebase.
- [ ] Status de `spec.md` cambiado a `implemented` — falta el ADR y el PR antes de darlo
      por cerrado del todo; T23/T25/T26 ya no son bloqueo.
