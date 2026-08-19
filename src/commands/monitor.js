import path from 'node:path'
import * as ui from '../ui.js'
import { parsearDuracion } from '../monitor/domain/ventanas.js'
import { buildView } from '../monitor/application/build-view.js'
import { resolveClaudeHome } from '../monitor/adapters/claude-home.js'
import { createSnapshotSource } from '../monitor/adapters/snapshot-source.js'
import { createLimitsReader } from '../monitor/adapters/usage-limits-reader.js'
import { createUsageFetcher } from '../monitor/adapters/usage-fetcher.js'
import { createUsageHistory } from '../monitor/adapters/usage-history.js'
import { detectCaps } from '../monitor/adapters/caps.js'
import { createTtyRenderer } from '../monitor/adapters/tty-renderer.js'
import { renderPanel } from '../monitor/adapters/panel-layout.js'
import { presentar } from '../monitor/adapters/panel-presenter.js'
import { renderJson, renderPlain } from '../monitor/adapters/plain-renderer.js'
import { construirLinea, emitirLinea } from '../monitor/adapters/router-log-writer.js'
import { createVaultPublisher } from '../monitor/adapters/vault-monitor-publisher.js'
import { createSessionsPublisher } from '../monitor/adapters/vault-sessions-publisher.js'
import { createVaultAccountsReader, gitAsync } from '../monitor/adapters/vault-accounts-reader.js'
import {
  createLocalAccountsReader,
  createCombinedAccountsReader,
  parseLocalAccountsEnv,
  pathsDeConfigDir,
} from '../monitor/adapters/local-accounts-reader.js'
import { readVaultConfig, carpetaProyecto } from '../core/vault.js'

// El caché de limites de ~/.claude.json solo se reescribe cuando el humano corre
// /usage, asi que sin esto el panel muestra un dato de 20-50 minutos. El fetcher
// le pega al mismo endpoint que usa Claude Code, con un TTL de 5 minutos.
//
// Cuando NO se toca la red, y por que:
//   --no-refresh    el usuario lo pidio explicitamente
//   CI              un runner no debe salir a internet ni leer credenciales
//   --claude-home   apunta a un fixture: no hay credenciales que leer, y ademas
//                   ningun test puede depender de la red
// En esos casos se lee solo el cache de .claude.json, como antes.
function sinRefrescoDeRed(flags) {
  return flags['no-refresh'] === true || flags.refresh === false || ui.isCI() || Boolean(flags['claude-home'])
}

// Una sola instancia por corrida (o `undefined` si no se toca la red): la
// comparten `crearLimitsReader` (para refrescar los limites) y
// `createSnapshotSource` (SHS-H3-T106, para reportar su propio `estado()` como
// aviso). Antes cada uno tenia su propio fetcher (o directamente no lo tenia,
// en el caso de snapshot-source), asi que el aviso de "limites sin refrescar"
// nunca podia aparecer en el panel real, solo en el test con un fake.
function crearUsageFetcher(flags) {
  if (sinRefrescoDeRed(flags)) return undefined
  const paths = resolveClaudeHome({ override: flags['claude-home'] })
  return createUsageFetcher({ paths })
}

function crearLimitsReader(usageFetcher) {
  if (!usageFetcher) return undefined
  return createLimitsReader({ fetcher: usageFetcher })
}

// Persistencia del historico del gasto extra (ver adapters/usage-history.js y
// docs/decisions/20260810-monitor-persiste-historico-de-gasto-extra.md): la API
// nunca informa cuando se detecto el limite alcanzado, asi que el monitor lleva
// su propio registro. `--seed-extra-detectado-en <ISO>` solo importa la primera
// vez (sin usage-history.json todavia); en cualquier corrida posterior el
// adaptador lo ignora.
function crearUsageHistory(flags) {
  const paths = resolveClaudeHome({ override: flags['claude-home'] })
  return createUsageHistory({ paths, seedDetectadoEn: flags['seed-extra-detectado-en'] })
}

// Registra el gasto extra recien leido en el historico persistido. Nunca lanza:
// un fallo de disco no puede tumbar un tick del panel (ver usage-history.js).
// El error (de disco o de logica) no se traga en silencio: se empuja al mismo
// canal de avisos que usa snapshot-source.js (ver snapshot-source.js:137),
// para que un fallo real siga siendo visible en el panel en vez de desaparecer.
function registrarHistorico(usageHistory, vista, ahora) {
  try {
    usageHistory.registrar(vista?.limites?.gastoExtra ?? null, ahora)
  } catch (err) {
    vista?.avisos?.push({ file: 'usage-history', reason: err.code ?? err.message })
  }
}

