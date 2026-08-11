import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { construirLinea, emitirLinea } from '../src/monitor/adapters/router-log-writer.js'

// Este archivo responde: "las lineas del router log llevan la atribucion de
// cuenta/maquina de RF-02, y la idempotencia (task, fuente.agentId) sigue
// intacta?". Vista minima armada a mano; timestamps fijos.

const CONSUMO = {
  entrada: 100,
  salida: 50,
  cacheCreacion: 10,
  cacheLectura: 40,
  llamadas: 3,
  costoUsd: 0.5,
  sinPrecio: 0,
}

function vistaConAgente({ cuenta = null } = {}) {
  return {
    cuenta,
    proyectos: [
      {
        sesiones: [
          {
            sessionId: 'ses-1',
            consumo: CONSUMO,
            agentes: [{ agentId: 'ag-1', alias: 'sonnet', effort: 'medium', consumo: CONSUMO }],
          },
        ],
      },
    ],
  }
}

const BASE = { hito: 'SHS-H3', task: 'SHS-H3-T204', resultado: 'approved', agentId: 'ag-1', ahora: 1_754_800_000_000 }

test('router: la linea lleva cuenta, cuenta_uuid y maquina desde vista.cuenta', () => {
  const vista = vistaConAgente({
    cuenta: { accountUuid: 'uuid-a', alias: 'dev', email: 'dev@soutec-group.com', organizacion: null, machineID: 'm-1' },
  })
  const linea = construirLinea(vista, BASE)
  assert.equal(linea.cuenta, 'dev')
  assert.equal(linea.cuenta_uuid, 'uuid-a')
  assert.equal(linea.maquina, 'm-1')
  // tokens_in = entrada + cacheCreacion + cacheLectura = 100 + 10 + 40 = 150
  assert.equal(linea.tokens_in, 150)
  assert.equal(linea.medicion, 'medido')
})

test('router: sin identidad los tres campos van en null (compatibilidad hacia atras)', () => {
  const linea = construirLinea(vistaConAgente(), BASE)
  assert.equal(linea.cuenta, null)
  assert.equal(linea.cuenta_uuid, null)
  assert.equal(linea.maquina, null)
})

test('router: la idempotencia por (task, fuente.agentId) no cambia con los campos nuevos', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'souclaude-router-'))
  const ruta = path.join(dir, 'model-router.jsonl')
  const linea = construirLinea(vistaConAgente({ cuenta: { accountUuid: 'uuid-a', alias: 'dev' } }), BASE)

  const r1 = await emitirLinea(ruta, linea)
  assert.equal(r1.escrita, true)

  // Misma tupla, distinta cuenta: sigue siendo duplicada — la cuenta no
  // participa de la clave de idempotencia.
  const otra = construirLinea(vistaConAgente({ cuenta: { accountUuid: 'uuid-b', alias: 'dev2' } }), BASE)
  const r2 = await emitirLinea(ruta, otra)
  assert.equal(r2.escrita, false)

  const contenido = fs.readFileSync(ruta, 'utf8').trim().split('\n')
  assert.equal(contenido.length, 1)
  assert.equal(JSON.parse(contenido[0]).cuenta_uuid, 'uuid-a')
})
