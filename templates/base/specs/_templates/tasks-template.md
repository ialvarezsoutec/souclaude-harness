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
- **Un commit por task**, con footer `Refs: <ID-task>` en el cuerpo. No en batch al final.
- **ID de task**: `<ID-hito>-T<nnn>` (ej. `TNP-H1-T001`). Numeración por **bloques de 100
  según el orden de reserva del spec en `/rock-plan`**: 1.er spec del hito desde `T001`,
  2.º desde `T101`, 3.º desde `T201`. Un spec creado fuera de `/rock-plan` toma el
  siguiente centenar libre (`grep -r "<ID-hito>-T" specs/<ID-hito>-*/`). Dentro del
  archivo, las referencias cortas (`T001`) bastan; el ID completo va en encabezados,
  progreso, commits y telemetría.

> **Excepción documentada (adaptadores).** Un task que implementa un adaptador completo
> puede llegar a 2-3 horas si es un componente único y verificable en aislamiento, y
> fragmentarlo no mejoraría la testabilidad. Si usas esta excepción, **dilo acá abajo
> y justifícalo**. No es un permiso general para tasks largos.

---

## Task inventory

### <ID-hito>-T001: [Nombre descriptivo del task]

- **Estimación**: [XX min]
- **Dependencies**: [ninguna | T002, T003]
- **Files**: `[path exacto — ej: src/auth/token.ts]`
- **Descripción**:
  [Lógica concreta en 1-3 líneas — ejemplo: "Implementar función `validateToken`
  que verifique firma JWT y expiración. Retorna `true` si válido, `false` si no."]
- **Verificación**:
  - [ ] [Qué verifica que está bien — ej: "test unitario pasa"]
  - [ ] [Otro criterio de verificación]

---

### <ID-hito>-T002: [Nombre descriptivo]

- **Estimación**: [XX min]
- **Dependencies**: T001
- **Files**: `[path]`
- **Descripción**: [lógica concreta]
- **Verificación**:
  - [ ] [Criterio]

---

### <ID-hito>-T003 — T[NNN]: [continuar según necesario]

---

## Execution order

Diagrama de dependencias (asterisco = puede paralelizarse):

```
T001 ──▶ T002 ──▶ T003
                   │
                   ▼
             T004 ──▶ T005 ──▶ T006*
                                │
                                T007*
                                │
                                ▼
                                T008 ──▶ T009 ──▶ T010
```

### Paralelización posible
- T006 y T007 pueden ejecutarse en paralelo (subagentes)
- T[XXX] es independiente de T[YYY]

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
| Setup | T001-T003 | ~60 min |
| Core logic | T004-T008 | ~3 horas |
| Integration | T009-T011 | ~90 min |
| Testing + docs | T012-T014 | ~90 min |
| **Total** | **14 tasks** | **~7 horas** |

---

## Progreso (actualizar durante ejecución)

- [ ] <ID-hito>-T001: pendiente
- [ ] <ID-hito>-T002: pendiente

---

## Checklist antes de declarar "complete"

- [ ] Todos los tasks ejecutados y verificados
- [ ] Tests pasando (unit + integration)
- [ ] Documentación actualizada (`docs/`)
- [ ] ADRs creados si aplica (`/adr-new`) — **obligatorio si algún task cambió la
      arquitectura** (puerto nuevo, contrato público, dependencia entre capas): doc en
      `docs/` + ADR, o el `reviewer` rechaza
- [ ] `notes.md` actualizado con hallazgos
- [ ] Stakeholder firmó off (UAT)
- [ ] PR mergeado
- [ ] Status del spec cambiado a `implemented`
