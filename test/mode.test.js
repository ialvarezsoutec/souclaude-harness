import { test } from 'node:test'
import assert from 'node:assert/strict'
import { main } from '../src/cli.js'
import { mkRepo, read, has } from './helpers.js'
import { readMode, writeMode, MODE_CONFIG, DEFAULT_MODE } from '../src/core/mode.js'

// El invariante central: 'manual' es un opt-in EXPLICITO y nada mas lo activa.
// Sin archivo -- el caso normal -- el flujo corre solo, porque el dev elige el
// modo con el permission mode de Claude Code (shift+tab), que el harness no
// puede leer. Cada forma de "estar roto" se prueba: ninguna debe frenar el flujo
// por accidente, y ninguna debe activar 'manual' sin que alguien lo pida.
test('readMode: sin archivo, el modo es auto', () => {
  const dir = mkRepo()
  assert.equal(readMode(dir), 'auto')
  assert.equal(DEFAULT_MODE, 'auto')
})

test('readMode: lee manual cuando el archivo lo pide explicitamente', () => {
  const dir = mkRepo({ [MODE_CONFIG]: JSON.stringify({ mode: 'manual' }) })
  assert.equal(readMode(dir), 'manual')
})

test('readMode: JSON corrupto cae al default, no explota', () => {
  const dir = mkRepo({ [MODE_CONFIG]: '{ mode: manual,,, ' })
  assert.equal(readMode(dir), 'auto')
})

test('readMode: un valor invalido cae al default', () => {
  for (const invalido of ['turbo', '', 'MANUALMENTE', null, 42, true]) {
    const dir = mkRepo({ [MODE_CONFIG]: JSON.stringify({ mode: invalido }) })
    assert.equal(readMode(dir), 'auto', `"${invalido}" deberia caer al default`)
  }
})

test('readMode: tolera mayusculas y espacios en un valor por lo demas valido', () => {
  const dir = mkRepo({ [MODE_CONFIG]: JSON.stringify({ mode: '  MANUAL ' }) })
  assert.equal(readMode(dir), 'manual')
})

test('readMode: SOUCLAUDE_MODE actua de respaldo, pero el archivo manda', () => {
  const previo = process.env.SOUCLAUDE_MODE
  try {
    process.env.SOUCLAUDE_MODE = 'manual'
    assert.equal(readMode(mkRepo()), 'manual', 'sin archivo, manda el entorno')

    const conArchivo = mkRepo({ [MODE_CONFIG]: JSON.stringify({ mode: 'auto' }) })
    assert.equal(readMode(conArchivo), 'auto', 'con archivo, el archivo gana')

    process.env.SOUCLAUDE_MODE = 'turbo'
    assert.equal(readMode(mkRepo()), 'auto', 'un entorno invalido tambien cae al default')
  } finally {
    if (previo === undefined) delete process.env.SOUCLAUDE_MODE
    else process.env.SOUCLAUDE_MODE = previo
  }
})

test('writeMode: escribe el archivo y rechaza un modo invalido', () => {
  const dir = mkRepo()
  writeMode(dir, 'manual')
  assert.equal(readMode(dir), 'manual')

  const escrito = JSON.parse(read(dir, MODE_CONFIG))
  assert.equal(escrito.mode, 'manual')
  assert.match(escrito._comentario, /NO se commitea/i)

  assert.throws(() => writeMode(dir, 'turbo'), /Modo invalido/)
  assert.equal(readMode(dir), 'manual', 'un write rechazado no pisa el valor previo')
})

test('cli: `mode` sin argumento es de solo lectura', async () => {
  const dir = mkRepo()
  assert.equal(await main(['mode'], dir), 0)
  assert.equal(has(dir, MODE_CONFIG), false, 'leer el modo no debe crear el archivo')
})

test('cli: `mode manual` fija el opt-in y `mode auto` vuelve al default', async () => {
  const dir = mkRepo()

  assert.equal(await main(['mode', 'manual'], dir), 0)
  assert.equal(readMode(dir), 'manual')

  assert.equal(await main(['mode', 'auto'], dir), 0)
  assert.equal(readMode(dir), 'auto')
})

test('cli: un modo invalido sale 2 y no escribe', async () => {
  const dir = mkRepo()
  assert.equal(await main(['mode', 'turbo'], dir), 2)
  assert.equal(has(dir, MODE_CONFIG), false)
})

test('cli: --dry-run no escribe un byte', async () => {
  const dir = mkRepo()
  assert.equal(await main(['mode', 'manual', '--dry-run'], dir), 0)
  assert.equal(has(dir, MODE_CONFIG), false)
  assert.equal(readMode(dir), 'auto', 'sigue rigiendo el default')
})

// El archivo es de maquina, no de proyecto: si viaja al repo, el modo de uno se
// le impone al resto del equipo. El .gitignore que emite el harness debe cubrirlo.
test('el gitignore del harness ignora mode.local.json', async () => {
  const dir = mkRepo()
  await main(['init', '--yes', '--name', 'acme', '--type', 'backend', '--lang', 'es', '--no-vault'], dir)
  assert.match(read(dir, '.gitignore'), /^\.claude\/mode\.local\.json$/m)
})
