import { parseArgs } from 'node:util'
import path from 'node:path'
import pc from 'picocolors'
import { exists } from './core/fsx.js'
import { readLockfile } from './core/lockfile.js'
import { loadManifest } from './core/manifest.js'
import { init } from './commands/init.js'
import { upgrade } from './commands/upgrade.js'
import { status } from './commands/status.js'
import { adopt } from './commands/adopt.js'
import { verify } from './commands/verify.js'
import { monitor } from './commands/monitor.js'
import { vaultSync } from './commands/vault-sync.js'
import * as ui from './ui.js'

const OPTIONS = {
  yes: { type: 'boolean', short: 'y' },
  'dry-run': { type: 'boolean' },
  force: { type: 'boolean' },
  prune: { type: 'boolean' },
  backup: { type: 'boolean', default: true },
  verbose: { type: 'boolean', short: 'v' },
  strict: { type: 'boolean' },
  name: { type: 'string' },
  type: { type: 'string' },
  stack: { type: 'string' },
  lang: { type: 'string' },
  // Seleccion de skills sin modo interactivo: --skills adr-new,soutec-md-a-pdf
  // (soutec-github se instala siempre, este o no en la lista).
  skills: { type: 'string' },
  vault: { type: 'boolean', default: true },
  'vault-path': { type: 'string' },
  'vault-repo': { type: 'string' },
  'vault-clone': { type: 'boolean' },
  'assume-version': { type: 'string' },
  // monitor. --interval y --top solo pueden ser 'string' en parseArgs (no hay tipo
  // numerico): el comando los convierte y valida.
  interval: { type: 'string' },
  since: { type: 'string' },
  project: { type: 'string' },
  session: { type: 'string' },
  sort: { type: 'string' },
  top: { type: 'string' },
  once: { type: 'boolean' },
  json: { type: 'boolean' },
  compact: { type: 'boolean' },
  agents: { type: 'boolean' },
  ascii: { type: 'boolean' },
  refresh: { type: 'boolean', default: true },
  'claude-home': { type: 'string' },
  // Seed unico del historico del gasto extra (usage-history.js): solo importa
  // la primera vez, sin usage-history.json todavia. Ver SHS-H3-T104.
  'seed-extra-detectado-en': { type: 'string' },
  // monitor --publish: snapshots agregados de cuenta al Vault (ADR
  // 20260810-monitor-snapshots-en-vault). Solo en modo en vivo. Sin flag,
  // publica por defecto cuando hay Vault configurado; --no-publish lo apaga.
  // Sin default aqui a proposito: undefined = "auto", true = pedido explicito
  // (avisa si falta el Vault), false = opt-out.
  publish: { type: 'boolean' },
  // monitor --emit-router: el puente de telemetria estimada a medida.
  'emit-router': { type: 'boolean' },
  // vault-sync: pull/push seguro al Vault desde el proceso del CLI.
  push: { type: 'boolean' },
  message: { type: 'string', short: 'm' },
  paths: { type: 'string' },
  status: { type: 'boolean' },
  hito: { type: 'string' },
  task: { type: 'string' },
  agente: { type: 'string' },
  resultado: { type: 'string' },
  rework: { type: 'string' },
  motivo: { type: 'string' },
  clase: { type: 'string' },
  help: { type: 'boolean', short: 'h' },
  version: { type: 'boolean' },
}

const COMMANDS = { init, upgrade, status, adopt, verify, monitor, 'vault-sync': vaultSync }

