import { test } from 'node:test'
import assert from 'node:assert/strict'

import { resolverAlias, precioDe, costoDe, PRECIOS } from '../src/monitor/domain/precios.js'
import { aEventoDeUso, parsearLinea } from '../src/monitor/domain/eventos.js'
import { vacio, sumar, claveDedup, crearDeduplicador } from '../src/monitor/domain/consumo.js'
import {
  parsearDuracion,
  construirVentana,
  dentroDe,
  bucketsHorarios,
} from '../src/monitor/domain/ventanas.js'
import { clasificar, CORRIENDO, EN_DUDA, TERMINADO } from '../src/monitor/domain/actividad.js'
import {
  anchoVisual,
  truncar,
  barra,
  columnas,
  sanearCelda,
  fmtTokens,
  fmtDinero,
  fmtDuracion,
  severidad,
} from '../src/monitor/domain/formato.js'

// Este archivo responde: "el dominio del monitor de tokens (precios, eventos,
// consumo/dedup, ventanas, actividad, formato) hace las cuentas que dice
// hacer?". Todos los valores esperados van hardcodeados y calculados a mano
// en los comentarios -- ninguno se deriva llamando a la misma funcion que se
// prueba. Nada de Date.now(): los timestamps son fijos.

// ---------------------------------------------------------------------------
// precios.js
// ---------------------------------------------------------------------------

test('precios: resolverAlias reconoce familias pese a sufijos y marcadores', () => {
  assert.equal(resolverAlias('claude-opus-5[1m]'), 'opus')
  assert.equal(resolverAlias('claude-sonnet-5'), 'sonnet')
  assert.equal(resolverAlias('claude-haiku-4-5-20251001'), 'haiku')
  assert.equal(resolverAlias(null), 'desconocido')
  assert.equal(resolverAlias(''), 'desconocido')
})

test('precios: costoDe opus con cache de lectura da 0.002250 USD exactos', () => {
  // (100*5 + 50*25 + 1000*5*0.1) / 1e6 = (500 + 1250 + 500) / 1e6 = 2250 / 1e6 = 0.00225
  const uso = { entrada: 100, salida: 50, cacheLectura: 1000 }
  const { usd, conocido } = costoDe(uso, 'opus', null)
  assert.equal(conocido, true)
  assert.equal(usd.toFixed(6), '0.002250')
})

test('precios: sonnet usa precio introductorio antes del corte y precio normal despues', () => {
  const antes = Date.UTC(2026, 7, 31, 12, 0, 0) // 31-ago-2026, dentro de la ventana intro
  const despues = Date.UTC(2026, 8, 1, 0, 0, 0) // 1-sep-2026, ya fuera de la ventana intro
  const uso = { entrada: 100, salida: 50 }

  // Intro: (100*2.00 + 50*10.00) / 1e6 = (200 + 500) / 1e6 = 700 / 1e6 = 0.000700
  const { usd: usdAntes } = costoDe(uso, 'sonnet', antes)
  assert.equal(usdAntes.toFixed(6), '0.000700')

  // Normal: (100*3.00 + 50*15.00) / 1e6 = (300 + 750) / 1e6 = 1050 / 1e6 = 0.001050
  const { usd: usdDespues } = costoDe(uso, 'sonnet', despues)
  assert.equal(usdDespues.toFixed(6), '0.001050')
})

test('precios: ts null en sonnet usa el precio normal, nunca el descuento', () => {
  const precio = precioDe('sonnet', null)
  assert.deepEqual(precio, PRECIOS.sonnet)
  assert.equal(precio.entrada, 3.0)
  assert.equal(precio.salida, 15.0)
})

test('precios: alias desconocido nunca sube el costo (ni haiku ni un invento)', () => {
  const uso = { entrada: 1000, salida: 1000 }
  const haiku = costoDe(uso, 'haiku', null)
  assert.equal(haiku.usd, 0)
  assert.equal(haiku.conocido, false)

  const inventado = costoDe(uso, 'modelo-que-no-existe', null)
  assert.equal(inventado.usd, 0)
  assert.equal(inventado.conocido, false)
})

// ---------------------------------------------------------------------------
// eventos.js
// ---------------------------------------------------------------------------

test('eventos: isApiErrorMessage true no trae usage, aEventoDeUso devuelve null', () => {
  const obj = {
    type: 'assistant',
    isApiErrorMessage: true,
    message: { id: 'msg_1', model: 'claude-opus-5', role: 'assistant' },
  }
  assert.equal(aEventoDeUso(obj), null)
})