// `souclaude monitor`: panel de consumo de tokens. Tres modos excluyentes:
//   --json                              -> modelo de dominio crudo y sale
//   --once | sin TTY | CI               -> un snapshot en texto plano y sale
//   resto                               -> panel en vivo sobre la TTY
//
// SIN TTY NO SE TOCA NADA DE LA TERMINAL: ni alternate buffer, ni setRawMode, ni
// cursor. `souclaude monitor | cat` no puede colgarse esperando teclas ni ensuciar
// la salida con escapes.
//
// --emit-router es un cuarto modo, ortogonal a los tres de arriba: no dibuja
// panel, es estrictamente de lectura salvo por la UNICA escritura de todo el
// comando (progress/model-router.jsonl). Ver ../monitor/adapters/router-log-writer.js.

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
  if (flags['emit-router']) return await emitRouter(flags, cwd)

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

  const enVivo = !flags.json && !flags.once && process.stdout.isTTY === true && !ui.isCI()

  // El publisher solo existe en vivo (--publish); el lector de cuentas del
  // Vault sirve en todos los modos (--json lo expone gratis), pero su pull
  // remoto solo corre en vivo y solo si el publisher no lo hace ya.
  const publisher = enVivo ? crearPublisher(flags, cwd) : null
  const sesionesPublisher = enVivo ? crearPublisherDeSesiones(flags, cwd) : null
  const accountsReader = crearAccountsReader(cwd, { conPull: enVivo && !publisher })

  const paths = resolveClaudeHome({ override: flags['claude-home'] })
  const usageHistory = crearUsageHistory(flags)
  // SHS-H3-T106: mismo fetcher para refrescar limites y para reportar su
  // propio estado() como aviso -- ver crearUsageFetcher.
  const usageFetcher = crearUsageFetcher(flags)
  // SHS-H3-T105: el mismo usageHistory que registrarHistorico() usa para
  // ESCRIBIR (tras cada buildView) se compone aca tambien hacia adentro, para
  // que collect() pueda LEER lo persistido y domain/arbol.js sepa si el extra
  // vigente ya paso a historico.
  const source = createSnapshotSource({
    paths,
    limitsReader: crearLimitsReader(usageFetcher),
    usageHistory,
    usageFetcher,
    accountsReader,
    cuentasLocales: crearCuentasLocales(),
  })
  const clock = { now: () => Date.now() }

  const caps = detectCaps({ overrides: flags.ascii ? { unicode: false } : {} })
  const modo = flags.compact ? 'compact' : flags.agents ? 'agents' : 'full'

  if (flags.json) {
    const vista = await buildView({ source, clock, opciones })
    registrarHistorico(usageHistory, vista, clock.now())
    console.log(renderJson(vista))
    return codigoDeSalida(vista)
  }

  if (!enVivo) {
    const vista = await buildView({ source, clock, opciones })
    registrarHistorico(usageHistory, vista, clock.now())
    const cols = process.stdout.isTTY === true ? caps.cols : COLS_SNAPSHOT
    process.stdout.write(renderPlain(vista, { cols, caps, modo, top: opciones.top }) + '\n')
    return codigoDeSalida(vista)
  }

  return await enVivoLoop({ source, clock, opciones, caps, modo, flags, usageHistory, publisher, sesionesPublisher })
}

// Publicacion de snapshots agregados de esta cuenta al Vault (ADR
// 20260810-monitor-snapshots-en-vault), solo en vivo. Con Vault configurado
// publica POR DEFECTO: tener vault.local.json ya expresa querer la vista
// compartida, y un opt-in olvidable dejaba la seccion CUENTAS de las demas
// maquinas vacia. --no-publish la apaga por corrida. Sin Vault configurado
// solo se avisa si el usuario pidio --publish explicito (para no ensuciar
// cada corrida local-only): el Vault jamas es dependencia dura de nada.
export function crearPublisher(flags, cwd) {
  if (flags.publish === false) return null
  const config = readVaultConfig(cwd)
  if (!config?.path) {
    if (flags.publish === true) {
      ui.log.warn('--publish sin Vault configurado (.claude/vault.local.json o VAULT_PATH): el monitor sigue local-only.')
    }
    return null
  }
  return createVaultPublisher({ vaultPath: config.path })
}

