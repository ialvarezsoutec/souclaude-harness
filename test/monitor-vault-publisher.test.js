import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import {
  createVaultPublisher,
  construirSnapshot,
  nombreDeSnapshot,
} from '../src/monitor/adapters/vault-monitor-publisher.js'

// Este archivo responde: "el publisher escribe al Vault exactamente lo que el
// ADR autoriza, en el orden git correcto, sin secretos y sin ruido de
// commits?". git va inyectado como fake que registra llamadas; el Vault es un
// directorio temporal; timestamps fijos.

const AHORA = 1_754_800_000_000

function vistaEjemplo({ cuenta, extra } = {}) {
  return {
    cuenta: cuenta ?? {
      accountUuid: 'aaaa1111-2222-3333-4444-555566667777',
      alias: 'dev',
      email: 'dev@soutec-group.com',
      organizacion: 'SOUTEC',
      machineID: 'bbbb8888-9999-0000-1111-222233334444',
    },
    limites: {
      cincoHoras: { porcentaje: 42, reseteaEn: 123 },
      sieteDias: { porcentaje: 61, reseteaEn: 456 },
      gastoExtra: { habilitado: true, usadoUsd: 12.5, limiteUsd: 50, porcentaje: 25, ...extra },
      leidoEn: AHORA - 1000,
    },
    totales: { entrada: 100, salida: 50, cacheCreacion: 10, cacheLectura: 40, llamadas: 3, costoUsd: 0.5, sinPrecio: 0 },
  }
}

function mkVault() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'souclaude-vault-'))
}

function gitFake() {
  const llamadas = []
  const fn = async (args) => {
    llamadas.push(args.filter((a) => !a.startsWith('-C') && a !== fn.vaultPath).join(' '))
  }
  fn.llamadas = llamadas
  return fn
}

function comandos(git) {
  // ['-C', ruta, 'pull', '--rebase'] -> 'pull --rebase' (la ruta varia por test)
  return git.llamadas.map((l) => l.split(' ').slice(1).join(' '))
}

test('publisher: snapshot por whitelist, con nombre estable por cuenta+maquina', () => {
  const snapshot = construirSnapshot(vistaEjemplo(), { ahora: AHORA, hostname: 'PC01', version: '1.1.0' })
  assert.deepEqual(Object.keys(snapshot), ['version', 'generadoEn', 'cuenta', 'maquina', 'limites', 'totalesDia', 'origen'])
  assert.equal(snapshot.version, 1)
  assert.equal(snapshot.cuenta.alias, 'dev')
  assert.equal(snapshot.maquina.hostname, 'PC01')
  // tokensIn = 100 + 10 + 40
  assert.equal(snapshot.totalesDia.tokensIn, 150)
  assert.equal(nombreDeSnapshot(snapshot), 'aaaa1111--bbbb8888.json')
  // El snapshot publicado pesa menos de 1 KB (regla del ADR).
  assert.ok(JSON.stringify(snapshot).length < 1024)
})

test('publisher: sin identidad no se construye snapshot ni se publica', async () => {
  assert.equal(construirSnapshot({ cuenta: null }, { ahora: AHORA }), null)

  const git = gitFake()
  const pub = createVaultPublisher({ vaultPath: mkVault(), git, hostname: 'PC01' })
  const r = await pub.publicar({ cuenta: null }, { ahora: AHORA })
  assert.deepEqual(r, { publicado: false, motivo: 'sin_identidad' })
  assert.equal(git.llamadas.length, 0)
})

test('publisher: secuencia git pull->add->commit->push y archivo escrito', async () => {
  const vault = mkVault()
  const git = gitFake()
  const pub = createVaultPublisher({ vaultPath: vault, git, hostname: 'PC01' })

  const r = await pub.publicar(vistaEjemplo(), { ahora: AHORA })
  assert.deepEqual(r, { publicado: true, motivo: null })

  const ops = comandos(git)
  assert.deepEqual(ops, [
    'pull --rebase',
    'add 00-System/monitor/aaaa1111--bbbb8888.json',
    'commit -m monitor: snapshot dev@PC01',
    'push',
  ])

  const archivo = path.join(vault, '00-System', 'monitor', 'aaaa1111--bbbb8888.json')
  const escrito = JSON.parse(fs.readFileSync(archivo, 'utf8'))
  assert.equal(escrito.cuenta.accountUuid, 'aaaa1111-2222-3333-4444-555566667777')
})

