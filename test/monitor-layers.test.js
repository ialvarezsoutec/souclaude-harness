import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

// Enforcement de P2 (docs/constitution.md): "adapters -> application -> domain",
// nunca al reves, y el dominio jamas importa frameworks. La constitucion nombra
// dependency-cruiser como herramienta de referencia, pero sumar esa dependencia
// exige pasar primero por el framework de 7 criterios de ccem-research. Para esta
// regla concreta -- "que especificador aparece en un import" -- un regex sobre el
// texto fuente alcanza y no requiere resolver el grafo de modulos ni instalar nada.
// Es un atajo deliberado, no un descuido: si el dominio crece y necesita reglas mas
// finas (ciclos, imports condicionales, etc.), ahi si corresponde evaluar
// dependency-cruiser con ccem-research. Mientras tanto, aflojar este test (agrandar
// los prefijos permitidos, sacar un archivo de la lista, comentar una asercion) es
// exactamente el tipo de cambio que P2 prohibe: "modificar la config del enforcement
// para que un check pase es hacer trampa: se corrige el codigo, no la regla".
const REPO_ROOT = fileURLToPath(new URL('..', import.meta.url))
const DOMAIN_DIR = path.join(REPO_ROOT, 'src', 'monitor', 'domain')
const APPLICATION_DIR = path.join(REPO_ROOT, 'src', 'monitor', 'application')

function jsFilesIn(dir) {
  return fs
    .readdirSync(dir)
    .filter((name) => name.endsWith('.js'))
    .sort()
}

// Extrae los especificadores de: import ... from '...', export ... from '...'
// e import('...') dinamico. No usa un parser AST a proposito (ver comentario de
// cabecera) -- alcanza con las tres formas que el proyecto usa en la practica.
function extraerImports(codigo) {
  const specs = []
  const reEstatico = /(?:^|\n)\s*(?:import|export)\s[^;\n]*?\bfrom\s*['"]([^'"]+)['"]/g
  const reDinamico = /\bimport\(\s*['"]([^'"]+)['"]\s*\)/g
  for (const m of codigo.matchAll(reEstatico)) specs.push(m[1])
  for (const m of codigo.matchAll(reDinamico)) specs.push(m[1])
  return specs
}

// Quita los comentarios de linea (//...) antes de buscar Date.now()/Math.random()/etc,
// para no marcar como violacion una mencion dentro de un comentario (varios archivos
// del dominio documentan la regla citando el propio codigo prohibido).
function sinComentariosDeLinea(codigo) {
  return codigo
    .split('\n')
    .map((linea) => linea.replace(/\/\/.*$/, ''))
    .join('\n')
}

test('layers: src/monitor/domain existe y tiene al menos 5 archivos', () => {
  assert.ok(fs.existsSync(DOMAIN_DIR), `No existe ${DOMAIN_DIR}`)
  const archivos = jsFilesIn(DOMAIN_DIR)
  // Si esta lista llega a 0 (carpeta movida o renombrada) los tests de abajo
  // pasarian en verde sin verificar nada -- el peor modo de fallo de un test
  // de enforcement. Este assert es la salvaguarda contra ese escenario.
  assert.ok(
    archivos.length >= 5,
    `src/monitor/domain deberia tener al menos 5 archivos .js, tiene ${archivos.length}: ${archivos.join(', ')}`
  )
})

test('layers: el dominio solo importa de si mismo (todo especificador empieza con ./)', () => {
  const violaciones = []
  for (const archivo of jsFilesIn(DOMAIN_DIR)) {
    const ruta = path.join(DOMAIN_DIR, archivo)
    const codigo = fs.readFileSync(ruta, 'utf8')
    for (const spec of extraerImports(codigo)) {
      if (!spec.startsWith('./')) violaciones.push(`${archivo}: import '${spec}'`)
    }
  }
  assert.deepEqual(
    violaciones,
    [],
    `El dominio (src/monitor/domain) no puede importar nodos builtin (node:*), ` +
      `paquetes de npm, ni ../adapters/ ni ../application/ -- solo especificadores ` +
      `relativos dentro de si mismo (./...). Violaciones encontradas:\n${violaciones.join('\n')}`
  )
})

test('layers: el dominio no usa el reloj ni el entorno (Date.now, new Date() sin argumento, Math.random, process)', () => {
  const violaciones = []
  // new Date(algo) es valido (ventanas.js lo usa para alinear buckets a un
  // instante que le llega por parametro); new Date() sin argumento no lo es.
  const patrones = [
    { nombre: 'Date.now(', re: /Date\.now\(/g },
    { nombre: 'new Date() sin argumento', re: /new Date\(\s*\)/g },
    { nombre: 'Math.random(', re: /Math\.random\(/g },
    { nombre: 'process.', re: /\bprocess\./g },
  ]
  for (const archivo of jsFilesIn(DOMAIN_DIR)) {
    const ruta = path.join(DOMAIN_DIR, archivo)
    const codigo = sinComentariosDeLinea(fs.readFileSync(ruta, 'utf8'))
    for (const { nombre, re } of patrones) {
      if (re.test(codigo)) violaciones.push(`${archivo}: usa ${nombre}`)
    }
  }
  assert.deepEqual(
    violaciones,
    [],
    `El dominio es determinista: el instante y las senales de entorno entran por ` +
      `parametro, nunca se leen del reloj o del proceso. Violaciones encontradas:\n${violaciones.join('\n')}`
  )
})

test('layers: la aplicacion (si existe) no importa adaptadores', () => {
  if (!fs.existsSync(APPLICATION_DIR)) {
    // Todavia no existe src/monitor/application -- nada que verificar. Cuando
    // se cree, este test empieza a correr sin cambios (descubre los archivos).
    return
  }
  const violaciones = []
  for (const archivo of jsFilesIn(APPLICATION_DIR)) {
    const ruta = path.join(APPLICATION_DIR, archivo)
    const codigo = fs.readFileSync(ruta, 'utf8')
    for (const spec of extraerImports(codigo)) {
      if (spec.startsWith('../adapters/') || spec.includes('/adapters/')) {
        violaciones.push(`${archivo}: import '${spec}'`)
      }
    }
  }
  assert.deepEqual(
    violaciones,
    [],
    `application/ puede importar de ../domain/ y de ./, pero nunca de ../adapters/ -- ` +
      `la dependencia solo va en un sentido (adapters -> application -> domain). ` +
      `Violaciones encontradas:\n${violaciones.join('\n')}`
  )
})
