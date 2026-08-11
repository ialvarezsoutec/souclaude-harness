import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import fs from 'node:fs'

import { monitor } from '../src/commands/monitor.js'
import { mkClaudeHome, lineaAssistant, lineaTitulo } from './helpers-monitor.js'

// T25: test end-to-end del comando `monitor`. Dos formas de invocar (ver
// cabecera de dogfood.test.js para el estilo de este repo):
//   - en proceso: import directo de monitor(flags, cwd), capturando stdout.
//   - como subproceso: execFileSync sobre bin/cli.mjs, que es lo unico que
//     prueba de verdad parseArgs strict de cli.js y que el binario arranca.
//
// helpers.js (importado transitivamente via helpers-monitor.js: mismo archivo
// de test) fuerza CI=true, asi que --once no hace falta para caer al modo
// plano, pero se pasa igual donde corresponde por claridad del caso.

const REPO_ROOT = fileURLToPath(new URL('..', import.meta.url))
const CLI = path.join(REPO_ROOT, 'bin', 'cli.mjs')

// Captura la invocacion en proceso de monitor(). Dos variantes:
//
// - correrJsonEnProceso: para el modo --json, que SOLO escribe via
//   console.log (ver src/commands/monitor.js). Interceptar console.log (y no
//   process.stdout.write) es deliberado: `node --test` usa el stdout real del
//   proceso como canal para reportar el progreso de los tests entre ticks del
//   event loop, y monitor() siempre tiene un `await` (buildView es async)
//   entre el override y la escritura. Pisar process.stdout.write global deja
//   una ventana donde ese canal interno tambien cae en el buffer capturado y
//   lo corrompe (reproducido de forma standalone: overridear
//   process.stdout.write alrededor de un simple `await setTimeout` ya alcanza
//   para que el JSON.parse posterior falle con bytes binarios). console.log
//   no tiene ese problema: el reportero de `node --test` no pasa por ahi.
// - correrSoloCodigo: para los modos que escriben con process.stdout.write
//   directo (compact/agents/plano), donde no hace falta el contenido: solo se
//   necesita el codigo de salida, asi que no se intercepta nada. El contenido
//   de esos modos se prueba via subproceso (correrSubproceso), que aisla el
//   stdout en un proceso propio y no tiene este riesgo.
async function correrJsonEnProceso(flags, cwd = REPO_ROOT) {
  const original = console.log
  let salida = ''
  console.log = (...args) => {
    salida += args.join(' ') + '\n'
  }
  let code
  try {
    code = await monitor(flags, cwd)
  } finally {
    console.log = original
  }
  return { code, salida: salida.replace(/\n$/, '') }
}

async function correrSoloCodigo(flags, cwd = REPO_ROOT) {
  return monitor(flags, cwd)
}

// execFileSync lanza si el proceso sale con codigo != 0: se captura sin que
// el test explote y se lee err.status para los casos de error/limite.
function correrSubproceso(args, opciones = {}) {
  try {
    const stdout = execFileSync(process.execPath, [CLI, 'monitor', ...args], {
      encoding: 'utf8',
      timeout: 10_000,
      ...opciones,
    })
    return { status: 0, stdout }
  } catch (err) {
    return { status: err.status, stdout: err.stdout ?? '', stderr: err.stderr ?? '' }
  }
}

function sumaEsperada(...eventos) {
  // Replica lo que arbol.js/consumo.js suman: entrada + salida + cacheCreacion
  // + cacheLectura (cache1h/cache5m son desglose de cacheCreacion, no se
  // vuelven a sumar aparte).
  const acc = { llamadas: 0, entrada: 0, salida: 0, cacheCreacion: 0, cacheLectura: 0 }
  for (const e of eventos) {
    acc.llamadas += 1
    acc.entrada += e.entrada ?? 0
    acc.salida += e.salida ?? 0
    acc.cacheCreacion += e.cacheCreacion ?? 0
    acc.cacheLectura += e.cacheLectura ?? 0
  }
  return acc
}

// ---------------------------------------------------------------------------
// camino feliz
// ---------------------------------------------------------------------------

