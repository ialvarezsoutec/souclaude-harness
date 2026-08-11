import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { contieneSecreto } from './usage-fetcher.js'
import { gitReal, pullRebaseSeguro } from '../../core/vault-sync.js'

// Publica en el Vault un snapshot AGREGADO del estado de esta cuenta (limites
// de plan + totales de la ventana), para que los monitores de las otras
// maquinas del equipo lo consoliden en su seccion CUENTAS. Autorizado por el
// ADR docs/decisions/20260810-monitor-snapshots-en-vault.md: solo agregados
// acotados (<1 KB); telemetria cruda (model-router.jsonl, datos por sesion o
// proyecto) sigue prohibida en el Vault.
//
// REGLAS QUE NO SE NEGOCIAN:
// - El snapshot se construye campo por campo (whitelist). Jamas un spread de
//   la vista ni de ningun JSON crudo: un campo nuevo aguas arriba no puede
//   colarse solo a un repo compartido.
// - contieneSecreto() sobre el JSON serializado como ultimo filtro. Si
//   dispara, se aborta la publicacion y queda registrado en estado().
// - Nada de aca puede bloquear ni tumbar el render: publicar() nunca lanza,
//   el llamador la dispara fire-and-forget y el guard `enPublicacion` evita
//   solapamientos.
// - git con args en array via execFile (nunca shell), como core/vault.js.
//   Nunca --force.

export const INTERVALO_PUBLICACION_MS = 5 * 60_000
export const HEARTBEAT_MS = 30 * 60_000
export const CARPETA_MONITOR = '00-System/monitor'

const BACKOFF_MEDIO_MS = 15 * 60_000 // 3-5 fallos seguidos
const BACKOFF_LARGO_MS = 60 * 60_000 // 6 o mas

/**
 * Snapshot v1 por whitelist. null si la vista no trae identidad de cuenta:
 * sin accountUuid no hay archivo que nombrar ni fila que consolidar.
 */
export function construirSnapshot(vista, { ahora, hostname = null, version = null } = {}) {
  const cuenta = vista?.cuenta
  if (!cuenta?.accountUuid) return null

  const limites = vista?.limites ?? null
  const totales = vista?.totales ?? null

  return {
    version: 1,
    generadoEn: new Date(ahora).toISOString(),
    cuenta: {
      accountUuid: cuenta.accountUuid,
      alias: cuenta.alias ?? null,
      email: cuenta.email ?? null,
      organizacion: cuenta.organizacion ?? null,
    },
    maquina: {
      machineID: cuenta.machineID ?? null,
      hostname,
    },
    limites: limites
      ? {
          cincoHoras: ventana(limites.cincoHoras),
          sieteDias: ventana(limites.sieteDias),
          gastoExtra: limites.gastoExtra
            ? {
                habilitado: limites.gastoExtra.habilitado ?? false,
                usadoUsd: limites.gastoExtra.usadoUsd ?? null,
                limiteUsd: limites.gastoExtra.limiteUsd ?? null,
                porcentaje: limites.gastoExtra.porcentaje ?? null,
              }
            : null,
          leidoEn: limites.leidoEn ?? null,
        }
      : null,
    // "Dia" en el sentido de la ventana del monitor (24h por defecto). Mismo
    // criterio que el router log: tokensIn incluye ambos caches.
    totalesDia: totales
      ? {
          tokensIn: (totales.entrada ?? 0) + (totales.cacheCreacion ?? 0) + (totales.cacheLectura ?? 0),
          tokensOut: totales.salida ?? 0,
          costoUsd: totales.costoUsd ?? 0,
          llamadas: totales.llamadas ?? 0,
        }
      : null,
    origen: version ? `souclaude v${version}` : 'souclaude',
  }
}

/** Nombre estable por (cuenta, maquina): escritores git disjuntos. */
export function nombreDeSnapshot(snapshot) {
  const cuenta8 = corto(snapshot.cuenta.accountUuid)
  const maquina8 = corto(snapshot.maquina.machineID) ?? 'local'
  return `${cuenta8}--${maquina8}.json`
}

function corto(uuid) {
  if (typeof uuid !== 'string' || uuid === '') return null
  return uuid.replace(/[^a-zA-Z0-9]/g, '').slice(0, 8).toLowerCase() || null
}

function ventana(v) {
  if (!v) return null
  return { porcentaje: v.porcentaje ?? null, reseteaEn: v.reseteaEn ?? null }
}

