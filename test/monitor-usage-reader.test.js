import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { leerRegistrosDeUsage } from '../src/monitor/adapters/vault-usage-reader.js'
import { CARPETA_USAGE } from '../src/monitor/adapters/vault-usage-db.js'
import { agregarUsage } from '../src/monitor/domain/usage-agregado.js'

// Este archivo responde: "el lector entrega los registros v1 con tolerancia a
// lineas rotas, y el dominio los deduplica y agrega por cuenta, quien,
// proyecto y maquina?" (SHS-M2-T004) — y desde SHS-M3-T001, "el agregado
// conserva desglose y porModelo, agrupa por milestone y por dia, y filtra por
// proyecto/quien/cuenta?".

function mkVault(archivos = {}) {
  const vault = fs.mkdtempSync(path.join(os.tmpdir(), 'souclaude-vault-'))
  const carpeta = path.join(vault, ...CARPETA_USAGE.split('/'))
  fs.mkdirSync(carpeta, { recursive: true })
  for (const [nombre, lineas] of Object.entries(archivos)) {
    fs.writeFileSync(path.join(carpeta, nombre), lineas.join('\n') + '\n', 'utf8')
  }
  return vault
}

function registro(extra = {}) {
  return {
    version: 1,
    sessionId: 'sesion-0001',
    generadoEn: '2026-08-20T10:00:00.000Z',
    inicio: '2026-08-20T08:00:00.000Z',
    fin: '2026-08-20T09:30:00.000Z',
    proyecto: 'souclaude',
    rama: 'feature/SHS-M2-T004-lector',
    milestone: 'SHS-M2',
    quien: 'ignacio',
    cuenta: { uuid: 'uuid-1', alias: 'dev' },
    maquina: { machineID: 'maq-1', hostname: 'PC01' },
    tokens: { entrada: 100_000, salida: 10_000, cacheCreacion: 20_000, cacheLectura: 30_000 },
    costoUsd: 1.5,
    llamadas: 10,
    porModelo: [],
    ...extra,
  }
}

test('lector: junta los registros de todos los archivos y avisa por lineas rotas, versiones ajenas y sin sessionId', () => {
  const vault = mkVault({
    'pc01--2026-08.jsonl': [
      JSON.stringify(registro()),
      '{esto no es json',
      JSON.stringify(registro({ sessionId: '', version: 1 })),
    ],
    'pc02--2026-08.jsonl': [
      JSON.stringify(registro({ sessionId: 'sesion-0002', version: 99 })),
      JSON.stringify(registro({ sessionId: 'sesion-0003', quien: 'colega', maquina: { hostname: 'PC02' } })),
    ],
  })
  const { registros, warnings } = leerRegistrosDeUsage(vault)
  assert.deepEqual(registros.map((r) => r.sessionId), ['sesion-0001', 'sesion-0003'])
  assert.equal(warnings.length, 3)
  assert.ok(warnings.some((w) => w.reason.includes('corrupta')))
  assert.ok(warnings.some((w) => w.reason.includes('version 99')))
  assert.ok(warnings.some((w) => w.reason.includes('sin sessionId')))
})

test('lector: sin vault o sin carpeta devuelve vacio sin lanzar', () => {
  assert.deepEqual(leerRegistrosDeUsage(null), { registros: [], warnings: [] })
  const vacio = fs.mkdtempSync(path.join(os.tmpdir(), 'souclaude-vacio-'))
  assert.deepEqual(leerRegistrosDeUsage(vacio), { registros: [], warnings: [] })
})

test('agregado: deduplica por sessionId (gana el generadoEn mas nuevo) y suma totales', () => {
  const viejo = registro({ tokens: { entrada: 1, salida: 1, cacheCreacion: 0, cacheLectura: 0 }, costoUsd: 0.1, llamadas: 1 })
  const nuevo = registro({ generadoEn: '2026-08-20T11:00:00.000Z' })
  const otro = registro({ sessionId: 'sesion-0002', quien: 'colega', proyecto: 'otro', cuenta: { uuid: 'uuid-2', alias: 'ops' }, maquina: { hostname: 'PC02' }, costoUsd: 0.5, llamadas: 5 })

  const agregado = agregarUsage([viejo, nuevo, otro])
  assert.equal(agregado.sesiones.length, 2)
  assert.deepEqual(agregado.totales, {
    tokensIn: 300_000,
    tokensOut: 20_000,
    desglose: { entrada: 200_000, salida: 20_000, cacheCreacion: 40_000, cacheLectura: 60_000 },
    costoUsd: 2,
    llamadas: 15,
    sesiones: 2,
  })
})

test('agregado: agrupa por quien, cuenta, proyecto y maquina, ordenado por tokensIn', () => {
  const agregado = agregarUsage([
    registro(),
    registro({ sessionId: 's2', quien: 'colega', proyecto: 'otro', cuenta: { uuid: 'uuid-2', alias: 'ops' }, maquina: { hostname: 'PC02' }, tokens: { entrada: 10, salida: 5, cacheCreacion: 0, cacheLectura: 0 }, costoUsd: 0.25, llamadas: 2 }),
    registro({ sessionId: 's3', tokens: { entrada: 50, salida: 5, cacheCreacion: 0, cacheLectura: 0 }, costoUsd: 0.05, llamadas: 1 }),
  ])
  assert.deepEqual(agregado.porQuien, [
    {
      clave: 'ignacio',
      tokensIn: 150_050,
      tokensOut: 10_005,
      desglose: { entrada: 100_050, salida: 10_005, cacheCreacion: 20_000, cacheLectura: 30_000 },
      costoUsd: 1.55,
      llamadas: 11,
      sesiones: 2,
    },
    {
      clave: 'colega',
      tokensIn: 10,
      tokensOut: 5,
      desglose: { entrada: 10, salida: 5, cacheCreacion: 0, cacheLectura: 0 },
      costoUsd: 0.25,
      llamadas: 2,
      sesiones: 1,
    },
  ])
  assert.deepEqual(agregado.porProyecto.map((g) => g.clave), ['souclaude', 'otro'])
  assert.deepEqual(agregado.porCuenta.map((g) => g.clave), ['dev', 'ops'])
  assert.deepEqual(agregado.porMaquina.map((g) => g.clave), ['PC01', 'PC02'])
})

