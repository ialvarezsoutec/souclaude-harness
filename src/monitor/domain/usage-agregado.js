// Agregacion PURA del registro de consumo por sesion del Vault
// (00-System/monitor/usage/*.jsonl, ADR 20260820). Recibe registros v1 ya
// parseados (adapters/vault-usage-reader.js) y responde la pregunta del
// milestone SHS-M2: cuanto consumio cada cuenta, contribuyente, proyecto y
// sesion en un periodo. SHS-M3 monta sus vistas encima: el agregado conserva
// el desglose 4-way y porModelo, agrupa ademas por milestone y por dia (serie
// diaria) y acepta filtros de proyecto, quien y cuenta.
//
// Convencion de la casa: tokensIn = entrada + cacheCreacion + cacheLectura.

/**
 * Deduplica, filtra y agrega registros v1.
 * @param {object[]} registros registros v1 (posiblemente con duplicados por sessionId)
 * @param {{desde?: number|null, hasta?: number|null, proyecto?: string|null, quien?: string|null, cuenta?: string|null}} [opciones]
 *   desde/hasta: limites en ms epoch sobre el fin de la sesion.
 *   proyecto/quien/cuenta: filtros exactos sin distinguir mayusculas; cuenta
 *   matchea alias o uuid.
 * @returns {{totales: object, porCuenta: object[], porQuien: object[], porProyecto: object[], porMaquina: object[], porMilestone: object[], porDia: object[], porModelo: object[], sesiones: object[]}}
 */
export function agregarUsage(registros, { desde = null, hasta = null, proyecto = null, quien = null, cuenta = null } = {}) {
  const sesiones = deduplicar(registros)
    .filter((r) => enPeriodo(r, desde, hasta))
    .map(materializar)
    .filter((s) => pasaFiltros(s, { proyecto, quien, cuenta }))
    .sort((a, b) => b.tokensIn - a.tokensIn)

  return {
    totales: totalesDe(sesiones),
    porCuenta: agrupar(sesiones, (s) => s.cuentaAlias ?? s.cuentaUuid ?? 'n/d'),
    porQuien: agrupar(sesiones, (s) => s.quien ?? 'n/d'),
    porProyecto: agrupar(sesiones, (s) => s.proyecto ?? 'n/d'),
    porMaquina: agrupar(sesiones, (s) => s.maquina ?? 'n/d'),
    porMilestone: agrupar(sesiones, (s) => s.milestone ?? 'n/d'),
    porDia: serieDiaria(sesiones),
    porModelo: agruparPorModelo(sesiones),
    sesiones,
  }
}

// Una sesion reeditada (linea previa editada a mano + linea nueva del
// publisher) puede aparecer mas de una vez: gana el generadoEn mas nuevo, y a
// igual fecha el de mas tokens (el registro solo crece).
function deduplicar(registros) {
  const porSesion = new Map()
  for (const r of registros ?? []) {
    if (typeof r?.sessionId !== 'string' || r.sessionId === '') continue
    const previo = porSesion.get(r.sessionId)
    if (!previo || esMasNuevo(r, previo)) porSesion.set(r.sessionId, r)
  }
  return [...porSesion.values()]
}

function esMasNuevo(a, b) {
  const ta = Date.parse(a.generadoEn ?? '') || 0
  const tb = Date.parse(b.generadoEn ?? '') || 0
  if (ta !== tb) return ta > tb
  return tokensDe(a) > tokensDe(b)
}

function tokensDe(r) {
  const t = r?.tokens ?? {}
  return (t.entrada ?? 0) + (t.cacheCreacion ?? 0) + (t.cacheLectura ?? 0) + (t.salida ?? 0)
}

function enPeriodo(r, desde, hasta) {
  const ts = Date.parse(r.fin ?? r.inicio ?? r.generadoEn ?? '')
  if (!Number.isFinite(ts)) return desde == null && hasta == null
  if (desde != null && ts < desde) return false
  if (hasta != null && ts > hasta) return false
  return true
}

function materializar(r) {
  const t = r.tokens ?? {}
  const desglose = {
    entrada: t.entrada ?? 0,
    salida: t.salida ?? 0,
    cacheCreacion: t.cacheCreacion ?? 0,
    cacheLectura: t.cacheLectura ?? 0,
  }
  return {
    sessionId: r.sessionId,
    fecha: typeof r.fin === 'string' ? r.fin.slice(0, 10) : null,
    inicio: typeof r.inicio === 'string' ? r.inicio : null,
    fin: typeof r.fin === 'string' ? r.fin : null,
    generadoEn: typeof r.generadoEn === 'string' ? r.generadoEn : null,
    proyecto: r.proyecto ?? null,
    rama: r.rama ?? null,
    milestone: r.milestone ?? null,
    quien: r.quien ?? null,
    cuentaUuid: r.cuenta?.uuid ?? null,
    cuentaAlias: r.cuenta?.alias ?? null,
    maquina: r.maquina?.hostname ?? r.maquina?.machineID ?? null,
    tokensIn: desglose.entrada + desglose.cacheCreacion + desglose.cacheLectura,
    tokensOut: desglose.salida,
    desglose,
    porModelo: modelosDe(r),
    costoUsd: r.costoUsd ?? 0,
    llamadas: r.llamadas ?? 0,
  }
}

