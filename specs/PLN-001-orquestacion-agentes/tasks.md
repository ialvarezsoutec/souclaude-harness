# Tasks: Orquestación de agentes con roles bajo CCEM

**Spec**: [spec.md](./spec.md)
**Plan**: [plan.md](./plan.md)
**Estimated total**: ~3.5-4 h
**Status**: complete

---

## Reglas de escritura

- **Cada task: 15-30 minutos**, implementable y verificable en aislamiento.
- **Un commit por task**, esperando OK humano entre uno y otro (regla del harness).
- Los tasks T1-T6 son contenido → commits `docs:` no aplican: son archivos de producto del
  harness, van como `feat:`. El ADR (T1) sí es `docs:`.

---

## Task inventory

### T1: ADR de adopción de orquestación multi-agente

- **Estimación**: 20 min
- **Dependencies**: ninguna
- **Files**: `docs/decisions/20260721-orquestacion-multiagente.md`
- **Descripción**: Registrar la decisión siguiendo `docs/decisions/_template.md`: adopción
  del patrón de 4 roles (derivado de `betta-tech/harness-sdd`, sin copiar prosa), modo
  **opt-in** (no líder global), identificadores en inglés, y el resultado de `ccem-research`
  (D4 del plan, incluida la nota de licencia).
- **Verificación**:
  - [ ] El ADR referencia la spec/plan por ID `PLN-001`.
  - [ ] Cubre las cuatro decisiones (D1-D4) del plan.
- **Commit**: `docs: registrar ADR de orquestacion multi-agente`

---

### T2: Agente `orchestrator` (template)

- **Estimación**: 25 min
- **Dependencies**: T1
- **Files**: `templates/base/claude/agents/orchestrator.md`
- **Descripción**: Frontmatter (`name: orchestrator`, `tools: Read, Glob, Grep, Bash,
  Agent`) + cuerpo en español: descompone y coordina, **nunca escribe código**; verifica
  precondiciones (rama con ID de Planner, main al día, carpeta `specs/<ID>-<slug>/`); corre
  el flujo spec→plan→tasks→implement con **checkpoint humano en cada fase**; jamás marca
  `done` ni auto-aprueba (P6); resultados de subagentes **por disco, no por chat**. Referir
  —no copiar— a `ccem-planner`, `ccem-core` (modelo), `soutec-github`.
- **Verificación**:
  - [ ] Frontmatter válido, `tools` incluye `Agent`.
  - [ ] Documenta el modo opt-in y la nota de nesting (top-level adopta el rol).
- **Commit**: `feat: agregar agente orchestrator al harness`

---

### T3: Agente `spec-author` (template)

- **Estimación**: 25 min
- **Dependencies**: T2
- **Files**: `templates/base/claude/agents/spec-author.md`
- **Descripción**: `name: spec-author`, `tools` sin `Agent`. Redacta `spec.md`/`plan.md`/
  `tasks.md` desde `specs/_templates/`; **no toca `src/` ni tests**; para en cada checkpoint;
  si los acceptance criteria no alcanzan, para como `blocked` (no inventa — Anti-Hack,
  `ccem-prompting`). Usa la separación QUÉ/CÓMO de `ccem-sdd`.
- **Verificación**:
  - [ ] `tools` NO incluye `Agent` (no orquesta).
  - [ ] Deja claro que se detiene en cada checkpoint humano.
- **Commit**: `feat: agregar agente spec-author al harness`

---

### T4: Agente `implementer` (template)

- **Estimación**: 25 min
- **Dependencies**: T3
- **Files**: `templates/base/claude/agents/implementer.md`
- **Descripción**: `name: implementer`. Ejecuta **una** feature según su spec aprobado, task
  por task; cada cambio de código con su test; respeta P2/P9/P10; **no se marca `done` a sí
  mismo**; ante fallo de herramienta no improvisa workaround — para y reporta (Anti-Hack).
- **Verificación**:
  - [ ] Exige spec aprobado antes de escribir código.
  - [ ] Prohíbe explícitamente auto-marcar `done` y los workarounds silenciosos.
- **Commit**: `feat: agregar agente implementer al harness`

---

### T5: Agente `reviewer` (template)

