import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

import { createTailer } from '../src/monitor/adapters/jsonl-tailer.js'
import { mkClaudeHome, lineaAssistant, lineaTitulo, lineaCierre, appendLineas, escribirParcial } from './helpers-monitor.js'

// Este archivo responde: ¿el tailer incremental de jsonl-tailer.js lee cada
// linea EXACTAMENTE una vez, incluso cuando Claude Code esta escribiendo el
// archivo a la vez que lo leemos? Los tres modos de fallar -perder una linea,
// contarla dos veces, o corromper todo lo posterior tras un truncado- tienen
// cada uno su caso acá. En produccion el sintoma de una falla no es una
// excepcion: es un numero mal, asi que estos tests son la unica defensa real.

// Arma la entrada de indice que readNew espera, con la misma forma que
// produce claude-home.js (path, kind, slug, sessionId, agentId).
function entryFor(home, slug, rel, extra = {}) {
  return {
    path: path.join(home, 'projects', slug, ...rel.split('/')),
    kind: 'session',
    slug,
    sessionId: 'sess-test',
    agentId: null,
    ...extra,
  }
}

test('primer readNew de un archivo con 3 lineas devuelve 3 eventos', async () => {
  const home = mkClaudeHome({
    proyectos: {
      proy: {
        'sess.jsonl': [lineaAssistant({ id: 'a' }), lineaAssistant({ id: 'b' }), lineaAssistant({ id: 'c' })],
      },
    },
  })
  const tailer = createTailer()
  const file = entryFor(home, 'proy', 'sess.jsonl')

  const res = await tailer.readNew(file)
  assert.equal(res.events.length, 3)
})

test('segundo readNew sin cambios devuelve 0 eventos y no reabre el archivo', async () => {
  const home = mkClaudeHome({
    proyectos: { proy: { 'sess.jsonl': [lineaAssistant({ id: 'a' }), lineaAssistant({ id: 'b' })] } },
  })
  const tailer = createTailer()
  const file = entryFor(home, 'proy', 'sess.jsonl')

  await tailer.readNew(file)
  const bytesTrasPrimeraLectura = tailer.stats().bytesLeidos
  const estadoAntes = { ...tailer.state(file.path) }

  const res = await tailer.readNew(file)

  assert.equal(res.events.length, 0)
  // Si el archivo se hubiera reabierto, bytesLeidos habria crecido (aunque
  // fuera en 0 lineas nuevas): el tailer corta ANTES de crear el stream
  // cuando size === offset, asi que el contador queda exactamente igual.
  assert.equal(tailer.stats().bytesLeidos, bytesTrasPrimeraLectura)
  const estadoDespues = tailer.state(file.path)
  assert.equal(estadoDespues.offset, estadoAntes.offset)
  assert.equal(estadoDespues.rest, estadoAntes.rest)
})

test('tras appendLineas con 2 lineas, el siguiente readNew devuelve exactamente 2 (no 5)', async () => {
  const home = mkClaudeHome({
    proyectos: { proy: { 'sess.jsonl': [lineaAssistant({ id: 'a' }), lineaAssistant({ id: 'b' }), lineaAssistant({ id: 'c' })] } },
  })
  const tailer = createTailer()
  const file = entryFor(home, 'proy', 'sess.jsonl')

  await tailer.readNew(file)
  appendLineas(home, 'projects/proy/sess.jsonl', [lineaAssistant({ id: 'd' }), lineaAssistant({ id: 'e' })])

  const res = await tailer.readNew(file)
  assert.equal(res.events.length, 2)
})

test('linea partida sin \\n: readNew devuelve 0 eventos y el resto queda pendiente en el estado', async () => {
  const home = mkClaudeHome({ proyectos: { proy: {} } })
  const tailer = createTailer()
  const rel = 'sess.jsonl'
  const file = entryFor(home, 'proy', rel)

  const textoPartido = lineaAssistant({ id: 'partida' }) // sin \n final: a medio escribir
  escribirParcial(home, `projects/proy/${rel}`, textoPartido)

  const res = await tailer.readNew(file)
  assert.equal(res.events.length, 0, 'una linea a medio escribir no debe emitirse')
  assert.equal(tailer.state(file.path).rest, textoPartido, 'el texto pendiente debe quedar en rest')
})

