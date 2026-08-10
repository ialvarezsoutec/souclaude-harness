// Puente entre el arbol agregado del monitor (VistaMonitor, ver
// ../domain/arbol.js) y progress/model-router.jsonl: convierte telemetria
// ESTIMADA (la que hoy escribe a mano el orchestrator, ~4 caracteres por
// token) en telemetria MEDIDA, leida del mismo pipeline que ya usa
// `souclaude monitor` sobre los transcripts reales de Claude Code.
//
// Formato de linea: SKILL .claude/skills/ccem-model-router/SKILL.md §5. Es la
// fuente de verdad del formato — si este comentario y la skill difieren, gana
// la skill.
//
// EXTENSION fuera de la SKILL: el campo `fuente` ({sessionId, agentId,
// llamadas}). La SKILL §5 no lo define; existe solo para que emitirLinea()
// pueda detectar duplicados (idempotencia) sobre la tupla (task,
// fuente.agentId) sin tener que re-derivar el tramo medido cada vez.

import { appendFileSync, mkdirSync } from 'node:fs'
import path from 'node:path'
import { readIfExists } from '../../core/fsx.js'

const RESULTADOS_CON_MOTIVO_OBLIGATORIO = new Set(['escalated', 'fallback'])

/**
 * Arma la linea de telemetria "medida" a partir de la VistaMonitor ya
 * construida (domain/arbol.js) y los datos del lanzamiento que solo conoce
 * quien orquesta (hito, task, resultado...).
 *
 * @param {object} vista VistaMonitor: { proyectos: [{ sesiones: [{ agentes: [...] }] }], ... }
 * @param {object} opts
 * @param {string} opts.hito
 * @param {string|null} [opts.task]
 * @param {string|null} [opts.agente] rol del subagente (spec-author/implementer/reviewer...)
 * @param {string} opts.resultado approved | changes_requested | escalated | fallback | aborted
 * @param {number} [opts.rework]
 * @param {string|null} [opts.motivo] obligatorio si resultado es escalated o fallback
 * @param {string|null} [opts.clase]
 * @param {string[]} [opts.senales]
 * @param {string} [opts.sessionId] prefijo de sessionId a medir (si no hay agentId)
 * @param {string} [opts.agentId] agentId exacto (o prefijo) a medir
 * @param {number} opts.ahora epoch ms del momento de emision
 * @returns {object} la linea lista para JSON.stringify(linea) + '\n'
 */
export function construirLinea(vista, opts = {}) {
  const {
    hito,
    task = null,
    agente = null,
    resultado,
    rework = 0,
    motivo = null,
    clase = null,
    senales = [],
    sessionId,
    agentId,
    ahora,
  } = opts

  if (!hito) throw new Error('construirLinea: falta "hito".')
  if (!resultado) throw new Error('construirLinea: falta "resultado".')
  if (typeof ahora !== 'number' || !Number.isFinite(ahora)) {
    throw new Error('construirLinea: falta "ahora" (epoch ms).')
  }
  // Motivo obligatorio en escaladas y fallbacks (SKILL §5): un "por que" que
  // no queda escrito en el momento no se reconstruye despues.
  if (RESULTADOS_CON_MOTIVO_OBLIGATORIO.has(resultado) && !motivo) {
    throw new Error(
      `construirLinea: resultado "${resultado}" exige "motivo" explicito (SKILL ccem-model-router §5).`
    )
  }

  const tramo = resolverTramo(vista, { sessionId, agentId })
  const { consumo, modelo, effort, fuente } = tramo

  // tokens_in = todo lo que se factura como entrada (entrada + ambos caches).
  // Si solo contaramos "entrada", el costo nunca cerraria contra la
  // facturacion real: el cache es la mayoria del volumen.
  const tokensIn = consumo.entrada + consumo.cacheCreacion + consumo.cacheLectura
  const tokensOut = consumo.salida
  // costo_usd null si algun modelo del tramo no tenia precio conocido: un
  // total parcial presentado como total completo es peor que no tener numero.
  const costoUsd = consumo.sinPrecio > 0 ? null : redondear4(consumo.costoUsd)

  return {
    ts: new Date(ahora).toISOString(),
    hito,
    task,
    agente,
    clase,
    senales,
    modelo,
    effort,
    resultado,
    rework,
    motivo,
    tokens_in: tokensIn,
    tokens_out: tokensOut,
    costo_usd: costoUsd,
    medicion: 'medido',
    // Atribucion multi-cuenta (SKILL §5): con dos cuentas en el equipo, una
    // linea sin dueno no se puede auditar en /rock-close. null si esta
    // maquina no tiene identidad en .claude.json (compatibilidad hacia atras).
    cuenta: vista?.cuenta?.alias ?? null,
    cuenta_uuid: vista?.cuenta?.accountUuid ?? null,
    maquina: vista?.cuenta?.machineID ?? null,
    fuente,
  }
}

/**
 * Escribe `linea` en `rutaJsonl` (creando progress/ si hace falta), salvo que
 * ya exista una linea con la misma tupla (task, fuente.agentId) — en ese caso
 * la rechaza sin lanzar, para que correr el comando dos veces no duplique
 * telemetria. `force: true` la escribe igual.
 *
 * @param {string} rutaJsonl
 * @param {object} linea
 * @param {{force?: boolean}} [opciones]
 * @returns {Promise<{escrita: boolean, motivo: string|null}>}
 */
