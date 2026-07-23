# ADR: Orquestación multi-agente de 4 roles bajo CCEM

**Fecha**: 2026-07-21
**Status**: accepted
**Deciders**: Ignacio A (lead), coordinador del harness
**Tarjeta**: PLN-001 · Spec: `specs/PLN-001-orquestacion-agentes/`

## Context

El harness ya tiene el andamiaje SDD (skills, comandos, plantillas spec/plan/tasks), pero el
trabajo de agentes es de un solo hilo: un mismo Claude especifica, implementa, se revisa y
decide cuándo terminó. Eso funde roles que la metodología separa a propósito y deja el
Anti-Hack (`ccem-prompting`) sin un revisor independiente que lo haga cumplir.

El repo `betta-tech/harness-sdd` demuestra un patrón de cuatro roles —orquestador, autor de
spec, implementador, revisor— que se pasan el trabajo por disco (no por chat) con una puerta
de aprobación humana. El patrón es bueno pero está atado a sus convenciones (`feature_list.json`,
carpetas `requirements/design/tasks`, sin ID de Planner, sin P1-P10, y con un `CLAUDE.md` que
fuerza a cada sesión a actuar como líder).

Restricción central: el harness es un generador; el feature debe entrar como **contenido**
(templates + manifest), sin tocar el motor (`plan.js`/`apply.js`).

## Decision

Adoptar el **patrón** de 4 roles y distribuirlo como templates `managed` del harness, con
cuatro adaptaciones a CCEM:

- **D1 — Opt-in, no líder global.** La orquestación se invoca a demanda; no se fuerza a cada
  sesión vía `CLAUDE.md`. Forzarlo secuestraría el `CLAUDE.md` de cada proyecto consumidor y
  violaría P9/P10.
- **D2 — Identificadores en inglés, prosa en español.** `name:`/`subagent_type` en inglés
  kebab-case (`orchestrator`, `spec-author`, `implementer`, `reviewer`) porque tocan el
  framework; el cuerpo instructivo, en español (es el método que lee el dev).
- **D3 — `AGENTS.md` como `managed`.** El harness posee el documento de flujo; el upgrade lo
  mantiene fresco. Si el usuario lo edita, el motor no lo pisa (queda `.new`).
- **D4 — Derivar el patrón, no la prosa.** Ver grilla `ccem-research` abajo.

El flujo se subordina a la constitución: los checkpoints humanos (spec→plan→tasks→implement)
y "ningún agente se auto-aprueba ni marca `done`" son **P6 hecho producto**. El hilo sigue
siendo el ID de Planner y `specs/<ID>-<slug>/`; no se introduce un segundo sistema de estado.

### Grilla `ccem-research` (D4)

- **Herramienta**: patrón de orquestación de `betta-tech/harness-sdd`.
- **Decisión**: adoptar el patrón, **no** vendorizar los archivos.
- **Criterios que decidieron**: problema real (falta separación de roles); costo de contexto
  nulo (Markdown estático, no MCP ni dependencia); costo de salida mínimo (borrar 5 archivos).
- **Licencia**: el repo **no declara LICENSE** → "all rights reserved" sobre su *texto*. Los
  patrones/metodologías no son copyrightables; la prosa sí. Mitigación: redactar 100% original
  en español CCEM y citar la referencia como inspiración. No se copia texto.
- **Dueño**: Ignacio A.

## Consequences

### Positivas
- Revisión independiente: el `reviewer` (sin Write/Edit) no puede arreglar lo que revisa.
- Todo proyecto SOUTEC hereda la orquestación en el próximo upgrade, sin reinventarla.
- Cero deuda de motor: es contenido + manifest; se revierte con `git revert`.

### Negativas
- Los subagentes de Claude Code pueden no soportar spawnear otros subagentes (nesting): la
  sesión top-level debe adoptar el rol `orchestrator` y lanzar a los workers. Se verifica en
  implementación.
- Duplicación de dogfooding: el contenido vive en `templates/base/…` y, emitido, en
  `.claude/agents/…` de este repo (igual que ya pasa con las skills).

### Neutras
- `AGENTS.md` aparece en la raíz de cada repo consumidor como nueva superficie de documentación.

## Alternatives considered

### Alternativa A: Líder global forzado vía `CLAUDE.md` (como la referencia)
**Pros**: cada sesión orquesta sin que el dev lo pida.
**Cons**: secuestra el `CLAUDE.md` del proyecto; impone ceremonia aun para un fix trivial.
**Por qué se descartó**: viola P9 (Simplicity First) y P10 (Surgical Changes).

### Alternativa B: Escribir la orquestación desde cero, sin mirar referencia
**Pros**: cero dudas de IP.
**Cons**: reinventa un patrón ya probado; más lento y con más riesgo de diseño.
**Por qué se descartó**: los patrones no son copyrightables; alcanza con no copiar prosa (D4).

### Alternativa C: Roles como skills invocables en vez de subagentes
**Pros**: reusa el mecanismo de skills existente.
**Cons**: una skill no aísla contexto ni herramientas por rol como un subagente (el `reviewer`
sin Write es enforcement real, no una recomendación).
**Por qué se descartó**: el aislamiento de `tools` por rol es parte del valor.

## References

- Spec/Plan/Tasks: `specs/PLN-001-orquestacion-agentes/`
- Referencia (inspiración del patrón, sin licencia): `github.com/betta-tech/harness-sdd`
- Constitución P6, P9, P10: `docs/constitution.md`
- Skills: `ccem-planner`, `ccem-prompting`, `ccem-core`, `soutec-github`
