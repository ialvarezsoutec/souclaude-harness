# Spec: Orquestación de agentes con roles bajo CCEM

**Status**: draft
**Owner**: Ignacio A
**Stakeholders**: coordinador del harness, devs que consumen el harness
**Creado**: 2026-07-17
**Aprobado**: pending
**Tarjeta Planner**: PLN-001

---

## Reglas de escritura

- **Esta spec describe el QUÉ y el POR QUÉ**, no el CÓMO técnico.
- **NO incluir decisiones de tech stack aquí** — esas van en `plan.md`.
- Un stakeholder no-técnico debería poder leer esta spec y entender qué se construirá.

---

## Context

### Business background

Hoy un dev que abre un repo con el harness de SOUTEC tiene el método CCEM escrito
(constitución, skills, comandos SDD), pero **el trabajo de agentes es de un solo hilo**:
un Claude hace todo — especifica, implementa, revisa y decide cuándo terminó. Eso mezcla
roles que la metodología separa a propósito: quien escribe la spec no debería ser quien
la implementa, y quien implementa no debería ser quien se aprueba a sí mismo. Sin esa
separación, el mismo agente que se desvió del spec es el que declara "listo", y el
Anti-Hack (`ccem-prompting`) queda sin un revisor independiente que lo haga cumplir.

El repo de referencia `betta-tech/harness-sdd` resuelve esto con cuatro roles
—orquestador, autor de spec, implementador y revisor— que se pasan el trabajo **por
disco, no por chat**, con una puerta de aprobación humana entre especificar e
implementar. El patrón es bueno, pero está atado a sus propias convenciones
(`feature_list.json`, carpetas `requirements/design/tasks`, sin ID de Planner, sin P1-P10).

### Why now

El harness ya tiene el andamiaje SDD (`/spec-new`, plantillas, checkpoints) pero le falta
el ejecutor multi-agente que lo haga cumplir solo. Incorporar la orquestación ahora, como
parte del harness, significa que **todo proyecto SOUTEC la hereda en el próximo upgrade**
sin que cada dev la reinvente. Cuanto más tarde, más repos arrancan trabajo de agentes sin
separación de roles y hay que retrofitear.

---

## Goals

En orden de prioridad:

1. Que cualquier repo con el harness disponga de **cuatro roles de agente** (orquestador,
   autor de spec, implementador, revisor) que sigan el flujo SDD de CCEM de punta a punta.
2. Que los roles **respeten y hagan cumplir las normas ya existentes** del harness: los
   principios P1-P10 de la constitución, la trazabilidad por ID de Planner
   (`ccem-planner`), el Anti-Hack (`ccem-prompting`), la selección de modelo (`ccem-core`)
   y el flujo Git (`soutec-github`) — sin duplicar esas reglas, referenciándolas.
3. Que la separación de roles produzca **una revisión independiente**: el revisor no es el
   implementador, y ningún agente se declara `done` a sí mismo ni salta un checkpoint humano.
4. Que la orquestación se **distribuya como parte del harness** (se emite a los proyectos
   consumidores) y quede aplicada también en este propio repo.

---

## Non-goals

Explícitamente **NO** se construirá:

- **Un motor de ejecución automática sin humano en el loop.** Los checkpoints humanos
  (spec → plan → tasks → implement) siguen siendo obligatorios; los agentes paran, no
  auto-aprueban.
- **Un reemplazo de las skills o comandos existentes.** `/spec-new`, `ccem-sdd`, etc.
  siguen siendo la fuente de verdad del método; los agentes los invocan, no los sustituyen.
- **Un `feature_list.json` ni un registro de features paralelo.** El ID de Planner y la
  carpeta `specs/<ID>-<slug>/` ya son el hilo; no se introduce un segundo sistema de estado.
- **Cambiar la constitución ni los principios P1-P10.** Los agentes se subordinan a ellos.
- **Orquestación específica de un stack** (Python, Node, etc.). Los roles son agnósticos
  al lenguaje del proyecto consumidor.

---

## User journeys

### Journey 1: Dev arranca una feature con orquestación

**Actor**: dev que consume el harness
**Trigger**: tiene una tarjeta de Planner con ID y quiere implementarla con agentes
**Precondiciones**: el repo tiene el harness al día; existe la rama `tipo/<ID>-<slug>`

