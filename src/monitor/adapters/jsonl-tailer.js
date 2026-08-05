import fs from 'node:fs'

import { parsearLinea } from '../domain/eventos.js'
import { crearDeduplicador } from '../domain/consumo.js'

// Adaptador de lectura incremental de transcripts JSONL. Los archivos llegan a
// varios MB y se refrescan cada 2 s: releerlos enteros en cada tick es inviable.
// Ademas Claude Code los esta escribiendo MIENTRAS los leemos, asi que el ultimo
// fragmento leido puede ser media linea. Ese resto vive en memoria hasta que el
// tick siguiente lo completa: por eso el offset avanza hasta el `size` que se
// stateo y NO hasta el ultimo \n. Asi cada linea se emite exactamente una vez.

function emptyResult() {
  return { events: [], titles: [], closures: [], warnings: [] }
}

function newState() {
  return {
    offset: 0,
    mtimeMs: 0,
    rest: '',
    // Un deduplicador POR ARCHIVO, nunca global: consumo.js documenta ese
    // contrato. Dos archivos distintos no comparten un message.id real, y asi
    // el reset por truncado es local y no arrastra al resto del indice.
    dedup: crearDeduplicador(),
    lastReadAt: 0,
  }
}

// Contexto que espera parsearLinea. Si quien llama no lo trae, se deriva de la
// entrada del indice de claude-home.js.
function contextFor(file, ctx) {
  if (ctx && ctx.sessionId !== undefined) return ctx
  return {
    sessionId: file.sessionId ?? null,
    agentId: file.agentId ?? null,
    esSubagente: file.kind === 'subagent',
  }
}

export function createTailer() {
  const states = new Map()
  let bytesRead = 0

  function ensureState(filePath) {
    let state = states.get(filePath)
    if (!state) {
      state = newState()
      states.set(filePath, state)
    }
    return state
  }

  // Procesa una linea completa y la reparte en events/titles/closures.
  function classify(linea, ctx, state, out) {
    if (linea === '') return
    const res = parsearLinea(linea, ctx)
    if (!res) return

    if (res.clase === 'uso') {
      // Filtrar ANTES de emitir: si el archivo se releyo desde cero tras un
      // truncado, o si Claude Code reescribio una linea, no queremos contar dos veces.
      if (state.dedup.visto(res.dato)) return
      out.events.push(res.dato)
      return
    }
    if (res.clase === 'titulo') {
      out.titles.push(res.dato)
      return
    }
    out.closures.push(res.dato)
  }

  async function readNew(file, ctx) {
    const out = emptyResult()
    const filePath = file?.path
    if (!filePath) return out

    let stat
    try {
      stat = await fs.promises.stat(filePath)
    } catch (err) {
      // ENOENT (borrado entre el indice y la lectura), EPERM, EBUSY: se anota y
      // se sigue. El monitor tiene que poder seguir dibujandose.
      out.warnings.push({ file: filePath, reason: err.code ?? err.message })
      return out
    }

    const size = stat.size
    const state = ensureState(filePath)

    // size < offset solo puede significar truncado o rotacion del archivo. Si
    // siguieramos desde el offset viejo leeriamos desde la mitad de una linea y
    // todo lo posterior saldria corrupto: se reinicia el estado de ESTE archivo.
    if (size < state.offset) {
      state.offset = 0
      state.rest = ''
      state.dedup.limpiar()
    }

    state.mtimeMs = stat.mtimeMs

    // Nada nuevo: ni siquiera abrimos el archivo (~120 archivos por tick).
    if (size === state.offset) {
      state.lastReadAt = Date.now()
      return out
    }

    const start = state.offset
    const resolvedCtx = contextFor(file, ctx)

    let stream
    try {
      stream = fs.createReadStream(filePath, { start, end: size - 1, encoding: 'utf8' })
    } catch (err) {
      out.warnings.push({ file: filePath, reason: err.code ?? err.message })
      return out
    }

    // Buffer local: si el stream muere a mitad de lectura descartamos el resto
    // parcial y NO avanzamos el offset, para que el proximo tick reintegre el
    // tramo completo desde donde estaba. Tocar state.rest antes de terminar
    // dejaria el estado a medias y romperia el "exactamente una vez".
    let rest = state.rest
    let failed = null

    try {
      for await (const chunk of stream) {
        const texto = rest + chunk
        const partes = texto.split('\n')
        // El ultimo elemento puede ser una linea a medio escribir: queda en rest.
        rest = partes.pop()
        for (const parte of partes) classify(parte, resolvedCtx, state, out)
      }
    } catch (err) {
      failed = err
    }

    state.lastReadAt = Date.now()

    if (failed) {
      out.warnings.push({ file: filePath, reason: failed.code ?? failed.message })
      // Se devuelve lo ya parseado (el dedup impide contarlo dos veces al
      // releerlo) y el offset se queda quieto.
      return out
    }

    state.rest = rest
    state.offset = size
    bytesRead += size - start
    return out
  }

  function reset(filePath) {
    return states.delete(filePath)
  }

  function state(filePath) {
    return states.get(filePath) ?? null
  }

  function stats() {
    let clavesDedup = 0
    for (const st of states.values()) clavesDedup += st.dedup.tamano()
    return { archivos: states.size, clavesDedup, bytesLeidos: bytesRead }
  }

  // Un monitor de 8 horas con --since 24h no puede acumular claves sin limite.
  function purgeOlderThan(ts) {
    let liberadas = 0
    for (const st of states.values()) liberadas += st.dedup.purgar(ts)
    return liberadas
  }

  return { readNew, reset, state, stats, purgeOlderThan }
}
