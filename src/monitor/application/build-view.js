import { construirVentana } from '../domain/ventanas.js'
import { construirVista } from '../domain/arbol.js'

// Caso de uso del monitor: un tick del panel. Es deliberadamente delgado —
// pide el snapshot al puerto, arma la ventana y delega TODA la agregacion en el
// dominio (arbol.js). Si aca aparece un reduce sobre eventos, esta en el lugar
// equivocado: va en arbol.js.
//
// Esta capa no importa adaptadores: `source` y `clock` llegan inyectados (ver
// ports.js). Enforcement en test/monitor-layers.test.js.

/**
 * @param {{source: import('./ports.js').SnapshotSource,
 *          clock: import('./ports.js').Clock,
 *          opciones?: object}} args
 * @returns {Promise<object>} VistaMonitor
 */
export async function buildView({ source, clock, opciones = {} } = {}) {
  // El reloj se lee UNA SOLA VEZ por tick y ese `ahora` se propaga a todo:
  // ventana, snapshot y vista. Si cada parte leyera el reloj por su cuenta, los
  // eventos del final del tick caerian fuera de la ventana calculada al
  // principio y las duraciones del panel saldrian inconsistentes entre si.
  const ahora = clock.now()

  // construirVentana valida la etiqueta y lanza si es invalida: es el contrato
  // del dominio y no se traga aca — el CLI ya valido la entrada del usuario.
  const ventana = normalizarVentana(opciones.ventana, ahora)

  const snapshot = await source.collect({ window: ventana, ahora })

  return construirVista(snapshot, { ...opciones, ventana, ahora })
}

// Acepta la ventana ya construida (por si el llamador la reusa entre ticks) o
// la etiqueta cruda ("6h", "all"). Sin ventana, 24h — mismo default que arbol.js.
function normalizarVentana(ventana, ahora) {
  if (ventana && typeof ventana === 'object' && typeof ventana.desde === 'number') return ventana
  return construirVentana(typeof ventana === 'string' && ventana !== '' ? ventana : '24h', ahora)
}
