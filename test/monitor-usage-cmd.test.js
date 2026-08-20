import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { monitor } from '../src/commands/monitor.js'
import { CARPETA_USAGE } from '../src/monitor/adapters/vault-usage-db.js'
import { mkClaudeHome } from './helpers-monitor.js'

// Este archivo responde: "souclaude monitor --usage entrega la consulta
// completa de SHS-M3-T004 — filtros de drill-down, ventanas de rate limit con
// consumo propio, sesiones activas, pico diario, agrupaciones nuevas y
// sesiones impresas — en texto y en JSON?". helpers.js (via helpers-monitor)
// fuerza CI=true, asi que el pull de frescura del Vault se omite solo.

const MINUTO = 60_000
const HORA = 3_600_000
const DIA = 86_400_000

function mkVaultYCwd(registros) {
  const vault = fs.mkdtempSync(path.join(os.tmpdir(), 'souclaude-usage-vault-'))
  const carpeta = path.join(vault, ...CARPETA_USAGE.split('/'))
  fs.mkdirSync(carpeta, { recursive: true })
  fs.writeFileSync(
    path.join(carpeta, 'pc01--2026-08.jsonl'),
    registros.map((r) => JSON.stringify(r)).join('\n') + '\n',
    'utf8',
  )

  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'souclaude-usage-cwd-'))
  fs.mkdirSync(path.join(cwd, '.claude'), { recursive: true })
  fs.writeFileSync(
    path.join(cwd, '.claude', 'vault.local.json'),
    JSON.stringify({ path: vault, project: 'Project-SHS' }),
    'utf8',
  )
  return { vault, cwd }
}

function registro(ahora, extra = {}) {
  return {
    version: 1,
    sessionId: 'sesion-0001',
    generadoEn: new Date(ahora - 4 * MINUTO).toISOString(),
    inicio: new Date(ahora - 2 * HORA).toISOString(),
    fin: new Date(ahora - 5 * MINUTO).toISOString(),
    proyecto: 'souclaude',
    rama: 'feature/SHS-M3-T004-usage-completo',
    milestone: 'SHS-M3',
    quien: 'ignacio',
    cuenta: { uuid: 'uuid-1', alias: 'dev' },
    maquina: { machineID: 'maq-1', hostname: 'PC01' },
    tokens: { entrada: 1000, salida: 100, cacheCreacion: 200, cacheLectura: 300 },
    costoUsd: 1.5,
    llamadas: 10,
    porModelo: [{ alias: 'fable', tokensIn: 1400, tokensOut: 90, costoUsd: 1.4 }],
    ...extra,
  }
}

function homeConLimites(ahora) {
  return mkClaudeHome({
    config: {
      cachedUsageUtilization: {
        fetchedAtMs: ahora - MINUTO,
        utilization: {
          five_hour: { utilization: 40, resets_at: ahora + 2 * HORA },
          seven_day: { utilization: 60, resets_at: ahora + 3 * DIA },
          limits: [
            {
              kind: 'weekly_scoped',
              percent: 80,
              severity: 'warning',
              resets_at: ahora + 3 * DIA,
              scope: { model: { display_name: 'Fable' } },
              is_active: true,
            },
          ],
        },
      },
    },
  })
}

async function correrUsage(flags, cwd) {
  const original = console.log
  let salida = ''
  console.log = (...args) => {
    salida += args.join(' ') + '\n'
  }
  let code
  try {
    code = await monitor(flags, cwd)
  } finally {
    console.log = original
  }
  return { code, salida }
}