function modelosDe(r) {
  if (!Array.isArray(r.porModelo)) return []
  return r.porModelo
    .filter((m) => typeof m?.alias === 'string' && m.alias !== '')
    .map((m) => ({
      alias: m.alias,
      tokensIn: m.tokensIn ?? 0,
      tokensOut: m.tokensOut ?? 0,
      costoUsd: m.costoUsd ?? 0,
    }))
}

function pasaFiltros(s, { proyecto, quien, cuenta }) {
  if (proyecto != null && !mismoTexto(s.proyecto, proyecto)) return false
  if (quien != null && !mismoTexto(s.quien, quien)) return false
  if (cuenta != null && !mismoTexto(s.cuentaAlias, cuenta) && !mismoTexto(s.cuentaUuid, cuenta)) return false
  return true
}

function mismoTexto(a, b) {
  return typeof a === 'string' && a.localeCompare(b, undefined, { sensitivity: 'accent' }) === 0
}

function agrupar(sesiones, claveDe) {
  const grupos = new Map()
  for (const s of sesiones) {
    const clave = claveDe(s)
    let g = grupos.get(clave)
    if (!g) {
      g = { clave, tokensIn: 0, tokensOut: 0, desglose: desgloseVacio(), costoUsd: 0, llamadas: 0, sesiones: 0 }
      grupos.set(clave, g)
    }
    g.tokensIn += s.tokensIn
    g.tokensOut += s.tokensOut
    sumarDesglose(g.desglose, s.desglose)
    g.costoUsd += s.costoUsd
    g.llamadas += s.llamadas
    g.sesiones += 1
  }
  return [...grupos.values()]
    .map((g) => ({ ...g, costoUsd: redondear(g.costoUsd) }))
    .sort((a, b) => b.tokensIn - a.tokensIn)
}

// La serie diaria es la base del pico de consumo: cronologica ascendente, con
// las sesiones sin fecha de fin al final bajo 'n/d'.
function serieDiaria(sesiones) {
  return agrupar(sesiones, (s) => s.fecha ?? 'n/d').sort((a, b) => {
    if (a.clave === 'n/d') return 1
    if (b.clave === 'n/d') return -1
    return a.clave < b.clave ? -1 : 1
  })
}

// El registro trae porModelo por sesion; aca 'sesiones' cuenta en cuantas
// sesiones aparecio el modelo (no hay llamadas por modelo en el esquema v1).
function agruparPorModelo(sesiones) {
  const grupos = new Map()
  for (const s of sesiones) {
    for (const m of s.porModelo) {
      let g = grupos.get(m.alias)
      if (!g) {
        g = { clave: m.alias, tokensIn: 0, tokensOut: 0, costoUsd: 0, sesiones: 0 }
        grupos.set(m.alias, g)
      }
      g.tokensIn += m.tokensIn
      g.tokensOut += m.tokensOut
      g.costoUsd += m.costoUsd
      g.sesiones += 1
    }
  }
  return [...grupos.values()]
    .map((g) => ({ ...g, costoUsd: redondear(g.costoUsd) }))
    .sort((a, b) => b.tokensIn - a.tokensIn)
}

function totalesDe(sesiones) {
  const t = { tokensIn: 0, tokensOut: 0, desglose: desgloseVacio(), costoUsd: 0, llamadas: 0, sesiones: sesiones.length }
  for (const s of sesiones) {
    t.tokensIn += s.tokensIn
    t.tokensOut += s.tokensOut
    sumarDesglose(t.desglose, s.desglose)
    t.costoUsd += s.costoUsd
    t.llamadas += s.llamadas
  }
  t.costoUsd = redondear(t.costoUsd)
  return t
}

function desgloseVacio() {
  return { entrada: 0, salida: 0, cacheCreacion: 0, cacheLectura: 0 }
}

function sumarDesglose(destino, fuente) {
  destino.entrada += fuente.entrada
  destino.salida += fuente.salida
  destino.cacheCreacion += fuente.cacheCreacion
  destino.cacheLectura += fuente.cacheLectura
}

function redondear(n) {
  return Math.round(n * 10_000) / 10_000
}
