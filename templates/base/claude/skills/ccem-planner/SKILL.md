---
name: ccem-planner
description: Trazabilidad Hito ↔ CCEM ↔ Git. El ID del hito es el hilo único que amarra hito, carpeta de spec, rama, commits, PR, release y despliegue. Aplicar al arrancar cualquier trabajo, al nombrar una rama o una carpeta de spec, y al derivar el estado desde GitHub. Si algo no tiene ID de hito, la cadena está rota. Planner no se usa: el emisor es el hito.
---

# CCEM — Ciclo continuo (Hito ↔ CCEM ↔ Git)

> **La roca ordena el QUÉ. El hito lo hace comprometible. CCEM diseña el CÓMO técnico.
> Git/GitHub registra el HECHO. El ID del hito es el hilo que amarra los cuatro.**

El QUÉ nace en la capa trimestral (la roca y sus hitos, gestionados en el Vault y en Ninety).
De la carpeta de spec **hacia abajo** manda CCEM. La frontera es el **hito**: lo único que
existe a ambos lados. Esta skill cubre el hilo de trazabilidad; la capa trimestral la cubre
`ccem-rocas`.

## La regla maestra

**Todo trabajo empieza con un ID de hito.**

El hito se define en el Paso 2 de la planificación de la roca (`/rock-plan`), con formato
`<PREFIJO>-H<n>` (ej. `REA-H3`). Es el momento en que existe la información para nombrar el
trabajo y todavía no existe la deuda de haberlo inventado antes.

Si te piden implementar algo y no hay ID de hito: **pídelo**. No inventes uno, no arranques sin
él. Una rama sin ID rompe la trazabilidad y es el anti-pattern más común. **Planner no se usa:
el emisor es el hito.**

Esto incluye los hotfixes. Un incidente urgente cambia la **prioridad**, no el
**procedimiento**: el trabajo cuelga de un hito igual.

## El hilo conductor

```
Roca <TRIMESTRE>-<PREFIJO>
 └─ Hito <PREFIJO>-H<n> → Carpeta specs/ → Rama Git → Tasks <ID-hito>-T<nnn> → Commits → PR → Squash → Tag → Done
             └──────────────────── el mismo ID en todos ────────────────────┘
```

| Prefijo | Proyecto |
|---|---|
| `RAM` | Ramón |
| `REA` | Reachy |
| `PAC` | Paco |
| `ALF` | Alfred |
| `PLN` | Transversal / multi-proyecto |
| `SP` | Origen SharePoint |

**El registro de prefijos es la autoridad, no una regla de formato.** Vive en el Vault
(`00-System/id-registry.md`). Un proyecto nuevo pide su prefijo antes de la reunión trimestral,
no durante. Los prefijos son de **proyecto**, no de tarjeta.

## Nombres derivados del ID

Dado el hito `REA-H3` + slug `captura-lead`:

| Qué | Formato | Ejemplo |
|---|---|---|
| Hito | `<PREFIJO>-H<n>` | `REA-H3` |
| Rama | `<tipo>/<PREFIJO>-H<n>-<slug>` | `feature/REA-H3-captura-lead` |
| **Carpeta de spec** | `specs/<PREFIJO>-H<n>-<slug>/` | `specs/REA-H3-captura-lead/` |
| **Task** | `<PREFIJO>-H<n>-T<nnn>` (emitido por el `spec-author` en `tasks.md`; bloques de 100 por spec según el orden de reserva en `/rock-plan`) | `REA-H3-T001` |
| Commit | `tipo: descripción` (footer `Refs:` — **obligatorio con el ID de task en el commit-por-task**, ej. `Refs: REA-H3-T003`; con el ID de hito en los demás significativos) | `feat: capturar lead al cierre de la visita` |
| Tag | `vX.Y.Z`, con el ID en el mensaje | `v1.2.0` · `"feat: captura de lead (REA-H3)"` |

**La carpeta de spec lleva el mismo slug que la rama.** No son dos slugs distintos: es el mismo,
para que `grep -r REA-H3 specs/` y `git log --grep="REA-H3"` devuelvan lo mismo.

**Un hito puede producir varios specs, todos con el mismo ID.** El slug los distingue. El
criterio: **una carpeta de spec produce una rama y un PR**. Si el hito aterriza como un cambio
coherente sobre un sistema, es uno; si toca el daemon, la UI y el pipeline, son tres.

Usa `/spec-new REA-H3 captura-lead` para armar todo esto de una.

