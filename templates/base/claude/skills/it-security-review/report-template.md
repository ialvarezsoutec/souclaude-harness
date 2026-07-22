# Revisión de Seguridad — {{PROJECT}}

> Referencia estructural para el agente `security-evidence-compiler`. Sustituye cada
> placeholder con evidencia real y verificada. No inventes resultados, no rebajes
> severidades y no elimines hallazgos corregidos del historial.

## Estado de la revisión

| Campo | Valor |
|---|---|
| Proyecto | {{PROJECT}} |
| Estado | {{STATUS}} |
| Fecha de la revisión | {{DATE}} |
| Rama | {{BRANCH}} |
| Commit inicial | {{INITIAL_COMMIT}} |
| Commit final | {{FINAL_COMMIT}} |
| Alcance | {{SCOPE}} |
| Aprobación de IT | PENDING |

## Resumen para IT

{{EXECUTIVE_SUMMARY}}

Este informe no reemplaza un pentest formal, una auditoría externa ni la validación de
infraestructura de producción. Es un insumo para que IT tome su propia decisión
informada sobre el paso a producción.

## Sobre el proyecto

{{PROJECT_IDENTIFICATION}}

## Qué se revisó y metodología

{{ATTACK_SURFACE}}

- Método de revisión: comando nativo `/security-review` de Claude Code.
- Ciclos de remediación SDD ejecutados: {{REMEDIATION_CYCLES}}.
- Pruebas obligatorias: {{TEST_SUMMARY}}.

## Alcance, exclusiones y limitaciones

{{SCOPE_AND_LIMITATIONS}}

## Resultado de la revisión final

{{FINAL_REVIEW}}

## Resumen de hallazgos por severidad

| Severidad | Iniciales | Remediados | Abiertos |
|---|---:|---:|---:|
| Critical | {{INITIAL_CRITICAL}} | {{FIXED_CRITICAL}} | 0 |
| High | {{INITIAL_HIGH}} | {{FIXED_HIGH}} | 0 |
| Medium | {{INITIAL_MEDIUM}} | {{FIXED_MEDIUM}} | {{OPEN_MEDIUM}} |
| Low | {{INITIAL_LOW}} | {{FIXED_LOW}} | {{OPEN_LOW}} |
| Informativo | {{INITIAL_INFO}} | — | {{OPEN_INFO}} |

Ningún hallazgo `Critical` o `High` queda abierto al cierre de esta revisión.

## Trazabilidad de hallazgos Critical/High corregidos

Registro técnico de cada hallazgo grave detectado y su remediación. No se elimina un
hallazgo de esta tabla por haber sido corregido — el historial de corrección es parte
de la evidencia.

| ID | Severidad inicial | Activo/archivo afectado | Requisito o spec | Cambio aplicado | Prueba de regresión | Estado final |
|---|---|---|---|---|---|---|
| {{ID}} | {{SEVERITY}} | {{AFFECTED_ASSET}} | {{SPEC_REF}} | {{CHANGE}} | {{TEST_REF}} | REMEDIATED |

{{REMEDIATION_TRACEABILITY_NOTE}}

## Evidencia de pruebas

| Comando | Propósito | Resultado | Evidencia |
|---|---|---|---|
| {{COMMAND}} | {{PURPOSE}} | PASSED | {{EVIDENCE}} |

## Hallazgos Medium, Low e informativos pendientes

{{REMAINING_FINDINGS}}

## Riesgo residual y condiciones para producción

{{RESIDUAL_RISK}}

## Recomendación para IT

{{IT_RECOMMENDATION}}

## Índice de evidencia

{{EVIDENCE_INDEX}}

## Declaración de assurance

En la revisión final automatizada no se identificaron hallazgos Critical o High dentro
del alcance y las limitaciones declaradas. Este informe habilita la evaluación final de
IT, pero no sustituye un pentest formal, la validación de infraestructura de producción
ni la aprobación corporativa de despliegue.
