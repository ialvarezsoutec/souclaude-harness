# Tasks: Harness v2.0.0 — capa de rocas (el hito reemplaza a Planner)

**Spec**: [spec.md](spec.md)
**Plan**: [plan.md](plan.md)
**Estimated total**: ~6 horas
**Status**: draft

---

## Reglas de escritura

- Cada task: 15-30 min, verificable en aislamiento. Un commit por task.
- El doble árbol (`templates/base` + `.claude`) se toca en la MISMA task, no en dos.

> Nota: B0 (ADR de superseción) ya está ejecutado y commiteado antes de esta lista.

---

## Task inventory

### T1: Reescribir `ccem-planner` con el hito como emisor
- **Estimación**: 30 min
- **Dependencies**: ninguna
- **Files**: `templates/base/claude/skills/ccem-planner/SKILL.md`, `.claude/skills/ccem-planner/SKILL.md`
- **Descripción**: sustituir "Planner ordena el QUÉ / ID de tarjeta de Planner" por el hilo
  `Roca → Hito → specs/<ID-hito>-<slug>/ → rama → PR → tag`. Reemplazar la tabla de tablero
  (Doing/Done/checklist) por estado derivado de GitHub. WIP: "2-3 tarjetas/dev" → "2 ramas
  vivas/persona". Prefijo pasa de "de tarjeta" a "de proyecto".
- **Verificación**:
  - [ ] `grep -i "planner\|Doing\|tablero" ` sobre ambos archivos no devuelve el modelo viejo.
  - [ ] Ambos árboles quedan idénticos.

### T2: Crear skill `rock-plan` con validaciones R1-R7
- **Estimación**: 30 min
- **Dependencies**: T1
- **Files**: `templates/base/claude/skills/ccem-rocas/rock-plan/SKILL.md`, `.claude/…`
- **Descripción**: skill-comando con `disable-model-invocation`. Las 6 entradas obligatorias
  (§3.2), R1-R7, y el checklist de validación de la plantilla de apertura. Se detiene y pregunta
  si algo falla; no exporta a medias.
- **Verificación**:
  - [ ] El skill describe el rechazo de: <5 o >7 hitos, primer hito en semana >2, prefijo no
        registrado, título con verbo de actividad.

### T3: Crear skill `rock-status`
- **Estimación**: 20 min
- **Dependencies**: T2
- **Files**: `templates/base/claude/skills/ccem-rocas/rock-status/SKILL.md`, `.claude/…`
- **Descripción**: snapshot + `Project-State.md` generado; falla si hay campos derivados editados
  a mano (§5). Documenta que el archivo es generado y nadie lo edita.
- **Verificación**:
  - [ ] Lista los campos derivados (§5) que no se escriben a mano.

### T4: Crear skill `rock-close`
- **Estimación**: 20 min
- **Dependencies**: T2
- **Files**: `templates/base/claude/skills/ccem-rocas/rock-close/SKILL.md`, `.claude/…`
- **Descripción**: completa el mismo YAML de apertura (estado, evidencias, desviaciones
  calculadas, lecciones, firma, `cumplido` por criterio). Exige evidencia por criterio (E5).
- **Verificación**:
  - [ ] El skill exige evidencia registrada antes de marcar `cumplido`.

### T5: Crear skill `export-ninety`
- **Estimación**: 20 min
- **Dependencies**: T2
- **Files**: `templates/base/claude/skills/ccem-rocas/export-ninety/SKILL.md`, `.claude/…`
- **Descripción**: documenta el contrato por fases (§11), Fase 0 manual, y las restricciones de
  la API v1. No construye API; solo cruza el nivel hito, nunca specs ni tasks.
- **Verificación**:
  - [ ] El skill deja explícito "Fase 0 manual" y "no recibe specs ni tasks. Nunca".

### T6: Registrar `ccem-rocas` en el manifest
- **Estimación**: 20 min
- **Dependencies**: T2, T3, T4, T5
- **Files**: `templates/harness.manifest.json`
- **Descripción**: agregar 4 entradas `files[]` `{ id: skill-rock-*, src, dest, policy: managed }`
  siguiendo el patrón de las skills existentes.
- **Verificación**:
  - [ ] Cada archivo de `ccem-rocas` aparece en `files[]`.
  - [ ] JSON válido (`node -e "require('./templates/harness.manifest.json')"`).

### T7: Alinear `spec-new` al hito + contrato de entrada
- **Estimación**: 25 min
- **Dependencies**: ninguna
- **Files**: `templates/base/claude/skills/spec-new/SKILL.md`, `.claude/…`
- **Descripción**: `argument-hint` y cuerpo de `<PLN-023>` a `<ID-hito>`; agregar el contrato de
  entrada del hito (§6: criterios heredados, no-alcance, entregable, rollback). Quitar el paso
  "Avisar en Planner".
- **Verificación**:
  - [ ] No queda "tarjeta de Planner"; aparece el contrato de entrada.

### T8: Alinear `soutec-github` al hito
- **Estimación**: 20 min
- **Dependencies**: ninguna
- **Files**: `templates/base/claude/skills/soutec-github/SKILL.md`, `.claude/…`
- **Descripción**: origen de la rama pasa de "tarea en Planner/SharePoint" a "hito de una roca";
  ejemplos de rama con `<ID-hito>`.
