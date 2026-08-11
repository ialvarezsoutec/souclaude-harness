import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

import { createUsageFetcher, ENDPOINT, contieneSecreto } from '../src/monitor/adapters/usage-fetcher.js'
import { createLimitsReader } from '../src/monitor/adapters/usage-limits-reader.js'
import { mkClaudeHome } from './helpers-monitor.js'

// Este archivo responde: "el refresco propio de limites de plan (usage-fetcher.js)
// nunca deja escapar un token, y su integracion con usage-limits-reader.js elige
// bien la fuente mas reciente sin mezclar campos?". La mitad de los tests de acá
// abajo son de seguridad: ~/.claude/.credentials.json guarda, ademas del token de
// Claude, los tokens OAuth de 17 conectores MCP de terceros, y el proyecto tiene un
// publicador que escribe a un repo git compartido. Ningun test toca la red ni el
// ~/.claude real: `fetchImpl` siempre es un doble inyectado.

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

// Tokens FALSOS, reconocibles, nunca reales. Sirven para probar que jamas
// aparecen en ningun lado por donde no deberian pasar.
const TOKEN_CLAUDE = 'sk-ant-oat01-TOKENFALSOCLAUDE-' + 'x'.repeat(80)
const TOKEN_REFRESH = 'sk-ant-ort01-REFRESCOFALSO-' + 'y'.repeat(80)
const TOKEN_GITHUB = 'ghp_TOKENFALSOGITHUB' + 'z'.repeat(30)

const CREDENCIALES_FALSAS = {
  claudeAiOauth: { accessToken: TOKEN_CLAUDE, refreshToken: TOKEN_REFRESH },
  mcpOAuth: { 'plugin:github|abc': { accessToken: TOKEN_GITHUB } },
}

function escribirCredenciales(claudeHome, creds = CREDENCIALES_FALSAS) {
  fs.writeFileSync(path.join(claudeHome, '.credentials.json'), JSON.stringify(creds), 'utf8')
}

function rutaCache(claudeHome) {
  return path.join(claudeHome, 'souclaude', 'usage-cache.json')
}

function utilFixture(pct = 42) {
  return { five_hour: { utilization: pct, resets_at: null }, seven_day: null, limits: [], extra_usage: null }
}

// Afirma que NINGUNA subcadena de `len` caracteres del token aparece en `texto`.
// Busqueda por subcadena, no por igualdad exacta: un slice del token seria igual
// de grave que el token entero.
function assertSinFragmentos(texto, token, len = 12) {
  for (let i = 0; i + len <= token.length; i++) {
    const frag = token.slice(i, i + len)
    assert.ok(!texto.includes(frag), `el texto no debe contener el fragmento "${frag}" del token`)
  }
}

function fetchImplContador(handler) {
  const estado = { llamadas: 0, args: [] }
  const fn = async (...args) => {
    estado.llamadas += 1
    estado.args.push(args)
    return handler(...args)
  }
  return { fn, estado }
}

function fetchOk(utilization = utilFixture()) {
  return async () => ({ status: 200, json: async () => utilization })
}

// ---------------------------------------------------------------------------
// Seguridad -- el bloque que mas importa
// ---------------------------------------------------------------------------

test('seguridad: el token no aparece en el cache propio, y el cache tiene exactamente 2 claves', async () => {
  const home = mkClaudeHome({})
  escribirCredenciales(home)
  const fetcher = createUsageFetcher({ paths: { home }, fetchImpl: fetchOk() })

  const r = await fetcher.obtener({ ahora: 1000 })
  assert.equal(r.origen, 'red')

  const crudo = fs.readFileSync(rutaCache(home), 'utf8')
  assertSinFragmentos(crudo, TOKEN_CLAUDE)
  assertSinFragmentos(crudo, TOKEN_REFRESH)
  assertSinFragmentos(crudo, TOKEN_GITHUB)

  const parsed = JSON.parse(crudo)
  assert.deepEqual(Object.keys(parsed).sort(), ['fetchedAtMs', 'utilization'])
})

