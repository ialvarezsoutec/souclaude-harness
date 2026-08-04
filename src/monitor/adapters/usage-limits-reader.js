import fs from 'node:fs'

// Este adaptador lee `cachedUsageUtilization` de ~/.claude.json: los
// porcentajes de limite (5h, 7d, por grupo, gasto extra) que Claude Code ya
// calculo y cacheo. Nunca los recalculamos, solo los proyectamos al modelo
// de dominio que consume la vista.

// El archivo crece con el historial por proyecto y puede llegar a pesar
// varios MB. Re-parsearlo en cada tick del panel lo congelaria, asi que
// cacheamos por mtime+ttl y agregamos un guard de tamano.
export function createLimitsReader({ ttlMs = 30_000, maxBytes = 32 * 1024 * 1024 } = {}) {
  let cached = null // { mtimeMs, cachedAtMs, value }

  async function read(configFile, { ahora } = {}) {
    const now = ahora ?? Date.now()

    let stat
    try {
      stat = await fs.promises.stat(configFile)
    } catch (err) {
      // Sin .claude.json no hay nada que mostrar: no es un error del monitor.
      return { limits: null, warnings: [{ file: configFile, reason: err.code ?? err.message }] }
    }

    if (
      cached &&
      cached.mtimeMs === stat.mtimeMs &&
      now - cached.cachedAtMs < ttlMs
    ) {
      return cached.value
    }

    if (stat.size > maxBytes) {
      const value = {
        limits: null,
        warnings: [{ file: configFile, reason: `archivo demasiado grande (${stat.size} bytes > ${maxBytes})` }],
      }
      cached = { mtimeMs: stat.mtimeMs, cachedAtMs: now, value }
      return value
    }

    let data
    try {
      const raw = await fs.promises.readFile(configFile, 'utf8')
      data = JSON.parse(raw)
    } catch (err) {
      const value = { limits: null, warnings: [{ file: configFile, reason: err.code ?? err.message }] }
      cached = { mtimeMs: stat.mtimeMs, cachedAtMs: now, value }
      return value
    }

    const value = buildValue(data, now, configFile)
    cached = { mtimeMs: stat.mtimeMs, cachedAtMs: now, value }
    return value
  }

  return { read }
}

function buildValue(data, now, configFile) {
  const cu = data?.cachedUsageUtilization
  if (!cu || typeof cu !== 'object') {
    return { limits: null, warnings: [{ file: configFile, reason: 'sin cachedUsageUtilization: cuenta sin limites o version distinta' }] }
  }

  const u = cu.utilization ?? {}
  const leidoEn = cu.fetchedAtMs ?? null

  const limits = {
    cincoHoras: toVentana(u.five_hour),
    sieteDias: toVentana(u.seven_day),
    porGrupo: toPorGrupo(u.limits),
    gastoExtra: toGastoExtra(u.extra_usage),
    leidoEn,
    edadMs: typeof leidoEn === 'number' ? now - leidoEn : null,
  }

  return { limits, warnings: [] }
}

function toVentana(v) {
  if (!v || typeof v.utilization !== 'number') return null
  return { porcentaje: v.utilization, reseteaEn: v.resets_at ?? null }
}

function toPorGrupo(list) {
  if (!Array.isArray(list)) return []
  return list
    .filter((item) => item && typeof item.percent === 'number')
    .map((item) => ({
      tipo: item.kind ?? null,
      grupo: item.group ?? null,
      porcentaje: item.percent,
      severidad: item.severity ?? null,
      reseteaEn: item.resets_at ?? null,
      modelo: item.scope?.model?.display_name ?? null,
      activo: item.is_active ?? false,
    }))
    .sort((a, b) => b.porcentaje - a.porcentaje)
}

function toGastoExtra(extra) {
  if (!extra || typeof extra !== 'object') return null
  const decimals = typeof extra.decimal_places === 'number' ? extra.decimal_places : 2
  const factor = 10 ** decimals
  const limiteUsd = typeof extra.monthly_limit === 'number' ? extra.monthly_limit / factor : null
  const usadoUsd = typeof extra.used_credits === 'number' ? extra.used_credits / factor : null
  const porcentaje = limiteUsd && limiteUsd > 0 && usadoUsd !== null ? (usadoUsd / limiteUsd) * 100 : null

  return {
    habilitado: extra.is_enabled ?? false,
    usadoUsd,
    limiteUsd,
    porcentaje,
    alcanzado: extra.spend_limit_reached ?? false,
  }
}
