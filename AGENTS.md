# AGENTS.md — Mapa de navegación para agentes de IA

> Este archivo es el **punto de entrada** para cualquier agente que trabaje en este
> repositorio. NO es una biblia de reglas: es un **mapa**. Lee solo lo que
> necesites cuando lo necesites (divulgación progresiva).

---

## 1. Antes de empezar (obligatorio)

1. Lee `CLAUDE.md` para el contexto del proyecto (stack, dominio, comandos).
2. Lee `docs/constitution.md`: los principios P1-P10 son no-negociables.
3. Si la tarea es una feature nueva, un refactor grande, una migración o un
   cambio de contrato, aplica **Spec-Driven Development** — ver la skill
   `ccem-sdd` y §3 de este archivo. Para un bug puntual, un ajuste cosmético
   o un hotfix, la matriz de decisión de `ccem-sdd` puede indicar que SDD no
   aplica: en ese caso, dilo y hacé el trabajo directamente.

## 2. Mapa del repositorio

| Archivo / carpeta            | Qué contiene                                                                | Cuándo leerlo |
|------------------------------|-----------------------------------------------------------------------------|---------------|
| `CLAUDE.md`                  | Contexto del proyecto, stack, comandos, reglas de git                      | Siempre, al empezar |
| `docs/constitution.md`       | Principios P1-P10 no-negociables                                            | Antes de cualquier decisión arquitectónica |
| `specs/<feature-slug>/`      | `spec.md` + `plan.md` + `tasks.md` (o variantes `-lite`)                    | Antes de implementar cualquier feature con SDD |
| `docs/decisions/`            | ADRs — decisiones con trade-off                                             | Al tomar una decisión que otro dev necesitará entender después |
| `notes.md`                   | Scratchpad persistente de aprendizajes recientes                            | Para dejar o buscar un gotcha del día |
| `.claude/skills/`            | Skills CCEM: `ccem-core`, `ccem-sdd`, `ccem-planner`, `ccem-stack`, etc.    | Se aplican solas cuando el contexto lo amerita |
| `.claude/agents/`            | Definiciones de subagentes (`leader`, `spec_author`, `implementer`, `reviewer`) | Si orquestas trabajo complejo con subagentes reales |

## 3. Dos formas de trabajar, no dos flujos distintos

Este repo soporta **Spec-Driven Development** (skill `ccem-sdd`) de dos
maneras que producen los mismos artefactos en `specs/<slug>/`:

- **Un solo Claude sigue la skill paso a paso** (Specify → Plan → Tasks →
  Implement), instanciando specs con `/spec-new`. Es el modo por defecto y
  cubre la gran mayoría de los casos.
- **Orquestación multi-agente** (`.claude/agents/leader.md` +
  `spec_author.md` + `implementer.md` + `reviewer.md`): útil cuando conviene
  aislar contexto entre fases o paralelizar exploración antes de escribir la
  spec. El `leader` decide cuándo lanzar cada subagente; nunca escribe
  código él mismo. Ver `leader.md` para el protocolo completo.

Ambas rutas comparten el mismo gate humano: **hasta que `tasks.md` esté
aprobado, no se toca código.**

## 4. Agentes especialistas bajo demanda

Además del cuarteto de orquestación SDD, este harness puede incluir agentes
especialistas invocados para una tarea concreta y acotada, no como parte del
flujo diario. El caso real hoy es `security-evidence-compiler.md`: se activa
solo cuando la skill `it-security-approval` completa un gate de seguridad
(`FINAL_SECURITY_GATE=PASSED`) y compila la evidencia en un informe para IT.
No es un rol genérico de "asesor" — es un agente con contrato de activación
explícito y entradas/salidas bien definidas. Si en el futuro aparece otro
caso concreto de este tipo, se agrega con su propio nombre descriptivo, no
como una casilla vacía a llenar.

## 5. Reglas duras (no negociables)

- **Una sola feature a la vez.** No mezcles cambios de varias tareas en la
  misma sesión.
- **No declares una tarea terminada sin pruebas verdes.** Ejecuta la suite
  de tests/lint/build del proyecto (comandos en `CLAUDE.md`).
- **No saltes la fase de spec** cuando la matriz de `ccem-sdd` dice que
  aplica.
- **No saltes la puerta de aprobación humana** entre `tasks.md` aprobado e
  Implement.
- **Si no sabes algo, busca en `docs/`** antes de inventarlo.
- **Si algo es ambiguo o parece mal: para y pregunta.** No adivines ni
  reinterpretes.

## 6. Si te bloqueas

- Relee la sección relevante de `docs/` o la skill correspondiente.
- Si la herramienta no hace lo que esperas, **no inventes un workaround**:
  reporta el bloqueo con contexto concreto y para.
