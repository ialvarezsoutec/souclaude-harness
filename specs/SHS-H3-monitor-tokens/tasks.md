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

## Estado real verificado en disco (2026-08-04)

Antes de tocar código, se listó `src/monitor/` y `test/` para no marcar como hecho lo que
no lo está ni como pendiente lo que ya existe:

- **Implementadas y presentes en disco**: T01, T02, T03, T04, T05, T06 (los 6 archivos de
  `domain/`), T08, T10, T14 (`claude-home.js`, `session-reader.js`, `caps.js`).
- **En curso** — el archivo existe en disco pero su verificación (tests dedicados) todavía
  no: T09 (`adapters/jsonl-tailer.js`, 176 líneas), T11 (`adapters/usage-limits-reader.js`,
  117 líneas). T20 (`test/helpers-monitor.js`) está en curso pero **no aparece todavía en
  disco** — ningún archivo `test/*monitor*` ni `test/helpers-monitor.js` existe en este
  checkout; se deja como pendiente de commit, no como hecho.
- **Pendientes, sin archivo en disco**: T07, T12, T13, T15, T16, T17, T18, T19, T21-T27.

Los checkboxes de abajo reflejan exactamente esto: `[x]` solo si el archivo existe y
cumple su responsabilidad descrita; sin marca si está en curso o pendiente.

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

- [ ] **SHS-H3-T07** — Árbol agregado proyecto→sesión→agente→modelo.
      `src/monitor/domain/arbol.js` · **compleja** · **Opus** · depende de: T01-T05
      Verificación: `src/monitor/domain/arbol.js` no existe en disco. Pendiente.

- [x] **SHS-H3-T08** — Rutas de `~/.claude` e índice de archivos.
      `src/monitor/adapters/claude-home.js` · mecanica · Sonnet · depende de: ninguna
      Verificación: implementado en disco (152 líneas).

- [ ] **SHS-H3-T09** — Tailer incremental (offset, resto, truncado, prefiltro). **En
      curso**: el archivo ya existe en disco (176 líneas, importa `parsearLinea` de
      `domain/eventos.js` y `crearDeduplicador` de `domain/consumo.js`) pero sin la
      cobertura de T22 no se considera verificado — no se marca como hecho.
      `src/monitor/adapters/jsonl-tailer.js` · **compleja** · **Opus** · depende de: T08
      Verificación pendiente: línea partida (media línea sin `\n` → 0 eventos, completarla
      → 1 evento, nunca 0 ni 2), truncado (offset resetea sin perder conteo posterior),
      archivo ilegible → `vista.avisos`.

- [x] **SHS-H3-T10** — `sessions/*.json` + pid vivo.
      `src/monitor/adapters/session-reader.js` · mecanica · Sonnet · depende de: T08
      Verificación: implementado en disco (81 líneas).

- [ ] **SHS-H3-T11** — Límites desde `.claude.json` con cache por mtime. **En curso**: el
      archivo ya existe en disco (117 líneas) pero sin tests dedicados no se considera
      verificado.
      `src/monitor/adapters/usage-limits-reader.js` · estandar · Sonnet · depende de: T08
      Verificación pendiente: cache respeta TTL 30 s, guard de tamaño >32 MB, mapeo de
      `cachedUsageUtilization` a los campos de `limites`.

- [ ] **SHS-H3-T12** — Puertos + caso de uso `build-view`.
      `src/monitor/application/ports.js`, `src/monitor/application/build-view.js` ·
      estandar · Sonnet · depende de: T07
      Verificación: `src/monitor/application/` no existe en disco. Pendiente.

- [ ] **SHS-H3-T13** — `SnapshotSource`: compone y mantiene estado entre ticks.
      `src/monitor/adapters/snapshot-source.js` · **compleja** · **Opus** · depende de:
      T09-T12
      Verificación: no existe en disco. Pendiente.

- [x] **SHS-H3-T14** — `caps.js`: TTY, columnas, color, Unicode vs ASCII.
      `src/monitor/adapters/caps.js` · mecanica · Sonnet · depende de: ninguna
      Verificación: implementado en disco (80 líneas).

- [ ] **SHS-H3-T15** — Renderer TTY: alternate buffer, frames, resize, teclas, cleanup.
      `src/monitor/adapters/tty-renderer.js` · **compleja** · **Opus** · depende de: T06,
      T12, T14
      Verificación: no existe en disco. Pendiente.

- [ ] **SHS-H3-T16** — Layout del panel: secciones, presupuesto de altura, overflow,
      breakpoints.
      `src/monitor/adapters/panel-layout.js` · **compleja** · **Opus** · depende de: T06,
      T14
      Verificación: no existe en disco. Pendiente.

- [ ] **SHS-H3-T17** — Renderer plano + JSON/NDJSON.
      `src/monitor/adapters/plain-renderer.js` · mecanica · Sonnet · depende de: T06, T12,
      T16
      Verificación: no existe en disco. Pendiente.

- [ ] **SHS-H3-T18** — Comando `monitor` + wiring en `cli.js` + help + exit codes.
      `src/commands/monitor.js`, `src/cli.js` · estandar · Sonnet · depende de: T13, T15,
      T17
      Verificación: `src/commands/monitor.js` no existe en disco; `src/cli.js` no
      registra `monitor`. Pendiente. **Único archivo compartido con el código existente
      — va sola, en su propio commit** (ver riesgo en `plan.md`).