test('monitor --once --json: exit 0, JSON valido con la forma del modelo de dominio', async () => {
  const evt1 = { id: 'msg_a', entrada: 100, salida: 50 }
  const evt2 = { id: 'msg_b', entrada: 200, salida: 80, cacheCreacion: 10, cacheLectura: 5 }

  const home = mkClaudeHome({
    proyectos: {
      'proyecto-uno': {
        'sess-1.jsonl': [
          lineaAssistant({ id: evt1.id, entrada: evt1.entrada, salida: evt1.salida, sessionId: 'sess-1' }),
          lineaAssistant({
            id: evt2.id,
            entrada: evt2.entrada,
            salida: evt2.salida,
            cacheCreacion: evt2.cacheCreacion,
            cacheLectura: evt2.cacheLectura,
            sessionId: 'sess-1',
          }),
          lineaTitulo({ sessionId: 'sess-1', titulo: 'Sesion de prueba' }),
        ],
      },
    },
  })

  const { code, salida } = await correrJsonEnProceso({ once: true, json: true, 'claude-home': home })

  assert.equal(code, 0)
  const vista = JSON.parse(salida)

  for (const clave of ['generadoEn', 'ventana', 'totales', 'proyectos', 'agentesActivos', 'avisos', 'recortes']) {
    assert.ok(clave in vista, `falta la clave "${clave}" en el JSON`)
  }

  const esperado = sumaEsperada(evt1, evt2)
  assert.equal(vista.totales.llamadas, esperado.llamadas)
  assert.equal(vista.totales.entrada, esperado.entrada)
  assert.equal(vista.totales.salida, esperado.salida)
  assert.equal(vista.totales.cacheCreacion, esperado.cacheCreacion)
  assert.equal(vista.totales.cacheLectura, esperado.cacheLectura)
})

test('monitor --once --json via subproceso: cablea cli.js -> comando de verdad', () => {
  const evt = { id: 'msg_sub', entrada: 42, salida: 7 }
  const home = mkClaudeHome({
    proyectos: {
      p1: { 'sess-1.jsonl': [lineaAssistant({ id: evt.id, entrada: evt.entrada, salida: evt.salida })] },
    },
  })

  const { status, stdout } = correrSubproceso(['--once', '--json', '--claude-home', home])

  assert.equal(status, 0)
  const vista = JSON.parse(stdout)
  assert.equal(vista.totales.entrada, evt.entrada)
  assert.equal(vista.totales.salida, evt.salida)
  assert.equal(vista.totales.llamadas, 1)
})

// ---------------------------------------------------------------------------
// deduplicacion end-to-end
// ---------------------------------------------------------------------------

test('monitor --once --json: una respuesta con el mismo message.id repetida 3 veces cuenta 1 sola vez', async () => {
  const linea = lineaAssistant({ id: 'msg_repetido', entrada: 300, salida: 120, sessionId: 'sess-dup' })

  const home = mkClaudeHome({
    proyectos: {
      'proyecto-dup': {
        // Simula lo que hace Claude Code de verdad: la misma respuesta escrita
        // varias veces (bloque text + bloque tool_use), mismo message.id.
        'sess-dup.jsonl': [linea, linea, linea],
      },
    },
  })

  const { code, salida } = await correrJsonEnProceso({ once: true, json: true, 'claude-home': home })

  assert.equal(code, 0)
  const vista = JSON.parse(salida)
  assert.equal(vista.totales.llamadas, 1, 'el monitor infla el consumo si no dedup por message.id')
  assert.equal(vista.totales.entrada, 300)
  assert.equal(vista.totales.salida, 120)
})

// ---------------------------------------------------------------------------
// modos
// ---------------------------------------------------------------------------

test('monitor --once --compact: exit 0, salida no vacia, sin escapes ANSI', () => {
  const home = mkClaudeHome({
    proyectos: { p1: { 'sess-1.jsonl': [lineaAssistant({ entrada: 10, salida: 5 })] } },
  })

  // --compact escribe con process.stdout.write directo (no console.log): el
  // contenido se prueba via subproceso (ver comentario de correrJsonEnProceso
  // mas arriba sobre por que no se intercepta process.stdout.write en proceso).
  const { status, stdout } = correrSubproceso(['--once', '--compact', '--claude-home', home])

  assert.equal(status, 0)
  assert.ok(stdout.trim().length > 0)
  assert.ok(!stdout.includes('\x1b'), 'la salida compact no debe llevar escapes ANSI')
})

test('monitor --once --agents: exit 0', async () => {
  const home = mkClaudeHome({
    proyectos: { p1: { 'sess-1.jsonl': [lineaAssistant({ entrada: 10, salida: 5 })] } },
  })

  // Aca solo importa el codigo de salida: correrSoloCodigo no intercepta nada,
  // asi que la salida real del modo agents va directo a la terminal del test.
  const code = await correrSoloCodigo({ once: true, agents: true, 'claude-home': home })
  assert.equal(code, 0)
})

