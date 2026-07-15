# {{PROJECT_NAME}}

[Una línea: qué hace este proyecto.]

**Stack**: {{STACK}}
**Tipo**: {{PROJECT_TYPE}}
**Owner**: {{OWNER}}

## Setup

```bash
# [pasos para levantar el proyecto desde cero]
```

## Estructura

```
src/          código
tests/        tests
scripts/      utilidades de desarrollo
docs/         documentación técnica
  constitution.md   principios no-negociables del proyecto
  decisions/        ADRs
specs/        especificaciones de features (Spec-Driven Development)
CLAUDE.md     contexto para Claude Code
notes.md      scratchpad persistente
```

## Trabajar con Claude Code

Este repo tiene el harness de SOUTEC (CCEM) instalado. Las skills y comandos viven
en `.claude/skills/` y están versionados junto al código.

```
/spec-new <slug>        arranca una feature nueva (spec + plan + tasks)
/adr-new <título>       registra una decisión arquitectónica
/constitution-check     audita el diff actual contra los principios P1-P8
/harness-upgrade        actualiza el harness a la última versión
```

Antes de tocar nada, Claude lee `docs/constitution.md`. Si un plan contradice un
principio, se corrige el plan — no la constitución.
