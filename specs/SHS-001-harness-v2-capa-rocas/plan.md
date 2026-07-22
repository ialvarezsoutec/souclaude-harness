# Plan: Harness v2.0.0 — capa de rocas (el hito reemplaza a Planner)

**Spec**: [spec.md](spec.md)
**Status**: approved
**Owner**: Ignacio A
**Creado**: 2026-07-22
**Aprobado**: 2026-07-22

---

## Reglas de escritura

- Aquí va el CÓMO técnico: estructura de archivos, manifest, versionado, riesgos.
- La spec es input; no se duplican goals ni journeys.

---

## Stack decisions

### Contenido del harness (skills y agentes)

- Tecnología: Markdown (`SKILL.md`, `*.md` de agentes) — igual que hoy. Sin dependencias nuevas.
- Rationale: el harness es un generador de contenido; la capa de rocas es instrucción para el
  agente, no código ejecutable (decisión de alcance: E1/E4 como skill, no CLI).
- Componentes existentes reutilizados: patrón de skill-comando con `disable-model-invocation`
  (`spec-new`, `adr-new`); patrón de agente con `tools` acotadas.
- Componentes nuevos: paquete `ccem-rocas` con 4 skills-comando.

### Distribución y versionado

- Tecnología: el manifest declarativo `templates/harness.manifest.json` + el motor existente
  (`src/core/plan.js`, `apply.js`), sin tocarlos.
- Rationale: registrar los archivos nuevos como `files[]` `managed` es todo lo que hace falta
  para que `upgrade` los emita. El motor ya resuelve create/update/local-edit.
- Versionado: triplicado sincronizado (`package.json`, `harness.manifest.json`, y el lockfile
  `.claude/harness.json` al correr upgrade). Bump mayor `1.1.0 → 2.0.0`.

---

## Architecture

```
templates/base/claude/skills/                 .claude/skills/  (copia dogfood)
├── ccem-planner/SKILL.md   (REESCRITO) ─────▶ ccem-planner/SKILL.md
├── ccem-rocas/                                ccem-rocas/
│   ├── rock-plan/SKILL.md   (NUEVO)  ────────▶   rock-plan/SKILL.md
│   ├── rock-status/SKILL.md (NUEVO)  ────────▶   rock-status/SKILL.md
│   ├── rock-close/SKILL.md  (NUEVO)  ────────▶   rock-close/SKILL.md
│   └── export-ninety/SKILL.md (NUEVO)────────▶   export-ninety/SKILL.md
├── spec-new/SKILL.md        (EDITADO) ───────▶ spec-new/SKILL.md
└── soutec-github/SKILL.md   (EDITADO) ───────▶ soutec-github/SKILL.md

templates/base/claude/agents/                 .claude/agents/
├── orchestrator.md  (EDITADO) ──────────────▶ orchestrator.md
├── spec-author.md   (EDITADO) ──────────────▶ spec-author.md
└── implementer.md   (EDITADO) ──────────────▶ implementer.md

templates/harness.manifest.json  → +4 entradas files[] (ccem-rocas), harnessVersion 2.0.0
package.json                     → version 2.0.0
CHANGELOG.md                     → entrada 2.0.0 (breaking)
CLAUDE.md (user-owned)           → sección Git al hito
docs/vision-general-ccem-harness.md · notes.md → corrección antipatrón v1
```

Flujo del cambio en un repo consumidor:
1. `souclaude upgrade` lee el manifest 2.0.0.
2. El motor marca `ccem-rocas/*` como `create` y los reescritos como `update`.
3. Archivos `user-owned` editados (p.ej. `CLAUDE.md`) no se pisan: quedan `.new`.

---

## Data contracts

### Input (lo que produce la capa ejecutiva, fuera de este repo)

El identificador de hito, con formato `<PREFIJO>-H<n>` (ej. `REA-H3`), y los criterios de
aceptación congelados. La plantilla de apertura de roca (Vault) es la fuente; este repo solo
consume el ID y los criterios al invocar `/spec-new`.

### Output (lo que este cambio distribuye)

Skills y agentes que hablan de "hito" en vez de "tarjeta de Planner", y 4 comandos `/rock-*`.
Contrato de entrada hito → `/spec-new` (metodología §6):

```
- ID del hito (<PREFIJO>-H<n>)
- Criterios de aceptación heredados del hito
- No-alcance del hito
- Entregable esperado y su ruta
- Plan de rollback (si toca algo en ejecución)
```

### Transformations clave

- [ ] `ccem-planner`: sustituir el modelo "tablero Planner (Doing/Done/checklist)" por "estado
      derivado de GitHub (rama/PR)"; WIP "2-3 tarjetas/dev" → "2 ramas vivas/persona".
- [ ] `/rock-plan`: implementar R1-R7 + checklist de la plantilla como validaciones que el
      agente ejecuta antes de dejar exportar.

---

## Constitution alignment