// Publicacion de la linea por sesion en Project-<PREFIJO>/sessions.md (ADR
// 20260817-milestones-planes-y-sesiones-en-vault): cada sesion con consumo de
// este proyecto deja su linea y la va actualizando mientras crece, sin
// depender de la disciplina del agente.
// Mismas condiciones de encendido que crearPublisher (solo en vivo, --no-publish
// la apaga); ademas necesita saber cual es la carpeta Project-* del Vault —
// sin eso no hay sessions.md que escribir y se degrada en silencio.
export function crearPublisherDeSesiones(flags, cwd) {
  if (flags.publish === false) return null
  const config = readVaultConfig(cwd)
  if (!config?.path) return null
  const proyecto = carpetaProyecto(config.path, config)
  if (!proyecto) {
    if (flags.publish === true) {
      ui.log.warn('No se pudo determinar la carpeta Project-<PREFIJO> del Vault: las lineas de sessions.md no se publican (declara "project" en .claude/vault.local.json).')
    }
    return null
  }
  const paths = resolveClaudeHome({ override: flags['claude-home'] })
  return createSessionsPublisher({
    vaultPath: config.path,
    proyecto,
    cwdProyecto: cwd,
    quien: typeof config.quien === 'string' && config.quien !== '' ? config.quien : null,
    registroPath: path.join(paths.home, 'souclaude', 'sesiones-publicadas.json'),
  })
}

// Lector de los snapshots que publico el resto del equipo (Vault) combinado
// con las cuentas locales adicionales (SOUCLAUDE_LOCAL_ACCOUNTS, ej. las
// carpetas ~/.claude1 y ~/.claude2 de claude1/claude2 en el perfil de
// PowerShell). Sin Vault ni cuentas locales, null: la seccion CUENTAS muestra
// solo la cuenta local principal.
function crearAccountsReader(cwd, { conPull }) {
  const config = readVaultConfig(cwd)
  const vaultReader = config?.path
    ? createVaultAccountsReader({ vaultPath: config.path, git: conPull ? gitAsync : null })
    : null

  const homesLocales = parseLocalAccountsEnv(process.env.SOUCLAUDE_LOCAL_ACCOUNTS)
  const localReader = homesLocales.length > 0 ? createLocalAccountsReader({ homes: homesLocales }) : null

  if (vaultReader && localReader) return createCombinedAccountsReader([vaultReader, localReader])
  return vaultReader ?? localReader
}

// {paths} de cada cuenta local (SOUCLAUDE_LOCAL_ACCOUNTS) para que
// createSnapshotSource mezcle sus SESIONES/PROYECTOS en el mismo arbol,
// etiquetadas con su propia identidad de cuenta. Complementa crearAccountsReader
// (que solo aporta el AGREGADO de la fila CUENTAS): las mismas carpetas
// alimentan las dos rutas por separado, cada una con el detalle que necesita.
function crearCuentasLocales() {
  const homesLocales = parseLocalAccountsEnv(process.env.SOUCLAUDE_LOCAL_ACCOUNTS)
  return homesLocales.map((homeOverride) => ({ paths: pathsDeConfigDir(homeOverride) }))
}

// --- panel en vivo ---

