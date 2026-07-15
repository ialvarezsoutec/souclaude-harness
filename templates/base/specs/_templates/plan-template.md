# Plan: [mismo nombre que spec]

**Spec**: [link a spec.md]
**Status**: draft | review | approved | implemented
**Owner**: [developer lead]
**Creado**: [YYYY-MM-DD]
**Aprobado**: [YYYY-MM-DD o "pending"]

---

## Reglas de escritura

- **Aquí SÍ va el CÓMO técnico**: stack, arquitectura, data contracts, risks.
- La spec (`spec.md`) es input — no duplicar goals ni user journeys.
- Este plan debe ser aprobado por el developer lead antes de avanzar a tasks.

---

## Stack decisions

### [Categoría 1 — ej: Backend, Database, API, Frontend]

- Tecnología elegida: [X versión Y]
- Rationale: [por qué X y no alternativas]
- Componentes existentes reutilizados: [lista]
- Componentes nuevos necesarios: [lista]

### [Categoría 2]

- [Repetir estructura]

---

## Architecture

```
[ASCII diagram o referencia a .mermaid file en docs/]

Ejemplo genérico:

┌───────────┐      ┌───────────┐      ┌───────────┐
│  Cliente  │─────▶│ Componente│─────▶│ Componente│
│           │      │     A     │      │     B     │
└───────────┘      └───────────┘      └───────────┘
                          │
                          ▼
                    ┌───────────┐
                    │ Componente│
                    │     C     │
                    └───────────┘
```

Descripción del flujo:
1. [Paso 1 del flujo]
2. [Paso 2]
3. [Paso 3]

---

## Data contracts

### Input

[Qué consume este feature como input. Schemas, fuentes, formatos.]

```
[Schema de ejemplo en el formato que corresponda al stack]
```

### Output

[Qué produce como output.]

```
[Schema de ejemplo]
```

### Transformations clave

Describir la lógica (NO el código):

- [ ] [Transformación 1]
- [ ] [Transformación 2]

---

## Constitution alignment

Verificación contra `docs/constitution.md`, principio por principio.

> **Tildar la casilla no alcanza.** Cada principio se responde **referenciando el ADR
> concreto** que respalda la decisión, o explicando en una línea por qué no aplica.
> Un alignment que solo tiene checkboxes es *alignment teatral*, y es un antipattern
> declarado: se rechaza en review.

| Principio | Veredicto | Cómo aplica · ADR que lo respalda |
|---|---|---|
| **P1** — [arquitectónico] | cumple / no aplica | [en una línea] · `docs/decisions/YYYYMMDD-...` |
| **P2** — [diseño] | | |
| **P3** — Reproducibilidad y validación | | [plan de testing + docs] |
| **P4** — Observability antes que optimización | | [qué métricas, qué logs] |
| **P5** — Cambios destructivos, doble confirmación | | [aplica o no, y por qué] |
| **P6** — Trazabilidad (ADRs) | | [qué ADRs genera este plan] |
| **P7** — Simplicity First | | ¿es el mínimo que resuelve el problema? |
| **P8** — Surgical Changes | | ¿toda modificación traza al spec? |

Si una decisión técnica no está cubierta por ningún ADR existente, **crea el ADR antes
de cerrar el plan** (`/adr-new`). Para evaluar una herramienta nueva antes de decidir,
usá la skill `ccem-research`.

---

## Dependencies

### Deben existir ANTES de empezar
- [ ] [Componente o servicio X] — [razón]
- [ ] [Acceso a recurso Y] — [razón]

### Se crean DURANTE
- [ ] [Componente nuevo Z]

### Se modifican DURANTE
- [ ] [Componente existente A] — [qué cambio]

---

## Risks y mitigaciones

| Risk | Impact | Likelihood | Mitigation |
|------|--------|-----------|------------|
| [Risk 1 — ej: "breaking change en API downstream"] | H/M/L | H/M/L | [Mitigación concreta] |
| [Risk 2] | H/M/L | H/M/L | [Mitigación concreta] |

---

## Research notes

Decisiones consideradas y descartadas:

### D1: [Decisión técnica significativa]

**Decisión**: [qué se eligió]
**Rationale**: [por qué]
**Alternativa descartada**: [qué se consideró y por qué no]

---

## Implementation strategy

### Approach
- [ ] [Rollout: big bang / incremental / paralelo]
- [ ] [Feature flag o no — justificación]
- [ ] [Test strategy: unit + integration + e2e según aplique]

### Rollback plan
Si el feature falla en producción:
1. [Paso de rollback 1]
2. [Paso de rollback 2]

---

## Observability

- **Métricas**: [qué se mide para saber si funciona]
- **Logs**: [qué se loggea y a qué nivel]
- **Alertas**: [qué condiciones disparan alerta]
- **Dashboard**: [link o descripción del que se creará]

---

## Checklist antes de avanzar a Tasks

- [ ] ¿Plan alineado con constitución (verificado punto por punto)?
- [ ] ¿Data contracts completos y sin ambigüedad?
- [ ] ¿Risks identificados con mitigación concreta (no genérica)?
- [ ] ¿Dependencies verificadas como existentes o planeadas?
- [ ] ¿Developer lead aprobó el plan?
- [ ] ¿ADRs creados para decisiones significativas? (`/adr-new`)
