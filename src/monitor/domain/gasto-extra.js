// Dominio puro: regla de "extra vencido pasa a historico" del gasto extra
// (usage_limits.extra_usage). Nunca lee el reloj: el instante actual siempre
// entra por parametro `ahora` (epoch ms), igual que ventanas.js -- sin esto no
// hay forma de testear los bordes de 24h de forma determinista.

const VEINTICUATRO_HORAS_MS = 24 * 60 * 60_000

// 'vivo' | 'historico'. Un gasto extra que no esta alcanzado, o que no tiene
// una fecha de deteccion registrada todavia, siempre es 'vivo': recien al
// cumplirse (o superarse) 24h desde que se detecto alcanzado pasa a
// 'historico'. El limite es "mayor o igual", no "mayor": a las 24h00m exactas
// ya es historico.
export function estadoDelExtra({ alcanzado, detectadoEn }, ahora) {
  if (alcanzado !== true) return 'vivo'
  if (detectadoEn == null) return 'vivo'
  return ahora - detectadoEn >= VEINTICUATRO_HORAS_MS ? 'historico' : 'vivo'
}

// Reducer puro: dado el gasto extra recien leido (`gastoExtra`, forma de
// toGastoExtra()) y el registro persistido actual (`registroActual`, un
// PeriodoDeGastoExtra o null si no hay ninguno abierto), decide el proximo
// registro. No persiste nada -- eso es responsabilidad del adaptador
// (usage-history.js), que solo debe escribir lo que esta funcion devuelve.
//
// - Sin registro abierto y el extra esta alcanzado -> abre uno nuevo con
//   detectadoEn = ahora (la primera observacion que este proceso hace).
// - Registro abierto y sigue alcanzado -> se mantiene igual (misma
//   referencia): nada que persistir de nuevo.
// - Registro abierto pero el extra ya no esta alcanzado (`habilitado ===
//   true`, o el usado cayo por debajo de lo que el registro tiene guardado,
//   senal de que el periodo se reseteo) -> se cierra: `cerradoEn = ahora`.
// - Sin registro abierto y el extra no esta alcanzado -> sigue sin registro
//   (null).
export function siguienteRegistro(gastoExtra, registroActual, ahora) {
  const alcanzado = gastoExtra?.alcanzado === true

  if (registroActual == null) {
    if (!alcanzado) return null
    return {
      detectadoEn: ahora,
      usado: gastoExtra.usadoUsd,
      limite: gastoExtra.limiteUsd,
      moneda: 'USD',
      cerradoEn: null,
    }
  }

  const seReseteo = gastoExtra?.habilitado === true || gastoExtra.usadoUsd < registroActual.usado

  if (!alcanzado || seReseteo) {
    return { ...registroActual, cerradoEn: ahora }
  }

  return registroActual
}
