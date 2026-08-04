import * as ui from '../ui.js'
import { parsearDuracion } from '../monitor/domain/ventanas.js'
import { buildView } from '../monitor/application/build-view.js'
import { resolveClaudeHome } from '../monitor/adapters/claude-home.js'
import { createSnapshotSource } from '../monitor/adapters/snapshot-source.js'
import { detectCaps } from '../monitor/adapters/caps.js'
import { createTtyRenderer } from '../monitor/adapters/tty-renderer.js'
import { renderPanel } from '../monitor/adapters/panel-layout.js'
import { presentar } from '../monitor/adapters/panel-presenter.js'
import { renderJson, renderPlain } from '../monitor/adapters/plain-renderer.js'

// `souclaude monitor`: panel de consumo de tokens. Tres modos excluyentes:
//   --json                              -> modelo de dominio crudo y sale
//   --once | sin TTY | CI               -> un snapshot en texto plano y sale
//   resto                               -> panel en vivo sobre la TTY
//
// SIN TTY NO SE TOCA NADA DE LA TERMINAL: ni alternate buffer, ni setRawMode, ni
// cursor. `souclaude monitor | cat` no puede colgarse esperando teclas ni ensuciar
// la salida con escapes.

const INTERVALO_DEFAULT = 2000
const INTERVALO_MINIMO = 250
const TOP_DEFAULT = 10
const VENTANA_DEFAULT = '24h'
const COLS_SNAPSHOT = 100

// Umbrales de salida: pensados para usarse desde un hook.
const UMBRAL_CRITICO = 95
const UMBRAL_AVISO = 85

// En raw mode Ctrl+C no genera SIGINT: llega como este byte dentro del stream.
const KEY_CTRL_C = '\u0003'

const ORDENES = new Set(['tokens', 'costo', 'reciente'])

export async function monitor(flags = {}, cwd = process.cwd()) {
  const ventana = flags.since ?? VENTANA_DEFAULT
  if (parsearDuracion(ventana) === null) {
    // Un throw aca dejaria un stack trace donde el usuario necesita una instruccion.
    ui.log.error(`Ventana invalida: "${ventana}". Usa 30m, 1h, 6h, 24h, 7d o all.`)
    return 2
  }

  const opciones = {
    ventana,
    orden: ORDENES.has(flags.sort) ? flags.sort : 'tokens',
    top: enteroPositivo(flags.top, TOP_DEFAULT),
    filtros: filtrosDe(flags, cwd),
  }

  const paths = resolveClaudeHome({ override: flags['claude-home'] })
  const source = createSnapshotSource({ paths })
  const clock = { now: () => Date.now() }

  const caps = detectCaps({ overrides: flags.ascii ? { unicode: false } : {} })
  const modo = flags.compact ? 'compact' : flags.agents ? 'agents' : 'full'

  if (flags.json) {
    const vista = await buildView({ source, clock, opciones })
    console.log(renderJson(vista))
    return codigoDeSalida(vista)
  }

  const enVivo = !flags.once && process.stdout.isTTY === true && !ui.isCI()
  if (!enVivo) {
    const vista = await buildView({ source, clock, opciones })
    const cols = process.stdout.isTTY === true ? caps.cols : COLS_SNAPSHOT
    process.stdout.write(renderPlain(vista, { cols, caps, modo, top: opciones.top }) + '\n')
    return codigoDeSalida(vista)
  }

  return await enVivoLoop({ source, clock, opciones, caps, modo, flags })
}

// --- panel en vivo ---

async function enVivoLoop({ source, clock, opciones, caps, modo, flags }) {
  const intervalo = Math.max(INTERVALO_MINIMO, enteroPositivo(flags.interval, INTERVALO_DEFAULT))
  const renderer = createTtyRenderer()

  let vista = null
  let errorDelTick = null
  let enTick = false
  let timer = null
  let salida = 0

  function pintar() {
    if (!vista && !errorDelTick) return
    const { cols, rows } = renderer.size()
    const modelo = conAvisoDeError(vista, errorDelTick)
    const proyeccion = presentar(modelo, { ahora: modelo.generadoEn, top: opciones.top })
    renderer.paint(renderPanel(proyeccion, { cols, rows, caps, color: caps.color !== false, modo }))
  }

  async function tick() {
    // Un tick que tarda mas que el intervalo no puede pisarse con el siguiente: el
    // tailer mantiene offsets por archivo y dos lecturas en paralelo los corrompen.
    if (enTick || renderer.isPaused()) return
    enTick = true
    try {
      vista = await buildView({ source, clock, opciones })
      errorDelTick = null
    } catch (err) {
      // Un error en un tick no mata el bucle: se anota como aviso y se sigue con la
      // ultima vista buena. Perder el panel entero por un archivo ilegible seria peor.
      errorDelTick = err
    } finally {
      enTick = false
    }
    pintar()
  }

  try {
    await new Promise((resolve) => {
      renderer.onKey((key) => {
        if (key === KEY_CTRL_C) {
          salida = 130
          resolve()
          return
        }
        if (key === 'q') {
          salida = vista ? codigoDeSalida(vista) : 0
          resolve()
          return
        }
        // 'p' ya alterno el pausado dentro del renderer: repintar deja el frame quieto.
      })
      renderer.onResize(() => pintar())
      renderer.start()

      // Primer tick inmediato: esperar el intervalo dejaria la pantalla vacia.
      tick()
      timer = setInterval(tick, intervalo)
      timer.unref?.()
    })
    return salida
  } finally {
    // Pase lo que pase — tecla, error de buildView, excepcion inesperada — la
    // terminal vuelve con cursor y sin alternate buffer. Es el peor modo de fallo
    // posible de esta herramienta y por eso va en un finally, no al final del try.
    if (timer) clearInterval(timer)
    renderer.stop()
  }
}

// --- helpers ---

function filtrosDe(flags, cwd) {
  const filtros = {}
  if (typeof flags.project === 'string' && flags.project !== '') {
    filtros.proyecto = flags.project === '.' ? cwd : flags.project
  }
  if (typeof flags.session === 'string' && flags.session !== '') {
    filtros.sesion = flags.session
  }
  return filtros
}

// parseArgs entrega strings: la conversion y la validacion son del comando.
function enteroPositivo(valor, porDefecto) {
  const n = Number(valor)
  if (!Number.isFinite(n) || n <= 0) return porDefecto
  return Math.floor(n)
}

// Sirve desde un hook: 0 bajo 85 %, 1 entre 85 y 94 %, 2 en 95 % o mas. Sin datos
// de limites es 0 — no saber no es lo mismo que estar mal.
function codigoDeSalida(vista) {
  const filas = presentar(vista, { ahora: vista?.generadoEn }).limites
  if (filas.length === 0) return 0
  const peor = filas[0].porcentaje
  if (peor >= UMBRAL_CRITICO) return 2
  if (peor >= UMBRAL_AVISO) return 1
  return 0
}

// Agrega el error del ultimo tick a los avisos de la vista, sin mutar el modelo de
// dominio. Si todavia no hubo ninguna vista buena, arma la minima para que el panel
// tenga algo que pintar en vez de una pantalla en negro.
function conAvisoDeError(vista, err) {
  if (!err) return vista
  const aviso = { file: 'monitor', reason: err.message ?? String(err) }
  if (!vista) return { generadoEn: Date.now(), avisos: [aviso] }
  return { ...vista, avisos: [...(vista.avisos ?? []), aviso] }
}
