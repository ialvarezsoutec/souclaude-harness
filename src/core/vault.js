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

export function writeVaultConfig(cwd, { path: vaultPath, repo, project, quien } = {}) {
  // Los campos que el usuario pudo haber puesto a mano (project, quien) se
  // preservan al reescribir: un upgrade no puede borrar en silencio la
  // identidad del contribuyente ni la carpeta Project-* declarada.
  const previo = leerConfigDeArchivo(cwd)
  const contenido = {
    _comentario: 'Config local del Vault. NO se commitea: la ruta es de esta maquina.',
    path: toPosix(vaultPath),
    repo: repo ?? previo?.repo ?? null,
  }
  const proyecto = project ?? previo?.project ?? null
  if (proyecto) contenido.project = proyecto
  const autor = quien ?? previo?.quien ?? null
  if (autor) contenido.quien = autor
  writeFileLF(configPath(cwd), JSON.stringify(contenido, null, 2))
}

// Solo el archivo, sin el respaldo VAULT_PATH: para preservar campos al
// reescribir no debe inventarse una config a partir del entorno.
function leerConfigDeArchivo(cwd) {
  const raw = readIfExists(configPath(cwd))
  if (!raw) return null
  try {
    return JSON.parse(raw)
  } catch {
    return null
  }
}

// Un Vault de verdad tiene 00-System/ (id-registry, metodologia, plantillas).
// Es la senal mas barata para distinguirlo de una carpeta cualquiera.
export function looksLikeVault(abs) {
  return exists(path.join(abs, '00-System'))
}

// Carpeta Project-<PREFIJO> del proyecto: la declarada en vault.local.json
// ("project") o, si el Vault tiene una sola, esa. Mismo criterio que el hook
// declarar-milestone.mjs del template (que no puede importar de src/).
export function carpetaProyecto(vaultPath, config) {
  if (config?.project) return config.project
  try {
    const carpetas = fs
      .readdirSync(vaultPath, { withFileTypes: true })
      .filter((d) => d.isDirectory() && d.name.startsWith('Project-'))
      .map((d) => d.name)
    return carpetas.length === 1 ? carpetas[0] : null
  } catch {
    return null
  }
}

// Clonar el Vault -- otro repo git, con la memoria de TODOS los proyectos de la
// organizacion -- adentro del repo que se esta instalando es el peor desenlace
// posible de un prompt mal tipeado. path.relative() en vez de startsWith(): un
// chequeo por prefijo de string confunde /repo con /repo-otro.
export function isInsideCwd(cwd, target) {
  const rel = path.relative(path.resolve(cwd), path.resolve(target))
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel))
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
// prompts (default: el modulo real de UI) se puede inyectar en tests para
// ejercer el camino interactivo sin una TTY real ni mockear el modulo entero.
export async function ensureVault({ cwd, flags = {}, manifest, lock, yes, prompts = ui }) {
  const abs = await conectarVault({ cwd, flags, manifest, lock, yes, prompts })
  if (abs) await asegurarQuien(cwd, { yes, prompts })
  return abs
}

// El "quien" de vault.local.json es el eje CONTRIBUYENTE del registro de
// consumo (ADR 20260820): sin el, el monitor degrada al alias de la cuenta.
// Se pregunta UNA vez (solo interactivo, solo si falta) y queda persistido;
// con --yes o en CI se omite en silencio — nunca es bloqueante.
async function asegurarQuien(cwd, { yes, prompts }) {
  if (yes || ui.isCI()) return
  // Solo el archivo real: si la config viene del respaldo VAULT_PATH (env),
  // preguntar aqui persistiria esa ruta en un archivo que el usuario no creo.
  const config = leerConfigDeArchivo(cwd)
  if (!config?.path || (typeof config.quien === 'string' && config.quien.trim() !== '')) return

  const respuesta = await prompts.text({
    message: 'Alias del contribuyente para el registro de consumo del Vault (campo "quien"; vacio para omitir)',
    initialValue: '',
  })
  const quien = String(respuesta ?? '').trim()
  if (!quien) return
  writeVaultConfig(cwd, { path: config.path, repo: config.repo ?? null, quien })
  ui.log.success(`Contribuyente registrado: "${quien}" (${VAULT_CONFIG})`)
}

async function conectarVault({ cwd, flags = {}, manifest, lock, yes, prompts = ui }) {
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

  const destino = path.join(path.dirname(cwd), 'soubunker-vault')

  // Autodeteccion: si el sibling de siempre ya esta clonado y parece un Vault,
  // conectar directo. Ahorra las preguntas en el caso mas comun -- alguien que ya
  // clono el Vault junto a OTRO repo de la organizacion en esta misma maquina.
  if (exists(destino) && looksLikeVault(destino)) {
    return finish(cwd, destino, repo)
  }

  // Con --yes o en CI no se clona salvo pedido explicito (--vault-clone): git
  // clone es red y disco, y en CI correria en cada corrida.
  if (yes) {
    if (flags['vault-clone'] && repo) {
      return clonarSinPreguntar(cwd, repo, flags['vault-path'] ?? destino)
    }
    ui.log.warn('Modo no interactivo: el Vault no se conecto (usa --vault-path o --vault-clone).')
    if (repo) manualHint(repo)
    return null
  }

  if (!repo) {
    ui.log.warn('No hay URL del Vault en el manifest. Pasa --vault-repo para clonarlo.')
    return null
  }

  return clonarInteractivo(cwd, repo, destino, prompts)
}

// Camino feliz: UNA pregunta (antes eran dos: "tenes el Vault?" -> "donde lo
// clono?") -- confirmar el destino sugerido, que el propio CLI calcula y que
// por construccion nunca cae dentro de cwd. Quien lo rechaza recien ahi tipea
// una ruta -- y es ahi, no antes, donde isInsideCwd importa: reintenta -- nunca
// clona -- mientras la ruta tipeada caiga dentro del repo del proyecto.
async function clonarInteractivo(cwd, repo, destinoSugerido, prompts) {
  const acepta = await prompts.confirm({ message: `Clonar ${repo} en ${destinoSugerido}?`, initialValue: true })
  let abs = path.resolve(cwd, destinoSugerido)

  if (!acepta) {
    const ruta = await prompts.text({ message: 'Donde clonar el Vault? (vacio para cancelar)', initialValue: '' })
    if (!String(ruta).trim()) {
      manualHint(repo)
      return null
    }
    abs = path.resolve(cwd, String(ruta).trim())
    while (isInsideCwd(cwd, abs)) {
      ui.log.warn(`${toPosix(abs)} queda dentro de este repo: el Vault no puede clonarse ahi.`)
      const otra = await prompts.text({
        message: 'Donde clono el Vault? (tiene que quedar fuera de este repo)',
        initialValue: destinoSugerido,
      })
      abs = path.resolve(cwd, String(otra).trim())
    }
  }

  return clonar(cwd, repo, abs)
}

// Camino no interactivo (--vault-clone --yes): sin nadie a quien reprEguntarle,
// una ruta dentro del repo aborta el paso entero en vez de reintentar.
function clonarSinPreguntar(cwd, repo, destino) {
  const abs = path.resolve(cwd, destino)
  if (isInsideCwd(cwd, abs)) {
    ui.log.warn(`${toPosix(abs)} queda dentro de este repo: el Vault no se clono. Pasa --vault-path con una ruta afuera.`)
    manualHint(repo)
    return Promise.resolve(null)
  }
  return clonar(cwd, repo, abs)
}

async function clonar(cwd, repo, abs) {
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
