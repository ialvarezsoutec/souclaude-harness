# Plan: Orquestación de agentes con roles bajo CCEM

**Spec**: [spec.md](./spec.md)
**Status**: implemented
**Owner**: Ignacio A
**Creado**: 2026-07-21
**Aprobado**: 2026-07-21

---

## Reglas de escritura

- **Aquí SÍ va el CÓMO técnico**: stack, arquitectura, data contracts, risks.
- La spec (`spec.md`) es input — no duplicar goals ni user journeys.
- Este plan debe ser aprobado por el developer lead antes de avanzar a tasks.

---

## Decisiones de las open questions (de la spec)

- **Q1 → orquestador como subagente** en `.claude/agents/orchestrator.md`.
- **Q2 → sí va un `AGENTS.md`** de navegación, emitido por el harness.
- **Q3 → licencia:** ver [Research notes → D4](#d4-derivar-de-betta-techharness-sdd-ccem-research).

---

## Stack decisions

No se agrega ninguna tecnología nueva. Este feature es **contenido**, no lógica: archivos
Markdown de definición de agente + `AGENTS.md`, más entradas declarativas en el manifest.

### Definiciones de agente (Markdown con frontmatter)

- Formato: los `.md` de subagente de Claude Code — frontmatter `name` / `description` /
  `tools` y cuerpo con el prompt del rol.
- Ubicación en templates: `templates/base/claude/agents/<rol>.md` (dotfile sin punto, como
  el resto de `.claude/` en el manifest; `dest` lleva el punto).
- Componentes existentes reutilizados: el motor de templates (`plan.js`/`apply.js`), el
  manifest, y el mecanismo `managed`. **No se toca ni una línea de `src/`.**
- Componentes nuevos: 4 archivos de agente + 1 `AGENTS.md` + 5 entradas de manifest.

### Roles y nombres

Cuatro roles. El **identificador** (`name:` del subagente, lo que se invoca con
`subagent_type`) va en **inglés** kebab-case — toca el framework, y la constitución manda
inglés para eso. La **prosa del cuerpo** de cada agente sigue en español (es el método):

| Archivo (`dest`) | `name` | Rol | `tools` |
|---|---|---|---|
| `.claude/agents/orchestrator.md` | `orchestrator` | Descompone y coordina. No escribe código. | Read, Glob, Grep, Bash, Agent |
| `.claude/agents/spec-author.md` | `spec-author` | Redacta `spec.md`/`plan.md`/`tasks.md`. No toca código. | Read, Write, Edit, Glob, Grep, Bash |
| `.claude/agents/implementer.md` | `implementer` | Implementa una feature según su spec aprobado. | Read, Write, Edit, Glob, Grep, Bash |
| `.claude/agents/reviewer.md` | `reviewer` | Aprueba/rechaza contra constitución y spec. No edita. | Read, Glob, Grep, Bash |

---

## Architecture

### Cómo enchufa en el motor (sin tocar el motor)

```
templates/harness.manifest.json   ──(+5 entradas managed)──►  motor plan.js/apply.js
        │                                                              │
        ▼                                                              ▼
templates/base/claude/agents/*.md   ─── emitidos como ───►   <repo>/.claude/agents/*.md
templates/base/AGENTS.md            ─── emitidos como ───►   <repo>/AGENTS.md
```

`init`/`upgrade` ya saben emitir archivos `managed`: aparecen como `create` en un repo que
no los tiene, y como `update` cuando el template cambie y el usuario no los haya tocado.
Cero código nuevo en el motor.

### Modelo de orquestación (opt-in, no global)

**Decisión de diseño clave:** a diferencia de la referencia, **NO** forzamos a cada sesión
a actuar como orquestador vía `CLAUDE.md`. Eso secuestraría el `CLAUDE.md` de cada proyecto
consumidor y violaría P9/P10. La orquestación es **opt-in**: el dev la invoca cuando la
quiere ("actuá como orquestador para PLN-XXX").

Flujo de handoff (resultados **por disco**, no por chat):

```
dev ─"orquestá PLN-XXX"─► [orchestrator]
        │  verifica: rama con ID, main al día, specs/<ID>-<slug>/ existe
        ▼
   Fase spec:   lanza [spec-author] ─► escribe spec.md ─► ⏸ CHECKPOINT humano
        ▼  (aprobado)
   Fase plan:   lanza [spec-author] ─► escribe plan.md ─► ⏸ CHECKPOINT humano
        ▼  (aprobado)
   Fase tasks:  lanza [spec-author] ─► escribe tasks.md ─► ⏸ CHECKPOINT humano
        ▼  (aprobado — recién acá se admite código)
   Implement:   lanza [implementer] task×task ─► lanza [reviewer] ─► veredicto
```

El orquestador nunca marca `done` ni salta un checkpoint (P6). El revisor es **independiente**
del implementador (Goal 3 de la spec).

---

## Data contracts

### Input — entrada de manifest (una por archivo)

```json
{ "id": "agent-orchestrator", "src": "base/claude/agents/orchestrator.md",
  "dest": ".claude/agents/orchestrator.md", "policy": "managed" }
```

`render` se omite (los agentes no usan `{{VARS}}`: son genéricos, agnósticos al proyecto).

### Input — frontmatter de cada agente

```yaml
---
name: <rol-kebab>
description: <cuándo el orquestador lo usa, en una línea>
tools: <lista mínima; el revisor NO tiene Write/Edit>
---
```

### Output — árbol emitido en el repo consumidor

```
.claude/agents/{orchestrator,spec-author,implementer,reviewer}.md
AGENTS.md
```

### Transformations clave (lógica, no código)

- [ ] Reescribir el patrón de 4 roles de la referencia al idioma CCEM: `feature_list.json`
      → ID de Planner; `requirements/design/tasks` → `spec/plan/tasks`; una puerta humana
      → tres checkpoints (spec, plan, tasks).
- [ ] Inyectar en cada rol las normas que debe cumplir **por referencia** (no copiadas):
      P1-P10, `ccem-planner`, `ccem-prompting` (Anti-Hack), `ccem-core` (modelo),
      `soutec-github`.
- [ ] Bump de versión `1.0.0 → 1.1.0` en manifest **y** `package.json` (se mueven juntas).

---

## Constitution alignment

Verificación contra `docs/constitution.md`, principio por principio.

| Principio | Veredicto | Cómo aplica · ADR |
|---|---|---|
| **P1** — Contratos antes que tecnologías | cumple | Los roles se nombran en lenguaje de negocio (español). No introducen dependencia. |
| **P2** — Hexagonal + enforcement | no aplica | No hay código productivo ni `domain/`; son templates Markdown. |
| **P3** — Medir antes de optimizar | no aplica | No hay performance que optimizar. |
| **P4** — Modularidad por capas | no aplica | Ídem P2. |
| **P5** — Observabilidad día uno | no aplica | No hay runtime que observar (contenido estático). |
| **P6** — Human-in-the-loop en acciones sensibles | **cumple (central)** | Los tres checkpoints y "ningún agente se auto-aprueba ni marca `done`" son P6 hecho producto. ADR: `docs/decisions/20260721-orquestacion-multiagente.md`. |
| **P7** — [placeholder sin definir en este repo] | no aplica | P7 aún no está instanciado en la constitución. |
| **P8** — [placeholder sin definir en este repo] | no aplica | Ídem P7. |
| **P9** — Simplicity First | cumple | Orquestación opt-in (no global forzado), sin motor nuevo, sin `feature_list.json`. Solo 5 archivos + 5 líneas de manifest. |
| **P10** — Surgical Changes | cumple | No se toca `src/`. Solo se agrega contenido y su manifest; el único cambio a código de test es el assert de versión que el bump obliga. |

ADR a crear antes de cerrar el plan: **`/adr-new orquestacion-multiagente`** — registra la
adopción del patrón, la decisión opt-in y el resultado de `ccem-research` (D4).

---

## Dependencies

### Deben existir ANTES de empezar
- [x] Motor de templates con política `managed` — ya existe.
- [x] ID de Planner (`PLN-001`) y rama — ya creados.

### Se crean DURANTE
- [ ] `templates/base/claude/agents/{orchestrator,spec-author,implementer,reviewer}.md`
- [ ] `templates/base/AGENTS.md`
- [ ] `docs/decisions/20260721-orquestacion-multiagente.md` (ADR)

### Se modifican DURANTE
- [ ] `templates/harness.manifest.json` — +5 entradas, `harnessVersion` → `1.1.0`.
- [ ] `package.json` — `version` → `1.1.0`.
- [ ] `CHANGELOG.md` — entrada `1.1.0`.
- [ ] `test/init.test.js` — assert de versión `1.0.0` → `1.1.0` + asserts de los 5 archivos nuevos.
- [ ] `CLAUDE.md` (de este repo, sección Metodología) — mención de los agentes. **Es
      `user-owned`**: se edita el `base/CLAUDE.md` del template y este repo lo recibe como
      `.new` en el próximo upgrade; para este repo lo ajusto a mano en su task.

---

## Risks y mitigaciones

| Risk | Impact | Likelihood | Mitigation |
|------|--------|-----------|------------|
| Un subagente no puede spawnear otro subagente (nesting) en Claude Code, y el `orchestrator`-como-subagente no podría lanzar a los otros 3 | M | M | Documentar la invocación de modo que la **sesión top-level adopte el rol** orquestador y spawnee a los workers (así funciona la referencia). Verificar el comportamiento real en el task de implementación antes de fijar la redacción. |
| Copiar prosa de la referencia (sin licencia) genera problema de IP | M | L | Redactar todo original en español CCEM; la referencia es inspiración del **patrón**, no fuente de texto. Ver D4. |
| El bump de versión rompe tests que fijan `1.0.0` | L | Alta (ya detectado) | Actualizar el assert en `test/init.test.js` en el mismo task del bump. |
| `AGENTS.md` en la raíz colisiona con otra convención del repo consumidor | L | L | Política `managed`: si el usuario ya tiene uno propio distinto, el motor deja `.new` y no pisa. |

---

## Research notes

### D1: Orquestación opt-in, no rol global forzado

**Decisión**: la orquestación se invoca a demanda; el orquestador es un subagente disponible.
**Rationale**: forzar `CLAUDE.md` a actuar siempre como líder (como la referencia) secuestra
cada proyecto y viola P9/P10.
**Alternativa descartada**: replicar el `CLAUDE.md` "rol obligatorio: leader" de la referencia.

### D2: Identificadores de rol en inglés, prosa en español

**Decisión**: `name:` en inglés kebab-case (`orchestrator`, `spec-author`, `implementer`,
`reviewer`); el cuerpo instructivo de cada agente, en español.
**Rationale**: el `name:`/`subagent_type` es un identificador que toca el framework (se
invoca programáticamente) → la constitución manda inglés para eso. El método, que es lo que
el dev lee, sigue en español.
**Alternativa descartada**: nombres en español (`orquestador`, etc.) — más inconsistente con
la regla de naming, y `subagent_type` con tilde/ñ es frágil.

### D3: `AGENTS.md` como `managed`, no `user-owned`

**Decisión**: `managed`.
**Rationale**: documenta el flujo que el harness posee; queremos que el upgrade lo mantenga
fresco, como las skills. Si el usuario lo edita, el motor no lo pisa igual (queda `.new`).
**Alternativa descartada**: `user-owned` — se quedaría viejo y desalineado del flujo real.

### D4: Derivar de `betta-tech/harness-sdd` (ccem-research)

> **Herramienta**: patrón de orquestación de 4 roles de `betta-tech/harness-sdd`.
> **Decisión**: adoptar el **patrón**, no vendorizar los archivos.
> **Los 3 criterios que decidieron**:
> 1. *Problema real* — falta separación de roles y revisión independiente (dolor concreto).
> 2. *Costo de contexto* — cero: son Markdown estáticos, no un MCP ni una dependencia.
> 3. *Costo de salida* — mínimo: se borran 5 archivos y una entrada de manifest.
> **Nota de licencia**: el repo **no declara LICENSE** → "all rights reserved" sobre su
> *texto*. Los patrones/metodologías no son copyrightables; la prosa sí. Mitigación:
> redactar 100% original en español CCEM y citar la referencia como inspiración. **No** se
> copia texto.
> **Alternativa descartada**: escribir la orquestación desde cero sin mirar referencia —
> descartada por reinventar un patrón ya probado.
> **Dueño**: Ignacio A.

Como la decisión es significativa → **ADR** (P6/documentation de la constitución).

---

## Implementation strategy

### Approach
- [ ] Rollout incremental por archivo, un commit por task (regla del harness).
- [ ] Sin feature flag: es contenido nuevo aditivo, no cambia comportamiento del motor.
- [ ] Test strategy: extender `test/init.test.js` (unit, in-process) para asertar que los 5
      archivos se emiten y que la versión subió. Correr los invariantes existentes
      (idempotencia, pureza `--dry-run`, NUNCA SE PISA).

### Rollback plan
1. `git revert` del merge (contenido puro, sin migración de datos).
2. Bajar `harnessVersion`/`version` si ya se hubiera tagueado (lo hace el coordinador).

---

## Observability

No aplica en sentido runtime (son templates estáticos). La "observabilidad" del feature es
el propio motor: `status`/`upgrade --dry-run` muestran si los agentes están al día en un repo.

---

## Checklist antes de avanzar a Tasks

- [ ] ¿Plan alineado con constitución (verificado punto por punto)? — sí, tabla arriba.
- [ ] ¿Data contracts completos y sin ambigüedad? — entrada de manifest + frontmatter definidos.
- [ ] ¿Risks identificados con mitigación concreta? — sí, incluido el nesting de subagentes.
- [ ] ¿Dependencies verificadas? — sí.
- [ ] ¿Developer lead aprobó el plan? — **pending (tu checkpoint)**.
- [ ] ¿ADRs creados para decisiones significativas? — se crea en el primer task (`/adr-new`).
