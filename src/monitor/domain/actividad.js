// Dominio puro: clasifica si un agente o una sesion esta corriendo ahora
// mismo. Ninguna senal por si sola es determinista, asi que se combinan tres
// (pid vivo, escritura reciente, cierre registrado) y existe un estado
// explicito de duda para el caso en que no alcanzan. No toca
// filesystem ni procesos: todo entra ya recolectado por el adaptador.

export const CORRIENDO = 'corriendo'
export const EN_DUDA = 'en_duda'
export const TERMINADO = 'terminado'

// Bajo este umbral una escritura cuenta como "reciente" (senal media: un
// agente pensando largo no escribe, asi que su ausencia no prueba nada).
export const UMBRAL_ESCRITURA_MS = 60_000

// Bajo este umbral, sin escritura reciente pero con el proceso vivo, el
// estado es EN_DUDA en vez de TERMINADO. Pasado este umbral, se asume que
// termino.
export const UMBRAL_DUDA_MS = 10 * 60_000

// El nucleo. El orden de las condiciones importa:
// - tieneCierre gana sobre todo: es la senal mas fuerte de que termino,
//   aunque el proceso padre siga vivo.
// - !pidVivo gana sobre escrituraReciente: si el proceso murio, no hay nada
//   corriendo por mas fresco que este el archivo.
// - EN_DUDA existe a proposito: pintar de verde un agente colgado seria peor
//   que mostrar la duda. No lo colapses a CORRIENDO ni a TERMINADO "para
//   simplificar" — es exactamente el tipo de cosa que alguien va a querer
//   limpiar despues.
export function clasificar({ pidVivo, escrituraReciente, tieneCierre, antiguedadMs }) {
  if (tieneCierre) return TERMINADO
  if (!pidVivo) return TERMINADO
  if (escrituraReciente) return CORRIENDO
  if (antiguedadMs < UMBRAL_DUDA_MS) return EN_DUDA
  return TERMINADO
}

// Envoltorio para un agente (subagente lanzado dentro de una sesion). Se
// asume que `agente` trae `ultimoTs` (epoch ms de la ultima escritura vista
// en su jsonl) y `tieneCierre` (bool: si el adaptador encontro un
// toolUseResult con su agentId en el jsonl del padre). `pidVivo` no se deriva
// del objeto: lo resuelve el adaptador (proceso en vivo) y se recibe aparte.
export function clasificarAgente(agente, { ahora, pidVivo }) {
  const antiguedadMs = ahora - agente.ultimoTs
  const escrituraReciente = antiguedadMs < UMBRAL_ESCRITURA_MS

  return clasificar({
    pidVivo,
    escrituraReciente,
    tieneCierre: Boolean(agente.tieneCierre),
    antiguedadMs,
  })
}

// Envoltorio para una sesion (el proceso raiz). Se asume que `sesion` trae
// `mtimeMs` (epoch ms de la ultima modificacion de su jsonl). Las sesiones no
// tienen un toolUseResult propio que las cierre, asi que tieneCierre siempre
// entra como false.
export function clasificarSesion(sesion, { ahora, pidVivo }) {
  const antiguedadMs = ahora - sesion.mtimeMs
  const escrituraReciente = antiguedadMs < UMBRAL_ESCRITURA_MS

  return clasificar({
    pidVivo,
    escrituraReciente,
    tieneCierre: false,
    antiguedadMs,
  })
}

// true para los estados que un consumidor deberia tratar como "sigue vivo":
// CORRIENDO y EN_DUDA. TERMINADO es el unico estado inactivo.
export function esActivo(estado) {
  return estado === CORRIENDO || estado === EN_DUDA
}