- **Estimación**: 20 min
- **Dependencies**: T4
- **Files**: `templates/base/claude/agents/reviewer.md`
- **Descripción**: `name: reviewer`, `tools` **sin Write/Edit** (dictamina, no arregla).
  Verifica trazabilidad requisito↔test, corre la lógica de `/constitution-check` (P2/P9/P10),
  detecta tests que no prueban / mocks que fingen lógica (Anti-Hack). Veredicto
  `APPROVED | CHANGES_REQUESTED` con archivo y línea, escrito a disco.
- **Verificación**:
  - [ ] `tools` NO incluye Write ni Edit.
  - [ ] Exige rechazar si algún requisito no traza a un test concreto.
- **Commit**: `feat: agregar agente reviewer al harness`

---

### T6: `AGENTS.md` — mapa de navegación del flujo

- **Estimación**: 25 min
- **Dependencies**: T5
- **Files**: `templates/base/AGENTS.md`
- **Descripción**: Documento de entrada que explica los 4 roles, el flujo
  spec→plan→tasks→implement con sus checkpoints, la regla "resultados por disco", el modo
  opt-in y cómo invocar (top-level adopta `orchestrator`). Enlaza a la constitución y a las
  skills; no las duplica.
- **Verificación**:
  - [ ] Un dev que lo lee entiende cuándo y cómo se usa cada agente.
  - [ ] Cero referencias a `feature_list.json` o `requirements/design/tasks`.
- **Commit**: `feat: agregar AGENTS.md con el flujo de orquestacion`

---

### T7: Registrar los 5 archivos en el manifest + bump `harnessVersion`

- **Estimación**: 15 min
- **Dependencies**: T6
- **Files**: `templates/harness.manifest.json`
- **Descripción**: Agregar 5 entradas `managed` (4 agentes + `AGENTS.md`, sin `render`) y
  subir `harnessVersion` `1.0.0` → `1.1.0`.
- **Verificación**:
  - [ ] `src`/`dest` correctos (dotfile sin punto en `src`, con punto en `dest`).
  - [ ] JSON válido (`node -e "require('./templates/harness.manifest.json')"` o import).
- **Commit**: `feat: registrar agentes y AGENTS.md en el manifest (v1.1.0)`

---

### T8: Bump `package.json` + entrada de `CHANGELOG`

- **Estimación**: 10 min
- **Dependencies**: T7
- **Files**: `package.json`, `CHANGELOG.md`
- **Descripción**: `version` → `1.1.0` (se mueve junto al manifest). Entrada `1.1.0` en el
  CHANGELOG describiendo la orquestación de 4 agentes.
- **Verificación**:
  - [ ] `package.json` version == `harnessVersion` del manifest.
  - [ ] CHANGELOG con fecha y resumen.
- **Commit**: `chore: subir version a 1.1.0`

---

### T9: Actualizar y correr los tests