export async function main(argv, cwd) {
  let parsed
  try {
    // allowNegative habilita la forma --no-<flag> para los booleanos con default
    // true (--no-backup, --no-vault). Sin esto parseArgs los rechaza como opcion
    // desconocida, aunque el help los documente. Requiere Node >= 22.4.
    parsed = parseArgs({ args: argv, options: OPTIONS, allowPositionals: true, strict: true, allowNegative: true })
  } catch (err) {
    console.error(pc.red(err.message))
    printHelp()
    return 2
  }

  const { values: flags, positionals } = parsed

  if (flags.version) {
    console.log(loadManifest().harnessVersion)
    return 0
  }
  if (flags.help) {
    printHelp()
    return 0
  }

  const command = positionals[0] ?? autoDetect(cwd)

  if (!(command in COMMANDS)) {
    console.error(pc.red(`Comando desconocido: ${command}`))
    printHelp()
    return 2
  }

  try {
    // _positionals viaja dentro de flags para no cambiarle la firma a los seis
    // comandos que no lo necesitan. Hoy solo `mode <valor>` lee un positional.
    return await COMMANDS[command]({ ...flags, _positionals: positionals }, cwd)
  } catch (err) {
    ui.log.error(err.message)
    if (flags.verbose) console.error(err.stack)
    return 1
  }
}

// Sin comando explicito, el CLI decide segun lo que encuentra. Un dev que corre
// `npx souclaude` en un repo cualquiera obtiene lo correcto sin leer el help.
function autoDetect(cwd) {
  if (readLockfile(cwd)) return 'upgrade'

  // Estructura hecha a mano (una copia del Kit, o un CLAUDE.md escrito a pulso).
  const priorArt = ['CLAUDE.md', '.claude', 'docs/constitution.md', 'specs/_templates']
  if (priorArt.some((p) => exists(path.join(cwd, ...p.split('/'))))) return 'adopt'

  return 'init'
}

