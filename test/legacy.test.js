import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { main } from '../src/cli.js'
import { mkRepo, read, write, has, tree, snapshot, replan } from './helpers.js'
import { BEGIN } from '../src/core/block.js'
import { resolveVars } from '../src/commands/_shared.js'
import { loadManifest } from '../src/core/manifest.js'
import { detect } from '../src/core/detect.js'
import { NOOP } from '../src/core/plan.js'

const YES = ['--yes', '--name', 'legacy', '--type', 'backend', '--lang', 'es']

test('legacy node: no se crea src/.gitkeep sobre un proyecto que ya tiene codigo', async () => {
  const dir = mkRepo({
    'package.json': '{"name":"api-facturacion","dependencies":{"fastify":"^4"}}',
    'src/index.js': 'console.log(1)',
    'README.md': '# API',
  })

  assert.equal(await main(['init', '--yes', '--type', 'backend', '--lang', 'es'], dir), 0)

  // El scaffolding es solo para greenfield. Tirarle un .gitkeep a un src/ que ya
  // tiene codigo es exactamente el cambio no pedido que P8 prohibe.
  assert.ok(!has(dir, 'src/.gitkeep'))
  assert.ok(!has(dir, 'tests/.gitkeep'))
  assert.ok(!has(dir, 'scripts/.gitkeep'))

  // Tampoco se pisa el README ni se emite el .env.example: no son asunto del harness
  // en un repo que ya existe.
  assert.equal(read(dir, 'README.md'), '# API')
  assert.ok(!has(dir, 'README.md.new'))
  assert.ok(!has(dir, '.env.example'))

  // Pero la superficie Claude sí se emite.
  assert.ok(has(dir, 'CLAUDE.md'))
  assert.ok(has(dir, '.claude/skills/ccem-core/SKILL.md'))

  // Y el nombre y el stack salen del package.json.
  const claudeMd = read(dir, 'CLAUDE.md')
  assert.ok(claudeMd.includes('api-facturacion'))
  assert.ok(claudeMd.includes('Node.js'))
})

test('legacy: las lineas propias del .gitignore sobreviven; el bloque se agrega al final', async () => {
  const userIgnore = '# reglas de la casa\n/build-interno\n*.bak\n'
  const dir = mkRepo({
    'package.json': '{"name":"x"}',
    '.gitignore': userIgnore,
  })

  await main(['init', ...YES], dir)

  const out = read(dir, '.gitignore')
  assert.ok(out.includes('# reglas de la casa'), 'se perdio un comentario del usuario')
  assert.ok(out.includes('/build-interno'), 'se perdio una regla del usuario')
  assert.ok(out.includes('*.bak'), 'se perdio una regla del usuario')

  // Y el bloque gestionado, con el fragmento de node porque hay package.json.
  assert.ok(out.includes(BEGIN))
  assert.ok(out.includes('node_modules/'))
  assert.ok(out.includes('.claude/settings.local.json'))

  // Un solo bloque, aunque corras de nuevo.
  await main(['upgrade', ...YES], dir)
  assert.equal(read(dir, '.gitignore').split(BEGIN).length - 1, 1)
})

test('legacy python: detecta el stack y usa su fragmento', async () => {
  const dir = mkRepo({ 'pyproject.toml': '[project]\nname="etl"\n' })
  await main(['init', ...YES], dir)

  assert.ok(read(dir, '.gitignore').includes('__pycache__/'))
  assert.ok(!read(dir, '.gitignore').includes('node_modules/'))
  assert.ok(read(dir, 'CLAUDE.md').includes('Python'))
})

test('NUNCA SE PISA: un CLAUDE.md escrito a mano sobrevive; la propuesta va a .new', async () => {
  const mio = '# CLAUDE.md\n\nEsto lo escribi yo y me costo trabajo.\n- Regla critica: nunca tocar la tabla `pagos` sin backup.\n'
  const dir = mkRepo({
    'package.json': '{"name":"x"}',
    'CLAUDE.md': mio,
  })

  assert.equal(await main(['init', ...YES], dir), 0)

  // El archivo del usuario, intacto. Byte por byte.
  assert.equal(read(dir, 'CLAUDE.md'), mio)

  // La propuesta del harness, al lado.
  assert.ok(has(dir, 'CLAUDE.md.new'))
  assert.ok(read(dir, 'CLAUDE.md.new').includes('Metodología CCEM'))

  // Y el lockfile NO reclama el CLAUDE.md del usuario: si lo reclamara, el proximo
  // upgrade lo creeria output intacto del harness y lo pisaria.
  const lock = JSON.parse(read(dir, '.claude/harness.json'))
  assert.equal(lock.files['CLAUDE.md'], undefined)
})

test('NUNCA SE PISA: tampoco en el segundo upgrade', async () => {
  const mio = '# el mio\ncontenido propio\n'
  const dir = mkRepo({ 'package.json': '{"name":"x"}', 'CLAUDE.md': mio })

  await main(['init', ...YES], dir)
  await main(['upgrade', ...YES], dir)
  await main(['upgrade', ...YES], dir)

  assert.equal(read(dir, 'CLAUDE.md'), mio, 'un upgrade posterior piso el archivo del usuario')
})

