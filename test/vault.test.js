import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { main } from '../src/cli.js'
import { mkRepo, read, has, snapshot } from './helpers.js'
import {
  cloneVault,
  looksLikeVault,
  readVaultConfig,
  VAULT_CONFIG,
  harnessDocsUrl,
  isInsideCwd,
  ensureVault,
} from '../src/core/vault.js'
import { loadManifest } from '../src/core/manifest.js'

// helpers.js pone CI=true, asi que todo lo que pasa por main() corre en modo
// no interactivo: es justo el camino que hay que blindar (nunca clonar solo).
const YES = ['--yes', '--name', 'acme', '--type', 'backend', '--lang', 'es']

// Un Vault de mentira pero real: carpeta con 00-System/, que es la senal que usa
// looksLikeVault. No hace falta que sea un repo git para conectarlo.
function mkVault() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'souclaude vault '))
  fs.mkdirSync(path.join(dir, '00-System', 'templates'), { recursive: true })
  fs.writeFileSync(path.join(dir, '00-System', 'id-registry.md'), '# prefijos\n', 'utf8')
  return dir
}

// mkRepo() crea el repo bajo os.tmpdir() directo, asi que path.dirname(cwd) es
// SIEMPRE os.tmpdir() -- el sibling ../soubunker-vault que usa ensureVault por
// default terminaria siendo una ruta COMPARTIDA entre tests. Para los tests que
// ejercen la autodeteccion del sibling o el clonado real, cada repo va adentro
// de un padre unico para que su "afuera" tambien sea unico.
function mkIsolatedRepo() {
  const padre = fs.mkdtempSync(path.join(os.tmpdir(), 'souclaude aislado '))
  const dir = path.join(padre, 'proyecto')
  fs.mkdirSync(path.join(dir, '.git'), { recursive: true })
  return dir
}

// Repo git local que sirve de origen para probar el clone sin tocar la red.
function mkVaultRepo() {
  const dir = mkVault()
  const git = (...args) => execFileSync('git', ['-C', dir, ...args], { stdio: 'pipe' })
  git('init', '-b', 'main')
  git('config', 'user.email', 'test@souclaude.local')
  git('config', 'user.name', 'test')
  git('add', '.')
  git('commit', '-m', 'chore: semilla del Vault')
  return dir
}

test('--vault-path conecta el Vault sin preguntar y sin clonar', async () => {
  const dir = mkRepo({ 'README.md': '' })
  const vault = mkVault()

  assert.equal(await main(['init', ...YES, '--vault-path', vault], dir), 0)

  const cfg = JSON.parse(read(dir, VAULT_CONFIG))
  assert.equal(cfg.path, vault.split(path.sep).join('/'), 'la ruta se guarda en POSIX')
  assert.ok(!cfg.path.includes('\\'), 'quedo una ruta con separadores de Windows')
})

test('la ruta del Vault NUNCA va al lockfile: es de esta maquina', async () => {
  const dir = mkRepo({ 'README.md': '' })
  const vault = mkVault()
  await main(['init', ...YES, '--vault-path', vault], dir)

  const lock = JSON.parse(read(dir, '.claude/harness.json'))
  assert.equal(lock.vars.VAULT_REPO, loadManifest().vault.repo)
  assert.equal(lock.vars.VAULT_PATH, undefined, 'la ruta local se filtro al lockfile commiteado')
})

test('el .gitignore emitido ignora la config local del Vault', async () => {
  const dir = mkRepo({ 'README.md': '' })
  await main(['init', ...YES], dir)
  assert.ok(read(dir, '.gitignore').includes(VAULT_CONFIG))
})

test('--no-vault no toca la conexion con el Vault', async () => {
  const dir = mkRepo({ 'README.md': '' })
  const vault = mkVault()

  assert.equal(await main(['init', ...YES, '--no-vault', '--vault-path', vault], dir), 0)
  assert.ok(!has(dir, VAULT_CONFIG), '--no-vault escribio la config igual')
})

// La decision: git clone es red y disco. En CI correria en cada corrida, asi que
// el modo no interactivo jamas clona -- solo conecta lo que ya existe.
test('sin --vault-path, el modo no interactivo no clona ni escribe nada', async () => {
  const dir = mkRepo({ 'README.md': '' })

  assert.equal(await main(['init', ...YES], dir), 0)
  assert.ok(!has(dir, VAULT_CONFIG))
})

