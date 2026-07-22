import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { loadManifest } from '../src/core/manifest.js'
import {
  verifyManifest,
  findOrphanTemplateFiles,
  findMissingSrcFiles,
  findDuplicateIds,
  findDuplicateDests,
  findMissingCriticalFiles,
} from '../src/core/verify.js'

// Fabrica un directorio temporal con la forma de templates/: root/base/**.
// No se toca templates/ real en ningun caso negativo.
function mkTemplatesRoot(files = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'souclaude verify '))
  for (const [rel, content] of Object.entries(files)) {
    const abs = path.join(root, ...rel.split('/'))
    fs.mkdirSync(path.dirname(abs), { recursive: true })
    fs.writeFileSync(abs, content, 'utf8')
  }
  return root
}

test('verify: el manifest real del repo no tiene huerfanos', () => {
  const manifest = loadManifest()
  const warnings = findOrphanTemplateFiles(manifest)
  assert.deepEqual(warnings, [])
})

test('verify: el manifest real del repo no tiene src rotos', () => {
  const manifest = loadManifest()
  assert.deepEqual(findMissingSrcFiles(manifest), [])
})

test('verify: el manifest real del repo no tiene ids ni dest duplicados', () => {
  const manifest = loadManifest()
  assert.deepEqual(findDuplicateIds(manifest), [])
  assert.deepEqual(findDuplicateDests(manifest), [])
})

test('verify: el manifest real del repo no tiene criticos faltantes', () => {
  const manifest = loadManifest()
  assert.deepEqual(findMissingCriticalFiles(manifest), [])
})

test('verify: detecta huerfano cuando templates/base tiene un archivo sin entry', () => {
  const root = mkTemplatesRoot({ 'base/claude/skills/fantasma/SKILL.md': 'x' })
  const manifest = { files: [] }
  const warnings = findOrphanTemplateFiles(manifest, root)
  assert.equal(warnings.length, 1)
  assert.equal(warnings[0].code, 'orphan-template-file')
})

test('verify: detecta src roto cuando el manifest referencia un archivo inexistente', () => {
  const root = mkTemplatesRoot({})
  const manifest = { files: [{ id: 'x', src: 'base/no-existe.md', dest: 'no-existe.md', policy: 'managed' }] }
  const errors = findMissingSrcFiles(manifest, root)
  assert.equal(errors.length, 1)
  assert.equal(errors[0].code, 'missing-src')
})

test('verify: detecta ids y dest duplicados', () => {
  const manifest = {
    files: [
      { id: 'a', src: 'base/a.md', dest: 'a.md', policy: 'managed' },
      { id: 'a', src: 'base/b.md', dest: 'a.md', policy: 'managed' },
    ],
  }
  assert.equal(findDuplicateIds(manifest).length, 1)
  assert.equal(findDuplicateDests(manifest).length, 1)
})

test('verify: detecta critico faltante cuando el src del entry critical no existe', () => {
  const root = mkTemplatesRoot({})
  const manifest = { files: [{ id: 'claude-md', src: 'base/CLAUDE.md', dest: 'CLAUDE.md', policy: 'user-owned', critical: true }] }
  const errors = findMissingCriticalFiles(manifest, root)
  assert.ok(errors.some((e) => e.code === 'missing-critical'))
})

test('verifyManifest: agrega en errors y warnings, no mezcla tipos', () => {
  const root = mkTemplatesRoot({ 'base/huerfano.md': 'x' })
  const manifest = { files: [{ id: 'roto', src: 'base/no-existe.md', dest: 'no-existe.md', policy: 'managed' }] }
  const { errors, warnings } = verifyManifest(manifest, root)
  assert.ok(errors.every((e) => e.type === 'error'))
  assert.ok(warnings.every((w) => w.type === 'warning'))
  assert.ok(errors.some((e) => e.code === 'missing-src'))
  assert.ok(warnings.some((w) => w.code === 'orphan-template-file'))
})
