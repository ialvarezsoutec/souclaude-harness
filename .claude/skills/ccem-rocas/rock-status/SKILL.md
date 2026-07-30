---
name: rock-status
description: Genera el snapshot semanal de una roca y el Project-State.md derivado desde GitHub. Falla a propósito si detecta un campo derivado editado a mano. Aplicar en la cadencia semanal, antes del L10. No escribe estado a mano: lo deriva.
argument-hint: <PREFIJO>
disable-model-invocation: true
---

# /rock-status

Capa: **rocas**. Corre semanal, antes del L10. Es el detector de decaimiento de la metodología.

## 1. Lo que se deriva, se deriva

`Project-State.md` es un **archivo generado**. Nadie lo edita. Si alguien lo edita, este job
**falla a propósito**: el modo de falla que previene es el sistema que se ve impecable tres
semanas y después miente sin que nadie lo note, porque el PDF se sigue generando igual de bonito
con datos falsos.

**Se deriva, y escribirlo a mano está prohibido:**

| Campo | Se calcula desde |
|---|---|
| Estado de un spec | GitHub: rama abierta, PR abierto, PR mergeado |
| `fecha_real` de hito | Cierre de la última tarjeta (PR) del hito |
| `pr_url`, rama, tag | GitHub |
| `specs_totales`, `cerrados`, `bloqueados` | GitHub |
| `completion_percentage` | Criterios cumplidos / criterios totales |
| `desviaciones.calculadas` | `fecha_real - fecha_plan` |
| `ultima_sincronizacion` | El propio exporter |

**Se escribe a mano (intención):** contexto · criterios de aceptación · no-alcance ·
decisiones · riesgos y mitigaciones · `fecha_plan` de los hitos · lecciones · la explicación de
una desviación.

## 2. Qué produce

- El snapshot de la roca (estado derivado de GitHub para cada hito y spec).
- `Project-<PREFIJO>/Project-State.md`, generado, no editable.

## 3. Qué revisar en la cadencia semanal

Qué hitos se movieron. A Ninety van **sólo**: bloqueos que requieren decisión ejecutiva, riesgos
de impacto alto, y valores del Scorecard. Nada de detalle técnico. El cruce con Ninety es
manual (Fase 0); ver `/export-ninety`.

## 4. Chequeo de integridad (E2)

Antes de regenerar, comparar cada campo derivado del `Project-State.md` actual contra lo que
GitHub dice hoy. Si un campo derivado fue editado a mano (no coincide con su fuente), **falla y
reporta cuál**. No lo sobrescribas en silencio: el punto es detectar que alguien intentó escribir
estado a mano.

## 5. Aviso de auditoría (E3)

Ramas sin movimiento en 14 días → avisar (no bloquear). Es señal de trabajo estancado, no falla.

## Reglas

- Alcance: nivel hito y arriba. No baja a tasks.
- Nunca escribas a mano un campo de la tabla de §1. Deriva o falla.
