---
name: it-security-review
version: 1.0.0
description: Ejecuta el /security-review nativo de Claude Code, coordina la remediación SDD de hallazgos Critical/High y genera un PDF de evidencia para IT solo después de superar el gate final.
argument-hint: "[scope opcional: full | branch | diff | ruta-o-modulo]"
disable-model-invocation: true
effort: high
allowed-tools:
  - Skill(security-review)
  - Agent(leader)
  - Agent(security-evidence-compiler)
  - Read
  - Grep
  - Glob
  - Write
  - Edit
  - Bash(git status *)
  - Bash(git rev-parse *)
  - Bash(git branch *)
  - Bash(git diff *)
  - Bash(git log *)
---

# IT Security Review Workflow

Este workflow se inicia exclusivamente cuando un humano ejecuta:

```text
/it-security-review $ARGUMENTS
```

No reemplaces ni sobrescribas el comando nativo `/security-review`. Debes invocarlo mediante el `Skill` tool como parte de este proceso.

## Objetivo

Producir evidencia técnica compartible con IT de que:

1. se ejecutó el security review nativo de Claude Code;
2. todo hallazgo `Critical` o `High` fue corregido mediante el proceso SDD;
3. se ejecutaron las pruebas aplicables;
4. se repitió el security review después de los cambios;
5. el reporte PDF solo fue generado después de superar el gate final.

El PDF no debe afirmar que la aplicación es “completamente segura” ni funcionar como certificación absoluta. Debe declarar con precisión que no se detectaron hallazgos `Critical` o `High` dentro del alcance y limitaciones de la revisión final.

## Alcance

Resuelve `$ARGUMENTS` así:

- vacío o `full`: repositorio completo;
- `branch`: rama actual frente a su upstream o base disponible;
- `diff`: cambios no confirmados y commits de la rama frente a su base;
- ruta, módulo o componente: foco principal limitado a ese elemento, incluyendo sus dependencias de seguridad relevantes.

Declara siempre exclusiones, supuestos y limitaciones.

## Directorio de evidencia

Crea un directorio nuevo por ejecución:

```text
artifacts/security/YYYY-MM-DD_HHMMSS/
```

No sobrescribas evidencia de ejecuciones anteriores.

Dentro del directorio conserva, como mínimo:

```text
00-run-metadata.md
01-initial-security-review.md
02-remediation-spec.md              # solo cuando aplique
03-remediation-summary.md           # solo cuando aplique
04-test-evidence.md
05-final-security-review.md
IT-Security-Review.md               # solo si el gate final pasa
IT-Security-Review.pdf              # solo si el gate final pasa
SECURITY-REVIEW-BLOCKED.md          # solo si el gate no pasa
```

La ubicación real del spec SDD puede ser otra si la metodología del repositorio ya define una convención. En ese caso, `02-remediation-spec.md` debe contener un enlace o referencia inequívoca a la ruta oficial.

## Fase 1 — Registrar metadata

Antes de revisar, registra sin modificar el repositorio:

- fecha y hora local y UTC;
- nombre del proyecto o repositorio;
- alcance resuelto;
- rama actual;
- commit HEAD;
- rama base o upstream cuando pueda determinarse;
- estado del working tree;
- archivos modificados relevantes;
- versión de Claude Code cuando esté disponible sin instalar nada;
- limitaciones conocidas del ambiente.

Nunca copies valores de secretos, tokens, contraseñas, llaves privadas ni connection strings. Redáctalos.

## Fase 2 — Security review inicial nativo

Invoca el skill nativo `security-review` mediante el Skill tool.

Pásale el alcance resuelto y solicita que:

- inspeccione vulnerabilidades y controles de seguridad;
- incluya severidad, evidencia, ubicación e impacto;
- separe hallazgos confirmados de dudas o gaps de cobertura;
- no aplique cambios durante esta primera revisión;
- entregue una salida suficientemente detallada para remediación y auditoría.

Guarda la salida completa, sin reinterpretarla, en:

```text
01-initial-security-review.md
```