test('seguridad: el token no aparece en estado(), y sus valores son numero o null', async () => {
  const home = mkClaudeHome({})
  escribirCredenciales(home)
  const fetcher = createUsageFetcher({ paths: { home }, fetchImpl: fetchOk() })
  await fetcher.obtener({ ahora: 1000 })

  const estadoObj = fetcher.estado()
  for (const [clave, valor] of Object.entries(estadoObj)) {
    assert.ok(valor === null || typeof valor === 'number', `estado().${clave} debe ser numero o null`)
  }

  const json = JSON.stringify(estadoObj)
  assertSinFragmentos(json, TOKEN_CLAUDE)
  assertSinFragmentos(json, TOKEN_REFRESH)
  assertSinFragmentos(json, TOKEN_GITHUB)
})

test('seguridad: el token no aparece en el valor de retorno de obtener()', async () => {
  const home = mkClaudeHome({})
  escribirCredenciales(home)
  const fetcher = createUsageFetcher({ paths: { home }, fetchImpl: fetchOk() })
  const r = await fetcher.obtener({ ahora: 1000 })

  const json = JSON.stringify(r)
  assertSinFragmentos(json, TOKEN_CLAUDE)
  assertSinFragmentos(json, TOKEN_REFRESH)
  assertSinFragmentos(json, TOKEN_GITHUB)
})

test('seguridad: refreshToken nunca se usa -- un 401 no reintenta con el refresh', async () => {
  const home = mkClaudeHome({})
  escribirCredenciales(home)
  const { fn, estado } = fetchImplContador(async () => ({ status: 401, json: async () => ({}) }))
  const fetcher = createUsageFetcher({ paths: { home }, fetchImpl: fn })

  const r = await fetcher.obtener({ ahora: 1000 })
  assert.equal(estado.llamadas, 1, 'un 401 no debe disparar un reintento con el refresh token')
  assert.equal(r, null)
})

test('seguridad: el token viaja SOLO en la cabecera Authorization, nunca en la URL', async () => {
  const home = mkClaudeHome({})
  escribirCredenciales(home)
  const { fn, estado } = fetchImplContador(fetchOk())
  const fetcher = createUsageFetcher({ paths: { home }, fetchImpl: fn })

  await fetcher.obtener({ ahora: 1000 })
  assert.equal(estado.llamadas, 1)
  const [url, opts] = estado.args[0]
  assert.equal(url, ENDPOINT)
  assert.equal(opts.headers.Authorization, `Bearer ${TOKEN_CLAUDE}`)
  assert.ok(!url.includes(TOKEN_CLAUDE), 'el token no debe viajar en el query string')
})

test('contieneSecreto detecta los formatos de token conocidos', () => {
  assert.equal(contieneSecreto('sk-ant-api03-' + 'a'.repeat(20)), true)
  assert.equal(contieneSecreto('ghp_' + 'a'.repeat(20)), true)
  assert.equal(contieneSecreto('xoxb-1234567890-' + 'a'.repeat(15)), true)
  assert.equal(
    contieneSecreto(
      'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.abcdefghijklmnopqrstuvwxyz',
    ),
    true,
  )
  assert.equal(contieneSecreto('a'.repeat(60)), true) // chorizo base64/url-safe largo
  assert.equal(contieneSecreto('Bearer ' + 'a'.repeat(20)), true) // cabecera pegada por accidente
})

test('contieneSecreto no dispara con texto normal', () => {
  assert.equal(contieneSecreto('hola mundo'), false)
  assert.equal(contieneSecreto(''), false)
  // JSON de utilizacion real: numeros y claves cortas, nada que parezca secreto.
  assert.equal(contieneSecreto(JSON.stringify(utilFixture(77))), false)
  // Falso positivo CONOCIDO y ACEPTADO: un hash largo (p. ej. un SHA-256 en hex de
  // 64 caracteres) tambien dispara la regla de "chorizo largo". El comentario en
  // usage-fetcher.js ya lo documenta: es una red de seguridad, no la defensa
  // principal, y prefiere sobre-marcar a dejar pasar un secreto real.
})

// ---------------------------------------------------------------------------
// Comportamiento -- TTL, force, sin credenciales, errores, backoff, fallback
// ---------------------------------------------------------------------------

test('TTL: dos obtener() seguidos dentro del ttl pegan a la red una sola vez', async () => {
  const home = mkClaudeHome({})
  escribirCredenciales(home)
  const { fn, estado } = fetchImplContador(fetchOk())
  const fetcher = createUsageFetcher({ paths: { home }, fetchImpl: fn, ttlMs: 5 * 60_000 })

  const r1 = await fetcher.obtener({ ahora: 1000 })
  const r2 = await fetcher.obtener({ ahora: 2000 })

  assert.equal(estado.llamadas, 1)
  assert.equal(r1.origen, 'red')
  assert.equal(r2.origen, 'cache-propio')
})

