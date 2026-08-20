// Dominio puro: actividad del EQUIPO derivada del registro de consumo del
// Vault (SHS-M3-T003). A diferencia de actividad.js (que decide con pid y
// eventos locales), aca no hay proceso que consultar: una sesion de otra
// maquina esta "activa" si su registro esta fresco. `fin` es el ultimo evento
// real de la sesion y `generadoEn` solo avanza cuando hubo crecimiento
// material (vault-usage-db.js), asi que la ultima actividad es el maximo de
// los dos. Sin bump de esquema: todo sale de campos que el v1 ya trae.

// El publisher escribe cada ~5 min mientras la sesion crece: 15 min son tres
// publicaciones perdidas, no una demora normal (misma convencion que
// FRESCURA_VIEJA_MS del panel).
export const UMBRAL_ACTIVA_MS = 15 * 60_000

/**
 * Sesiones del equipo con actividad reciente.
 * @param {object[]} sesiones sesiones materializadas de agregarUsage()
 * @param {number} ahora epoch ms
 * @param {{umbralMs?: number}} [opciones]
 * @returns {object[]} [{...sesion, frescuraMs}] de mas fresca a menos fresca
 */
export function sesionesActivas(sesiones, ahora, { umbralMs = UMBRAL_ACTIVA_MS } = {}) {
  const activas = []
  for (const s of sesiones ?? []) {
    const ultima = ultimaActividad(s)
    if (ultima === null) continue
    // Un timestamp apenas futuro es desfase de reloj entre maquinas, no una
    // sesion invalida: frescura 0, no negativa.
    const frescuraMs = Math.max(0, ahora - ultima)
    if (frescuraMs > umbralMs) continue
    activas.push({ ...s, frescuraMs })
  }
  return activas.sort((a, b) => a.frescuraMs - b.frescuraMs)
}

function ultimaActividad(s) {
  const fin = Date.parse(s?.fin ?? '')
  const generadoEn = Date.parse(s?.generadoEn ?? '')
  if (!Number.isFinite(fin) && !Number.isFinite(generadoEn)) return null
  return Math.max(Number.isFinite(fin) ? fin : -Infinity, Number.isFinite(generadoEn) ? generadoEn : -Infinity)
}

/**
 * El dia de mayor consumo de la serie diaria (porDia de agregarUsage). La
 * magnitud es el volumen total movido (in + out), la misma vara que el pico
 * del panel local (ventanas.js::totalTokensEvento).
 * @param {object[]} porDia grupos {clave: 'YYYY-MM-DD'|'n/d', tokensIn, tokensOut, ...}
 * @returns {object|null} {fecha, tokens, tokensIn, tokensOut, costoUsd, llamadas, sesiones} o null sin datos fechados
 */
export function picoDiario(porDia) {
  let pico = null
  for (const dia of porDia ?? []) {
    if (dia.clave === 'n/d') continue
    const tokens = dia.tokensIn + dia.tokensOut
    if (!pico || tokens > pico.tokens) {
      pico = {
        fecha: dia.clave,
        tokens,
        tokensIn: dia.tokensIn,
        tokensOut: dia.tokensOut,
        costoUsd: dia.costoUsd,
        llamadas: dia.llamadas,
        sesiones: dia.sesiones,
      }
    }
  }
  return pico
}