test('--usage --json: ventanas de limite con consumo propio, activas, pico y agrupaciones nuevas', async () => {
  const ahora = Date.now()
  const { cwd } = mkVaultYCwd([
    registro(ahora),
    registro(ahora, {
      sessionId: 's-vieja',
      quien: 'colega',
      fin: new Date(ahora - 2 * DIA).toISOString(),
      generadoEn: new Date(ahora - 2 * DIA).toISOString(),
      tokens: { entrada: 50, salida: 5, cacheCreacion: 0, cacheLectura: 0 },
      porModelo: [],
      milestone: null,
    }),
  ])
  const home = homeConLimites(ahora)

  const { code, salida } = await correrUsage({ usage: true, json: true, 'claude-home': home }, cwd)
  assert.equal(code, 0)
  const datos = JSON.parse(salida)

  // Ventanas alineadas al reset real, con el consumo del registro adentro.
  assert.deepEqual(datos.ventanasLimite.map((v) => v.clave), ['5h', '7d', 'modelo:fable'])
  const v5h = datos.ventanasLimite[0]
  assert.equal(v5h.alineada, true)
  assert.equal(v5h.porcentaje, 40)
  assert.equal(v5h.sesiones, 1) // la vieja queda fuera de la ventana de 5h
  assert.equal(v5h.consumo.tokensIn, 1500)
  const fable = datos.ventanasLimite[2]
  assert.equal(fable.modelo, 'Fable')
  assert.deepEqual(fable.consumo, { tokensIn: 1400, tokensOut: 90, desglose: null, costoUsd: 1.4, llamadas: null })

  // Solo la sesion fresca esta activa; el pico diario sale de la serie porDia.
  assert.deepEqual(datos.activas.map((s) => s.sessionId), ['sesion-0001'])
  assert.equal(typeof datos.activas[0].frescuraMs, 'number')
  assert.equal(datos.pico.tokens, 1600)

  // Las agrupaciones de T001 viajan completas en el JSON.
  assert.deepEqual(datos.porMilestone.map((g) => g.clave).sort(), ['SHS-M3', 'n/d'])
  assert.deepEqual(datos.porModelo, [{ clave: 'fable', tokensIn: 1400, tokensOut: 90, costoUsd: 1.4, sesiones: 1 }])
  assert.equal(datos.totales.desglose.cacheLectura, 300)
  assert.deepEqual(datos.filtros, {})
})

test('--usage --json con filtros: --quien/--cuenta/--project acotan todo el modelo y quedan declarados', async () => {
  const ahora = Date.now()
  const { cwd } = mkVaultYCwd([
    registro(ahora),
    registro(ahora, { sessionId: 's2', quien: 'colega', proyecto: 'otro', cuenta: { uuid: 'uuid-2', alias: 'ops' } }),
  ])
  const home = homeConLimites(ahora)

  const { code, salida } = await correrUsage({ usage: true, json: true, quien: 'colega', 'claude-home': home }, cwd)
  assert.equal(code, 0)
  const datos = JSON.parse(salida)
  assert.deepEqual(datos.filtros, { quien: 'colega' })
  assert.deepEqual(datos.sesiones.map((s) => s.sessionId), ['s2'])
  // El filtro tambien acota el consumo dentro de las ventanas de limite.
  assert.equal(datos.ventanasLimite[0].consumo.tokensIn, 1500)
  assert.deepEqual(datos.activas.map((s) => s.sessionId), ['s2'])

  const porCuenta = await correrUsage({ usage: true, json: true, cuenta: 'ops', 'claude-home': home }, cwd)
  assert.deepEqual(JSON.parse(porCuenta.salida).sesiones.map((s) => s.sessionId), ['s2'])

  const porProyecto = await correrUsage({ usage: true, json: true, project: 'souclaude', 'claude-home': home }, cwd)
  assert.deepEqual(JSON.parse(porProyecto.salida).sesiones.map((s) => s.sessionId), ['sesion-0001'])
})

test('--usage en texto: imprime ventanas, activas, pico, agrupaciones nuevas y sesiones (top)', async () => {
  const ahora = Date.now()
  const { cwd } = mkVaultYCwd([registro(ahora)])
  const home = homeConLimites(ahora)

  const { code, salida } = await correrUsage({ usage: true, 'claude-home': home }, cwd)
  assert.equal(code, 0)
  assert.match(salida, /CONSUMO \(all\)/)
  assert.match(salida, /desglose · entrada 1k · cache creacion 200 · cache lectura 300 · salida 100/)
  assert.match(salida, /VENTANAS DE LIMITE/)
  assert.match(salida, /Ventana 5h · 40% del limite/)
  assert.match(salida, /Semanal Fable · 80% del limite/)
  assert.match(salida, /ACTIVAS AHORA/)
  assert.match(salida, /ignacio @ PC01 · souclaude/)
  assert.match(salida, /PICO · /)
  assert.match(salida, /POR MILESTONE/)
  assert.match(salida, /POR MODELO/)
  assert.match(salida, /SESIONES \(top 1 de 1\)/)
})

test('--usage sin limites legibles: la consulta sale igual, sin la seccion de ventanas', async () => {
  const ahora = Date.now()
  const { cwd } = mkVaultYCwd([registro(ahora)])
  const home = mkClaudeHome({}) // sin .claude.json hermano

  const { code, salida } = await correrUsage({ usage: true, 'claude-home': home }, cwd)
  assert.equal(code, 0)
  assert.match(salida, /CONSUMO \(all\)/)
  assert.ok(!salida.includes('VENTANAS DE LIMITE'))
})
