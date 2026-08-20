import { test } from 'node:test'
import assert from 'node:assert/strict'
import path from 'node:path'

import { presentar } from '../src/monitor/adapters/panel-presenter.js'
import { createLimitsReader } from '../src/monitor/adapters/usage-limits-reader.js'
import { construirVista } from '../src/monitor/domain/arbol.js'
import { mkClaudeHome, lineaAssistant } from './helpers-monitor.js'

// Este archivo responde: "la fila del gasto Extra que arma panel-presenter.js
// refleja el porcentaje que la API ya calculo, no un recalculo local que puede
// divergir por redondeo de decimal_places?" (SHS-H3-T101, RF-01).
//
// El fixture pasa por el pipeline real: mkClaudeHome escribe un .claude.json
// con la forma exacta del payload de la maquina real (2026-08-06),
// createLimitsReader().read() lo parsea con usage-limits-reader.js
// (toGastoExtra) tal como lo hace snapshot-source.js, y presentar() arma la
// fila final. Ningun paso se mockea: si se revierte el fix (panel-presenter.js
// vuelve a usar `extra.porcentaje` en vez de `extra.utilizacion`), el test
// falla con 107 (el recalculo local de 2136/2000*100 redondea distinto de 100).

const AHORA = Date.UTC(2026, 7, 10, 12, 0, 0)

// Payload real verificado el 2026-08-06 (ver plan.md "Input"): decimal_places
// default 2, used_credits/monthly_limit en centavos.
function configConExtra(extraOverrides = {}) {
  return {
    cachedUsageUtilization: {
      fetchedAtMs: AHORA,
      utilization: {
        extra_usage: {
          is_enabled: false,
          monthly_limit: 2000,
          used_credits: 2136,
          utilization: 100,
          disabled_reason: 'org_level_disabled_until',
          spend_limit_reached: true,
          ...extraOverrides,
        },
      },
    },
  }
}

async function leerLimites(config) {
  const claudeDir = mkClaudeHome({ config })
  const configFile = path.join(claudeDir, '..', '.claude.json')
  const reader = createLimitsReader()
  const { limits } = await reader.read(configFile, { ahora: AHORA })
  return limits
}

function filaExtra(limites) {
  const vista = presentar({ limites }, { ahora: AHORA })
  return vista.limites.find((f) => f.etiqueta.startsWith('Extra'))
}

test('payload real 2026-08-06: la fila del extra reporta 100%, no el 107% recalculado', async () => {
  const limites = await leerLimites(configConExtra())

  // Se confirma que el bug de recalculo sigue presente en el dato crudo del
  // dominio (usadoUsd/limiteUsd*100 = 21.36/20*100 ~ 106.8, no 100): el fix
  // vive en cual campo usa panel-presenter.js, no en usage-limits-reader.js.
  assert.ok(Math.abs(limites.gastoExtra.porcentaje - 106.8) < 0.01)
  assert.equal(limites.gastoExtra.utilizacion, 100)
  assert.equal(limites.gastoExtra.motivoDeshabilitado, 'org_level_disabled_until')

  const fila = filaExtra(limites)
  assert.ok(fila, 'la fila del extra deberia estar presente')
  assert.equal(fila.porcentaje, 100)
})

test('el texto de la fila del extra sigue mostrando usadoUsd/limiteUsd en dolares', async () => {
  const limites = await leerLimites(configConExtra())
  const fila = filaExtra(limites)

  assert.equal(fila.etiqueta, 'Extra $21.36/$20.00')
})

test('sin utilizacion numerica (payload viejo/incompleto), la fila cae al recalculo local', async () => {
  const limites = await leerLimites(configConExtra({ utilization: 'no-numero' }))
  const fila = filaExtra(limites)

  assert.equal(limites.gastoExtra.utilizacion, null)
  // Division en punto flotante (2136/2000*100): tolerancia, no igualdad estricta.
  assert.ok(Math.abs(fila.porcentaje - 106.8) < 0.01)
})

// SHS-H3-T102 (RF-02): la clave de dedup de filasDeLimites pasa de
// `${porcentaje}|${reseteaEn}` a `${tipo}|${modelo}|${porcentaje}|${reseteaEn}`.
// Con la clave vieja, cualquier entrada de limits[] que por coincidencia
// comparta % y reset con la ventana 7d desaparecia, aunque fuera un limite
// distinto (ej. un weekly_scoped por modelo). Con la clave nueva solo se
// descarta el duplicado REAL (weekly_all == seven_day, mismo tipo logico).

const RESETEA_EN = Date.UTC(2026, 7, 13, 0, 0, 0)

function configConLimiteSemanal(entradaDeLimits) {
  return {
    cachedUsageUtilization: {
      fetchedAtMs: AHORA,
      utilization: {
        seven_day: { utilization: 50, resets_at: RESETEA_EN },
        limits: [entradaDeLimits],
      },
    },
  }
}

