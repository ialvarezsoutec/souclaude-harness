# souclaude-harness

**v1.0.0**

CLI para instalar y migrar el harness de Claude Code de SOUTEC (metodología CCEM) en
cualquier repo: uno nuevo, uno legacy de cinco años, o uno que ya tiene una versión
vieja del harness.

```bash
npx github:ialvarezsoutec/souclaude-harness#v1
```

Sin registry, sin `.npmrc`, sin token. Solo hace falta git y Node ≥20.

## Qué instala

```
CLAUDE.md                     contexto del proyecto para Claude
AGENTS.md                     mapa de navegación para agentes de IA
docs/constitution.md          principios no-negociables P1-P10
docs/decisions/               ADRs + su template
specs/                        Spec-Driven Development (templates full y lite)
notes.md                      scratchpad persistente
.claude/
  settings.json               permisos y effort (schema-correcto)
  harness.json                lockfile: versión + hash de cada archivo
  agents/
    orchestrator, spec-author, implementer, reviewer   orquestación multi-agente opcional del flujo SDD
    security-evidence-compiler                    compila evidencia de security review para IT
  skills/
    ccem-core, ccem-sdd, ccem-planner, ccem-research, ccem-stack, ccem-prompting
    spec-new, adr-new, constitution-check, harness-upgrade, soutec-github
    it-security-review, security-report-standard
.gitignore                    bloque gestionado, tus líneas intactas
```

Las skills son **project-local**: se commitean con el repo. Quien clona, las tiene.
No hay instalación global por dev ni por máquina, y el `upgrade` puede mantenerlas al
día proyecto por proyecto.

## Comandos

| | |
|---|---|
| `souclaude init` | Instala. Sirve igual en un repo vacío y en uno con 5 años de código. |
| `souclaude upgrade` | Actualiza a la última versión. Aplica migraciones. |
| `souclaude status` | Solo lectura. Exit 0 = al día · 1 = hay upgrade · 2 = drift. |
| `souclaude adopt` | Para una estructura hecha a mano. **No toca ningún archivo**: solo escribe el lockfile. |
| `souclaude monitor` | Panel de consumo de tokens de Claude Code. |

Sin comando, se autodetecta: hay lockfile → `upgrade` · hay estructura previa →
`adopt` · repo limpio → `init`.

Flags que importan: `--dry-run` (imprime el plan, escribe cero bytes), `--yes`,
`--force`, `--prune`, `--no-backup`, `--verbose`.

## `souclaude monitor`

Panel de consumo de tokens de Claude Code: límites de plan, agentes corriendo,
sesiones, proyectos, y el desglose por tipo de token y por modelo.

```bash
node bin/cli.mjs monitor              # panel en vivo (con TTY)
node bin/cli.mjs monitor --once       # un snapshot en texto plano y sale
```

Cuatro modos, excluyentes entre sí:

- **En vivo** (default, con TTY): panel que se repinta solo, alternate buffer,
  reacciona a resize. `q` sale con el exit code del último snapshot, `p` pausa.
- `--once` — un snapshot en texto plano y sale. Sin TTY o en CI es lo mismo, aunque
  no lo pidas.
- `--compact` — una línea por sesión, sin caja.
- `--agents` — solo la sección AHORA (agentes vivos).
- `--json` — vuelca el modelo de datos completo y sale. No pinta panel.

Flags útiles:

| Flag | Qué hace |
|---|---|
| `--since <ventana>` | Ventana de datos: `30m`, `1h`, `6h`, `24h`, `7d` o `all`. Default `24h`. |
| `--project <txt>` | Filtra por proyecto. `.` usa el directorio actual. |
| `--top <n>` | Filas por contenedor. Default 10. No afecta los totales. |
| `--sort <criterio>` | `tokens` (default), `costo` o `reciente`. |
| `--ascii` | Fuerza glifos ASCII (equivale a `SOUCLAUDE_ASCII=1`). |
| `--no-refresh` | No consulta los límites de plan a la API. Sin este flag, el monitor le pega a `GET /api/oauth/usage` (el mismo endpoint que usa Claude Code) porque el caché de `~/.claude.json` solo se reescribe cuando el humano corre `/usage` — medido: cero refrescos en 12 minutos de actividad continua. Con `--no-refresh` el panel muestra la edad real del último dato en caché en vez de fingir que está al día. |
| `--claude-home <ruta>` | Usa otra carpeta `~/.claude` (útil para fixtures y tests). |
| `--publish` | Publica un snapshot agregado de esta cuenta en el Vault (ver "Multi-cuenta"). Opt-in, solo panel en vivo. |

### Multi-cuenta (sección CUENTAS)

Con más de una cuenta de Claude en el equipo, cada monitor puede publicar un snapshot
agregado de su cuenta — límites de plan, totales del día, <1 KB — en
`00-System/monitor/` del Vault (`--publish`, cada ~5 min y solo si algo cambió; con
todo igual, un heartbeat cada 30 min). Todos los monitores con Vault configurado leen
esa carpeta y muestran la sección **CUENTAS**: una fila por cuenta con `5h`, `7d`,
gasto extra, costo del día y frescura del dato (`hace 3m`; pasados 15 min la fila se
atenúa con "(dato viejo)"). Así se decide de un vistazo con cuál cuenta seguir
trabajando. La identidad sale de `~/.claude.json` (`oauthAccount` + `machineID`);
sin ella, el monitor sigue igual que siempre. El detalle del contrato está en el ADR
`docs/decisions/20260810-monitor-snapshots-en-vault.md`.

Las líneas de `--emit-router` también llevan `cuenta`, `cuenta_uuid` y `maquina`,
así `/rock-close` puede reportar el gasto medido por cuenta.