function printHelp() {
  console.log(`
${pc.bold('souclaude')} — harness de Claude Code de SOUTEC

${pc.bold('USO')}
  npx github:ialvarezsoutec/souclaude-harness#v1 [comando] [flags]

${pc.bold('COMANDOS')}
  ${pc.cyan('init')}      Instala el harness. Sirve igual en un repo vacio y en uno legacy.
  ${pc.cyan('upgrade')}   Actualiza el harness a la ultima version. Aplica migraciones.
  ${pc.cyan('status')}    Solo lectura: que version tenes, que cambio, que editaste tú.
  ${pc.cyan('adopt')}     Para un repo con estructura hecha a mano. NO toca ningun archivo:
            solo anota en .claude/harness.json que ya coincide con el harness.
  ${pc.cyan('verify')}    Audita el propio harness (manifest vs templates/base/): huerfanos,
            rutas rotas, ids/dest duplicados, criticos faltantes. No mira ningun proyecto.
  ${pc.cyan('monitor')}   Panel de consumo de tokens de Claude Code: limites, agentes vivos,
            sesiones y proyectos. Sale 0/1/2 segun el peor limite (util en un hook).
  ${pc.cyan('vault-sync')} Sincroniza con el Vault de forma segura. Sin flags: pull --rebase
            (con abort defensivo). Con --push -m "<msg>": add + commit + pull +
            push, jamas --force. Exit: 0 ok/sin cambios, 1 fallo, 3 sin Vault.

  Sin comando, se autodetecta: hay lockfile -> upgrade · hay estructura previa -> adopt · repo limpio -> init

${pc.bold('FLAGS')}
  --dry-run            Imprime el plan y no escribe ni un byte.
  -y, --yes            Acepta los defaults. No pregunta nada. (CI=true lo implica)
  --force              Sobrescribe archivos que editaste tú. Pide confirmacion escrita.
  --prune              Ofrece borrar archivos obsoletos. Exige doble confirmacion (P5).
  --no-backup          No copia a .claude/backup-<ts>/ antes de sobrescribir.
  -v, --verbose        Muestra tambien los archivos sin cambios.
  --name, --type, --stack, --lang    Responden las preguntas sin modo interactivo.
  --skills <a,b>       Skills a instalar, separadas por coma (sin modo interactivo).
                       soutec-github es obligatoria: se instala siempre, este o no
                       en la lista. Sin el flag, init pregunta con un checkbox
                       (todas marcadas por defecto) y upgrade respeta lo elegido.
  --vault-path <ruta>  Conecta el Vault ya clonado sin preguntar (escribe .claude/vault.local.json).
  --vault-repo <url>   Repo del Vault a clonar. Por defecto, el del manifest.
  --vault-clone        Con --yes, clona el Vault si no esta conectado (por defecto,
                       --yes nunca clona). Rechaza cualquier destino dentro de este repo.
  --no-vault           Omite el paso del Vault por completo.
  --assume-version     (adopt) Version del harness que se asume instalada.
  --strict             (verify) Los warnings (huerfanos) tambien hacen fallar el comando.

${pc.bold('FLAGS DE VAULT-SYNC')}
  --push               Espeja al Vault: add + commit + pull --rebase + push.
  -m, --message <msg>  Mensaje de commit del espejo (docs: espejos, chore: kanban).
  --paths <a,b>        Rutas relativas al Vault para el add. Sin esto, add -A.
  --status             Muestra ruta configurada y estado del working tree del Vault.

${pc.bold('FLAGS DE MONITOR')}
  --interval <ms>      Refresco del panel en vivo. Default 2000, minimo 250.
  --since <ventana>    Ventana de datos: 30m, 1h, 6h, 24h, 7d o all. Default 24h.
  --project <txt>      Filtra por proyecto. "." usa el directorio actual.
  --session <prefijo>  Filtra por prefijo de session id.
  --sort <criterio>    tokens (default), costo o reciente.
  --top <n>            Filas por contenedor. Default 10. No afecta los totales.
  --once               Un snapshot en texto plano y sale. Sin TTY o en CI es lo mismo.
  --json               Vuelca el modelo de datos completo y sale. No pinta panel.
  --compact            Vista de una linea por sesion, sin caja.
  --agents             Solo la seccion AHORA (agentes vivos).
  --ascii              Fuerza glifos ASCII (equivale a SOUCLAUDE_ASCII=1).
  --no-refresh         No consulta los limites de plan a la API. El caché de
                       ~/.claude.json solo se actualiza cuando corres /usage,
                       asi que sin refresco el dato puede tener 20-50 minutos.
  --claude-home <ruta> Usa otra carpeta ~/.claude (util para fixtures y tests).
  --seed-extra-detectado-en <ISO>  Fecha de deteccion del gasto extra alcanzado,
                       solo para la primera vez que se crea usage-history.json.
                       En corridas posteriores (el archivo ya existe) se ignora.
  --publish            Publica un snapshot agregado de esta cuenta (limites +
                       totales, <1 KB) en 00-System/monitor/ del Vault, cada
                       ~5 min y solo si cambio. Solo panel en vivo. Con Vault
                       configurado es el DEFAULT (no hace falta el flag);
                       --no-publish lo apaga por corrida. Sin Vault, el flag
                       explicito avisa y el monitor sigue local-only.

${pc.bold('MONITOR --EMIT-ROUTER')}
  Escribe UNA linea "medida" en progress/model-router.jsonl a partir de la
  telemetria real de un agente o sesion ya corridos (ver SKILL ccem-model-router).
  Es la unica escritura del comando: sin este flag, monitor es de solo lectura.

  --emit-router           Activa el modo. No dibuja panel.
  --hito <id>             Obligatorio. ID del hito (ej. SHS-H3).
  --task <id>             ID completo del task (ej. SHS-H3-T019). Sin task, null.
  --agente <rol>          spec-author, implementer, reviewer...
  --resultado <valor>     approved | changes_requested | escalated | fallback | aborted.
  --rework <n>            Devoluciones del reviewer sobre ese task. Default 0.
  --motivo <texto>        Obligatorio si --resultado es escalated o fallback.
  --clase <valor>         mecanica | estandar | compleja.
  --session <prefijo>     (mismo flag de arriba) sesion a medir, si no se mide un agente.
  --force                 (mismo flag de arriba) reescribe aunque ya exista la linea (idempotencia).

${pc.bold('GARANTIA')}
  Un archivo tuyo NUNCA se sobrescribe en silencio. Si difiere del harness, la
  propuesta queda al lado como <archivo>.new y tú decidis. (P8 — Surgical Changes)
`)
}
