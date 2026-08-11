import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

// Este adaptador resuelve donde vive ~/.claude e indexa sus transcripts.
// Solo stat, nunca lectura de contenido: eso es trabajo de otra capa.

// os.homedir() y NUNCA process.env.HOME: en Git Bash sobre Windows $HOME puede
// diferir de %USERPROFILE% y apuntar a un directorio que no es el real.
export function resolveClaudeHome({ override } = {}) {
  const home = override ?? process.env.SOUCLAUDE_CLAUDE_HOME ?? path.join(os.homedir(), '.claude')

  // ~/.claude.json vive FUERA de la carpeta .claude, al lado de ella. Con
  // override apuntamos igual al padre del override para que un fixture de
  // test pueda reproducir esa misma estructura (carpeta + .claude.json hermano).
  const configFile = path.join(home, '..', '.claude.json')

  return {
    home,
    projectsDir: path.join(home, 'projects'),
    sessionsDir: path.join(home, 'sessions'),
    configFile,
  }
}

// El slug de la carpeta de proyecto NO es reversible: es el cwd con \, :,
// espacios y acentos reemplazados por -. Nunca intentar des-sluguear para
// recuperar la ruta real; esa ruta sale del campo `cwd` de dentro del jsonl,
// que es trabajo de otra capa (esta solo indexa por stat).
export async function indexTranscripts(paths, { since = null } = {}) {
  const files = []
  const warnings = []

  let slugs
  try {
    slugs = await fs.promises.readdir(paths.projectsDir, { withFileTypes: true })
  } catch (err) {
    if (err.code === 'ENOENT') return { files: [], warnings: [] }
    return { files: [], warnings: [{ file: paths.projectsDir, reason: err.code ?? err.message }] }
  }

  for (const slugEntry of slugs) {
    if (!slugEntry.isDirectory()) continue
    const slug = slugEntry.name
    const slugDir = path.join(paths.projectsDir, slug)

    let entries
    try {
      entries = await fs.promises.readdir(slugDir, { withFileTypes: true })
    } catch (err) {
      warnings.push({ file: slugDir, reason: err.code ?? err.message })
      continue
    }

    for (const entry of entries) {
      if (entry.isDirectory()) continue
      if (!entry.name.endsWith('.jsonl')) continue

      const sessionId = entry.name.slice(0, -'.jsonl'.length)
      await addEntry(files, warnings, {
        filePath: path.join(slugDir, entry.name),
        kind: 'session',
        slug,
        sessionId,
        agentId: null,
        since,
      })
    }

    // Sesiones con subagentes: <sessionId>/subagents/agent-<agentId>.jsonl.
    for (const entry of entries) {
      if (!entry.isDirectory()) continue
      const sessionId = entry.name
      const subagentsDir = path.join(slugDir, sessionId, 'subagents')

      let subEntries
      try {
        subEntries = await fs.promises.readdir(subagentsDir, { withFileTypes: true })
      } catch (err) {
        if (err.code === 'ENOENT') continue // carpeta sin subagentes, no es un error
        warnings.push({ file: subagentsDir, reason: err.code ?? err.message })
        continue
      }

      for (const subEntry of subEntries) {
        if (!subEntry.isFile()) continue
        const match = /^agent-(.+)\.jsonl$/.exec(subEntry.name)
        if (!match) continue

        await addEntry(files, warnings, {
          filePath: path.join(subagentsDir, subEntry.name),
          kind: 'subagent',
          slug,
          sessionId,
          agentId: match[1],
          // Al lado de cada transcript de subagente hay un .meta.json con
          // agentType y description. Es una fuente mejor que attributionAgent:
          // esta siempre, y la description dice en una linea que le pidieron.
          metaPath: path.join(subagentsDir, `agent-${match[1]}.meta.json`),
          since,
        })
      }
    }
  }

  return { files, warnings }
}

async function addEntry(files, warnings, { filePath, kind, slug, sessionId, agentId, metaPath = null, since }) {
  try {
    const stat = await fs.promises.stat(filePath)
    if (typeof since === 'number' && stat.mtimeMs < since) return
    files.push({
      path: filePath,
      kind,
      slug,
      sessionId,
      agentId,
      metaPath,
      size: stat.size,
      mtimeMs: stat.mtimeMs,
    })
  } catch (err) {
    // Archivo borrado entre el readdir y el stat, permisos, etc: se anota y se sigue.
    warnings.push({ file: filePath, reason: err.code ?? err.message })
  }
}

// Lee el .meta.json de un subagente: { agentType, description, toolUseId, spawnDepth }.
// Es chico (unos 150 bytes) y no cambia despues de creado, asi que quien lo use
// deberia cachearlo por agentId y no releerlo en cada tick.
export async function readAgentMeta(metaPath) {
  if (!metaPath) return null
  try {
    return JSON.parse(await fs.promises.readFile(metaPath, 'utf8'))
  } catch {
    // Sin meta (version vieja de Claude Code, o archivo a medio escribir) el
    // consumidor cae a attributionAgent del propio transcript.
    return null
  }
}

export async function listSessionFiles(paths) {
  try {
    const entries = await fs.promises.readdir(paths.sessionsDir, { withFileTypes: true })
    return entries
      .filter((e) => e.isFile() && e.name.endsWith('.json'))
      .map((e) => path.join(paths.sessionsDir, e.name))
  } catch {
    return []
  }
}