- **Verificación**:
  - [ ] No queda Planner como origen de rama.

### T9: Alinear los 3 agentes al hito
- **Estimación**: 20 min
- **Dependencies**: ninguna
- **Files**: `templates/base/claude/agents/{orchestrator,spec-author,implementer}.md` + `.claude/…`
- **Descripción**: "ID de tarjeta de Planner" → "ID de hito" en los tres, conservando estructura.
- **Verificación**:
  - [ ] `grep -i planner` sobre los 3 agentes (ambos árboles) no devuelve nada.

### T10: Actualizar `CLAUDE.md` (user-owned) al hito
- **Estimación**: 20 min
- **Dependencies**: ninguna
- **Files**: `CLAUDE.md`, `templates/base/CLAUDE.md`
- **Descripción**: sección Git y de metodología pasan de "tarjeta de Planner / PLN-XXX" al hito
  como emisor. Editar directo (es `user-owned`, el upgrade no lo pisa).
- **Verificación**:
  - [ ] La sección Git nombra al hito, no a Planner.

### T11: Corregir el antipatrón v1 en docs
- **Estimación**: 20 min
- **Dependencies**: ninguna
- **Files**: `docs/vision-general-ccem-harness.md`, `notes.md`
- **Descripción**: donde el corpus repita "código y contexto en el mismo repo = antipatrón",
  corregir al enunciado real (§0/§13): el antipatrón es mezclar capa ejecutiva con el código;
  `specs/` y `docs/decisions/` **sí** viven en el repo.
- **Verificación**:
  - [ ] El texto refleja el enunciado correcto.

### T12: Bump de versión a 2.0.0
- **Estimación**: 20 min
- **Dependencies**: T6
- **Files**: `package.json`, `templates/harness.manifest.json`, `CHANGELOG.md`
- **Descripción**: `version`/`harnessVersion` a `2.0.0`; entrada de CHANGELOG con el breaking
  change (Planner → hito, `ccem-rocas` nuevo). El lockfile `.claude/harness.json` se actualiza al
  correr `upgrade`, no a mano.
- **Verificación**:
  - [ ] Las 3 fuentes marcan `2.0.0`.

### T13: Verificación end-to-end
- **Estimación**: 30 min
- **Dependencies**: todas
- **Files**: — (solo lectura/ejecución)
- **Descripción**: grep sin residuos de Planner en ambos árboles; `node bin/cli.mjs status`
  (exit 0); suite `test/`; dogfooding: simular un plan inválido y confirmar que `/rock-plan` lo
  rechazaría (revisión de las reglas escritas).
- **Verificación**:
  - [ ] Todos los success criteria de la spec se cumplen.

---

## Execution order

```
T1 ──▶ T2 ──▶ T3*
              T4*
              T5*
              └──▶ T6 ──▶ T12 ──▶ T13
T7* T8* T9* T10* T11*  (independientes, en paralelo conceptual) ──▶ T13
```

### Paralelización posible
- T3, T4, T5 dependen solo de T2 y son independientes entre sí.
- T7, T8, T9, T10, T11 son independientes de la cadena `ccem-rocas`.

---

## Checkpoints humanos

- [ ] **Después de T1**: validar la reescritura de `ccem-planner` (es el núcleo).
- [ ] **Después de T6**: `ccem-rocas` completo y registrado en el manifest.
- [ ] **Después de T13 (final)**: UAT — el owner confirma que el harness ya no menciona Planner
      y que `/rock-plan` haría cumplir las reglas.

---

## Estimación total

| Batch | Tasks | Tiempo |
|-------|-------|--------|
| Núcleo ccem-planner | T1 | ~30 min |
| Paquete ccem-rocas | T2-T6 | ~110 min |
| Alineación anti-Planner | T7-T11 | ~105 min |
| Versionado + verificación | T12-T13 | ~50 min |
| **Total** | **13 tasks** | **~5 h** |

---

## Progreso (actualizar durante ejecución)

- [x] T1 — hecho (ccem-planner reescrito en ambos árboles)
- [x] T2 — hecho (rock-plan con R1-R7 + checklist)
- [x] T3 — hecho (rock-status, estado derivado + E2/E3)
- [x] T4 — hecho (rock-close, evidencia por criterio E5)
- [x] T5 — hecho (export-ninety, contrato por fases)
- [x] T6 — hecho (4 entradas en el manifest, JSON válido)
- [x] T7 — hecho (spec-new al hito + contrato de entrada)
- [x] T8 — hecho (soutec-github: origen de rama = hito)
- [x] T9 — hecho (3 agentes al hito)
- [x] T10 — hecho (ambos CLAUDE.md + índice ccem-rocas)
- [x] T11 — ajustado: el antipatrón v1 no está en el repo (vive en el Vault);
      se agregó banner de superseción a vision-general-ccem-harness.md
- [ ] T12 — pendiente
- [ ] T13 — pendiente

---

## Checklist antes de declarar "complete"

- [ ] Todos los tasks ejecutados y verificados
- [ ] `souclaude status` exit 0 + suite `test/` verde
- [ ] `grep` sin residuos de Planner en ambos árboles
- [ ] `notes.md` actualizado
- [ ] Stakeholder firmó off (UAT)
- [ ] PR mergeado (lo hace el coordinador)
- [ ] Status del spec cambiado a `implemented`
