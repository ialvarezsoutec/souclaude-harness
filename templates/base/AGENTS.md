# AGENTS.md — Orquestación de agentes bajo CCEM

Este archivo explica **cómo trabajan los agentes** en un repo con el harness de SOUTEC. No
es una biblia de reglas: esas viven en `docs/constitution.md` y en las skills de
`.claude/skills/`. Esto es el **mapa** del flujo multi-agente. Lee lo que necesites cuando lo
necesites.

## Los cuatro roles

Viven en `.claude/agents/`. Cada uno tiene sus herramientas acotadas a propósito.

| Agente | Rol | Escribe código | Herramienta clave |
|---|---|---|---|
| `orchestrator` | Descompone y coordina; hace respetar los checkpoints. | ❌ | `Agent` (lanza a los otros) |
| `spec-author` | Redacta `spec.md` / `plan.md` / `tasks.md`, una fase a la vez. | ❌ | `Write`/`Edit` (solo en `specs/`) |
| `implementer` | Implementa la tarjeta task por task, cada cambio con su test. | ✅ | `Write`/`Edit` |
| `reviewer` | Aprueba o rechaza de forma **independiente**. | ❌ | (sin `Write`/`Edit`: dictamina) |

La separación es el punto: quien especifica no implementa, y quien implementa **no se
aprueba a sí mismo**.

## El flujo

```
tarjeta Planner (ID) ─► rama tipo/<ID>-<slug>
        │
        ▼
spec.md ─► ⏸ HUMANO ─► plan.md ─► ⏸ HUMANO ─► tasks.md ─► ⏸ HUMANO ─► implement ─► review ─► PR
```

Son **tres checkpoints humanos** antes de escribir código, no uno. Hasta que `spec.md`,
`plan.md` y `tasks.md` estén aprobados, la rama **solo admite commits `docs:`**. Durante
`implement`, el review es incremental (task por task), nunca en batch al final.

## Cómo se invoca (opt-in)

La orquestación **no** corre en cada sesión: la pides cuando la quieres.

> "Actuá como `orchestrator` para la tarjeta PLN-XXX."

Un subagente de Claude Code no siempre puede lanzar otros subagentes, así que en la práctica
**la sesión principal adopta el rol `orchestrator`** y desde ahí lanza a `spec-author`,
`implementer` y `reviewer` según la fase. Para un cambio que la matriz de `ccem-sdd` marca
como "saltá SDD" (fix puntual, cosmético, spike, hotfix), no montes el flujo: hazlo directo.

## Agentes especialistas bajo demanda

Además del cuarteto de orquestación SDD, este harness puede incluir agentes
especialistas invocados para una tarea concreta y acotada, no como parte del
flujo diario. El caso real hoy es `security-evidence-compiler.md`: se activa
solo cuando la skill `it-security-review` completa un gate de seguridad
(`FINAL_SECURITY_GATE=PASSED`) y compila la evidencia en un informe para IT.
No es un rol genérico de "asesor" — es un agente con contrato de activación
explícito y entradas/salidas bien definidas. Si en el futuro aparece otro
caso concreto de este tipo, se agrega con su propio nombre descriptivo, no
como una casilla vacía a llenar.

## Reglas que todos respetan

Los agentes **no redefinen** las reglas del harness; las cumplen. Fuente de verdad:

- **`docs/constitution.md`** — P1-P10. P2 (dominio no importa frameworks), P9 (Simplicity),
  P10 (Surgical) y P6 (human-in-the-loop, que es lo que hacen los checkpoints).
- **`ccem-planner`** — el ID de Planner es el hilo: tarjeta ↔ `specs/<ID>-<slug>/` ↔ rama ↔
  commits ↔ PR. Sin ID, el `orchestrator` para y lo pide; no lo inventa.
- **`ccem-prompting`** (Anti-Hack) — el `reviewer` caza tests que no prueban, mocks que fingen
  lógica y errores tragados. Ningún agente reporta "listo" con trabajo simulado.
- **`ccem-core`** — selección de modelo por rol (razonamiento alto para diseño/review).
- **`soutec-github`** — nombres de rama, Conventional Commits en español, plantilla de PR.
  Nadie hace commit/merge a `main` ni crea tags/releases.

## Resultados por disco, no por chat

Cada agente escribe su resultado en un archivo versionado y devuelve **solo una referencia**
(`spec_ready -> specs/<ID>-<slug>/spec.md`, `done -> progress/impl_<ID>.md`,
`APPROVED -> progress/review_<ID>.md`). El contenido vive en el repo, no en la conversación:
así queda trazable y no se pierde entre sesiones.
