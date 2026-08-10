import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

import { createUsageHistory } from '../src/monitor/adapters/usage-history.js'
import { mkClaudeHome } from './helpers-monitor.js'

// Este archivo responde: "usage-history.js persiste el gasto extra en disco tal
// como lo decide la regla pura de dominio (siguienteRegistro), y sobrevive a un
// archivo ausente o corrupto sin romper el monitor?". Todos los tests corren
// sobre un tmpdir fresco (mkClaudeHome, mismo patron que
// test/monitor-usage-fetcher.test.js): NUNCA se toca el ~/.claude real de la
// maquina.

function rutaHistoria(claudeHome) {
  return path.join(claudeHome, 'souclaude', 'usage-history.json')
}

function gastoExtra({ alcanzado = true, habilitado = false, usadoUsd = 21.36, limiteUsd = 20 } = {}) {
  return { habilitado, usadoUsd, limiteUsd, porcentaje: null, utilizacion: null, motivoDeshabilitado: null, alcanzado }
}

test('primera deteccion: sin archivo previo y alcanzado:true crea el registro abierto', () => {
  const home = mkClaudeHome({})
  const history = createUsageHistory({ paths: { home } })

  const ahora = 1_000_000
  const estado = history.registrar(gastoExtra({ alcanzado: true }), ahora)

  assert.ok(estado.abierto, 'debe abrir un registro')
  assert.equal(estado.abierto.detectadoEn, ahora)
  assert.equal(estado.abierto.usado, 21.36)
  assert.equal(estado.abierto.limite, 20)
  assert.equal(estado.abierto.cerradoEn, null)
  assert.deepEqual(estado.archivados, [])

  // Persistido en disco, no solo en memoria.
  const enDisco = JSON.parse(fs.readFileSync(rutaHistoria(home), 'utf8'))
  assert.equal(enDisco.abierto.detectadoEn, ahora)

  // Sin la logica de deteccion (comentando el fix) el registro nunca se abre:
  // este assert es el que falla si se revierte `siguienteRegistro`/`registrar`.
  assert.notEqual(estado.abierto, null)
})

test('reset: habilitado vuelve a true con un registro abierto -> se cierra y se archiva', () => {
  const home = mkClaudeHome({})
  const history = createUsageHistory({ paths: { home } })

  const detectadoEn = 1_000_000
  history.registrar(gastoExtra({ alcanzado: true, habilitado: false }), detectadoEn)

  const ahoraDelReset = detectadoEn + 2 * 60 * 60_000
  const estado = history.registrar(gastoExtra({ alcanzado: false, habilitado: true }), ahoraDelReset)

  assert.equal(estado.abierto, null, 'el reset debe dejar el registro abierto en null')
  assert.equal(estado.archivados.length, 1)
  assert.equal(estado.archivados[0].detectadoEn, detectadoEn)
  assert.equal(estado.archivados[0].cerradoEn, ahoraDelReset)

  const enDisco = JSON.parse(fs.readFileSync(rutaHistoria(home), 'utf8'))
  assert.equal(enDisco.abierto, null)
  assert.equal(enDisco.archivados.length, 1)
})

test('archivo corrupto: leer() no lanza y arranca vacio', () => {
  const home = mkClaudeHome({})
  fs.mkdirSync(path.dirname(rutaHistoria(home)), { recursive: true })
  fs.writeFileSync(rutaHistoria(home), '{esto no es json', 'utf8')

  const history = createUsageHistory({ paths: { home } })

  assert.doesNotThrow(() => history.leer())
  assert.deepEqual(history.leer(), { abierto: null, archivados: [] })

  // Y sigue funcionando para registrar despues de leer un archivo corrupto.
  assert.doesNotThrow(() => history.registrar(gastoExtra({ alcanzado: true }), 5000))
})

test('seed: sin archivo previo, el flag fija detectadoEn; en la segunda llamada (archivo ya existe) se ignora', () => {
  const home = mkClaudeHome({})
  const seed = '2026-08-06T00:00:00.000Z'
  const seedMs = Date.parse(seed)
  const history = createUsageHistory({ paths: { home }, seedDetectadoEn: seed })

  const primerAhora = 1_000_000
  const estado1 = history.registrar(gastoExtra({ alcanzado: true }), primerAhora)
  assert.equal(estado1.abierto.detectadoEn, seedMs, 'la primera apertura debe usar la fecha de seed, no `ahora`')
  assert.notEqual(estado1.abierto.detectadoEn, primerAhora)

  // Se cierra el periodo (reset) y se vuelve a abrir uno nuevo: el archivo ya
  // existe en disco, asi que el seed debe ignorarse esta vez.
  const ahoraDelReset = seedMs + 26 * 60 * 60_000
  history.registrar(gastoExtra({ alcanzado: false, habilitado: true }), ahoraDelReset)

  const ahoraDeLaSegundaApertura = ahoraDelReset + 60_000
  const estado2 = history.registrar(gastoExtra({ alcanzado: true }), ahoraDeLaSegundaApertura)
  assert.equal(
    estado2.abierto.detectadoEn,
    ahoraDeLaSegundaApertura,
    'con el archivo ya existente el seed debe ignorarse: detectadoEn debe ser `ahora`',
  )
})

test('gastoExtra null (sin cachedUsageUtilization todavia): no abre nada y no lanza', () => {
  const home = mkClaudeHome({})
  const history = createUsageHistory({ paths: { home } })

  const estado = history.registrar(null, 1000)
  assert.equal(estado.abierto, null)
  assert.deepEqual(estado.archivados, [])
  assert.ok(!fs.existsSync(rutaHistoria(home)), 'sin nada que registrar no debe escribir el archivo')
})

test('sin paths: leer()/registrar() no lanzan y devuelven estado vacio', () => {
  const history = createUsageHistory({})
  assert.deepEqual(history.leer(), { abierto: null, archivados: [] })
  assert.doesNotThrow(() => history.registrar(gastoExtra({ alcanzado: true }), 1000))
})
