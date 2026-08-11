# CLAUDE.md — souclaude-harness

## Contexto

Proyecto de automation. Stack: Node.js.
Dominio: [describir en 1-2 líneas qué hace este proyecto].

## Metodología CCEM

Harness `1.1.0`. Las skills viven **en este repo**, en `.claude/skills/`, y
se aplican solas cuando el contexto lo amerita:

`ccem-core` (6 principios rectores + selección de modelo) · `ccem-sdd` (Spec-Driven
Development) · `ccem-planner` (trazabilidad Hito ↔ CCEM ↔ Git) · `ccem-research`
(evaluar herramientas) · `ccem-stack` (convenciones) · `ccem-prompting` (Anti-Hack) ·
`soutec-github` (flujo Git obligatorio) · `ccem-rocas` (capa trimestral: la roca, el
hito y el cierre — el hito emite los IDs).

Comandos: `/spec-new`, `/adr-new`, `/constitution-check`, `/harness-upgrade`; y de la
capa de rocas: `/rock-plan`, `/rock-status`, `/rock-close`, `/export-ninety`.

Agentes de orquestación en `.claude/agents/`: `orchestrator`, `spec-author`, `implementer`,
`reviewer`. El flujo completo está en `AGENTS.md`.

## Cuándo se activa el flujo SDD

**Ante todo pedido que implique escribir código, clasifícalo antes de tocar nada.** El flujo
SDD se activa **por complejidad**, no porque alguien lo pida por su nombre:

- **Directo, sin ceremonia** — fix puntual, cosmético (color, copy, rename, formato), typo,
  spike, hotfix, script one-off. *"Cambia el color de este botón"* se hace y ya. Montar SDD
  aquí **viola P9**.
- **SDD** — feature nueva, integración con un sistema externo, contrato o schema nuevo,
  migración, superficie de seguridad (auth, datos sensibles), >3 archivos o >2 días. *"Agrega
  un módulo de login con Entra ID y recuperación de cuenta"* entra por acá: adoptas
  `orchestrator` y arrancas por `spec.md`.

Anuncia la clasificación en una línea antes de arrancar, para que el humano pueda corregirte
a tiempo; si te dice que no hace falta, le haces caso. **Ante la duda, pregunta** en vez de
asumir. La matriz completa está en la skill `ccem-sdd` y el triaje detallado en `AGENTS.md`.

## Constitución

**Siempre** leer `docs/constitution.md` antes de cualquier decisión arquitectónica o
implementación nueva. Los principios **P1-P10** son no-negociables. **P9 (Simplicity
First) y P10 (Surgical Changes) son universales y siempre aplican.**

Las dos reglas que más se violan sin querer:

- **P2 — el dominio jamás importa frameworks.** `adapters → application → domain`, nunca
  al revés. Un framework nunca es un puerto. El enforcement (dependency-cruiser (o ESLint no-restricted-imports)) corre en
  CI y bloquea el merge. **Modificar la config del enforcement para que un check pase es
  hacer trampa**: se corrige el código, no la regla.
- **P10 — cada línea cambiada traza al request.** Si no traza, no va.

## Git — reglas duras

**Estas reglas son sobre ESTE repo.** El Vault es un repo distinto y tiene su propio
protocolo — ver "Los dos repos" más abajo.

**Nunca** hagas commit, push ni merge directo a `main`. Todo pasa por rama + PR. Los
hotfixes también.

- **Toda rama nace de un hito de una roca.** Formato: `tipo/<ID-hito>-<slug>`
  (`feature/REA-H3-captura-lead`). Tipos: `feature` `fix` `hotfix` `docs` `chore`
  `refactor` `experiment`. El ID del hito es `<PREFIJO>-H<n>` (`REA-H3`), emitido en el
  Paso 2 de la roca (`/rock-plan`).
  **Excepción temporal (rocas/Planner desactivados por ahora):** mientras no se usen
  rocas, no es obligatorio parar a pedir el ID de hito. Si no hay uno, usa el formato
  `tipo/<slug>` (sin prefijo de ID) y seguí adelante. En cuanto se retome el uso de rocas,
  esta excepción se revierte y vuelve a regir "si no tienes el ID, PREGUNTA. No lo
  inventes."
- La carpeta de spec lleva **el mismo ID (o el mismo slug, si no hay ID)** que la rama:
  `specs/<ID-hito>-<slug>/` o, sin ID, `specs/<slug>/`. Ese identificador es el hilo que
  amarra hito, spec, rama, commits, PR y release. Un hito puede producir varios specs
  (mismo ID, distinto slug); cada carpeta = una rama = un PR.
- Commits: `tipo: descripción breve` (español, sin scope). Tipos: `feat` `fix` `docs`
  `chore` `refactor` `test` `style` `build` `ci` `perf` `revert`. Un hotfix se commitea
  como `fix:`. Prohibidos: `update`, `cosas`, `ahora sí`.
- Sincronizar con main: `git fetch origin && git merge origin/main`. **Nunca
  `git push --force`.**