test('agregado: el periodo filtra por el fin de la sesion; quien ausente agrupa como n/d', () => {
  const dentro = registro()
  const fuera = registro({ sessionId: 's2', fin: '2026-07-01T00:00:00.000Z', quien: null })
  const desde = Date.parse('2026-08-01T00:00:00.000Z')

  const conFiltro = agregarUsage([dentro, fuera], { desde })
  assert.deepEqual(conFiltro.sesiones.map((s) => s.sessionId), ['sesion-0001'])

  const sinFiltro = agregarUsage([dentro, fuera])
  assert.deepEqual(sinFiltro.porQuien.map((g) => g.clave).sort(), ['ignacio', 'n/d'])
})

test('agregado: conserva porModelo por sesion y lo agrupa por alias (SHS-M3-T001)', () => {
  const agregado = agregarUsage([
    registro({ porModelo: [{ alias: 'opus', tokensIn: 100, tokensOut: 10, costoUsd: 0.5 }] }),
    registro({
      sessionId: 's2',
      porModelo: [
        { alias: 'opus', tokensIn: 50, tokensOut: 5, costoUsd: 0.25 },
        { alias: 'haiku', tokensIn: 20, tokensOut: 2, costoUsd: 0.01 },
      ],
    }),
    registro({ sessionId: 's3', porModelo: [{ alias: '', tokensIn: 9 }, null] }),
  ])
  assert.deepEqual(agregado.porModelo, [
    { clave: 'opus', tokensIn: 150, tokensOut: 15, costoUsd: 0.75, sesiones: 2 },
    { clave: 'haiku', tokensIn: 20, tokensOut: 2, costoUsd: 0.01, sesiones: 1 },
  ])
  assert.deepEqual(agregado.sesiones.find((s) => s.sessionId === 'sesion-0001').porModelo, [
    { alias: 'opus', tokensIn: 100, tokensOut: 10, costoUsd: 0.5 },
  ])
})

test('agregado: agrupa por milestone y arma la serie diaria cronologica con n/d al final (SHS-M3-T001)', () => {
  const agregado = agregarUsage([
    registro({ fin: '2026-08-20T09:30:00.000Z' }),
    registro({ sessionId: 's2', fin: '2026-08-18T12:00:00.000Z', milestone: 'SHS-M3' }),
    registro({ sessionId: 's3', fin: null, inicio: '2026-08-19T08:00:00.000Z', milestone: null }),
  ])
  assert.deepEqual(agregado.porMilestone.map((g) => g.clave).sort(), ['SHS-M2', 'SHS-M3', 'n/d'])
  assert.deepEqual(agregado.porDia.map((g) => g.clave), ['2026-08-18', '2026-08-20', 'n/d'])
  assert.equal(agregado.porDia[0].sesiones, 1)
})

test('agregado: filtra por proyecto, quien y cuenta sin distinguir mayusculas; cuenta matchea alias o uuid (SHS-M3-T001)', () => {
  const registros = [
    registro(),
    registro({ sessionId: 's2', proyecto: 'otro', quien: 'colega', cuenta: { uuid: 'uuid-2', alias: 'ops' } }),
  ]
  assert.deepEqual(agregarUsage(registros, { proyecto: 'SouClaude' }).sesiones.map((s) => s.sessionId), ['sesion-0001'])
  assert.deepEqual(agregarUsage(registros, { quien: 'colega' }).sesiones.map((s) => s.sessionId), ['s2'])
  assert.deepEqual(agregarUsage(registros, { cuenta: 'ops' }).sesiones.map((s) => s.sessionId), ['s2'])
  assert.deepEqual(agregarUsage(registros, { cuenta: 'uuid-1' }).sesiones.map((s) => s.sessionId), ['sesion-0001'])
  assert.equal(agregarUsage(registros, { proyecto: 'inexistente' }).totales.sesiones, 0)
})

// --- lector cacheado para el tick del panel (SHS-M3-T005) ---

import { createVaultUsageReader } from '../src/monitor/adapters/vault-usage-reader.js'

test('lector cacheado: dentro del TTL no relee el disco y pasado el TTL si', () => {
  let lecturas = 0
  const reader = createVaultUsageReader({
    vaultPath: '/vault',
    ttlMs: 30_000,
    lector: () => {
      lecturas += 1
      return { registros: [{ sessionId: `s-${lecturas}` }], warnings: [] }
    },
  })

  const t0 = 1_000_000
  const a = reader.leer({ ahora: t0 })
  const b = reader.leer({ ahora: t0 + 29_999 })
  assert.equal(lecturas, 1)
  assert.equal(a, b)

  const c = reader.leer({ ahora: t0 + 30_000 })
  assert.equal(lecturas, 2)
  assert.equal(c.registros[0].sessionId, 's-2')
})
