import path from 'node:path'
import * as ui from '../ui.js'
import { exists } from '../core/fsx.js'
import { readMode, writeMode, MODE_CONFIG, MODES, DEFAULT_MODE } from '../core/mode.js'

const DESCRIPCION = {
  manual: 'los agentes paran en cada checkpoint y esperan tu OK.',
  auto: 'los agentes encadenan las fases sin pedir OK (pero siguen parando ante ambiguedad, CHANGES_REQUESTED y P6).',
}

// Comando de una sola responsabilidad: leer o fijar el modo de trabajo. Sin
// argumento es de SOLO LECTURA -- `souclaude mode` no debe cambiar nada, para
// que sea seguro tipearlo cuando solo quieres saber en que modo estas.
export async function mode(flags, cwd) {
  const [, solicitado] = flags._positionals ?? []
  const actual = readMode(cwd)

  ui.intro('souclaude mode')

  if (!solicitado) {
    const porDefecto = actual === DEFAULT_MODE && !exists(path.join(cwd, ...MODE_CONFIG.split('/')))
    ui.log.info(`Modo actual: ${actual}${porDefecto ? ' (default)' : ''} -- ${DESCRIPCION[actual]}`)
    ui.log.info(
      porDefecto
        ? `No hay ${MODE_CONFIG}: rige el default. Para revisar fase por fase: souclaude mode manual`
        : `Definido en ${MODE_CONFIG} (local, gitignorado). Cambialo con: souclaude mode ${actual === 'auto' ? 'manual' : 'auto'}`
    )
    ui.outro('Sin cambios.')
    return 0
  }

  const normalizado = String(solicitado).trim().toLowerCase()
  if (!MODES.includes(normalizado)) {
    ui.log.error(`Modo invalido: "${solicitado}". Valores validos: ${MODES.join(', ')}.`)
    return 2
  }

  if (flags['dry-run']) {
    ui.log.info(`--dry-run: el modo pasaria de ${actual} a ${normalizado}. No se escribio nada.`)
    return 0
  }

  writeMode(cwd, normalizado)
  ui.log.success(`Modo: ${normalizado} -- ${DESCRIPCION[normalizado]}`)

  if (normalizado === 'auto') {
    ui.log.info(
      [
        'En auto los agentes avanzan sin pedirte OK entre fases. Lo que NO cambia:',
        '  - el reviewer sigue corriendo y su CHANGES_REQUESTED sigue bloqueando;',
        '  - ante un spec ambiguo o un blocked, el flujo para igual;',
        '  - push, merge a main, tags, releases y deploys siguen pidiendo confirmacion (P6).',
      ].join('\n')
    )
  }

  ui.outro(`Escrito en ${MODE_CONFIG}. Es de esta maquina: no viaja al repo.`)
  return 0
}
