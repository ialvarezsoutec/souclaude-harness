---
name: export-ninety
description: Contrato de integración entre la capa de rocas y Ninety. Define qué cruza al nivel ejecutivo (rocas, hitos, issues, to-dos, scorecard) y qué nunca (specs, tasks). Por fases; lectura antes que escritura. Fase 0 es manual y deliberada. Aplicar al preparar el cruce semanal con Ninety.
argument-hint: <PREFIJO>
disable-model-invocation: true
---

# /export-ninety

Capa: **rocas**. Es el contrato con Ninety, no un exportador que se construye de una.

## 1. Qué cruza y qué no

Ninety recibe: **rocas, hitos, issues ejecutivos, to-dos con dueño y fecha, y scorecard.**
**No recibe specs ni tasks. Nunca.** Sólo cruza el nivel hito. El antipatrón es Ninety como
Jira disfrazado: exportar tarjetas y saturar el L10 con detalle operativo.

El vínculo es por convención de texto: `[<PREFIJO>]` como prefijo de título (la API v1 no tiene
campos personalizados).

## 2. Las fases, en orden

- **Fase 0 — manual.** Todo se sube a mano desde el snapshot de `/rock-status`. No es una
  carencia: obliga a un humano a mirar los números una vez por semana, y hoy ése es el único
  detector de decaimiento. **No la elimines antes de tener otro.**
- **Fase 1 — lectura.** Pull de rocas y hitos desde la API hacia el Vault. Da contexto ejecutivo
  al agente sin transcripción humana.
- **Fase 2 — Scorecard.** Push de KPIs desde el lakehouse. Escritura pura, recurrente y
  determinística. Es el caso que gana claro.
- **Fase 3 — Issues y To-Dos.** Probablemente nunca, mientras la API v1 asigne todo al dueño del
  token: un export automático produce to-dos que en el L10 aparecen todos a nombre de una sola
  persona, y eso destruye el accountability que es justo para lo que se usa Ninety.

## 3. Disparadores para pasar de Fase 0

Sólo se construye la API con al menos uno de estos (metodología §12, Fase 3):

- Cuatro o más rocas concurrentes bajo la metodología.
- KPIs del Scorecard que ya viven en el lakehouse.
- El agente necesita leer estado ejecutivo sin intermediario humano.

Si no se cumple ninguno, **no se construye**. Antes de construir nada, pasar la grilla de 7
criterios de `ccem-research`.

## 4. Restricciones de la API v1

- Requiere plan Thrive.
- Sin webhooks (hace falta polling).
- No se pueden borrar Milestones.
- Sin campos personalizados → vínculo por convención de texto (`[<PREFIJO>]`).
- Los tokens expiran como máximo a los 365 días.

**Desde el día uno**, aunque no se toque la API: dejar `ninety_rock_id`, `ninety_milestone_id`
y `ultima_sincronizacion` en los archivos, vacíos.

## 5. No agregar un cuarto sistema

No agregar un gestor de tareas intermedio (Asana, ClickUp, Monday, Microsoft To-Do) aunque
Ninety ofrezca sincronización nativa. Ya hay tres sistemas con un rol claro (Vault, GitHub,
Ninety); un cuarto sólo agrega una fuente de verdad más.

## Reglas

- Sólo cruza el nivel hito. Specs y tasks nunca suben.
- Fase 0 manual hasta que el dato sea confiable. Automatizar antes propaga la podredumbre más
  rápido y con más autoridad.
