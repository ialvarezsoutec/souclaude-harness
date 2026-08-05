import { esActivo } from '../domain/actividad.js'
import { fmtDinero } from '../domain/formato.js'

// Proyeccion dominio -> panel. `construirVista` (domain/arbol.js) produce el modelo
// canonico (arbol anidado, limites como objeto, recortes como {mostrados,total,...});
// `renderPanel` (panel-layout.js) consume una forma aplanada de presentacion. Este
// modulo es el unico puente entre las dos y no agrega ni un dato que el dominio no
// tenga: lo que no se puede derivar sale null o 0, nunca inventado.
//
// REGLA QUE NO SE NEGOCIA: totales, porcentajes y contadores se calculan sobre el
// conjunto COMPLETO que el dominio expone (vista.totales, vista.recortes.*.total),
// jamas sobre las filas visibles. Un total que solo suma lo que se ve convierte el
// panel en una mentira, y es el error mas dificil de detectar de todo el monitor.
//
// LIMITES CONOCIDOS DE DERIVACION (el dominio ya recorto y no conserva el detalle):
// - proyectos.filas[].sesiones es el conteo VISIBLE de cada proyecto: el conteo
//   previo al recorte por `top` no sobrevive a arbol.js.
// - sesiones.total sale de recortes.sesiones.total, que solo cuenta las sesiones de
//   los proyectos que quedaron visibles. Las de un proyecto recortado no estan en
//   ningun contador del dominio.
// - proyectos.otros.sesiones queda en 0 por la misma razon.

const TOKENS = ['entrada', 'salida', 'cacheCreacion', 'cacheLectura']

// `kind` de cada entrada de utilization.limits en ~/.claude.json. Sin entrada aca
// se cae al modelo, al grupo o al propio kind: nunca se inventa una etiqueta.
const ETIQUETAS_TIPO = {
  session: 'Sesion 5h',
  five_hour: 'Ventana 5h',
  seven_day: 'Ventana 7d',
  weekly: 'Semanal',
  weekly_all: 'Semanal total',
  weekly_scoped: 'Semanal',
  monthly: 'Mensual',
}

const MAX_AVISOS = 3

/**
 * Proyecta el modelo de dominio a la forma que espera `renderPanel`.
 * @param {object} vista  lo que devuelve construirVista()
 * @param {{ahora?: number, top?: number}} [opciones]
 * @returns {object} VistaMonitor de panel-layout.js
 */
export function presentar(vista, { ahora, top } = {}) {
  const v = vista ?? {}
  const instante = Number.isFinite(ahora) ? ahora : Number.isFinite(v.generadoEn) ? v.generadoEn : 0
  const corte = Number.isFinite(top) && top > 0 ? Math.floor(top) : null

  const totales = v.totales ?? null
  const proyectos = Array.isArray(v.proyectos) ? v.proyectos : []
  const sesiones = aplanarSesiones(proyectos)

  const recortes = normalizarRecortes(v.recortes)
  const sesionesVisibles = corte != null && sesiones.length > corte ? sesiones.slice(0, corte) : sesiones
  // Lo que se recorta aca se suma a lo que el dominio ya habia dejado fuera: la
  // linea "y N mas" del panel tiene que contar las dos causas, no una sola.
  recortes.sesiones += sesiones.length - sesionesVisibles.length

  return {
    ahora: instante,
    actualizadoEn: actualizadoEn(v, instante),
    limites: filasDeLimites(v.limites),
    agentes: seccionAgentes(v.agentesActivos, proyectos),
    consumo: seccionConsumo(v, totales),
    desglose: seccionDesglose(totales),
    modelos: seccionModelos(proyectos),
    sesiones: seccionSesiones(sesionesVisibles, sesiones, v.recortes),
    proyectos: seccionProyectos(proyectos, totales, v.recortes),
    recortes,
    avisos: seccionAvisos(v.avisos),
    // Llamadas cuyo modelo no esta en la tabla de precios: el pie las declara
    // para que el costo mostrado no se lea como el total.
    sinPrecio: numero(v.totales?.sinPrecio),
  }
}

// --- frescura ---

