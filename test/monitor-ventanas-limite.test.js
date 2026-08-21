import { test } from 'node:test'
import assert from 'node:assert/strict'

import { ventanasDeLimite, consumoPorVentana } from '../src/monitor/domain/ventanas-limite.js'

// Este archivo responde: "las ventanas de rate limit se alinean al reseteaEn
// real de la API (con fallback rodante avisado), y el consumo propio del
// registro del Vault cae en la ventana correcta, incluida la atribucion por
// modelo de la fila Fable?" (SHS-M3-T002).

const HORA = 3_600_000
const DIA = 86_400_000
const AHORA = Date.parse('2026-08-20T18:00:00.000Z')

function limites(extra = {}) {
  return {
    cincoHoras: { porcentaje: 40, reseteaEn: AHORA + 2 * HORA },
    sieteDias: { porcentaje: 60, reseteaEn: AHORA + 3 * DIA },
    porGrupo: [
      { tipo: 'session', modelo: null, porcentaje: 40, reseteaEn: AHORA + 2 * HORA },
      { tipo: 'weekly_scoped', modelo: 'Fable', porcentaje: 80, reseteaEn: AHORA + 3 * DIA },
    ],
    ...extra,
  }
}

function registro(extra = {}) {
  return {
    version: 1,
    sessionId: 'sesion-0001',
    generadoEn: '2026-08-20T17:00:00.000Z',
    inicio: '2026-08-20T15:00:00.000Z',
    fin: '2026-08-20T17:00:00.000Z',
    proyecto: 'souclaude',
    quien: 'ignacio',
    cuenta: { uuid: 'uuid-1', alias: 'dev' },
    maquina: { hostname: 'PC01' },
    tokens: { entrada: 1000, salida: 100, cacheCreacion: 0, cacheLectura: 0 },
    costoUsd: 1,
    llamadas: 5,
    porModelo: [{ alias: 'fable', tokensIn: 900, tokensOut: 90, costoUsd: 0.9 }],
    ...extra,
  }
}

test('ventanas: se alinean al reseteaEn real (desde = reset - duracion) y aceptan ISO', () => {
  const ventanas = ventanasDeLimite(limites({ sieteDias: { porcentaje: 60, reseteaEn: new Date(AHORA + 3 * DIA).toISOString() } }), AHORA)

  const v5h = ventanas.find((v) => v.clave === '5h')
  assert.equal(v5h.desde, AHORA + 2 * HORA - 5 * HORA)
  assert.equal(v5h.hasta, AHORA)
  assert.equal(v5h.alineada, true)
  assert.equal(v5h.porcentaje, 40)

  const v7d = ventanas.find((v) => v.clave === '7d')
  assert.equal(v7d.desde, AHORA + 3 * DIA - 7 * DIA)
  assert.equal(v7d.alineada, true)
})

test('ventanas: sin reseteaEn utilizable (null o en el pasado) caen a rodante con alineada false', () => {
  const ventanas = ventanasDeLimite(
    limites({
      cincoHoras: { porcentaje: 40, reseteaEn: null },
      sieteDias: { porcentaje: 60, reseteaEn: AHORA - HORA },
    }),
    AHORA,
  )
  const v5h = ventanas.find((v) => v.clave === '5h')
  assert.equal(v5h.desde, AHORA - 5 * HORA)
  assert.equal(v5h.alineada, false)
  const v7d = ventanas.find((v) => v.clave === '7d')
  assert.equal(v7d.desde, AHORA - 7 * DIA)
  assert.equal(v7d.alineada, false)
})

test('ventanas: porGrupo solo aporta los limites por modelo (la fila Fable), tipados y con alias', () => {
  const ventanas = ventanasDeLimite(limites(), AHORA)
  assert.deepEqual(ventanas.map((v) => v.clave), ['5h', '7d', 'modelo:fable'])

  const fable = ventanas.find((v) => v.clave === 'modelo:fable')
  assert.equal(fable.tipo, 'weekly_scoped')
  assert.equal(fable.modelo, 'Fable')
  assert.equal(fable.alias, 'fable')
  assert.equal(fable.etiqueta, 'Semanal Fable')
  assert.equal(fable.desde, AHORA + 3 * DIA - 7 * DIA)
})

test('ventanas: sin limites no hay ventanas', () => {
  assert.deepEqual(ventanasDeLimite(null, AHORA), [])
})

test('consumo: cada sesion cae en la ventana que contiene su fin; el desglose viaja en las globales', () => {
  const registros = [
    registro(), // fin hace 1h: entra en 5h y en 7d
    registro({ sessionId: 's2', fin: new Date(AHORA - 8 * HORA).toISOString(), porModelo: [] }), // solo 7d
    registro({ sessionId: 's3', fin: '2026-08-01T00:00:00.000Z', porModelo: [] }), // fuera de todo
  ]
  const ventanas = consumoPorVentana(registros, limites(), AHORA)

  const v5h = ventanas.find((v) => v.clave === '5h')
  assert.equal(v5h.sesiones, 1)
  assert.deepEqual(v5h.consumo, {
    tokensIn: 1000,
    tokensOut: 100,
    desglose: { entrada: 1000, salida: 100, cacheCreacion: 0, cacheLectura: 0 },
    costoUsd: 1,
    llamadas: 5,
  })

  const v7d = ventanas.find((v) => v.clave === '7d')
  assert.equal(v7d.sesiones, 2)
  assert.equal(v7d.consumo.tokensIn, 2000)
})

test('consumo: la ventana por modelo atribuye desde porModelo, sin inventar llamadas ni desglose', () => {
  const ventanas = consumoPorVentana([registro()], limites(), AHORA)
  const fable = ventanas.find((v) => v.clave === 'modelo:fable')
  assert.equal(fable.sesiones, 1)
  assert.deepEqual(fable.consumo, { tokensIn: 900, tokensOut: 90, desglose: null, costoUsd: 0.9, llamadas: null })
})

test('consumo: los filtros del agregado (quien, proyecto, cuenta) aplican dentro de la ventana', () => {
  const registros = [registro(), registro({ sessionId: 's2', quien: 'colega' })]
  const ventanas = consumoPorVentana(registros, limites(), AHORA, { quien: 'colega' })
  const v5h = ventanas.find((v) => v.clave === '5h')
  assert.equal(v5h.sesiones, 1)
  assert.equal(v5h.consumo.tokensIn, 1000)
})
