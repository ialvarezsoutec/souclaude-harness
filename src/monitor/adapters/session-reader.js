import fs from 'node:fs'

import { listSessionFiles } from './claude-home.js'

// Este adaptador lee los archivos de ~/.claude/sessions/*.json y decide, pid
// a pid, cual proceso sigue vivo. Un archivo huerfano (proceso muerto que no
// limpio su json) es informacion util para el consumidor, no un error: se
// devuelve igual, marcado con procesoVivo: false.

// process.kill(pid, 0) no envia ninguna señal: solo pregunta si el proceso
// existe y si tenemos permiso para señalizarlo.
// - Sin excepcion: existe -> true.
// - ESRCH: no existe ningun proceso con ese pid -> false.
// - EPERM: existe, pero es de otro usuario (no podemos señalizarlo) -> true.
//   Devolver false en este caso es el error clasico: el proceso SI esta vivo.
// - Cualquier otro error, o un pid que no es numerico o es <= 0 -> false.
export function isPidAlive(pid) {
  if (typeof pid !== 'number' || !Number.isInteger(pid) || pid <= 0) return false
  try {
    process.kill(pid, 0)
    return true
  } catch (err) {
    if (err.code === 'EPERM') return true
    return false
  }
}

export async function readLiveSessions(paths) {
  const live = []
  const warnings = []

  const files = await listSessionFiles(paths)

  for (const file of files) {
    let raw
    try {
      raw = await fs.promises.readFile(file, 'utf8')
    } catch (err) {
      warnings.push({ file, reason: err.code ?? err.message })
      continue
    }

    let content
    try {
      content = JSON.parse(raw)
    } catch (err) {
      // Archivo a medio escribir u otro contenido corrupto: se anota y se sigue.
      warnings.push({ file, reason: 'invalid-json' })
      continue
    }

    const pid = content?.pid
    if (typeof pid !== 'number' || !Number.isInteger(pid) || pid <= 0) {
      warnings.push({ file, reason: 'missing-pid' })
      continue
    }

    // Si el pid del contenido no coincide con el pid del nombre del archivo,
    // gana el del contenido: el nombre puede venir de un archivo reciclado.
    const pidFromName = Number.parseInt(file.match(/([^/\\]+)\.json$/)?.[1], 10)
    if (Number.isInteger(pidFromName) && pidFromName !== pid) {
      warnings.push({ file, reason: `pid-mismatch: filename=${pidFromName} content=${pid}` })
    }

    live.push({
      pid,
      sessionId: content.sessionId ?? null,
      cwd: content.cwd ?? null,
      startedAt: content.startedAt ?? null,
      version: content.version ?? null,
      kind: content.kind ?? null,
      entrypoint: content.entrypoint ?? null,
      name: content.name ?? null,
      procesoVivo: isPidAlive(pid),
    })
  }

  live.sort((a, b) => (b.startedAt ?? 0) - (a.startedAt ?? 0))

  return { live, warnings }
}
