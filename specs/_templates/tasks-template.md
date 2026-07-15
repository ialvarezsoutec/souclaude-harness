# Tasks: [mismo nombre que spec]

**Spec**: [link a spec.md]
**Plan**: [link a plan.md]
**Estimated total**: [horas]
**Status**: draft | in progress | complete

---

## Reglas de escritura

- **Cada task: 15-30 minutos de trabajo** (implementable y verificable en aislamiento).
- Si un task toma 2+ horas, **fragmentarlo**.
- Si un task toma <5 minutos, **combinarlo con otro**.
- Total típico: 8-20 tasks por feature.
- **Un commit por task.** No en batch al final.

> **Excepción documentada (adaptadores).** Un task que implementa un adaptador completo
> puede llegar a 2-3 horas si es un componente único y verificable en aislamiento, y
> fragmentarlo no mejoraría la testabilidad. Si usas esta excepción, **decilo acá abajo
> y justifícalo**. No es un permiso general para tasks largos.

---

## Task inventory

### T1: [Nombre descriptivo del task]

- **Estimación**: [XX min]
- **Dependencies**: [ninguna | T0, T2]
- **Files**: `[path exacto — ej: src/auth/token.ts]`
- **Descripción**:
  [Lógica concreta en 1-3 líneas — ejemplo: "Implementar función `validateToken`
  que verifique firma JWT y expiración. Retorna `true` si válido, `false` si no."]
- **Verificación**:
  - [ ] [Qué verifica que está bien — ej: "test unitario pasa"]
  - [ ] [Otro criterio de verificación]

---

### T2: [Nombre descriptivo]

- **Estimación**: [XX min]
- **Dependencies**: T1
- **Files**: `[path]`
- **Descripción**: [lógica concreta]
- **Verificación**:
  - [ ] [Criterio]

---

### T3 — T[N]: [continuar según necesario]

---

## Execution order

Diagrama de dependencias (asterisco = puede paralelizarse):

```
T1 ──▶ T2 ──▶ T3
              │
              ▼
         T4 ──▶ T5 ──▶ T6*
                        │
                        T7*
                        │
                        ▼
                        T8 ──▶ T9 ──▶ T10
```

### Paralelización posible
- T6 y T7 pueden ejecutarse en paralelo (subagentes)
- T[X] es independiente de T[Y]

---

## Checkpoints humanos

Pausas obligatorias para review del developer:

- [ ] **Después de T[X]**: verificar estructura base consolidada
- [ ] **Después de T[Y]**: validar contra criterios definidos en spec
- [ ] **Después de T[Z] (final)**: UAT con stakeholder

---

## Estimación total

| Batch | Tasks | Tiempo estimado |
|-------|-------|-----------------|
| Setup | T1-T3 | ~60 min |
| Core logic | T4-T8 | ~3 horas |
| Integration | T9-T11 | ~90 min |
| Testing + docs | T12-T14 | ~90 min |
| **Total** | **14 tasks** | **~7 horas** |

---

## Progreso (actualizar durante ejecución)

- [ ] T1: pendiente
- [ ] T2: pendiente

---

## Checklist antes de declarar "complete"

- [ ] Todos los tasks ejecutados y verificados
- [ ] Tests pasando (unit + integration)
- [ ] Documentación actualizada (`docs/`)
- [ ] ADRs creados si aplica (`/adr-new`)
- [ ] `notes.md` actualizado con hallazgos
- [ ] Stakeholder firmó off (UAT)
- [ ] PR mergeado
- [ ] Status del spec cambiado a `implemented`
