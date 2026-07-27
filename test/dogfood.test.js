import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { loadManifest } from '../src/core/manifest.js'
import { toPosix } from '../src/core/fsx.js'

// Este test responde una pregunta distinta a la de verify.test.js: no si el
// manifest es internamente consistente, sino si ESTE repo (el generador,
// via dogfooding) practica lo que instala. Compara .claude/** real contra
// manifest.files[].dest; lo que sobra debe estar explicitamente reconocido
// como extension local del propio repo generador, no del harness distribuido.
const REPO_ROOT = fileURLToPath(new URL('..', import.meta.url))

const LOCAL_ONLY = new Set([
  '.claude/harness.json', // lockfile de este propio repo, no un template
  '.claude/scheduled_tasks.lock', // generado en runtime por el harness de Claude Code
  '.claude/settings.local.json', // config local del dev, ya ignorada por el .gitignore que emite el harness
])

function walkClaudeDir() {
  const abs = path.join(REPO_ROOT, '.claude')
  const out = []
  const walk = (cur, prefix) => {
    for (const e of fs.readdirSync(cur, { withFileTypes: true })) {
      const rel = prefix ? `${prefix}/${e.name}` : e.name
      if (e.isDirectory()) walk(path.join(cur, e.name), rel)
      else out.push(toPosix(`.claude/${rel}`))
    }
  }
  walk(abs, '')
  return out
}

test('dogfood: todo archivo de .claude/ del repo esta en el manifest o en LOCAL_ONLY', () => {
  const manifest = loadManifest()
  const declared = new Set(manifest.files.map((f) => f.dest))

  const unrecognized = walkClaudeDir().filter((rel) => !declared.has(rel) && !LOCAL_ONLY.has(rel))

  assert.deepEqual(
    unrecognized,
    [],
    `Archivo(s) bajo .claude/ sin entry en el manifest ni en LOCAL_ONLY: ${unrecognized.join(', ')}`
  )
})