test('eventos: linea assistant sin usage devuelve null', () => {
  const obj = {
    type: 'assistant',
    timestamp: '2026-08-01T00:00:00.000Z',
    message: { id: 'msg_1', model: 'claude-opus-5', role: 'assistant' },
  }
  assert.equal(aEventoDeUso(obj), null)
})

test('eventos: parsearLinea con JSON corrupto o a medio escribir devuelve null sin lanzar', () => {
  // Prefiltro esLineaDeUso pasa (contiene "type":"assistant" y "usage") pero el
  // JSON esta trunco -- exactamente lo que deja una escritura a medio terminar.
  const partida = '{"type":"assistant","message":{"usage":{"input_tokens":10'
  assert.doesNotThrow(() => parsearLinea(partida))
  assert.equal(parsearLinea(partida), null)
})

test('eventos: attributionAgent vacio cae al fallback, no queda como cadena vacia', () => {
  const obj = {
    type: 'assistant',
    timestamp: '2026-08-01T00:00:00.000Z',
    sessionId: 'sess-1',
    agentId: 'agent-1',
    attributionAgent: '',
    requestId: 'req-1',
    message: {
      id: 'msg_1',
      model: 'claude-opus-5',
      role: 'assistant',
      usage: { input_tokens: 10, output_tokens: 5 },
    },
  }
  const evento = aEventoDeUso(obj, { esSubagente: true })
  assert.notEqual(evento.tipoAgente, '')
  assert.equal(evento.tipoAgente, 'subagente')
})

test('eventos: el mapeo de usage a uso es correcto, incluido el desglose de cache', () => {
  const obj = {
    type: 'assistant',
    timestamp: '2026-08-01T00:00:00.000Z',
    sessionId: 'sess-1',
    requestId: 'req-1',
    message: {
      id: 'msg_1',
      model: 'claude-opus-5',
      role: 'assistant',
      usage: {
        input_tokens: 111,
        output_tokens: 222,
        cache_creation_input_tokens: 333,
        cache_read_input_tokens: 444,
        cache_creation: {
          ephemeral_1h_input_tokens: 55,
          ephemeral_5m_input_tokens: 66,
        },
      },
    },
  }
  const evento = aEventoDeUso(obj)
  assert.deepEqual(evento.uso, {
    entrada: 111,
    salida: 222,
    cacheCreacion: 333,
    cacheLectura: 444,
    cache1h: 55,
    cache5m: 66,
  })
})

// ---------------------------------------------------------------------------
// consumo.js -- deduplicacion (el caso mas importante del monitor)
// ---------------------------------------------------------------------------

function evento({ id, requestId, entrada = 10, salida = 5, ts = null }) {
  return { id, requestId, ts, uso: { entrada, salida }, modeloId: 'claude-opus-5' }
}

test('dedup: tres lineas con el mismo message.id cuentan como 1 llamada', () => {
  const dedup = crearDeduplicador()
  const acumulador = vacio()
  const eventos = [
    evento({ id: 'msg_1', entrada: 100, salida: 50 }),
    evento({ id: 'msg_1', entrada: 100, salida: 50 }),
    evento({ id: 'msg_1', entrada: 100, salida: 50 }),
  ]
  for (const ev of eventos) {
    if (dedup.visto(ev)) continue
    sumar(acumulador, ev)
  }
  assert.equal(acumulador.llamadas, 1)
  assert.equal(acumulador.entrada, 100)
  assert.equal(acumulador.salida, 50)
})

test('dedup: dos lineas con message.id distinto cuentan como 2 llamadas', () => {
  const dedup = crearDeduplicador()
  const acumulador = vacio()
  const eventos = [evento({ id: 'msg_1' }), evento({ id: 'msg_2' })]
  for (const ev of eventos) {
    if (dedup.visto(ev)) continue
    sumar(acumulador, ev)
  }
  assert.equal(acumulador.llamadas, 2)
})

test('dedup: evento sin id pero con requestId usa la clave de fallback', () => {
  const ev = evento({ requestId: 'req_1', entrada: 10, salida: 5 })
  // claveDedup fallback: `${requestId}|${entrada}|${salida}|${cacheLectura}`
  assert.equal(claveDedup(ev), 'req_1|10|5|0')

  const dedup = crearDeduplicador()
  assert.equal(dedup.visto(ev), false) // primera vez
  assert.equal(dedup.visto(ev), true) // repetido, misma clave de fallback
})