export async function emitirLinea(rutaJsonl, linea, { force = false } = {}) {
  if (!force) {
    const existentes = leerLineas(rutaJsonl)
    const duplicada = existentes.some(
      (l) => l.task === linea.task && (l.fuente?.agentId ?? null) === (linea.fuente?.agentId ?? null)
    )
    if (duplicada) {
      return {
        escrita: false,
        motivo: `Ya existe una linea en ${rutaJsonl} para task="${linea.task}" agentId="${linea.fuente?.agentId ?? null}". Usa --force para sobrescribir.`,
      }
    }
  }

  mkdirSync(path.dirname(rutaJsonl), { recursive: true })
  // Append directo, sin write-temp-then-rename: bajo OneDrive el rename da
  // EPERM. Misma regla que documenta core/fsx.js.
  appendFileSync(rutaJsonl, JSON.stringify(linea) + '\n', 'utf8')
  return { escrita: true, motivo: null }
}

// --- resolucion del tramo medido -------------------------------------------

// Si viene agentId, mide ese agente. Si viene solo sessionId (alcanza con un
// prefijo), mide esa sesion completa. Sin ninguno de los dos, falla: emitir
// el total de la maquina seria un dato sin sentido atribuido a un task.
function resolverTramo(vista, { sessionId, agentId }) {
  if (!agentId && !sessionId) {
    throw new Error(
      'construirLinea: hace falta sessionId o agentId para saber que tramo medir (nunca el total de la maquina).'
    )
  }

  const sesiones = aplanarSesiones(vista)

  if (agentId) {
    const candidatos = []
    for (const sesion of sesiones) {
      for (const agenteNodo of sesion.agentes ?? []) {
        if (agenteNodo.agentId === agentId || agenteNodo.agentId?.startsWith(agentId)) {
          candidatos.push({ sesion, agenteNodo })
        }
      }
    }
    if (candidatos.length === 0) {
      throw new Error(`construirLinea: no se encontro ningun agente que matchee agentId "${agentId}".`)
    }
    if (candidatos.length > 1) {
      throw new Error(`construirLinea: agentId "${agentId}" matchea ${candidatos.length} agentes distintos; se mas especifico.`)
    }
    const { sesion, agenteNodo } = candidatos[0]
    return {
      consumo: agenteNodo.consumo,
      // El agente ya trae un unico alias resuelto (domain/arbol.js): no hace
      // falta elegir "dominante", solo hay uno.
      modelo: agenteNodo.alias ?? null,
      effort: agenteNodo.effort ?? null,
      fuente: { sessionId: sesion.sessionId, agentId: agenteNodo.agentId, llamadas: agenteNodo.consumo.llamadas },
    }
  }

  const candidatas = sesiones.filter((sesion) => sesion.sessionId?.startsWith(sessionId))
  if (candidatas.length === 0) {
    throw new Error(`construirLinea: no se encontro ninguna sesion que empiece con "${sessionId}".`)
  }
  if (candidatas.length > 1) {
    throw new Error(`construirLinea: sessionId "${sessionId}" matchea ${candidatas.length} sesiones distintas; se mas especifico.`)
  }
  const sesion = candidatas[0]
  return {
    consumo: sesion.consumo,
    modelo: modeloDominante(sesion),
    effort: effortDominante(sesion),
    fuente: { sessionId: sesion.sessionId, agentId: null, llamadas: sesion.consumo.llamadas },
  }
}

function aplanarSesiones(vista) {
  const sesiones = []
  for (const proyecto of vista?.proyectos ?? []) {
    for (const sesion of proyecto.sesiones ?? []) sesiones.push(sesion)
  }
  return sesiones
}

// Alias dominante por tokens del tramo: sesion.porModelo ya viene ordenado
// descendente por volumen de tokens (materializarSesion en domain/arbol.js),
// asi que el dominante es simplemente el primero.
function modeloDominante(sesion) {
  return sesion.porModelo?.[0]?.alias ?? null
}

// SUPUESTO (no viene dado por la SKILL ni por VistaMonitor): el arbol no
// guarda un effort por sesion, solo por agente, y ahi es el ULTIMO valor
// visto en el tramo, no una distribucion (ver asegurarAgente en
// domain/arbol.js). Cuando se mide una sesion completa (sin agentId), se
// aproxima el "effort mas frecuente" con la moda de los efforts de sus
// sub-agentes. Una sesion sin sub-agentes no tiene de donde sacarlo: null,
// que es mas honesto que inventar un valor.
function effortDominante(sesion) {
  const conteo = new Map()
  for (const agenteNodo of sesion.agentes ?? []) {
    if (agenteNodo.effort == null) continue
    conteo.set(agenteNodo.effort, (conteo.get(agenteNodo.effort) ?? 0) + 1)
  }
  let mejor = null
  let max = 0
  for (const [effort, n] of conteo) {
    if (n > max) {
      max = n
      mejor = effort
    }
  }
  return mejor
}

function redondear4(n) {
  return Math.round(n * 10000) / 10000
}

function leerLineas(rutaJsonl) {
  const contenido = readIfExists(rutaJsonl)
  if (!contenido) return []
  const lineas = []
  for (const raw of contenido.split('\n')) {
    const t = raw.trim()
    if (!t) continue
    try {
      lineas.push(JSON.parse(t))
    } catch {
      // Linea corrupta: se ignora para el chequeo de idempotencia. Mejor un
      // falso "no duplicado" que un comando que no puede correr por una
      // linea vieja rota.
    }
  }
  return lineas
}
