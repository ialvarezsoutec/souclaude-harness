import { test } from 'node:test'
import assert from 'node:assert/strict'

import { crearPublisher } from '../src/commands/monitor.js'
import { mkRepo, write } from './helpers.js'

// La publicacion de snapshots al Vault deja de ser opt-in olvidable: con
// vault.local.json presente el publisher se crea sin flag. La semantica del
// flag es tri-estado: undefined = auto, true = pedido explicito (unico caso
// que avisa si falta el Vault), false = opt-out por corrida.

function repoConVault() {
  const dir = mkRepo()
  write(dir, '.claude/vault.local.json', JSON.stringify({ path: 'C:/vault', repo: null }))
  return dir
}

function capturarSalida(fn) {
  const trozos = []
  const outWrite = process.stdout.write.bind(process.stdout)
  const errWrite = process.stderr.write.bind(process.stderr)
  process.stdout.write = (s) => (trozos.push(String(s)), true)
  process.stderr.write = (s) => (trozos.push(String(s)), true)
  try {
    const resultado = fn()
    return { resultado, salida: trozos.join('') }
  } finally {
    process.stdout.write = outWrite
    process.stderr.write = errWrite
  }
}

test('con Vault configurado y sin flag, el publisher se crea solo (default on)', () => {
  const publisher = crearPublisher({}, repoConVault())
  assert.ok(publisher, 'deberia crear el publisher sin --publish')
  assert.equal(typeof publisher.publicar, 'function')
})

test('--no-publish lo apaga aunque haya Vault configurado', () => {
  const publisher = crearPublisher({ publish: false }, repoConVault())
  assert.equal(publisher, null)
})

test('sin Vault y sin flag: null, sin warning (no ensucia la corrida local-only)', () => {
  const { resultado, salida } = capturarSalida(() => crearPublisher({}, mkRepo()))
  assert.equal(resultado, null)
  assert.ok(!salida.includes('publish'), `no deberia avisar nada: ${salida}`)
})

test('sin Vault pero con --publish explicito: null y aviso accionable', () => {
  const { resultado, salida } = capturarSalida(() => crearPublisher({ publish: true }, mkRepo()))
  assert.equal(resultado, null)
  assert.ok(salida.includes('vault.local.json'), `el aviso debe apuntar a la config: ${salida}`)
})
