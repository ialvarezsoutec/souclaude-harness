# Spec: Trazabilidad multi-cuenta en el monitor (vía Vault)

**Status**: approved
**Owner**: Ignacio A
**Stakeholders**: Ignacio A (único — dueño del harness)
**Hito**: SHS-H3
**Creado**: 2026-08-10
**Aprobado**: 2026-08-10 (Ignacio A)

---

## Reglas de escritura

- Esta spec describe el QUÉ y el POR QUÉ, no el CÓMO técnico. El CÓMO va en `plan.md`.
- Tercer spec del hito SHS-H3 (mismo ID, distinto slug, según CLAUDE.md). Se usa el spec
  completo porque introduce una decisión de arquitectura con ADR propio (el monitor
  escribe al Vault, excepción a una regla escrita), un contrato de datos nuevo que será
  consumido por N máquinas, y cambios en cuatro superficies (reader, dominio, panel,
  router log).

---

## Context

### Business background

El equipo incorpora una **segunda cuenta de Claude** para disponer de más tokens. El
monitor (`souclaude monitor`, SHS-H3) hoy no tiene ningún concepto de "cuenta": todo el
pipeline cuelga de un único `~/.claude`, y aunque `~/.claude.json` ya trae la identidad
completa (`oauthAccount.accountUuid`, `emailAddress`, `organizationName`, `machineID`, y
`cachedUsageUtilization.accountUuid` etiquetando los propios límites), el lector de
límites la **descarta**. Tampoco hay identidad en `progress/model-router.jsonl`: con dos
máquinas midiendo, no hay forma de saber quién midió qué.

Con dos cuentas, la pregunta operativa diaria pasa a ser: *¿con cuál cuenta trabajo
ahora?* — y la respuesta necesita ver los límites de **ambas** cuentas de un vistazo,
aunque la otra cuenta esté corriendo en otra máquina.

### Why now

La segunda cuenta se está incorporando ahora. Cada día sin trazabilidad es telemetría del
router sin atribución y decisiones de "con cuál cuenta sigo" a ciegas. Además, el spec
hermano `SHS-H3-extra-historico` está por congelar el formato de
`~/.claude/souclaude/usage-history.json` (T104): incluir la clave de cuenta hoy es una
línea en su spec; después es una migración.

---

## Goals

En orden de prioridad:

1. Toda medición lleva identidad: la vista del monitor y cada línea nueva de
   `progress/model-router.jsonl` quedan atribuidas a cuenta (accountUuid + alias) y
   máquina (machineID).
2. Una sección **CUENTAS** en el panel que muestre, por cada cuenta del equipo, límites
   de plan (5 h / 7 d / extra), consumo agregado del día y frescura del dato — esté la
   cuenta en esta máquina o en otra.
3. El canal de consolidación es el **Vault**: cada monitor en vivo publica
   automáticamente un snapshot pequeño (<1 KB) por (cuenta, máquina) y lee los de los
   demás. Sin daemons, sin servidor, sin base de datos.
4. Cero fugas y cero bloqueos: nunca se publica un secreto, y ningún fallo de git/red
   degrada el panel — el monitor sigue 100 % funcional local-only.

## Non-goals

Explícitamente **NO** se construirá:

- Fusión de árboles de transcripts de varios homes en una máquina. El detalle
  sesión-por-sesión sigue siendo local a cada home; la consolidación entre cuentas viaja
  únicamente como agregados por el Vault. (El soporte multi-home explícito — leer solo
  límites de homes secundarios — queda diferido como fase opcional.)
- Publicar `model-router.jsonl` crudo ni ningún dato por sesión/proyecto al Vault. La
  regla de "telemetría cruda excluida del Vault" sigue vigente; el ADR autoriza solo
  snapshots agregados y acotados.
- Llamadas de red nuevas a APIs de Anthropic. La identidad y los límites salen de los
  archivos locales que el monitor ya lee.
- Manejo de credenciales de más de una cuenta en un mismo proceso. El fetcher sigue
  usando exclusivamente el token del home activo, bajo su política escrita.
- Un dashboard web o cualquier superficie fuera de la terminal.

---

## User journeys

### Journey 1: Decidir con cuál cuenta trabajar

**Actor**: desarrollador con la cuenta A en su máquina; la cuenta B corre en otra.
**Trigger**: la sesión 5 h de A va en 88 % y quiere saber si B tiene cupo.

1. Con `souclaude monitor` abierto, mira la sección CUENTAS.
2. Ve dos filas: `dev  5h:88% 7d:61% …  local` y `dev2  5h:12% 7d:30% …  hace 4m`.
3. Decide cambiar a la cuenta B para el próximo bloque de trabajo.

**Resultado esperado**: la decisión se toma en segundos, sin preguntar por chat ni abrir
otra máquina.
**Edge cases**: el snapshot de B tiene >15 min → la fila se muestra atenuada con
"(dato viejo)"; el Vault no está configurado → la sección muestra solo la cuenta local.

### Journey 2: Publicación silenciosa mientras se trabaja

**Actor**: el mismo desarrollador, monitor en vivo abierto durante horas.
**Trigger**: ninguno — es automático.

1. El monitor corre con `--publish`; cada ~5 min evalúa si su snapshot cambió
   materialmente.
