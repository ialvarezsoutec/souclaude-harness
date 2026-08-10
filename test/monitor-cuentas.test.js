import { test } from 'node:test'
import assert from 'node:assert/strict'

import { aliasDeCuenta, normalizarCuenta, consolidarCuentas } from '../src/monitor/domain/cuentas.js'
import { construirVista } from '../src/monitor/domain/arbol.js'
import { presentar } from '../src/monitor/adapters/panel-presenter.js'
import { renderPlain } from '../src/monitor/adapters/plain-renderer.js'

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
// consolidarCuentas (RF-04)
// ---------------------------------------------------------------------------

const AHORA = Date.parse('2026-08-10T15:00:00.000Z')

function snapshotRemoto(uuid, { alias = 'dev2', generadoEn = '2026-08-10T14:57:00.000Z', hostname = 'PC02' } = {}) {
  return {
    version: 1,
    generadoEn,
    cuenta: { accountUuid: uuid, alias, email: null, organizacion: null },
    maquina: { machineID: 'm-2', hostname },
    limites: { cincoHoras: { porcentaje: 12, reseteaEn: null }, sieteDias: null, gastoExtra: null, leidoEn: null },
    totalesDia: { tokensIn: 10, tokensOut: 5, costoUsd: 0.1, llamadas: 1 },
  }
}

test('consolidar: local primera con frescura 0, remota con frescura calculada', () => {
  const { cuentas, avisos } = consolidarCuentas({
    local: {
      cuenta: { accountUuid: 'uuid-a', email: 'dev@soutec-group.com' },
      limites: { cincoHoras: { porcentaje: 88 } },
      totales: { entrada: 100, salida: 50, cacheCreacion: 10, cacheLectura: 40, llamadas: 3, costoUsd: 0.5 },
    },
    remotas: [snapshotRemoto('uuid-b')],
    ahora: AHORA,
  })

  assert.equal(avisos.length, 0)
  assert.equal(cuentas.length, 2)
  assert.equal(cuentas[0].accountUuid, 'uuid-a')
  assert.equal(cuentas[0].esLocal, true)
  assert.equal(cuentas[0].frescuraMs, 0)
  assert.equal(cuentas[0].totalesDia.tokensIn, 150)
  assert.equal(cuentas[1].accountUuid, 'uuid-b')
  assert.equal(cuentas[1].esLocal, false)
  assert.equal(cuentas[1].maquina, 'PC02')
  // 15:00 - 14:57 = 3 minutos
  assert.equal(cuentas[1].frescuraMs, 3 * 60_000)
})

test('consolidar: la local gana sobre su propio snapshot publicado', () => {
  const { cuentas } = consolidarCuentas({
    local: { cuenta: { accountUuid: 'uuid-a', email: 'dev@soutec-group.com' }, limites: null, totales: null },
    remotas: [snapshotRemoto('uuid-a', { alias: 'dev-viejo' })],
    ahora: AHORA,
  })
  assert.equal(cuentas.length, 1)
  assert.equal(cuentas[0].esLocal, true)
  assert.equal(cuentas[0].alias, 'dev')
})

test('consolidar: entre snapshots de la misma cuenta gana el mas fresco', () => {
  const { cuentas } = consolidarCuentas({
    remotas: [
      snapshotRemoto('uuid-b', { hostname: 'VIEJA', generadoEn: '2026-08-10T13:00:00.000Z' }),
      snapshotRemoto('uuid-b', { hostname: 'FRESCA', generadoEn: '2026-08-10T14:59:00.000Z' }),
    ],
    ahora: AHORA,
  })
  assert.equal(cuentas.length, 1)
  assert.equal(cuentas[0].maquina, 'FRESCA')
})

test('consolidar: un generadoEn futuro avisa reloj desincronizado y no rompe', () => {
  const { cuentas, avisos } = consolidarCuentas({
    remotas: [snapshotRemoto('uuid-b', { generadoEn: '2026-08-10T15:10:00.000Z' })],
    ahora: AHORA,
  })
  assert.equal(cuentas.length, 1)
  assert.ok(cuentas[0].frescuraMs < 0)
  assert.equal(avisos.length, 1)
  assert.match(avisos[0].reason, /reloj desincronizado/)
})

test('consolidar: snapshots invalidos se descartan en silencio (ya aviso el adaptador)', () => {
  const { cuentas } = consolidarCuentas({
    remotas: [{ cuenta: {} }, { cuenta: { accountUuid: 'uuid-x' }, generadoEn: 'no-es-fecha' }],
    ahora: AHORA,
  })
  assert.equal(cuentas.length, 0)
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

test('cuentas: la seccion CUENTAS llega al panel con local y remota', () => {
  const vista = construirVista(
    {
      eventos: [],
      cuenta: { accountUuid: 'uuid-a', email: 'dev@soutec-group.com' },
      limites: { cincoHoras: { porcentaje: 88, reseteaEn: null }, sieteDias: null, porGrupo: [], gastoExtra: null, leidoEn: AHORA, edadMs: 0 },
      cuentasRemotas: [snapshotRemoto('uuid-b', { generadoEn: new Date(AHORA - 20 * 60_000).toISOString() })],
    },
    { ahora: AHORA },
  )

  const panel = presentar(vista, { ahora: AHORA })
  assert.equal(panel.cuentas.filas.length, 2)
  assert.equal(panel.cuentas.filas[0].alias, 'dev')
  assert.equal(panel.cuentas.filas[0].esLocal, true)
  assert.equal(panel.cuentas.filas[1].alias, 'dev2')
  // 20 minutos > 15: la remota se marca vieja.
  assert.equal(panel.cuentas.filas[1].vieja, true)

  const texto = renderPlain(vista, { cols: 100 })
  assert.match(texto, /CUENTAS/)
  assert.match(texto, /dev2/)
  assert.match(texto, /dato viejo/)
})

test('cuentas: sin datos de cuentas el panel no dibuja la seccion', () => {
  const vista = construirVista({ eventos: [] }, { ahora: AHORA })
  assert.deepEqual(vista.cuentas, [])
  const texto = renderPlain(vista, { cols: 100 })
  assert.doesNotMatch(texto, /CUENTAS/)
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
