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
  'assume-version': { type: 'string' },
  help: { type: 'boolean', short: 'h' },
  version: { type: 'boolean' },
}

const COMMANDS = { init, upgrade, status, adopt, verify }

export async function main(argv, cwd) {
  let parsed
  try {
    parsed = parseArgs({ args: argv, options: OPTIONS, allowPositionals: true, strict: true })
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
    return await COMMANDS[command](flags, cwd)
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
${pc.bold('souclaude')} — harness de Claude Code de SOUTEC (metodologia CCEM)

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

  Sin comando, se autodetecta: hay lockfile -> upgrade · hay estructura previa -> adopt · repo limpio -> init

${pc.bold('FLAGS')}
  --dry-run            Imprime el plan y no escribe ni un byte.
  -y, --yes            Acepta los defaults. No pregunta nada. (CI=true lo implica)
  --force              Sobrescribe archivos que editaste tú. Pide confirmacion escrita.
  --prune              Ofrece borrar archivos obsoletos. Exige doble confirmacion (P5).
  --no-backup          No copia a .claude/backup-<ts>/ antes de sobrescribir.
  -v, --verbose        Muestra tambien los archivos sin cambios.
  --name, --type, --stack, --lang    Responden las preguntas sin modo interactivo.
  --assume-version     (adopt) Version del harness que se asume instalada.
  --strict             (verify) Los warnings (huerfanos) tambien hacen fallar el comando.

${pc.bold('GARANTIA')}
  Un archivo tuyo NUNCA se sobrescribe en silencio. Si difiere del harness, la
  propuesta queda al lado como <archivo>.new y tú decidis. (P8 — Surgical Changes)
`)
}