async function enVivoLoop({ source, clock, opciones, caps, modo, flags, usageHistory, publisher = null, sesionesPublisher = null }) {
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
    const conPublicacion = conAvisoDePublicacion(
      conAvisoDePublicacion(modelo, publisher, clock.now(), 'Vault'),
      sesionesPublisher,
      clock.now(),
      'sessions.md'
    )
    const proyeccion = presentar(conPublicacion, { ahora: modelo.generadoEn, top: opciones.top })
    renderer.paint(renderPanel(proyeccion, { cols, rows, caps, color: caps.color !== false, modo }))
  }

  async function tick() {
    // Un tick que tarda mas que el intervalo no puede pisarse con el siguiente: el
    // tailer mantiene offsets por archivo y dos lecturas en paralelo los corrompen.
    if (enTick || renderer.isPaused()) return
    enTick = true
    try {
      vista = await buildView({ source, clock, opciones })
      registrarHistorico(usageHistory, vista, clock.now())
      errorDelTick = null
    } catch (err) {
      // Un error en un tick no mata el bucle: se anota como aviso y se sigue con la
      // ultima vista buena. Perder el panel entero por un archivo ilegible seria peor.
      errorDelTick = err
    } finally {
      enTick = false
    }
    // Fire-and-forget: el publisher decide solo si le toca (intervalo, backoff,
    // cambio material) y jamas puede demorar ni tumbar el render.
    if (publisher && vista) {
      publisher.publicar(vista, { ahora: clock.now() }).catch(() => {})
    }
    if (sesionesPublisher && vista) {
      sesionesPublisher.publicar(vista, { ahora: clock.now() }).catch(() => {})
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

// --- emit-router: el puente de estimado a medido ---
//
// Es la UNICA escritura de todo el comando; todo lo demas (buildView, la
// resolucion del tramo) es lectura. No dibuja panel: imprime que escribio (o
// por que no) y sale. 0 si escribio o si la idempotencia la rechazo (no es un
// error correr el comando dos veces); 2 si faltan argumentos obligatorios o
// si construirLinea no pudo armar la linea (motivo faltante, tramo ambiguo o
// inexistente, etc).
async function emitRouter(flags, cwd) {
  if (typeof flags.hito !== 'string' || flags.hito === '') {
    ui.log.error('Falta --hito: obligatorio para emitir telemetria del router (ver SKILL ccem-model-router).')
    return 2
  }

  // Default 'all' (no 24h): este modo busca un lanzamiento puntual que ya
  // paso, no el estado reciente del panel. Si el usuario pasa --since, se
  // respeta igual.
  const ventana = flags.since ?? 'all'
  if (parsearDuracion(ventana) === null) {
    ui.log.error(`Ventana invalida: "${ventana}". Usa 30m, 1h, 6h, 24h, 7d o all.`)
    return 2
  }

  const paths = resolveClaudeHome({ override: flags['claude-home'] })
  // --emit-router no dibuja panel ni consume `avisos`: solo necesita que los
  // limites sigan refrescandose igual que antes, no reportar estado().
  const source = createSnapshotSource({ paths, limitsReader: crearLimitsReader(crearUsageFetcher(flags)) })
  const clock = { now: () => Date.now() }

  // top: null (sin recorte). Este modo busca UN agente o sesion puntual en
  // todo el arbol; el recorte de presentacion (pensado para el panel en vivo)
  // podria dejarlo justo afuera de las primeras N filas.
  const opciones = { ventana, orden: 'tokens', top: null, filtros: {} }

  let vista
  try {
    vista = await buildView({ source, clock, opciones })
  } catch (err) {
    ui.log.error(`No se pudo leer la telemetria de Claude Code: ${err.message}`)
    return 2
  }

  let linea
  try {
    linea = construirLinea(vista, {
      hito: flags.hito,
      task: typeof flags.task === 'string' && flags.task !== '' ? flags.task : null,
      agente: typeof flags.agente === 'string' && flags.agente !== '' ? flags.agente : null,
      resultado: flags.resultado,
      rework: enteroNoNegativo(flags.rework, 0),
      motivo: typeof flags.motivo === 'string' && flags.motivo !== '' ? flags.motivo : null,
      clase: typeof flags.clase === 'string' && flags.clase !== '' ? flags.clase : null,
      sessionId: typeof flags.session === 'string' && flags.session !== '' ? flags.session : undefined,
      ahora: clock.now(),
    })
  } catch (err) {
    ui.log.error(err.message)
    return 2
  }

  const rutaJsonl = path.join(cwd, 'progress', 'model-router.jsonl')
  const { escrita, motivo } = await emitirLinea(rutaJsonl, linea, { force: flags.force === true })

  if (!escrita) {
    ui.log.warn(motivo)
    return 0
  }

  ui.log.success(`Linea de telemetria medida escrita en ${rutaJsonl}`)
  ui.log.success(JSON.stringify(linea))
  return 0
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

// Igual que enteroPositivo pero acepta 0 (rework: 0 devoluciones es el caso normal).
function enteroNoNegativo(valor, porDefecto) {
  if (valor === undefined) return porDefecto
  const n = Number(valor)
  if (!Number.isFinite(n) || n < 0) return porDefecto
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

// Traduce el estado de un publisher a un aviso visible, sin mutar el modelo. Un
// secreto detectado o una racha de fallos que dejo el dato viejo son cosas
// que el humano tiene que ver; una publicacion al dia no necesita anunciarse.
// `etiqueta` distingue el snapshot agregado ('Vault') de la linea por sesion
// ('sessions.md'): comparten forma de estado() pero fallan por separado.
function conAvisoDePublicacion(vista, publisher, ahora, etiqueta = 'Vault') {
  if (!publisher || !vista) return vista
  const e = publisher.estado()

  let aviso = null
  if (e.secretoDetectado) {
    aviso = `publicacion a ${etiqueta} ABORTADA: el contenido tenia un posible secreto`
  } else if (e.fallosSeguidos > 0 && e.ultimaPublicacionMs != null) {
    const min = Math.round((ahora - e.ultimaPublicacionMs) / 60_000)
    aviso = `${etiqueta}: sin publicar hace ${min}m (${e.fallosSeguidos} fallo${e.fallosSeguidos === 1 ? '' : 's'})`
  } else if (e.fallosSeguidos >= 3) {
    aviso = `${etiqueta}: todavia sin publicar (${e.fallosSeguidos} fallos)`
  }

  if (!aviso) return vista
  return { ...vista, avisos: [...(vista.avisos ?? []), { file: 'vault', reason: aviso }] }
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
