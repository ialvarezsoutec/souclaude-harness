// Dominio puro: interpreta lineas de un transcript JSONL de Claude Code.
// No conoce el filesystem ni la ruta de disco; el adaptador le pasa "contexto"
// con lo que ya sabe por el nombre del archivo (sessionId, agentId, etc).

// Prefiltros por SUBSTRING, sin JSON.parse: son una optimizacion de rendimiento
// para descartar rapido la mayoria de las lineas en archivos de hasta varios MB.
// La validacion real siempre es la funcion `a*` correspondiente (aEventoDeUso,
// aTitulo, aCierre), que trabaja sobre el objeto ya parseado.

export function esLineaDeUso(linea) {
  return (
    (linea.includes('"type":"assistant"') || linea.includes('"type": "assistant"')) &&
    linea.includes('"usage"')
  )
}

export function esLineaDeTitulo(linea) {
  return linea.includes('"type":"ai-title"') || linea.includes('"type": "ai-title"')
}

export function esLineaDeCierre(linea) {
  return (
    (linea.includes('"type":"user"') || linea.includes('"type": "user"')) &&
    linea.includes('"toolUseResult"')
  )
}

// Convierte un objeto ya parseado (type:"assistant") en un EventoDeUso, o null
// si la linea no sirve (error de API, sin usage, sin clave de deduplicacion).
export function aEventoDeUso(obj, contexto = {}) {
  if (obj?.type !== 'assistant') return null
  if (obj.isApiErrorMessage === true) return null

  const usage = obj.message?.usage
  if (!usage) return null

  const id = obj.message?.id
  const requestId = obj.requestId
  if (!id && !requestId) return null

  const ts = obj.timestamp ? Date.parse(obj.timestamp) : NaN

  return {
    id,
    requestId,
    ts: Number.isNaN(ts) ? null : ts,
    sessionId: obj.sessionId ?? contexto.sessionId,
    agentId: obj.agentId ?? contexto.agentId ?? null,
    // attributionAgent puede venir como cadena vacia: con ?? quedaria '', por eso ||.
    tipoAgente: obj.attributionAgent || (contexto.esSubagente ? 'subagente' : 'principal'),
    cwd: obj.cwd,
    rama: obj.gitBranch,
    modeloId: obj.message.model,
    effort: obj.effort ?? null,
    esSidechain: obj.isSidechain === true,
    servicio: usage.service_tier ?? null,
    uso: {
      entrada: numero(usage.input_tokens),
      salida: numero(usage.output_tokens),
      cacheCreacion: numero(usage.cache_creation_input_tokens),
      cacheLectura: numero(usage.cache_read_input_tokens),
      cache1h: numero(usage.cache_creation?.ephemeral_1h_input_tokens),
      cache5m: numero(usage.cache_creation?.ephemeral_5m_input_tokens),
    },
  }
}

export function aTitulo(obj) {
  if (obj?.type !== 'ai-title') return null
  if (!obj.sessionId || typeof obj.aiTitle !== 'string') return null
  return { sessionId: obj.sessionId, titulo: obj.aiTitle }
}

export function aCierre(obj) {
  if (obj?.type !== 'user') return null
  const r = obj.toolUseResult
  if (!r || typeof r !== 'object') return null
  if (!r.agentId) return null

  return {
    agentId: r.agentId,
    agentType: r.agentType ?? null,
    resolvedModel: r.resolvedModel ?? null,
    totalTokens: numero(r.totalTokens),
    totalDurationMs: numero(r.totalDurationMs),
    totalToolUseCount: numero(r.totalToolUseCount),
    toolStats: r.toolStats ?? null,
  }
}

// Punto de entrada unico: aplica los prefiltros, parsea con try/catch (una
// linea corrupta o a medio escribir por Claude Code no puede tumbar el
// monitor) y clasifica. Es la unica funcion de este modulo que hace JSON.parse.
export function parsearLinea(linea, contexto = {}) {
  if (typeof linea !== 'string' || linea === '') return null

  const puedeSerUso = esLineaDeUso(linea)
  const puedeSerTitulo = !puedeSerUso && esLineaDeTitulo(linea)
  const puedeSerCierre = !puedeSerUso && !puedeSerTitulo && esLineaDeCierre(linea)

  if (!puedeSerUso && !puedeSerTitulo && !puedeSerCierre) return null

  let obj
  try {
    obj = JSON.parse(linea)
  } catch {
    return null
  }

  if (puedeSerUso) {
    const dato = aEventoDeUso(obj, contexto)
    return dato ? { clase: 'uso', dato } : null
  }

  if (puedeSerTitulo) {
    const dato = aTitulo(obj)
    return dato ? { clase: 'titulo', dato } : null
  }

  const dato = aCierre(obj)
  return dato ? { clase: 'cierre', dato } : null
}

function numero(v) {
  return typeof v === 'number' && !Number.isNaN(v) ? v : 0
}
