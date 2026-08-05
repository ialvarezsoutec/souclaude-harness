# Spec: Harness v2.0.0 — capa de rocas (el hito reemplaza a Planner)

**Status**: approved
**Owner**: Ignacio A
**Stakeholders**: coordinador del harness, dueños de roca de los repos consumidores
**Creado**: 2026-07-22
**Aprobado**: 2026-07-22

---

## Reglas de escritura

- Esta spec describe el QUÉ y el POR QUÉ, no el CÓMO técnico.
- Las decisiones de implementación (manifest, rename, versionado) viven en `plan.md`.

---

## Context

### Business background

La organización cerró una metodología nueva —**Metodología de Roca v2.1.0**— que define la
capa trimestral ejecutiva que se sienta encima de CCEM: la roca nace en la reunión trimestral,
se descompone en 5-7 **hitos**, y el hito emite el ID que amarra `spec → rama → PR → tag`. Esa
metodología **elimina Microsoft Planner** del flujo.

El harness (1.1.0) que se distribuye a todos los repos SOUTEC asume lo contrario: está
construido sobre Planner como emisor de IDs y tablero de estados. Mientras el harness diga eso,
cada `upgrade` propaga a los repos hijos una instrucción que ya no es cierta. El costo de no
corregirlo es que la herramienta que debería hacer cumplir la metodología enseña una versión
vieja de ella.

### Why now

La metodología está lista para implementar y la dirección quiere arrancar el piloto (Fase 1 de
§12) con una roca real. La Fase 0 de esa metodología exige, textualmente, reescribir la skill
de trazabilidad y bumpear el harness antes de que ningún repo consumidor reciba la instrucción
correcta. El harness es el prerrequisito del piloto.

---

## Goals

En orden de prioridad:

1. **El harness deja de mentir sobre el emisor de IDs.** Ningún artefacto distribuido
   (`ccem-planner`, `spec-new`, `soutec-github`, agentes, `CLAUDE.md`) presenta a Planner como
   el origen del identificador; el hito (`<PREFIJO>-H<n>`) lo reemplaza de punta a punta.
2. **La capa de rocas llega a los repos por el canal existente.** Un paquete `ccem-rocas` con
   los comandos `/rock-plan`, `/rock-status`, `/rock-close`, `/export-ninety` se distribuye vía
   el manifest del harness, sin un segundo canal.
3. **`/rock-plan` hace cumplir las reglas de construcción de hitos** (R1-R7 y el checklist de
   la plantilla de apertura) antes de dejar exportar, para que un plan mal formado se detenga
   en el Paso 2 y no en la semana 9.
4. **El cambio queda versionado como breaking change** (`2.0.0`), coherente en las tres fuentes
   de versión, para que los repos consumidores sepan que `upgrade` trae un cambio de metodología.

---

## Non-goals

Explícitamente **NO** se construirá en esta iteración:

- **El repo Vault ni su contenido** (`00-System`, `id-registry.md`, `plantilla_apertura_roca.yaml`).
  Vive en un repo aparte; esta spec cubre solo el repo de código/harness.
- **Los jobs semanales E2/E3** (snapshot que falla ante campos derivados editados, aviso de
  ramas sin movimiento). Corren en el Vault.
- **El chequeo de cierre de hito E5** (no marcar `cumplido` sin evidencia). Depende del Vault.
- **La integración con la API de Ninety** (Fases 1-3 de §11). Solo se documenta el contrato y
  se deja Fase 0 manual.
- **Un validador CLI ejecutable** para E1/E4. La validación de `/rock-plan` se hace como skill
  que el agente ejecuta, no como código en `src/`.
- **Renombrar `ccem-planner` a `ccem-hitos`.** Se reescribe el contenido conservando el nombre
  (ver ADR 20260722, Alternativa A).
- **Tocar el motor del harness** (`plan.js`/`apply.js`). El cambio entra como contenido +
  manifest.
- **Llenar P7/P8 de la constitución** con reglas de la capa trimestral (metodología §9).

---

## User journeys

### Journey 1: Un dueño planifica su roca del trimestre

**Actor**: dueño de una roca (rol ejecutivo, no necesariamente técnico)
**Trigger**: terminó la reunión trimestral y tiene el enunciado verificable de la roca
**Precondiciones**: el prefijo del proyecto existe en el registro de prefijos

**Pasos**:
1. Invoca `/rock-plan` y aporta las 6 entradas obligatorias (enunciado, dueño+fecha, punto de
   partida, restricciones, no-alcance, definición de Done).
2. El agente propone 5-7 hitos como estados verificables, más uno de descarte, sin fechas.
3. El dueño pone las fechas.
4. El comando valida R1-R7 y el checklist de la plantilla.