Después crea una tabla normalizada de hallazgos con:

- ID;
- severidad;
- título;
- archivo o componente;
- estado inicial;
- evidencia;
- acción requerida.

Si la severidad de un hallazgo potencial no está clara, no lo rebajes por conveniencia. Trátalo como `Needs validation` y resuélvelo antes de declarar el gate como aprobado.

## Gate de remediación

### Bloqueantes

La existencia de cualquiera de los siguientes impide generar el PDF final:

- al menos un hallazgo `Critical` abierto;
- al menos un hallazgo `High` abierto;
- pruebas obligatorias fallidas;
- review final incompleto o no verificable;
- gap de cobertura que impida evaluar razonablemente un control crítico;
- secretos de producción expuestos que aún no hayan sido revocados o rotados;
- cambios de seguridad sin prueba de regresión o validación equivalente.

### No bloqueantes para crear el PDF, pero obligatorios en el reporte

- hallazgos `Medium` abiertos;
- hallazgos `Low`;
- observaciones `Informational`;
- riesgos aceptados explícitamente;
- limitaciones de cobertura que no impidan evaluar los controles críticos.

Un `Medium` abierto produce el estado `READY WITH CONDITIONS`, nunca una declaración limpia de aprobación.

## Fase 3 — Remediación SDD de Critical/High

Si no existen hallazgos `Critical` o `High`, omite esta fase y continúa con pruebas y review final.

Si existen, invoca al agente `leader` en primer plano. Entrégale el reporte inicial completo y esta misión:

```text
HUMAN_TRIGGER=/it-security-review

Crear y ejecutar un plan de remediación de seguridad siguiendo la metodología SDD del repositorio.

Obligaciones:
1. Crear o actualizar un spec SDD que cubra cada hallazgo Critical y High.
2. Mapear cada hallazgo a requisitos verificables, diseño, tareas, pruebas, observabilidad, rollout y rollback.
3. Delegar la implementación a los subagentes apropiados.
4. Implementar las correcciones; no limitarse a redactar el spec.
5. Añadir pruebas de regresión y controles negativos.
6. Ejecutar las pruebas aplicables y registrar comandos y resultados.
7. No ocultar, suprimir ni rebajar hallazgos para superar el gate.
8. No editar el reporte original del security review.
9. Devolver rutas de archivos modificados, spec creado, pruebas ejecutadas, resultados y riesgos residuales.
```

Registra la ruta del spec en `02-remediation-spec.md` y el resultado del leader en `03-remediation-summary.md`.

Para secretos expuestos, eliminar el valor del código no basta. El leader debe tratar revocación o rotación, limpieza segura, configuración correcta y prevención de recurrencia. Si la rotación requiere una acción humana o de IT no disponible, el gate permanece bloqueado.

## Fase 4 — Pruebas

Ejecuta las pruebas apropiadas para el stack y el alcance, siguiendo primero las instrucciones del repositorio.

Incluye cuando apliquen:

- pruebas unitarias;
- integración;
- autorización por rol o tenant;
- validación de entradas;
- regresiones específicas de los hallazgos;
- lint y type checking;
- build de producción;
- pruebas de infraestructura o configuración;
- escaneo de dependencias ya disponible en el proyecto.

No instales herramientas nuevas solo para decorar el reporte. Si una herramienta necesaria no está disponible, registra la limitación y determina si bloquea el gate.

Guarda en `04-test-evidence.md`:

- comando exacto;
- fecha;
- resultado;
- resumen de errores;
- archivos de log relevantes;
- qué hallazgo valida cada prueba de seguridad.

Cualquier prueba obligatoria fallida bloquea el PDF.

## Fase 5 — Security review final nativo

Después de la remediación y las pruebas, invoca nuevamente el skill nativo `security-review` con el mismo alcance.

Solicita explícitamente que:

- revise el estado actual del código, no el reporte anterior;
- verifique las rutas afectadas por los hallazgos iniciales;
- busque regresiones o vulnerabilidades introducidas por las correcciones;
- reporte severidad, evidencia y cobertura;
- no confunda una prueba existente con evidencia suficiente si el control sigue siendo evadible.

