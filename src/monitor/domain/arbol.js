// Dominio puro: arma el arbol agregado que consume el panel (proyecto ->
// sesion -> agente) a partir del snapshot crudo que recolectan los adaptadores.
// Solo imports relativos dentro de este mismo directorio: nada de node:* ni de
// paquetes. Determinista: el instante entra por opciones.ahora, nunca Date.now().

import { vacio, sumar, fusionar } from './consumo.js'
import { resolverAlias } from './precios.js'
import { construirVentana, filtrarPorVentana, bucketsHorarios, ritmo } from './ventanas.js'
import { clasificarAgente, clasificarSesion, esActivo } from './actividad.js'
import { estadoDelExtra } from './gasto-extra.js'

// DEDUPLICACION: es responsabilidad EXCLUSIVA del tailer (adapters/jsonl-tailer.js,
// via crearDeduplicador() de consumo.js), que mantiene un deduplicador por archivo.
// Aca se asume que snapshot.eventos ya viene limpio y NO se vuelve a deduplicar.
// Si alguna vez hace falta moverla, se mueve — pero nunca puede quedar en los dos
// lados (sobrecosto y falsa sensacion de red) ni desaparecer de ambos.

const ORDENES = new Set(['tokens', 'costo', 'reciente'])

export function construirVista(snapshot = {}, opciones = {}) {
  const ahora = opciones.ahora
  if (typeof ahora !== 'number' || !Number.isFinite(ahora)) {
    throw new Error('construirVista necesita opciones.ahora (epoch ms): este modulo nunca lee el reloj.')
  }

  const ventana = normalizarVentana(opciones.ventana, ahora)
  const orden = ORDENES.has(opciones.orden) ? opciones.orden : 'tokens'
  const top = normalizarTop(opciones.top)
  const filtros = opciones.filtros ?? {}

  const eventos = snapshot.eventos ?? []
  const titulos = snapshot.titulos ?? []
  const cierres = snapshot.cierres ?? []
  const metas = snapshot.metas ?? []
  const archivos = snapshot.archivos ?? []
  const vivos = snapshot.vivos ?? []

  const indices = construirIndices({ titulos, cierres, metas, archivos, vivos })
  const enVentana = filtrarPorVentana(eventos, ventana)

  // Donde vive cada sesion. El cwd sale del evento; si la sesion todavia no
  // escribio nada, del proceso vivo. El slug es el ultimo recurso: NO es
  // reversible a ruta (espacios y acentos colapsan a "-"), asi que solo sirve
  // como clave de agrupacion, nunca como ruta.
  const ubicaciones = resolverUbicaciones({ enVentana, vivos, indices })

  // Los filtros de opciones.filtros acotan el UNIVERSO de datos (no son un
  // filtro de presentacion): si el usuario pide un proyecto, los totales son de
  // ese proyecto. `top`, en cambio, jamas toca este universo — ver mas abajo.
  const pasa = (sessionId) => sesionPasaFiltros(sessionId, ubicaciones, filtros)
  const universo = enVentana.filter((evento) => pasa(evento.sessionId))

  // TOTALES sobre TODOS los eventos del universo, antes de armar el arbol y muy
  // antes de aplicar `top`. Un total que solo suma las filas visibles convierte
  // el panel en una mentira; por eso se calcula aca y no reduciendo el arbol ya
  // recortado.
  const totales = universo.reduce((acc, evento) => sumar(acc, evento, { ahora }), vacio())

  const sesiones = agruparSesiones({ universo, vivos, indices, ubicaciones, ahora, pasa })
  const proyectos = agruparProyectos({ sesiones, ubicaciones })

  // agentesActivos se aplana del arbol COMPLETO, antes de recortar: si hay 12
  // agentes corriendo, eso es la noticia. Quien decide colapsar es el renderer.
  const agentesActivos = aplanarActivos(proyectos)

  const { visibles, recortes } = recortarArbol(proyectos, { orden, top })

  const { limites, historico } = conHistoricoDeExtra(snapshot.limites ?? null, snapshot.registroExtra, ahora)

  return {
    generadoEn: ahora,
    ventana,
    limites,
    totales,
    ritmo: ritmo(universo, ahora, 5),
    serieHoraria: bucketsHorarios(universo, ventana),
    proyectos: visibles,
    agentesActivos,
    vivos,
    avisos: snapshot.avisos ?? [],
    recortes,
    historico,
  }
}

// --- historico del gasto extra (SHS-H3-T105) -------------------------------