test('publisher: sin cambio material no hay ninguna llamada git', async () => {
  const vault = mkVault()
  const git = gitFake()
  const pub = createVaultPublisher({ vaultPath: vault, git, hostname: 'PC01', intervaloMs: 0 })

  await pub.publicar(vistaEjemplo(), { ahora: AHORA })
  const llamadasPrimera = git.llamadas.length

  // Mismo contenido 5 minutos despues: solo cambia generadoEn -> no publica.
  const r = await pub.publicar(vistaEjemplo(), { ahora: AHORA + 5 * 60_000 })
  assert.deepEqual(r, { publicado: false, motivo: 'sin_cambios' })
  assert.equal(git.llamadas.length, llamadasPrimera)

  // Con un limite distinto si publica de nuevo.
  const vista2 = vistaEjemplo()
  vista2.limites.cincoHoras.porcentaje = 88
  const r2 = await pub.publicar(vista2, { ahora: AHORA + 10 * 60_000 })
  assert.equal(r2.publicado, true)
})

test('publisher: el heartbeat republica aunque no haya cambios', async () => {
  const vault = mkVault()
  const git = gitFake()
  const pub = createVaultPublisher({ vaultPath: vault, git, hostname: 'PC01', intervaloMs: 0, heartbeatMs: 30 * 60_000 })

  await pub.publicar(vistaEjemplo(), { ahora: AHORA })
  // 31 minutos despues, mismo contenido: el heartbeat fuerza la publicacion.
  const r = await pub.publicar(vistaEjemplo(), { ahora: AHORA + 31 * 60_000 })
  assert.equal(r.publicado, true)
})

test('publisher: respeta el intervalo entre intentos', async () => {
  const git = gitFake()
  const pub = createVaultPublisher({ vaultPath: mkVault(), git, hostname: 'PC01' })

  await pub.publicar(vistaEjemplo(), { ahora: AHORA })
  const r = await pub.publicar(vistaEjemplo(), { ahora: AHORA + 60_000 }) // 1 min < 5 min
  assert.deepEqual(r, { publicado: false, motivo: 'intervalo' })
})

test('publisher: un token plantado aborta la publicacion y no escribe nada', async () => {
  const vault = mkVault()
  const git = gitFake()
  const pub = createVaultPublisher({ vaultPath: vault, git, hostname: 'PC01' })

  const vista = vistaEjemplo({
    cuenta: {
      accountUuid: 'aaaa1111-2222-3333-4444-555566667777',
      alias: 'dev',
      email: 'sk-ant-api03-abcdefghijklmnop@x.com', // secreto plantado
      organizacion: null,
      machineID: 'bbbb8888',
    },
  })
  const r = await pub.publicar(vista, { ahora: AHORA })
  assert.deepEqual(r, { publicado: false, motivo: 'secreto_detectado' })
  assert.equal(pub.estado().secretoDetectado, true)
  assert.equal(git.llamadas.length, 0)
  assert.equal(fs.existsSync(path.join(vault, '00-System', 'monitor')), false)
})

test('publisher: fallos de pull acumulan backoff y no escriben', async () => {
  const vault = mkVault()
  let intentos = 0
  const git = async (args) => {
    if (args.includes('pull')) {
      intentos += 1
      throw new Error('sin red')
    }
  }
  const pub = createVaultPublisher({ vaultPath: vault, git, hostname: 'PC01', intervaloMs: 0 })

  for (let i = 0; i < 3; i++) {
    const r = await pub.publicar(vistaEjemplo(), { ahora: AHORA + i * 1000 })
    assert.equal(r.publicado, false)
    assert.equal(r.motivo, 'pull_fallo')
  }
  assert.equal(pub.estado().fallosSeguidos, 3)
  assert.ok(pub.estado().backoffHasta > AHORA)

  // Con backoff activo ni siquiera intenta el pull.
  const r = await pub.publicar(vistaEjemplo(), { ahora: AHORA + 4000 })
  assert.equal(r.motivo, 'backoff')
  assert.equal(intentos, 3)
  assert.equal(fs.existsSync(path.join(vault, '00-System', 'monitor')), false)
})

test('publisher: sin vaultPath degrada sin tocar git', async () => {
  const git = gitFake()
  const pub = createVaultPublisher({ git, hostname: 'PC01' })
  const r = await pub.publicar(vistaEjemplo(), { ahora: AHORA })
  assert.deepEqual(r, { publicado: false, motivo: 'sin_vault' })
  assert.equal(git.llamadas.length, 0)
})
