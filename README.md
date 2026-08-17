# souclaude-harness

**v3.0.0**

CLI para instalar y migrar el harness de Claude Code de SOUTEC en cualquier repo: uno
nuevo, uno legacy de cinco años, o uno que ya tiene una versión vieja del harness.
Sin agentes ni flujos fijos: el modelo trabaja directo, con las skills de SOUTEC como
única capa.

```bash
npx github:ialvarezsoutec/souclaude-harness#v1
```

Sin registry, sin `.npmrc`, sin token. Solo hace falta git y Node ≥20.

## Qué instala

```
CLAUDE.md                     contexto del proyecto para Claude
docs/decisions/               ADRs + su template (skill adr-new)
notes.md                      scratchpad persistente
progress/                     progreso del proyecto y protocolo del Vault
.claude/
  settings.json               permisos y effort (schema-correcto)
  harness.json                lockfile: versión + hash + skills elegidas
  skills/                     las que elijas en el checkbox de init
    soutec-github             flujo Git/GitHub (obligatoria, se instala siempre)
    it-security-review        security review para IT
    security-report-standard  estándar de informes de seguridad
    soutec-md-a-pdf           Markdown a PDF con identidad Soutec
    adr-new                   documentar decisiones con ADRs
    harness-upgrade           actualizar el harness desde Claude
.gitignore                    bloque gestionado, tus líneas intactas
```

Las skills se eligen al instalar: `init` muestra un checkbox con todas marcadas
(`soutec-github` no es opcional: entra siempre). Sin modo interactivo,
`--skills adr-new,soutec-md-a-pdf`. La selección queda en el lockfile y los upgrades
la respetan; deseleccionar una skill instalada la marca obsoleta y `--prune` ofrece
borrarla.

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
| `--claude-home <ruta>` | Usa otra carpeta `~/.claude` (útil para fixtures y tests). También desactiva el refresco de red de los límites (ver abajo), porque un fixture no tiene credenciales reales que leer. |
| `--publish` | Publica un snapshot agregado de esta cuenta en el Vault (ver "Multi-cuenta"). Opt-in, solo panel en vivo. |

El refresco de red de los límites de plan (Ventana 5h/7d, Semanal por modelo, Extra) se
desactiva en **tres** casos, no solo con `--no-refresh`: con `--no-refresh` explícito, en
modo CI (`ui.isCI()`, un runner no debe salir a internet ni leer credenciales) y con
`--claude-home <ruta>` (apunta a un fixture, no hay token que leer). En cualquiera de los
tres, el monitor solo lee el caché de `~/.claude.json`, que únicamente cambia cuando
alguien corre `/usage` en Claude Code.

Cuando el refresco de red está activo, tiene su propia cadencia: los límites se
refrescan contra la API cada **5 minutos** (el TTL de `usage-fetcher.js`), aunque el
panel en vivo repinte cada 2 segundos — repintar no es lo mismo que volver a pedirle
datos a la API. Si el refresco falla varias veces seguidas, el fetcher entra en backoff
(15 minutos tras 3-5 fallos, 60 minutos tras 6 o más) y el panel deja de intentarlo hasta
que el backoff expira; mientras tanto, un aviso en la lista de avisos dice explícitamente
`límites sin refrescar desde hace Xm (reintento en Ym)`, para que el dato viejo nunca se
muestre como si fuera fresco.

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
para poder reportar el gasto medido por cuenta.

### Exit codes

`monitor` sale con **0/1/2 según el peor límite de plan** — pensado para usarse
desde un hook: 0 por debajo del 85 %, 1 entre 85 % y 94 %, 2 en 95 % o más (sin
datos de límites, 0 — no saber no es lo mismo que estar mal). Por ejemplo, un hook
que avise "estás al 91 % de Opus" solo necesita mirar el exit code, no parsear el
panel.

### `--emit-router`

Puente entre `monitor` y la telemetría de ruteo de modelos: activa un modo
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

### Sección Histórico

El gasto "Extra" (créditos pagos por fuera del plan) que llega a su tope mensual no se
esconde, pero tampoco se queda para siempre como alarma activa: la API nunca deja de
informarlo hasta el reset mensual de la organización, así que sin esta sección el panel
mostraría un `LIMITE 100% Extra` en rojo, indefinidamente, aunque el gasto ya esté
cerrado y no vaya a cambiar hasta el mes que viene.

- Mientras el extra alcanzado tiene **menos de 24 horas** desde que se detectó, sigue
  apareciendo como alarma activa en las filas de límites (es información nueva y
  accionable).
- Pasadas las 24 horas, la fila **deja de contar para la alarma del título y el marco
  rojo** del header, y baja a una sección **Histórico** al pie del panel, atenuada, con
  el formato `Extra ago-2026  $21.36/$20.00  alcanzado 06-08`. En `--json` aparece en el
  campo `historico`.
- El registro vive en `~/.claude/souclaude/usage-history.json`, con la forma
  `{ "abierto": {...} | null, "archivados": [...] }`. Se abre un registro
  (`{ detectadoEn, usado, limite, moneda }`) la primera vez que el extra llega a su
  tope; se sella con `cerradoEn` y pasa a `archivados` cuando la organización resetea el
  ciclo (`is_enabled` vuelve a `true` o `used_credits` cae por debajo de lo registrado).
  Archivo ausente o corrupto se trata como vacío (`{ abierto: null, archivados: [] }`);
  nunca rompe el panel.
- `--seed-extra-detectado-en <ISO>` solo importa la primera vez que se crea el archivo
  (para anotar una fecha de detección real conocida de antemano, no una estimada); en
  cualquier corrida posterior, con el archivo ya existente, el flag se ignora.
- Los tokens consumidos durante ese gasto extra no son recuperables ni se estiman: si se
  gastaron en otra máquina sin el monitor corriendo, esa parte queda perdida de forma
  permanente. Lo único que persiste es el snapshot en dólares que la propia API ya
  entregó.

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
tipear `BORRAR`, y `--force` exige tipear `FORCE`. Nada destructivo ocurre sin
confirmación explícita.

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
git tag vX.Y.Z && git tag -f v1
git push origin vX.Y.Z && git push -f origin v1
```

La organización usa `#v1` (tag móvil) y recibe los parches sin hacer nada.