// Decide si el gasto extra vigente ya paso a 'historico' (24h desde que se
// detecto alcanzado, ver gasto-extra.js::estadoDelExtra) y arma vista.historico
// a partir del registro persistido (snapshot.registroExtra, que agrega
// adapters/snapshot-source.js leyendo adapters/usage-history.js). La decision
// vive ACA, en el modelo canonico, para que --json (plain-renderer.js::renderJson,
// que expone este modelo sin transformar) herede el campo gratis, sin que
// panel-presenter.js tenga que reimplementar la regla ni abrir una segunda ruta
// de datos que pueda divergir con el tiempo.
function conHistoricoDeExtra(limites, registroExtra, ahora) {
  if (!limites || typeof limites !== 'object' || !limites.gastoExtra) {
    return { limites, historico: [] }
  }

  const abierto = registroExtra?.abierto ?? null
  const esHistorico =
    estadoDelExtra({ alcanzado: limites.gastoExtra.alcanzado, detectadoEn: abierto?.detectadoEn }, ahora) === 'historico'

  const historico =
    esHistorico && abierto
      ? [{ usado: abierto.usado, limite: abierto.limite, moneda: abierto.moneda ?? 'USD', detectadoEn: abierto.detectadoEn }]
      : []

  return {
    limites: { ...limites, gastoExtra: { ...limites.gastoExtra, historico: esHistorico } },
    historico,
  }
}

// --- normalizacion de opciones -------------------------------------------

// Acepta la ventana ya construida (la que devuelve construirVentana) o la
// etiqueta cruda ("6h", "all"). Sin ventana, 24h.
function normalizarVentana(ventana, ahora) {
  if (ventana && typeof ventana === 'object' && typeof ventana.desde === 'number') return ventana
  return construirVentana(typeof ventana === 'string' && ventana !== '' ? ventana : '24h', ahora)
}

function normalizarTop(top) {
  if (typeof top !== 'number' || !Number.isFinite(top) || top <= 0) return null
  return Math.floor(top)
}

// --- indices del snapshot -------------------------------------------------

function construirIndices({ titulos, cierres, metas, archivos, vivos }) {
  const tituloPorSesion = new Map()
  for (const t of titulos) if (t?.sessionId) tituloPorSesion.set(t.sessionId, t.titulo)

  const cierrePorAgente = new Map()
  for (const c of cierres) if (c?.agentId) cierrePorAgente.set(c.agentId, c)

  const metaPorAgente = new Map()
  for (const m of metas) if (m?.agentId) metaPorAgente.set(m.agentId, m)

  // Un pid muerto que no limpio su json convive con el vivo de la misma sesion:
  // gana siempre el que tiene procesoVivo true.
  const vivoPorSesion = new Map()
  for (const v of vivos) {
    if (!v?.sessionId) continue
    const previo = vivoPorSesion.get(v.sessionId)
    if (!previo || (v.procesoVivo === true && previo.procesoVivo !== true)) vivoPorSesion.set(v.sessionId, v)
  }

  const archivoSesion = new Map()
  const archivoAgente = new Map()
  for (const a of archivos) {
    if (a?.kind === 'subagent' && a.agentId) {
      const previo = archivoAgente.get(a.agentId)
      if (!previo || a.mtimeMs > previo.mtimeMs) archivoAgente.set(a.agentId, a)
      continue
    }
    if (!a?.sessionId) continue
    const previo = archivoSesion.get(a.sessionId)
    if (!previo || a.mtimeMs > previo.mtimeMs) archivoSesion.set(a.sessionId, a)
  }

  return { tituloPorSesion, cierrePorAgente, metaPorAgente, vivoPorSesion, archivoSesion, archivoAgente }
}

function resolverUbicaciones({ enVentana, vivos, indices }) {
  const ubicaciones = new Map()

  const asegurar = (sessionId) => {
    if (!ubicaciones.has(sessionId)) {
      const archivo = indices.archivoSesion.get(sessionId)
      ubicaciones.set(sessionId, { cwd: null, slug: archivo?.slug ?? null })
    }
    return ubicaciones.get(sessionId)
  }

  for (const evento of enVentana) {
    if (!evento.sessionId) continue
    const u = asegurar(evento.sessionId)
    if (u.cwd == null && evento.cwd) u.cwd = evento.cwd
  }

  for (const v of vivos) {
    if (!v?.sessionId) continue
    const u = asegurar(v.sessionId)
    if (u.cwd == null && v.cwd) u.cwd = v.cwd
  }

  return ubicaciones
}

