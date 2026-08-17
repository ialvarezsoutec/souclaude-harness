import os from 'node:os'
import path from 'node:path'
import { createSnapshotSource } from './snapshot-source.js'
import { construirVentana } from '../domain/ventanas.js'
import { construirVista } from '../domain/arbol.js'
import { construirSnapshot } from './vault-monitor-publisher.js'

// Lee otras cuentas de Claude Code EN ESTA MISMA MAQUINA (ej. claude1/claude2
// del perfil de PowerShell, cada una con su propio CLAUDE_CONFIG_DIR), para
// que consolidarCuentas (domain/cuentas.js) las muestre junto a la cuenta
// local y a las remotas del Vault. A diferencia de vault-accounts-reader.js
// (que lee snapshots ya publicados por otras maquinas), aca no hay archivo:
// cada home local se indexa igual que la cuenta principal y se le da la
// MISMA forma de snapshot (construirSnapshot) para que consolidarCuentas no
// tenga que distinguir el origen.
//
// SOUCLAUDE_LOCAL_ACCOUNTS: lista de carpetas separadas por path.delimiter
// (";" en Windows, ":" en POSIX), igual convencion que PATH. Cada carpeta es
// un CLAUDE_CONFIG_DIR (ej. ~/.claude1): a diferencia de ~/.claude, ahi
// projects/ y .claude.json viven AMBOS dentro de esa misma carpeta, no uno
// hermano del otro -- por eso NO se usa resolveClaudeHome({override}) (esa
// funcion asume la convencion ~/.claude + ~/.claude.json hermano) y en su
// lugar se arma `paths` a mano. Sin la variable seteada, sin cuentas locales
// adicionales: comportamiento identico al de antes de este adaptador.

const VENTANA_TOTALES = '24h'

export function parseLocalAccountsEnv(valor) {
  if (typeof valor !== 'string' || valor.trim() === '') return []
  return valor
    .split(path.delimiter)
    .map((s) => s.trim())
    .filter((s) => s !== '')
}

export function createLocalAccountsReader({ homes = [], hostname = null } = {}) {
  const host = hostname ?? leerHostname()

  async function leer({ ahora } = {}) {
    const instante = typeof ahora === 'number' ? ahora : Date.now()
    const avisos = []
    const cuentas = []

    for (const homeOverride of homes) {
      const paths = pathsDeConfigDir(homeOverride)
      const source = createSnapshotSource({ paths })
      let vista
      try {
        const ventana = construirVentana(VENTANA_TOTALES, instante)
        const snapshot = await source.collect({ window: ventana, ahora: instante })
        vista = construirVista(snapshot, { ventana, ahora: instante })
      } catch (err) {
        avisos.push({ file: homeOverride, reason: err.code ?? err.message })
        continue
      }

      if (!vista?.cuenta?.accountUuid) continue // home sin sesion iniciada: nada que mostrar

      const construido = construirSnapshot(vista, { ahora: instante, hostname: host })
      if (construido) cuentas.push(construido)
      avisos.push(...(vista.avisos ?? []))
    }

    return { cuentas, warnings: avisos }
  }

  return { leer }
}

// A diferencia de resolveClaudeHome() (donde `home` es ~/.claude y
// .claude.json vive en el padre, ~/), un CLAUDE_CONFIG_DIR es autocontenido:
// projects/, sessions/ y .claude.json viven los tres dentro de esa misma
// carpeta. Ver claude-home.js para el caso ~/.claude estandar. Exportada:
// commands/monitor.js la reusa para armar `cuentasLocales` del source
// principal (mezcla de SESIONES/PROYECTOS), no solo para el agregado de
// CUENTAS que arma este archivo.
export function pathsDeConfigDir(configDir) {
  return {
    home: configDir,
    projectsDir: path.join(configDir, 'projects'),
    sessionsDir: path.join(configDir, 'sessions'),
    configFile: path.join(configDir, '.claude.json'),
  }
}

function leerHostname() {
  try {
    return os.hostname()
  } catch {
    return null
  }
}

// Combina N lectores con la misma interfaz {leer}: junta cuentas y avisos de
// todos. Se usa para mezclar el Vault (otras maquinas) con las cuentas locales
// (mismo host, otro CLAUDE_CONFIG_DIR) sin que snapshot-source.js tenga que
// saber que hay mas de una fuente.
export function createCombinedAccountsReader(readers) {
  const activos = readers.filter(Boolean)

  async function leer({ ahora } = {}) {
    const cuentas = []
    const warnings = []
    for (const reader of activos) {
      const res = await reader.leer({ ahora })
      cuentas.push(...(res?.cuentas ?? []))
      warnings.push(...(res?.warnings ?? []))
    }
    return { cuentas, warnings }
  }

  return { leer }
}