**Pasos**:
1. El dev invoca al orquestador con "implementá la tarjeta `<ID>`".
2. El orquestador verifica precondiciones (rama con ID, main al día) y lanza al autor de spec.
3. El autor de spec redacta `specs/<ID>-<slug>/spec.md` y **para** en el primer checkpoint.
4. El dev lee la spec y aprueba (o pide cambios).
5. Aprobada, el orquestador avanza a `plan.md` y luego `tasks.md`, con su checkpoint cada uno.
6. Recién con los tres aprobados, lanza al implementador task por task.
7. Al terminar, lanza al revisor, que verifica trazabilidad y constitución de forma independiente.

**Resultado esperado**: la feature queda implementada, trazable al ID de Planner, con una
revisión independiente y sin que ningún agente haya saltado un checkpoint.
**Edge cases**: si no hay ID de Planner, el orquestador para y lo pide (no lo inventa); si
el autor de spec detecta acceptance criteria insuficientes, para como `blocked`.

### Journey 2: El revisor rechaza trabajo que "dice estar listo"

**Actor**: revisor (agente)
**Trigger**: el implementador reportó fin de trabajo
**Precondiciones**: existe la spec aprobada y el código en la rama

**Pasos**:
1. El revisor lee la constitución, la spec y el diff.
2. Verifica que cada requisito trace a un test concreto (no un mock que finge la lógica).
3. Corre `/constitution-check` mentalmente sobre el diff: ¿algún cambio no traza al pedido (P10)?
   ¿el dominio importa un framework (P2)? ¿hay complejidad especulativa (P9)?
4. Si algo falla, emite `CHANGES_REQUESTED` con archivo y línea, sin arreglarlo él mismo.

**Resultado esperado**: nada llega a `done` con tests que no prueban, scope creep o una
violación de P1-P10.
**Edge cases**: tests en verde pero que no cubren un requisito → rechaza igual.

---

## Success criteria

Métricas objetivamente medibles:

- [ ] Existen cuatro definiciones de agente distribuibles por el harness, cada una con su
      rol, sus herramientas y sus reglas duras.
- [ ] Cada definición referencia explícitamente las normas del harness que debe cumplir
      (P1-P10, `ccem-planner`, `ccem-prompting`, `ccem-core`, `soutec-github`) en vez de
      redefinirlas.
- [ ] El flujo documentado usa `specs/<ID>-<slug>/{spec,plan,tasks}.md` y el ID de Planner
      — cero referencias a `feature_list.json` o a `requirements/design/tasks`.
- [ ] Los agentes se emiten a un repo consumidor tras `upgrade` (entrada en el manifest) y
      quedan aplicados en este mismo repo.
- [ ] El coordinador del harness revisa las definiciones y da OK en el PR.

---

## Constraints and assumptions

### Constraints (restricciones)

- Debe integrarse en el motor de templates existente **sin tocar** `plan.js`/`apply.js`
  (es contenido nuevo, no lógica nueva): archivos en `templates/base/` + entradas de manifest.
- Los agentes no pueden contradecir la constitución ni las skills; solo referenciarlas.
- Un agente jamás salta un checkpoint humano ni se marca `done` a sí mismo.

### Assumptions (supuestos explícitos)

- Asumimos que el patrón de 4 roles de `betta-tech/harness-sdd` es un buen punto de partida
  y que su licencia permite derivar de él (verificar en Plan / `ccem-research`).
- Asumimos que la ejecución de subagentes está disponible en el entorno donde corren los devs.
- Asumimos que el ID de Planner siempre existe antes de arrancar (lo garantiza el método).

---

## Open questions

- [ ] Q1: ¿El orquestador debe existir como subagente en `.claude/agents/` o como skill
      invocable? — asignado a coordinador — se resuelve en `plan.md`.
- [ ] Q2: ¿Agregamos un `AGENTS.md` de navegación (como la referencia) o basta con
      `CLAUDE.md` + las definiciones? — asignado a Ignacio — se resuelve en `plan.md`.
- [ ] Q3: ¿La licencia de `betta-tech/harness-sdd` permite derivar? — pasar por `ccem-research`.

---

## Out of scope (futuro)

- Métricas/telemetría de cuántas features pasan por orquestación.
- Un rol "explorer" adicional para refactors muy grandes (la referencia lo insinúa).
- Automatizar el disparo del orquestador desde una tarjeta de Planner sin intervención.

---

## Checklist antes de avanzar a Plan

- [ ] ¿Un stakeholder no-técnico lee esto y entiende qué se construirá?
- [ ] ¿No hay decisiones técnicas prematuras (no se menciona tech stack)?
- [ ] ¿Open questions asignadas con dueño y deadline?
- [ ] ¿Success criteria son medibles objetivamente?
- [ ] ¿Non-goals explícitos cubriendo asunciones comunes?
- [ ] ¿Stakeholder firmó off o dio feedback positivo?
