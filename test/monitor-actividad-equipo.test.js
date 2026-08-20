import { test } from 'node:test'
import assert from 'node:assert/strict'

import { agregarUsage } from '../src/monitor/domain/usage-agregado.js'
import { sesionesActivas, picoDiario, UMBRAL_ACTIVA_MS } from '../src/monitor/domain/actividad-equipo.js'

// Este archivo responde: "una sesion de otra maquina cuenta como activa solo
// si su registro esta fresco (max de fin/generadoEn), y el pico diario sale
// de la serie porDia con fecha y magnitud?" (SHS-M3-T003).

const AHORA = Date.parse('2026-08-20T18:00:00.000Z')
const MINUTO = 60_000

function registro(extra = {}) {
  return {
    version: 1,
    sessionId: 'sesion-0001',
    generadoEn: new Date(AHORA - 5 * MINUTO).toISOString(),
    inicio: '2026-08-20T15:00:00.000Z',
    fin: new Date(AHORA - 10 * MINUTO).toISOString(),
    proyecto: 'souclaude',
    quien: 'ignacio',
    cuenta: { uuid: 'uuid-1', alias: 'dev' },
    maquina: { hostname: 'PC01' },
    tokens: { entrada: 1000, salida: 100, cacheCreacion: 0, cacheLectura: 0 },
    costoUsd: 1,
    llamadas: 5,
    porModelo: [],
    ...extra,
  }
}

function sesionesDe(registros) {
  return agregarUsage(registros).sesiones
}

test('activas: decide por el maximo de fin/generadoEn contra el umbral, ordenadas por frescura', () => {
  const sesiones = sesionesDe([
    registro(), // generadoEn hace 5 min: activa
    registro({
      sessionId: 's2',
      quien: 'colega',
      maquina: { hostname: 'PC02' },
      // fin viejo pero generadoEn justo en el umbral: sigue activa (el max manda)
      fin: new Date(AHORA - 60 * MINUTO).toISOString(),
      generadoEn: new Date(AHORA - UMBRAL_ACTIVA_MS).toISOString(),
    }),
    registro({ sessionId: 's3', fin: new Date(AHORA - 40 * MINUTO).toISOString(), generadoEn: new Date(AHORA - 40 * MINUTO).toISOString() }), // vieja
  ])

  const activas = sesionesActivas(sesiones, AHORA)
  assert.deepEqual(activas.map((s) => s.sessionId), ['sesion-0001', 's2'])
  assert.equal(activas[0].frescuraMs, 5 * MINUTO)
  assert.equal(activas[1].frescuraMs, UMBRAL_ACTIVA_MS)
})

test('activas: sin fin ni generadoEn parseables no es activa; un timestamp futuro es frescura 0, no negativa', () => {
  const sesiones = sesionesDe([
    registro({ sessionId: 'sin-fechas', fin: null, generadoEn: 'no-es-fecha' }),
    registro({ sessionId: 'futura', generadoEn: new Date(AHORA + 2 * MINUTO).toISOString() }),
  ])
  const activas = sesionesActivas(sesiones, AHORA)
  assert.deepEqual(activas.map((s) => s.sessionId), ['futura'])
  assert.equal(activas[0].frescuraMs, 0)
})

test('activas: el umbral es configurable', () => {
  const sesiones = sesionesDe([registro()])
  assert.equal(sesionesActivas(sesiones, AHORA, { umbralMs: 2 * MINUTO }).length, 0)
})

test('pico: el dia de mayor volumen total (in + out), ignorando n/d; sin dias fechados es null', () => {
  const agregado = agregarUsage([
    registro({ fin: '2026-08-18T10:00:00.000Z', tokens: { entrada: 500, salida: 50, cacheCreacion: 0, cacheLectura: 0 } }),
    registro({ sessionId: 's2', fin: '2026-08-19T10:00:00.000Z', tokens: { entrada: 100, salida: 900, cacheCreacion: 0, cacheLectura: 0 }, costoUsd: 2, llamadas: 3 }),
    registro({ sessionId: 's3', fin: null, inicio: null, generadoEn: '2026-08-19T11:00:00.000Z', tokens: { entrada: 9000, salida: 0, cacheCreacion: 0, cacheLectura: 0 } }),
  ])

  const pico = picoDiario(agregado.porDia)
  assert.deepEqual(pico, {
    fecha: '2026-08-19',
    tokens: 1000,
    tokensIn: 100,
    tokensOut: 900,
    costoUsd: 2,
    llamadas: 3,
    sesiones: 1,
  })

  assert.equal(picoDiario([{ clave: 'n/d', tokensIn: 1, tokensOut: 1, costoUsd: 0, llamadas: 0, sesiones: 1 }]), null)
  assert.equal(picoDiario([]), null)
})

test('agregado: las sesiones materializadas conservan inicio, fin y generadoEn para la vista de actividad', () => {
  const s = sesionesDe([registro()])[0]
  assert.equal(s.inicio, '2026-08-20T15:00:00.000Z')
  assert.equal(s.fin, new Date(AHORA - 10 * MINUTO).toISOString())
  assert.equal(s.generadoEn, new Date(AHORA - 5 * MINUTO).toISOString())
})