// El panel pinta "actualizado hace X" sobre este campo. Si los limites se leyeron
// antes que el ultimo tick (vienen cacheados por mtime+ttl), la edad honesta es la
// del dato MAS VIEJO: mentir sobre la frescura es peor que no mostrarla.
function actualizadoEn(v, instante) {
  const generado = Number.isFinite(v.generadoEn) ? v.generadoEn : instante
  const leidoEn = Number.isFinite(v.limites?.leidoEn) ? v.limites.leidoEn : null
  const edadMs = Number.isFinite(v.limites?.edadMs) ? v.limites.edadMs : null

  const porLectura = leidoEn ?? (edadMs != null ? generado - edadMs : null)
  if (porLectura == null || !(porLectura < generado)) return generado
  return porLectura
}

// --- limites ---

function filasDeLimites(limites) {
  if (!limites || typeof limites !== 'object') return []
  const filas = []

  agregarVentana(filas, limites.cincoHoras, 'Ventana 5h')
  agregarVentana(filas, limites.sieteDias, 'Ventana 7d')

  // cachedUsageUtilization publica el MISMO limite dos veces: una en
  // five_hour/seven_day y otra como entrada de limits[] (kind "session" y
  // "weekly_all"). Sin filtrar, el header gasta seis filas en cuatro datos, y
  // las filas del header son el espacio mas valioso del panel. Se descarta la
  // entrada de porGrupo que coincide en porcentaje Y en reseteaEn con una
  // ventana ya emitida: es el mismo limite, no dos.
  const yaEmitidos = filas.map((f) => `${f.porcentaje}|${f.reseteaEn}`)

  for (const g of Array.isArray(limites.porGrupo) ? limites.porGrupo : []) {
    if (!g || !Number.isFinite(g.porcentaje)) continue
    const reseteaEn = aEpoch(g.reseteaEn)
    if (yaEmitidos.includes(`${g.porcentaje}|${reseteaEn}`)) continue
    filas.push({
      etiqueta: etiquetaDeGrupo(g),
      modelo: g.modelo ?? null,
      porcentaje: g.porcentaje,
      reseteaEn,
    })
  }

  const extra = limites.gastoExtra
  if (extra && Number.isFinite(extra.porcentaje)) {
    filas.push({
      etiqueta: `Extra ${fmtDinero(extra.usadoUsd ?? 0)}/${fmtDinero(extra.limiteUsd ?? 0)}`,
      modelo: null,
      porcentaje: extra.porcentaje,
      reseteaEn: null,
    })
  }

  // El peor caso arriba, siempre. El panel vuelve a ordenar por su cuenta, pero el
  // orden es parte del contrato de esta proyeccion y no de la suya.
  return filas.sort((a, b) => b.porcentaje - a.porcentaje)
}

function agregarVentana(filas, ventana, etiqueta) {
  if (!ventana || !Number.isFinite(ventana.porcentaje)) return
  filas.push({
    etiqueta,
    modelo: null,
    porcentaje: ventana.porcentaje,
    reseteaEn: aEpoch(ventana.reseteaEn),
  })
}

function etiquetaDeGrupo(g) {
  const base = ETIQUETAS_TIPO[g.tipo] ?? null
  if (base && g.modelo) return `${base} ${g.modelo}`
  if (base) return base
  if (g.modelo) return g.modelo
  if (g.grupo) return String(g.grupo)
  return g.tipo ? String(g.tipo) : 'limite'
}

// resets_at puede llegar como epoch ms o como ISO. El panel solo entiende numeros.
function aEpoch(valor) {
  if (typeof valor === 'number' && Number.isFinite(valor)) return valor
  if (typeof valor === 'string') {
    const t = Date.parse(valor)
    return Number.isFinite(t) ? t : null
  }
  return null
}

// --- agentes ---

