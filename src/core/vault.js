import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { execFileSync } from 'node:child_process'
import * as ui from '../ui.js'
import { exists, readIfExists, writeFileLF, toPosix } from './fsx.js'

const PACKAGE_JSON = fileURLToPath(new URL('../../package.json', import.meta.url))

// URL de vault-setup.md en GitHub, derivada de package.json.repository.url en vez de
// hardcodeada: docs/vault-guide.md declara que no se distribuye a repos consumidores
// (es singleton por organizacion), asi que el runbook solo existe aca. Apuntar a una
// ruta local (`docs/vault-setup.md`) desde el mensaje de un repo consumidor apunta a
// un archivo que nunca llega.
export function harnessDocsUrl(rel) {
  const { repository } = JSON.parse(fs.readFileSync(PACKAGE_JSON, 'utf8'))
  const base = repository.url.replace(/^git\+/, '').replace(/\.git$/, '')
  return `${base}/blob/main/${rel}`
}

// La config del Vault es de MAQUINA, no de proyecto: la ruta local difiere en
// cada equipo. Por eso no va al lockfile (.claude/harness.json se commitea) ni
// al .env (los agentes lo tienen denegado por permissions.deny en
// .claude/settings.json: "Read(./.env)"). Va a un archivo propio, gitignorado y
// legible por los agentes.
export const VAULT_CONFIG = '.claude/vault.local.json'

const configPath = (cwd) => path.join(cwd, ...VAULT_CONFIG.split('/'))

export function readVaultConfig(cwd) {
  const raw = readIfExists(configPath(cwd))
  if (raw) {
    try {
      const parsed = JSON.parse(raw)
      if (parsed?.path) return parsed
    } catch {
      // Un JSON corrupto no rompe la instalacion: se trata como "no configurado".
    }
  }
  // Respaldo: la variable de entorno, para quien la exporta a mano o en un runner.
  return process.env.VAULT_PATH ? { path: toPosix(process.env.VAULT_PATH), repo: null } : null
}

export function writeVaultConfig(cwd, { path: vaultPath, repo }) {
  const content = JSON.stringify(
    {
      _comentario: 'Config local del Vault. NO se commitea: la ruta es de esta maquina.',
      path: toPosix(vaultPath),
      repo: repo ?? null,
    },
    null,
    2
  )
  writeFileLF(configPath(cwd), content)
}

// Un Vault de verdad tiene 00-System/ (id-registry, metodologia, plantillas).
// Es la senal mas barata para distinguirlo de una carpeta cualquiera.
export function looksLikeVault(abs) {
  return exists(path.join(abs, '00-System'))
}

// execFile con args en array: nunca pasa por el shell, asi que las rutas con
// espacios (todo OneDrive) dejan de ser un problema. Mismo criterio que gitUserName.
function git(args, opts = {}) {
  return execFileSync('git', args, { encoding: 'utf8', stdio: 'pipe', ...opts })
}

export function vaultRemote(abs) {
  try {
    return git(['-C', abs, 'remote', 'get-url', 'origin']).trim() || null
  } catch {
    return null
  }
}

// Lanza si el clone falla (sin red, sin credenciales, destino ocupado). El
// llamador degrada a warning: el Vault nunca bloquea la instalacion.
export function cloneVault(repo, dest) {
  fs.mkdirSync(path.dirname(dest), { recursive: true })
  git(['clone', repo, dest], { stdio: 'inherit' })
  return dest
}

function manualHint(repo) {
  ui.log.warn(
    [
      'El repo quedo sin Vault conectado. Para conectarlo despues:',
      `    git clone ${repo} <ruta>`,
      '    npx souclaude upgrade --vault-path <ruta>',
      `Detalle en ${harnessDocsUrl('docs/vault-setup.md')}`,
    ].join('\n')
  )
}

// Paso interactivo del instalador. NUNCA lanza: cualquier fallo se degrada a
// warning y el comando sigue devolviendo 0. El Vault es la vista multi-proyecto,
// no una dependencia dura para tener el harness instalado.
export async function ensureVault({ cwd, flags = {}, manifest, lock, yes }) {
  if (flags.vault === false) {
    ui.log.info('--no-vault: no se toca la conexion con el Vault.')
    return null
  }

  const repo = flags['vault-repo'] ?? lock?.vars?.VAULT_REPO ?? manifest?.vault?.repo ?? null
  const configured = flags['vault-path'] ?? readVaultConfig(cwd)?.path ?? null

  if (configured) {
    const abs = path.resolve(cwd, configured)
    if (exists(abs)) {
      if (!looksLikeVault(abs)) {
        ui.log.warn(`${configured} no tiene 00-System/: no parece un Vault. Se usa igual.`)
      }
      return finish(cwd, abs, repo)
    }
    ui.log.warn(`La ruta configurada del Vault ya no existe: ${configured}`)
  }

  // Con --yes o en CI no se clona: git clone es red y disco, y en CI correria en
  // cada corrida. Quien quiera conectarlo sin interaccion pasa --vault-path.
  if (yes) {
    ui.log.warn('Modo no interactivo: el Vault no se conecto (usa --vault-path para hacerlo).')
    if (repo) manualHint(repo)
    return null
  }

  const tieneVault = await ui.confirm({
    message: 'Tienes el Vault clonado en esta maquina?',
    initialValue: false,
  })

  const destino = path.join(path.dirname(cwd), 'soubunker-vault')

  if (tieneVault) {
    const ruta = await ui.text({ message: 'Ruta local al Vault', initialValue: destino })
    const abs = path.resolve(cwd, String(ruta).trim())
    if (exists(abs)) {
      if (!looksLikeVault(abs)) ui.log.warn(`${abs} no tiene 00-System/: no parece un Vault. Se usa igual.`)
      return finish(cwd, abs, repo)
    }
    ui.log.warn(`Esa ruta no existe: ${abs}`)
    return clonar(cwd, repo, abs)
  }

  const ruta = await ui.text({ message: 'Donde clono el Vault?', initialValue: destino })
  return clonar(cwd, repo, path.resolve(cwd, String(ruta).trim()))
}

async function clonar(cwd, repo, abs) {
  if (!repo) {
    ui.log.warn('No hay URL del Vault en el manifest. Pasa --vault-repo para clonarlo.')
    return null
  }

  const ok = await ui.confirm({ message: `Clonar ${repo} en ${abs}?`, initialValue: true })
  if (!ok) {
    manualHint(repo)
    return null
  }

  try {
    cloneVault(repo, abs)
    ui.log.success(`Vault clonado en ${abs}`)
    return finish(cwd, abs, repo)
  } catch (err) {
    ui.log.warn(`No se pudo clonar el Vault: ${err.message.trim().split('\n').pop()}`)
    manualHint(repo)
    return null
  }
}

function finish(cwd, abs, repo) {
  const remoto = vaultRemote(abs)
  writeVaultConfig(cwd, { path: abs, repo: remoto ?? repo })

  if (repo && remoto && remoto.replace(/\.git$/, '') !== repo.replace(/\.git$/, '')) {
    ui.log.warn(`El remoto del Vault (${remoto}) no es el canonico (${repo}).`)
  }

  const gitignore = readIfExists(path.join(cwd, '.gitignore')) ?? ''
  if (!gitignore.includes(VAULT_CONFIG)) {
    ui.log.warn(`Agrega ${VAULT_CONFIG} a tu .gitignore: la ruta es de esta maquina y no debe viajar.`)
  }

  ui.log.success(`Vault conectado: ${toPosix(abs)} (${VAULT_CONFIG})`)
  return abs
}
