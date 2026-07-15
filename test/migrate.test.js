import { test } from 'node:test'
import assert from 'node:assert/strict'
import { main } from '../src/cli.js'
import { mkRepo, read, has, snapshot, replan, verdicts } from './helpers.js'
import { OBSOLETE, NOOP } from '../src/core/plan.js'
import { apply } from '../src/core/apply.js'
import { loadManifest } from '../src/core/manifest.js'
import { detect } from '../src/core/detect.js'
import { readLockfile } from '../src/core/lockfile.js'

const YES = ['--yes', '--name', 'kit', '--type', 'backend', '--lang', 'es']

// El Kit v0 tal como existe hoy: settings.json con 4 claves que Claude Code ignora,
// un .claudeignore que nunca hizo nada, y un CLAUDE.md hecho a mano.
function kitV0() {
  return mkRepo({
    'package.json': '{"name":"proyecto-viejo"}',
    'CLAUDE.md': '# CLAUDE.md — Proyecto viejo\n\n## Metodología CCEM\nVerificar instalación: `ls ~/.claude/skills/ccem-*`\n',
    '.claude/settings.json': JSON.stringify(
      {
        model: 'opusplan',
        effort: 'medium',
        auto_confirm_destructive: false,
        display_tools: 'lean',
        token_budget_warning: 100000,
      },
      null,
      2
    ),
    '.claudeignore': '# Lockfiles (mucho texto, poco valor para Claude)\npackage-lock.json\n',
    'docs/constitution.md': '# Constitución\n\n### P7 — Simplicity First\nMínimo código.\n',
    '.gitignore': 'node_modules/\n',
  })
}

test('migracion v0: las 4 claves invalidas del settings.json se remueven', async () => {
  const dir = kitV0()

  assert.equal(await main(['upgrade', ...YES], dir), 0)

  const settings = JSON.parse(read(dir, '.claude/settings.json'))

  for (const bad of ['effort', 'auto_confirm_destructive', 'display_tools', 'token_budget_warning']) {
    assert.ok(!(bad in settings), `la clave invalida "${bad}" sobrevivio al upgrade`)
  }

  // model: "opusplan" tampoco es un valor valido, pero es un valor que el usuario
  // escribio. La migracion remueve claves invalidas, no juzga valores: el seed-merge
  // lo respeta. Removerlo seria una decision aparte, explicita.
  assert.equal(settings.model, 'opusplan')

  // Y lo que el harness aporta se agrega sin pisar nada.
  assert.equal(settings.effortLevel, 'medium')
  assert.ok(settings.permissions.deny.includes('Read(./.env)'))
})

test('migracion v0: el .claudeignore se marca obsoleto, pero NO se borra solo', async () => {
  const dir = kitV0()
  await main(['upgrade', ...YES], dir)

  // Sigue ahi: borrar es destructivo y --prune no se pidio (P5).
  assert.ok(has(dir, '.claudeignore'))

  const plan = replan(dir)
  const obsoletos = verdicts(plan)[OBSOLETE] ?? []
  assert.deepEqual(obsoletos, ['.claudeignore'])

  const razon = plan.actions.find((a) => a.dest === '.claudeignore').reasons[0]
  assert.match(razon, /nunca soporto \.claudeignore/)
})

test('migracion v0: --prune borra el .claudeignore, con backup', async () => {
  const dir = kitV0()
  await main(['upgrade', ...YES], dir)

  // --prune exige doble confirmacion interactiva, asi que en test se ejercita
  // apply() directo. Es la misma ruta de codigo que corre tras el "BORRAR".
  const manifest = loadManifest()
  const lock = readLockfile(dir)
  const detected = detect(dir)
  const plan = replan(dir)

  const res = apply({ plan, cwd: dir, manifest, vars: lock.vars, detected, lock, prune: true, backup: true })

  assert.ok(!has(dir, '.claudeignore'), 'el .claudeignore no se borro')
  assert.deepEqual(res.removed, ['.claudeignore'])
  // Backup antes de borrar: P5.
  assert.ok(res.backupRoot)
  assert.ok(has(dir, `.claude/${res.backupRoot.split(/[\\/]/).pop()}/.claudeignore`))
})