function seccionAgentes(agentesActivos, proyectos) {
  const titulos = titulosPorSesion(proyectos)
  const lista = Array.isArray(agentesActivos) ? agentesActivos : []

  const filas = lista.map((a) => ({
    nombre: a.tipo ?? null,
    proyecto: a.proyecto ?? null,
    modelo: a.alias ?? null,
    descripcion: a.descripcion ?? null,
    estado: a.estado ?? null,
    tokens: tokensDe(a.consumo),
    duracionMs: a.duracionMs ?? null,
    // El harness solo cuenta tools en el cierre del subagente: sin cierre, no hay
    // dato. null y no 0 — 0 seria afirmar que no uso ninguna.
    tools: a.cierre?.totalToolUseCount ?? null,
    sesionId: idCorto(a.sessionId, 8),
    sesionTitulo: titulos.get(a.sessionId) ?? null,
    finEn: null,
  }))

  // agentesActivos se aplana del arbol COMPLETO antes de recortar (ver arbol.js) y
  // solo contiene corriendo/en_duda: los terminados no llegan hasta aca.
  return {
    corriendo: filas.filter((f) => f.estado === 'corriendo' || f.estado === 'en_duda').length,
    terminados: filas.filter((f) => f.estado === 'terminado').length,
    filas,
  }
}

function titulosPorSesion(proyectos) {
  const mapa = new Map()
  for (const p of proyectos) {
    for (const s of p.sesiones ?? []) {
      if (s?.sessionId && s.titulo) mapa.set(s.sessionId, s.titulo)
    }
  }
  return mapa
}

// --- consumo / desglose / modelos ---

function seccionConsumo(v, totales) {
  const serieHoraria = Array.isArray(v.serieHoraria) ? v.serieHoraria : []
  const serie = serieHoraria.map((b) => numero(b?.tokens))

  let pico = null
  for (const b of serieHoraria) {
    if (pico == null || numero(b?.tokens) > numero(pico.tokens)) pico = b
  }

  return {
    etiquetaVentana: etiquetaDeVentana(v.ventana),
    unidad: 'tokens/h',
    serie,
    picoValor: pico ? numero(pico.tokens) : null,
    picoEtiqueta: pico && Number.isFinite(pico.hora) ? `${String(pico.hora).padStart(2, '0')}:00` : null,
    totalTokens: tokensDe(totales),
    costoUsd: numero(totales?.costoUsd),
  }
}

function etiquetaDeVentana(ventana) {
  const etiqueta = ventana?.etiqueta
  if (typeof etiqueta !== 'string' || etiqueta === '') return null
  return etiqueta === 'all' ? 'todo el historico' : `ultimas ${etiqueta}`
}

function seccionDesglose(totales) {
  return {
    entrada: numero(totales?.entrada),
    salida: numero(totales?.salida),
    cacheCreacion: numero(totales?.cacheCreacion),
    cacheLectura: numero(totales?.cacheLectura),
  }
}

// Agrega el porModelo de todas las sesiones del arbol visible. El dominio no
// conserva un porModelo global, asi que este es el conjunto mas completo disponible.
function seccionModelos(proyectos) {
  const porAlias = new Map()

  for (const p of proyectos) {
    for (const s of p.sesiones ?? []) {
      for (const m of s.porModelo ?? []) {
        const alias = m?.alias ?? 'desconocido'
        const acc = porAlias.get(alias) ?? { nombre: alias, tokens: 0, costoUsd: 0 }
        acc.tokens += tokensDe(m?.consumo)
        acc.costoUsd += numero(m?.consumo?.costoUsd)
        porAlias.set(alias, acc)
      }
    }
  }

  const lista = [...porAlias.values()].sort((a, b) => b.tokens - a.tokens)
  const total = lista.reduce((acc, m) => acc + m.tokens, 0)
  return lista.map((m) => ({ ...m, share: total > 0 ? (m.tokens / total) * 100 : 0 }))
}

// --- sesiones ---

function aplanarSesiones(proyectos) {
  const filas = []
  for (const p of proyectos) {
    for (const s of p.sesiones ?? []) {
      filas.push({
        id: idCorto(s.sessionId, 4),
        titulo: s.titulo ?? null,
        proyecto: p.nombre ?? null,
        rama: s.rama ?? null,
        modelo: s.porModelo?.[0]?.alias ?? null,
        tokens: tokensDe(s.consumo),
        costoUsd: numero(s.consumo?.costoUsd),
        ultimaActividad: s.ultimoTs ?? null,
        estado: s.estado ?? null,
      })
    }
  }
  // Las activas primero: una sesion viva nunca puede quedar tapada por una muerta
  // con mas tokens. Mismo criterio que usa arbol.js dentro de cada proyecto.
  return filas.sort((a, b) => {
    const va = esActivo(a.estado) ? 1 : 0
    const vb = esActivo(b.estado) ? 1 : 0
    return vb - va || b.tokens - a.tokens
  })
}

