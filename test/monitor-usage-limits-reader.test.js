import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { createLimitsReader } from '../src/monitor/adapters/usage-limits-reader.js'

// Este archivo responde: "el lector de limites extrae la identidad de cuenta
// de ~/.claude.json como dice RF-01 de SHS-H3-monitor-multicuenta?". La
// integracion limites+fetcher ya esta cubierta en
// monitor-usage-fetcher.test.js; aca solo se prueba el campo `cuenta`.

function escribirConfig(contenido) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'souclaude-limits-'))
  const configFile = path.join(dir, '.claude.json')
  fs.writeFileSync(configFile, JSON.stringify(contenido))
  return configFile
}

const CU = { fetchedAtMs: 1000, utilization: { five_hour: { utilization: 42, resets_at: 'x' } } }

test('reader: extrae cuenta cruda de oauthAccount + machineID', async () => {
  const configFile = escribirConfig({
    machineID: 'maquina-1',
    oauthAccount: {
      accountUuid: 'uuid-a',
      emailAddress: 'dev@soutec-group.com',
      organizationName: 'SOUTEC',
      organizationRole: 'admin', // no debe filtrarse al valor extraido
    },
    cachedUsageUtilization: CU,
  })

  const r = await createLimitsReader().read(configFile, { ahora: 5000 })
  assert.deepEqual(r.cuenta, {
    accountUuid: 'uuid-a',
    email: 'dev@soutec-group.com',
    organizacion: 'SOUTEC',
    machineID: 'maquina-1',
  })
  assert.equal(r.limits.cincoHoras.porcentaje, 42)
})

test('reader: sin oauthAccount la cuenta es null y los limites siguen', async () => {
  const configFile = escribirConfig({ cachedUsageUtilization: CU })
  const r = await createLimitsReader().read(configFile, { ahora: 5000 })
  assert.equal(r.cuenta, null)
  assert.equal(r.limits.cincoHoras.porcentaje, 42)
})

test('reader: la cuenta existe aunque no haya limites cacheados', async () => {
  const configFile = escribirConfig({ oauthAccount: { accountUuid: 'uuid-b' } })
  const r = await createLimitsReader().read(configFile, { ahora: 5000 })
  assert.equal(r.limits, null)
  assert.equal(r.cuenta.accountUuid, 'uuid-b')
  assert.equal(r.warnings.length, 1)
})

test('reader: sin .claude.json, cuenta null y warning', async () => {
  const configFile = path.join(os.tmpdir(), 'souclaude-limits-inexistente', '.claude.json')
  const r = await createLimitsReader().read(configFile, { ahora: 5000 })
  assert.equal(r.limits, null)
  assert.equal(r.cuenta, null)
  assert.equal(r.warnings.length, 1)
})

test('reader: la cuenta sobrevive cuando gana la fuente de red', async () => {
  // Fetcher fake mas fresco que el config: los limites vienen de la red, pero
  // la identidad viaja siempre desde .claude.json.
  const configFile = escribirConfig({
    oauthAccount: { accountUuid: 'uuid-a', emailAddress: 'dev@soutec-group.com' },
    cachedUsageUtilization: CU,
  })
  const fetcher = {
    async obtener() {
      return { fetchedAtMs: 9000, utilization: { five_hour: { utilization: 77, resets_at: 'red' } } }
    },
  }

  const r = await createLimitsReader({ fetcher }).read(configFile, { ahora: 9500 })
  assert.equal(r.limits.cincoHoras.porcentaje, 77)
  assert.equal(r.cuenta.accountUuid, 'uuid-a')
})