test('monitor sin TTY (subproceso, sin --once): cae solo a modo plano, no se cuelga y no abre alternate buffer', () => {
  const home = mkClaudeHome({
    proyectos: { p1: { 'sess-1.jsonl': [lineaAssistant({ entrada: 10, salida: 5 })] } },
  })

  // Sin --once a proposito: lo que se prueba es que la falta de TTY (y CI=true,
  // heredado del entorno del test) alcanza para no entrar al panel en vivo.
  const { status, stdout } = correrSubproceso(['--claude-home', home], { timeout: 10_000 })

  assert.equal(status, 0)
  assert.ok(!stdout.includes('\x1b[?1049'), 'no debe activar el alternate buffer sin TTY')
})

test('monitor --once --ascii: salida solo ASCII, sin glifos de caja Unicode', () => {
  const home = mkClaudeHome({
    proyectos: { p1: { 'sess-1.jsonl': [lineaAssistant({ entrada: 10, salida: 5 })] } },
  })

  const { status, stdout } = correrSubproceso(['--once', '--ascii', '--claude-home', home])

  assert.equal(status, 0)
  assert.ok(!/[┌┐└┘─│├┤█▓░▁▂▃▄▅▆▇]/.test(stdout), 'quedo un glifo Unicode de caja/barra en modo --ascii')
  assert.ok(/^[\x00-\x7F]*$/.test(stdout), 'la salida --ascii debe ser solo ASCII')
})

// ---------------------------------------------------------------------------
// errores de uso
// ---------------------------------------------------------------------------

test('monitor --since basura: exit 2 (en proceso, solo codigo)', async () => {
  const home = mkClaudeHome({})
  const code = await correrSoloCodigo({ once: true, since: 'basura', 'claude-home': home })
  assert.equal(code, 2)
})

test('monitor --since basura via subproceso: exit 2 y mensaje que menciona la ventana', () => {
  // ui.log.error (@clack/prompts) escribe por stdout con ANSI, no por
  // console.error ni console.log: el contenido del mensaje solo se puede
  // verificar de forma confiable via subproceso.
  const home = mkClaudeHome({})
  const { status, stdout } = correrSubproceso(['--once', '--since', 'basura', '--claude-home', home])
  assert.equal(status, 2)
  assert.ok(/ventana/i.test(stdout), `el mensaje de error deberia mencionar la ventana, salio: "${stdout}"`)
})

test('un flag inexistente (--noexiste): exit 2, lo rechaza parseArgs strict', () => {
  const { status } = correrSubproceso(['--noexiste'])
  assert.equal(status, 2)
})

// ---------------------------------------------------------------------------
// robustez
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// SHS-H3-T106: el usageFetcher compartido con createSnapshotSource
// ---------------------------------------------------------------------------

test('monitor --once --json --claude-home: sin refresco de red, nunca aparece el aviso de "sin refrescar"', async () => {
  // --claude-home apunta a un fixture (sinRefrescoDeRed en commands/monitor.js):
  // no se crea usageFetcher, asi que createSnapshotSource nunca puede reportar
  // un estado() de fallos/backoff. Este es el comportamiento esperado -- ver
  // tasks.md SHS-H3-T106 ("verificacion manual" para el caso con red real).
  const home = mkClaudeHome({
    proyectos: { p1: { 'sess-1.jsonl': [lineaAssistant({ entrada: 10, salida: 5 })] } },
  })

  const { code, salida } = await correrJsonEnProceso({ once: true, json: true, 'claude-home': home })

  assert.equal(code, 0)
  const vista = JSON.parse(salida)
  const hayAvisoDeRefresco = (vista.avisos ?? []).some((a) => String(a?.reason ?? a).includes('sin refrescar'))
  assert.equal(hayAvisoDeRefresco, false)
})

test('monitor --claude-home vacio (maquina recien instalada): exit 0, JSON valido con proyectos: []', async () => {
  const home = mkClaudeHome({}) // sin proyectos ni sesiones

  const { code, salida } = await correrJsonEnProceso({ once: true, json: true, 'claude-home': home })

  assert.equal(code, 0)
  const vista = JSON.parse(salida)
  assert.deepEqual(vista.proyectos, [])
})