2. Si cambió (o pasaron 30 min sin publicar), escribe
   `00-System/monitor/<cuenta>--<maquina>.json` en el Vault, commit y push.
3. Si no hay red, el publisher entra en backoff y el panel muestra un aviso
   ("Vault: sin publicar hace 22 m"); el render nunca se bloquea.

**Resultado esperado**: los snapshots del equipo se mantienen frescos sin ningún paso
manual, con ~2-12 commits/día por máquina activa.

### Journey 3: Auditar el costo por cuenta al cerrar la roca

**Actor**: coordinador ejecutando `/rock-close`.
**Trigger**: fin de trimestre; quiere el gasto por cuenta.

1. Lee `progress/model-router.jsonl`: cada línea emitida por `--emit-router` desde este
   cambio lleva `cuenta`, `cuenta_uuid` y `maquina`.
2. Agrupa por `cuenta` y reporta costo medido por cuenta del equipo.

**Resultado esperado**: la telemetría del router es auditable por cuenta; las líneas
viejas (sin los campos) siguen siendo válidas.

---

## Requisitos funcionales

- **RF-01 — Identidad local en la vista.** El lector de límites extrae
  `oauthAccount.{accountUuid, emailAddress, organizationName}` y `machineID` de
  `~/.claude.json`; `VistaMonitor` gana `cuenta` (con alias legible derivado del email) o
  `null` si el archivo no trae `oauthAccount`. El header del panel muestra
  `alias@hostname`.
- **RF-02 — Atribución en el router log.** Las líneas de `progress/model-router.jsonl`
  emitidas por `--emit-router` agregan `cuenta` (alias), `cuenta_uuid` y `maquina`
  (`null` si no hay identidad). La SKILL `ccem-model-router` §5 se actualiza en el mismo
  commit (es la fuente de verdad del formato). Idempotencia sin cambios.
- **RF-03 — Publicación automática al Vault.** Con el flag opt-in `--publish` y solo en
  modo en vivo, el monitor publica un snapshot v1 por (cuenta, máquina) en
  `00-System/monitor/` del Vault: identidad, límites (5 h/7 d/extra), totales del día y
  `generadoEn`. Commit solo por cambio material o heartbeat de 30 min; `pull --rebase`
  antes de escribir; nunca `--force`; fire-and-forget con backoff — jamás bloquea el
  render.
- **RF-04 — Sección CUENTAS consolidada.** El monitor lee los snapshots del working tree
  local del Vault y muestra una fila por cuenta (la local primero) con límites, consumo
  del día y frescura; dedup por `accountUuid` (gana el más fresco), umbrales de color
  85/95 existentes, atenuado con "(dato viejo)" si frescura >15 min. `--json` la expone.
- **RF-05 — Degradación limpia.** Sin Vault configurado: warning único y monitor
  local-only, exit code intacto. Sin `oauthAccount`: `cuenta: null` en toda la cadena.
  Snapshot corrupto o de versión desconocida: aviso, nunca caída del tick.
- **RF-06 — Seguridad de publicación.** El snapshot se construye campo por campo
  (whitelist, jamás spread del JSON crudo) y pasa por `contieneSecreto()` antes de
  escribir; si dispara, se aborta la publicación y se avisa.
- **RF-07 — Documentación.** ADR aprobado antes de tocar el Vault; `docs/vault-guide.md`
  §8 y `progress/README.md` documentan la excepción (snapshots agregados sí,
  `model-router.jsonl` crudo no); `README.md` documenta `--publish` y la sección CUENTAS.

## Criterios de aceptación

- **AC-01** (RF-01): con un `.claude.json` de fixture con `oauthAccount`, `--json` expone
  `cuenta.{accountUuid, alias, email, organizacion, machineID}`; sin `oauthAccount`,
  `cuenta: null` y el panel no muestra identidad.
- **AC-02** (RF-02): `--emit-router` sobre un home de fixture produce líneas con los tres
  campos nuevos; con `cuenta: null` los emite en `null`; la SKILL §5 lista los campos.
- **AC-03** (RF-03): dos publicaciones desde dos homes/cuentas distintas contra un mismo
  Vault de prueba producen dos archivos sin conflicto de merge; una segunda publicación
  sin cambio material no genera ningún commit; con el remoto caído, el monitor sigue
  renderizando y aparece el aviso de backoff.
- **AC-04** (RF-04): con dos snapshots en el Vault (uno local, uno remoto), la vista
  contiene ambas cuentas con `frescuraMs` correcta; un tercer archivo corrupto produce
  aviso y no tumba el tick.
- **AC-05** (RF-06): un snapshot con un token plantado en un campo hace abortar la
  publicación (test dedicado) y nada llega al Vault.
- **AC-06** (RF-05): sin `vault.local.json` ni `VAULT_PATH`, `--publish` emite un warning
  único y el resto del panel es idéntico al actual.

---

## Dependencias y coordinación

- **ADR previo** (bloqueante para RF-03/RF-04): excepción a la regla de telemetría del
  Vault, ubicación `00-System/monitor/` y formato v1. Ver
  `docs/decisions/20260810-monitor-snapshots-en-vault.md`.
- **Coordinación con `SHS-H3-extra-historico`**: pedir que el formato v1 de
  `usage-history.json` (T104, aún no congelado) incluya `accountUuid`. No es parte de
  este spec; es un cambio de una línea en el spec hermano.
