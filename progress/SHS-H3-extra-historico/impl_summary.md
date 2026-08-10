# Impl summary: SHS-H3-extra-historico

**Implementer**: implementer (T101-T107) + rework post-review
**Fecha**: 2026-08-10
**Rama**: `fix/SHS-H3-extra-historico`
**Spec**: `specs/SHS-H3-extra-historico/{spec.md,plan.md,tasks.md}`
**Review**: `progress/SHS-H3-extra-historico/review.md` (veredicto `CHANGES_REQUESTED`, 4
hallazgos bloqueantes; los 4 corregidos — ver "Rework post-review" abajo. **No hay una
segunda pasada de review registrada en disco** que apruebe el rework; este resumen no
afirma `APPROVED` porque no hay evidencia de ese veredicto.)

---

## Estado real (no aspiracional)

- `npm test` → **325/325, 0 fail** (corrido por mí en esta sesión de cierre de rastro,
  `2026-08-10`; coincide con lo que reportó el coordinador).
- Los tres bugs originales de la spec (extra recalculando % en vez de usar
  `utilization`, dedup que podía tragarse `Semanal Fable`, fallos de red silenciosos) y
  las dos piezas nuevas (regla de dominio de 24h + persistencia del histórico) están
  implementados y probados sin mocks que reemplacen la lógica bajo test.
- El reviewer verificó **de forma independiente** (no solo corriendo la suite) que
  `--json` trae `historico` con `usado:21.36/limite:20` y que `--once` pinta la sección
  HISTORICO al pie sin `LIMITE` en el título, sobre el payload real de esta máquina.

## Trazabilidad por task (commits reales, `git log origin/main..HEAD`)

| Task | Commit(s) | Qué hace |
|---|---|---|
| T101 | `29b0c65` | `toGastoExtra` expone `utilizacion`/`motivoDeshabilitado`; `panel-presenter.js` usa `utilizacion` (100%) en vez del % recalculado (107%) |
| T102 | `1f51e7d` | Clave de dedup de `filasDeLimites` pasa a incluir tipo+modelo, no solo porcentaje+reset |
| T103 | `5cc0a12` | `domain/gasto-extra.js`: `estadoDelExtra`/`siguienteRegistro`, funciones puras con `ahora` inyectado |
| T104 | `fa6f36a`, `a31b9d1` | `adapters/usage-history.js` (persistencia de `usage-history.json`); `a31b9d1` corrige que el flag `--seed-extra-detectado-en` no llegaba desde la CLI real (`parseArgs`) |
| T105 | `6566af2`, `e2afccf`\*, `3f8ef3b`, `40652ee`, `40074bd` | Sección Histórico en dominio/presenter/layout. `e2afccf` es un ajuste de `tasks.md`/`plan.md` (sin código) para que el cableado de lectura de `usage-history.js` quedara documentado en esta task, no en T104. `3f8ef3b`/`40652ee`/`40074bd` son el rework post-review (ver abajo) |
| T106 | `7477633`, `aac0282`\*, `6588657` | Aviso de límites viejos vía `usageFetcher.estado()`. `aac0282` es el mismo tipo de ajuste doc-only que `e2afccf`, ahora para T106. `6588657` es el rework post-review (ver abajo) |
| T107 | `22d8884`, `d96fc32` | Documentación en `README.md`; `d96fc32` es el rework post-review que agrega el test automatizado de `historico` en `--json` (aunque su commit quedó referenciado a T107, cierra el hallazgo 2 sobre RF-05/T105 — ver nota en "Rework") |

\* Los commits `e2afccf` y `aac0282` no llevan footer `Refs:` (observación no bloqueante
del reviewer, sección Constitución/P10 de `review.md`) — quedan documentados acá para no
perder la trazabilidad que el footer no dejó escrita.

## Rework post-review (los 4 hallazgos bloqueantes de `review.md`)

| # | Hallazgo | Commit | Resuelto |
|---|---|---|---|
| 1 | `siguienteRegistro` lanzaba `TypeError` con `gastoExtra: null` y un registro abierto; el error se tragaba en un catch vacío en `commands/monitor.js` | `3f8ef3b` | Sí — encadenamiento opcional agregado, y el catch ahora empuja el motivo a `avisos` en vez de tragarlo en silencio; test con registro abierto agregado (el caso que faltaba, según el propio reviewer) |
| 2 | RF-05: `historico` en `--json` no tenía test automatizado, solo verificación manual (contra la propia regla de la spec) | `d96fc32` | Sí — dos tests nuevos en `test/monitor-cmd.test.js` sobre el pipeline real con `--claude-home`: con registro de +24h, `historico` trae el extra archivado; sin registro, `historico` es `[]` |
| 3 | `test/monitor-render.test.js` (caso "no pinta rojo") pasaba igual con T105 completamente revertido — test vacío | `40652ee` | Sí — reemplazado por el caso real (extra al 100%, 25h → sin marco rojo) y su contraparte (1h → sí marco rojo, caso que tampoco estaba cubierto) |
| 4 | El extra histórico desaparecía por completo en `compact`, `agents` y el modo angosto | `40074bd` | Sí — representación mínima agregada a los tres modos (línea condensada en `compact`/angosto, misma caja en `agents`) |

**No verificado por mí de forma independiente línea por línea** (confío en la
descripción de los commits + el `npm test` en verde): no repetí manualmente cada
reproducción que hizo el reviewer antes del fix. Lo que sí verifiqué en esta sesión:
`npm test` completo, 325/325.

## Pendiente (no cerrado, y por qué)

- **Segunda ronda de review**: no hay `review.md` (ni una sección nueva en el mismo
  archivo) que confirme `APPROVED` sobre los 4 fixes. El coordinador reportó que los 4
  hallazgos "ya fueron corregidos" con el conteo de tests en verde, pero eso no
  reemplaza un veredicto explícito del `reviewer`. Este resumen no lo afirma.
- **PR draft**: no se abrió (`review.md`, hallazgo 5, ya lo señalaba; `gh` no estaba
  disponible en el entorno del reviewer). Sigue pendiente.
- **Observaciones no bloqueantes de `review.md`** (7 puntos, sección "Observaciones no
  bloqueantes"): ninguna se atendió en este rework porque el veredicto solo exigía las 4
  bloqueantes. Quedan como deuda documentada, no como bloqueo.
- **`progress/model-router.jsonl`**: el reviewer notó una sola línea (spec-author) para
  siete lanzamientos de implementer, y cambios locales sin commitear. No lo toqué (fuera
  del alcance de este cierre de rastro — instrucción explícita del coordinador).

## Verificación de este cierre de rastro (lo que yo, spec-author, corrí en esta sesión)

- `npm test` → 325/325, 0 fail (`duration_ms 16902`).
- `git log origin/main..HEAD` → 20 commits confirmados, mapeados a la tabla de arriba.
- Archivo del ADR verificado en disco:
  `docs/decisions/20260810-monitor-persiste-historico-de-gasto-extra.md`.
- No corrí `node bin/cli.mjs monitor --once`/`--json` de nuevo sobre esta máquina real en
  esta sesión: me apoyo en la verificación ya hecha y documentada por el reviewer en
  `review.md` (independiente, con reproducciones concretas) y por el orquestador (según
  reportó el coordinador). No la repito para no duplicar trabajo ya evidenciado.