function sesionPasaFiltros(sessionId, ubicaciones, filtros) {
  if (filtros.sesion && !contiene(sessionId, filtros.sesion)) return false
  if (!filtros.proyecto) return true

  const u = ubicaciones.get(sessionId) ?? { cwd: null, slug: null }
  return (
    contiene(u.cwd, filtros.proyecto) ||
    contiene(u.slug, filtros.proyecto) ||
    contiene(nombreDeRuta(u.cwd), filtros.proyecto)
  )
}

function contiene(valor, aguja) {
  if (typeof valor !== 'string') return false
  return valor.toLowerCase().includes(String(aguja).toLowerCase())
}

// --- sesiones y agentes ---------------------------------------------------

function agruparSesiones({ universo, vivos, indices, ubicaciones, ahora, pasa }) {
  const borradores = new Map()

  const asegurar = (sessionId) => {
    let s = borradores.get(sessionId)
    if (!s) {
      s = {
        sessionId,
        rama: null,
        consumo: vacio(),
        porModelo: new Map(),
        agentes: new Map(),
      }
      borradores.set(sessionId, s)
    }
    return s
  }

  for (const evento of universo) {
    const s = asegurar(evento.sessionId)
    if (evento.rama) s.rama = evento.rama

    sumar(s.consumo, evento, { ahora })

    const alias = resolverAlias(evento.modeloId)
    if (!s.porModelo.has(alias)) s.porModelo.set(alias, vacio())
    sumar(s.porModelo.get(alias), evento, { ahora })

    // agentId null es la sesion principal, no un agente: su consumo ya entro en
    // el de la sesion y no debe generar una fila en `agentes`.
    if (evento.agentId == null) continue

    const a = asegurarAgente(s, evento.agentId, indices)
    if (evento.modeloId) a.modeloId = evento.modeloId
    if (evento.effort != null) a.effort = evento.effort
    if (a.tipo == null && evento.tipoAgente) a.tipoDelEvento = evento.tipoAgente
    sumar(a.consumo, evento, { ahora })
  }

  // Sesiones vivas que todavia no escribieron ningun evento en la ventana:
  // existen para el panel aunque su consumo sea cero.
  for (const v of vivos) {
    if (!v?.sessionId || v.procesoVivo !== true) continue
    if (!pasa(v.sessionId)) continue
    asegurar(v.sessionId)
  }

  // Un subagente recien lanzado puede tener su transcript creado sin una sola
  // respuesta todavia. Solo se agrega si su sesion padre ya esta en el arbol:
  // sin eso no habria de donde sacar proyecto ni cwd.
  for (const [agentId, archivo] of indices.archivoAgente) {
    const s = borradores.get(archivo.sessionId)
    if (!s || s.agentes.has(agentId)) continue
    asegurarAgente(s, agentId, indices)
  }

  const sesiones = []
  for (const s of borradores.values()) {
    sesiones.push(materializarSesion(s, { indices, ubicaciones, ahora }))
  }
  return sesiones
}

function asegurarAgente(sesion, agentId, indices) {
  let a = sesion.agentes.get(agentId)
  if (!a) {
    const meta = indices.metaPorAgente.get(agentId) ?? null
    const cierre = indices.cierrePorAgente.get(agentId) ?? null
    a = {
      agentId,
      // Preferencia de tipo: el .meta.json es el dato mas confiable y siempre
      // esta; despues el cierre; y recien al final el attributionAgent del evento.
      tipo: meta?.agentType ?? cierre?.agentType ?? null,
      tipoDelEvento: null,
      descripcion: meta?.description ?? null, // solo existe en el .meta.json
      modeloId: cierre?.resolvedModel ?? null,
      effort: null,
      consumo: vacio(),
      cierre,
    }
    sesion.agentes.set(agentId, a)
  }
  return a
}