test('un .jsonl con una linea corrupta en medio de lineas validas: no lanza, las validas se cuentan igual', async () => {
  const buena1 = lineaAssistant({ id: 'msg_ok1', entrada: 50, salida: 20, sessionId: 'sess-corrupta' })
  const buena2 = lineaAssistant({ id: 'msg_ok2', entrada: 30, salida: 10, sessionId: 'sess-corrupta' })

  const home = mkClaudeHome({
    proyectos: {
      'proyecto-corrupto': {
        'sess-corrupta.jsonl': [buena1, '{ esto no es json valido', buena2],
      },
    },
  })

  const { code, salida } = await correrJsonEnProceso({ once: true, json: true, 'claude-home': home })

  assert.equal(code, 0)
  const vista = JSON.parse(salida)
  assert.equal(vista.totales.llamadas, 2)
  assert.equal(vista.totales.entrada, 80)
  assert.equal(vista.totales.salida, 30)
})

test('un .jsonl con isApiErrorMessage: true no se cuenta', async () => {
  const buena = lineaAssistant({ id: 'msg_valido', entrada: 40, salida: 15, sessionId: 'sess-error' })
  const conError = lineaAssistant({ id: 'msg_error', sessionId: 'sess-error', apiError: true })

  const home = mkClaudeHome({
    proyectos: {
      'proyecto-error': { 'sess-error.jsonl': [buena, conError] },
    },
  })

  const { code, salida } = await correrJsonEnProceso({ once: true, json: true, 'claude-home': home })

  assert.equal(code, 0)
  const vista = JSON.parse(salida)
  assert.equal(vista.totales.llamadas, 1, 'la linea con isApiErrorMessage no debe contarse')
  assert.equal(vista.totales.entrada, 40)
  assert.equal(vista.totales.salida, 15)
})

// ---------------------------------------------------------------------------
// codigos de salida por limite (cachedUsageUtilization)
// ---------------------------------------------------------------------------

function configConLimite(porcentaje) {
  return {
    cachedUsageUtilization: {
      fetchedAtMs: Date.now(),
      utilization: {
        five_hour: { utilization: porcentaje, resets_at: null },
        seven_day: { utilization: Math.max(0, porcentaje - 20), resets_at: null },
      },
    },
  }
}

test('limites todos bajo 85%: exit 0', async () => {
  const home = mkClaudeHome({ config: configConLimite(50) })
  const { code } = await correrJsonEnProceso({ once: true, json: true, 'claude-home': home })
  assert.equal(code, 0)
})

test('algun limite entre 85% y 94%: exit 1', async () => {
  const home = mkClaudeHome({ config: configConLimite(90) })
  const { code } = await correrJsonEnProceso({ once: true, json: true, 'claude-home': home })
  assert.equal(code, 1)
})

test('algun limite en 95% o mas: exit 2', async () => {
  const home = mkClaudeHome({ config: configConLimite(97) })
  const { code } = await correrJsonEnProceso({ once: true, json: true, 'claude-home': home })
  assert.equal(code, 2)
})

test('codigos de limite via subproceso: exit 2 con 95%+', () => {
  const home = mkClaudeHome({ config: configConLimite(99) })
  const { status } = correrSubproceso(['--once', '--json', '--claude-home', home])
  assert.equal(status, 2)
})

// ---------------------------------------------------------------------------
// SHS-H3-T104: --seed-extra-detectado-en tiene que llegar de verdad hasta
// crearUsageHistory(). Rework: el flag se leia en commands/monitor.js pero
// nunca se registro en el parser de cli.js (parseArgs strict lo rechazaba con
// "Unknown option"), asi que la feature estaba muerta -- este test corre por
// SUBPROCESO (bin/cli.mjs), la unica forma de probar de verdad parseArgs
// strict (ver cabecera de este archivo).
// ---------------------------------------------------------------------------

// porcentaje bajo a proposito (20%, no 95%+): este test solo verifica que el
// flag llega hasta el adaptador, no el codigo de salida por alarma (eso ya lo
// cubren los tests de "codigos de limite" de mas arriba).
function configConGastoExtraAlcanzado() {
  return {
    cachedUsageUtilization: {
      fetchedAtMs: Date.now(),
      utilization: {
        five_hour: { utilization: 10, resets_at: null },
        seven_day: { utilization: 10, resets_at: null },
        extra_usage: {
          is_enabled: false,
          monthly_limit: 2000,
          used_credits: 400,
          utilization: 20,
          disabled_reason: null,
          spend_limit_reached: true,
        },
      },
    },
  }
}

