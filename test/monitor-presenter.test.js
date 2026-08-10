import { test } from 'node:test'
import assert from 'node:assert/strict'
import path from 'node:path'

import { presentar } from '../src/monitor/adapters/panel-presenter.js'
import { createLimitsReader } from '../src/monitor/adapters/usage-limits-reader.js'
import { construirVista } from '../src/monitor/domain/arbol.js'
import { mkClaudeHome } from './helpers-monitor.js'

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