test('seven_day y weekly_scoped por modelo con igual % e igual reset: las dos filas quedan, no colapsan', async () => {
  const limites = await leerLimites(
    configConLimiteSemanal({
      kind: 'weekly_scoped',
      percent: 50,
      resets_at: RESETEA_EN,
      scope: { model: { display_name: 'Fable' } },
    })
  )

  const vista = presentar({ limites }, { ahora: AHORA })
  const filasDelCincuenta = vista.limites.filter((f) => f.porcentaje === 50)

  assert.equal(filasDelCincuenta.length, 2, 'seven_day y el limite de Fable son limites distintos: dos filas')
  assert.ok(filasDelCincuenta.some((f) => f.etiqueta.includes('Fable')))
  assert.ok(filasDelCincuenta.some((f) => f.etiqueta === 'Ventana 7d'))
})

test('weekly_all duplica a seven_day (mismo tipo logico, mismo % y reset): sigue colapsando a una fila', async () => {
  const limites = await leerLimites(
    configConLimiteSemanal({
      kind: 'weekly_all',
      percent: 50,
      resets_at: RESETEA_EN,
      scope: null,
    })
  )

  const vista = presentar({ limites }, { ahora: AHORA })
  const filasDelCincuenta = vista.limites.filter((f) => f.porcentaje === 50)

  assert.equal(filasDelCincuenta.length, 1, 'weekly_all es el mismo limite que seven_day: una sola fila')
  assert.equal(filasDelCincuenta[0].etiqueta, 'Ventana 7d')
})

// SHS-H3-T105 (RF-05): el extra que ya paso a `historico` (24h+ desde que se
// detecto alcanzado, domain/gasto-extra.js::estadoDelExtra) sale de las filas
// vivas y aparece en la seccion Historico; el que sigue vivo (<24h) se comporta
// exactamente igual que antes. La decision se toma en domain/arbol.js
// (construirVista), no aca: estos tests pasan por `construirVista` real, no
// fixturean el flag `historico` a mano.

const AHORA_T105 = Date.UTC(2026, 7, 10, 12, 0, 0)

function snapshotConExtra(horasDesdeDeteccion) {
  const detectadoEn = AHORA_T105 - horasDesdeDeteccion * 60 * 60_000
  return {
    limites: {
      gastoExtra: {
        habilitado: false,
        usadoUsd: 21.36,
        limiteUsd: 20,
        porcentaje: 106.8,
        utilizacion: 100,
        motivoDeshabilitado: 'org_level_disabled_until',
        alcanzado: true,
      },
    },
    registroExtra: {
      abierto: { detectadoEn, usado: 21.36, limite: 20, moneda: 'USD', cerradoEn: null },
      archivados: [],
    },
  }
}

test('SHS-H3-T105: un extra detectado hace 25h sale de las filas vivas y aparece en historico', () => {
  const vista = construirVista(snapshotConExtra(25), { ahora: AHORA_T105 })
  const proyeccion = presentar(vista, { ahora: AHORA_T105 })

  assert.equal(
    proyeccion.limites.some((f) => f.etiqueta.startsWith('Extra')),
    false,
    'el extra historico no deberia aparecer entre las filas vivas'
  )
  assert.equal(proyeccion.historico.length, 1)
  assert.equal(proyeccion.historico[0], 'Extra ago-2026  $21.36/$20.00  alcanzado 09-08')
})

test('SHS-H3-T105: un extra detectado hace 1h sigue como alarma viva normal, historico vacio', () => {
  const vista = construirVista(snapshotConExtra(1), { ahora: AHORA_T105 })
  const proyeccion = presentar(vista, { ahora: AHORA_T105 })

  const filaExtra = proyeccion.limites.find((f) => f.etiqueta.startsWith('Extra'))
  assert.ok(filaExtra, 'el extra recien detectado debe seguir en las filas vivas')
  assert.equal(filaExtra.porcentaje, 100)
  assert.deepEqual(proyeccion.historico, [])
})

// ---------------------------------------------------------------------------
// duracionDeSesion: la fila DUR reemplazo a ACT en panel-layout.js -- interesa
// cuanto lleva corriendo la sesion, no hace cuanto escribio por ultima vez.
// ---------------------------------------------------------------------------

const AHORA_DUR = Date.UTC(2026, 7, 17, 12, 0, 0)

test('sesion terminada: la duracion va del primer al ultimo evento, no hasta ahora', () => {
  const inicio = AHORA_DUR - 90 * 60_000 // hace 90 min
  const fin = inicio + 45 * 60_000 // duro 45 min y no volvio a escribir
  const vista = construirVista(
    {
      eventos: [
        lineaEvento({ ts: inicio }),
        lineaEvento({ ts: fin }),
      ],
    },
    { ahora: AHORA_DUR }
  )
  const proyeccion = presentar(vista, { ahora: AHORA_DUR })

  const fila = proyeccion.sesiones.filas.find((f) => f.id === 'sess')
  assert.ok(fila)
  assert.equal(fila.estado, 'terminado')
  assert.equal(fila.duracionMs, 45 * 60_000)
})

