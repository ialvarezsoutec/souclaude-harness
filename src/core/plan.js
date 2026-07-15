import path from 'node:path'
import { hashContent, normalize } from './hash.js'
import { readIfExists } from './fsx.js'
import { readTemplate, readFragments } from './manifest.js'
import { render } from './render.js'
import { buildBlock, upsertBlock, extractBlock } from './block.js'
import { seedMerge, parseJson, stringifyJson } from './jsonmerge.js'
import { migrationsFor } from '../migrations/index.js'

// Veredictos. init, adopcion de un repo legacy y migracion de version son EL
// MISMO code path: lo unico que cambia es que encuentra en disco y en el lockfile.
export const CREATE = 'create' // no existe, no esta en el lockfile -> escribir
export const UPDATE = 'update' // intacto desde la ultima vez, el template cambio -> pisar (seguro)
export const NOOP = 'noop' // identico a lo deseado -> no tocar
export const CONFLICT = 'conflict' // el usuario lo edito Y el template cambio -> .new
export const FOREIGN = 'foreign' // existe pero nunca lo escribimos nosotros -> .new
export const RESTORE = 'restore' // lo escribimos y el usuario lo borro -> reescribir
export const LOCAL_EDIT = 'local-edit' // el usuario lo edito, el template no cambio -> dejarlo
export const OBSOLETE = 'obsolete' // estaba en el lockfile, ya no esta en el manifest -> ofrecer borrado

export function computePlan({ manifest, cwd, lock, vars, detected, force = false }) {
  const actions = []
  const fromVersion = lock?.harnessVersion ?? '0.0.0'
  const seenDests = new Set()

  for (const entry of manifest.files) {
    if (entry.when === 'empty-repo' && !detected.isEmpty) continue
    seenDests.add(entry.dest)
    actions.push(planFile({ entry, manifest, cwd, lock, vars, detected, fromVersion, force }))
  }

  // Archivos que emitimos en una version anterior y que este manifest ya no
  // declara. Nunca se borran solos: se ofrecen con --prune + doble confirmacion (P5).
  for (const dest of Object.keys(lock?.files ?? {})) {
    if (seenDests.has(dest)) continue
    if (readIfExists(path.join(cwd, ...dest.split('/'))) == null) continue
    actions.push({ dest, policy: 'managed', verdict: OBSOLETE, reasons: ['ya no forma parte del harness'] })
    seenDests.add(dest)
  }

  // Archivos que el harness declara muertos explicitamente. A diferencia de los
  // anteriores, estos se detectan aunque NO haya lockfile — es como se le avisa a
  // un repo que copio el Kit a mano que su .claudeignore no hace nada.
  for (const dead of manifest.obsolete ?? []) {
    if (seenDests.has(dead.dest)) continue
    if (readIfExists(path.join(cwd, ...dead.dest.split('/'))) == null) continue
    actions.push({ dest: dead.dest, policy: 'managed', verdict: OBSOLETE, reasons: [dead.reason] })
  }

  const dirs = (manifest.dirs ?? []).filter((d) => !(d.when === 'empty-repo' && !detected.isEmpty))

  return { actions, dirs, fromVersion, toVersion: manifest.harnessVersion }
}

function planFile({ entry, manifest, cwd, lock, vars, detected, fromVersion, force }) {
  const abs = path.join(cwd, ...entry.dest.split('/'))
  const raw = readIfExists(abs)

  // Un archivo vacio es equivalente a un archivo ausente: no hay nada del usuario que
  // perder, asi que se escribe en vez de dejarle un .new al lado para siempre. El caso
  // real: un repo recien creado en GitHub trae un README.md de 0 bytes.
  const onDisk = raw != null && normalize(raw) === '' ? null : raw

  const lockEntry = lock?.files?.[entry.dest]
  const reasons = []

  // 1. Migraciones: transforman lo que hay en disco ANTES de comparar. Asi el
  //    fix de las claves invalidas del Kit v0 aparece como un `update` normal.
  let baseline = onDisk
  if (onDisk != null) {
    for (const m of migrationsFor(entry.dest, fromVersion)) {
      const next = m.transform(baseline)
      if (!normalize(next ?? '').length) continue
      if (normalize(next) !== normalize(baseline)) {
        baseline = next
        reasons.push(`migracion ${m.id}: ${m.describe}`)
      }
    }
  }

  // 2. Contenido deseado. Para append-block y merge-json depende de lo que ya
  //    hay en disco, porque solo somos duenos de una parte del archivo.
  const desired = desiredContent({ entry, manifest, vars, detected, baseline })

  const action = { dest: entry.dest, policy: entry.policy, reasons, content: desired, writePath: entry.dest }

  // 3. Clasificacion. Es la tabla del plan, literal.
  if (onDisk == null) {
    action.verdict = lockEntry ? RESTORE : CREATE
    return action
  }

  const diskHash = hashContent(onDisk)
  const desiredHash = hashContent(desired)

  if (desiredHash === diskHash) {
    action.verdict = NOOP
    return action
  }

  // append-block y merge-json son aditivos por construccion: solo tocan la region
  // que el harness posee, asi que nunca pueden "pisar" al usuario. No hay conflicto
  // posible; si el contenido difiere, es que hay que actualizar nuestra region.
  if (entry.policy === 'append-block' || entry.policy === 'merge-json') {
    action.verdict = UPDATE
    if (entry.policy === 'append-block' && !extractBlock(onDisk)) {
      reasons.push('se agrega el bloque gestionado; tus lineas no se tocan')
    }
    return action
  }

  if (!lockEntry) {
    // Existe pero nunca lo escribimos nosotros: estructura hecha a mano, o un
    // CLAUDE.md que el dev ya tenia. NUNCA se pisa.
    action.verdict = FOREIGN
    action.writePath = `${entry.dest}.new`
    reasons.push('ya existia y no fue generado por el harness')
    return action
  }

  if (diskHash === lockEntry.hash) {
    // Intacto desde que lo escribimos: pisarlo no pierde nada del usuario.
    action.verdict = UPDATE
    return action
  }

  // El usuario lo edito.
  if (desiredHash === lockEntry.hash) {
    action.verdict = LOCAL_EDIT
    reasons.push('editado por ti; el template no cambio')
    return action
  }

  action.verdict = CONFLICT
  reasons.push('editado por ti Y el template cambio')
  if (!force) action.writePath = `${entry.dest}.new`
  return action
}

function desiredContent({ entry, manifest, vars, detected, baseline }) {
  switch (entry.policy) {
    case 'append-block': {
      const lines = readFragments(entry.src, detected.stacks)
      const block = buildBlock(lines, manifest.harnessVersion)
      return upsertBlock(baseline, block)
    }
    case 'merge-json': {
      const seed = JSON.parse(render(readTemplate(entry.src), vars))
      const existing = parseJson(baseline, entry.dest)
      return stringifyJson(seedMerge(existing, seed))
    }
    default: {
      const raw = readTemplate(entry.src)
      return entry.render ? render(raw, vars) : raw
    }
  }
}

export function summarize(actions) {
  const by = {}
  for (const a of actions) (by[a.verdict] ??= []).push(a)
  return by
}

// Acciones que efectivamente escriben algo en disco.
export function writeActions(actions) {
  return actions.filter((a) => [CREATE, UPDATE, RESTORE, CONFLICT, FOREIGN].includes(a.verdict))
}