### Exit codes

`monitor` sale con **0/1/2 según el peor límite de plan** — pensado para usarse
desde un hook: 0 por debajo del 85 %, 1 entre 85 % y 94 %, 2 en 95 % o más (sin
datos de límites, 0 — no saber no es lo mismo que estar mal). Por ejemplo, un hook
que avise "estás al 91 % de Opus" solo necesita mirar el exit code, no parsear el
panel.

### `--emit-router`

Puente entre `monitor` y la telemetría de `ccem-model-router`: activa un modo
aparte que no dibuja panel, sino que escribe una línea en
`progress/model-router.jsonl` con el costo **medido** de una tarea ya cerrada
(reemplaza el estimado que el router anota al lanzar el subagente).

| Flag | Qué hace |
|---|---|
| `--emit-router` | Activa el modo. No dibuja panel. |
| `--hito <id>` | Obligatorio. ID del hito (ej. `SHS-H3`). |
| `--task <id>` | ID completo del task (ej. `SHS-H3-T019`). Sin task, `null`. |
| `--agente <rol>` | `spec-author`, `implementer`, `reviewer`... |
| `--resultado <valor>` | `approved` \| `changes_requested` \| `escalated` \| `fallback` \| `aborted`. |
| `--rework <n>` | Devoluciones del reviewer sobre ese task. Default 0. |
| `--motivo <texto>` | Obligatorio si `--resultado` es `escalated` o `fallback`. |

### Honestidad de los datos

- **Los tokens son dato medido**: salen del campo `usage` de cada respuesta en los
  transcripts (`~/.claude/projects/**/*.jsonl`), deduplicado por `message.id`.
- **El costo en USD es estimado**: se calcula con una tabla de precios local
  (`src/monitor/domain/precios.js`), porque la máquina no guarda lo que costó cada
  llamada.
- **El estado de los agentes es heurístico**: se infiere de pid vivo + mtime del
  archivo + señales de cierre, no de un evento explícito de "terminé".
- **Los límites de plan salen de dos fuentes, y gana la más fresca entera**: el
  caché de `cachedUsageUtilization` en `~/.claude.json` (solo se reescribe cuando
  corres `/usage`) y el refresco propio del monitor contra `GET
  https://api.anthropic.com/api/oauth/usage`, con TTL de 5 minutos y caché aparte
  en `~/.claude/souclaude/usage-cache.json`. Los campos de ambas fuentes nunca se
  mezclan: se toma el snapshot entero de la lectura más reciente.
  - Ese endpoint es **interno y no documentado** — es el mismo que usa Claude
    Code, no un contrato publicado por Anthropic, y puede romperse con cualquier
    actualización. Ante cualquier fallo (401, 404, cambio de forma de la
    respuesta, timeout) el monitor cae al caché existente y el panel muestra la
    edad real del dato. Nunca inventa un número ni rompe el comando.
  - El refresco usa el token OAuth que Claude Code ya guarda en
    `~/.claude/.credentials.json`. Se lee únicamente
    `claudeAiOauth.accessToken`; el resto del archivo (incluidos los tokens de
    conectores MCP de terceros) no se toca. El token no sale del proceso: no se
    escribe a disco, no se loguea, no viaja en el valor de retorno de ninguna
    función exportada. No hay renovación de token: un 401 se trata como un fallo
    más, sin tocar `refreshToken`.

El propio pie del panel lo declara: `tokens medidos · costo estimado · estado
heurístico`.

## La garantía

**Un archivo tuyo nunca se sobrescribe en silencio.**

El motor clasifica cada archivo comparando tres cosas: qué hay en disco, qué dice el
lockfile que había, y qué querría emitir el harness hoy.

| En disco | En el lockfile | ¿Cambió el template? | Qué pasa |
|---|---|---|---|
| no está | no está | — | se crea |
| **está** | **no está** | — | **nunca se pisa** → `.new` al lado |
| está, intacto | está | no | nada |
| está, intacto | está | sí | se actualiza (no pierdes nada: no lo habías tocado) |
| está, **editado por ti** | está | no | se respeta, no se toca |
| está, **editado por ti** | está | sí | **nunca se pisa** → `.new` al lado |
| está | está, ya no en el manifest | — | obsoleto: se ofrece con `--prune` + doble confirmación |

Por eso init, adopción de un repo legacy y migración de versión **son el mismo code
path**. No hay tres flujos: hay una tabla.

Además: backup de todo lo sobrescrito en `.claude/backup-<timestamp>/`, `--prune` exige
tipear `BORRAR`, y `--force` exige tipear `FORCE`. La herramienta obedece la misma
constitución que instala (P5 y P8).

Para los dos archivos que el harness no posee del todo:
- `.gitignore` — solo es dueño de un bloque delimitado. Tus líneas nunca se tocan.
- `.claude/settings.json` — solo **agrega** claves que faltan. Nunca pisa un valor que
  tú escribiste.

## Desarrollo

```bash
npm install
npm test                                    # node:test, sin dependencias de testing
node bin/cli.mjs init --dry-run --yes       # probar sin escribir nada
```

Los tests cubren cada camino de migración con repos temporales reales (incluyendo uno
con un espacio en la ruta, porque los repos de SOUTEC viven bajo OneDrive). Los dos
invariantes que atrapan casi todo: **idempotencia** (correr `init` dos veces no cambia
nada la segunda vez) y **pureza de `--dry-run`** (el árbol queda byte-idéntico).

## Publicar una versión

```bash
git tag v1.0.0 && git tag -f v1
git push origin v1.0.0 && git push -f origin v1
```

La organización usa `#v1` (tag móvil) y recibe los parches sin hacer nada.