## Recuperar contexto desde cualquier punto

| Dónde | Buscas | Obtienes |
|---|---|---|
| Vault | `REA-H3` | El hito, sus criterios congelados y su fecha comprometida |
| GitHub | `REA-H3` | Rama, PR, commits, release |
| Repo | `grep -r REA-H3 specs/` | Spec, plan, tasks, ADRs |
| Repo | `git log --grep="REA-H3"` | La historia de commits |

## El estado se deriva, no se escribe

**El estado del trabajo vive en GitHub, no en un tablero.** No hay que moverlo a mano: se
deriva de rama y PR. Escribir a mano un estado derivable es un dato falso con apariencia de dato.

| Estado del spec | Se deriva de |
|---|---|
| pendiente | no hay rama |
| en curso | rama abierta, sin PR mergeado |
| en revisión | PR abierto |
| cerrado | PR mergeado |
| `fecha_real` del hito | cierre de la última tarjeta (PR) del hito |

Al mergear el **último** PR de un hito, se registra `fecha_real` en el YAML de la roca (lo hace
`/rock-status`, no se escribe a mano). El estado ejecutivo del hito sube a Ninety solo en la
cadencia semanal, y solo al nivel hito: nunca specs ni tasks.

## El ciclo

El SDD (4 fases de `ccem-sdd`) vive dentro de este ciclo, en las fases de ejecución.

| # | Fase | Dueño | Artefacto |
|---|---|---|---|
| 1 | Roca definida | Dueño (reunión trimestral) | Enunciado verificable + dueño + fecha de cierre |
| 2 | Hitos planificados (`/rock-plan`) | Dueño + agente | YAML de roca + IDs de hito `<PREFIJO>-H<n>` |
| 3 | **SDD Specify** | Developer | Rama + `spec.md` + commit `docs:` |
| 4 | **SDD Plan técnico** | Developer | `plan.md` + ADRs + commit |
| 5 | **SDD Tasks** | Developer | `tasks.md` |
| 6 | **SDD Implement** + PR | Developer | Un commit por task + PR draft |
| 7 | Despliegue | Coordinador | Squash & merge, tag SemVer, `fecha_real` en el YAML |
| 8 | Cierre de hito / roca (`/rock-close`) | Dueño | Evidencia archivada + retro |

El ciclo **no termina en Done**: lo aprendido en la fase 8 alimenta la roca del trimestre siguiente.

### Qué NO cruza al nivel ejecutivo

- Decisiones técnicas (stack, librerías) → `plan.md`, ADR
- Pasos de implementación → `tasks.md`
- Diagramas técnicos → `docs/`

A Ninety y al Vault solo sube el nivel **hito**. Nunca specs ni tasks.

## Límite de WIP

Con el tablero fuera, el ID tiene reemplazo pero el límite de WIP también: **máximo 2 ramas
vivas por persona**, contable con `git branch -r` sin herramienta nueva. Es más pobre que un
tablero, pero es verificable, y una regla verificable vale más que una mejor que nadie puede
comprobar. Los límites de WIP son lo único que evita llegar a la semana 12 con seis cosas al 70%.

## Los anti-patterns

1. **Saltar fases del SDD.** Hasta que spec, plan y tasks estén, la rama solo admite commits
   `docs:`. Nada de código.
2. **Estado escrito a mano.** Un campo derivable (estado del spec, `fecha_real`) escrito a mano
   miente en silencio. Se deriva de GitHub.
3. **Ramas sin ID.** `arreglo`, `prueba-final`, `mi-feature` → rompen la cadena.
4. **PR sin referencia al hito.** El coordinador lo rechaza.
5. **Detalle técnico subiendo a Ninety.** Solo cruza el nivel hito.
6. **Spec y plan mezclados.** Si `spec.md` dice "usaremos FastAPI", está mal: eso es `plan.md`.
7. **Hotfix sin hito.** Cuelga de un hito igual.
8. **Inventar un ID de hito.** Si no existe, se pide; no se inventa el prefijo ni el número.

## Dónde va cada aprendizaje

| Qué | Dónde |
|---|---|
| Learning del día, gotcha fresco | `notes.md` |
| Gotcha que costó >1 h | `docs/gotchas/` |
| Pattern que apareció 3+ veces | `docs/patterns/` |
| Decisión con trade-off | ADR en `docs/decisions/` (`/adr-new`) |

---

> Si un hito, una rama o un release no tiene el ID de hito asociado,
> **la cadena está rota y hay que repararla antes de seguir.**
