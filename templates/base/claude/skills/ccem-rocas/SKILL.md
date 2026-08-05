---
name: ccem-rocas
description: La capa trimestral (rocas y hitos) que precede a CCEM. Explica qué es una roca, cómo se convierte en hitos comprometibles, y cuál de los cuatro comandos (/rock-plan, /rock-status, /rock-close, /export-ninety) usar en cada momento del trimestre. Aplicar al arrancar, cerrar o revisar el estado de una roca, o cuando no está claro si algo es trabajo de rocas (arriba del hito) o de CCEM (hito hacia abajo).
---

# CCEM — Capa de rocas

> **La roca ordena el QUÉ. El hito lo hace comprometible. CCEM diseña el CÓMO técnico.**

Una roca es un compromiso trimestral: un estado verificable a 90 días, con dueño único y
fecha de cierre. Vive en el Vault, no en este repo. La roca se descompone en 5-7 hitos con
formato `<PREFIJO>-H<n>` — es el hito, no la roca, el que se vuelve trabajo técnico: el
hito es la frontera que existe a ambos lados, entre la capa trimestral y CCEM.

De la carpeta de spec **hacia abajo** manda CCEM (`ccem-planner`, `ccem-sdd`). De la roca
**hacia el hito** manda esta capa. Nunca se mezclan: esta skill no toca specs, planes,
tasks ni código; y `ccem-planner` nunca decide la fecha ni el recorte de un hito.

## Los cuatro comandos, en el orden en que se usan

| Cuándo | Comando | Qué hace |
|---|---|---|
| Después de la reunión trimestral, antes de subir un hito a Ninety | `/rock-plan <PREFIJO> [--trimestre Q3Y26]` | Convierte la roca en un plan de 5-7 hitos con fechas, valida las 7 reglas de construcción, y emite los IDs (`<PREFIJO>-H<n>`) que CCEM consume después |
| En la cadencia semanal, antes del L10 | `/rock-status <PREFIJO>` | Deriva el snapshot de la roca desde GitHub — nunca se escribe estado a mano |
| Al cierre del trimestre | `/rock-close <PREFIJO> [--trimestre Q3Y26]` | Completa el mismo YAML de apertura con evidencia por criterio y desviaciones calculadas |
| En el cruce semanal con Ninety | `/export-ninety <PREFIJO>` | Sube solo el nivel hito (nunca specs ni tasks) al tablero ejecutivo |

## Regla que todos respetan

**El agente propone, el dueño decide.** Un compromiso trimestral lo hace una persona, no
un modelo — vale para las fechas de `/rock-plan` y para los criterios de cierre de
`/rock-close`. Ningún comando de esta capa asume un "aprobado" que el dueño no dio.

El detalle completo de reglas, IDs y checklists vive en cada comando (`/rock-plan`,
`/rock-status`, `/rock-close`, `/export-ninety`). Esta skill es el mapa, no el manual.