function materializarSesion(borrador, { indices, ubicaciones, ahora }) {
  const { sessionId } = borrador
  const vivo = indices.vivoPorSesion.get(sessionId) ?? null
  const pidVivo = vivo?.procesoVivo === true
  const archivo = indices.archivoSesion.get(sessionId) ?? null
  const ubicacion = ubicaciones.get(sessionId) ?? { cwd: null, slug: null }

  // La ultima senal de escritura de la sesion: el mtime del jsonl si lo hay, y
  // si no el ts del ultimo evento visto. Ultimo recurso, el arranque del proceso
  // vivo: una sesion recien abierta que todavia no escribio nada no puede
  // clasificarse como terminada solo por no tener senales.
  const mtimeMs = maximo(archivo?.mtimeMs ?? null, borrador.consumo.ultimoTs) ?? vivo?.startedAt ?? null

  const agentes = [...borrador.agentes.values()]
    .map((a) => materializarAgente(a, { indices, ahora, pidVivo }))
    .sort((x, y) => (y.ultimoTs ?? 0) - (x.ultimoTs ?? 0))

  const porModelo = [...borrador.porModelo.entries()]
    .map(([alias, consumo]) => ({ alias, consumo }))
    .sort((x, y) => tokensDe(y.consumo) - tokensDe(x.consumo))

  return {
    sessionId,
    titulo: indices.tituloPorSesion.get(sessionId) ?? null,
    rama: borrador.rama,
    cwd: ubicacion.cwd,
    inicio: borrador.consumo.primerTs ?? vivo?.startedAt ?? null,
    ultimoTs: borrador.consumo.ultimoTs,
    estado: clasificarSesion({ mtimeMs: mtimeMs ?? -Infinity }, { ahora, pidVivo }),
    pid: vivo?.pid ?? null,
    entrypoint: vivo?.entrypoint ?? null,
    consumo: borrador.consumo,
    porModelo,
    agentes,
  }
}

function materializarAgente(borrador, { indices, ahora, pidVivo }) {
  const { consumo, cierre } = borrador
  const archivo = indices.archivoAgente.get(borrador.agentId) ?? null
  const ultimoTs = consumo.ultimoTs ?? archivo?.mtimeMs ?? null
  const tieneCierre = cierre != null

  // El totalDurationMs del cierre es el dato real medido por el harness: le gana
  // a la resta de timestamps, que solo ve las respuestas con usage.
  const duracionMedida = cierre?.totalDurationMs > 0 ? cierre.totalDurationMs : null
  const duracionObservada =
    consumo.primerTs != null && consumo.ultimoTs != null ? consumo.ultimoTs - consumo.primerTs : null

  const modeloId = borrador.modeloId
  return {
    agentId: borrador.agentId,
    tipo: borrador.tipo ?? borrador.tipoDelEvento ?? null,
    descripcion: borrador.descripcion,
    modeloId,
    alias: resolverAlias(modeloId),
    effort: borrador.effort,
    inicio: consumo.primerTs,
    ultimoTs,
    duracionMs: duracionMedida ?? duracionObservada,
    // Un agente hereda el pidVivo de su sesion padre: no tiene proceso propio.
    estado: clasificarAgente({ ultimoTs: ultimoTs ?? -Infinity, tieneCierre }, { ahora, pidVivo }),
    consumo,
    cierre,
  }
}

// --- proyectos ------------------------------------------------------------

// La clave de agrupacion es el cwd, NUNCA el slug: dos rutas distintas pueden
// colapsar al mismo slug. Sin cwd (ni en los eventos ni en los procesos vivos)
// se cae al slug y la ruta queda explicitamente en null.
//
// El cwd se normaliza antes de usarlo como clave: Claude Code escribe a veces
// "C:\Users\..." y a veces "c:\Users\..." para el MISMO proyecto, y sin
// normalizar el panel lo muestra dos veces con el consumo partido a la mitad.
// Se conserva la primera forma vista como `ruta`; solo la clave se normaliza.
function normalizarClaveDeRuta(cwd) {
  if (typeof cwd !== 'string' || cwd === '') return null
  return cwd.replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase()
}

function agruparProyectos({ sesiones, ubicaciones }) {
  const porClave = new Map()

  for (const sesion of sesiones) {
    const ubicacion = ubicaciones.get(sesion.sessionId) ?? { cwd: null, slug: null }
    const clave = normalizarClaveDeRuta(ubicacion.cwd) ?? ubicacion.slug ?? sesion.sessionId
    let p = porClave.get(clave)
    if (!p) {
      p = {
        slug: ubicacion.slug ?? null,
        ruta: ubicacion.cwd ?? null,
        nombre: nombreDeRuta(ubicacion.cwd) ?? ubicacion.slug ?? sesion.sessionId,
        consumo: vacio(),
        sesiones: [],
      }
      porClave.set(clave, p)
    }
    if (p.slug == null && ubicacion.slug) p.slug = ubicacion.slug
    p.consumo = fusionar(p.consumo, sesion.consumo)
    p.sesiones.push(sesion)
  }

  return [...porClave.values()]
}

