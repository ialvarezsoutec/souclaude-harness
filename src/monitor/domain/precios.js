// Dominio puro: sin imports. Precios y aliases de modelo, y el calculo de costo
// a partir del uso de tokens de un mensaje. Determinista: las fechas entran por
// parametro, nunca Date.now().

// USD por millon de tokens (MTok), entrada/salida. Fuente: .claude/skills/ccem-model-router/SKILL.md §7.
// 'haiku' no esta en esa tabla -> no se inventa un precio, se deja fuera.
export const PRECIOS = {
  fable: { entrada: 10.0, salida: 50.0 },
  opus: { entrada: 5.0, salida: 25.0 },
  sonnet: { entrada: 3.0, salida: 15.0 },
}

// Precio introductorio de sonnet, vigente hasta el fin del 2026-08-31 (UTC) inclusive.
const SONNET_INTRO = { entrada: 2.0, salida: 10.0 }
const SONNET_INTRO_FIN_MS = Date.UTC(2026, 7, 31, 23, 59, 59, 999)

// SUPUESTO: no hay tabla de precios local en esta maquina (additionalModelCostsCache
// vacio en ~/.claude.json), asi que estos son la convencion estandar de prompt caching
// de Anthropic, no un dato verificado. Si estan mal, el costo se desvia
// sistematicamente pero los tokens siguen siendo correctos.
export const MULTIPLICADORES = {
  cacheLectura: 0.1, // sobre el precio de entrada
  cacheCreacion5m: 1.25,
  cacheCreacion1h: 2.0,
}

// SUPUESTO: input_tokens NO incluye los tokens cacheados (son campos disjuntos en
// el payload de la API). Si fuese falso, subcontariamos entrada y ningun test puede
// detectarlo: este comentario es la unica defensa honesta de esa hipotesis.

// Detecta el alias de familia a partir del message.model crudo del transcript.
// Robusto a sufijos de fecha (-20251001) y a marcadores de contexto ([1m]).
export function resolverAlias(modeloId) {
  if (typeof modeloId !== 'string' || modeloId === '') return 'desconocido'
  if (/fable/i.test(modeloId)) return 'fable'
  if (/opus/i.test(modeloId)) return 'opus'
  if (/sonnet/i.test(modeloId)) return 'sonnet'
  if (/haiku/i.test(modeloId)) return 'haiku'
  return 'desconocido'
}

// Precio vigente para un alias en un instante dado (epoch ms). ts null/undefined
// usa siempre el precio normal: no se regala el descuento si no sabemos si aplicaba.
export function precioDe(alias, ts) {
  if (alias === 'sonnet') {
    const enVentanaIntro = ts != null && ts <= SONNET_INTRO_FIN_MS
    return enVentanaIntro ? SONNET_INTRO : PRECIOS.sonnet
  }
  return PRECIOS[alias] ?? null
}

// Costo en USD de un uso de tokens. uso: { entrada, salida, cacheCreacion,
// cacheLectura, cache1h, cache5m }, todos numeros opcionales (faltante = 0).
export function costoDe(uso, alias, ts) {
  const precio = precioDe(alias, ts)
  if (!precio) return { usd: 0, conocido: false }

  const entrada = uso?.entrada ?? 0
  const salida = uso?.salida ?? 0
  const cacheLectura = uso?.cacheLectura ?? 0
  const cache5m = uso?.cache5m ?? 0
  const cache1h = uso?.cache1h ?? 0
  const cacheCreacion = uso?.cacheCreacion ?? 0

  // El payload real trae cache_creation_input_tokens (total) y su desglose en
  // ephemeral_5m/ephemeral_1h. Si el desglose viene en 0 pero el total no, se
  // asume 5m para el total completo (es el default de la API) y NO se suma el
  // total aparte, para no contar esos tokens dos veces.
  const tieneDesglose = cache5m > 0 || cache1h > 0
  const cache5mEfectivo = tieneDesglose ? cache5m : cacheCreacion
  const cache1hEfectivo = tieneDesglose ? cache1h : 0

  const usd =
    (entrada * precio.entrada +
      salida * precio.salida +
      cacheLectura * precio.entrada * MULTIPLICADORES.cacheLectura +
      cache5mEfectivo * precio.entrada * MULTIPLICADORES.cacheCreacion5m +
      cache1hEfectivo * precio.entrada * MULTIPLICADORES.cacheCreacion1h) /
    1e6

  return { usd, conocido: true }
}