- [ ] **SHS-H3-T19** — Writer de `model-router.jsonl` + `--emit-router`.
      `src/monitor/adapters/router-log-writer.js` · estandar · Sonnet · depende de: T12,
      T18
      Verificación: no existe en disco. Pendiente.

- [ ] **SHS-H3-T20** — Helper de fixtures de `~/.claude` falso. **En curso**: no existe
      todavía en disco (`test/helpers-monitor.js` no aparece en `test/`), pero se declara
      en progreso según el estado de trabajo actual — no se marca como hecho.
      `test/helpers-monitor.js` · estandar · Sonnet · depende de: T08
      Verificación pendiente: construye un `~/.claude` falso en tmpdir con espacio en el
      nombre (patrón de `test/helpers.js`), soporta `mkClaudeHome({ proyectos, sesiones,
      config })`.

- [ ] **SHS-H3-T21** — Tests de dominio (dedup, costos, ventanas, actividad, formato).
      `test/monitor-domain.test.js` · estandar · Sonnet · depende de: T20, T01-T06
      Verificación: no existe en disco. Pendiente — es la que convierte T01-T06 de "en
      disco" a "verificado".

- [ ] **SHS-H3-T22** — Tests del tailer (incremental, línea partida, truncado, error).
      `test/monitor-tailer.test.js` · estandar · Sonnet · depende de: T20, T09
      Verificación: no existe en disco. Pendiente — es la que convierte T09 de "en curso"
      a "verificado".

- [ ] **SHS-H3-T23** — Test del árbol agregado sobre fixtures.
      `test/monitor-view.test.js` · estandar · Sonnet · depende de: T20, T07, T13
      Verificación: no existe en disco. Pendiente.

- [ ] **SHS-H3-T24** — Tests de render (ancho exacto a 80/100, sin ANSI con
      `color:false`).
      `test/monitor-render.test.js` · estandar · Sonnet · depende de: T16, T17
      Verificación: no existe en disco. Pendiente.

- [ ] **SHS-H3-T25** — Test e2e del comando (`--once --json`).
      `test/monitor-cmd.test.js` · estandar · Sonnet · depende de: T18, T20
      Verificación: no existe en disco. Pendiente.

- [ ] **SHS-H3-T26** — Test de enforcement de capas P2.
      `test/monitor-layers.test.js` · mecanica · Sonnet · depende de: T01-T07
      Verificación: no existe en disco. Pendiente — este es el enforcement mecánico de P2
      descrito en `plan.md` (§Constitution alignment).

- [ ] **SHS-H3-T27** — Docs: README, CHANGELOG, notes.md.
      `README.md`, `CHANGELOG.md`, `notes.md` · mecanica · Sonnet · depende de: T18
      Verificación: no existe cambio en disco todavía. Pendiente.

---

## Olas de paralelismo

| Ola | Tareas | Nota |
|---|---|---|
| 1 | T01, T02, T06, T08, T14 | Sin dependencias. 5 en paralelo, todo Sonnet. **Ya completada y en disco.** |
| 2 | T03, T04, T05 ‖ T09, T10, T11 ‖ T20 | T09 (Opus) arranca ya: no comparte archivo con nadie. **T09, T10, T11 en disco; T03-T05 en disco; T20 en curso.** |
| 3 | T07 (Opus) ‖ T16 (Opus) ‖ T21 ‖ T22 ‖ T26 | Pendiente. |
| 4 | T12 → T13 (Opus) ‖ T15 (Opus) ‖ T17 ‖ T24 | Pendiente. |
| 5 | **T18 sola** | Único archivo compartido con el código existente: `src/cli.js`. Commit propio. Pendiente. |
| 6 | T19 ‖ T23 ‖ T25 ‖ T27 | Pendiente. |

Único punto de contención real: **T18 toca `src/cli.js`**, compartido con los cinco
comandos existentes y donde los flags nuevos podrían colisionar semánticamente con
`--force`/`--dry-run`. Va sola, en su propio commit. Todo lo demás es subárbol virgen.

---

## Checkpoints humanos

- [ ] **Después de la ola 2 (T03-T05, T09-T11, T20)**: confirmar que el dominio completo
      y los tres lectores de adapters están en disco y listos para T07/T12.
- [ ] **Después de T18**: verificar en vivo que `node bin/cli.mjs monitor --once` corre
      sin excepción sobre los proyectos reales de esta máquina, antes de seguir con
      `--emit-router` (T19).
- [ ] **Después de T26 (final)**: `npm test` en verde con la suite `monitor-*` completa,
      antes de abrir PR draft.

---

## Cierre

- [ ] `npm test` → verde, incluida la suite `test/monitor-*.test.js` completa (T21-T26).
- [ ] `node bin/cli.mjs monitor --once` sobre esta máquina → panel con datos reales.
- [ ] `node bin/cli.mjs verify --strict` y `node bin/cli.mjs upgrade --dry-run --yes`
      siguen pasando (el manifest no cambió).
- [ ] `notes.md` actualizado (T27).
- [ ] ADR de la decisión "enforcement de P2 por test, no dependency-cruiser" (`/adr-new`,
      ver `plan.md`).
- [ ] PR draft abierto contra `main` con la plantilla completa (tras 2-3 commits, no al
      final).
- [ ] Status de `spec.md` cambiado a `implemented`.