test('una ruta de Vault inexistente no rompe la instalacion', async () => {
  const dir = mkRepo({ 'README.md': '' })
  const fantasma = path.join(os.tmpdir(), 'souclaude vault que no existe')

  assert.equal(await main(['init', ...YES, '--vault-path', fantasma], dir), 0)
  assert.ok(!has(dir, VAULT_CONFIG), 'se conecto un Vault que no existe')
})

test('--dry-run tampoco escribe la config del Vault', async () => {
  const dir = mkRepo({ 'README.md': '' })
  const vault = mkVault()

  assert.equal(await main(['init', ...YES, '--dry-run', '--vault-path', vault], dir), 0)
  assert.ok(!has(dir, VAULT_CONFIG))
})

test('IDEMPOTENCIA: reconectar el mismo Vault no cambia un byte', async () => {
  const dir = mkRepo({ 'README.md': '' })
  const vault = mkVault()

  await main(['init', ...YES, '--vault-path', vault], dir)
  const before = snapshot(dir)

  await main(['init', ...YES], dir)
  assert.equal(snapshot(dir), before, 'la segunda corrida modifico archivos')
})

test('la config ya escrita se relee y no se vuelve a preguntar', async () => {
  const dir = mkRepo({ 'README.md': '' })
  const vault = mkVault()
  await main(['init', ...YES, '--vault-path', vault], dir)

  assert.equal(readVaultConfig(dir).path, vault.split(path.sep).join('/'))
})

test('cloneVault clona de verdad y el resultado parece un Vault', () => {
  const origen = mkVaultRepo()
  const destino = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'souclaude dest ')), 'soubunker-vault')

  cloneVault(origen, destino)

  assert.ok(looksLikeVault(destino), 'el clon no tiene 00-System/')
  assert.ok(fs.existsSync(path.join(destino, '00-System', 'id-registry.md')))
})

test('el manifest declara el repo canonico del Vault', () => {
  assert.match(loadManifest().vault.repo, /soubunker-vault/)
})

// docs/vault-guide.md declara que no se distribuye a repos consumidores (es singleton
// por organizacion), asi que el mensaje de ayuda no puede apuntar a una ruta local
// (docs/vault-setup.md) que jamas existe en el repo destino -- tiene que ser la URL
// donde el archivo si vive.
test('el hint del Vault apunta a una URL de GitHub, no a una ruta local', () => {
  const url = harnessDocsUrl('docs/vault-setup.md')
  assert.match(url, /^https:\/\/github\.com\/.+\/blob\/main\/docs\/vault-setup\.md$/)
  assert.ok(!url.startsWith('docs/'), 'quedo como ruta relativa en vez de URL')
})

test('isInsideCwd: un descendiente del repo esta adentro', () => {
  const cwd = mkRepo({ 'README.md': '' })
  assert.ok(isInsideCwd(cwd, path.join(cwd, 'sub', 'dir')))
})

test('isInsideCwd: un hermano del repo NO esta adentro', () => {
  const cwd = mkRepo({ 'README.md': '' })
  assert.ok(!isInsideCwd(cwd, path.join(path.dirname(cwd), 'sibling')))
})

test('isInsideCwd: el propio cwd cuenta como adentro', () => {
  const cwd = mkRepo({ 'README.md': '' })
  assert.ok(isInsideCwd(cwd, cwd))
})

test('isInsideCwd: discos distintos en Windows nunca estan adentro', { skip: process.platform !== 'win32' }, () => {
  assert.ok(!isInsideCwd('C:\\repo', 'D:\\repo'))
})

// --- Sibling autodetectado -------------------------------------------------

test('con el sibling ../soubunker-vault ya clonado, se conecta sin preguntar nada', async () => {
  const cwd = mkIsolatedRepo()
  const sibling = path.join(path.dirname(cwd), 'soubunker-vault')
  fs.mkdirSync(path.join(sibling, '00-System'), { recursive: true })

  const noPrompt = {
    text: () => assert.fail('no debia preguntar: el sibling ya estaba detectado'),
    confirm: () => assert.fail('no debia preguntar: el sibling ya estaba detectado'),
  }
  const abs = await ensureVault({
    cwd,
    flags: {},
    manifest: loadManifest(),
    lock: null,
    yes: false,
    prompts: noPrompt,
  })
  assert.equal(abs, sibling)
  assert.equal(readVaultConfig(cwd).path, sibling.split(path.sep).join('/'))
})

