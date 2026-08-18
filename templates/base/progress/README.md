# progress/ — el estado del trabajo, por disco

Esta carpeta es donde Claude (y los humanos) dejan el **progreso del proyecto**: qué
está en curso, qué se cerró y con qué resultado. El contrato es **"resultados por
disco, no por chat"**: lo importante se escribe en un archivo versionado, trazable y
compartible entre personas y entre sesiones.

## Estructura

```
progress/
├── README.md              # este archivo (managed — lo actualiza el harness)
└── history.md             # historial COMPARTIDO append-only; una línea por cierre
```

## history.md — formato append-only

Una línea por evento, **siempre al final del archivo**, sin secciones ni tablas:

```
- 2026-08-17 · captura-lead · @nacho · done · PR #12
- 2026-08-17 · error-integracion-odoo · claude · done · PR #13
```

Campos: fecha · tarea o rama · quién · resultado · referencia (PR, commit, doc).
Al resolver un conflicto de merge aquí: **conserva ambas líneas y ordena por fecha** —
dos appends nunca se contradicen.

## Estado vivo: el proyecto en el Vault

El Vault (repo aparte) es el centro de información de todos los proyectos. Vive
**fuera** del repo del proyecto a propósito: ahí se acumula la visibilidad sin
ensuciar este repo. Cada proyecto tiene su carpeta `Project-<PREFIJO>/` con **tres
niveles** de información, del más alto al más fino:

```
Project-<PREFIJO>/
├── milestones.md          # tablero de MILESTONES — el claim de nivel alto
├── plans/                 # un plan por archivo: <PREFIJO>-M<n>-P<n>-<slug>.md
├── kanban.md              # tablero de TAREAS del milestone en curso
├── sessions.md            # append-only: una línea por sesión (quién, qué, tokens)
└── progress/
    └── history.md         # espejo del history.md del repo
```

**Jerarquía**: un proyecto tiene una lista de **milestones** (`<PREFIJO>-M<n>`); cada
milestone puede tener uno o más **planes** (`<PREFIJO>-M<n>-P<n>`) para llegar al
objetivo; cada plan se ejecuta como **tareas** en el kanban. El milestone es la unidad
de anti-solapamiento entre máquinas; la tarea es la unidad de trabajo del día.

**Formato de los tableros** (`milestones.md` y `kanban.md`, compatible con el plugin
Kanban de Obsidian — una tarjeta = una línea):

```markdown
---
kanban-plugin: board
---

## Backlog

- [ ] TNP-M3 · portal de clientes · @pendiente

## En curso

- [ ] TNP-M2 · integración Odoo · @nacho · PC01 · plan P1

## Hecho

- [x] TNP-M1 · esqueleto del dominio · @nacho
```

En `milestones.md` la tarjeta lleva **dueño y máquina** (`@quién · <máquina>`) y el
plan activo si lo hay. En `kanban.md` las tarjetas son tareas
(`TNP-M2-T004 · qué · @quién`) y usan las columnas Backlog / En curso / En review /
Hecho.

**Los planes** se espejan a `plans/` como archivos Markdown al momento de adoptarlos
(qué se va a hacer, en qué orden, con qué criterio de éxito). No se editan en el
Vault: se corrige en el repo o en la sesión y se re-espeja. Un milestone puede cambiar
de plan (P1 fracasó → P2): el plan viejo **no se borra**, la tarjeta del milestone
apunta al nuevo.

**Ruta**: la ruta local del Vault se lee de `.claude/vault.local.json` (la escribe el
instalador: `npx souclaude init` o `--vault-path`). Respaldo: la variable de entorno
`VAULT_PATH`. **No se lee del `.env`**: `.claude/settings.json` deniega `Read(./.env)`.
Si no hay ruta configurada o no existe, el espejo se **omite sin fallar** y se deja una
línea en `history.md` (`vault_skip · motivo`) — el trabajo local nunca se bloquea por
el Vault.

## El Vault es OTRO repo: pull antes, push después

El Vault (`https://github.com/ialvarezsoutec/soubunker-vault.git`) es un repo git con su
propio remoto. Trabajas contra **dos repos a la vez** y no se parecen en nada:

| | Repo del proyecto | Repo del Vault |
|---|---|---|
| Qué va | Código, tests, progreso | Milestones, planes, kanban, sesiones |
| Cómo se escribe | Rama + PR. **Nunca** push directo a `main` | **Push directo a `main`**, sin PR |
| Por qué | Todo cambio se revisa | El tablero refleja el ahora, no el último merge |

Nunca se cruzan: código, diffs y tests jamás van al Vault; los artefactos del Vault
jamás se commitean en el repo del proyecto.

## Protocolo anti-solapamiento (obligatorio)

**Antes de empezar a trabajar** — siempre, en este orden:

```bash
git -C "<vault>" pull --rebase        # o: npx souclaude vault-sync
```

1. Lee `Project-<PREFIJO>/milestones.md`. Si el milestone que vas a trabajar ya está
   en **En curso** con **otro dueño u otra máquina**, lo está trabajando otro agente:
   **paras y preguntas al humano**. No lo tomas, no lo mueves, no saltas a otro por tu
   cuenta.
2. Si el milestone está libre (Backlog, o En curso contigo mismo), lee `kanban.md` y
   aplica la misma regla a la **tarea**: En curso o En review con otro dueño → parar y
   preguntar.

**Al tomar un milestone o una tarea**, mueves la tarjeta y pusheas **en ese momento**
— no en un push final. El tablero debe reflejar el ahora:

```bash
git -C "<vault>" add Project-<PREFIJO>
git -C "<vault>" commit -m "chore: <ID> a En curso (@<dueño> · <máquina>)"
git -C "<vault>" pull --rebase && git -C "<vault>" push
```

`npx souclaude vault-sync --push -m "<msg>"` hace el ciclo completo (add → commit →
pull → push) de forma segura desde el CLI.

**Durante el trabajo**, el flujo constante es: adoptar un plan → espejarlo a `plans/`
y anotarlo en la tarjeta del milestone → mover tareas en `kanban.md` a medida que
cambian de estado. Cada movimiento se pushea al momento. Convención de commits del
Vault: `chore:` para movimientos de tableros, `docs:` para planes y espejos.
**Nunca `git push --force`**, en ninguno de los dos repos.

## sessions.md — el consumo de cada sesión

**Al cerrar cada sesión de trabajo** (o al cerrar la tarea del día), se agrega **una
línea al final** de `Project-<PREFIJO>/sessions.md`, append-only como `history.md`:

```
- 2026-08-17 · feature/captura-lead · TNP-M2 · @nacho · PC01 · in 142k / out 9k · T003 y T004 cerradas
```

Campos: fecha · rama o sesión · milestone · quién · máquina · tokens (entrada/salida)
· resultado en pocas palabras. Los tokens salen del monitor local (`npx souclaude
monitor` muestra el consumo por sesión); si no hay dato disponible, `tokens n/d` — la
línea se escribe igual: el registro de **que la sesión existió y qué tocó** vale por
sí solo. Los números agregados y fiables por cuenta y máquina los publica el monitor
automáticamente en `00-System/monitor/` del Vault.

## Conflictos y fallos

- **Conflictos en los tableros y en `sessions.md`**: una tarjeta/línea = una línea de
  archivo, así que dos escritores nunca se contradicen — conserva **ambas** y nunca
  borres la de otro (misma lógica que `history.md`).
- Si el `pull --rebase` falla dos veces seguidas, no insistas: anota
  `vault_skip · motivo` en `history.md` del repo y repórtalo. El trabajo local nunca
  se bloquea por el Vault.
