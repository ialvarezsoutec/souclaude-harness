// Agregacion PURA del registro de consumo por sesion del Vault
// (00-System/monitor/usage/*.jsonl, ADR 20260820). Recibe registros v1 ya
// parseados (adapters/vault-usage-reader.js) y responde la pregunta del
// milestone SHS-M2: cuanto consumio cada cuenta, contribuyente, proyecto y
// sesion en un periodo. Es la base sobre la que SHS-M3 monta sus vistas.
//
// Convencion de la casa: tokensIn = entrada + cacheCreacion + cacheLectura.

/**
 * Deduplica y agrega registros v1.
 * @param {object[]} registros registros v1 (posiblemente con duplicados por sessionId)
 * @param {{desde?: number|null, hasta?: number|null}} [periodo] limites en ms epoch sobre el fin de la sesion
 * @returns {{totales: object, porCuenta: object[], porQuien: object[], porProyecto: object[], porMaquina: object[], sesiones: object[]}}
 */
export function agregarUsage(registros, { desde = null, hasta = null } = {}) {
  const sesiones = deduplicar(registros)
    .filter((r) => enPeriodo(r, desde, hasta))
    .map(materializar)
    .sort((a, b) => b.tokensIn - a.tokensIn)

  return {
    totales: totalesDe(sesiones),
    porCuenta: agrupar(sesiones, (s) => s.cuentaAlias ?? s.cuentaUuid ?? 'n/d'),
    porQuien: agrupar(sesiones, (s) => s.quien ?? 'n/d'),
    porProyecto: agrupar(sesiones, (s) => s.proyecto ?? 'n/d'),
    porMaquina: agrupar(sesiones, (s) => s.maquina ?? 'n/d'),
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
  return {
    sessionId: r.sessionId,
    fecha: typeof r.fin === 'string' ? r.fin.slice(0, 10) : null,
    proyecto: r.proyecto ?? null,
    rama: r.rama ?? null,
    milestone: r.milestone ?? null,
    quien: r.quien ?? null,
    cuentaUuid: r.cuenta?.uuid ?? null,
    cuentaAlias: r.cuenta?.alias ?? null,
    maquina: r.maquina?.hostname ?? r.maquina?.machineID ?? null,
    tokensIn: (t.entrada ?? 0) + (t.cacheCreacion ?? 0) + (t.cacheLectura ?? 0),
    tokensOut: t.salida ?? 0,
    costoUsd: r.costoUsd ?? 0,
    llamadas: r.llamadas ?? 0,
  }
}

function agrupar(sesiones, claveDe) {
  const grupos = new Map()
  for (const s of sesiones) {
    const clave = claveDe(s)
    let g = grupos.get(clave)
    if (!g) {
      g = { clave, tokensIn: 0, tokensOut: 0, costoUsd: 0, llamadas: 0, sesiones: 0 }
      grupos.set(clave, g)
    }
    g.tokensIn += s.tokensIn
    g.tokensOut += s.tokensOut
    g.costoUsd += s.costoUsd
    g.llamadas += s.llamadas
    g.sesiones += 1
  }
  return [...grupos.values()]
    .map((g) => ({ ...g, costoUsd: redondear(g.costoUsd) }))
    .sort((a, b) => b.tokensIn - a.tokensIn)
}

function totalesDe(sesiones) {
  const t = { tokensIn: 0, tokensOut: 0, costoUsd: 0, llamadas: 0, sesiones: sesiones.length }
  for (const s of sesiones) {
    t.tokensIn += s.tokensIn
    t.tokensOut += s.tokensOut
    t.costoUsd += s.costoUsd
    t.llamadas += s.llamadas
  }
  t.costoUsd = redondear(t.costoUsd)
  return t
}

function redondear(n) {
  return Math.round(n * 10_000) / 10_000
}