test('force: true salta el TTL y pega a la red igual', async () => {
  const home = mkClaudeHome({})
  escribirCredenciales(home)
  const { fn, estado } = fetchImplContador(fetchOk())
  const fetcher = createUsageFetcher({ paths: { home }, fetchImpl: fn, ttlMs: 5 * 60_000 })

  await fetcher.obtener({ ahora: 1000 })
  const r2 = await fetcher.obtener({ ahora: 2000, force: true })

  assert.equal(estado.llamadas, 2)
  assert.equal(r2.origen, 'red')
})

test('sin credenciales: devuelve null sin lanzar y jamas llama a fetchImpl', async () => {
  const home = mkClaudeHome({}) // sin .credentials.json
  const { fn, estado } = fetchImplContador(fetchOk())
  const fetcher = createUsageFetcher({ paths: { home }, fetchImpl: fn })

  const r = await fetcher.obtener({ ahora: 1000 })
  assert.equal(r, null)
  assert.equal(estado.llamadas, 0, 'sin token no tiene sentido pegarle a la API')
})

test('errores que no pueden romper nada: 401, 429, 500, JSON invalido, throw y timeout devuelven null sin lanzar', async () => {
  const casos = {
    401: async () => ({ status: 401, json: async () => ({}) }),
    429: async () => ({ status: 429, json: async () => ({}) }),
    500: async () => ({ status: 500, json: async () => ({}) }),
    'json invalido': async () => ({ status: 200, json: async () => { throw new Error('json corrupto') } }),
    'fetchImpl que lanza': async () => { throw new Error('red caida') },
    timeout: (url, opts) =>
      new Promise((_resolve, reject) => {
        opts.signal.addEventListener('abort', () => reject(new Error('abortado por timeout')))
      }),
  }

  for (const [nombre, handler] of Object.entries(casos)) {
    const home = mkClaudeHome({})
    escribirCredenciales(home)
    const fetcher = createUsageFetcher({ paths: { home }, fetchImpl: handler, timeoutMs: 10 })

    await assert.doesNotReject(
      async () => {
        const r = await fetcher.obtener({ ahora: 1000 })
        assert.equal(r, null, `caso "${nombre}" debe devolver null (sin cache previo)`)
      },
      `caso "${nombre}" no debe lanzar`,
    )
  }
})

test('backoff: 3 fallos seguidos activan una ventana en la que no se vuelve a pegar a la red', async () => {
  const home = mkClaudeHome({})
  escribirCredenciales(home)
  const { fn, estado } = fetchImplContador(async () => ({ status: 500, json: async () => ({}) }))
  const fetcher = createUsageFetcher({ paths: { home }, fetchImpl: fn, ttlMs: 1 })

  await fetcher.obtener({ ahora: 1000 })
  await fetcher.obtener({ ahora: 2000 })
  await fetcher.obtener({ ahora: 3000 })
  assert.equal(estado.llamadas, 3)

  const { backoffHasta } = fetcher.estado()
  assert.ok(typeof backoffHasta === 'number' && backoffHasta > 3000, 'backoffHasta debe quedar en el futuro')

  // Dentro de la ventana de backoff: no debe volver a pegarle a la red.
  const r4 = await fetcher.obtener({ ahora: 3000 + 1000 })
  assert.equal(estado.llamadas, 3, 'con backoff activo no debe llamar a fetchImpl')
  assert.equal(r4, null) // sin cache previo, el fallback tambien es null
})

test('fallback al cache propio: con la red caida devuelve el dato viejo con origen cache-propio', async () => {
  const home = mkClaudeHome({})
  escribirCredenciales(home)
  const ttlMs = 5 * 60_000

  // Primero un obtener() exitoso que deja algo en el cache propio.
  const fetcherOk = createUsageFetcher({ paths: { home }, fetchImpl: fetchOk(utilFixture(33)), ttlMs })
  const r1 = await fetcherOk.obtener({ ahora: 1000 })
  assert.equal(r1.origen, 'red')

  // Ahora, ya pasado el TTL, la red esta caida: debe caer al cache viejo.
  const fetcherCaido = createUsageFetcher({
    paths: { home },
    fetchImpl: async () => ({ status: 500, json: async () => ({}) }),
    ttlMs,
  })
  const r2 = await fetcherCaido.obtener({ ahora: 1000 + ttlMs + 1 })
  assert.equal(r2.origen, 'cache-propio')
  assert.equal(r2.fetchedAtMs, 1000)
  assert.deepEqual(r2.utilization, utilFixture(33))
})

