import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { execFileSync } from 'node:child_process'

import { monitor } from '../src/commands/monitor.js'
import { createVaultPublisher } from '../src/monitor/adapters/vault-monitor-publisher.js'
import { gitAsync } from '../src/monitor/adapters/vault-accounts-reader.js'
import { mkClaudeHome, lineaAssistant } from './helpers-monitor.js'

// E2E de SHS-H3-monitor-multicuenta: dos cuentas (A y B) en "maquinas"
// distintas (dos clones de un mismo Vault bare), cada una publica su snapshot
// con git DE VERDAD, y el monitor de A consolida ambas en vista.cuentas.
// Tambien: --emit-router atribuye la linea a la cuenta A.
//
// helpers.js (via helpers-monitor.js) fuerza CI=true: monitor() cae siempre a
// los modos sin TTY y jamas toca la red.

const AHORA = Date.now()

function git(args, cwd) {
  return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: 'pipe' })
}

// Un Vault falso: bare + N clones con identidad git propia y 00-System/ ya
// commiteado (looksLikeVault exige esa carpeta).
function mkVaultFalso(nClones) {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'souclaude vault e2e '))
  const bare = path.join(base, 'vault-remote.git')
  fs.mkdirSync(bare)
  git(['init', '--bare', bare])

  const semilla = path.join(base, 'semilla')
  git(['clone', bare, semilla])
  configurarIdentidad(semilla)
  fs.mkdirSync(path.join(semilla, '00-System'), { recursive: true })
  fs.writeFileSync(path.join(semilla, '00-System', '.gitkeep'), '')
  git(['add', '.'], semilla)
  git(['commit', '-m', 'init vault'], semilla)
  git(['push'], semilla)

  const clones = []
  for (let i = 0; i < nClones; i++) {
    const clon = path.join(base, `clon-${i}`)
    git(['clone', bare, clon])
    configurarIdentidad(clon)
    clones.push(clon)
  }
  return clones
}

function configurarIdentidad(repo) {
  git(['config', 'user.email', 'test@soutec-group.com'], repo)
  git(['config', 'user.name', 'Test E2E'], repo)
}

function vistaDeCuenta({ uuid, alias, machineID, pct5h }) {
  return {
    cuenta: { accountUuid: uuid, alias, email: `${alias}@soutec-group.com`, organizacion: 'SOUTEC', machineID },
    limites: {
      cincoHoras: { porcentaje: pct5h, reseteaEn: null },
      sieteDias: { porcentaje: 30, reseteaEn: null },
      gastoExtra: null,
      leidoEn: AHORA,
    },
    totales: { entrada: 100, salida: 50, cacheCreacion: 0, cacheLectura: 0, llamadas: 2, costoUsd: 0.2, sinPrecio: 0 },
  }
}

async function correrJsonEnProceso(flags, cwd) {
  const original = console.log
  let salida = ''
  console.log = (...args) => {
    salida += args.join(' ') + '\n'
  }
  try {
    const code = await monitor(flags, cwd)
    return { code, salida: salida.replace(/\n$/, '') }
  } finally {
    console.log = original
  }
}

