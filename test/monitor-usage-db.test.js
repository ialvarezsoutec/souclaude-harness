import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import {
  createUsageDbPublisher,
  construirRegistroDeSesion,
  nombreDeArchivoDeUsage,
  sesionesDeUsage,
  CARPETA_USAGE,
} from '../src/monitor/adapters/vault-usage-db.js'

// Este archivo responde: "el publisher escribe en 00-System/monitor/usage/ el
// registro v1 del ADR 20260820 — whitelist exacta, particion por (maquina,
// mes), una linea por sesion, sin pisar lineas ajenas, sin secretos y sin
// commits cuando no hubo cambio material?". git va inyectado como fake; el
// Vault y el registro local son directorios temporales; timestamps fijos.

const AHORA = 1_754_800_000_000 // 2025-08-10
const INICIO = AHORA - 60 * 60_000

function sesionEjemplo(extra = {}) {
  return {
    sessionId: 'abcd1234-5678-90ab-cdef-111122223333',
    titulo: 'este titulo NO debe viajar al registro',
    rama: 'feature/SHS-M2-T002-usage-db',
    cuentaUuid: 'uuid-cuenta-1111',
    cuentaAlias: 'dev',
    inicio: INICIO,
    ultimoTs: AHORA - 60_000,
    consumo: {
      entrada: 100_000,
      salida: 9_400,
      cacheCreacion: 30_000,
      cacheLectura: 12_000,
      costoUsd: 1.23456,
      llamadas: 12,
    },
    porModelo: [
      { alias: 'fable', consumo: { entrada: 90_000, salida: 9_000, cacheCreacion: 30_000, cacheLectura: 12_000, costoUsd: 1.2 } },
      { alias: 'haiku', consumo: { entrada: 10_000, salida: 400, costoUsd: 0.03456 } },
    ],
    ...extra,
  }
}

function vistaEjemplo({ sesiones, proyectos } = {}) {
  return {
    cuenta: { accountUuid: 'uuid-cuenta-1111', alias: 'dev', machineID: 'maquina-9999-xyz' },
    proyectos: proyectos ?? [
      { nombre: 'souclaude', ruta: 'C:/repos/souclaude', sesiones: sesiones ?? [sesionEjemplo()] },
      { nombre: 'otro-proyecto', ruta: 'C:/repos/otro', sesiones: [sesionEjemplo({ sessionId: 'otra-sesion-2222' })] },
    ],
  }
}

function mkTmp(prefijo) {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefijo))
}

function mkPublisher({ vault = mkTmp('souclaude-vault-'), git = gitFake(), ...resto } = {}) {
  const registroPath = path.join(mkTmp('souclaude-reg-'), 'usage-publicado.json')
  const pub = createUsageDbPublisher({
    vaultPath: vault,
    quien: 'ignacio',
    hostname: 'PC01',
    registroPath,
    git,
    ...resto,
  })
  const carpeta = path.join(vault, ...CARPETA_USAGE.split('/'))
  return { pub, vault, git, registroPath, carpeta }
}

function gitFake() {
  const llamadas = []
  const fn = async (args) => {
    llamadas.push(args.filter((a) => !a.startsWith('-C')).join(' '))
  }
  fn.llamadas = llamadas
  return fn
}

function comandos(git) {
  return git.llamadas.map((l) => l.split(' ').slice(1).join(' '))
}

function archivoUnico(carpeta) {
  const nombres = fs.readdirSync(carpeta)
  assert.equal(nombres.length, 1)
  return path.join(carpeta, nombres[0])
}