test('monitor --seed-extra-detectado-en via subproceso: parseArgs lo acepta y llega hasta usage-history.json', () => {
  const home = mkClaudeHome({ config: configConGastoExtraAlcanzado() })
  const seed = '2026-08-06T18:00:00.000Z'

  const { status, stderr } = correrSubproceso([
    '--once',
    '--json',
    '--no-refresh',
    '--claude-home',
    home,
    '--seed-extra-detectado-en',
    seed,
  ])

  // Sin el flag registrado en OPTIONS de cli.js, parseArgs strict rechaza la
  // invocacion entera con "Unknown option '--seed-extra-detectado-en'" y
  // status 2 -- exactamente el bug de este rework.
  assert.equal(status, 0, `no debe rechazar el flag (stderr: ${stderr})`)

  const rutaHistoria = path.join(home, 'souclaude', 'usage-history.json')
  assert.ok(fs.existsSync(rutaHistoria), 'usage-history.json deberia existir: crearUsageHistory() nunca corrio')

  const historia = JSON.parse(fs.readFileSync(rutaHistoria, 'utf8'))
  assert.ok(historia.abierto, 'deberia haber abierto un registro para el gasto extra alcanzado')
  assert.equal(
    historia.abierto.detectadoEn,
    Date.parse(seed),
    'el seed deberia fijar detectadoEn, no el "ahora" de la corrida',
  )
})

// ---------------------------------------------------------------------------
// RF-05 (SHS-H3-T105) / criterio de exito de spec.md:209-211: `--json` incluye
// `historico` -- este punto lo cerraba `tasks.md` con verificacion manual
// unicamente, contra la regla que la propia spec fija (spec.md:24-27, "ningun
// RF se cierra con verificacion manual como unico criterio"). Aca corre el
// pipeline real con `--claude-home` y se afirma sobre el JSON.parse de la
// salida, con el fixture del payload real del 2026-08-06 ($21.36/$20.00).
// ---------------------------------------------------------------------------

function configConExtraAlPayloadReal() {
  return {
    cachedUsageUtilization: {
      fetchedAtMs: Date.now(),
      utilization: {
        five_hour: { utilization: 10, resets_at: null },
        seven_day: { utilization: 10, resets_at: null },
        extra_usage: {
          is_enabled: false,
          monthly_limit: 2000,
          used_credits: 2136,
          utilization: 100,
          disabled_reason: 'org_level_disabled_until',
          spend_limit_reached: true,
        },
      },
    },
  }
}

test('monitor --once --json: con un registro abierto de mas de 24h, historico trae el extra archivado', async () => {
  const home = mkClaudeHome({ config: configConExtraAlPayloadReal() })

  const detectadoEn = Date.now() - 25 * 60 * 60_000
  fs.mkdirSync(path.join(home, 'souclaude'), { recursive: true })
  fs.writeFileSync(
    path.join(home, 'souclaude', 'usage-history.json'),
    JSON.stringify({
      abierto: { detectadoEn, usado: 21.36, limite: 20, moneda: 'USD', cerradoEn: null },
      archivados: [],
    }),
    'utf8',
  )

  const { code, salida } = await correrJsonEnProceso({
    once: true,
    json: true,
    'no-refresh': true,
    'claude-home': home,
  })

  // El extra ya paso a historico: no participa de la alarma del header ni del
  // codigo de salida (RF-05) -- por eso 0 y no 2, aunque spend_limit_reached
  // siga en true en el payload crudo.
  assert.equal(code, 0, 'un extra ya historico no debe disparar el codigo de alarma por limite')
  const vista = JSON.parse(salida)

  assert.deepEqual(vista.historico, [{ usado: 21.36, limite: 20, moneda: 'USD', detectadoEn }])
  assert.equal(vista.limites.gastoExtra.historico, true)
})

test('monitor --once --json: sin ningun registro de gasto extra en disco, historico es []', async () => {
  const home = mkClaudeHome({
    proyectos: { p1: { 'sess-1.jsonl': [lineaAssistant({ entrada: 10, salida: 5 })] } },
  })

  const { code, salida } = await correrJsonEnProceso({ once: true, json: true, 'claude-home': home })

  assert.equal(code, 0)
  const vista = JSON.parse(salida)
  assert.deepEqual(vista.historico, [])
})