// Regresion: apply() escribia TODA accion que tuviera writePath, incluidas las
// local-edit. Le revertia en silencio al dev cualquier edicion sobre un archivo que
// el harness habia instalado. Es la violacion mas grave posible de la garantia.
test('una skill editada por el usuario no se revierte en el upgrade', async () => {
  const dir = mkRepo({ 'README.md': '' })
  await main(['init', ...YES], dir)

  const skill = '.claude/skills/ccem-core/SKILL.md'
  const editada = read(dir, skill) + '\n## Regla nuestra\n- Nunca deployar un viernes.\n'
  write(dir, skill, editada)

  await main(['upgrade', ...YES], dir)

  // El template no cambio: es local-edit. Se respeta, no se escribe, no hay .new.
  assert.equal(read(dir, skill), editada, 'el upgrade revirtio la edicion del usuario')
  assert.ok(!has(dir, `${skill}.new`))

  // Y sigue respetandose en corridas sucesivas.
  await main(['upgrade', ...YES], dir)
  assert.equal(read(dir, skill), editada)
})

test('el usuario borro un archivo del harness: se restaura', async () => {
  const dir = mkRepo({ 'README.md': '' })
  await main(['init', ...YES], dir)

  const fs = await import('node:fs')
  const path = await import('node:path')
  fs.rmSync(path.join(dir, '.claude', 'skills', 'ccem-sdd', 'SKILL.md'))
  assert.ok(!has(dir, '.claude/skills/ccem-sdd/SKILL.md'))

  await main(['upgrade', ...YES], dir)
  assert.ok(has(dir, '.claude/skills/ccem-sdd/SKILL.md'))
})

// Regresion: DATE se recalculaba en cada corrida. Un CLAUDE.md/constitution.md
// intactos (el usuario nunca los toco) aparecian como "conflict" -> .new espurio
// con solo cruzar la medianoche, porque el "contenido deseado" cambiaba de fecha
// aunque nada real hubiera cambiado. DATE tiene que ser sticky, como OWNER.
test('DATE es sticky: no cambia en corridas posteriores aunque cambie el dia real', async () => {
  const manifest = loadManifest()
  const cwd = process.cwd()
  const detected = detect(cwd)

  const first = await resolveVars({
    flags: { yes: true, name: 'x', type: 'backend', lang: 'es' },
    lock: null,
    detected,
    cwd,
    manifest,
  })

  // Simula una corrida posterior, un dia cualquiera: el lockfile ya trae una
  // fecha vieja. resolveVars tiene que devolver ESA fecha, no la de "hoy".
  const oldDate = '2020-01-01'
  const second = await resolveVars({
    flags: { yes: true },
    lock: { vars: { ...first, DATE: oldDate } },
    detected,
    cwd,
    manifest,
  })

  assert.equal(second.DATE, oldDate, 'DATE se recalculo en vez de mantenerse fijo')
})

test('DATE no drifea entre corridas reales sucesivas de upgrade', async () => {
  const dir = mkRepo({ 'README.md': '' })
  await main(['init', ...YES], dir)
  await main(['upgrade', ...YES], dir)

  // Sin tocar nada, dos corridas reales seguidas. Antes del fix, alcanzaba con que
  // el reloj cruzara la medianoche entre una corrida y otra para que CLAUDE.md y la
  // constitucion aparecieran como "conflict" -> .new, sin que nadie los tocara.
  const plan = replan(dir)
  const claudeMd = plan.actions.find((a) => a.dest === 'CLAUDE.md')
  const constitution = plan.actions.find((a) => a.dest === 'docs/constitution.md')

  assert.equal(claudeMd.verdict, NOOP, `CLAUDE.md deberia ser NOOP, fue ${claudeMd.verdict}`)
  assert.equal(constitution.verdict, NOOP, `constitution.md deberia ser NOOP, fue ${constitution.verdict}`)

  const lock = JSON.parse(fs.readFileSync(path.join(dir, '.claude', 'harness.json'), 'utf8'))
  assert.ok(
    read(dir, 'docs/constitution.md').includes(lock.vars.DATE),
    'la fecha sembrada no coincide con la que quedo en el archivo'
  )
})

test('autodeteccion de comando: lockfile -> upgrade, estructura previa -> adopt, limpio -> init', async () => {
  // Repo limpio -> init: se crea todo.
  const limpio = mkRepo({ 'README.md': '' })
  await main([...YES], limpio)
  assert.ok(has(limpio, '.claude/harness.json'))

  // Estructura previa sin lockfile -> adopt: NO toca ni un archivo.
  const previo = mkRepo({ 'CLAUDE.md': '# hecho a mano\n', 'package.json': '{"name":"x"}' })
  const antes = snapshot(previo, { includeLockfile: true })
  await main([...YES], previo)
  assert.ok(has(previo, '.claude/harness.json'), 'adopt no escribio el lockfile')
  assert.equal(read(previo, 'CLAUDE.md'), '# hecho a mano\n')
  // Lo unico nuevo es el lockfile.
  const nuevos = tree(previo).filter((f) => !antes.includes(f))
  assert.deepEqual(nuevos, ['.claude/harness.json'])
})
