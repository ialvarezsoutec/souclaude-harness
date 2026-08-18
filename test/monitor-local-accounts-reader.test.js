import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

import {
  parseLocalAccountsEnv,
  createLocalAccountsReader,
  createCombinedAccountsReader,
} from '../src/monitor/adapters/local-accounts-reader.js'
import { mkClaudeHome, lineaAssistant } from './helpers-monitor.js'

// Cubre SOUCLAUDE_LOCAL_ACCOUNTS: la seccion CUENTAS del monitor tiene que
// mostrar otras cuentas locales (ej. claude1/claude2, cada una con su propio
// CLAUDE_CONFIG_DIR) sin depender del Vault.
//
// mkClaudeHome() fabrica la convencion ESTANDAR (.claude.json hermano de la
// carpeta .claude): un CLAUDE_CONFIG_DIR real tiene ambos adentro de la misma
// carpeta, asi que mkConfigDir() reubica el .claude.json que mkClaudeHome
// dejo en el padre hacia adentro de la carpeta que devuelve, imitando la
// estructura real de ~/.claude1.
function mkConfigDir(opts) {
  const claudeDir = mkClaudeHome(opts)
  const origen = path.join(claudeDir, '..', '.claude.json')
  if (fs.existsSync(origen)) {
    fs.renameSync(origen, path.join(claudeDir, '.claude.json'))
  }
  return claudeDir
}

const AHORA = Date.now()

test('parseLocalAccountsEnv: separa por path.delimiter e ignora vacios', () => {
  const rutas = [path.join('home', 'test', '.claude1'), path.join('home', 'test', '.claude2')]
  const valor = rutas.join(path.delimiter)
  assert.deepEqual(parseLocalAccountsEnv(valor), rutas)
})

test('parseLocalAccountsEnv: undefined, vacio o solo espacios da lista vacia', () => {
  assert.deepEqual(parseLocalAccountsEnv(undefined), [])
  assert.deepEqual(parseLocalAccountsEnv(''), [])
  assert.deepEqual(parseLocalAccountsEnv('   '), [])
})

test('local-accounts-reader: una cuenta local con sesiones se reporta como snapshot v1', async () => {
  const ts = Date.now()
  const home = mkConfigDir({
    proyectos: { 'proyecto-x': { 'sess-1.jsonl': [lineaAssistant({ sessionId: 'sess-1', ts, entrada: 200, salida: 80 })] } },
    config: {
      machineID: 'mmmm9999',
      oauthAccount: { accountUuid: 'cccc3333-uuid', emailAddress: 'claude2@soutec-group.com', organizationName: 'SOUTEC' },
      cachedUsageUtilization: { fetchedAtMs: ts, utilization: { five_hour: { utilization: 42, resets_at: null } } },
    },
  })

  // Ventana de totales calculada DESPUES del evento (ver lineaAssistant): con
  // ts fijo explicito, ahora solo necesita ser >= ts para que caiga dentro.
  const ahora = ts + 1000
  const reader = createLocalAccountsReader({ homes: [home], hostname: 'PC-LOCAL' })
  const { cuentas, warnings } = await reader.leer({ ahora })

  assert.equal(warnings.length, 0)
  assert.equal(cuentas.length, 1)
  const [snap] = cuentas
  assert.equal(snap.version, 1)
  assert.equal(snap.cuenta.accountUuid, 'cccc3333-uuid')
  assert.equal(snap.cuenta.alias, 'claude2')
  assert.equal(snap.maquina.hostname, 'PC-LOCAL')
  assert.equal(snap.maquina.machineID, 'mmmm9999')
  assert.equal(snap.limites.cincoHoras.porcentaje, 42)
  assert.equal(snap.totalesDia.tokensIn, 200)
  assert.equal(snap.totalesDia.tokensOut, 80)
})

test('local-accounts-reader: un home sin cuenta (sin .claude.json) no aporta fila ni avisa', async () => {
  const home = mkConfigDir({ proyectos: {} })
  const reader = createLocalAccountsReader({ homes: [home] })
  const { cuentas, warnings } = await reader.leer({ ahora: AHORA })
  assert.equal(cuentas.length, 0)
  assert.equal(warnings.length, 0)
})

test('local-accounts-reader: sin homes configurados, vacio sin lanzar', async () => {
  const reader = createLocalAccountsReader({ homes: [] })
  const { cuentas, warnings } = await reader.leer({ ahora: AHORA })
  assert.deepEqual(cuentas, [])
  assert.deepEqual(warnings, [])
})

test('createCombinedAccountsReader: junta cuentas y avisos de varios lectores', async () => {
  const readerA = { leer: async () => ({ cuentas: [{ id: 'a' }], warnings: [{ file: 'a', reason: 'x' }] }) }
  const readerB = { leer: async () => ({ cuentas: [{ id: 'b' }], warnings: [] }) }

  const combinado = createCombinedAccountsReader([readerA, null, readerB])
  const { cuentas, warnings } = await combinado.leer({ ahora: AHORA })

  assert.deepEqual(cuentas, [{ id: 'a' }, { id: 'b' }])
  assert.deepEqual(warnings, [{ file: 'a', reason: 'x' }])
})
