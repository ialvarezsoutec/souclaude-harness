import { test } from 'node:test'
import assert from 'node:assert/strict'
import path from 'node:path'

import { presentar } from '../src/monitor/adapters/panel-presenter.js'
import { createLimitsReader } from '../src/monitor/adapters/usage-limits-reader.js'
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
