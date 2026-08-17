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

## Estado vivo: el kanban del Vault

El Vault (repo aparte) es el centro de información de todos los proyectos. Vive
**fuera** del repo del proyecto a propósito: ahí se acumula la visibilidad sin
ensuciar este repo. El estado vivo del trabajo se refleja en
`Project-<PREFIJO>/kanban.md` del Vault: cuando **empiezas** una tarjeta, la mueves
**en ese momento** — no en un push final. El tablero debe reflejar el ahora.

**Formato del kanban** (compatible con el plugin Kanban de Obsidian):

```markdown
---
kanban-plugin: board
---

## Backlog

- [ ] validar formulario · @pendiente

## En curso

- [ ] capturar lead al cierre · @nacho

## Hecho

- [x] esqueleto del dominio · @nacho
```

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
| Qué va | Código, tests, progreso | Kanban, espejos, evidencia |
| Cómo se escribe | Rama + PR. **Nunca** push directo a `main` | **Push directo a `main`**, sin PR |
| Por qué | Todo cambio se revisa | El tablero refleja el ahora, no el último merge |

Nunca se cruzan: código, diffs y tests jamás van al Vault; los artefactos del Vault
jamás se commitean en el repo del proyecto.

**Antes de tomar una tarjeta** (obligatorio — es el anti-solapamiento entre máquinas):

```bash
git -C "<vault>" pull --rebase
```

Luego lee `Project-<PREFIJO>/kanban.md`. Si la tarjeta ya está en **En curso** con otro
dueño, otra máquina u otra persona la está trabajando: **paras y preguntas al humano**.
No la tomas, no la mueves, no saltas a otra por tu cuenta.

**Al tomarla**, la mueves y pusheas en ese momento — no al final:

```bash
git -C "<vault>" add Project-<PREFIJO>
git -C "<vault>" commit -m "chore: <tarjeta> a En curso (@<dueño>)"
git -C "<vault>" pull --rebase && git -C "<vault>" push
```

Convención de commits del Vault: `chore:` para movimientos de kanban, `docs:` para
espejos de artefactos. **Nunca `git push --force`**, en ninguno de los dos repos.
`npx souclaude vault-sync` hace el pull/push seguro desde el CLI.

**Conflictos en `kanban.md`**: una tarjeta = una línea, así que dos personas nunca se
contradicen — conserva **ambas** tarjetas y nunca borres la de otro (misma lógica que
`history.md`). Si el `pull --rebase` falla dos veces seguidas, no insistas: anota
`vault_skip · motivo` en `history.md` del repo y repórtalo. El trabajo local nunca se
bloquea por el Vault.
