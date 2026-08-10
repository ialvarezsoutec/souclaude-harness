import { test } from 'node:test'
import assert from 'node:assert/strict'

import { detectCaps } from '../src/monitor/adapters/caps.js'
import { anchoVisual } from '../src/monitor/domain/formato.js'
import { construirVista } from '../src/monitor/domain/arbol.js'
import { presentar } from '../src/monitor/adapters/panel-presenter.js'

// Este archivo responde: "renderPanel() cumple SIEMPRE su contrato duro de ancho
// (cada linea mide exactamente `cols`, el array nunca supera `rows`) sin importar
// el modo, el tamano de terminal, si hay unicode, y sin importar que tan sucios o
// extremos sean los datos de la VistaMonitor?".
//
// String.length NO sirve para medir esto: cuenta los escapes ANSI que la terminal
// no dibuja y cuenta CJK como 1 celda cuando ocupa 2. El instrumento de medicion
// es anchoVisual() (src/monitor/domain/formato.js), el mismo que usa el propio
// panel-layout.js para su red de seguridad interna.
//
// FORCE_COLOR se fija ANTES de importar panel-layout.js (dinamicamente, porque
// las declaraciones import estáticas se resuelven antes que cualquier otra
// linea del modulo) para que picocolors quede con color habilitado durante toda
// la corrida, incluso en una CI que no sea win32 ni TTY. Los tests que necesitan
// "sin ANSI" pasan `color: false` explicito, que gana siempre sobre pc.isColorSupported.
process.env.FORCE_COLOR = '1'
const { renderPanel } = await import('../src/monitor/adapters/panel-layout.js')

// ---------------------------------------------------------------------------
// fixtures
// ---------------------------------------------------------------------------

const AHORA = Date.UTC(2026, 7, 4, 12, 0, 0)

function limite(overrides = {}) {
  return {
    etiqueta: 'sesion',
    modelo: 'opus',
    porcentaje: 42,
    reset: 'cada 5h',
    reseteaEn: null,
    ...overrides,
  }
}

function agenteFila(overrides = {}) {
  return {
    nombre: 'implementer',
    proyecto: 'souclaude',
    modelo: 'opus',
    tokens: 12000,
    duracionMs: 65000,
    tools: 4,
    sesionId: 'ab12',
    sesionTitulo: 'Implementando T24',
    estado: 'corriendo',
    finEn: null,
    ...overrides,
  }
}

function sesionFila(overrides = {}) {
  return {
    id: 'ab12',
    titulo: 'Tests de render del panel',
    proyecto: 'souclaude',
    rama: 'feature/SHS-H3-monitor-tokens',
    modelo: 'opus',
    tokens: 45210,
    costoUsd: 1.32,
    ultimaActividad: AHORA - 30000,
    ...overrides,
  }
}

function proyectoFila(overrides = {}) {
  return {
    nombre: 'souclaude',
    sesiones: 3,
    tokens: 90000,
    costoUsd: 2.5,
    ...overrides,
  }
}

function modeloFila(overrides = {}) {
  return { nombre: 'opus', tokens: 60000, costoUsd: 2.0, ...overrides }
}

