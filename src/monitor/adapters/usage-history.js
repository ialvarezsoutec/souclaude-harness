import fs from 'node:fs'
import path from 'node:path'

import { siguienteRegistro } from '../domain/gasto-extra.js'

// Adaptador de persistencia del historico del gasto extra
// (~/.claude/souclaude/usage-history.json). La API de Claude Code solo informa
// el estado ACTUAL del gasto extra (si esta alcanzado o no, cuanto se uso);
// nunca dice cuando se detecto por primera vez ni conserva periodos ya
// cerrados. Sin un registro propio no hay forma de mostrar "hace cuanto se
// alcanzo" ni de armar la seccion Historico del panel (ver
// docs/decisions/20260810-monitor-persiste-historico-de-gasto-extra.md).
//
// La decision de negocio (abrir/mantener/cerrar un registro) es de
// `siguienteRegistro()` (domain/gasto-extra.js, pura, sin I/O). Este adaptador
// solo llama a esa funcion y persiste lo que devuelve.
export function createUsageHistory({ paths, seedDetectadoEn } = {}) {
  const historyFile = paths ? path.join(paths.home, 'souclaude', 'usage-history.json') : null

  // Lectura tolerante: archivo ausente, corrupto o con forma inesperada nunca
  // lanza. Arranca vacio -- perder el historico no puede tumbar el panel.
  function leer() {
    if (!historyFile) return { abierto: null, archivados: [] }
    try {
      const data = JSON.parse(fs.readFileSync(historyFile, 'utf8'))
      if (!data || typeof data !== 'object') return { abierto: null, archivados: [] }
      return {
        abierto: data.abierto ?? null,
        archivados: Array.isArray(data.archivados) ? data.archivados : [],
      }
    } catch {
      return { abierto: null, archivados: [] }
    }
  }

  // Escritura directa, sin temp+rename: ese patron "atomico" es justo el que
  // falla con EPERM bajo sync de OneDrive (mismo motivo documentado en
  // usage-fetcher.js:175-187).
  function escribir(estado) {
    if (!historyFile) return
    try {
      fs.mkdirSync(path.dirname(historyFile), { recursive: true })
      fs.writeFileSync(historyFile, JSON.stringify(estado, null, 2) + '\n', 'utf8')
    } catch {
      // Sin persistencia en disco el monitor sigue funcionando; solo pierde
      // el historico entre procesos. No es motivo para romper un tick.
    }
  }

  // gastoExtra: forma de toGastoExtra() (usage-limits-reader.js). ahora: epoch
  // ms, nunca Date.now() interno -- lo decide quien llama.
  function registrar(gastoExtra, ahora) {
    // El seed solo puede aplicar la PRIMERA vez que este adaptador ve un
    // archivo: si ya existia antes de esta llamada, el flag se ignora aunque
    // se lo siga pasando (evita reabrir con una fecha vieja tras un reset).
    const archivoExistiaAntes = historyFile ? fs.existsSync(historyFile) : false
    const actual = leer()
    const siguiente = siguienteRegistro(gastoExtra, actual.abierto, ahora)

    if (siguiente === actual.abierto) return actual // sin cambios: nada que persistir

    let registro = siguiente
    if (!archivoExistiaAntes && actual.abierto == null && registro != null && registro.cerradoEn == null) {
      const seedMs = aEpochMs(seedDetectadoEn)
      if (seedMs != null) registro = { ...registro, detectadoEn: seedMs }
    }

    let abierto = registro
    let archivados = actual.archivados
    if (registro != null && registro.cerradoEn != null) {
      archivados = [...archivados, registro]
      abierto = null
    }

    const estado = { abierto, archivados }
    escribir(estado)
    return estado
  }

  return { leer, registrar }
}

function aEpochMs(valor) {
  if (typeof valor === 'number' && Number.isFinite(valor)) return valor
  if (typeof valor === 'string' && valor !== '') {
    const ms = Date.parse(valor)
    return Number.isFinite(ms) ? ms : null
  }
  return null
}
