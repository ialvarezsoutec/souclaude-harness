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