// VistaMonitor realista: pobla todas las secciones documentadas en el
// @typedef VistaMonitor de panel-layout.js. `overrides` reemplaza claves de
// primer nivel enteras (no hace merge profundo) -- alcanza para los casos de
// este archivo y evita sorpresas de fusion parcial de arrays.
function vistaEjemplo(overrides = {}) {
  const base = {
    ahora: AHORA,
    actualizadoEn: AHORA - 4000,
    limites: [
      limite({ etiqueta: 'sesion', modelo: 'opus', porcentaje: 42, reset: 'cada 5h' }),
      limite({
        etiqueta: 'semanal',
        modelo: 'sonnet',
        porcentaje: 18,
        reset: 'lunes',
        reseteaEn: AHORA + 3 * 86_400_000,
      }),
    ],
    agentes: {
      corriendo: 2,
      terminados: 1,
      filas: [
        agenteFila({ nombre: 'implementer', estado: 'corriendo', tokens: 12000, sesionId: 'ab12' }),
        agenteFila({
          nombre: 'reviewer',
          estado: 'en_duda',
          tokens: 4000,
          sesionId: 'cd34',
          sesionTitulo: 'Revisando PR',
        }),
        agenteFila({
          nombre: 'spec-author',
          estado: 'terminado',
          tokens: 2000,
          finEn: AHORA - 60000,
          sesionId: 'ef56',
          sesionTitulo: 'Spec de rocas',
        }),
      ],
    },
    consumo: {
      etiquetaVentana: 'ultimas 24h',
      unidad: 'tokens/h',
      serie: [10, 40, 90, 30, 60, 120, 80, 20, 50, 70, 15, 95],
      picoValor: 120,
      picoEtiqueta: '10:00',
      totalTokens: 152000,
      costoUsd: 4.72,
    },
    desglose: { entrada: 20000, salida: 8000, cacheCreacion: 15000, cacheLectura: 109000 },
    modelos: [
      modeloFila({ nombre: 'opus', tokens: 100000, costoUsd: 3.5 }),
      modeloFila({ nombre: 'sonnet', tokens: 52000, costoUsd: 1.22 }),
    ],
    sesiones: {
      total: 3,
      vivas: 2,
      filas: [
        sesionFila({ id: 'ab12', titulo: 'Tests de render del panel' }),
        sesionFila({ id: 'cd34', titulo: 'Revisando PR', tokens: 30000, costoUsd: 0.9 }),
        sesionFila({ id: 'ef56', titulo: 'Spec de rocas', tokens: 15000, costoUsd: 0.4 }),
      ],
    },
    proyectos: {
      total: 2,
      totalTokens: 152000,
      filas: [
        proyectoFila({ nombre: 'souclaude', sesiones: 3, tokens: 90000, costoUsd: 2.9 }),
        proyectoFila({ nombre: 'otro-repo', sesiones: 2, tokens: 62000, costoUsd: 1.82 }),
      ],
      otros: null,
    },
    recortes: { sesiones: 0, proyectos: 0, agentes: 0 },
    avisos: [],
  }
  return { ...base, ...overrides }
}

// Verifica el contrato duro: cada linea mide exactamente `cols` (anchoVisual) y
// el array nunca supera `rows`. El mensaje de fallo incluye indice, ancho real
// y contenido -- sin eso, un fallo de alineacion es indiagnosticable.
function verificarContrato(lineas, cols, rows, contexto) {
  assert.ok(
    Array.isArray(lineas) && lineas.length <= rows,
    `[${contexto}] el panel devolvio ${lineas?.length} lineas, excede rows=${rows}`
  )
  lineas.forEach((linea, i) => {
    const w = anchoVisual(linea)
    assert.equal(
      w,
      cols,
      `[${contexto}] linea ${i} mide ${w} (esperaba ${cols}). Contenido: ${JSON.stringify(linea)}`
    )
  })
}

function sinAnsi(lineas, contexto) {
  lineas.forEach((linea, i) => {
    assert.ok(
      !linea.includes('\x1b'),
      `[${contexto}] linea ${i} tiene un escape ANSI pese a color:false: ${JSON.stringify(linea)}`
    )
  })
}

// ---------------------------------------------------------------------------
// El contrato de ancho -- la matriz completa
// ---------------------------------------------------------------------------

const VISTA_MATRIZ = vistaEjemplo()