test('e2e multicuenta: A y B publican sin conflicto y el monitor de A consolida ambas', async () => {
  const [clonA, clonB] = mkVaultFalso(2)

  // Cada cuenta publica desde su propio clon (su "maquina").
  const pubA = createVaultPublisher({ vaultPath: clonA, git: gitAsync, hostname: 'PC-A' })
  const pubB = createVaultPublisher({ vaultPath: clonB, git: gitAsync, hostname: 'PC-B' })

  const rA = await pubA.publicar(vistaDeCuenta({ uuid: 'aaaa1111-uuid', alias: 'dev', machineID: 'mmmm1111', pct5h: 88 }), { ahora: AHORA })
  assert.deepEqual(rA, { publicado: true, motivo: null })

  // B publica DESPUES de que A pusheo: su pull --rebase trae el snapshot de A
  // y el push no choca (archivos disjuntos).
  const rB = await pubB.publicar(vistaDeCuenta({ uuid: 'bbbb2222-uuid', alias: 'dev2', machineID: 'mmmm2222', pct5h: 12 }), { ahora: AHORA })
  assert.deepEqual(rB, { publicado: true, motivo: null })

  // El clon de A se actualiza (en la vida real lo hace el pull del publisher
  // o del accounts-reader en su proximo ciclo).
  git(['pull', '--rebase'], clonA)
  const carpeta = path.join(clonA, '00-System', 'monitor')
  assert.deepEqual(fs.readdirSync(carpeta).sort(), ['aaaa1111--mmmm1111.json', 'bbbb2222--mmmm2222.json'])

  // El monitor de la maquina A (home con la cuenta A) consolida: A local + B remota.
  const home = mkClaudeHome({
    proyectos: { 'proyecto-a': { 'sess-1.jsonl': [lineaAssistant({ sessionId: 'sess-1' })] } },
    config: {
      machineID: 'mmmm1111',
      oauthAccount: { accountUuid: 'aaaa1111-uuid', emailAddress: 'dev@soutec-group.com', organizationName: 'SOUTEC' },
      cachedUsageUtilization: { fetchedAtMs: AHORA, utilization: { five_hour: { utilization: 88, resets_at: null } } },
    },
  })

  process.env.VAULT_PATH = clonA
  let vista
  try {
    const { code, salida } = await correrJsonEnProceso({ once: true, json: true, 'claude-home': home }, os.tmpdir())
    assert.equal(code, 1) // 88% esta entre 85 y 94
    vista = JSON.parse(salida)
  } finally {
    delete process.env.VAULT_PATH
  }

  assert.equal(vista.cuenta.alias, 'dev')
  const porUuid = new Map(vista.cuentas.map((c) => [c.accountUuid, c]))
  assert.equal(porUuid.size, 2)
  assert.equal(porUuid.get('aaaa1111-uuid').esLocal, true)
  assert.equal(porUuid.get('bbbb2222-uuid').esLocal, false)
  assert.equal(porUuid.get('bbbb2222-uuid').maquina, 'PC-B')
  assert.equal(porUuid.get('bbbb2222-uuid').limites.cincoHoras.porcentaje, 12)
  assert.ok(porUuid.get('bbbb2222-uuid').frescuraMs >= 0)
})

test('e2e multicuenta: --emit-router atribuye la linea a la cuenta de la maquina', async () => {
  const home = mkClaudeHome({
    proyectos: {
      'proyecto-a': {
        'sess-9.jsonl': [lineaAssistant({ sessionId: 'sess-9', agentId: 'ag-e2e', attributionAgent: 'implementer' })],
        'sess-9/subagents/agent-ag-e2e.jsonl': [lineaAssistant({ sessionId: 'sess-9', agentId: 'ag-e2e' })],
      },
    },
    config: {
      machineID: 'mmmm1111',
      oauthAccount: { accountUuid: 'aaaa1111-uuid', emailAddress: 'dev@soutec-group.com' },
    },
  })
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'souclaude e2e router '))

  const code = await monitor(
    {
      'emit-router': true,
      hito: 'SHS-H3',
      task: 'SHS-H3-T211',
      agente: 'implementer',
      resultado: 'approved',
      session: 'sess-9',
      'claude-home': home,
    },
    cwd,
  )
  assert.equal(code, 0)

  const lineas = fs
    .readFileSync(path.join(cwd, 'progress', 'model-router.jsonl'), 'utf8')
    .trim()
    .split('\n')
    .map((l) => JSON.parse(l))
  assert.equal(lineas.length, 1)
  assert.equal(lineas[0].cuenta, 'dev')
  assert.equal(lineas[0].cuenta_uuid, 'aaaa1111-uuid')
  assert.equal(lineas[0].maquina, 'mmmm1111')
  assert.equal(lineas[0].medicion, 'medido')
})
