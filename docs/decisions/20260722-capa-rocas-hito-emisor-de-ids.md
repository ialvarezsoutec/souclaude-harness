# ADR: Capa de rocas — el hito reemplaza a Planner como emisor de IDs

**Fecha**: 2026-07-22
**Status**: accepted
**Deciders**: Ignacio A (lead), coordinador del harness
**Tarjeta**: SHS-001 · Metodología de Roca v2.1.0 (Vault)
**Supersedes**: `docs/decisions/20260721-orquestacion-multiagente.md` (solo en cuanto al emisor de IDs; ver Decision)

## Context

La **Metodología de Roca v2.1.0** cierra la capa trimestral (ejecutiva) que se sienta encima
de CCEM: la roca nace en la reunión trimestral, se descompone en 5-7 **hitos**, y cada hito
emite el ID que amarra `spec → rama → PR → tag`. Esa metodología **elimina Microsoft Planner**
del flujo: en v1 el ID venía de una tarjeta de Planner; en v2.1.0 el emisor es el hito
(`<PREFIJO>-H<n>`), definido en el Paso 2 de planificación.

El harness (1.1.0) está construido sobre el supuesto contrario. `ccem-planner` usa Planner
como hilo conductor y tablero de estados (Doing/Done, checklist, WIP por tarjeta); `spec-new`,
`soutec-github` y los agentes `orchestrator`/`spec-author`/`implementer` piden "ID de tarjeta
de Planner". El ADR `20260721-orquestacion-multiagente` fijó explícitamente en su Decision que
"el hilo sigue siendo el ID de Planner" (§41).

Los ADR de CCEM son inmutables. El ADR de orquestación no puede editarse para cambiar ese
supuesto; se **supersede** con este, que conserva todo lo que sigue siendo válido (el patrón
de 4 roles, D1-D4) y solo corrige el emisor del identificador.

Restricción central heredada: el harness es un generador. Este cambio entra como **contenido**
(reescritura de skills + registro en el manifest), sin tocar el motor (`plan.js`/`apply.js`).

## Decision

**El hito es el emisor de IDs. Planner sale del flujo.**

- **D1 — Emisor = hito.** El identificador nace en el Paso 2 de la metodología, con formato
  `<PREFIJO>-H<n>` (ej. `REA-H3`). El hilo completo es
  `Roca <TRIMESTRE>-<PREFIJO> → Hito <PREFIJO>-H<n> → specs/<ID-hito>-<slug>/ → rama tipo/<ID-hito>-<slug> → commits → PR → squash → tag`.
- **D2 — `ccem-planner` se reescribe, no se elimina.** Conserva su rol (trazabilidad del hilo
  único ID ↔ spec ↔ rama ↔ PR) pero con el hito como origen y el estado **derivado de GitHub**,
  no de un tablero. Se mantiene el nombre del skill (`ccem-planner`) en v2.0.0 para no tocar
  `id`/`src`/`dest` del manifest ni el lockfile — cambio quirúrgico (P10). El registro de
  prefijos deja de ser "de tarjeta" y pasa a ser "de proyecto".
- **D3 — WIP verificable.** El límite "2-3 tarjetas por dev" (que dependía del tablero) se
  reemplaza por **máximo 2 ramas vivas por persona**, contable con `git branch -r` sin
  herramienta nueva.
- **D4 — Se reafirma el ADR de orquestación salvo el emisor.** El patrón de 4 roles, los
  checkpoints humanos y "ningún agente se auto-aprueba" siguen vigentes (P6 hecho producto).
  Lo único que este ADR cambia de aquél es la frase "el hilo sigue siendo el ID de Planner":
  ahora el hilo es el ID de hito.
- **D5 — La capa de rocas se empaqueta como skill `ccem-rocas`.** Distribuida por el harness
  igual que el resto (comandos `/rock-plan`, `/rock-status`, `/rock-close`, `/export-ninety`),
  para que llegue a los repos por `upgrade` y no haya un segundo canal de distribución.
- **D6 — No se llenan P7/P8 con reglas de la capa trimestral.** La metodología §9 lo prohíbe
  explícitamente: P7/P8 son principios *por proyecto*; las reglas transversales de rocas viven
  en `ccem-rocas`. Se dejan como placeholder deliberadamente.

Alcance de esta decisión: **el repo de código** (skills, agentes, constitución, versionado).
El repo Vault, el job semanal (E2/E3), el cierre de hito con evidencia (E5) y la integración
con Ninety (Fases 1-3) son tracks aparte, fuera de la v2.0.0.

## Consequences

### Positivas
- Un solo hilo de identificador de punta a punta, sin dependencia de una herramienta externa
  (Planner) que la organización dejó de usar.
- El estado deja de escribirse a mano: se deriva de rama/PR (metodología §5), lo que elimina
  el modo de falla de "el sistema se ve impecable y miente".
- Todo repo SOUTEC hereda la capa de rocas en el próximo `upgrade`.
- WIP verificable con `git`, sin tablero que nadie mantiene al día.

### Negativas
- **Breaking change** para los repos hijos: `upgrade` reescribe `ccem-planner` y suma
  `ccem-rocas`. Justifica el bump mayor a `2.0.0`.
- Duplicación de dogfooding: el contenido vive en `templates/base/…` y, emitido, en
  `.claude/…` de este repo (igual que hoy con skills y agentes).
- El registro de prefijos (`id-registry.md`) pasa a ser autoridad; su ausencia bloquea
  `/rock-plan`. Vive en el Vault, fuera de este repo.

### Neutras
- El prefijo `PLN` sobrevive, pero cambia de significado: de "tarjeta de Planner / transversal"
  a "prefijo de proyecto transversal".
- `ccem-planner` conserva su nombre pese a que ya no hay Planner; se documenta el porqué (D2).

## Alternatives considered

### Alternativa A: Renombrar `ccem-planner` a `ccem-hitos`
**Pros**: el nombre deja de mentir; nadie busca "Planner" y lo encuentra vigente.
**Cons**: toca `id`/`src`/`dest` del manifest, el lockfile y referencias cruzadas en agentes y
docs; el motor lo vería como obsolete + create.
**Por qué se descartó**: viola P10 (cambio no quirúrgico) para v2.0.0. Se reevalúa en una
versión posterior si el nombre genera confusión real.

### Alternativa B: Editar el ADR de orquestación en vez de superseder
**Pros**: un solo documento, sin duplicar contexto.
**Cons**: los ADR de CCEM son inmutables; editarlos rompe el registro histórico de decisiones.
**Por qué se descartó**: la metodología §12 lo prohíbe explícitamente. Se supersede.

### Alternativa C: Llenar P7/P8 con las reglas de la capa trimestral
**Pros**: reusa los placeholders que ya existen en la constitución.
**Cons**: P7/P8 son principios *por proyecto*; llenarlos con algo transversal anula esa
intención (metodología §9).
**Por qué se descartó**: las reglas de rocas van en `ccem-rocas`, no en la constitución.

## References

- Metodología de Roca v2.1.0 (Vault, `00-System/metodologia-roca.md`)
- ADR superseded: `docs/decisions/20260721-orquestacion-multiagente.md`
- Plantilla de apertura: `plantilla_apertura_roca.yaml`
- Constitución P6, P9, P10: `docs/constitution.md`
- Skills afectadas: `ccem-planner`, `spec-new`, `soutec-github`; agentes `orchestrator`, `spec-author`, `implementer`
