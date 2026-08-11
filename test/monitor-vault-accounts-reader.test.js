import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { createVaultAccountsReader } from '../src/monitor/adapters/vault-accounts-reader.js'

// Este archivo responde: "el lector de snapshots del Vault entrega las cuentas
// validas, avisa por las rotas, y nunca tumba un tick?" (RF-04/RF-05).

function mkVault(archivos = {}) {
  const vault = fs.mkdtempSync(path.join(os.tmpdir(), 'souclaude-accounts-'))
  const carpeta = path.join(vault, '00-System', 'monitor')
  fs.mkdirSync(carpeta, { recursive: true })
  for (const [nombre, contenido] of Object.entries(archivos)) {
    fs.writeFileSync(path.join(carpeta, nombre), contenido)
  }
  return vault
}

function snapshotValido(uuid, extra = {}) {
  return JSON.stringify({
    version: 1,
    generadoEn: '2026-08-10T14:00:00.000Z',
    cuenta: { accountUuid: uuid, alias: 'dev', email: null, organizacion: null },
    maquina: { machineID: 'm-1', hostname: 'PC01' },
    limites: null,
    totalesDia: null,
    origen: 'souclaude',
    ...extra,
  })
}

test('accounts-reader: lee los validos y avisa por corrupto, version desconocida y sin uuid', async () => {
  const vault = mkVault({
    'a.json': snapshotValido('uuid-a'),
    'b.json': snapshotValido('uuid-b'),
    'roto.json': '{ esto no es json',
    'futuro.json': snapshotValido('uuid-c', { version: 99 }),
    'anonimo.json': JSON.stringify({ version: 1, cuenta: {} }),
  })

  const r = await createVaultAccountsReader({ vaultPath: vault }).leer({ ahora: 1000 })
  assert.deepEqual(r.cuentas.map((c) => c.cuenta.accountUuid).sort(), ['uuid-a', 'uuid-b'])
  assert.equal(r.warnings.length, 3)
})

test('accounts-reader: sin carpeta ni vault devuelve vacio sin lanzar', async () => {
  const sinCarpeta = fs.mkdtempSync(path.join(os.tmpdir(), 'souclaude-accounts-'))
  const r1 = await createVaultAccountsReader({ vaultPath: sinCarpeta }).leer({ ahora: 1000 })
  assert.deepEqual(r1, { cuentas: [], warnings: [] })

  const r2 = await createVaultAccountsReader({}).leer({ ahora: 1000 })
  assert.deepEqual(r2, { cuentas: [], warnings: [] })
})

test('accounts-reader: el TTL evita relecturas de disco dentro de la ventana', async () => {
  const vault = mkVault({ 'a.json': snapshotValido('uuid-a') })
  const reader = createVaultAccountsReader({ vaultPath: vault, ttlMs: 60_000 })

  const r1 = await reader.leer({ ahora: 1000 })
  assert.equal(r1.cuentas.length, 1)

  // Aparece un archivo nuevo, pero dentro del TTL se sigue sirviendo el cache.
  fs.writeFileSync(path.join(vault, '00-System', 'monitor', 'b.json'), snapshotValido('uuid-b'))
  const r2 = await reader.leer({ ahora: 30_000 })
  assert.equal(r2.cuentas.length, 1)

  // Pasado el TTL se relee y el nuevo aparece.
  const r3 = await reader.leer({ ahora: 62_000 })
  assert.equal(r3.cuentas.length, 2)
})

test('accounts-reader: el pull opcional respeta intervalo y acumula backoff sin bloquear leer()', async () => {
  const vault = mkVault({ 'a.json': snapshotValido('uuid-a') })
  const pulls = []
  const git = async (args) => {
    pulls.push(args)
    throw new Error('sin red')
  }
  const reader = createVaultAccountsReader({ vaultPath: vault, ttlMs: 0, git, pullIntervaloMs: 5 * 60_000 })

  await reader.leer({ ahora: 0 })
  await reader.leer({ ahora: 1000 }) // dentro del intervalo: no hay segundo pull
  await new Promise((r) => setImmediate(r)) // deja asentar los .catch del pull
  assert.equal(pulls.length, 1)

  await reader.leer({ ahora: 6 * 60_000 })
  await new Promise((r) => setImmediate(r)) // el guard enPull se libera al asentarse el fallo
  await reader.leer({ ahora: 12 * 60_000 })
  await new Promise((r) => setImmediate(r))
  assert.equal(pulls.length, 3)
  assert.equal(reader.estado().fallosPull, 3)
  assert.ok(reader.estado().backoffHasta > 12 * 60_000)

  // Con backoff activo, ni un pull mas — pero leer() sigue sirviendo datos.
  const r = await reader.leer({ ahora: 13 * 60_000 })
  assert.equal(pulls.length, 3)
  assert.equal(r.cuentas.length, 1)
})