// --- --vault-clone (camino no interactivo) ---------------------------------

test('--vault-path dentro del repo + --vault-clone --yes no clona nada', async () => {
  const dir = mkIsolatedRepo()
  const dentro = path.join(dir, 'vault')

  assert.equal(await main(['init', ...YES, '--vault-path', dentro, '--vault-clone'], dir), 0)
  assert.ok(!has(dir, VAULT_CONFIG), 'se conecto o clono un Vault dentro del propio repo')
  assert.ok(!fs.existsSync(dentro), 'se creo la carpeta de destino dentro del repo')
})

test('--vault-clone --yes con destino valido clona sin ningun prompt', async () => {
  const dir = mkIsolatedRepo()
  const origen = mkVaultRepo()
  const destino = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'souclaude clone ')), 'soubunker-vault')

  assert.equal(await main(['init', ...YES, '--vault-repo', origen, '--vault-path', destino, '--vault-clone'], dir), 0)
  assert.ok(looksLikeVault(destino))
  assert.equal(readVaultConfig(dir).path, destino.split(path.sep).join('/'))
})

// --- Camino interactivo: una sola pregunta, reintenta si cae dentro --------

test('camino interactivo: quien rechaza el default y tipea una ruta dentro del repo, se rechaza y se vuelve a preguntar', async () => {
  const cwd = mkIsolatedRepo()
  const origen = mkVaultRepo()
  const afuera = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'souclaude afuera ')), 'vault')

  let textCalls = 0
  const prompts = {
    // Rechaza el default sugerido -- el unico camino donde se llega a tipear una ruta.
    confirm: () => false,
    text: () => {
      textCalls += 1
      // Primera respuesta: cae dentro del repo -> se rechaza. Segunda: afuera.
      return textCalls === 1 ? path.join(cwd, 'vault-adentro') : afuera
    },
  }

  const abs = await ensureVault({
    cwd,
    flags: { 'vault-repo': origen },
    manifest: loadManifest(),
    lock: null,
    yes: false,
    prompts,
  })

  assert.equal(textCalls, 2, 'no reintento tras la ruta invalida')
  assert.equal(abs, afuera)
  assert.ok(looksLikeVault(afuera))
})

test('camino interactivo: sin Vault detectado, una sola confirmacion y sin preguntar la ruta', async () => {
  const cwd = mkIsolatedRepo()
  const origen = mkVaultRepo()

  let textCalls = 0
  let confirmCalls = 0
  const prompts = {
    text: () => {
      textCalls += 1
      return assert.fail('no debia preguntar la ruta: el default ya cae afuera del repo')
    },
    confirm: () => {
      confirmCalls += 1
      return true
    },
  }

  const abs = await ensureVault({
    cwd,
    flags: { 'vault-repo': origen },
    manifest: loadManifest(),
    lock: null,
    yes: false,
    prompts,
  })

  assert.equal(textCalls, 0, 'pregunto la ruta pudiendo usar el default (ya afuera del repo)')
  assert.equal(confirmCalls, 1, 'el camino interactivo hizo mas de una confirmacion')
  assert.equal(abs, path.join(path.dirname(cwd), 'soubunker-vault'))
})

test('writeVaultConfig preserva project y quien al reescribir (upgrade no borra la identidad)', async () => {
  const { writeVaultConfig } = await import('../src/core/vault.js')
  const cwd = mkRepo({ 'README.md': '' })
  const vault = mkVault()

  fs.mkdirSync(path.join(cwd, '.claude'), { recursive: true })
  fs.writeFileSync(
    path.join(cwd, ...VAULT_CONFIG.split('/')),
    JSON.stringify({ path: vault, repo: 'https://x/y.git', project: 'Project-SHS', quien: 'ignacio' }),
    'utf8'
  )

  // Reescritura tipica de un upgrade: solo path + repo. Lo manual sobrevive.
  writeVaultConfig(cwd, { path: vault, repo: null })
  let config = readVaultConfig(cwd)
  assert.equal(config.project, 'Project-SHS')
  assert.equal(config.quien, 'ignacio')
  assert.equal(config.repo, 'https://x/y.git')

  // Pasar quien explicito lo actualiza sin tocar el resto.
  writeVaultConfig(cwd, { path: vault, quien: 'nacho' })
  config = readVaultConfig(cwd)
  assert.equal(config.quien, 'nacho')
  assert.equal(config.project, 'Project-SHS')
})
