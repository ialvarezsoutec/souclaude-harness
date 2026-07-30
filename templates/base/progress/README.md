# progress/ — el estado del trabajo, por disco

Esta carpeta es donde los agentes (y los humanos) dejan el **progreso del proyecto**: qué
está en curso, qué se cerró y con qué resultado. Es la materialización del contrato
**"resultados por disco, no por chat"** de `AGENTS.md`: cada agente escribe su salida en un
archivo versionado y devuelve solo una referencia de una línea. El contenido vive en el
repo — trazable, compartible entre personas y entre sesiones.

## Estructura

```
progress/
├── README.md              # este archivo (managed — lo actualiza el harness)
├── current.md             # estado VIVO: el spec y task en curso; lo actualiza el implementer
├── history.md             # historial COMPARTIDO append-only; una línea por task/sesión cerrada
├── model-router.jsonl     # telemetría del Soutec Model Router; lo escribe el orchestrator
└── <ID-hito>-<slug>/      # una subcarpeta por spec en marcha (mismo nombre que specs/ y la rama)
    ├── summary.md         # spec-author: resumen del spec y bloqueos de la fase de diseño
    ├── impl_summary.md    # implementer: trazabilidad requisito↔test, estado y bloqueos
    └── review.md          # reviewer: veredicto, tabla de trazabilidad, cambios requeridos
```

## Quién escribe qué

| Archivo | Autor | Cuándo |
|---|---|---|
| `current.md` | `implementer` | Al arrancar un spec (plan de tasks) y ante un bloqueo. |
| `history.md` | todos los agentes | Una línea al cerrar cada artefacto (ver formato abajo). |
| `model-router.jsonl` | `orchestrator` | Una línea JSONL por lanzamiento de subagente (`ccem-model-router`). |
| `<ID>/summary.md` | `spec-author` | Al terminar cada fase de diseño o al bloquearse. |
| `<ID>/impl_summary.md` | `implementer` | Al cerrar la implementación (`done`/`blocked`). |
| `<ID>/review.md` | `reviewer` | En cada veredicto (`APPROVED`/`CHANGES_REQUESTED`). |

## history.md — formato append-only

Una línea por evento, **siempre al final del archivo**, sin secciones ni tablas:

```
- 2026-07-27 · TNP-H1-T003 · implementer · done · progress/TNP-H1-tienda/impl_summary.md
- 2026-07-27 · TNP-H1-T003 · reviewer · APPROVED · progress/TNP-H1-tienda/review.md
```

Campos: fecha · ID (task o hito) · agente/persona · resultado · referencia al detalle.
Al resolver un conflicto de merge aquí: **conserva ambas líneas y ordena por fecha** — dos
appends nunca se contradicen.

## Espejo al Vault y estado vivo (kanban)

El Vault (repo aparte — ver su guía) es el centro de información de todos los proyectos.
Vive **fuera** del repo del proyecto a propósito: ahí se acumula la visibilidad sin
ensuciar este repo. Dos obligaciones para todo agente:

1. **Espejo de artefactos**: al cerrar cada artefacto, además de escribirlo aquí, se
   copia al Vault bajo `Project-<PREFIJO>/`:
   - `spec.md`, `plan.md`, `tasks.md` → `Project-<PREFIJO>/specs/<ID-hito>-<slug>/`
   - `summary.md`, `impl_summary.md`, `review.md` y `history.md` →
     `Project-<PREFIJO>/progress/`
   - No se copian: código, diffs, tests, telemetría cruda (`model-router.jsonl`) ni
     evidencia técnica pesada. El repo sigue siendo la fuente de verdad técnica; el
     Vault es la vista.
2. **Estado vivo**: cuando un agente **empieza** a trabajar un task o una fase, mueve su
   tarjeta en `Project-<PREFIJO>/kanban.md` del Vault **en ese momento** — no en un push
   final. El tablero debe reflejar el ahora, no el último cierre.

**Formato del kanban** (`Project-<PREFIJO>/kanban.md`, compatible con el plugin Kanban de
Obsidian):

