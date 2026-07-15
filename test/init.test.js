import { test } from 'node:test'
import assert from 'node:assert/strict'
import { main } from '../src/cli.js'
import { mkRepo, read, has, tree, snapshot, replan, verdicts } from './helpers.js'
import { NOOP } from '../src/core/plan.js'
import { missingVars } from '../src/core/render.js'

const YES = ['--yes', '--name', 'acme', '--type', 'backend', '--lang', 'es']

test('init en repo vacio: emite el harness completo + scaffolding', async () => {
  const dir = mkRepo({ 'README.md': '' })
  assert.equal(await main(['init', ...YES], dir), 0)

  const files = tree(dir)

  // La superficie Claude.
  assert.ok(files.includes('CLAUDE.md'))
  assert.ok(files.includes('.claude/settings.json'))
  assert.ok(files.includes('.claude/harness.json'))
  assert.ok(files.includes('docs/constitution.md'))
  assert.ok(files.includes('docs/decisions/_template.md'))
  assert.ok(files.includes('specs/_templates/spec-template.md'))
  assert.ok(files.includes('specs/_templates/spec-lite-template.md'))
  assert.ok(files.includes('.gitignore'))

  // Las 5 skills CCEM + los 4 comandos, project-local.
  for (const s of ['ccem-core', 'ccem-sdd', 'ccem-research', 'ccem-stack', 'ccem-prompting']) {
    assert.ok(files.includes(`.claude/skills/${s}/SKILL.md`), `falta la skill ${s}`)
  }
  for (const c of ['spec-new', 'adr-new', 'constitution-check', 'harness-upgrade']) {
    assert.ok(files.includes(`.claude/skills/${c}/SKILL.md`), `falta el comando ${c}`)
  }

  // Scaffolding: solo porque el repo estaba vacio.
  assert.ok(files.includes('src/.gitkeep'))
  assert.ok(files.includes('tests/.gitkeep'))
  assert.ok(files.includes('scripts/.gitkeep'))

  // .claudeignore NO se emite: Claude Code nunca lo soporto.
  assert.ok(!files.includes('.claudeignore'))
})

test('init: no queda ningun {{PLACEHOLDER}} sin resolver', async () => {
  const dir = mkRepo({ 'README.md': '' })
  await main(['init', ...YES], dir)

  for (const rel of ['CLAUDE.md', 'docs/constitution.md', 'notes.md', 'README.md']) {
    assert.deepEqual(missingVars(read(dir, rel), {}), [], `${rel} tiene placeholders sin resolver`)
  }
})

test('init: las vars llegan al contenido', async () => {
  const dir = mkRepo({ 'README.md': '' })
  await main(['init', '--yes', '--name', 'facturacion', '--type', 'data', '--lang', 'en'], dir)

  const claudeMd = read(dir, 'CLAUDE.md')
  assert.ok(claudeMd.includes('# CLAUDE.md — facturacion'))
  assert.ok(claudeMd.includes('Proyecto de data.'))
  assert.ok(claudeMd.includes('Responder siempre en ingles.'))
})

test('init: el settings.json emitido es schema-correcto', async () => {
  const dir = mkRepo({ 'README.md': '' })
  await main(['init', ...YES], dir)

  const settings = JSON.parse(read(dir, '.claude/settings.json'))

  // Las 4 claves del Kit v0 que Claude Code ignora en silencio.
  for (const bad of ['effort', 'auto_confirm_destructive', 'display_tools', 'token_budget_warning']) {
    assert.ok(!(bad in settings), `se emitio la clave invalida "${bad}"`)
  }
  assert.equal(settings.effortLevel, 'medium')
  assert.equal(settings.model, undefined, 'no forzamos modelo a nivel proyecto')

  // La exclusion real de secretos vive aca, no en un .claudeignore.
  assert.ok(settings.permissions.deny.includes('Read(./.env)'))
  assert.ok(settings.permissions.deny.includes('Read(./secrets/**)'))
})

