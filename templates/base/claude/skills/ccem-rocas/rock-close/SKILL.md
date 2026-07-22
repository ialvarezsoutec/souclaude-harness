---
name: rock-close
description: Paso 4 de la metodología de rocas. Completa el mismo YAML de la apertura con estado, evidencias, desviaciones calculadas, lecciones y firma, y genera el informe de cierre con el renderer existente. Exige evidencia por criterio antes de marcar cumplido. Aplicar al cierre del trimestre.
argument-hint: <PREFIJO> [--trimestre Q3Y26]
disable-model-invocation: true
---

# /rock-close

Capa: **rocas**. Corre al cierre del trimestre. Completa el **mismo archivo** que abrió
`/rock-plan` — no se escribe un documento nuevo.

## 1. Mismo YAML, campos de cierre

Se completan los bloques `[CIERRE]` del `roca_<TRIMESTRE>_<PREFIJO>.yaml`: `estado`,
`evidencias`, `desviaciones`, `lecciones`, `proxima_roca`, `firma`, y `cumplido` en cada
criterio.

Como los criterios estaban **congelados desde t=0**, la evaluación es contra el plan original y
no contra una reconstrucción posterior. Por eso importa que la apertura no se haya tocado.

## 2. Las desviaciones se calculan, no se narran

`desviaciones.calculadas` = `fecha_real - fecha_plan` por hito. **No se escribe a mano**: lo
genera el exporter (viene de `/rock-status`). El texto libre de `desviaciones.explicacion` sólo
explica el **porqué**, nunca el qué.

## 3. Evidencia por criterio (E5)

**No se marca `cumplido` en un criterio sin evidencia registrada.** Cada criterio necesitaba un
método de verificación en la apertura (test, demo grabada, log, firma de tercero, métrica con
umbral). Al cerrar, ese método tiene que tener su evidencia enlazada en `evidencias.items` o en
`evidence/` del Vault. Sin evidencia, el criterio no se marca cumplido: se marca `parcial` o
`false` con nota.

- [ ] Cada criterio con `cumplido: true` tiene al menos un item de evidencia que lo respalda.
- [ ] La evidencia ejecutiva está en `evidence/` del Vault; la técnica se queda en el repo.

## 4. Informe

El informe de cierre se genera con el **renderer existente** (mismo esquema apertura/cierre). No
se redacta a mano: los datos ya existen en el YAML.

`completion_percentage` = criterios cumplidos / criterios totales. Derivado, no escrito.

## 5. Roca derivada y retro

`proxima_roca` registra la roca que hereda el trabajo, si la hay. La retrospectiva del cierre
alimenta la apertura del trimestre siguiente — nunca se aplica a mitad de camino.

## Reglas

- No editar los criterios congelados al cerrar. Si hubo que cambiarlos, eso fue un ADR y una
  desviación durante la ejecución, no una edición ahora.
- No marcar `cumplido` sin evidencia. Es la única compuerta dura del cierre.
- Alcance: nivel hito y roca. La evidencia técnica detallada vive en el repo, no acá.