test('completar la linea partida: el siguiente readNew devuelve exactamente 1 (nunca 0 ni 2)', async () => {
  const home = mkClaudeHome({ proyectos: { proy: {} } })
  const tailer = createTailer()
  const rel = 'sess.jsonl'
  const file = entryFor(home, 'proy', rel)

  const linea = lineaAssistant({ id: 'partida' })
  escribirParcial(home, `projects/proy/${rel}`, linea)
  await tailer.readNew(file) // 0 eventos, queda pendiente

  escribirParcial(home, `projects/proy/${rel}`, '\n') // completa la linea

  const res = await tailer.readNew(file)
  // Nunca 0 (se perderia el evento) ni 2 (se contaria doble): exactamente 1.
  assert.equal(res.events.length, 1)
})

test('truncado: size < offset resetea el estado y el siguiente readNew ve solo la linea sobreviviente', async () => {
  const home = mkClaudeHome({
    proyectos: {
      proy: {
        'sess.jsonl': [
          lineaAssistant({ id: 'a' }),
          lineaAssistant({ id: 'b' }),
          lineaAssistant({ id: 'c' }),
          lineaAssistant({ id: 'd' }),
        ],
      },
    },
  })
  const tailer = createTailer()
  const file = entryFor(home, 'proy', 'sess.jsonl')

  const primero = await tailer.readNew(file)
  assert.equal(primero.events.length, 4)

  // Rotacion/truncado: el archivo queda con una sola linea, mas chico que el offset leido.
  const abs = file.path
  fs.writeFileSync(abs, `${lineaAssistant({ id: 'sobreviviente' })}\n`, 'utf8')

  const trasTruncado = await tailer.readNew(file)
  assert.equal(trasTruncado.events.length, 1, 'debe detectar size < offset, resetear y leer la unica linea')

  // El conteo posterior sigue siendo correcto: agregar otra linea da exactamente 1 mas.
  appendLineas(home, 'projects/proy/sess.jsonl', [lineaAssistant({ id: 'otra' })])
  const trasOtraLinea = await tailer.readNew(file)
  assert.equal(trasOtraLinea.events.length, 1)
})

test('dos lineas con el mismo message.id en el mismo archivo emiten 1 solo evento', async () => {
  const home = mkClaudeHome({
    proyectos: { proy: { 'sess.jsonl': [lineaAssistant({ id: 'dup' }), lineaAssistant({ id: 'dup' })] } },
  })
  const tailer = createTailer()
  const file = entryFor(home, 'proy', 'sess.jsonl')

  const res = await tailer.readNew(file)
  assert.equal(res.events.length, 1)
})

test('la deduplicacion es POR ARCHIVO: dos archivos distintos con el mismo message.id emiten uno cada uno', async () => {
  const home = mkClaudeHome({
    proyectos: {
      proy: {
        'sess-uno.jsonl': [lineaAssistant({ id: 'compartido' })],
        'sess-dos.jsonl': [lineaAssistant({ id: 'compartido' })],
      },
    },
  })
  const tailer = createTailer()
  const fileUno = entryFor(home, 'proy', 'sess-uno.jsonl')
  const fileDos = entryFor(home, 'proy', 'sess-dos.jsonl')

  const resUno = await tailer.readNew(fileUno)
  const resDos = await tailer.readNew(fileDos)

  assert.equal(resUno.events.length, 1)
  assert.equal(resDos.events.length, 1)
})

test('una linea ai-title sale en titles, no en events', async () => {
  const home = mkClaudeHome({
    proyectos: { proy: { 'sess.jsonl': [lineaTitulo({ titulo: 'Un titulo' })] } },
  })
  const tailer = createTailer()
  const file = entryFor(home, 'proy', 'sess.jsonl')

  const res = await tailer.readNew(file)
  assert.equal(res.events.length, 0)
  assert.equal(res.titles.length, 1)
  assert.equal(res.titles[0].titulo, 'Un titulo')
})

test('una linea user con toolUseResult sale en closures', async () => {
  const home = mkClaudeHome({
    proyectos: { proy: { 'sess.jsonl': [lineaCierre({ agentId: 'ag-1' })] } },
  })
  const tailer = createTailer()
  const file = entryFor(home, 'proy', 'sess.jsonl')

  const res = await tailer.readNew(file)
  assert.equal(res.events.length, 0)
  assert.equal(res.closures.length, 1)
  assert.equal(res.closures[0].agentId, 'ag-1')
})

