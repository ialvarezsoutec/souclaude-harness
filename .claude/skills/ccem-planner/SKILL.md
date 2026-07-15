---
name: ccem-planner
description: Trazabilidad Planner ↔ CCEM ↔ Git. El ID de la tarjeta de Planner es el hilo único que amarra tarjeta, carpeta de spec, rama, commits, PR, release y despliegue. Aplicar al arrancar cualquier trabajo, al nombrar una rama o una carpeta de spec, y al sincronizar el estado entre Planner y GitHub. Si algo no tiene ID, la cadena está rota.
---

# CCEM — Ciclo continuo (Planner ↔ CCEM ↔ Git)

> **Planner ordena el QUÉ. CCEM diseña el CÓMO técnico. Git/GitHub registra el HECHO.
> El ID de Planner es el hilo que amarra los tres.**

## La regla maestra

**Todo trabajo empieza con un ID de tarjeta de Planner.**

Si te piden implementar algo y no hay ID: **pedilo**. No inventes uno, no arranques sin
él. Una rama sin ID rompe la trazabilidad bidireccional y es el anti-pattern más común.

Esto incluye los hotfixes. Un incidente urgente cambia la **prioridad**, no el
**procedimiento**: la tarjeta se crea igual, antes de cerrar la jornada.

## El hilo conductor

```
Tarjeta Planner → Carpeta specs/ → Rama Git → Commits → PR → Release tag → Done
        └──────────────── el mismo ID en todos ────────────────┘
```

| Prefijo | Proyecto |
|---|---|
| `RAM` | Ramón |
| `REA` | Reachy |
| `PAC` | Paco |
| `ALF` | Alfred |
| `PLN` | Transversal / multi-proyecto |
| `SP` | Origen SharePoint |

## Nombres derivados del ID

Dado `PLN-023` + slug `login-usuarios`:

| Qué | Formato | Ejemplo |
|---|---|---|
| Tarjeta | `<PREFIX-NNN> - <Descripción corta>` | `PLN-023 - Login de usuarios` |
| Rama | `<tipo>/<PREFIX-NNN>-<slug>` | `feature/PLN-023-login-usuarios` |
| **Carpeta de spec** | `specs/<PREFIX-NNN>-<slug>/` | `specs/PLN-023-login-usuarios/` |
| Commit | `tipo: descripción` (footer `· Refs: PLN-023` en los significativos) | `feat: implementar hashing de passwords` |
| Tag | `vX.Y.Z`, con el ID en el mensaje | `v1.2.0` · `"feat: login de usuarios (PLN-023)"` |

**La carpeta de spec lleva el mismo slug que la rama.** No son dos slugs distintos: es
el mismo, para que `grep -r PLN-023 specs/` y `git log --grep="PLN-023"` devuelvan lo
mismo.

Usá `/spec-new PLN-023 login-usuarios` para armar todo esto de una.

## Recuperar contexto desde cualquier punto

| Dónde | Buscas | Obtienes |
|---|---|---|
| Planner | `PLN-023` | La tarjeta con todo su trail |
| GitHub | `PLN-023` | Rama, PR, commits, release |
| Repo | `grep -r PLN-023 specs/` | Spec, plan, tasks, ADRs |
| Repo | `git log --grep="PLN-023"` | La historia de commits |

## Sincronización Planner ↔ Git

Estas son acciones, no sugerencias. Recordáselas al usuario cuando corresponda.

| Cuando pasa esto en Git | Hacer esto en Planner |
|---|---|
| Se crea la rama | Mover la tarjeta a **Doing** y comentar: `Rama: feature/PLN-023-login-usuarios` / `Spec: specs/PLN-023-login-usuarios/` |
| Se escribe `tasks.md` | Actualizar el checklist: **un item por cada task `T1..Tn`** |
| Commit de un task | Marcar ese item del checklist |
| Se abre el PR | Comentar `PR abierto: [link]` |
| PR aprobado | **Mantener en Doing.** No mover a Done todavía. |
| Merge + despliegue | Registrar el despliegue, y recién ahí mover a **Done** |

**La tarjeta no se mueve a Done sin registro de despliegue.**

## Las 8 fases

El SDD (4 fases) vive adentro de este ciclo, en las fases 3 a 6.

| # | Fase | Dueño | Artefacto |
|---|---|---|---|
| 1 | Backlog | Coordinador | Tarjeta con ID, título, etiqueta, descripción de 2-3 líneas |
| 2 | Plan Semana | Coordinador | Tarjetas priorizadas. **Máx. 2-3 por developer** |
| 3 | Doing + **SDD Specify** | Developer | Rama + `spec.md` + commit `docs:` |
| 4 | **SDD Plan técnico** | Developer | `plan.md` + ADRs + commit |
| 5 | **SDD Tasks** | Developer | `tasks.md` + checklist en Planner |
| 6 | **SDD Implement** + PR | Developer | Un commit por task + PR draft |
| 7 | Despliegue | Coordinador | Squash & merge, tag SemVer, registro de despliegue |
| 8 | Done + Retro | Equipo | Tarjeta cerrada + promociones a `docs/` |

El ciclo **no termina en Done**: lo aprendido en la fase 8 alimenta el próximo backlog.

### Qué NO va en Planner

- Decisiones técnicas (stack, librerías) → `plan.md`
- Pasos de implementación → `tasks.md`
- Diagramas técnicos → `docs/`

La descripción de la tarjeta son 2-3 líneas del **qué** y el **por qué**. Nunca el cómo.

## Los 7 anti-patterns

1. **Saltar fases del SDD.** Hasta que spec, plan y tasks estén, la rama solo admite
   commits `docs:`. Nada de código.
2. **Planner desactualizado.** Checklist al día, cierre formal el viernes.
3. **Ramas sin ID.** `arreglo`, `prueba-final`, `mi-feature` → rompen la cadena.
4. **PR sin referencia a Planner.** El coordinador lo rechaza.
5. **Despliegue sin registro.** La tarjeta no llega a Done.
6. **Spec y plan mezclados.** Si `spec.md` dice "usaremos FastAPI", está mal: eso es
   `plan.md`.
7. **Hotfix sin tarjeta.** Se crea igual.

## Dónde va cada aprendizaje

| Qué | Dónde |
|---|---|
| Learning del día, gotcha fresco | `notes.md` |
| Gotcha que costó >1 h | `docs/gotchas/` |
| Pattern que apareció 3+ veces | `docs/patterns/` |
| Decisión con trade-off | ADR en `docs/decisions/` (`/adr-new`) |

---

> Si una tarjeta, una rama o un release no tiene el ID de Planner asociado,
> **la cadena está rota y hay que repararla antes de seguir.**
