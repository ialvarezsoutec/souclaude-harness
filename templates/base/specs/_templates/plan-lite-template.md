# Plan Lite: [mismo nombre que spec-lite]

**Spec**: [link a spec-lite.md]
**Status**: draft | approved | implemented
**Owner**: [nombre]

> SDD Lite. Objetivo de tiempo: **15 minutos**.

---

## Cambios concretos

Qué se toca, archivo por archivo. Si no sabes qué archivos vas a tocar, todavía
no estás listo para planificar.

| Archivo | Cambio |
|---------|--------|
| `[path]` | [qué cambia y por qué] |
| `[path]` | [qué cambia y por qué] |

## Decisiones técnicas

- **[Decisión]**: [qué se eligió y por qué]. Descartado: [alternativa] porque [razón].

## Risks

| Risk | Mitigación |
|------|------------|
| [Qué puede salir mal] | [Qué hacemos al respecto] |

## Constitution check

- [ ] **P5** — ¿Hay algo destructivo acá? ¿Está el backup / la doble confirmación?
- [ ] **P6** — ¿Alguna decisión merece un ADR? (`/adr-new`)
- [ ] **P7** — ¿Es el mínimo que resuelve el problema? ¿Sobra alguna abstracción?
- [ ] **P8** — ¿Cada archivo de la tabla traza directo al spec? Si uno no traza, sácalo.

## Rollback

Si esto rompe algo: [cómo se vuelve atrás, en una línea]

---

## Checklist antes de avanzar a tasks-lite

- [ ] ¿La tabla de archivos está completa?
- [ ] ¿Los 4 principios del constitution check están respondidos, no tildados a ciegas?
