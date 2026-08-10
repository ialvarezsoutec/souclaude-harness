import { test } from 'node:test'
import assert from 'node:assert/strict'

import { aliasDeCuenta, normalizarCuenta } from '../src/monitor/domain/cuentas.js'
import { construirVista } from '../src/monitor/domain/arbol.js'
import { presentar } from '../src/monitor/adapters/panel-presenter.js'

// Este archivo responde: "la identidad de cuenta se normaliza como dice la
// spec de SHS-H3-monitor-multicuenta (RF-01)?". Valores esperados
// hardcodeados; nada de Date.now().

// ---------------------------------------------------------------------------
// aliasDeCuenta
// ---------------------------------------------------------------------------

test('cuentas: aliasDeCuenta toma la parte local en minusculas', () => {
  assert.equal(aliasDeCuenta('dev@soutec-group.com'), 'dev')
  assert.equal(aliasDeCuenta('Dev.Two@Soutec-Group.com'), 'dev.two')
})

test('cuentas: aliasDeCuenta tolera entradas sin arroba o vacias', () => {
  // Sin arroba: el string entero es la parte local (mejor un alias raro que
  // perder la fila del panel).
  assert.equal(aliasDeCuenta('solo-local'), 'solo-local')
  assert.equal(aliasDeCuenta(''), null)
  assert.equal(aliasDeCuenta('   '), null)
  assert.equal(aliasDeCuenta(null), null)
  assert.equal(aliasDeCuenta(undefined), null)
  assert.equal(aliasDeCuenta(42), null)
})

test('cuentas: aliasDeCuenta con email que empieza en arroba da null', () => {
  assert.equal(aliasDeCuenta('@dominio.com'), null)
})

// ---------------------------------------------------------------------------
// normalizarCuenta
// ---------------------------------------------------------------------------

test('cuentas: normalizarCuenta arma la forma canonica completa', () => {
  const cuenta = normalizarCuenta({
    accountUuid: 'aaaa1111-2222-3333-4444-555566667777',
    email: 'dev@soutec-group.com',
    organizacion: 'SOUTEC',
    machineID: 'bbbb8888-9999-0000-1111-222233334444',
  })
  assert.deepEqual(cuenta, {
    accountUuid: 'aaaa1111-2222-3333-4444-555566667777',
    alias: 'dev',
    email: 'dev@soutec-group.com',
    organizacion: 'SOUTEC',
    machineID: 'bbbb8888-9999-0000-1111-222233334444',
  })
})

test('cuentas: sin accountUuid no hay identidad (todo-o-nada)', () => {
  assert.equal(normalizarCuenta(null), null)
  assert.equal(normalizarCuenta(undefined), null)
  assert.equal(normalizarCuenta({}), null)
  assert.equal(normalizarCuenta({ email: 'dev@soutec-group.com' }), null)
  assert.equal(normalizarCuenta({ accountUuid: '' }), null)
  assert.equal(normalizarCuenta({ accountUuid: 7 }), null)
  assert.equal(normalizarCuenta('texto'), null)
})

// ---------------------------------------------------------------------------
// propagacion snapshot -> vista -> presentacion (RF-01)
// ---------------------------------------------------------------------------

test('cuentas: construirVista normaliza y expone la cuenta del snapshot', () => {
  const snapshot = {
    eventos: [],
    cuenta: { accountUuid: 'uuid-a', email: 'dev@soutec-group.com', organizacion: 'SOUTEC', machineID: 'm-1' },
  }
  const vista = construirVista(snapshot, { ahora: 1_754_800_000_000 })
  assert.equal(vista.cuenta.accountUuid, 'uuid-a')
  assert.equal(vista.cuenta.alias, 'dev')

  const sinCuenta = construirVista({ eventos: [] }, { ahora: 1_754_800_000_000 })
  assert.equal(sinCuenta.cuenta, null)
})

test('cuentas: presentar expone alias y email para el panel', () => {
  const vista = construirVista(
    { eventos: [], cuenta: { accountUuid: 'uuid-a', email: 'dev@soutec-group.com' } },
    { ahora: 1_754_800_000_000 },
  )
  const panel = presentar(vista, { ahora: 1_754_800_000_000 })
  assert.deepEqual(panel.cuenta, { alias: 'dev', email: 'dev@soutec-group.com' })

  const sin = presentar(construirVista({ eventos: [] }, { ahora: 1 }), { ahora: 1 })
  assert.equal(sin.cuenta, null)
})

test('cuentas: campos secundarios ausentes o invalidos quedan en null', () => {
  const cuenta = normalizarCuenta({ accountUuid: 'uuid-a', email: 42, organizacion: '' })
  assert.deepEqual(cuenta, {
    accountUuid: 'uuid-a',
    alias: null,
    email: null,
    organizacion: null,
    machineID: null,
  })
})