test('registro: whitelist exacta del ADR — sin titulo, sin ruta local, con desglose completo', () => {
  const registro = construirRegistroDeSesion(
    { ...sesionEjemplo(), proyecto: 'souclaude' },
    { cuenta: { accountUuid: 'x', alias: 'x' }, quien: 'ignacio', machineID: 'maquina-9999-xyz', hostname: 'PC01', ahora: AHORA }
  )
  assert.deepEqual(registro, {
    version: 1,
    sessionId: 'abcd1234-5678-90ab-cdef-111122223333',
    generadoEn: '2025-08-10T04:26:40.000Z',
    inicio: '2025-08-10T03:26:40.000Z',
    fin: '2025-08-10T04:25:40.000Z',
    proyecto: 'souclaude',
    rama: 'feature/SHS-M2-T002-usage-db',
    milestone: 'SHS-M2',
    quien: 'ignacio',
    cuenta: { uuid: 'uuid-cuenta-1111', alias: 'dev' },
    maquina: { machineID: 'maquina-9999-xyz', hostname: 'PC01' },
    tokens: { entrada: 100_000, salida: 9_400, cacheCreacion: 30_000, cacheLectura: 12_000 },
    costoUsd: 1.2346,
    llamadas: 12,
    porModelo: [
      { alias: 'fable', tokensIn: 132_000, tokensOut: 9_000, costoUsd: 1.2 },
      { alias: 'haiku', tokensIn: 10_000, tokensOut: 400, costoUsd: 0.0346 },
    ],
  })
  assert.ok(!JSON.stringify(registro).includes('titulo'))
})

test('registro: sin cuenta propia cae a la de la vista; sin consumo, null', () => {
  const sinCuenta = construirRegistroDeSesion(sesionEjemplo({ cuentaUuid: null, cuentaAlias: null }), {
    cuenta: { accountUuid: 'uuid-vista', alias: 'equipo' },
    ahora: AHORA,
  })
  assert.deepEqual(sinCuenta.cuenta, { uuid: 'uuid-vista', alias: 'equipo' })

  const vacia = sesionEjemplo({ consumo: { entrada: 0, salida: 0, cacheCreacion: 0, cacheLectura: 0 } })
  assert.equal(construirRegistroDeSesion(vacia, { ahora: AHORA }), null)
})

test('archivo: particion por (maquina corta, mes del inicio); hostname y "local" como respaldos', () => {
  const registro = construirRegistroDeSesion(sesionEjemplo(), {
    machineID: 'MAQUINA-9999-xyz',
    hostname: 'PC01',
    ahora: AHORA,
  })
  assert.equal(nombreDeArchivoDeUsage(registro), 'maquina9--2025-08.jsonl')

  const sinMachineId = construirRegistroDeSesion(sesionEjemplo(), { hostname: 'PC01', ahora: AHORA })
  assert.equal(nombreDeArchivoDeUsage(sinMachineId), 'pc01--2025-08.jsonl')

  const sinNada = construirRegistroDeSesion(sesionEjemplo(), { ahora: AHORA })
  assert.equal(nombreDeArchivoDeUsage(sinNada), 'local--2025-08.jsonl')
})

test('seleccion: sesiones de TODOS los proyectos, etiquetadas con el nombre del proyecto', () => {
  const sesiones = sesionesDeUsage(vistaEjemplo())
  assert.deepEqual(
    sesiones.map((s) => [s.sessionId, s.proyecto]),
    [
      ['abcd1234-5678-90ab-cdef-111122223333', 'souclaude'],
      ['otra-sesion-2222', 'otro-proyecto'],
    ]
  )
})

test('publisher: publica las lineas, en el orden git correcto, y sin cambio material no re-commitea', async () => {
  const { pub, git, carpeta } = mkPublisher()

  const r = await pub.publicar(vistaEjemplo(), { ahora: AHORA })
  assert.deepEqual(r, { publicado: true, motivo: null, lineas: 2 })
  assert.deepEqual(comandos(git), [
    'pull --rebase',
    `add ${CARPETA_USAGE}/maquina9--2025-08.jsonl`,
    'commit -m monitor: usage PC01',
    'pull --rebase',
    'push',
  ])
  const lineas = fs.readFileSync(archivoUnico(carpeta), 'utf8').trim().split('\n')
  assert.equal(lineas.length, 2)
  assert.equal(JSON.parse(lineas[0]).proyecto, 'souclaude')

  // Misma vista, pasado el intervalo: generadoEn cambiaria, pero no es cambio
  // material — ni una llamada a git.
  const llamadas = git.llamadas.length
  const r2 = await pub.publicar(vistaEjemplo(), { ahora: AHORA + 6 * 60_000 })
  assert.deepEqual(r2, { publicado: false, motivo: 'sin_cambios' })
  assert.equal(git.llamadas.length, llamadas)
})