**Resultado esperado**: un plan de roca válido, con hitos que emiten IDs `<PREFIJO>-H<n>`, listo
para subir a Ninety a mano.
**Edge cases**: si hay 4 hitos, o el primero cae en semana 6, o un título empieza con verbo de
actividad, o el prefijo no está registrado → el comando se detiene y explica qué corregir; no
exporta a medias.

### Journey 2: Un implementador arranca el trabajo de un hito

**Actor**: dev / agente implementador
**Trigger**: llega el momento de ejecutar un hito ya planificado
**Precondiciones**: el hito tiene ID, criterios de aceptación congelados y no-alcance

**Pasos**:
1. Se crea la rama `tipo/<ID-hito>-<slug>` (nunca sin ID).
2. Se genera el spec con el contrato de entrada del hito (criterios heredados, no-alcance,
   entregable, rollback).
3. Se trabaja task por task bajo CCEM.

**Resultado esperado**: `grep -r <ID-hito> specs/` y `git log --grep=<ID-hito>` devuelven lo
mismo; el hilo está íntegro sin que Planner aparezca en ningún lado.
**Edge cases**: si no hay ID de hito, el flujo se detiene y lo pide; no lo inventa.

### Journey 3: Un repo consumidor recibe la v2.0.0

**Actor**: mantenedor de un repo SOUTEC ya inicializado con el harness
**Trigger**: corre `souclaude upgrade`

**Pasos**:
1. El motor detecta la versión nueva y calcula los veredictos.
2. Las skills reescritas se marcan `update`; el paquete `ccem-rocas` se marca `create`.
3. Los archivos que el usuario editó no se pisan en silencio.

**Resultado esperado**: el repo queda con la metodología de rocas vigente y sin referencias a
Planner, en un solo upgrade.

---

## Success criteria

- [ ] `grep -ri "planner"` sobre los artefactos distribuidos no devuelve ninguna ocurrencia que
      presente a Planner como emisor de IDs o tablero de estados.
- [ ] El paquete `ccem-rocas` existe con sus 4 comandos y **cada archivo está registrado en el
      manifest** con `policy: managed`.
- [ ] `/rock-plan` rechaza de forma verificable un plan con 4 hitos (R1), con el primer hito en
      semana 6 (R2), o con un prefijo no registrado.
- [ ] Las tres fuentes de versión marcan `2.0.0` y el CHANGELOG describe el breaking change.
- [ ] `souclaude status` sale en exit 0 y la suite de `test/` queda verde tras el bump.
- [ ] P7/P8 de la constitución siguen intactos como placeholder.
- [ ] Owner firma off.

---

## Constraints and assumptions

### Constraints

- El harness es un generador: el cambio debe entrar como **contenido** (skills + manifest), sin
  tocar `plan.js`/`apply.js`.
- Doble árbol obligatorio: cada skill/agente vive en `templates/base/…` (fuente) y en `.claude/…`
  (copia instalada); ambos deben quedar coherentes.
- Los ADR de CCEM son inmutables: el de orquestación se supersede, no se edita (ya hecho en B0).
- Alcance limitado al repo de código; nada del Vault ni de Ninety se construye aquí.

### Assumptions

- El prefijo `SHS` fue dado de alta por el dueño (ID de esta tarjeta: `SHS-001`).
- La plantilla de apertura de roca y el registro de prefijos existen (o existirán) en el Vault;
  esta spec solo referencia sus reglas, no los crea.
- Los repos consumidores están en 1.1.0 y aceptan un breaking change en el próximo upgrade.

---

## Open questions

- [x] Q1: ¿El paquete `ccem-rocas` se estructura como un `SKILL.md` paraguas con sub-skills
      `rock-*`, o como cuatro skills-comando independientes? — **Resuelto (2026-07-22): cuatro
      skills-comando independientes** (`rock-plan`, `rock-status`, `rock-close`, `export-ninety`),
      cada una con `disable-model-invocation`, siguiendo el patrón de `spec-new`/`adr-new`.

---

## Out of scope (futuro)

- Rename `ccem-planner` → `ccem-hitos` (reevaluar si el nombre genera confusión real).
- Validador CLI determinístico para E1/E4 (pasaría antes por `ccem-research`).
- Fases 1-3 de Ninety, con sus disparadores de §12.
- GitHub Issues como reemplazo del tablero, "cuando lo pida el piloto" (§4.1).

---

## Checklist antes de avanzar a Plan

- [ ] ¿Un stakeholder no-técnico lee esto y entiende qué se construirá?
- [x] ¿No hay decisiones técnicas prematuras (no se menciona tech stack)?
- [x] ¿Open questions asignadas con dueño?
- [x] ¿Success criteria son medibles objetivamente?
- [x] ¿Non-goals explícitos cubriendo asunciones comunes?
- [ ] ¿Stakeholder firmó off o dio feedback positivo?
