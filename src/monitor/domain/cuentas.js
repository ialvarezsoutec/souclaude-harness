// Dominio puro: identidad de cuenta de Claude. Normaliza lo que el adaptador
// extrajo de ~/.claude.json (oauthAccount + machineID) y deriva un alias
// legible para el panel y el router log. No toca filesystem ni red: todo
// entra ya recolectado.

// Parte local del email, en minusculas ("Dev@Soutec.com" -> "dev"). El alias
// es para humanos (filas del panel, campo `cuenta` del router log); la clave
// de identidad real siempre es accountUuid. null si no hay email usable.
export function aliasDeCuenta(email) {
  if (typeof email !== 'string') return null
  const arroba = email.indexOf('@')
  const local = (arroba === -1 ? email : email.slice(0, arroba)).trim().toLowerCase()
  return local === '' ? null : local
}

// Consolida la cuenta local + los snapshots remotos del Vault en las filas de
// la seccion CUENTAS. Reglas:
// - Dedup por accountUuid. La fila local gana SIEMPRE sobre su propio snapshot
//   publicado (el dato en vivo es mas fresco que cualquier archivo); entre
//   snapshots remotos de la misma cuenta gana el generadoEn mas reciente.
// - frescuraMs = ahora - generadoEn. Negativa (reloj de la otra maquina
//   adelantado) se conserva y se avisa: distorsiona la frescura, no el orden.
// - La local va primera; las remotas ordenadas por alias y uuid para que el
//   panel no baile entre ticks.
export function consolidarCuentas({ local = null, remotas = [], ahora } = {}) {
  const avisos = []
  const filas = new Map() // accountUuid -> fila

  for (const snapshot of Array.isArray(remotas) ? remotas : []) {
    const fila = filaRemota(snapshot, ahora)
    if (!fila) continue
    const previa = filas.get(fila.accountUuid)
    if (previa && previa.generadoEn >= fila.generadoEn) continue
    filas.set(fila.accountUuid, fila)
  }

  const cuentaLocal = normalizarCuenta(local?.cuenta)
  if (cuentaLocal) {
    filas.set(cuentaLocal.accountUuid, {
      accountUuid: cuentaLocal.accountUuid,
      alias: cuentaLocal.alias,
      esLocal: true,
      maquina: null,
      limites: local.limites ?? null,
      totalesDia: totalesDia(local.totales),
      generadoEn: ahora,
      frescuraMs: 0,
    })
  }

  const lista = [...filas.values()].sort((a, b) => {
    if (a.esLocal !== b.esLocal) return a.esLocal ? -1 : 1
    const porAlias = String(a.alias ?? '').localeCompare(String(b.alias ?? ''))
    return porAlias !== 0 ? porAlias : a.accountUuid.localeCompare(b.accountUuid)
  })

  for (const fila of lista) {
    if (fila.frescuraMs < 0) {
      avisos.push({ file: 'cuentas', reason: `la cuenta ${fila.alias ?? fila.accountUuid} reporta un instante futuro: reloj desincronizado` })
    }
  }

  return { cuentas: lista, avisos }
}

function filaRemota(snapshot, ahora) {
  const accountUuid = snapshot?.cuenta?.accountUuid
  if (typeof accountUuid !== 'string' || accountUuid === '') return null
  // Date.parse es determinista (no lee el reloj): permitido en dominio.
  const generadoEn = Date.parse(snapshot.generadoEn ?? '')
  if (!Number.isFinite(generadoEn)) return null

  return {
    accountUuid,
    alias: snapshot.cuenta.alias ?? aliasDeCuenta(snapshot.cuenta.email ?? null),
    esLocal: false,
    maquina: snapshot.maquina?.hostname ?? snapshot.maquina?.machineID ?? null,
    limites: snapshot.limites ?? null,
    totalesDia: snapshot.totalesDia ?? null,
    generadoEn,
    frescuraMs: ahora - generadoEn,
  }
}

// Mismo criterio que el router log y el publisher: tokensIn incluye ambos
// caches, porque es lo que se factura como entrada.
function totalesDia(totales) {
  if (!totales) return null
  return {
    tokensIn: (totales.entrada ?? 0) + (totales.cacheCreacion ?? 0) + (totales.cacheLectura ?? 0),
    tokensOut: totales.salida ?? 0,
    costoUsd: totales.costoUsd ?? 0,
    llamadas: totales.llamadas ?? 0,
  }
}

// Valida y da forma canonica a la identidad cruda del adaptador. La regla es
// todo-o-nada sobre accountUuid: sin el, no hay identidad (los demas campos
// no alcanzan para atribuir nada) y toda la cadena downstream ve `null` en
// vez de un objeto a medias.
export function normalizarCuenta(cruda) {
  if (!cruda || typeof cruda !== 'object') return null
  const accountUuid = typeof cruda.accountUuid === 'string' && cruda.accountUuid !== ''
    ? cruda.accountUuid
    : null
  if (!accountUuid) return null

  const email = typeof cruda.email === 'string' && cruda.email !== '' ? cruda.email : null
  return {
    accountUuid,
    alias: aliasDeCuenta(email),
    email,
    organizacion: typeof cruda.organizacion === 'string' && cruda.organizacion !== ''
      ? cruda.organizacion
      : null,
    machineID: typeof cruda.machineID === 'string' && cruda.machineID !== ''
      ? cruda.machineID
      : null,
  }
}
