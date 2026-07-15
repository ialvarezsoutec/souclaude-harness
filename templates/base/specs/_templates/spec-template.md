# Spec: [Nombre descriptivo del feature]

**Status**: draft | review | approved | implemented | deprecated
**Owner**: [nombre]
**Stakeholders**: [roles/personas que validan]
**Creado**: [YYYY-MM-DD]
**Aprobado**: [YYYY-MM-DD o "pending"]

---

## Reglas de escritura

- **Esta spec describe el QUÉ y el POR QUÉ**, no el CÓMO técnico.
- **NO incluir decisiones de tech stack aquí** — esas van en `plan.md`.
- Un stakeholder no-técnico debería poder leer esta spec y entender qué se construirá.

---

## Context

### Business background

[2-3 párrafos. ¿Qué problema operacional resuelve esto? ¿Qué duele hoy sin este
feature? ¿Cuál es el costo de no construirlo?]

### Why now

[¿Por qué este momento? Trigger de negocio, deadline regulatorio, bloqueo operacional,
oportunidad de mercado, etc.]

---

## Goals

En orden de prioridad:

1. [Outcome medible #1 — ejemplo: "Reducir tiempo de onboarding de usuario nuevo de 20 min a <5 min"]
2. [Outcome medible #2]
3. [Outcome medible #3]

---

## Non-goals

Explícitamente **NO** se construirá:

- [Cosa 1 que podría parecer parte de esto pero no lo es]
- [Cosa 2]
- [Cosa 3]

(Los non-goals son tan importantes como los goals. Si un stakeholder asume algo
que no está aquí, el spec está incompleto.)

---

## User journeys

### Journey 1: [Descripción corta]

**Actor**: [rol/persona]
**Trigger**: [qué inicia este journey]
**Precondiciones**: [qué debe ser verdad antes]

**Pasos**:
1. [Paso 1]
2. [Paso 2]
3. [Paso 3]
4. [...]

**Resultado esperado**: [qué logra el actor al final]
**Edge cases**: [qué pasa si X falla]

---

### Journey 2: [Descripción corta]

[Repetir estructura]

---

## Success criteria

Métricas objetivamente medibles:

- [ ] Métrica 1: [qué se mide y umbral — ej: "95% de usuarios completan onboarding sin abandonar"]
- [ ] Métrica 2: [qué se mide y umbral]
- [ ] Stakeholder [rol] firma off en UAT

---

## Constraints and assumptions

### Constraints (restricciones)

- [Restricción regulatoria]
- [Restricción técnica — ej: "debe funcionar en stack existente sin migraciones"]
- [Timeline hard — ej: "debe estar antes de el MM/YYYY"]

### Assumptions (supuestos explícitos)

- [Asumimos que X está disponible]
- [Asumimos que Y no cambiará durante desarrollo]
- [Asumimos que Z ya fue validado]

---

## Open questions

Decisiones pendientes que requieren stakeholder input:

- [ ] Q1: [pregunta] — asignado a [stakeholder] — deadline [fecha]
- [ ] Q2: [pregunta] — asignado a [stakeholder]

---

## Out of scope (futuro)

Ideas relacionadas que no van en esta iteración pero podrían venir:

- [Idea futura 1 — razón para diferir]
- [Idea futura 2]

---

## Checklist antes de avanzar a Plan

- [ ] ¿Un stakeholder no-técnico lee esto y entiende qué se construirá?
- [ ] ¿No hay decisiones técnicas prematuras (no se menciona tech stack)?
- [ ] ¿Open questions asignadas con dueño y deadline?
- [ ] ¿Success criteria son medibles objetivamente?
- [ ] ¿Non-goals explícitos cubriendo asunciones comunes?
- [ ] ¿Stakeholder firmó off o dio feedback positivo?