Guarda la salida completa en:

```text
05-final-security-review.md
```

## Ciclo de remediación

Si el review final mantiene o introduce hallazgos `Critical` o `High`:

1. no generes el PDF;
2. entrega los hallazgos al `leader` para actualizar el spec e implementar la siguiente iteración;
3. vuelve a ejecutar pruebas;
4. vuelve a ejecutar el security review nativo.

Máximo: tres ciclos de remediación en una misma ejecución.

Si después de tres ciclos persisten bloqueantes, o si el leader falla, crea únicamente:

```text
SECURITY-REVIEW-BLOCKED.md
```

Debe incluir:

- estado `NOT READY FOR IT REVIEW`;
- bloqueantes pendientes;
- intentos realizados;
- pruebas fallidas o cobertura insuficiente;
- acción humana requerida;
- rutas de la evidencia generada.

No generes un PDF “preliminar”, “draft” o “con observaciones” mientras exista un `Critical` o `High`. Cambiarle el apellido al PDF no vuelve segura la aplicación.

## Fase 6 — Gate final

El gate pasa únicamente cuando:

- el review final no contiene `Critical` ni `High` abiertos;
- las pruebas obligatorias pasan;
- no existe un gap que impida verificar un control crítico;
- cualquier secreto expuesto fue revocado o rotado, no solo removido del código;
- existe trazabilidad entre hallazgos, cambios y pruebas.

Estado final:

- `READY FOR IT REVIEW`: cero `Critical`, `High` y `Medium` abiertos;
- `READY WITH CONDITIONS`: cero `Critical` y `High`, pero existen `Medium`, riesgos aceptados o limitaciones no críticas;
- `NOT READY FOR IT REVIEW`: cualquier condición bloqueante.

La aprobación final de producción sigue perteneciendo a IT.

## Fase 7 — Generar evidencia y PDF

Solo después de pasar el gate, invoca al agente `security-evidence-compiler` en primer plano.

Incluye en la delegación:

```text
FINAL_SECURITY_GATE=PASSED
```

Pásale:

- ruta del directorio de evidencia;
- metadata;
- review inicial;
- spec y resumen de remediación cuando existan;
- resultados de pruebas;
- review final;
- estado final calculado.

El agente escribe `IT-Security-Review.md` con el formato de autoría de la skill
`soutec-md-a-pdf` y genera el PDF invocando esa misma skill (motor `md_to_pdf.py`,
ReportLab). No le pases ni uses un renderer embebido.

El agente debe generar:

```text
IT-Security-Review.md
IT-Security-Review.pdf
```

Verifica después:

- ambos archivos existen;
- el PDF comienza con la firma `%PDF-`;
- el PDF tiene tamaño mayor que cero;
- el reporte no contiene secretos sin redactar;
- el estado del PDF coincide con el gate;
- los hallazgos iniciales corregidos aparecen como remediados, no eliminados del historial;
- cualquier `Medium` pendiente aparece claramente en condiciones o riesgo residual.

## Respuesta final al humano

Si el gate pasa, devuelve:

```markdown
# IT Security Review Completed

- Status: READY FOR IT REVIEW | READY WITH CONDITIONS
- Scope: <alcance>
- Initial findings: <conteos>
- Remediated Critical/High: <conteos>
- Remaining Medium/Low: <conteos>
- Tests: PASSED
- Markdown report: <ruta>
- PDF report: <ruta>
- IT approval: PENDING
```

Si el gate no pasa, devuelve:

```markdown
# IT Security Review Blocked

- Status: NOT READY FOR IT REVIEW
- Scope: <alcance>
- Blocking findings: <conteos y IDs>
- Tests: PASSED | FAILED | INCOMPLETE
- Blocked report: <ruta>
- PDF report: NOT GENERATED
- Required action: <acción concreta>
```

Nunca presentes el resultado como certificación, pentest formal o garantía absoluta de seguridad.