test('dedup: evento sin id ni requestId no tiene clave y se cuenta igual', () => {
  const ev = evento({})
  assert.equal(claveDedup(ev), null)

  const dedup = crearDeduplicador()
  // Una clave null nunca se marca como vista: se deja pasar siempre (mejor
  // sobrecontar un caso raro que perder datos reales).
  assert.equal(dedup.visto(ev), false)
  assert.equal(dedup.visto(ev), false)
  assert.equal(dedup.visto(ev), false)
})

// ---------------------------------------------------------------------------
// ventanas.js
// ---------------------------------------------------------------------------

test('ventanas: parsearDuracion interpreta las unidades soportadas', () => {
  assert.equal(parsearDuracion('24h'), 86_400_000)
  assert.equal(parsearDuracion('7d'), 604_800_000)
  assert.equal(parsearDuracion('30m'), 1_800_000)
  assert.equal(parsearDuracion('all'), Infinity)
  assert.equal(parsearDuracion('basura'), null)
})

test('ventanas: un evento con ts null queda fuera de una ventana acotada pero dentro de "all"', () => {
  const ahora = Date.UTC(2026, 7, 1, 12, 0, 0)
  const ventanaAcotada = construirVentana('24h', ahora)
  const ventanaAll = construirVentana('all', ahora)

  assert.equal(dentroDe(null, ventanaAcotada), false)
  assert.equal(dentroDe(null, ventanaAll), true)
})

test('ventanas: bucketsHorarios nunca supera 24 buckets e incluye los vacios en 0', () => {
  const ahora = Date.UTC(2026, 7, 1, 12, 30, 0)
  const ventana = construirVentana('7d', ahora) // mas de 24h -> se clampea a 24 buckets
  const buckets = bucketsHorarios([], ventana)
  assert.equal(buckets.length, 24)
  assert.ok(buckets.every((b) => b.tokens === 0 && b.llamadas === 0))
})

test('ventanas: bucketsHorarios no cuenta doble el cache (cache1h/cache5m ya estan en cacheCreacion)', () => {
  const ahora = Date.UTC(2026, 7, 1, 12, 30, 0)
  const ventana = construirVentana('24h', ahora)
  const ev = {
    ts: Date.UTC(2026, 7, 1, 12, 15, 0), // dentro del bucket de la hora 12
    uso: { entrada: 10, salida: 5, cacheCreacion: 100, cacheLectura: 1, cache1h: 100, cache5m: 0 },
  }
  const buckets = bucketsHorarios([ev], ventana)
  const bucket = buckets.find((b) => b.llamadas === 1)
  assert.ok(bucket, 'debe existir un bucket con el evento contado')
  // total = entrada + salida + cacheCreacion + cacheLectura = 10 + 5 + 100 + 1 = 116
  // (cache1h/cache5m NO se suman aparte: son el desglose de cacheCreacion)
  assert.equal(bucket.tokens, 116)
})

// ---------------------------------------------------------------------------
// actividad.js
// ---------------------------------------------------------------------------

test('actividad: tieneCierre gana sobre todo, incluso con pid vivo', () => {
  const estado = clasificar({
    pidVivo: true,
    escrituraReciente: true,
    tieneCierre: true,
    antiguedadMs: 0,
  })
  assert.equal(estado, TERMINADO)
})

test('actividad: pidVivo false es terminado aunque la escritura sea reciente', () => {
  const estado = clasificar({
    pidVivo: false,
    escrituraReciente: true,
    tieneCierre: false,
    antiguedadMs: 1000,
  })
  assert.equal(estado, TERMINADO)
})

test('actividad: pidVivo true con escritura reciente es corriendo', () => {
  const estado = clasificar({
    pidVivo: true,
    escrituraReciente: true,
    tieneCierre: false,
    antiguedadMs: 5000,
  })
  assert.equal(estado, CORRIENDO)
})

test('actividad: pidVivo true sin escritura reciente y antiguedad < 10 min es en_duda', () => {
  const estado = clasificar({
    pidVivo: true,
    escrituraReciente: false,
    tieneCierre: false,
    antiguedadMs: 5 * 60_000, // 5 min, por debajo de UMBRAL_DUDA_MS (10 min)
  })
  assert.equal(estado, EN_DUDA)
})

