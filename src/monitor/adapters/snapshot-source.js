import { indexTranscripts, readAgentMeta } from './claude-home.js'
import { createTailer } from './jsonl-tailer.js'
import { readLiveSessions } from './session-reader.js'
import { createLimitsReader } from './usage-limits-reader.js'

// Composicion de todos los adaptadores de lectura en un unico puerto
// SnapshotSource (ver application/ports.js). Un `collect` = un tick del panel.
//
// TRADUCCION DE NOMBRES: el tailer emite en ingles (events/titles/closures/
// warnings), como corresponde a un adaptador; `construirVista` consume en
// espanol (eventos/titulos/cierres/metas/archivos/vivos/limites/avisos), porque
// es dominio. Este archivo es el unico lugar donde ocurre esa traduccion.

const CONCURRENCIA = 12

export function createSnapshotSource({
  paths,
  ttlLimitsMs,
  tailer = createTailer(),
  limitsReader = createLimitsReader({ ttlMs: ttlLimitsMs }),
  accountsReader = null,
} = {}) {
  // ESTADO ENTRE TICKS. El tailer solo devuelve lo NUEVO de cada archivo, asi
  // que si `collect` devolviera solo eso el panel mostraria los ultimos 2
  // segundos de consumo en vez del total de la ventana. Aca se acumula.
  let eventos = []

  // Titulos, cierres y metas aparecen UNA sola vez en el archivo: si un tick
  // los vio, ningun tick posterior los vuelve a emitir. Por eso van en Maps por
  // clave y NO se podan por ventana — perder un titulo es perderlo para siempre
  // (el offset del tailer ya paso por esa linea). Son una entrada chica por
  // sesion/agente: la memoria es O(sesiones + agentes), no O(eventos).
  const titulos = new Map() // sessionId -> { sessionId, titulo }
  const cierres = new Map() // agentId  -> cierre
  const metas = new Map() // agentId  -> { agentId, ...meta }

  // Rutas vistas, solo para poder soltar el estado del tailer en reset().
  const vistos = new Set()

  let ultimoIndice = 0
  let ticks = 0

  async function collect({ window, ahora } = {}) {
    const ventana = window ?? { desde: 0, hasta: ahora ?? 0 }
    const instante = typeof ahora === 'number' ? ahora : Date.now()
    const avisos = []

    // 1. Indice podado por mtime. Es el ahorro grande: con --since 24h la mayor
    // parte del historico ni siquiera se abre.
    const { files, warnings: avisosIndice } = await indexTranscripts(paths, { since: ventana.desde })
    avisos.push(...avisosIndice)
    ultimoIndice = files.length

    // 2. Lectura incremental de cada archivo del indice.
    const nuevos = []
    await enPool(files, CONCURRENCIA, async (file) => {
      vistos.add(file.path)
      let res
      try {
        res = await tailer.readNew(file)
      } catch (err) {
        // Ninguna falla de un archivo puede tumbar el tick.
        avisos.push({ file: file.path, reason: err.code ?? err.message })
        return
      }
      for (const evento of res.events) nuevos.push(evento)
      for (const t of res.titles) if (t?.sessionId) titulos.set(t.sessionId, t)
      for (const c of res.closures) if (c?.agentId) cierres.set(c.agentId, c)
      for (const w of res.warnings) avisos.push(w)
    })

    // 3. .meta.json de cada subagente. Se cachea por agentId porque el archivo
    // no cambia despues de creado: releerlo en cada tick son ~120 lecturas de
    // disco inutiles por segundo. Un fallo NO se cachea (puede ser un archivo a
    // medio escribir), se reintenta en el tick siguiente.
    const pendientes = files.filter(
      (f) => f.kind === 'subagent' && f.agentId && f.metaPath && !metas.has(f.agentId),
    )
    await enPool(pendientes, CONCURRENCIA, async (file) => {
      const meta = await readAgentMeta(file.metaPath)
      // readAgentMeta devuelve el JSON crudo, SIN agentId: `construirVista`
      // indexa metas por m.agentId, asi que hay que inyectarlo aca.
      if (meta) metas.set(file.agentId, { agentId: file.agentId, ...meta })
    })

    // 4. Procesos vivos.
    let vivos = []
    try {
      const res = await readLiveSessions(paths)
      vivos = res.live
      avisos.push(...res.warnings)
    } catch (err) {
      avisos.push({ file: paths.sessionsDir, reason: err.code ?? err.message })
    }

    // 5. Limites de uso (cacheados por mtime+ttl dentro del propio reader).
    // El mismo read trae la identidad de cuenta: viene del mismo archivo y el
    // dominio (normalizarCuenta) es quien la valida.
    let limites = null
    let cuenta = null
    try {
      const res = await limitsReader.read(paths.configFile, { ahora: instante })
      limites = res.limits
      cuenta = res.cuenta ?? null
      avisos.push(...res.warnings)
    } catch (err) {
      avisos.push({ file: paths.configFile, reason: err.code ?? err.message })
    }

    // MEMORIA ACOTADA: los eventos acumulados se recortan a la ventana en cada
    // tick y el dedup del tailer se purga con el mismo corte. Sin esto, un
    // monitor abierto 8 horas crece sin limite. Un evento sin ts no se puede
    // ubicar en el tiempo: se conserva y es el dominio (ventanas.dentroDe) el
    // que decide si entra a la vista.
    for (const evento of nuevos) eventos.push(evento)
    if (ventana.desde > 0) {
      eventos = eventos.filter((e) => e.ts == null || e.ts >= ventana.desde)
      tailer.purgeOlderThan(ventana.desde)
    }

    // 5b. Snapshots de las otras cuentas del equipo (Vault), si hay lector.
    // El adaptador entrega crudo; consolidarCuentas (dominio) decide que gana.
    let cuentasRemotas = []
    if (accountsReader) {
      try {
        const res = await accountsReader.leer({ ahora: instante })
        cuentasRemotas = res.cuentas
        avisos.push(...res.warnings)
      } catch (err) {
        avisos.push({ file: 'vault', reason: err.code ?? err.message })
      }
    }

    ticks += 1

    // 6. Snapshot con la forma exacta que espera construirVista.
    return {
      // Copia: el array interno se sigue mutando en los ticks siguientes y el
      // snapshot entregado no puede cambiar bajo los pies de quien lo consume.
      eventos: [...eventos],
      titulos: [...titulos.values()],
      cierres: [...cierres.values()],
      metas: [...metas.values()],
      archivos: files,
      vivos,
      limites,
      cuenta,
      cuentasRemotas,
      avisos,
    }
  }

  function stats() {
    return {
      ticks,
      eventos: eventos.length,
      titulos: titulos.size,
      cierres: cierres.size,
      metas: metas.size,
      archivos: ultimoIndice,
      tailer: tailer.stats(),
    }
  }

  function reset() {
    eventos = []
    titulos.clear()
    cierres.clear()
    metas.clear()
    for (const ruta of vistos) tailer.reset(ruta)
    vistos.clear()
    ultimoIndice = 0
    ticks = 0
  }

  return { collect, stats, reset }
}

// Pool de concurrencia sin dependencias: N trabajadores tomando de una cola
// compartida. Con ~120 archivos, secuencial es lento y todos a la vez agota los
// descriptores del proceso.
async function enPool(items, limite, tarea) {
  const total = items.length
  if (total === 0) return

  let siguiente = 0
  const trabajadores = []
  for (let i = 0; i < Math.min(limite, total); i++) {
    trabajadores.push(
      (async () => {
        while (siguiente < total) {
          const item = items[siguiente++]
          await tarea(item)
        }
      })(),
    )
  }
  await Promise.all(trabajadores)
}
