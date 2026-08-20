import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

import { mkRepo, write } from './helpers.js'

// Integracion real del hook SessionStart: se ejecuta el script tal cual lo
// corre el harness (node + CLAUDE_PROJECT_DIR), contra un Vault y un repo git
// de verdad en tmp. Cubre la brecha de que el hook no importaba de src/ y no
// tenia ningun test propio.
const HOOK = fileURLToPath(new URL('../templates/base/claude/hooks/declarar-milestone.mjs', import.meta.url))

function correrHook(root) {
  return execFileSync(process.execPath, [HOOK], {
    encoding: 'utf8',
    env: { ...process.env, CLAUDE_PROJECT_DIR: root },
  })
}

function git(dir, ...args) {
  return execFileSync('git', ['-C', dir, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
}

// Repo git real con un commit por asunto y el ultimo estado publicado como
// refs/remotes/origin/dev — el hook mira los refs remotos locales, sin red.
function repoConMerges(asuntos) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'souclaude hook '))
  git(dir, 'init')
  git(dir, '-c', 'user.email=test@test', '-c', 'user.name=test', 'commit', '--allow-empty', '-m', 'chore: raiz')
  for (const asunto of asuntos) {
    git(dir, '-c', 'user.email=test@test', '-c', 'user.name=test', 'commit', '--allow-empty', '-m', asunto)
  }
  git(dir, 'update-ref', 'refs/remotes/origin/dev', 'HEAD')
  return dir
}

function vaultCon({ milestones, kanban }) {
  const vault = fs.mkdtempSync(path.join(os.tmpdir(), 'souclaude vault '))
  write(vault, 'Project-SHS/milestones.md', milestones)
  if (kanban != null) write(vault, 'Project-SHS/kanban.md', kanban)
  return vault
}

const MILESTONES = ['## Backlog', '', '- [ ] SHS-M2 · algo · @pendiente', '', '## En curso', '', '- [ ] SHS-M4 · sync · @ignacio', ''].join('\n')

function proyectoCon(vault, { conGit = false, asuntos = [] } = {}) {
  const dir = conGit ? repoConMerges(asuntos) : mkRepo()
  write(dir, '.claude/vault.local.json', JSON.stringify({ path: vault, project: 'Project-SHS' }))
  return dir
}

test('hook sin Vault configurado: regla + aviso, exit 0', () => {
  const salida = correrHook(mkRepo())
  assert.match(salida, /Trazabilidad obligatoria/)
  assert.match(salida, /Vault no configurado/)
})

test('hook con tablero: lista En curso y cuenta Backlog', () => {
  const vault = vaultCon({ milestones: MILESTONES })
  const salida = correrHook(proyectoCon(vault))
  assert.match(salida, /En curso \(1\)/)
  assert.match(salida, /SHS-M4 · sync/)
  assert.match(salida, /Backlog: 1 milestone/)
})

test('hook detecta PR mergeado (merge commit) en tarjeta En review y ordena moverla', () => {
  const kanban = ['## En review', '', '- [ ] SHS-M7-T004 · guia de onboarding · @ignacio · PR #21', ''].join('\n')
  const vault = vaultCon({ milestones: MILESTONES, kanban })
  const dir = proyectoCon(vault, { conGit: true, asuntos: ['Merge pull request #21 from x/docs-onboarding'] })

  const salida = correrHook(dir)
  assert.match(salida, /PRs ya mergeados con tarjeta todavia En review/)
  assert.match(salida, /SHS-M7-T004 .*<- PR #21 mergeado/)
  assert.match(salida, /sincroniza Jira/)
})

test('hook detecta PR mergeado por squash ("titulo (#N)")', () => {
  const kanban = ['## En review', '', '- [ ] SHS-M1-T002 · consumo por sesion · @ignacio · PR #22', ''].join('\n')
  const vault = vaultCon({ milestones: MILESTONES, kanban })
  const dir = proyectoCon(vault, { conGit: true, asuntos: ['feat: consumo por sesion (#22)'] })

  assert.match(correrHook(dir), /SHS-M1-T002 .*<- PR #22 mergeado/)
})

test('hook no confunde PR #2 con PR #21 ni avisa si el PR no esta mergeado', () => {
  const kanban = ['## En review', '', '- [ ] SHS-M9-T009 · pendiente · @ignacio · PR #2', ''].join('\n')
  const vault = vaultCon({ milestones: MILESTONES, kanban })
  const dir = proyectoCon(vault, { conGit: true, asuntos: ['Merge pull request #21 from x/otra', 'feat: otra cosa (#21)'] })

  const salida = correrHook(dir)
  assert.doesNotMatch(salida, /PRs ya mergeados/)
})

test('hook ignora tarjetas En review sin numero de PR', () => {
  const kanban = ['## En review', '', '- [ ] SHS-M9-T009 · sin pr todavia · @ignacio', ''].join('\n')
  const vault = vaultCon({ milestones: MILESTONES, kanban })
  const dir = proyectoCon(vault, { conGit: true, asuntos: ['Merge pull request #21 from x/otra'] })

  assert.doesNotMatch(correrHook(dir), /PRs ya mergeados/)
})

test('hook sin kanban.md o sin repo git: degrada en silencio y el tablero sigue saliendo', () => {
  const vault = vaultCon({ milestones: MILESTONES })
  const sinKanban = correrHook(proyectoCon(vault, { conGit: true }))
  assert.match(sinKanban, /En curso \(1\)/)
  assert.doesNotMatch(sinKanban, /PRs ya mergeados/)

  const kanban = ['## En review', '', '- [ ] SHS-M7-T004 · x · @ignacio · PR #21', ''].join('\n')
  const vault2 = vaultCon({ milestones: MILESTONES, kanban })
  const sinGit = correrHook(proyectoCon(vault2))
  assert.match(sinGit, /En curso \(1\)/)
  assert.doesNotMatch(sinGit, /PRs ya mergeados/)
})