test('actividad: antiguedad > 10 min es terminado', () => {
  const estado = clasificar({
    pidVivo: true,
    escrituraReciente: false,
    tieneCierre: false,
    antiguedadMs: 11 * 60_000, // 11 min, por encima de UMBRAL_DUDA_MS
  })
  assert.equal(estado, TERMINADO)
})

// ---------------------------------------------------------------------------
// formato.js
// ---------------------------------------------------------------------------

test('formato: anchoVisual cuenta CJK como 2, ignora ANSI y da 0 en vacio', () => {
  assert.equal(anchoVisual('日本語'), 6) // 3 caracteres CJK x 2 celdas cada uno
  assert.equal(anchoVisual('\x1b[31mabc\x1b[0m'), 3) // ANSI se ignora, solo cuentan "abc"
  assert.equal(anchoVisual(''), 0)
})

test('formato: barra devuelve exactamente el ancho pedido, clampeando el porcentaje', () => {
  for (const pct of [-10, 0, 50, 100, 110]) {
    const b = barra(pct, 10)
    assert.equal(anchoVisual(b), 10, `barra(${pct}, 10) debe medir 10`)
  }
  // Casos exactos con ancho 10: -10 y 0 -> 0 llenas; 50 -> 5 llenas; 100 y 110 -> 10 llenas
  assert.equal(barra(-10, 10), '░'.repeat(10))
  assert.equal(barra(0, 10), '░'.repeat(10))
  assert.equal(barra(50, 10), '█'.repeat(5) + '░'.repeat(5))
  assert.equal(barra(100, 10), '█'.repeat(10))
  assert.equal(barra(110, 10), '█'.repeat(10))
})

test('formato: fmtTokens, fmtDinero y fmtDuracion nunca exceden 6 caracteres', () => {
  const valoresTokens = [0, 999, 1000, 999_999, 1_000_000, 1_000_000_000]
  for (const v of valoresTokens) {
    assert.ok(fmtTokens(v).length <= 6, `fmtTokens(${v}) = "${fmtTokens(v)}" excede 6 chars`)
    assert.ok(fmtDinero(v).length <= 6, `fmtDinero(${v}) = "${fmtDinero(v)}" excede 6 chars`)
  }
  const valoresDuracion = [0, 999, 60_000, 3_600_000, 86_400_000, 999_000_000_000]
  for (const ms of valoresDuracion) {
    assert.ok(fmtDuracion(ms).length <= 6, `fmtDuracion(${ms}) = "${fmtDuracion(ms)}" excede 6 chars`)
  }
})

test('formato: columnas devuelve exactamente N de ancho visual pese a textos largos o vacios', () => {
  const celdas = [
    { texto: 'un texto bastante mas largo que su columna', ancho: 5, alinear: 'i' },
    { texto: '', ancho: 5, alinear: 'i' },
    { texto: 'resto', ancho: -1, alinear: 'i' },
  ]
  const fila = columnas(celdas, 30)
  assert.equal(anchoVisual(fila), 30)
})

test('formato: truncar nunca excede el ancho pedido, ni cortando un caracter de ancho 2', () => {
  const resultado = truncar('日本語日本語', 5)
  assert.ok(anchoVisual(resultado) <= 5)
  // 日(2)+本(2) = 4 entra en el presupuesto (ancho 5 - elipsis 1 = 4); el
  // siguiente caracter de ancho 2 no entra completo -> se corta y se rellena.
  assert.equal(resultado, '日本…')
  assert.equal(anchoVisual(resultado), 5)
})

test('formato: sanearCelda convierte un emoji en un caracter de ancho 1', () => {
  const resultado = sanearCelda('📊 Sesion con emoji')
  assert.ok(!/\p{Extended_Pictographic}/u.test(resultado))
  assert.equal(resultado, '· Sesion con emoji')
})

test('formato: severidad clasifica los umbrales con su marca no cromatica', () => {
  assert.deepEqual(severidad(59), { nivel: 'ok', marca: '' })
  assert.deepEqual(severidad(60), { nivel: 'aviso', marca: '!' })
  assert.deepEqual(severidad(85), { nivel: 'alto', marca: '!!' })
  assert.deepEqual(severidad(95), { nivel: 'critico', marca: '!!' })
})
