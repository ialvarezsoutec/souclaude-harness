import { renderPanel } from './panel-layout.js'
import { presentar } from './panel-presenter.js'

// Salidas de una sola pasada del monitor: texto plano (sin un solo escape ANSI),
// JSON y NDJSON. Es lo que consume `--once`, un pipe (`souclaude monitor | cat`),
// CI y cualquier hook. Nada de este modulo toca el cursor, el alternate buffer ni
// el raw mode: eso es exclusivo de tty-renderer.js.
//
// renderJson NO transforma nada: expone el modelo de DOMINIO tal cual, que es el
// canonico. El panel consume la proyeccion de panel-presenter.js. Como los dos
// salen del mismo objeto, no se pueden contradecir.

// Altura generosa para un snapshot: el panel reparte por seccion hasta su maximo y
// devuelve solo las lineas que uso, asi que un numero alto no infla la salida — solo
// garantiza que nada se recorte por altura de terminal.
const FILAS_SNAPSHOT = 400

/**
 * @param {object} vista  modelo de dominio (construirVista)
 * @param {{cols?:number, rows?:number, caps?:object, modo?:'full'|'compact'|'agents', top?:number}} [opciones]
 * @returns {string} texto plano, sin ANSI
 */
export function renderPlain(vista, { cols = 100, rows = FILAS_SNAPSHOT, caps = {}, modo = 'full', top } = {}) {
  const ahora = Number.isFinite(vista?.generadoEn) ? vista.generadoEn : Date.now()
  const proyeccion = presentar(vista, { ahora, top })

  const lineas = renderPanel(proyeccion, {
    cols,
    rows,
    // color: false apaga picocolors dentro del panel; el caps.color de abajo cubre
    // el caso de un caps inyectado que lo reactive.
    caps: { ...caps, color: false },
    color: false,
    modo,
  })

  // El panel rellena cada linea al ancho exacto: para una salida que va a un pipe o
  // a un archivo, el relleno de la derecha es ruido.
  return lineas.map((l) => l.replace(/\s+$/, '')).join('\n')
}

/** El modelo de dominio sin transformar: es la fuente canonica de `--json`. */
export function renderJson(vista) {
  return JSON.stringify(vista, null, 2)
}

/** Una sola linea, para tuberias que consumen evento por evento. */
export function renderNdjson(vista) {
  return JSON.stringify(vista)
}