- **Yo no mergeo, no apruebo PRs, no creo tags/releases, no creo repositorios.** Eso es
  del coordinador.
- Al abrir el PR: completar `.github/pull_request_template.md` de verdad. Si piden
  correcciones, push a la **misma** rama — nunca un PR nuevo.

## Los dos repos

Trabajas contra **dos repos a la vez**, con reglas opuestas a propósito:

| | Este repo (proyecto) | El Vault |
|---|---|---|
| Qué va | Código, tests, specs, progreso | Kanban, espejos de specs/progreso, rocas |
| Cómo se escribe | Rama + PR. **Nunca** directo a `main` | **Push directo a `main`**, sin PR |
| Por qué | Todo cambio se revisa | El tablero refleja el ahora, no el último merge |

La ruta local del Vault está en `.claude/vault.local.json` (la escribe `npx souclaude`).
**Antes de tomar un task**: `git -C "<vault>" pull --rebase` y lee
`Project-<PREFIJO>/kanban.md`. Si la tarjeta ya está **En curso** con otro dueño, la está
trabajando otra máquina: **para y pregunta**. Al tomarla, muévela y pushea al Vault en ese
momento. Protocolo completo, convención de commits y manejo de conflictos en
`progress/README.md`. **Nunca `git push --force`, en ninguno de los dos.**

## Flujo de trabajo

Hasta que `spec.md`, `plan.md` y `tasks.md` estén listos, la rama **solo admite commits
`docs:`**. Nada de código todavía.

Un commit por task, **nunca en batch**: se ejecuta de a un task, con su test y su commit.
PR draft tras 2-3 commits, no al final.

Quién aprueba el paso de un task al siguiente depende del **modo de trabajo**:

- **`auto` — el default.** El flujo encadena sin pedir OK: no hay que configurar nada. **Sigue
  parando igual** ante un spec ambiguo, un `blocked`, tests rojos, un `CHANGES_REQUESTED` del
  reviewer, o cualquier acción destructiva o sobre un sistema externo (P6: push, merge, tags,
  releases, deploys).
- **`manual` — opt-in** (`npx souclaude mode manual`): se **espera el OK humano** antes de
  pasar al siguiente task y en cada checkpoint de spec/plan/tasks.

El modo se lee de `.claude/mode.local.json` (local y gitignorado); si el archivo falta o es
inválido, rige `auto`. Cambia quién aprueba el avance, no si hay control de calidad: el
`reviewer` es obligatorio en ambos modos. Detalle completo en `AGENTS.md`.

## Language

Responder siempre en **español neutro** (estándar panhispánico), **no** en español
rioplatense/argentino. Aplica a **toda** salida: la sesión principal y **todos los
subagentes** (`orchestrator`, `spec-author`, `implementer`, `reviewer` y cualquier otro).
Es el estándar de la organización — aplica a toda respuesta, no solo al código.

- **Conjugación: tuteo (tú)**, nunca voseo (vos) ni tratamiento formal (usted). Los
  imperativos van en tuteo: `usa` (no "usá"), `ten` (no "tené"), `dilo` (no "decilo"),
  `fíjate` (no "fijate"), `empieza` (no "empezá"), `haz` (no "hacé").
- **Evita localismos rioplatenses** en la prosa ("che", "bárbaro", "recién ahí",
  "acordate", "de una"). Prefiere vocabulario entendible en toda Hispanoamérica.

**El dominio se nombra en el lenguaje del negocio (español)**: entidades, value objects,
policies y métodos de puerto (`Ticket`, `ContextoDeNegocio`, `generar_respuesta`). Es
deliberado — el puerto habla en lenguaje de dominio, no de framework.
**Adaptadores, infraestructura y todo lo que toca frameworks: en inglés.**

## Reglas técnicas críticas

Reglas que causan errores si se omiten. Agregar/quitar según el proyecto.

### [Categoría — ej: API, Data, Deployment]
- [Regla concreta 1]
- [Regla concreta 2]

## Behavior expectations

- Si algo es ambiguo o parece mal: **para y pregunta.** No adivines ni reinterpretes.
- No modificar archivos fuera del scope pedido.
- No instalar dependencias sin confirmar.
- Reportar honestamente si algo falla. **Sin workarounds silenciosos.**
- No modificar un test para que pase. Si el test está mal, dilo y para.

## Memoria

| Qué | Dónde |
|---|---|
| Learning del día, gotcha fresco | `notes.md` |
| Gotcha que costó >1 h | `docs/gotchas/` |
| Pattern que apareció 3+ veces | `docs/patterns/` |
| Decisión con trade-off | `docs/decisions/` (`/adr-new`) |

## Secretos

Jamás commitear `.env`, `*.pem`, `*.key`, `*.pfx`, `credentials.json`, `secrets.json`,
tokens ni contraseñas. `.claude/settings.json` ya deniega su lectura vía
`permissions.deny`.

## Referencias

`docs/constitution.md` · `specs/` · `docs/decisions/` · `notes.md`
