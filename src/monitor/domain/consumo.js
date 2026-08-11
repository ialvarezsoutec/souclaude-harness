// Dominio puro: acumula EventosDeUso (ver eventos.js) en un Consumo, apoyandose
// en precios.js para el costo. No conoce el filesystem ni deduplica dentro de
// sumar(): asume que quien llama ya filtro los eventos repetidos con
// crearDeduplicador() de este mismo modulo. Determinista: nada de Date.now().

import { costoDe, resolverAlias } from './precios.js'

// Consumo neutro del monoide. fusionar(vacio(), x) === x en todos los campos.
export function vacio() {
  return {
    llamadas: 0,
    entrada: 0,
    salida: 0,
    cacheCreacion: 0,
    cacheLectura: 0,
    cache1h: 0,
    cache5m: 0,
    costoUsd: 0,
    sinPrecio: 0,
    primerTs: null,
    ultimoTs: null,
  }
}

// Acumula un EventosDeUso ya deduplicado dentro de `acumulador` (lo muta y lo
// devuelve). El parametro `ahora` queda reservado para quien orqueste ventanas
// de tiempo; este modulo no lo necesita porque el ts de cada evento ya viene
// resuelto por eventos.js.
export function sumar(acumulador, evento, { ahora } = {}) {
  void ahora

  const uso = evento.uso ?? {}
  const alias = resolverAlias(evento.modeloId)
  const { usd, conocido } = costoDe(uso, alias, evento.ts)

  acumulador.llamadas += 1
  acumulador.entrada += uso.entrada ?? 0
  acumulador.salida += uso.salida ?? 0
  acumulador.cacheCreacion += uso.cacheCreacion ?? 0
  acumulador.cacheLectura += uso.cacheLectura ?? 0
  acumulador.cache1h += uso.cache1h ?? 0
  acumulador.cache5m += uso.cache5m ?? 0
  acumulador.costoUsd += usd
  if (!conocido) acumulador.sinPrecio += 1

  if (evento.ts != null) {
    acumulador.primerTs = acumulador.primerTs == null ? evento.ts : Math.min(acumulador.primerTs, evento.ts)
    acumulador.ultimoTs = acumulador.ultimoTs == null ? evento.ts : Math.max(acumulador.ultimoTs, evento.ts)
  }

  return acumulador
}

// Combina dos Consumo en uno nuevo, sin mutar ninguno de los dos. Asociativa:
// fusionar(fusionar(a, b), c) === fusionar(a, fusionar(b, c)).
export function fusionar(a, b) {
  return {
    llamadas: a.llamadas + b.llamadas,
    entrada: a.entrada + b.entrada,
    salida: a.salida + b.salida,
    cacheCreacion: a.cacheCreacion + b.cacheCreacion,
    cacheLectura: a.cacheLectura + b.cacheLectura,
    cache1h: a.cache1h + b.cache1h,
    cache5m: a.cache5m + b.cache5m,
    costoUsd: a.costoUsd + b.costoUsd,
    sinPrecio: a.sinPrecio + b.sinPrecio,
    primerTs: combinarTs(a.primerTs, b.primerTs, Math.min),
    ultimoTs: combinarTs(a.ultimoTs, b.ultimoTs, Math.max),
  }
}

function combinarTs(x, y, elegir) {
  if (x == null) return y
  if (y == null) return x
  return elegir(x, y)
}

// Clave de deduplicacion de un evento. Primero el message.id (unico por
// respuesta real de la API); si falta, un fallback compuesto con requestId +
// las 3 medidas de uso mas discriminantes. Si tampoco hay requestId, no hay
// forma honesta de deduplicar: se devuelve null y quien llama debe contar el
// evento igual (mejor sobrecontar un caso raro que perder datos reales).
export function claveDedup(evento) {
  if (evento.id) return evento.id
  if (evento.requestId) {
    const uso = evento.uso ?? {}
    return `${evento.requestId}|${uso.entrada ?? 0}|${uso.salida ?? 0}|${uso.cacheLectura ?? 0}`
  }
  return null
}

// Deduplicador de eventos con memoria acotada. Uso previsto: UNO por archivo
// de transcript, nunca uno global compartido entre archivos — dos archivos
// distintos nunca repiten un message.id real, y tener uno por archivo permite
// resetear el estado de ese archivo si se trunca sin perder el conteo del
// resto. El adaptador que orquesta la lectura depende de esta expectativa.
//
// Memoria: ~40 bytes por clave (Set + Map de clave->ts). Una sesion larga de
// 5000 respuestas son ~200 KB, insignificante para un monitor que corre horas.
// No lo cambies por algo "mas liviano": la correccion (nunca perder ni
// duplicar un evento real) importa mas que unos KB.
export function crearDeduplicador() {
  const claves = new Set()
  const tsPorClave = new Map()

  return {
    // true si el evento ya se habia visto (descartar), false la primera vez
    // (y queda registrado). Una clave null nunca se marca como vista: no hay
    // forma de saber si es un duplicado, asi que se deja pasar siempre.
    visto(evento) {
      const clave = claveDedup(evento)
      if (clave == null) return false
      if (claves.has(clave)) return true
      claves.add(clave)
      tsPorClave.set(clave, evento.ts ?? null)
      return false
    },
    tamano() {
      return claves.size
    },
    // Elimina las claves cuyo ts sea anterior a `antesDe` (epoch ms). Devuelve
    // cuantas se eliminaron. Pensado para ventanas de horas: evita que la
    // memoria crezca sin limite en un monitor de larga duracion.
    purgar(antesDe) {
      let eliminadas = 0
      for (const [clave, ts] of tsPorClave) {
        if (ts != null && ts < antesDe) {
          tsPorClave.delete(clave)
          claves.delete(clave)
          eliminadas += 1
        }
      }
      return eliminadas
    },
    limpiar() {
      claves.clear()
      tsPorClave.clear()
    },
  }
}
