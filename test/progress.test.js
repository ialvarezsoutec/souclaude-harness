import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { loadManifest } from '../src/core/manifest.js'

// Guardas de contenido del harness 2.2.0: progreso por disco, IDs de task y
// telemetria con costo. Complementa a verify (consistencia del manifest) y
// dogfood (espejo de .claude/): aqui se protege que las convenciones nuevas
// no se pierdan en ediciones futuras de los templates.
const REPO_ROOT = fileURLToPath(new URL('..', import.meta.url))

test('progress: todo dest del manifest sin when tiene su espejo local en el repo', () => {
  const manifest = loadManifest()
  const missing = manifest.files
    .filter((f) => !f.when)
    .map((f) => f.dest)
    .filter((dest) => !fs.existsSync(path.join(REPO_ROOT, dest)))
  assert.deepEqual(missing, [], `Dest sin espejo local (dogfooding roto): ${missing.join(', ')}`)
})

test('progress: los templates de tasks usan IDs completos, no T1 a secas', () => {
  const full = fs.readFileSync(
    path.join(REPO_ROOT, 'templates', 'base', 'specs', '_templates', 'tasks-template.md'),
    'utf8'
  )
  const lite = fs.readFileSync(
    path.join(REPO_ROOT, 'templates', 'base', 'specs', '_templates', 'tasks-lite-template.md'),
    'utf8'
  )
  assert.match(full, /-T001/)
  assert.match(lite, /-T001/)
  assert.doesNotMatch(full, /^### T1:/m)
  assert.doesNotMatch(lite, /\*\*T1\*\*/)
})

test('progress: la telemetria del router conserva los campos de costo', () => {
  const skill = fs.readFileSync(
    path.join(REPO_ROOT, 'templates', 'base', 'claude', 'skills', 'ccem-model-router', 'SKILL.md'),
    'utf8'
  )
  for (const campo of ['costo_usd', 'medicion', 'tokens_in', 'tokens_out']) {
    assert.ok(skill.includes(campo), `ccem-model-router perdio el campo ${campo}`)
  }
})
