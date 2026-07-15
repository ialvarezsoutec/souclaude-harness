---
name: ccem-sdd
description: Spec-Driven Development de CCEM — el flujo de 4 fases (Specify, Plan, Tasks, Implement) sobre una Fase 0 de constitución, para features nuevas, refactors de más de 3 archivos, migraciones y cambios de contrato. Aplicar cuando el usuario arranca una feature o pide un refactor grande. Incluye la matriz de decisión de cuándo NO aplicar SDD, que importa tanto como cuándo sí.
---

# CCEM — Spec-Driven Development

## El shift

La causa de que un agente devuelva código que "se ve bien pero no funciona" es tratar
al modelo como un search engine cuando hay que tratarlo como un pair programmer
literal.

SDD invierte la jerarquía: **el intent es la fuente de verdad, no el código.**

```
Code is truth                      Intent is truth
  Idea                               Intent
   → Código                           → Especificación  ← source of truth
   → Documentación que nadie lee      → Plan técnico
   → Mantenimiento                    → Tasks
                                      → Código
```

Cuando algo cambia, se actualiza la spec y se regenera el plan. No se parchea el
código y se deja la doc mintiendo.

## Las fases

```
FASE 0 · una vez por proyecto
  Constitución    → docs/constitution.md · principios no-negociables

FASE 1 · el QUÉ y el POR QUÉ                                    15-30 min
  Specify         → spec.md · user journeys, outcomes. SIN tech stack.

FASE 2 · el CÓMO técnico                                        30-45 min
  Plan            → plan.md · stack, arquitectura, data contracts, risks

FASE 3 · descomposición accionable                              15-30 min
  Tasks           → tasks.md · chunks de 15-30 min, testeables en aislamiento

FASE 4
  Implement       → task por task, review incremental
```

Los artefactos viven en `specs/<feature-slug>/`. Se crean con `/spec-new <slug>`.

**Granularidad de los tasks: 15-30 minutos, testeable en aislamiento.**
Mal task: *"Crear sistema de autenticación"*. Bien: *"Implementar el hashing de
passwords con la librería estándar del stack"*. Típicamente 8-12 tasks por feature.

## Cuándo aplicar SDD

| Aplicar | NO aplicar |
|---|---|
| Feature nueva con stakeholders no-técnicos | Bug fix puntual |
| Refactor que toca >3 archivos o >1 sistema | Ajuste cosmético (rename, format) |
| Cambio que afecta contratos existentes | Exploración o prototipo desechable |
| Migración entre tecnologías | Scripts one-off |
| Nuevo producto greenfield | Spike técnico |
| Legacy modernization | Hotfix en producción (ADR post-hoc) |
| Timeline >2 días de implementación | Fix de typo |

### Matriz de decisión

| Tipo de trabajo | SDD | Comentario |
|---|---|---|
| Feature nueva con análisis nuevo | Completo | Las 4 fases |
| Ajuste a componente existente | Lite | |
| Nuevo componente productivo | Completo | Con risks identificados |
| Migración de schema/arquitectura | Completo | + risks + rollback plan |
| Nuevo producto | Completo | Constitución primero |
| Optimización de performance | Lite | Con métrica base |
| Spike técnico de 2 horas | No | Saltar SDD |
| Hotfix en producción | No | ADR post-hoc |
| Fix de typo | No | Overhead innecesario |

Si el pedido cae en la columna "No", **decilo y hacé el trabajo**. Ceremonia que no
sirve es una violación de P7.

## SDD Lite

Para casos intermedios: `spec-lite.md` (20 min) + `plan-lite.md` (15 min) +
`tasks-lite.md` (10 min). ~45 minutos de overhead total, contra 2-3 horas del SDD
completo. Se invoca con `/spec-new <slug> --lite`.

Los checkpoints humanos son los mismos. Lo que se comprime es la ceremonia, no el
control.

## Checkpoints humanos

No son burocracia. Son el método.

- Después de `spec.md` — ¿un stakeholder no-técnico entiende qué se va a construir?
- Después de `plan.md` — ¿alineado con la constitución? ¿data contracts explícitos?
- Después de `tasks.md` — ¿granularidad de 15-30 min? ¿dependencias claras?
- Durante implement — **review por task, no en batch al final.** Si se implementa todo
  y se muestra el resultado al final, el plan no sirvió para nada.

## Reglas duras

- En `spec.md` **no va tech stack**. Si aparece "usamos Postgres", eso es `plan.md`.
- Los **non-goals** son tan importantes como los goals: si un lector puede asumir algo
  que no está excluido explícitamente, la spec está incompleta.
- Si el plan contradice la constitución, **se corrige el plan**, no la constitución.
- Si existe `specs/<slug>/`, léelo antes de tocar código. No improvises fuera del
  plan. Si el plan está mal, decilo y corregilo — no lo esquives en silencio.