// ---------------------------------------------------------------------------
// Integracion con usage-limits-reader.js
// ---------------------------------------------------------------------------

test('integracion: gana la fuente mas reciente -- el fetcher fresco le gana a un .claude.json viejo', async () => {
  const home = mkClaudeHome({
    config: { cachedUsageUtilization: { fetchedAtMs: 1000, utilization: utilFixture(10) } },
  })
  const configFile = path.join(home, '..', '.claude.json')
  escribirCredenciales(home)

  const fetcher = createUsageFetcher({ paths: { home }, fetchImpl: fetchOk(utilFixture(77)) })
  const reader = createLimitsReader({ fetcher })

  const r = await reader.read(configFile, { ahora: 5000 }) // fetcher marca fetchedAtMs=5000, mas nuevo que 1000
  assert.equal(r.limits.leidoEn, 5000)
  assert.equal(r.limits.cincoHoras.porcentaje, 77)
})

test('integracion: gana la fuente mas reciente -- si el .claude.json es mas nuevo, gana el', async () => {
  const home = mkClaudeHome({
    config: { cachedUsageUtilization: { fetchedAtMs: 9000, utilization: utilFixture(10) } },
  })
  const configFile = path.join(home, '..', '.claude.json')
  escribirCredenciales(home)

  const fetcher = createUsageFetcher({ paths: { home }, fetchImpl: fetchOk(utilFixture(77)) })
  const reader = createLimitsReader({ fetcher })

  const r = await reader.read(configFile, { ahora: 5000 }) // fetcher marca fetchedAtMs=5000, mas viejo que 9000
  assert.equal(r.limits.leidoEn, 9000)
  assert.equal(r.limits.cincoHoras.porcentaje, 10)
})

test('integracion: los campos nunca se mezclan entre fuentes', async () => {
  const home = mkClaudeHome({
    config: {
      cachedUsageUtilization: {
        fetchedAtMs: 9000,
        utilization: { five_hour: { utilization: 10, resets_at: 'config' }, seven_day: null, limits: [], extra_usage: null },
      },
    },
  })
  const configFile = path.join(home, '..', '.claude.json')
  escribirCredenciales(home)

  const fetcher = createUsageFetcher({
    paths: { home },
    fetchImpl: fetchOk({ five_hour: { utilization: 77, resets_at: 'red' }, seven_day: null, limits: [], extra_usage: null }),
  })
  const reader = createLimitsReader({ fetcher })

  // .claude.json gana (9000 > 5000): reseteaEn debe venir de config, no de red.
  const r = await reader.read(configFile, { ahora: 5000 })
  assert.equal(r.limits.cincoHoras.reseteaEn, 'config')
  assert.notEqual(r.limits.cincoHoras.reseteaEn, 'red')
})

test('integracion: sin fetcher inyectado el comportamiento no cambia', async () => {
  const home = mkClaudeHome({
    config: { cachedUsageUtilization: { fetchedAtMs: 1000, utilization: utilFixture(55) } },
  })
  const configFile = path.join(home, '..', '.claude.json')

  const reader = createLimitsReader({})
  const r = await reader.read(configFile, { ahora: 5000 })

  assert.equal(r.limits.leidoEn, 1000)
  assert.equal(r.limits.cincoHoras.porcentaje, 55)
})

test('integracion: un fetcher que lanza no rompe read(), sigue devolviendo el dato del .claude.json', async () => {
  const home = mkClaudeHome({
    config: { cachedUsageUtilization: { fetchedAtMs: 1000, utilization: utilFixture(55) } },
  })
  const configFile = path.join(home, '..', '.claude.json')

  const fetcherQueLanza = { obtener: async () => { throw new Error('boom') } }
  const reader = createLimitsReader({ fetcher: fetcherQueLanza })

  const r = await reader.read(configFile, { ahora: 5000 })
  assert.equal(r.limits.leidoEn, 1000)
  assert.equal(r.limits.cincoHoras.porcentaje, 55)
})