test('una linea assistant con isApiErrorMessage:true no sale en ningun lado', async () => {
  const home = mkClaudeHome({
    proyectos: { proy: { 'sess.jsonl': [lineaAssistant({ id: 'err', apiError: true })] } },
  })
  const tailer = createTailer()
  const file = entryFor(home, 'proy', 'sess.jsonl')

  const res = await tailer.readNew(file)
  assert.equal(res.events.length, 0)
  assert.equal(res.titles.length, 0)
  assert.equal(res.closures.length, 0)
})

test('lineas vacias y JSON corrupto se saltan sin lanzar', async () => {
  const home = mkClaudeHome({ proyectos: { proy: {} } })
  const rel = 'projects/proy/sess.jsonl'
  appendLineas(home, rel, [
    '',
    '{"type":"assistant","usage": esto no es json valido',
    lineaAssistant({ id: 'valida' }),
    '',
  ])
  const tailer = createTailer()
  const file = entryFor(home, 'proy', 'sess.jsonl')

  const res = await tailer.readNew(file)
  assert.equal(res.events.length, 1, 'solo la linea valida cuenta; las corruptas/vacias se saltan sin excepcion')
})

test('archivo inexistente: readNew devuelve un warning con esa ruta y no lanza', async () => {
  const home = mkClaudeHome({ proyectos: { proy: {} } })
  const tailer = createTailer()
  const fantasma = entryFor(home, 'proy', 'no-existe.jsonl')

  const res = await tailer.readNew(fantasma)
  assert.equal(res.events.length, 0)
  assert.equal(res.warnings.length, 1)
  assert.equal(res.warnings[0].file, fantasma.path)
})

test('stats() refleja archivos, claves de dedup y bytes leidos', async () => {
  const home = mkClaudeHome({
    proyectos: {
      proy: {
        'sess-uno.jsonl': [lineaAssistant({ id: 'u1' }), lineaAssistant({ id: 'u2' })],
        'sess-dos.jsonl': [lineaAssistant({ id: 'd1' })],
      },
    },
  })
  const tailer = createTailer()
  const fileUno = entryFor(home, 'proy', 'sess-uno.jsonl')
  const fileDos = entryFor(home, 'proy', 'sess-dos.jsonl')

  await tailer.readNew(fileUno)
  await tailer.readNew(fileDos)

  const stats = tailer.stats()
  assert.equal(stats.archivos, 2)
  assert.equal(stats.clavesDedup, 3)
  assert.ok(stats.bytesLeidos > 0)
})

test('purgeOlderThan libera claves y devuelve cuantas se liberaron', async () => {
  const home = mkClaudeHome({
    proyectos: {
      proy: {
        'sess.jsonl': [
          lineaAssistant({ id: 'vieja', ts: 1000 }),
          lineaAssistant({ id: 'nueva', ts: 5_000_000_000_000 }),
        ],
      },
    },
  })
  const tailer = createTailer()
  const file = entryFor(home, 'proy', 'sess.jsonl')
  await tailer.readNew(file)

  assert.equal(tailer.stats().clavesDedup, 2)

  const liberadas = tailer.purgeOlderThan(2_000_000_000_000)
  assert.equal(liberadas, 1, 'solo la clave vieja debe purgarse')
  assert.equal(tailer.stats().clavesDedup, 1)
})

test('reset(path) borra el estado y fuerza una relectura completa', async () => {
  const home = mkClaudeHome({
    proyectos: { proy: { 'sess.jsonl': [lineaAssistant({ id: 'a' }), lineaAssistant({ id: 'b' })] } },
  })
  const tailer = createTailer()
  const file = entryFor(home, 'proy', 'sess.jsonl')

  await tailer.readNew(file)
  assert.ok(tailer.state(file.path) !== null)

  const borrado = tailer.reset(file.path)
  assert.equal(borrado, true)
  assert.equal(tailer.state(file.path), null)

  // Al releer desde cero, las mismas 2 lineas se vuelven a contar (relectura completa).
  const res = await tailer.readNew(file)
  assert.equal(res.events.length, 2)
})