function aplanarActivos(proyectos) {
  const activos = []
  for (const p of proyectos) {
    for (const s of p.sesiones) {
      for (const a of s.agentes) {
        if (!esActivo(a.estado)) continue
        // proyecto y sessionId denormalizados: el renderer no deberia tener que
        // navegar el arbol para pintar la seccion AHORA.
        activos.push({ ...a, proyecto: p.nombre, sessionId: s.sessionId })
      }
    }
  }
  return activos.sort((x, y) => (y.ultimoTs ?? 0) - (x.ultimoTs ?? 0))
}

// --- orden y recorte ------------------------------------------------------

function comparadorDe(orden) {
  if (orden === 'costo') return (x, y) => y.consumo.costoUsd - x.consumo.costoUsd
  if (orden === 'reciente') return (x, y) => (y.consumo.ultimoTs ?? -Infinity) - (x.consumo.ultimoTs ?? -Infinity)
  return (x, y) => tokensDe(y.consumo) - tokensDe(x.consumo)
}

// `top` es PRESENTACION: recorta filas visibles y anota lo dejado afuera en
// `recortes`, pero no toca `totales` (ya calculado) ni `agentesActivos`.
// Los recortes de sesiones y agentes se cuentan dentro de los contenedores que
// si quedaron visibles; lo que se fue con un proyecto recortado ya esta
// representado en recortes.proyectos.consumoOtros.
function recortarArbol(proyectos, { orden, top }) {
  const comparar = comparadorDe(orden)
  const recortes = {
    proyectos: nuevoRecorte(),
    sesiones: nuevoRecorte(),
    agentes: nuevoRecorte(),
  }

  const ordenados = [...proyectos].sort(comparar)
  const corteProyectos = recortar(ordenados, top)
  anotar(recortes.proyectos, corteProyectos)

  const visibles = corteProyectos.mostrados.map((p) => {
    // Una sesion viva nunca puede quedar tapada por una muerta con mas tokens.
    const sesionesOrdenadas = [...p.sesiones].sort((x, y) => {
      const activoX = esActivo(x.estado) ? 1 : 0
      const activoY = esActivo(y.estado) ? 1 : 0
      return activoY - activoX || comparar(x, y)
    })
    const corteSesiones = recortar(sesionesOrdenadas, top)
    anotar(recortes.sesiones, corteSesiones)

    const sesiones = corteSesiones.mostrados.map((s) => {
      const corteAgentes = recortar([...s.agentes].sort(comparar), top)
      anotar(recortes.agentes, corteAgentes)
      return { ...s, agentes: corteAgentes.mostrados }
    })

    return { ...p, sesiones }
  })

  return { visibles, recortes }
}

function nuevoRecorte() {
  return { mostrados: 0, total: 0, consumoOtros: vacio() }
}

function recortar(lista, top) {
  if (top == null || lista.length <= top) return { mostrados: lista, cortados: [] }
  return { mostrados: lista.slice(0, top), cortados: lista.slice(top) }
}

// consumoOtros es la fusion de lo recortado: con el, los porcentajes por
// proyecto siguen sumando 100 aunque el panel muestre solo los primeros.
function anotar(recorte, { mostrados, cortados }) {
  recorte.mostrados += mostrados.length
  recorte.total += mostrados.length + cortados.length
  for (const item of cortados) recorte.consumoOtros = fusionar(recorte.consumoOtros, item.consumo)
}

// --- utilidades -----------------------------------------------------------

// Mismo criterio que ventanas.js: volumen total movido. cache1h y cache5m son
// el desglose de cacheCreacion, no tokens adicionales.
function tokensDe(consumo) {
  return consumo.entrada + consumo.salida + consumo.cacheCreacion + consumo.cacheLectura
}

// basename sin node:path (el dominio no importa nada de node). Soporta / y \
// porque el cwd puede venir de Windows.
function nombreDeRuta(ruta) {
  if (typeof ruta !== 'string' || ruta === '') return null
  const limpio = ruta.replace(/[/\\]+$/, '')
  if (limpio === '') return null
  const corte = Math.max(limpio.lastIndexOf('/'), limpio.lastIndexOf('\\'))
  return corte === -1 ? limpio : limpio.slice(corte + 1)
}

function maximo(a, b) {
  if (a == null) return b
  if (b == null) return a
  return Math.max(a, b)
}