for (const cols of [120, 100, 80, 72, 60]) {
  for (const rows of [40, 24, 12]) {
    for (const modo of ['full', 'compact', 'agents']) {
      for (const unicode of [true, false]) {
        test(`contrato de ancho: cols=${cols} rows=${rows} modo=${modo} unicode=${unicode}`, () => {
          const contexto = `cols=${cols} rows=${rows} modo=${modo} unicode=${unicode}`
          const caps = detectCaps({ overrides: { unicode, color: false, tty: true } })
          const lineas = renderPanel(VISTA_MATRIZ, { cols, rows, modo, caps, color: false })
          verificarContrato(lineas, cols, rows, contexto)
          sinAnsi(lineas, contexto)
        })
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Robustez -- el panel degrada, no explota
// ---------------------------------------------------------------------------

test('robustez: VistaMonitor vacia (maquina recien instalada) renderiza sin lanzar y cumple el ancho', () => {
  const vistaVacia = {
    ahora: AHORA,
    limites: null,
    agentes: { filas: [] },
    consumo: {},
    desglose: {},
    modelos: [],
    sesiones: { filas: [] },
    proyectos: { filas: [] },
    recortes: {},
    avisos: [],
  }
  for (const modo of ['full', 'compact', 'agents']) {
    for (const cols of [120, 80, 60]) {
      const caps = detectCaps({ overrides: { unicode: true, color: false } })
      assert.doesNotThrow(() => {
        const lineas = renderPanel(vistaVacia, { cols, rows: 24, modo, caps, color: false })
        verificarContrato(lineas, cols, 24, `vacio modo=${modo} cols=${cols}`)
      }, `vista vacia no deberia lanzar (modo=${modo} cols=${cols})`)
    }
  }
})

test('robustez: campos null/undefined en titulo de sesion, rama y nombre de proyecto no rompen el ancho', () => {
  const vista = vistaEjemplo({
    sesiones: {
      total: 2,
      vivas: 1,
      filas: [
        sesionFila({ titulo: null, rama: undefined, proyecto: null }),
        sesionFila({ id: 'zz99', titulo: undefined, rama: null, proyecto: undefined, modelo: null }),
      ],
    },
    agentes: {
      corriendo: 1,
      terminados: 0,
      filas: [agenteFila({ nombre: null, proyecto: undefined, sesionTitulo: null })],
    },
    proyectos: { total: 1, totalTokens: 0, filas: [proyectoFila({ nombre: null })], otros: null },
  })
  for (const modo of ['full', 'compact', 'agents']) {
    const caps = detectCaps({ overrides: { unicode: true, color: false } })
    const lineas = renderPanel(vista, { cols: 100, rows: 30, modo, caps, color: false })
    verificarContrato(lineas, 100, 30, `campos null modo=${modo}`)
  }
})

test('robustez: un titulo de sesion con emoji, CJK y caracteres combinantes no desalinea la tabla', () => {
  // sanearCelda es exactamente el mecanismo que motiva este test: sin el, un
  // emoji (ancho ambiguo), un caracter CJK (ancho 2) o una marca combinante
  // (ancho 0) miden distinto de lo que String.length reporta y corren la fila.
  const raro = '\u{1F4CA} 日本語 é́ título combinante'
  const vista = vistaEjemplo({
    sesiones: { total: 1, vivas: 1, filas: [sesionFila({ titulo: raro })] },
  })
  for (const cols of [120, 80, 60]) {
    for (const unicode of [true, false]) {
      const caps = detectCaps({ overrides: { unicode, color: false } })
      const lineas = renderPanel(vista, { cols, rows: 24, modo: 'full', caps, color: false })
      verificarContrato(lineas, cols, 24, `titulo raro cols=${cols} unicode=${unicode}`)
    }
  }
})

test('robustez: un titulo absurdamente largo (300 caracteres) se trunca dentro del presupuesto', () => {
  const largo = 'x'.repeat(300)
  const vista = vistaEjemplo({
    sesiones: { total: 1, vivas: 1, filas: [sesionFila({ titulo: largo })] },
  })
  const caps = detectCaps({ overrides: { unicode: true, color: false } })
  const lineas = renderPanel(vista, { cols: 100, rows: 24, modo: 'full', caps, color: false })
  verificarContrato(lineas, 100, 24, 'titulo largo')
  for (const linea of lineas) {
    assert.ok(!linea.includes('x'.repeat(100)), `el titulo de 300 chars no deberia aparecer sin truncar: ${linea}`)
  }
})

test('robustez: numeros extremos (0, 1e12 tokens, costo 0) no desbordan sus columnas', () => {
  const vista = vistaEjemplo({
    agentes: {
      corriendo: 1,
      terminados: 0,
      filas: [agenteFila({ tokens: 1e12, duracionMs: 0, tools: 0 })],
    },
    sesiones: {
      total: 1,
      vivas: 1,
      filas: [sesionFila({ tokens: 0, costoUsd: 0 })],
    },
    modelos: [modeloFila({ tokens: 1e12, costoUsd: 0 })],
    proyectos: {
      total: 1,
      totalTokens: 1e12,
      filas: [proyectoFila({ tokens: 1e12, costoUsd: 0, sesiones: 0 })],
      otros: null,
    },
    consumo: { totalTokens: 1e12, costoUsd: 0, serie: [0, 0, 0], picoValor: 0 },
    desglose: { entrada: 0, salida: 0, cacheCreacion: 0, cacheLectura: 1e12 },
  })
  for (const modo of ['full', 'compact', 'agents']) {
    const caps = detectCaps({ overrides: { unicode: true, color: false } })
    const lineas = renderPanel(vista, { cols: 100, rows: 30, modo, caps, color: false })
    verificarContrato(lineas, 100, 30, `numeros extremos modo=${modo}`)
  }
})

// ---------------------------------------------------------------------------
// Contenido -- que muestre lo que dice mostrar
// ---------------------------------------------------------------------------

test('contenido: un limite al 91% muestra la marca !! y el titulo muta a incluir LIMITE', () => {
  const vista = vistaEjemplo({ limites: [limite({ etiqueta: 'sesion', modelo: 'opus', porcentaje: 91 })] })
  const caps = detectCaps({ overrides: { unicode: true, color: false } })
  const lineas = renderPanel(vista, { cols: 100, rows: 24, modo: 'full', caps, color: false })
  assert.ok(lineas[0].includes('LIMITE'), `el titulo (linea 0) deberia mutar a incluir LIMITE: ${lineas[0]}`)
  assert.ok(
    lineas.some((l) => l.includes('!!')),
    `deberia aparecer la marca no-cromatica "!!" en algun lugar del panel:\n${lineas.join('\n')}`
  )
})

test('contenido: vista.recortes.sesiones agrega una linea "y N mas" con el numero correcto', () => {
  const vista = vistaEjemplo({ recortes: { sesiones: 5, proyectos: 0, agentes: 0 } })
  const caps = detectCaps({ overrides: { unicode: true, color: false } })
  const lineas = renderPanel(vista, { cols: 120, rows: 40, modo: 'full', caps, color: false })
  assert.ok(
    lineas.some((l) => l.includes('y 5 sesiones mas')),
    `deberia haber una linea "y 5 sesiones mas" (3 filas mostradas + 5 recortadas aguas arriba):\n${lineas.join('\n')}`
  )
})

test('contenido: en modo agents aparecen todos los agentes activos, aunque sean muchos', () => {
  const filas = Array.from({ length: 20 }, (_, i) =>
    agenteFila({
      nombre: `ag${String(i).padStart(2, '0')}`,
      sesionId: `s${i}`,
      estado: 'corriendo',
      tokens: 100 * i,
    })
  )
  const vista = vistaEjemplo({ agentes: { corriendo: 20, terminados: 0, filas } })
  const caps = detectCaps({ overrides: { unicode: true, color: false } })
  const lineas = renderPanel(vista, { cols: 120, rows: 100, modo: 'agents', caps, color: false })
  const texto = lineas.join('\n')
  for (const a of filas) {
    assert.ok(texto.includes(a.nombre), `falta el agente "${a.nombre}" en el panel de modo agents`)
  }
})

test('contenido: el pie declara que los tokens son medidos y el costo estimado', () => {
  const caps = detectCaps({ overrides: { unicode: true, color: false } })
  for (const modo of ['full', 'compact']) {
    const lineas = renderPanel(vistaEjemplo(), { cols: 120, rows: 30, modo, caps, color: false })
    const texto = lineas.join('\n')
    assert.ok(texto.includes('tokens medidos'), `[${modo}] el pie deberia decir "tokens medidos":\n${texto}`)
    assert.ok(texto.includes('costo estimado'), `[${modo}] el pie deberia decir "costo estimado":\n${texto}`)
  }
})

test('contenido: con caps.unicode false no aparece ningun caracter fuera de ASCII', () => {
  const caps = detectCaps({ overrides: { unicode: false, color: false } })
  for (const modo of ['full', 'compact', 'agents']) {
    const lineas = renderPanel(vistaEjemplo(), { cols: 100, rows: 30, modo, caps, color: false })
    lineas.forEach((linea, i) => {
      assert.ok(
        !/[^\x00-\x7F]/.test(linea),
        `[modo=${modo}] linea ${i} tiene un caracter fuera de ASCII pese a unicode:false: ${JSON.stringify(linea)}`
      )
    })
  }
})

// ---------------------------------------------------------------------------
// Color -- se trunca sobre texto plano, se colorea despues
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Historico (SHS-H3-T105) -- un extra ya archivado no es alarma
// ---------------------------------------------------------------------------

test('contenido: la seccion Historico se pinta al pie sin disparar el titulo LIMITE', () => {
  const vista = vistaEjemplo({
    limites: [limite({ etiqueta: 'sesion', modelo: 'opus', porcentaje: 42 })],
    historico: ['Extra ago-2026  $21.36/$20.00  alcanzado 06-08'],
  })
  const caps = detectCaps({ overrides: { unicode: true, color: false } })
  const lineas = renderPanel(vista, { cols: 120, rows: 40, modo: 'full', caps, color: false })

  verificarContrato(lineas, 120, 40, 'historico')
  assert.ok(!lineas[0].includes('LIMITE'), `el titulo no deberia incluir LIMITE: ${lineas[0]}`)
  assert.ok(lineas.some((l) => l.includes('HISTORICO')), 'deberia aparecer la seccion HISTORICO')
  assert.ok(
    lineas.some((l) => l.includes('Extra ago-2026')),
    'deberia mostrar la linea del extra historico al pie'
  )
})

// snapshot minimo de dominio para ejercitar la regla de 24h de gasto-extra.js
// via el pipeline real (construirVista -> presentar), en vez de fixturear a
// mano el array `historico` de presentacion: con un unico limite al 42% (como
// hacia el test anterior) `limiteEnAlarma()` nunca dispara, y el test pasaba
// igual con la feature entera revertida. Aca el extra mismo esta al 100%, asi
// que es la unica fila que puede pintar el marco de rojo.
const AHORA_HISTORICO_COLOR = Date.UTC(2026, 7, 10, 12, 0, 0)

function snapshotConExtraAlcanzado(horasDesdeDeteccion) {
  const detectadoEn = AHORA_HISTORICO_COLOR - horasDesdeDeteccion * 60 * 60_000
  return {
    limites: {
      gastoExtra: {
        habilitado: false,
        usadoUsd: 21.36,
        limiteUsd: 20,
        porcentaje: 106.8,
        utilizacion: 100,
        motivoDeshabilitado: 'org_level_disabled_until',
        alcanzado: true,
      },
    },
    registroExtra: {
      abierto: { detectadoEn, usado: 21.36, limite: 20, moneda: 'USD', cerradoEn: null },
      archivados: [],
    },
  }
}

function proyeccionConExtra(horasDesdeDeteccion) {
  const vista = construirVista(snapshotConExtraAlcanzado(horasDesdeDeteccion), { ahora: AHORA_HISTORICO_COLOR })
  const proyeccion = presentar(vista, { ahora: AHORA_HISTORICO_COLOR })
  return { ...vistaEjemplo({ limites: proyeccion.limites, historico: proyeccion.historico }) }
}

test('color: un extra detectado hace 25h (historico) no pinta el marco de rojo (color real, no solo texto)', () => {
  const vista = proyeccionConExtra(25)
  const caps = detectCaps({ overrides: { unicode: true, color: true, tty: true } })
  const lineas = renderPanel(vista, { cols: 120, rows: 40, modo: 'full', caps, color: true })

  verificarContrato(lineas, 120, 40, 'historico color')
  assert.ok(!lineas[0].includes('LIMITE'), `el titulo no deberia mutar a LIMITE: ${lineas[0]}`)
  assert.ok(
    !lineas.some((l) => l.includes('\x1b[31m')),
    'ninguna linea del marco deberia llevar el codigo ANSI de rojo cuando lo unico critico es un extra ya historico'
  )
})

test('color: un extra detectado hace 1h (vivo, al 100%) SI pinta el marco de rojo', () => {
  const vista = proyeccionConExtra(1)
  const caps = detectCaps({ overrides: { unicode: true, color: true, tty: true } })
  const lineas = renderPanel(vista, { cols: 120, rows: 40, modo: 'full', caps, color: true })

  verificarContrato(lineas, 120, 40, 'extra vivo color')
  assert.ok(lineas[0].includes('LIMITE'), `el titulo deberia mostrar LIMITE con el extra vivo al 100%: ${lineas[0]}`)
  assert.ok(
    lineas.some((l) => l.includes('\x1b[31m')),
    'el marco deberia pintarse de rojo mientras el extra siga vivo (alarma activa)'
  )
})

test('color: con color:true y FORCE_COLOR=1 hay secuencias ANSI y los anchos siguen exactos', () => {
  const caps = detectCaps({ overrides: { unicode: true, color: true, tty: true } })
  const vista = vistaEjemplo({ limites: [limite({ etiqueta: 'sesion', modelo: 'opus', porcentaje: 91 })] })

  let huboAnsi = false
  for (const cols of [120, 80, 60]) {
    for (const modo of ['full', 'compact', 'agents']) {
      const lineas = renderPanel(vista, { cols, rows: 30, modo, caps, color: true })
      verificarContrato(lineas, cols, 30, `color cols=${cols} modo=${modo}`)
      if (lineas.some((l) => l.includes('\x1b'))) huboAnsi = true
    }
  }
  assert.ok(huboAnsi, 'con color:true y un limite en alarma deberia aparecer al menos una secuencia ANSI')
})