export function createVaultPublisher({
  vaultPath,
  version = null,
  intervaloMs = INTERVALO_PUBLICACION_MS,
  heartbeatMs = HEARTBEAT_MS,
  git = gitReal,
  hostname = null,
} = {}) {
  const host = hostname ?? leerHostname()

  let enPublicacion = false
  let ultimoIntentoMs = null
  let ultimaPublicacionMs = null
  let fallosSeguidos = 0
  let backoffHasta = null
  let secretoDetectado = false

  function estado() {
    return { ultimoIntentoMs, ultimaPublicacionMs, fallosSeguidos, backoffHasta, secretoDetectado }
  }

  function registrarFallo(now) {
    fallosSeguidos += 1
    if (fallosSeguidos >= 6) backoffHasta = now + BACKOFF_LARGO_MS
    else if (fallosSeguidos >= 3) backoffHasta = now + BACKOFF_MEDIO_MS
    else backoffHasta = null
  }

  /**
   * Un intento de publicacion. Nunca lanza. El propio publisher decide si
   * toca publicar (intervalo, backoff, cambio material, heartbeat): el
   * llamador puede invocarla en cada tick sin pensar.
   * @returns {Promise<{publicado: boolean, motivo: string|null}>}
   */
  async function publicar(vista, { ahora } = {}) {
    if (enPublicacion) return { publicado: false, motivo: 'en_curso' }
    if (!vaultPath) return { publicado: false, motivo: 'sin_vault' }

    const now = typeof ahora === 'number' ? ahora : Date.now()
    if (backoffHasta !== null && now < backoffHasta) return { publicado: false, motivo: 'backoff' }
    if (ultimoIntentoMs !== null && now - ultimoIntentoMs < intervaloMs) {
      return { publicado: false, motivo: 'intervalo' }
    }

    const snapshot = construirSnapshot(vista, { ahora: now, hostname: host, version })
    if (!snapshot) return { publicado: false, motivo: 'sin_identidad' }

    enPublicacion = true
    try {
      return await publicarSnapshot(snapshot, now)
    } catch {
      // publicarSnapshot ya maneja sus fallos; esto es el ultimo paracaidas.
      registrarFallo(now)
      return { publicado: false, motivo: 'error' }
    } finally {
      enPublicacion = false
    }
  }

  async function publicarSnapshot(snapshot, now) {
    ultimoIntentoMs = now

    const serializado = JSON.stringify(snapshot, null, 2) + '\n'
    if (contieneSecreto(serializado)) {
      // No es un fallo de red: no hay backoff. Queda marcado para que el
      // panel lo muestre y NO se escribe nada.
      secretoDetectado = true
      return { publicado: false, motivo: 'secreto_detectado' }
    }
    secretoDetectado = false

    const carpeta = path.join(vaultPath, ...CARPETA_MONITOR.split('/'))
    const archivo = path.join(carpeta, nombreDeSnapshot(snapshot))

    // Cambio material: se compara ignorando generadoEn. Si nada cambio y lo
    // publicado es reciente, no hay commit — el heartbeat de 30 min mantiene
    // la frescura visible sin ruido.
    const previo = leerJson(archivo)
    if (previo && igualesSinGeneradoEn(previo, snapshot)) {
      const edadPrevio = now - Date.parse(previo.generadoEn ?? '')
      if (Number.isFinite(edadPrevio) && edadPrevio < heartbeatMs) {
        // Cuenta como publicacion lograda: el Vault ya dice lo mismo.
        ultimaPublicacionMs = now
        fallosSeguidos = 0
        backoffHasta = null
        return { publicado: false, motivo: 'sin_cambios' }
      }
    }

    // pull --rebase ANTES de escribir: si falla, no se toca el working tree
    // del Vault (abort defensivo incluido en el helper).
    const pull = await pullRebaseSeguro({ vaultPath, git })
    if (!pull.ok) {
      registrarFallo(now)
      return { publicado: false, motivo: 'pull_fallo' }
    }

    try {
      // Escritura directa, sin temp+rename (EPERM bajo OneDrive, ver core/fsx.js).
      fs.mkdirSync(carpeta, { recursive: true })
      fs.writeFileSync(archivo, serializado, 'utf8')
    } catch {
      registrarFallo(now)
      return { publicado: false, motivo: 'write_fallo' }
    }

    try {
      const relativo = `${CARPETA_MONITOR}/${nombreDeSnapshot(snapshot)}`
      await git(['-C', vaultPath, 'add', relativo])
      const alias = snapshot.cuenta.alias ?? snapshot.cuenta.accountUuid.slice(0, 8)
      await git(['-C', vaultPath, 'commit', '-m', `monitor: snapshot ${alias}@${host ?? 'local'}`])
      await git(['-C', vaultPath, 'push'])
    } catch {
      // El archivo quedo escrito (y quiza commiteado): el proximo intento con
      // red lo empuja con el pull --rebase inicial. Solo se registra el fallo.
      registrarFallo(now)
      return { publicado: false, motivo: 'git_fallo' }
    }

    fallosSeguidos = 0
    backoffHasta = null
    ultimaPublicacionMs = now
    return { publicado: true, motivo: null }
  }

  return { publicar, estado }
}

// --- helpers ---------------------------------------------------------------

function leerHostname() {
  try {
    return os.hostname()
  } catch {
    return null
  }
}

function leerJson(archivo) {
  try {
    return JSON.parse(fs.readFileSync(archivo, 'utf8'))
  } catch {
    return null
  }
}

function igualesSinGeneradoEn(a, b) {
  return JSON.stringify({ ...a, generadoEn: null }) === JSON.stringify({ ...b, generadoEn: null })
}