test('sesion activa (vivo): la duracion corre hasta ahora, no se congela en el ultimo evento', () => {
  const inicio = AHORA_DUR - 30 * 60_000
  const ultimoEvento = AHORA_DUR - 30_000 // ultimo evento hace 30s: dentro del umbral de "corriendo" (60s)
  const vista = construirVista(
    {
      eventos: [
        lineaEvento({ ts: inicio, sessionId: 'sess-viva' }),
        lineaEvento({ ts: ultimoEvento, sessionId: 'sess-viva' }),
      ],
      vivos: [{ sessionId: 'sess-viva', pid: 1234, cwd: 'C:\\proyecto', procesoVivo: true, startedAt: inicio }],
    },
    { ahora: AHORA_DUR }
  )
  const proyeccion = presentar(vista, { ahora: AHORA_DUR })

  const fila = proyeccion.sesiones.filas.find((f) => f.id === 'sess')
  assert.ok(fila)
  assert.equal(fila.estado, 'corriendo')
  // Corre hasta AHORA_DUR (30 min desde el inicio), no se detiene en el
  // ultimo evento (que fue hace 25 min).
  assert.equal(fila.duracionMs, 30 * 60_000)
})

test('sesion sin eventos con ts (inicio desconocido): duracion null, no un numero inventado', () => {
  // ts:null solo entra al universo con ventana "all" (ver ventanas.js::dentroDe):
  // en una ventana acotada un evento sin ts no se puede ubicar y queda afuera.
  const vista = construirVista(
    { eventos: [lineaEvento({ ts: null, sessionId: 'sess' })] },
    { ahora: AHORA_DUR, ventana: 'all' }
  )
  const proyeccion = presentar(vista, { ahora: AHORA_DUR })
  const fila = proyeccion.sesiones.filas.find((f) => f.id === 'sess')
  assert.ok(fila)
  assert.equal(fila.duracionMs, null)
})

function lineaEvento({ ts, sessionId = 'sess' }) {
  return {
    id: `msg_${Math.random().toString(36).slice(2)}`,
    requestId: `req_${Math.random().toString(36).slice(2)}`,
    ts,
    sessionId,
    agentId: null,
    tipoAgente: 'principal',
    cwd: 'C:\\proyecto',
    rama: 'main',
    modeloId: 'claude-sonnet-5',
    effort: 'medium',
    esSidechain: false,
    servicio: 'standard',
    cuentaUuid: null,
    cuentaAlias: null,
    uso: { entrada: 100, salida: 50, cacheCreacion: 0, cacheLectura: 0, cache1h: 0, cache5m: 0 },
  }
}

// --- ventanas de limite y equipo activo (SHS-M3-T005) ---

test('presenter: proyecta ventanasLimite a filas planas conservando los null de las ventanas por modelo', () => {
  const vista = {
    generadoEn: AHORA,
    ventanasLimite: [
      {
        clave: '5h', etiqueta: 'Ventana 5h', porcentaje: 40, reseteaEn: AHORA + 3_600_000, alineada: true,
        consumo: { tokensIn: 1000, tokensOut: 100, desglose: { entrada: 1000, salida: 100, cacheCreacion: 0, cacheLectura: 0 }, costoUsd: 0.5, llamadas: 3 },
        sesiones: 1,
      },
      {
        clave: 'modelo:fable', etiqueta: 'Semanal claude-fable-5', porcentaje: null, reseteaEn: null, alineada: false,
        consumo: { tokensIn: 200, tokensOut: 20, desglose: null, costoUsd: 0.1, llamadas: null },
        sesiones: 1,
      },
    ],
  }
  const p = presentar(vista, { ahora: AHORA })

  assert.equal(p.ventanas.length, 2)
  assert.deepEqual(p.ventanas[0], {
    etiqueta: 'Ventana 5h', porcentaje: 40, reseteaEn: AHORA + 3_600_000, alineada: true,
    tokensIn: 1000, tokensOut: 100, costoUsd: 0.5, sesiones: 1,
  })
  assert.equal(p.ventanas[1].porcentaje, null)
  assert.equal(p.ventanas[1].alineada, false)
})

test('presenter: equipo null pasa tal cual (sin Vault) y con sesiones activas arma filas con tokens sumados', () => {
  assert.equal(presentar({ generadoEn: AHORA }, { ahora: AHORA }).equipo, null)

  const vista = {
    generadoEn: AHORA,
    equipoActivo: [
      {
        sessionId: 's-1', quien: 'colega', cuentaAlias: null, cuentaUuid: 'uuid-abcdef123',
        maquina: 'PC02', proyecto: 'souclaude', rama: 'dev',
        tokensIn: 900, tokensOut: 100, costoUsd: 0.2, frescuraMs: 120_000,
      },
    ],
  }
  const p = presentar(vista, { ahora: AHORA })
  assert.equal(p.equipo.filas.length, 1)
  const fila = p.equipo.filas[0]
  assert.equal(fila.quien, 'colega')
  assert.equal(fila.cuenta, 'uuid-abc')
  assert.equal(fila.tokens, 1000)
  assert.equal(fila.frescuraMs, 120_000)
})

test('presenter: equipo con lista vacia produce filas vacias (nadie activo), no null', () => {
  const p = presentar({ generadoEn: AHORA, equipoActivo: [] }, { ahora: AHORA })
  assert.deepEqual(p.equipo, { filas: [] })
})