| Principio | Veredicto | Cómo aplica · ADR que lo respalda |
|---|---|---|
| **P1** — Contratos antes que tecnologías | cumple | El contrato hito→spec (§6) se documenta como puerto de la capa; sin framework nuevo. |
| **P2** — Hexagonal con enforcement | no aplica | Cambio de contenido/docs, no toca capas de código de dominio. |
| **P3** — Medir antes de optimizar | cumple | Verificación por grep + tests + dogfooding de `/rock-plan` (spec §Success criteria). |
| **P4** — Modularidad por capas | cumple | `ccem-rocas` es su propia capa, separada de CCEM; no invade P7/P8. |
| **P5** — Observabilidad | no aplica | Sin runtime nuevo. |
| **P6** — Human-in-the-loop / ADRs | cumple | ADR `docs/decisions/20260722-capa-rocas-hito-emisor-de-ids.md`; checkpoints SDD respetados. |
| **P9** — Simplicity First | cumple | No se renombra `ccem-planner`, no se construye CLI, no se toca el motor (ADR 20260722, Alt. A/C). |
| **P10** — Surgical Changes | cumple | Cada edición traza a una brecha G1-G13 de la spec; ediciones de terminología acotadas. |

> P7/P8 son placeholders por proyecto y **no se llenan** con reglas de rocas (metodología §9,
> ADR 20260722 D6). Por eso no figuran arriba con contenido propio.

---

## Dependencies

### Deben existir ANTES de empezar
- [x] ADR de superseción creado (B0, ya commiteado).
- [x] Rama `chore/SHS-001-harness-v2-capa-rocas` desde `dev`.

### Se crean DURANTE
- [ ] Paquete `ccem-rocas` (4 skills) en `templates/base` y `.claude`.

### Se modifican DURANTE
- [ ] `ccem-planner`, `spec-new`, `soutec-github` (skills); `orchestrator`, `spec-author`,
      `implementer` (agentes); `CLAUDE.md`; `manifest`; `package.json`; `CHANGELOG.md`;
      `docs/vision-general-ccem-harness.md`; `notes.md`.

---

## Risks y mitigaciones

| Risk | Impact | Likelihood | Mitigation |
|------|--------|-----------|------------|
| Olvidar el doble árbol: editar solo `templates/base` o solo `.claude` | M | M | Grep de verificación en ambos árboles (spec §Success); checklist por task. |
| Archivo `ccem-rocas` no registrado en manifest → no se distribuye | H | M | Task dedicada a registrar y verificar con `ls` + lectura del manifest. |
| Referencia a Planner residual en algún artefacto | M | M | Grep final `planner\|PLN-023\|Doing\|tablero` sobre ambos árboles. |
| Bump de versión desincronizado entre las 3 fuentes | M | L | Task única que toca las 3 y verifica coherencia. |
| Romper la suite de tests del motor por manifest mal formado | H | L | Correr `test/` tras editar el manifest. |

---

## Research notes

### D1: Estructura del paquete `ccem-rocas`
**Decisión**: 4 skills-comando independientes (`rock-plan`, `rock-status`, `rock-close`,
`export-ninety`), cada una con `disable-model-invocation`.
**Rationale**: consistente con `spec-new`/`adr-new`; cada `/rock-*` invocable directo.
**Alternativa descartada**: `SKILL.md` paraguas + sub-skills — rompe el patrón una-skill-por-comando.

### D2: No renombrar `ccem-planner`
**Decisión**: reescribir contenido, conservar nombre.
**Rationale**: renombrar toca `id`/`src`/`dest` del manifest, lockfile y referencias cruzadas (P10).
**Alternativa descartada**: `ccem-hitos` — se difiere a versión futura (ADR 20260722, Alt. A).

---

## Implementation strategy

### Approach
- [ ] Rollout incremental, una unidad B por commit `docs:`/`refactor:`, en el orden B1→B5.
- [ ] Sin feature flag: es contenido distribuido; el gate es el bump de versión mayor.
- [ ] Test strategy: suite existente `test/` (coherencia manifest↔motor) + dogfooding manual de
      `/rock-plan` (rechazo de planes inválidos) + `souclaude status` exit 0.

### Rollback plan
1. `git revert` de los commits de la rama (el cambio es 100% contenido + manifest).
2. Como no se publica tag hasta que el coordinador lo haga, ningún repo consumidor recibe la
   v2.0.0 antes de la aprobación del PR: el rollback previo al merge es simplemente no mergear.

---

## Observability

- No aplica runtime. La "observabilidad" del cambio es la verificación de la spec: grep, tests,
  `status`, y el comportamiento de rechazo de `/rock-plan`.

---

## Checklist antes de avanzar a Tasks

- [x] ¿Plan alineado con constitución (punto por punto)?
- [x] ¿Data contracts completos (contrato hito→spec)?
- [x] ¿Risks con mitigación concreta?
- [x] ¿Dependencies verificadas?
- [ ] ¿Developer lead aprobó el plan?
- [x] ¿ADRs creados para decisiones significativas? (20260722)
