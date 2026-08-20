// Dominio puro: ventanas REALES de rate limit (5h / 7d / semanal por modelo,
// la fila "Fable") con el consumo propio del registro del Vault adentro
// (SHS-M3-T002). A diferencia de ventanas.js (rodantes desde `ahora`), estas
// se alinean al `reseteaEn` que la API informa: la ventana vigente es
// [reseteaEn - duracion, ahora]. Sin reseteaEn utilizable se cae a la ventana
// rodante equivalente y se marca `alineada: false` — un numero aproximado
// avisado vale mas que un hueco.
//
// La atribucion es a granularidad de sesion (el registro v1 no trae consumo
// por intervalo): una sesion cuenta entera en la ventana si su fin cae
// adentro. Para las ventanas por modelo se usa el porModelo del agregado.

import { agregarUsage } from './usage-agregado.js'
import { resolverAlias } from './precios.js'

const HORA = 3_600_000
const DIA = 86_400_000

// Duracion de la ventana segun el `kind` de la API (usage-limits-reader.js).
const DURACION_POR_TIPO = {
  session: 5 * HORA,
  five_hour: 5 * HORA,
  seven_day: 7 * DIA,
  weekly: 7 * DIA,
  weekly_all: 7 * DIA,
  weekly_scoped: 7 * DIA,
  monthly: 30 * DIA,
}

/**
 * Ventanas de rate limit vigentes a partir del modelo de dominio de limites
 * (usage-limits-reader.js). Devuelve las dos ventanas globales (5h, 7d) y una
 * por cada limite de porGrupo con modelo (la fila Fable/semanal por modelo).
 * @param {object|null} limites {cincoHoras, sieteDias, porGrupo} o null
 * @param {number} ahora epoch ms
 * @returns {object[]} [{clave, etiqueta, tipo, modelo, alias, porcentaje, reseteaEn, desde, hasta, alineada}]
 */
export function ventanasDeLimite(limites, ahora) {
  const ventanas = []

  if (limites?.cincoHoras) {
    ventanas.push(ventanaDe('5h', 'Ventana 5h', 'session', null, limites.cincoHoras, ahora))
  }
  if (limites?.sieteDias) {
    ventanas.push(ventanaDe('7d', 'Ventana 7d', 'weekly_all', null, limites.sieteDias, ahora))
  }

  // porGrupo duplica las dos ventanas globales (kind session/weekly_all sin
  // modelo): aca solo interesan los limites por modelo, que no tienen otra
  // fuente. La clave lleva el alias para que dos modelos no colisionen.
  for (const g of Array.isArray(limites?.porGrupo) ? limites.porGrupo : []) {
    if (!g || typeof g.modelo !== 'string' || g.modelo === '') continue
    const alias = resolverAlias(g.modelo)
    ventanas.push({
      ...ventanaDe(`modelo:${alias}`, `Semanal ${g.modelo}`, g.tipo ?? 'weekly_scoped', g.modelo, g, ahora),
      alias,
    })
  }

  return ventanas
}

function ventanaDe(clave, etiqueta, tipo, modelo, limite, ahora) {
  const duracion = DURACION_POR_TIPO[tipo] ?? 7 * DIA
  const reseteaEn = aEpoch(limite.reseteaEn)
  // Un reset en el pasado es un dato viejo de la API: la ventana que describe
  // ya termino, asi que alinearse a el mentiria. Se cae a la rodante.
  const alineada = reseteaEn !== null && reseteaEn > ahora
  const desde = alineada ? Math.min(reseteaEn - duracion, ahora) : ahora - duracion

  return {
    clave,
    etiqueta,
    tipo,
    modelo,
    porcentaje: Number.isFinite(limite.porcentaje) ? limite.porcentaje : null,
    reseteaEn,
    desde,
    hasta: ahora,
    alineada,
  }
}

/**
 * Consumo propio del registro del Vault dentro de cada ventana de limite.
 * @param {object[]} registros registros v1 del lector (vault-usage-reader.js)
 * @param {object|null} limites modelo de dominio de limites
 * @param {number} ahora epoch ms
 * @param {{proyecto?: string|null, quien?: string|null, cuenta?: string|null}} [filtros] se pasan tal cual al agregado
 * @returns {object[]} las ventanas de ventanasDeLimite() + {consumo, sesiones}
 */
export function consumoPorVentana(registros, limites, ahora, filtros = {}) {
  return ventanasDeLimite(limites, ahora).map((ventana) => {
    const agregado = agregarUsage(registros, { ...filtros, desde: ventana.desde, hasta: ventana.hasta })
    return { ...ventana, ...consumoDe(agregado, ventana.alias ?? null) }
  })
}

// Para una ventana por modelo, el consumo sale del porModelo del agregado; el
// esquema v1 no trae llamadas ni desglose de cache por modelo, asi que esos
// campos van en null (no en 0: cero seria un dato que no tenemos).
function consumoDe(agregado, alias) {
  if (alias === null) {
    const t = agregado.totales
    return {
      consumo: {
        tokensIn: t.tokensIn,
        tokensOut: t.tokensOut,
        desglose: t.desglose,
        costoUsd: t.costoUsd,
        llamadas: t.llamadas,
      },
      sesiones: t.sesiones,
    }
  }

  const delModelo = agregado.porModelo.find((m) => resolverAlias(m.clave) === alias)
  return {
    consumo: {
      tokensIn: delModelo?.tokensIn ?? 0,
      tokensOut: delModelo?.tokensOut ?? 0,
      desglose: null,
      costoUsd: delModelo?.costoUsd ?? 0,
      llamadas: null,
    },
    sesiones: delModelo?.sesiones ?? 0,
  }
}

// reseteaEn llega como epoch ms o como ISO segun la fuente (mismo caso que el
// presenter): el dominio entiende los dos y trabaja siempre en epoch.
function aEpoch(valor) {
  if (typeof valor === 'number' && Number.isFinite(valor)) return valor
  if (typeof valor === 'string') {
    const t = Date.parse(valor)
    return Number.isFinite(t) ? t : null
  }
  return null
}
