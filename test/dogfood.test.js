import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
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

// git ls-files, no fs.readdirSync: el disco tiene backups (.claude/backup-*/) y
// propuestas pendientes (*.new) que el propio harness genera y el propio
// .gitignore excluye a proposito. Caminar el disco crudo hace que este test
// dependa de la copia de trabajo de quien lo corre en vez del repo. El manifest
// describe que se COMMITEA, asi que la pregunta correcta es sobre git, no sobre fs.
function walkClaudeDir() {
  const out = execFileSync('git', ['ls-files', '.claude'], { cwd: REPO_ROOT, encoding: 'utf8' })
  return out
    .split('\n')
    .filter(Boolean)
    .map((rel) => toPosix(rel))
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