function seccionSesiones(visibles, todas, recortesDominio) {
  // El conjunto completo que el dominio conoce: las sesiones de los proyectos
  // visibles. `todas` (el aplanado) puede ser menor si arbol.js ya recorto.
  const totalDominio = numero(recortesDominio?.sesiones?.total)
  const total = Math.max(totalDominio, todas.length)
  return {
    total,
    vivas: todas.filter((s) => esActivo(s.estado)).length,
    filas: visibles,
  }
}

// --- proyectos ---

function seccionProyectos(proyectos, totales, recortesDominio) {
  // El denominador del % es SIEMPRE el total del universo, no la suma de las filas.
  const totalTokens = tokensDe(totales)

  const filas = proyectos.map((p) => ({
    nombre: p.nombre ?? null,
    sesiones: (p.sesiones ?? []).length,
    tokens: tokensDe(p.consumo),
    costoUsd: numero(p.consumo?.costoUsd),
    porcentaje: totalTokens > 0 ? (tokensDe(p.consumo) / totalTokens) * 100 : 0,
  }))

  const recorte = recortesDominio?.proyectos ?? null
  const cantidadOtros = Math.max(0, numero(recorte?.total) - numero(recorte?.mostrados))
  const otros =
    cantidadOtros > 0
      ? {
          cantidad: cantidadOtros,
          // El dominio no conserva cuantas sesiones se fueron con los proyectos
          // recortados. 0 es honesto; un numero inventado no lo seria.
          sesiones: 0,
          tokens: tokensDe(recorte?.consumoOtros),
          costoUsd: numero(recorte?.consumoOtros?.costoUsd),
        }
      : null

  return {
    total: Math.max(numero(recorte?.total), filas.length),
    totalTokens,
    filas,
    otros,
  }
}

// --- recortes / avisos ---

// El panel espera NUMEROS (cuantos quedaron fuera), el dominio guarda
// {mostrados, total, consumoOtros} por contenedor.
function normalizarRecortes(recortes) {
  const fuera = (r) => Math.max(0, numero(r?.total) - numero(r?.mostrados))
  return {
    proyectos: fuera(recortes?.proyectos),
    sesiones: fuera(recortes?.sesiones),
    agentes: fuera(recortes?.agentes),
  }
}

// Los avisos del snapshot son {file, reason}; el panel pinta strings. Se deduplican
// porque un directorio ilegible genera el mismo aviso en cada tick.
function seccionAvisos(avisos) {
  const lista = Array.isArray(avisos) ? avisos : []
  const vistos = new Set()

  for (const a of lista) {
    const texto = typeof a === 'string' ? a : formatearAviso(a)
    if (texto) vistos.add(texto)
  }

  const salida = [...vistos]
  if (salida.length <= MAX_AVISOS) return salida
  const extra = salida.length - MAX_AVISOS
  return [...salida.slice(0, MAX_AVISOS), `y ${extra} aviso(s) mas`]
}

function formatearAviso(a) {
  if (!a || typeof a !== 'object') return null
  const razon = a.reason ?? a.razon ?? null
  const archivo = a.file ?? a.archivo ?? null
  if (razon && archivo) return `${razon}: ${nombreDeRuta(archivo)}`
  return razon ?? (archivo ? String(archivo) : null)
}

// --- utilidades ---

function tokensDe(consumo) {
  if (!consumo || typeof consumo !== 'object') return 0
  let total = 0
  for (const campo of TOKENS) total += numero(consumo[campo])
  return total
}

function numero(v) {
  return Number.isFinite(v) ? v : 0
}

function idCorto(id, largo) {
  if (typeof id !== 'string' || id === '') return null
  return id.slice(0, largo)
}

function nombreDeRuta(ruta) {
  if (typeof ruta !== 'string' || ruta === '') return ''
  const limpio = ruta.replace(/[/\\]+$/, '')
  const corte = Math.max(limpio.lastIndexOf('/'), limpio.lastIndexOf('\\'))
  return corte === -1 ? limpio : limpio.slice(corte + 1)
}