test('la constitucion usa la numeracion canonica P1-P10', async () => {
  const dir = mkRepo({ 'README.md': '' })
  await main(['init', ...YES], dir)

  const c = read(dir, 'docs/constitution.md')

  // La colision historica: el Kit numeraba Simplicity/Surgical como P7/P8, el doc de
  // arquitectura como P9/P10. Canonico = P9/P10. Un plan.md que tilde "P9 Simplicity"
  // tiene que referirse a lo mismo en todos los repos.
  assert.match(c, /## P9 — Simplicity First \(universal — no editar\)/)
  assert.match(c, /## P10 — Surgical Changes \(universal — no editar\)/)
  assert.match(c, /## P1 — Contratos antes que tecnologías/)
  assert.match(c, /## P2 — Hexagonal por defecto, con enforcement automático/)
  assert.ok(c.includes('adapters  →  application  →  domain'))

  // Y CLAUDE.md tiene que decir lo mismo, o los repos se desalinean.
  assert.ok(read(dir, 'CLAUDE.md').includes('P1-P10'))
})

test('el enforcer de P2 se deriva del stack detectado', async () => {
  const py = mkRepo({ 'pyproject.toml': '[project]\nname="x"\n' })
  await main(['init', ...YES], py)
  assert.ok(read(py, 'docs/constitution.md').includes('import-linter'))

  const node = mkRepo({ 'package.json': '{"name":"x"}' })
  await main(['init', ...YES], node)
  assert.ok(read(node, 'docs/constitution.md').includes('dependency-cruiser'))

  const java = mkRepo({ 'pom.xml': '<project/>' })
  await main(['init', ...YES], java)
  assert.ok(read(java, 'docs/constitution.md').includes('ArchUnit'))
})

test('se emiten los archivos obligatorios de Fase 1 de la guia Git', async () => {
  const dir = mkRepo({ 'README.md': '' })
  await main(['init', ...YES], dir)

  assert.ok(has(dir, '.github/pull_request_template.md'))
  assert.ok(has(dir, '.github/CODEOWNERS'))
  assert.ok(read(dir, '.github/pull_request_template.md').includes('Planner / SharePoint ID'))

  // Las skills SOUTEC.
  assert.ok(has(dir, '.claude/skills/ccem-planner/SKILL.md'))
  assert.ok(has(dir, '.claude/skills/soutec-github/SKILL.md'))
  assert.ok(read(dir, '.claude/skills/soutec-github/SKILL.md').includes('Nunca `git push origin main`'))
})

test('IDEMPOTENCIA: correr init dos veces no cambia nada la segunda vez', async () => {
  const dir = mkRepo({ 'README.md': '' })

  await main(['init', ...YES], dir)
  const before = snapshot(dir)

  await main(['init', ...YES], dir)
  const after = snapshot(dir)

  assert.equal(after, before, 'la segunda corrida modifico archivos')

  // La prueba real: el plar recomputado no tiene ni una accion de escritura.
  const plan = replan(dir)
  const nonNoop = plan.actions.filter((a) => a.verdict !== NOOP)
  assert.deepEqual(nonNoop.map((a) => `${a.dest}:${a.verdict}`), [], 'quedaron acciones pendientes')
})

// El caso real: un repo recien creado en GitHub trae un README.md de 0 bytes.
// Tratarlo como "archivo del usuario" dejaria un README.md.new al lado para siempre.
test('un archivo vacio se llena, no se le deja un .new al lado', async () => {
  const dir = mkRepo({ 'README.md': '' })
  await main(['init', ...YES], dir)

  assert.ok(!has(dir, 'README.md.new'))
  assert.ok(read(dir, 'README.md').includes('# acme'))

  // Y queda reclamado en el lockfile, asi que la proxima corrida es NOOP.
  const lock = JSON.parse(read(dir, '.claude/harness.json'))
  assert.ok(lock.files['README.md'])
})

test('PUREZA DE --dry-run: no se escribe ni un byte', async () => {
  const dir = mkRepo({ 'README.md': '# mi readme', 'package.json': '{"name":"x"}' })
  const before = snapshot(dir, { includeLockfile: true })

  assert.equal(await main(['init', ...YES, '--dry-run'], dir), 0)

  assert.equal(snapshot(dir, { includeLockfile: true }), before, '--dry-run escribio algo')
  assert.ok(!has(dir, '.claude/harness.json'))
  assert.ok(!has(dir, 'CLAUDE.md'))
})

test('el lockfile registra hash y policy de cada archivo emitido', async () => {
  const dir = mkRepo({ 'README.md': '' })
  await main(['init', ...YES], dir)

  const lock = JSON.parse(read(dir, '.claude/harness.json'))
  assert.equal(lock.harnessVersion, '1.0.0')
  assert.equal(lock.vars.PROJECT_NAME, 'acme')
  assert.equal(lock.files['CLAUDE.md'].policy, 'user-owned')
  assert.equal(lock.files['.claude/skills/ccem-core/SKILL.md'].policy, 'managed')
  assert.ok(lock.blocks['.gitignore'].hash, 'el bloque del .gitignore no quedo registrado')

  // El lockfile refleja el disco: replanificar da NOOP y nada mas.
  assert.deepEqual(Object.keys(verdicts(replan(dir))), [NOOP])
})
