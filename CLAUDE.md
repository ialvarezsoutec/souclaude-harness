# CLAUDE.md — souclaude-harness

## Contexto

Proyecto de automation. Stack: Node.js.
Dominio: [describir en 1-2 líneas qué hace este proyecto].

## Metodología CCEM

Harness `1.0.0`. Las skills viven **en este repo**, en `.claude/skills/`, y
se aplican solas cuando el contexto lo amerita:

`ccem-core` (6 principios rectores + selección de modelo) · `ccem-sdd` (Spec-Driven
Development) · `ccem-planner` (trazabilidad Planner ↔ CCEM ↔ Git) · `ccem-research`
(evaluar herramientas) · `ccem-stack` (convenciones) · `ccem-prompting` (Anti-Hack) ·
`soutec-github` (flujo Git obligatorio).

Comandos: `/spec-new`, `/adr-new`, `/constitution-check`, `/harness-upgrade`.

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

**Nunca** hagas commit, push ni merge directo a `main`. Todo pasa por rama + PR. Los
hotfixes también.

- **Toda rama nace de una tarjeta de Planner.** Formato: `tipo/<ID>-<slug>`
  (`feature/PLN-023-login-usuarios`). Tipos: `feature` `fix` `hotfix` `docs` `chore`
  `refactor` `experiment`. IDs: `PLN-XXX`, `RAM001`, `SP-XXX`…
  **Si no tienes el ID, PREGUNTA. No lo inventes.**
- La carpeta de spec lleva **el mismo ID y el mismo slug** que la rama:
  `specs/<ID>-<slug>/`. Ese ID es el hilo que amarra tarjeta, spec, rama, commits, PR y
  release. Sin él, la cadena está rota.
- Commits: `tipo: descripción breve` (español, sin scope). Tipos: `feat` `fix` `docs`
  `chore` `refactor` `test` `style` `build` `ci` `perf` `revert`. Un hotfix se commitea
  como `fix:`. Prohibidos: `update`, `cosas`, `ahora sí`.
- Sincronizar con main: `git fetch origin && git merge origin/main`. **Nunca
  `git push --force`.**
- **Yo no mergeo, no apruebo PRs, no creo tags/releases, no creo repositorios.** Eso es
  del coordinador.
- Al abrir el PR: completar `.github/pull_request_template.md` de verdad. Si piden
  correcciones, push a la **misma** rama — nunca un PR nuevo.

## Flujo de trabajo

Hasta que `spec.md`, `plan.md` y `tasks.md` estén listos, la rama **solo admite commits
`docs:`**. Nada de código todavía.

Un commit por task, no en batch. Ejecutar de a un task y **esperar el OK humano** antes
de pasar al siguiente. PR draft tras 2-3 commits, no al final.

## Language

Responder siempre en espanol.

Conjugación en español: **tuteo (tú)**, no voseo (vos) ni tratamiento formal (usted).
Es el estándar de la organización — aplica a toda respuesta, no solo al código.

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
- No modificar un test para que pase. Si el test está mal, decilo y para.

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
