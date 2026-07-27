# progress/ — el estado del trabajo, por disco

Esta carpeta es donde los agentes (y los humanos) dejan el **progreso del proyecto**: qué
está en curso, qué se cerró y con qué resultado. Es la materialización del contrato
**"resultados por disco, no por chat"** de `AGENTS.md`: cada agente escribe su salida en un
archivo versionado y devuelve solo una referencia de una línea. El contenido vive en el
repo — trazable, compartible entre personas y entre sesiones.

## Estructura

```
progress/
├── README.md              # este archivo (managed — lo actualiza el harness)
├── current.md             # estado VIVO: el spec y task en curso; lo actualiza el implementer
├── history.md             # historial COMPARTIDO append-only; una línea por task/sesión cerrada
├── model-router.jsonl     # telemetría del Soutec Model Router; lo escribe el orchestrator
└── <ID-hito>-<slug>/      # una subcarpeta por spec en marcha (mismo nombre que specs/ y la rama)
    ├── summary.md         # spec-author: resumen del spec y bloqueos de la fase de diseño
    ├── impl_summary.md    # implementer: trazabilidad requisito↔test, estado y bloqueos
    └── review.md          # reviewer: veredicto, tabla de trazabilidad, cambios requeridos
```

## Quién escribe qué

| Archivo | Autor | Cuándo |
|---|---|---|
| `current.md` | `implementer` | Al arrancar un spec (plan de tasks) y ante un bloqueo. |
| `history.md` | todos los agentes | Una línea al cerrar cada artefacto (ver formato abajo). |
| `model-router.jsonl` | `orchestrator` | Una línea JSONL por lanzamiento de subagente (`ccem-model-router`). |
| `<ID>/summary.md` | `spec-author` | Al terminar cada fase de diseño o al bloquearse. |
| `<ID>/impl_summary.md` | `implementer` | Al cerrar la implementación (`done`/`blocked`). |
| `<ID>/review.md` | `reviewer` | En cada veredicto (`APPROVED`/`CHANGES_REQUESTED`). |

## history.md — formato append-only

Una línea por evento, **siempre al final del archivo**, sin secciones ni tablas:

```
- 2026-07-27 · TNP-H1-T003 · implementer · done · progress/TNP-H1-tienda/impl_summary.md
- 2026-07-27 · TNP-H1-T003 · reviewer · APPROVED · progress/TNP-H1-tienda/review.md
```

Campos: fecha · ID (task o hito) · agente/persona · resultado · referencia al detalle.
Al resolver un conflicto de merge aquí: **conserva ambas líneas y ordena por fecha** — dos
appends nunca se contradicen.

## Regla de arquitectura

Si un task **cambia la arquitectura** (puerto nuevo, contrato público, dependencia entre
capas), su cierre exige dos cosas: (a) el doc correspondiente en `docs/` actualizado y
(b) un ADR en `docs/decisions/` (`/adr-new`). El `implementer` actualiza `docs/` pero no
escribe el ADR (eso es del `spec-author` o del humano): lo declara pendiente en
`impl_summary.md`. El `reviewer` **rechaza** un cambio de arquitectura sin doc + ADR.

## Nota de migración

Versiones previas del harness usaban una convención plana (`impl_<ID>.md`,
`review_<ID>.md`, `spec_<ID>.md` directamente en `progress/`). Si tu repo tiene esos
archivos, muévelos a la subcarpeta del hito cuando los toques — no hay script de migración.
