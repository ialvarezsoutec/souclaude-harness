# Revisión de Seguridad — {{PROJECT}}

> Referencia estructural para el agente `security-evidence-compiler`. Sustituye cada
> placeholder con evidencia real y verificada. No inventes resultados, no rebajes
> severidades y no elimines hallazgos corregidos del historial.

<!--
GUÍA DE FORMATO (este comentario no se renderiza en el PDF).

Anotaciones destacadas: el renderer convierte los blockquotes con la sintaxis

    > [!TIPO] Título opcional
    > Cuerpo de la anotación...

en cajas de color. Tipos: NOTA (contexto), IMPORTANTE (advertencia clave), CONFORME
(control positivo / sin hallazgos graves), ATENCIÓN (condiciones o riesgos que IT debe
evaluar; úsala en el riesgo residual cuando el estado sea READY WITH CONDITIONS) y
BLOQUEANTE (hallazgo crítico). Un blockquote sin [!TIPO] se renderiza como cita normal.

Badges automáticos: las tablas resaltan solas los estados (Sin hallazgos, PASSED,
REMEDIATED, PENDING, Open, Failed…) y las severidades (Critical, High, Medium, Low,
Informativo) como badges de color. No hace falta marcarlos a mano.

Negrita inline: usa **texto** para destacar el subtítulo al inicio de un bullet
(ej. "- **Endpoints y APIs**: cómo reciben datos"). El renderer lo dibuja en negrita.

Resumen general (arriba del todo): {{EXECUTIVE_CONCLUSION}} es la frase-resultado
verificable del informe (p. ej. "No se identificaron hallazgos Critical o High abiertos al
cierre de esta revisión…"). Va en un callout CONFORME justo debajo del título y ANTES del
estado, como veredicto de una sola línea. Si el estado es READY WITH CONDITIONS, cámbialo
a [!ATENCIÓN] y describe las condiciones.

No abuses de las anotaciones: 3-4 por informe bastan. Lenguaje siempre verificable,
nunca "la aplicación es segura" ni "certificada".
-->

> [!CONFORME] Resumen general
> {{EXECUTIVE_CONCLUSION}}

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

> [!IMPORTANTE]
> Este informe no reemplaza un pentest formal, una auditoría externa ni la validación de
> infraestructura de producción. Es un insumo para que IT tome su propia decisión
> informada sobre el paso a producción.

## Sobre el proyecto

{{PROJECT_IDENTIFICATION}}

## Qué se revisó y metodología

{{ATTACK_SURFACE}}

- **Método de revisión**: comando nativo `/security-review` de Claude Code.
- **Ciclos de remediación SDD ejecutados**: {{REMEDIATION_CYCLES}}.
- **Pruebas obligatorias**: {{TEST_SUMMARY}}.

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

> [!CONFORME]
> Ningún hallazgo `Critical` o `High` queda abierto al cierre de esta revisión.

## Trazabilidad de hallazgos Critical/High corregidos

Registro técnico de cada hallazgo grave detectado y su remediación. No se elimina un
hallazgo de esta tabla por haber sido corregido — el historial de corrección es parte
de la evidencia.

| ID | Severidad inicial | Activo/archivo afectado | Requisito o spec | Cambio aplicado | Prueba de regresión | Estado final |
|---|---|---|---|---|---|---|
| {{ID}} | {{SEVERITY}} | {{AFFECTED_ASSET}} | {{SPEC_REF}} | {{CHANGE}} | {{TEST_REF}} | REMEDIATED |

> [!NOTA]
> {{REMEDIATION_TRACEABILITY_NOTE}}

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

> [!NOTA]
> En la revisión final automatizada no se identificaron hallazgos Critical o High dentro
> del alcance y las limitaciones declaradas. Este informe habilita la evaluación final de
> IT, pero no sustituye un pentest formal, la validación de infraestructura de producción
> ni la aprobación corporativa de despliegue.
