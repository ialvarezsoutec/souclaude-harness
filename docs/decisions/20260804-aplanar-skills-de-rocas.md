# ADR: Aplanar las skills de la capa de rocas a un solo nivel de profundidad

**Fecha**: 2026-08-04
**Status**: accepted
**Deciders**: Ignacio A

## Context

El harness instala `/rock-plan`, `/rock-status`, `/rock-close` y `/export-ninety` en
`.claude/skills/ccem-rocas/<comando>/SKILL.md` — un agrupador conceptual (`ccem-rocas`)
conteniendo cuatro subcarpetas, cada una con su propio `SKILL.md`. Esa estructura nunca
funcionó: Claude Code descubre skills de proyecto en `.claude/skills/<nombre>/SKILL.md`,
exactamente **un nivel** de profundidad. Lo que la documentación llama *nested skills* es
un `.claude/skills/` completo dentro de un subdirectorio del repo
(`apps/web/.claude/skills/deploy/` → `/apps/web:deploy`), no un agrupador dentro de
`skills/` mismo. Además, `ccem-rocas/` nunca tuvo su propio `SKILL.md`, así que Claude Code
descartaba la carpeta entera sin ni siquiera mirar adentro.

Consecuencia: en todo repo que instaló este harness desde que la capa de rocas existe
(desde `chore/SHS-001-harness-v2-capa-rocas`), los cuatro comandos nunca se cargaron. No
es una regresión reciente — es que nunca funcionaron. Se descubrió recién ahora (SHS-H2),
inspeccionando la rama `dev` de punta a punta, en vez de con un reporte de bug de un
usuario, porque nadie los había invocado.

No hay frontmatter, setting ni flag de Claude Code que habilite el descubrimiento a dos
niveles. Es una restricción de la plataforma, no una elección de diseño de este harness.

## Decision

Las cuatro skills pasan a `.claude/skills/rock-plan/SKILL.md`,
`.claude/skills/rock-status/SKILL.md`, `.claude/skills/rock-close/SKILL.md` y
`.claude/skills/export-ninety/SKILL.md` — hermanas de las demás skills, no hijas de un
agrupador. `ccem-rocas` deja de ser una carpeta contenedora y pasa a ser una skill más,
con su propio `.claude/skills/ccem-rocas/SKILL.md`: conceptual, sin
`disable-model-invocation`, explica la capa trimestral y cuál de los cuatro comandos usar
en cada momento. Los cuatro comandos y la skill paraguas conviven en el mismo nivel.

Los cuatro `dest` viejos se declaran en `manifest.obsolete[]`. El motor de aplicación ya
detecta esos destinos —tengan o no lockfile— y los ofrece para borrar con `--prune`
([src/core/plan.js:44-48](../../src/core/plan.js#L44-L48)), así que ningún repo
consumidor queda con un archivo huérfano sin aviso.

## Consequences

### Positivas
- Los cuatro comandos de rocas se cargan de verdad, en este repo y en todo repo que
  actualice el harness.
- La migración es gratuita: el motor de `plan.js` ya soporta `obsolete[]` sin lockfile.
- `ccem-rocas` gana una descripción propia en vez de ser solo un nombre de carpeta en la
  documentación (`CLAUDE.md`, `AGENTS.md`) sin contenido real detrás.

### Negativas
- Se pierde el agrupamiento visual en el listado de `.claude/skills/`: los cuatro comandos
  ya no aparecen juntos bajo una carpeta común, sino intercalados alfabéticamente con el
  resto de las skills del harness.
- Cualquier repo que haya hecho `upgrade` con la estructura vieja necesita correr
  `--prune` (con su doble confirmación) para limpiar los cuatro archivos huérfanos; si no
  lo hace, quedan en disco sin causar daño pero sin desaparecer solos.

### Neutras
- El nombre `ccem-rocas` no cambia — solo su rol, de carpeta contenedora a skill
  conceptual. Mismo criterio que ya se tomó con `ccem-planner` en
  [docs/decisions/20260722-capa-rocas-hito-emisor-de-ids.md](./20260722-capa-rocas-hito-emisor-de-ids.md):
  el nombre sobrevive, el contenido se ajusta a lo que la plataforma permite.

## Alternatives considered

### Alternativa A: absorber `ccem-rocas` en `ccem-planner`
**Pros**: una skill menos, toda la trazabilidad (roca → hito → CCEM) en un solo lugar.
**Cons**: `ccem-planner` ya declara explícitamente que la capa trimestral es de
`ccem-rocas` y cubre solo el hilo de trazabilidad de la carpeta de spec hacia abajo
([ccem-planner/SKILL.md:11-14](../../.claude/skills/ccem-planner/SKILL.md#L11-L14));
fusionarlas borra una frontera conceptual que el propio método viene defendiendo.
**Por qué se descartó**: decisión del dueño (Q1, SHS-H2, 2026-07-31) — `ccem-rocas` queda
como skill paraguas real.

### Alternativa B: registrar `ccem-rocas` como plugin con `.claude-plugin/plugin.json`
**Pros**: Claude Code sí soporta agrupar skills bajo un plugin, con su propio namespace
(`plugin-name:skill-name`), y eso preservaría el agrupamiento visual perdido en la
Alternativa elegida.
**Cons**: introduce un mecanismo nuevo (plugins) para un problema que no lo necesita;
además, en `.claude/skills/` de un proyecto un plugin exige aceptar el diálogo de
workspace trust primero, una fricción que hoy no existe para ninguna skill del harness.
**Por qué se descartó**: viola P9 (Simplicity First) — resuelve el mismo problema con más
mecanismo del que el problema pide. Si el agrupamiento visual se vuelve un problema real
en el futuro, se reevalúa con ese caso concreto en mano, no de antemano.

## References

- [docs/decisions/20260722-capa-rocas-hito-emisor-de-ids.md](./20260722-capa-rocas-hito-emisor-de-ids.md) —
  precedente de "el nombre sobrevive, el rol cambia" aplicado a `ccem-planner`.
- `specs/SHS-H2-cli-template-completo/` — spec, plan y tasks de este hito.
- Documentación de Claude Code sobre descubrimiento de skills: un nivel para
  `.claude/skills/<nombre>/SKILL.md`; el descubrimiento anidado solo aplica a un
  `.claude/skills/` completo dentro de un subdirectorio del repo.
