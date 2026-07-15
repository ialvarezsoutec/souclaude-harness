import { execFileSync } from 'node:child_process'
import * as ui from '../ui.js'
import { computePlan, writeActions, OBSOLETE, NOOP, LOCAL_EDIT } from '../core/plan.js'
import { apply } from '../core/apply.js'

// execFile con args en array: nunca pasa por el shell, asi que las rutas con
// espacios (todo OneDrive) dejan de ser un problema.
export function gitUserName(cwd) {
  try {
    return execFileSync('git', ['config', 'user.name'], { cwd, encoding: 'utf8' }).trim() || null
  } catch {
    return null
  }
}

const TYPES = ['backend', 'frontend', 'data', 'ml', 'automation', 'infra', 'integration']

export async function resolveVars({ flags, lock, detected, cwd, manifest }) {
  const prev = lock?.vars ?? {}
  const yes = Boolean(flags.yes) || ui.isCI()

  const projectName =
    flags.name ?? prev.PROJECT_NAME ?? (await ui.text({
      message: 'Nombre del proyecto',
      initialValue: detected.projectName,
      yes,
    }))

  const projectType =
    flags.type ?? prev.PROJECT_TYPE ?? (await ui.select({
      message: 'Tipo de proyecto',
      options: TYPES.map((t) => ({ value: t, label: t })),
      initialValue: 'backend',
      yes,
    }))

  const stack = flags.stack ?? prev.STACK ?? detected.stackLabel

  const langFlag = flags.lang ?? (prev.LANGUAGE === 'ingles' ? 'en' : prev.LANGUAGE ? 'es' : null)
  const lang =
    langFlag ?? (await ui.select({
      message: 'Idioma en el que Claude responde',
      options: [
        { value: 'es', label: 'espanol' },
        { value: 'en', label: 'ingles' },
      ],
      initialValue: 'es',
      yes,
    }))

  return {
    PROJECT_NAME: projectName,
    PROJECT_TYPE: projectType,
    STACK: stack,
    // La herramienta que hace cumplir la regla de dependencias de P2 en CI. Sale del
    // stack detectado: sin nombrarla, P2 queda como buena intencion.
    ARCH_ENFORCER: flags.enforcer ?? prev.ARCH_ENFORCER ?? detected.enforcer,
    LANGUAGE: lang === 'en' ? 'ingles' : 'espanol',
    OWNER: prev.OWNER ?? gitUserName(cwd) ?? 'por definir',
    // Sticky, como OWNER: es la fecha de instalacion de un archivo user-owned
    // (CLAUDE.md, constitution.md), sembrada una vez. Si se recalculara en cada
    // corrida, un simple cambio de dia haria que el motor viera "el template
    // cambio" y generara un .new espurio sin que nada real haya cambiado.
    DATE: prev.DATE ?? new Date().toISOString().slice(0, 10),
    HARNESS_VERSION: manifest.harnessVersion,
  }
}

// El nucleo compartido por init y upgrade: son el mismo code path. Lo unico que
// cambia entre "repo vacio", "repo legacy" y "migrar del harness viejo" es que
// encuentra computePlan en disco y en el lockfile.
export async function planAndApply({ manifest, cwd, lock, vars, detected, flags, title }) {
  const force = Boolean(flags.force)
  const plan = computePlan({ manifest, cwd, lock, vars, detected, force })

  ui.renderPlan(plan, { verbose: Boolean(flags.verbose) })

  const pending = writeActions(plan.actions)
  const obsolete = plan.actions.filter((a) => a.verdict === OBSOLETE)

  if (!pending.length && !obsolete.length) {
    ui.outro(`Ya estas en harness v${manifest.harnessVersion}. Nada que hacer.`)
    return 0
  }

  if (flags['dry-run']) {
    ui.outro('--dry-run: no se escribio ni un byte.')
    return 0
  }

  const yes = Boolean(flags.yes) || ui.isCI()
  const ok = await ui.confirm({ message: `${title}: aplicar ${pending.length} cambio(s)?`, initialValue: true, yes })
  if (!ok) {
    ui.cancelled()
    return 1
  }

  // P5: --prune borra archivos. Es destructivo, exige una segunda confirmacion
  // explicita y --yes NO alcanza. Hay que tipear la palabra.
  let prune = false
  if (obsolete.length && flags.prune) {
    prune = await ui.confirmDestructive({
      message: `Se van a BORRAR ${obsolete.length} archivo(s) obsoleto(s):\n${obsolete.map((a) => `    ${a.dest}`).join('\n')}`,
      word: 'BORRAR',
    })
    if (!prune) ui.log.warn('Prune cancelado. Los archivos obsoletos quedan donde estan.')
  }

  const result = apply({
    plan,
    cwd,
    manifest,
    vars,
    detected,
    lock,
    prune,
    backup: flags.backup !== false,
  })

  report(result, plan, manifest)
  return 0
}

function report(result, plan, manifest) {
  const news = result.written.filter((w) => w.dest.endsWith('.new'))
  const touched = plan.actions.filter((a) => a.verdict === LOCAL_EDIT)
  const kept = plan.actions.filter((a) => a.verdict === NOOP).length

  ui.log.success(`${result.written.length} archivo(s) escrito(s). ${kept} sin cambios.`)

  if (result.backupRoot) {
    ui.log.info(`Backup de lo sobrescrito en ${result.backupRoot.split(/[\\/]/).slice(-2).join('/')}`)
  }
  if (result.removed.length) {
    ui.log.warn(`Borrados: ${result.removed.join(', ')}`)
  }
  if (touched.length) {
    ui.log.info(`Respetados (los editaste tú, el template no cambio): ${touched.map((a) => a.dest).join(', ')}`)
  }

  if (news.length) {
    ui.log.warn(
      [
        `${news.length} archivo(s) NO fueron sobrescritos. La propuesta del harness quedo al lado, en .new:`,
        ...news.map((w) => `    ${w.dest}`),
        '',
        'Compara y mergea a mano. Por ejemplo:',
        `    git diff --no-index ${news[0].dest.replace(/\.new$/, '')} ${news[0].dest}`,
      ].join('\n')
    )
  }

  ui.outro(`Harness v${manifest.harnessVersion} listo.`)
}
