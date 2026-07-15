# Specs — Spec-Driven Development

Especificaciones de features del proyecto, siguiendo **Spec-Driven Development (SDD)**
de CCEM. La skill `ccem-sdd` (en `.claude/skills/`) tiene el detalle operativo.

## Estructura

```
specs/
├── README.md              # este archivo
├── _templates/            # no editar a mano: los gestiona el harness
│   ├── spec-template.md        plan-template.md        tasks-template.md
│   └── spec-lite-template.md   plan-lite-template.md   tasks-lite-template.md
└── <feature-slug>/        # una carpeta por feature
    ├── spec.md            # Fase 1: qué y por qué
    ├── plan.md            # Fase 2: cómo técnico
    └── tasks.md           # Fase 3: descomposición
```

## Las 4 fases

```
Fase 0: Constitution  → docs/constitution.md (una vez por proyecto)
         ↓
Fase 1: Specify       → spec.md   (qué y por qué, sin tech stack)
         ↓
Fase 2: Plan          → plan.md   (cómo técnico, con stack)
         ↓
Fase 3: Tasks         → tasks.md  (descomposición, 15-30 min por task)
         ↓
Fase 4: Implement     → Claude Code ejecuta, con checkpoints humanos
```

## Cuándo aplicar SDD

**SÍ**
- Feature nueva con stakeholders no-técnicos involucrados
- Refactor que toca >3 archivos o >1 sistema
- Cambio que afecta contratos existentes
- Migración (de tecnología, arquitectura, framework)
- Nuevo componente productivo
- Timeline estimado >2 días

**NO**
- Bug fix puntual
- Ajuste cosmético (rename, format, typo)
- Exploración / prototipo desechable
- Script one-off
- Hotfix en producción (ADR post-hoc)

## Arrancar una feature

```
/spec-new mi-feature-nuevo
```

Crea `specs/mi-feature-nuevo/` con los tres archivos desde `_templates/`, ya
prellenados con el slug y la fecha, y arranca la entrevista por Goals y Non-goals.

Para un cambio mediano (4-8 h), usá la variante comprimida:

```
/spec-new mi-cambio --lite
```

SDD Lite usa `spec-lite.md` / `plan-lite.md` / `tasks-lite.md`: ~45 min de overhead
total, contra 2-3 horas del SDD completo. Mismos checkpoints, menos ceremonia.

## Checkpoints humanos

Cada fase tiene un checkpoint obligatorio. No son opcionales: son el punto del método.

- **Después de spec.md** — ¿un stakeholder no-técnico entiende qué se va a construir?
- **Después de plan.md** — ¿alineado con la constitución? ¿data contracts explícitos?
- **Después de tasks.md** — ¿granularidad de 15-30 min? ¿dependencias claras?
- **Durante implement** — review incremental por task. NO en batch al final.

## Histórico

| Feature | Fecha completada | Status |
|---------|------------------|--------|
| [slug] | YYYY-MM-DD | implemented / deprecated |