test('publisher: una sesion que crece actualiza SU linea; una editada a mano no se pisa', async () => {
  const { pub, carpeta } = mkPublisher()
  const vistaDeUna = (sesion) => vistaEjemplo({ proyectos: [{ nombre: 'souclaude', sesiones: [sesion] }] })
  await pub.publicar(vistaDeUna(sesionEjemplo()), { ahora: AHORA })

  const crecida = sesionEjemplo({ consumo: { entrada: 200_000, salida: 20_000, costoUsd: 2, llamadas: 20 } })
  await pub.publicar(vistaDeUna(crecida), { ahora: AHORA + 6 * 60_000 })
  const archivo = archivoUnico(carpeta)
  let lineas = fs.readFileSync(archivo, 'utf8').trim().split('\n')
  assert.equal(lineas.length, 1)
  assert.equal(JSON.parse(lineas[0]).tokens.entrada, 200_000)

  // Alguien edita la linea a mano: la proxima actualizacion NO la pisa, agrega.
  fs.writeFileSync(archivo, lineas[0].replace('"quien":"ignacio"', '"quien":"editado"') + '\n', 'utf8')
  const masCrecida = sesionEjemplo({ consumo: { entrada: 300_000, salida: 30_000, costoUsd: 3, llamadas: 30 } })
  await pub.publicar(vistaDeUna(masCrecida), { ahora: AHORA + 12 * 60_000 })
  lineas = fs.readFileSync(archivo, 'utf8').trim().split('\n')
  assert.equal(lineas.length, 2)
})

test('publisher: una linea con secreto no se publica y queda en estado()', async () => {
  const { pub, git } = mkPublisher()
  const vista = vistaEjemplo({
    proyectos: [
      { nombre: 'souclaude', sesiones: [sesionEjemplo({ rama: 'feature/sk-ant-api03-abcdefghijklmnop' })] },
    ],
  })
  const r = await pub.publicar(vista, { ahora: AHORA })
  assert.deepEqual(r, { publicado: false, motivo: 'secreto_detectado' })
  assert.equal(pub.estado().secretoDetectado, true)
  assert.equal(git.llamadas.length, 0)
})

test('publisher: sin vault degrada sin tocar git; el pull que falla acumula backoff', async () => {
  const git = gitFake()
  const sinVault = createUsageDbPublisher({ git })
  assert.deepEqual(await sinVault.publicar(vistaEjemplo(), { ahora: AHORA }), { publicado: false, motivo: 'sin_vault' })
  assert.equal(git.llamadas.length, 0)

  const gitRoto = async (args) => {
    if (args.includes('pull')) throw new Error('sin red')
  }
  const { pub } = mkPublisher({ git: gitRoto, intervaloMs: 0 })
  for (let i = 0; i < 3; i++) {
    const r = await pub.publicar(vistaEjemplo(), { ahora: AHORA + i * 1000 })
    assert.deepEqual(r, { publicado: false, motivo: 'pull_fallo' })
  }
  assert.equal(pub.estado().fallosSeguidos, 3)
  const r = await pub.publicar(vistaEjemplo(), { ahora: AHORA + 4000 })
  assert.equal(r.motivo, 'backoff')
})

test('publisher: el registro local sobrevive entre instancias (no re-publica)', async () => {
  const { pub, vault, registroPath } = mkPublisher()
  await pub.publicar(vistaEjemplo(), { ahora: AHORA })

  const git2 = gitFake()
  const pub2 = createUsageDbPublisher({
    vaultPath: vault,
    quien: 'ignacio',
    hostname: 'PC01',
    registroPath,
    git: git2,
  })
  const r = await pub2.publicar(vistaEjemplo(), { ahora: AHORA + 10 * 60_000 })
  assert.deepEqual(r, { publicado: false, motivo: 'sin_cambios' })
  assert.equal(git2.llamadas.length, 0)
})
