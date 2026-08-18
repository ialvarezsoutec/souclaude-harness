// Hook SessionStart del harness (managed): trazabilidad por milestone.
//
// Todo trabajo de un agente pertenece a un milestone del Vault. Este hook
// inyecta al inicio de cada sesion el estado del tablero y la regla de
// declarar (o dar de alta) el milestone antes de trabajar. No valida ni
// bloquea: la sesion nunca se corta por el Vault — exit 0 siempre.
import fs from 'node:fs'
import path from 'node:path'

const REGLA = [
  '[harness] Trazabilidad obligatoria: todo trabajo pertenece a un milestone del Vault.',
  'Antes de tocar codigo, declara al usuario sobre que milestone vas a trabajar.',
  'Si el pedido no corresponde a ningun milestone existente, da de alta uno en el',
  'Backlog (skill vault-milestones) antes de empezar. Protocolo: progress/README.md.',
]

function leerJson(ruta) {
  try {
    return JSON.parse(fs.readFileSync(ruta, 'utf8'))
  } catch {
    return null
  }
}

// Carpeta Project-<PREFIJO> del proyecto: la declarada en vault.local.json
// ("project") o, si hay una sola en el Vault, esa.
function carpetaProyecto(vaultPath, config) {
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

// Tarjetas por columna de un tablero kanban-plugin (una tarjeta = una linea).
function tablero(rutaMd) {
  let contenido
  try {
    contenido = fs.readFileSync(rutaMd, 'utf8')
  } catch {
    return null
  }
  const columnas = {}
  let actual = null
  for (const linea of contenido.split('\n')) {
    const titulo = linea.match(/^##\s+(.+?)\s*$/)
    if (titulo) {
      actual = titulo[1]
      columnas[actual] = []
    } else if (actual && /^- \[.\]/.test(linea.trim())) {
      columnas[actual].push(linea.trim())
    }
  }
  return columnas
}

function main() {
  const root = process.env.CLAUDE_PROJECT_DIR || process.cwd()
  const salida = [...REGLA]

  const config = leerJson(path.join(root, '.claude', 'vault.local.json'))
  const vaultPath = config?.path ?? process.env.VAULT_PATH ?? null

  if (!vaultPath || !fs.existsSync(vaultPath)) {
    salida.push('Vault no configurado en esta maquina: pide el tablero al usuario antes de asumir.')
    console.log(salida.join('\n'))
    return
  }

  const proyecto = carpetaProyecto(vaultPath, config)
  if (!proyecto) {
    salida.push('No se pudo determinar la carpeta Project-<PREFIJO> del Vault: pregunta al usuario cual es.')
    console.log(salida.join('\n'))
    return
  }

  const columnas = tablero(path.join(vaultPath, proyecto, 'milestones.md'))
  if (!columnas) {
    salida.push(`El Vault no tiene ${proyecto}/milestones.md legible: repórtalo al usuario.`)
    console.log(salida.join('\n'))
    return
  }

  const enCurso = columnas['En curso'] ?? []
  const backlog = columnas['Backlog'] ?? []
  salida.push(`Tablero ${proyecto}/milestones.md (puede estar desactualizado: haz pull --rebase del Vault):`)
  salida.push(`En curso (${enCurso.length}):`)
  for (const tarjeta of enCurso) salida.push(`  ${tarjeta}`)
  if (enCurso.length === 0) salida.push('  (vacio)')
  salida.push(`Backlog: ${backlog.length} milestone(s) pendiente(s).`)
  console.log(salida.join('\n'))
}

try {
  main()
} catch {
  // Este hook jamas rompe una sesion: ante cualquier fallo, solo la regla.
  console.log(REGLA.join('\n'))
}
