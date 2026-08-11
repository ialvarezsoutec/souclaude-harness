import path from 'node:path'
import { readIfExists, writeFileLF } from './fsx.js'

// El modo es de MAQUINA, no de proyecto: quien corre el flujo desatendido en su
// equipo no decide por el resto del team. Mismo criterio que VAULT_CONFIG (ver
// core/vault.js): no va al lockfile (.claude/harness.json se commitea) ni al
// .env (los agentes lo tienen denegado por permissions.deny). Va a un archivo
// propio, gitignorado y legible por los agentes con Read.
export const MODE_CONFIG = '.claude/mode.local.json'

export const MODES = ['manual', 'auto']

// 'auto' es el default. El modo de trabajo lo elige el dev con el permission
// mode de Claude Code (shift+tab), que NO se expone en runtime: un agente no
// puede preguntarle al harness "estoy en automatico?". Por eso el flujo
// desatendido tiene que ser el comportamiento base -- si dependiera de un
// archivo, ciclar a automatico no cambiaria nada y el modo quedaria mintiendo.
// Quien quiere revisar fase por fase lo pide explicito: `souclaude mode manual`.
//
// Que el default sea autonomo NO afloja el resto: las paradas por ambiguedad,
// por CHANGES_REQUESTED y por P6 (acciones destructivas o externas) siguen
// vigentes en los dos modos. Ver .claude/agents/orchestrator.md.
export const DEFAULT_MODE = 'auto'

const configPath = (cwd) => path.join(cwd, ...MODE_CONFIG.split('/'))

const normalize = (value) => String(value ?? '').trim().toLowerCase()

export function readMode(cwd) {
  const raw = readIfExists(configPath(cwd))
  if (raw) {
    try {
      const parsed = JSON.parse(raw)
      const mode = normalize(parsed?.mode)
      if (MODES.includes(mode)) return mode
    } catch {
      // Un JSON corrupto no rompe nada: se trata como "no configurado".
    }
  }
  // Respaldo por entorno, para un runner o CI que lo exporta sin escribir disco.
  const fromEnv = normalize(process.env.SOUCLAUDE_MODE)
  return MODES.includes(fromEnv) ? fromEnv : DEFAULT_MODE
}

export function writeMode(cwd, mode) {
  const normalized = normalize(mode)
  if (!MODES.includes(normalized)) {
    throw new Error(`Modo invalido: "${mode}". Valores validos: ${MODES.join(', ')}.`)
  }
  const content = JSON.stringify(
    {
      _comentario:
        'Modo de trabajo de los agentes en ESTA maquina. NO se commitea. ' +
        'El default (sin este archivo) es "auto". ' +
        '"auto": encadena las fases sin pedir OK, pero sigue parando ante ambiguedad, ' +
        'ante CHANGES_REQUESTED del reviewer y ante toda accion destructiva o externa (P6). ' +
        '"manual": para en cada checkpoint y espera tu OK.',
      mode: normalized,
    },
    null,
    2
  )
  writeFileLF(configPath(cwd), content)
  return normalized
}
