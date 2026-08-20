import fs from 'node:fs'
import path from 'node:path'
import { CARPETA_USAGE, VERSION_REGISTRO } from './vault-usage-db.js'

// Lee el registro de consumo por sesion que las maquinas del equipo publican
// en <vault>/00-System/monitor/usage/*.jsonl (ver vault-usage-db.js y el ADR
// 20260820). Este adaptador NO agrega ni deduplica: entrega los registros
// crudos + avisos, y es el dominio (usage-agregado.agregarUsage) quien
// consolida. Mismo reparto de responsabilidades que vault-accounts-reader.
//
// Lectura tolerante linea a linea: una linea corrupta o de version
// desconocida genera un aviso y no tumba el resto del archivo — el registro
// es compartido y un merge a mano imperfecto no puede dejar ciega la consulta.

/**
 * Todos los registros del working tree local del Vault. Nunca lanza.
 * @returns {{registros: object[], warnings: object[]}}
 */
export function leerRegistrosDeUsage(vaultPath) {
  if (!vaultPath) return { registros: [], warnings: [] }
  const carpeta = path.join(vaultPath, ...CARPETA_USAGE.split('/'))

  let nombres
  try {
    nombres = fs.readdirSync(carpeta).filter((n) => n.endsWith('.jsonl'))
  } catch {
    // Sin carpeta no hay registro todavia: equipo que aun no publica.
    return { registros: [], warnings: [] }
  }

  const registros = []
  const warnings = []
  for (const nombre of nombres.sort()) {
    const ruta = path.join(carpeta, nombre)
    let texto
    try {
      texto = fs.readFileSync(ruta, 'utf8')
    } catch {
      warnings.push({ file: ruta, reason: 'archivo de usage ilegible: se ignora' })
      continue
    }

    const lineas = texto.split('\n')
    for (let i = 0; i < lineas.length; i++) {
      const linea = lineas[i].trim()
      if (linea === '') continue
      let registro
      try {
        registro = JSON.parse(linea)
      } catch {
        warnings.push({ file: ruta, reason: `linea ${i + 1} corrupta: se ignora` })
        continue
      }
      if (registro?.version !== VERSION_REGISTRO) {
        warnings.push({
          file: ruta,
          reason: `linea ${i + 1} version ${registro?.version ?? '?'}: este monitor solo entiende v${VERSION_REGISTRO}`,
        })
        continue
      }
      if (typeof registro?.sessionId !== 'string' || registro.sessionId === '') {
        warnings.push({ file: ruta, reason: `linea ${i + 1} sin sessionId: se ignora` })
        continue
      }
      registros.push(registro)
    }
  }
  return { registros, warnings }
}