test('migracion v0: el CLAUDE.md hecho a mano NO se pisa', async () => {
  const dir = kitV0()
  const original = read(dir, 'CLAUDE.md')

  await main(['upgrade', ...YES], dir)

  assert.equal(read(dir, 'CLAUDE.md'), original)
  assert.ok(has(dir, 'CLAUDE.md.new'))

  // El .new apunta a las skills project-local, no al `ls ~/.claude/skills/` viejo.
  const propuesta = read(dir, 'CLAUDE.md.new')
  assert.ok(propuesta.includes('.claude/skills/'))
  assert.ok(!propuesta.includes('ls ~/.claude/skills/ccem-*'))
})

test('migracion v0: lo que faltaba se crea (skills, comandos, templates lite)', async () => {
  const dir = kitV0()
  await main(['upgrade', ...YES], dir)

  for (const s of ['ccem-core', 'ccem-sdd', 'ccem-research', 'ccem-stack', 'ccem-prompting']) {
    assert.ok(has(dir, `.claude/skills/${s}/SKILL.md`), `no se creo la skill ${s}`)
  }
  for (const c of ['spec-new', 'adr-new', 'constitution-check', 'harness-upgrade']) {
    assert.ok(has(dir, `.claude/skills/${c}/SKILL.md`), `no se creo el comando ${c}`)
  }
  // Los templates lite que specs/README.md prometia y nunca existieron.
  assert.ok(has(dir, 'specs/_templates/spec-lite-template.md'))
  assert.ok(has(dir, 'specs/_templates/plan-lite-template.md'))
  assert.ok(has(dir, 'specs/_templates/tasks-lite-template.md'))
})

test('migracion v0: backup de todo lo sobrescrito', async () => {
  const dir = kitV0()
  await main(['upgrade', ...YES], dir)

  const backups = (await import('node:fs')).readdirSync(
    (await import('node:path')).join(dir, '.claude')
  ).filter((e) => e.startsWith('backup-'))

  assert.equal(backups.length, 1, 'no se creo el directorio de backup')
  // settings.json fue sobrescrito (migracion + merge), asi que su version previa
  // tiene que estar guardada.
  assert.ok(has(dir, `.claude/${backups[0]}/.claude/settings.json`))
  const previo = JSON.parse(read(dir, `.claude/${backups[0]}/.claude/settings.json`))
  assert.equal(previo.display_tools, 'lean', 'el backup no tiene el contenido original')
})

test('adopt sobre el Kit v0: escribe el lockfile y no toca ni un archivo', async () => {
  const dir = kitV0()
  const antes = snapshot(dir, { includeLockfile: true })

  assert.equal(await main(['adopt', ...YES], dir), 0)

  const despues = snapshot(dir, { includeLockfile: false })
  assert.equal(despues, antes, 'adopt modifico un archivo')
  assert.ok(has(dir, '.claude/harness.json'))

  const lock = JSON.parse(read(dir, '.claude/harness.json'))
  assert.equal(lock.adopted, true)
  assert.equal(lock.harnessVersion, '0.0.0')

  // Nada del Kit coincide byte a byte con el harness v1, asi que el lockfile no
  // reclama nada. Reclamar un archivo modificado seria autorizar al upgrade a pisarlo.
  assert.equal(lock.files['CLAUDE.md'], undefined)
  assert.equal(lock.files['.claude/settings.json'], undefined)
})

test('upgrade despues de adopt: converge y queda idempotente', async () => {
  const dir = kitV0()
  await main(['adopt', ...YES], dir)
  await main(['upgrade', ...YES], dir)

  const estable = snapshot(dir)
  await main(['upgrade', ...YES], dir)
  assert.equal(snapshot(dir), estable, 'el segundo upgrade no fue idempotente')

  // Lo unico que queda pendiente es el .claudeignore obsoleto (requiere --prune)
  // y el CLAUDE.md del usuario (que nunca se pisa).
  const pendientes = Object.keys(verdicts(replan(dir))).filter((v) => v !== NOOP)
  assert.deepEqual(pendientes.sort(), ['foreign', 'obsolete'])
})