```markdown
---
kanban-plugin: board
---

## Backlog

- [ ] TNP-H1-T004 · validar formulario · @pendiente

## En curso

- [ ] TNP-H1-T003 · capturar lead al cierre · @nacho

## En review

- [ ] TNP-H1-T002 · persistencia del ticket · @nacho

## Hecho

- [x] TNP-H1-T001 · esqueleto del dominio · @nacho
```

Una tarjeta = un task (`<ID-hito>-T<nnn> · qué · @quién`). Movimientos: el spec-author
crea las tarjetas en Backlog al emitir `tasks.md`; el implementer mueve a **En curso** al
tomar el task y a **En review** al cerrarlo; el reviewer mueve a **Hecho** con
`APPROVED` o la devuelve a **En curso** con `CHANGES_REQUESTED`.

**Ruta**: los agentes leen la ruta local del Vault de `.claude/vault.local.json` (la escribe
el instalador: `npx souclaude init` o `--vault-path`). Respaldo: la variable de entorno
`VAULT_PATH`. **No se lee del `.env`**: `.claude/settings.json` deniega `Read(./.env)`, así
que un agente no puede abrirlo. Si no hay ruta configurada o no existe, el espejo se **omite
sin fallar** y se deja una línea en `history.md` (`vault_skip · motivo`) — el trabajo local
nunca se bloquea por el Vault.

## El Vault es OTRO repo: pull antes, push después

El Vault (`https://github.com/ialvarezsoutec/soubunker-vault.git`) es un repo git con su
propio remoto. Trabajas contra **dos repos a la vez** y no se parecen en nada:

| | Repo del proyecto | Repo del Vault |
|---|---|---|
| Qué va | Código, tests, specs, progreso | Kanban, espejos, rocas, evidencia |
| Cómo se escribe | Rama + PR. **Nunca** push directo a `main` | **Push directo a `main`**, sin PR |
| Por qué | Todo cambio se revisa | El tablero refleja el ahora, no el último merge |

Nunca se cruzan: código, diffs y tests jamás van al Vault; los artefactos del Vault jamás se
commitean en el repo del proyecto.

**Antes de tomar un task** (obligatorio — es el anti-solapamiento entre máquinas):

```bash
git -C "<vault>" pull --rebase
```

Luego lee `Project-<PREFIJO>/kanban.md`. Si la tarjeta ya está en **En curso** o **En review**
con otro dueño, otro agente u otra persona la está trabajando: **paras y preguntas al humano**.
No la tomas, no la mueves, no saltas a otra por tu cuenta.

**Al tomarla**, la mueves y pusheas en ese momento — no al final:

```bash
git -C "<vault>" add Project-<PREFIJO>
git -C "<vault>" commit -m "chore: <ID-task> a En curso (@<dueño>)"
git -C "<vault>" pull --rebase && git -C "<vault>" push
```

Convención de commits del Vault: `chore:` para movimientos de kanban, `docs:` para espejos de
artefactos. **Nunca `git push --force`**, en ninguno de los dos repos.

**Conflictos en `kanban.md`**: una tarjeta = una línea, así que dos personas nunca se
contradicen — conserva **ambas** tarjetas y nunca borres la de otro (misma lógica que
`history.md`). Si el `pull --rebase` falla dos veces seguidas, no insistas: anota
`vault_skip · motivo` en `history.md` del repo y repórtalo. El trabajo local nunca se bloquea
por el Vault.

## Regla de arquitectura

Si un task **cambia la arquitectura** (puerto nuevo, contrato público, dependencia entre
capas), su cierre exige dos cosas: (a) el doc correspondiente en `docs/` actualizado y
(b) un ADR en `docs/decisions/` (`/adr-new`). El `implementer` actualiza `docs/` pero no
escribe el ADR (eso es del `spec-author` o del humano): lo declara pendiente en
`impl_summary.md`. El `reviewer` **rechaza** un cambio de arquitectura sin doc + ADR.

## Nota de migración

Versiones previas del harness usaban una convención plana (`impl_<ID>.md`,
`review_<ID>.md`, `spec_<ID>.md` directamente en `progress/`). Si tu repo tiene esos
archivos, muévelos a la subcarpeta del hito cuando los toques — no hay script de migración.
