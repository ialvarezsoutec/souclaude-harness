import fs from 'node:fs'

// Este adaptador lee `cachedUsageUtilization` de ~/.claude.json: los
// porcentajes de limite (5h, 7d, por grupo, gasto extra) que Claude Code ya
// calculo y cacheo. Nunca los recalculamos, solo los proyectamos al modelo
// de dominio que consume la vista.

// El archivo crece con el historial por proyecto y puede llegar a pesar
// varios MB. Re-parsearlo en cada tick del panel lo congelaria, asi que
// cacheamos por mtime+ttl y agregamos un guard de tamano.
//
// SEGUNDA FUENTE (opcional): un `fetcher` inyectado (ver usage-fetcher.js) que
// le pega al endpoint de uso y trae el MISMO objeto de utilizacion, pero
// fresco. Gana la fuente con `leidoEn` mas reciente y se usa entera: nunca se
// mezclan campos de las dos. Sin `fetcher` inyectado el comportamiento es
// identico al anterior, byte por byte.
export function createLimitsReader({ ttlMs = 30_000, maxBytes = 32 * 1024 * 1024, fetcher = null } = {}) {
  let cached = null // { mtimeMs, cachedAtMs, value }

  async function read(configFile, { ahora } = {}) {
    const now = ahora ?? Date.now()
    const desdeConfig = await readConfig(configFile, now)
    if (!fetcher) return desdeConfig

    // El fetcher nunca lanza, pero un adaptador de lectura tampoco puede
    // confiar en eso: si alguien inyecta otra cosa, el panel no se cae.
    let remoto = null
    try {
      remoto = await fetcher.obtener({ ahora: now })
    } catch {
      remoto = null
    }

    const desdeRed =
      remoto && remoto.utilization
        ? { limits: mapLimits(remoto.utilization, remoto.fetchedAtMs ?? null, now), warnings: [] }
        : null

    return elegirMasReciente(desdeConfig, desdeRed)
  }

  async function readConfig(configFile, now) {
    let stat
    try {
      stat = await fs.promises.stat(configFile)
    } catch (err) {
      // Sin .claude.json no hay nada que mostrar: no es un error del monitor.
      return { limits: null, cuenta: null, warnings: [{ file: configFile, reason: err.code ?? err.message }] }
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
        cuenta: null,
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
      const value = { limits: null, cuenta: null, warnings: [{ file: configFile, reason: err.code ?? err.message }] }
      cached = { mtimeMs: stat.mtimeMs, cachedAtMs: now, value }
      return value
    }

    const value = buildValue(data, now, configFile)
    cached = { mtimeMs: stat.mtimeMs, cachedAtMs: now, value }
    return value
  }

  return { read }
}

// El `edadMs` del cache de .claude.json se recalcula en cada read, pero cuando
// el valor viene del cache interno se quedo congelado en el `now` de entonces.
// Para elegir ganador comparamos `leidoEn`, que si es absoluto.
function elegirMasReciente(desdeConfig, desdeRed) {
  // La identidad de cuenta solo existe en .claude.json (el endpoint de uso no
  // la trae), asi que siempre viaja desde la fuente config, gane quien gane.
  const cuenta = desdeConfig?.cuenta ?? null

  if (!desdeRed?.limits) return desdeConfig
  if (!desdeConfig?.limits) return { limits: desdeRed.limits, cuenta, warnings: desdeConfig?.warnings ?? [] }

  const tConfig = typeof desdeConfig.limits.leidoEn === 'number' ? desdeConfig.limits.leidoEn : -Infinity
  const tRed = typeof desdeRed.limits.leidoEn === 'number' ? desdeRed.limits.leidoEn : -Infinity

  // Empate a favor de la red: es la fuente que realmente se refresca sola.
  const ganador = tRed >= tConfig ? desdeRed.limits : desdeConfig.limits
  return { limits: ganador, cuenta, warnings: desdeConfig.warnings }
}

function buildValue(data, now, configFile) {
  const cuenta = toCuenta(data)
  const cu = data?.cachedUsageUtilization
  if (!cu || typeof cu !== 'object') {
    // La identidad puede existir aunque no haya limites cacheados todavia.
    return { limits: null, cuenta, warnings: [{ file: configFile, reason: 'sin cachedUsageUtilization: cuenta sin limites o version distinta' }] }
  }

  return { limits: mapLimits(cu.utilization ?? {}, cu.fetchedAtMs ?? null, now), cuenta, warnings: [] }
}

// Identidad cruda para el dominio (normalizarCuenta valida y deriva el
// alias). Solo se extraen los campos que la spec permite publicar: nada de
// tokens, roles ni tiers.
function toCuenta(data) {
  const oa = data?.oauthAccount
  if (!oa || typeof oa !== 'object') return null
  return {
    accountUuid: oa.accountUuid ?? null,
    email: oa.emailAddress ?? null,
    organizacion: oa.organizationName ?? null,
    machineID: data?.machineID ?? null,
  }
}

// Unico mapeo a nombres de dominio. Lo comparten las dos fuentes porque el
// cuerpo del endpoint tiene exactamente la misma forma que
// `cachedUsageUtilization.utilization` (verificado contra la maquina real).
function mapLimits(u, leidoEn, now) {
  return {
    cincoHoras: toVentana(u.five_hour),
    sieteDias: toVentana(u.seven_day),
    porGrupo: toPorGrupo(u.limits),
    gastoExtra: toGastoExtra(u.extra_usage),
    leidoEn,
    edadMs: typeof leidoEn === 'number' ? now - leidoEn : null,
  }
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
    // La API ya calcula su propio porcentaje (puede diferir del recalculo local
    // por redondeo de decimal_places, ej. 106.8 vs 100): lo exponemos aparte
    // para que el panel deje de recalcular y use este.
    utilizacion: typeof extra.utilization === 'number' ? extra.utilization : null,
    motivoDeshabilitado: extra.disabled_reason ?? null,
    alcanzado: extra.spend_limit_reached ?? false,
  }
}