- **Estimación**: 30 min
- **Dependencies**: T8
- **Files**: `test/init.test.js` (y cualquier otro que fije `1.0.0`)
- **Descripción**: Actualizar el assert `lock.harnessVersion === '1.0.0'` → `'1.1.0'`
  ([test/init.test.js:174](../../test/init.test.js#L174)); grep por otros `1.0.0` en `test/`.
  Extender el test de "emite el harness completo" para asertar los 5 archivos nuevos. Correr
  `npm test` — todo verde, incluidos idempotencia, pureza `--dry-run` y NUNCA SE PISA.
- **Verificación**:
  - [ ] `npm test` pasa al 100%.
  - [ ] Hay al menos un assert por cada uno de los 5 archivos nuevos.
- **Commit**: `test: cubrir la emision de los agentes y AGENTS.md`

---

### T10: Pointer en `CLAUDE.md` de este repo

- **Estimación**: 10 min
- **Dependencies**: T9
- **Files**: `CLAUDE.md` (raíz de este repo)
- **Descripción**: Una línea en la sección "Metodología CCEM" apuntando a `AGENTS.md` y a los
  agentes. **No** se toca `templates/base/CLAUDE.md` (es `user-owned`: editarlo generaría un
  `CLAUDE.md.new` en el upgrade de este repo; `AGENTS.md` es el doc de consumo).
- **Verificación**:
  - [ ] CLAUDE.md sigue <200 líneas.
  - [ ] El pointer no duplica el contenido de AGENTS.md.
- **Commit**: `docs: apuntar a AGENTS.md desde CLAUDE.md`

---

### T11: Aplicar el harness a este mismo repo

- **Estimación**: 15 min
- **Dependencies**: T9 (manifest y templates listos)
- **Files**: emitidos: `.claude/agents/*.md`, `AGENTS.md`, `.claude/harness.json`
- **Descripción**: `node bin/cli.mjs upgrade --dry-run --yes` para inspeccionar; confirmar que
  solo aparecen `create` de los 5 archivos + version en el lockfile (sin pisar nada). Luego
  `node bin/cli.mjs upgrade --yes`. Si aparece algún `.new`, diffear y reconciliar a mano.
- **Verificación**:
  - [ ] `.claude/agents/{orchestrator,spec-author,implementer,reviewer}.md` y `AGENTS.md`
        existen en la raíz del repo.
  - [ ] El lockfile quedó en `1.1.0` y una re-corrida da NOOP.
  - [ ] No quedó ningún `*.new` sin resolver.
- **Commit**: `chore: aplicar el harness 1.1.0 a este repo (dogfooding)`

---

### T12: Verificación final + `/constitution-check`

- **Estimación**: 20 min
- **Dependencies**: T10, T11
- **Files**: ninguno (solo verificación)
- **Descripción**: Correr `/constitution-check` sobre el diff completo de la rama; `npm test`
  una última vez; revisar que cada archivo tocado traza a `PLN-001` (P10). Marcar la spec como
  `implemented`. Preparar el PR (plantilla completa, versión propuesta `v1.1.0`).
- **Verificación**:
  - [ ] `/constitution-check` sin violaciones.
  - [ ] `npm test` verde.
  - [ ] Spec status → `implemented`; PR draft con plantilla completa.
- **Commit**: `docs: marcar spec PLN-001 como implemented`

---

## Execution order

```
T1 ─► T2 ─► T3 ─► T4 ─► T5 ─► T6 ─► T7 ─► T8 ─► T9 ─┬─► T10 ─┐
                                                    └─► T11 ─┴─► T12
```

T10 y T11 pueden hacerse en cualquier orden tras T9 (independientes entre sí); T12 cierra.
La cadena T2-T6 es secuencial solo por consistencia de estilo entre agentes (cada uno mira
al anterior), no por dependencia técnica dura.

---

## Checkpoints humanos

- [ ] **Después de T6**: leer los 4 agentes + AGENTS.md — ¿la prosa refleja CCEM y no la
      referencia? ¿los `tools` son los correctos (reviewer sin Write)?
- [ ] **Después de T9**: `npm test` verde con los asserts nuevos.
- [ ] **Después de T11**: la superficie de agentes quedó emitida en este repo sin pisar nada.
- [ ] **Después de T12 (final)**: OK para abrir el PR.

---

## Estimación total

| Batch | Tasks | Tiempo |
|-------|-------|--------|
| ADR + agentes | T1-T6 | ~2 h |
| Manifest + versión + tests | T7-T9 | ~55 min |
| Dogfooding + cierre | T10-T12 | ~45 min |
| **Total** | **12 tasks** | **~3.5-4 h** |

---

## Progreso (actualizar durante ejecución)

- [ ] T1: pendiente
- [ ] T2: pendiente
- [ ] T3: pendiente
- [ ] T4: pendiente
- [ ] T5: pendiente
- [ ] T6: pendiente
- [ ] T7: pendiente
- [ ] T8: pendiente
- [ ] T9: pendiente
- [ ] T10: pendiente
- [ ] T11: pendiente
- [ ] T12: pendiente

---

## Checklist antes de declarar "complete"

- [ ] Todos los tasks ejecutados y verificados
- [ ] `npm test` verde (unit + invariantes)
- [ ] `AGENTS.md` y los 4 agentes emitidos en este repo
- [ ] ADR creado (`docs/decisions/20260721-orquestacion-multiagente.md`)
- [ ] `/constitution-check` sin violaciones
- [ ] Spec status → `implemented`
- [ ] PR abierto con la plantilla completa (versión propuesta `v1.1.0`)
