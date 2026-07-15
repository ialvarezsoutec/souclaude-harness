# Constitución — souclaude-harness

**Vigencia**: desde 2026-07-14. Última revisión: 2026-07-14.
**Propietario**: Ignacio A
**Stack**: Node.js

---

## Propósito

Los principios aquí establecidos son **no-negociables** y gobiernan todas las decisiones
posteriores del proyecto. Si el plan técnico o los tasks contradicen cualquier principio,
**se corrige el plan**, no la constitución.

Cualquier decisión que contradiga un principio requiere **ADR explícito** y revisión
arquitectónica. Cambios a esta constitución requieren PR + review del lead técnico.

**Numeración canónica**: P1–P10. **P9 (Simplicity First) y P10 (Surgical Changes) son
universales**: aplican a todo proyecto de SOUTEC y no se editan.

---

## P1 — Contratos antes que tecnologías

**Los contratos son inmutables. Las tecnologías detrás son intercambiables.**

Los puertos del dominio y los contratos públicos de API se definen en lenguaje de
negocio y sobreviven a cualquier framework. Las tecnologías que los implementan son
reemplazables sin tocar el dominio.

- El puerto vive en el dominio y **habla en lenguaje de dominio, no de framework**.
  El adaptador traduce.
- **Un framework NUNCA es un puerto.** ORMs, SDKs de proveedores, clientes HTTP,
  motores de inferencia, plataformas de observabilidad: todos son **adaptadores**.
- Cambiar un componente externo debe ser **una operación de configuración, no un
  refactor**.
- **No crear puertos "por si acaso".** Solo se crea un puerto cuando exista un segundo
  adaptador real, se necesite un fake para tests, o se prevea fundadamente el reemplazo.
  Un puerto especulativo es ceremonia vacía (ver P9).

**Criterio mecánico de éxito**: agregar o reemplazar un adaptador no debe obligar a
modificar ni una línea del dominio ni de sus tests.

## P2 — Hexagonal por defecto, con enforcement automático

**Toda frontera externa tiene un adaptador. El dominio jamás importa frameworks.**

```
src/
├─ domain/           # Núcleo puro: entities, value_objects, services,
│                    # policies, ports/ (las interfaces)
├─ application/      # Casos de uso. Orquesta el dominio a través de los puertos.
├─ adapters/
│  ├─ inbound/       # Driving: HTTP, CLI, colas, jobs
│  └─ outbound/      # Driven: DB, APIs externas, colas, telemetría
├─ infrastructure/   # Config, composition root, wiring de DI
└─ spikes/           # EXCLUIDO del enforcement (exploración; ver más abajo)
```

**Regla de dependencias** — mecánica, no opinable:

```
adapters  →  application  →  domain
```

Siempre hacia el dominio. **Nunca al revés.** El dominio no conoce a los adaptadores;
los adaptadores conocen al dominio.

**La modularidad vive en cómo se separan las capas, no en cómo se decoran los features.**

**Enforcement en CI — no es opcional.** El pipeline bloquea el merge si falla.
Herramienta para este stack: **dependency-cruiser (o ESLint no-restricted-imports)**.
[Completar: ruta del archivo de config en este repo.]

**Prohibiciones duras** (un PR que las contenga se rechaza):
- El dominio y la aplicación **no importan** frameworks externos, SDKs de proveedores,
  ni entidades de ORM.
- No hay lógica de negocio en adaptadores ni en `infrastructure/`.
- No se confía en "modularidad por convención". Sin enforcement automático, hexagonal
  **degrada en 6 meses** por presión de deadlines.
- **Modificar la config del enforcement para que un check pase es una violación del
  Anti-Hack Template.** Se corrige el código, no la regla.

> **Sin enforcement, hexagonal es teatro.** Que exista la carpeta `ports/` no significa
> que haya hexagonal.

**Excepción — `spikes/`**: la exploración vive en `src/spikes/`, fuera del enforcement.
Si un spike justifica una feature, **se reimplementa** siguiendo SDD. Promover código de
`spikes/` a producción sin SDD completo es un antipattern.

## P3 — Medir antes de optimizar

- **No se optimiza performance sin métrica base + telemetría.** La optimización
  prematura es un antipattern.
- No se migra de tecnología sin datos que lo justifiquen.
- **Nunca** poner "optimize at all costs" — ni nada equivalente — en un system prompt o
  en `CLAUDE.md`: empuja al modelo a sacrificar correctitud por velocidad.

## P4 — Modularidad por capas, no por features

La modularidad se define por la separación de capas (P2), no agrupando por feature.
No mover clases entre capas "para reorganizar" (ver P10).

## P5 — Observabilidad desde el día uno

- Cada request lleva un trace ID.
- Logging estructurado en todo código productivo.
- **Agregar observabilidad después cuesta 10× más.** No es una fase posterior.

## P6 — Human-in-the-loop en acciones sensibles

- **No existe autonomía total sobre sistemas externos.**
- Las acciones destructivas requieren aprobación explícita humana, en el chat, antes.
- Backup obligatorio antes de cualquier migración irreversible.
- Rollback plan documentado antes de cada deploy significativo.

## P7 — [Principio específico del proyecto]

[Reemplazar por el principio propio de este proyecto. Ejemplos reales en SOUTEC:
"Cuantización agresiva como línea base" (Edge AI), "Reproducibilidad y validación",
"Idempotencia en toda operación de escritura", "API versionada desde el día uno".]

## P8 — [Principio específico del proyecto]

[Reemplazar. Ejemplos: "El hardware decide" (Edge AI), "Trazabilidad de decisiones:
todo trade-off significativo se documenta como ADR", "Separación estricta entre
ambientes".]

## P9 — Simplicity First (universal — no editar)

**Mínimo código que resuelve el problema. Nada especulativo.**

Combate la tendencia de los LLMs al over-engineering.

- No features más allá de lo pedido.
- No abstracciones para código de un solo uso.
- No "flexibilidad" ni "configurabilidad" que nadie pidió.
- No error handling para escenarios imposibles.
- Si escribiste 200 líneas y podían ser 50, reescribe.

- ✗ Para validar un email: clase abstracta `BaseValidator`, factory pattern, jerarquía
  de excepciones, config object con 8 campos, plugin system.
- ✓ Una función pura con regex (o la librería estándar del stack) que devuelve bool.
  5-10 líneas. Listo.

**Test mental**: *¿un senior engineer diría que esto está sobre-complicado?*

**Excepciones legítimas**: frameworks internos o librerías compartidas (la
extensibilidad es el punto); consistencia con una abstracción que ya existe; dominios
donde el defensive programming es obligatorio (financiero, médico, safety-critical).

## P10 — Surgical Changes (universal — no editar)

**Tocar solo lo necesario. Limpiar solo tu propio desorden.**

Combate la tendencia de los LLMs al scope creep.

Al editar código existente:
- No "mejorar" código, comentarios ni formato adyacente.
- No refactorizar lo que no está roto.
- Igualar el estilo existente, aunque tú lo harías distinto.
- Si ves dead code preexistente: **menciónalo, no lo borres**.
- **No mover clases entre capas "para reorganizar".**

Sí corresponde limpiar los imports, variables y funciones que **tus propios cambios**
dejaron huérfanos.

> **Cada línea cambiada debe trazar directamente al request del usuario.**

Lo que querrías cambiar pero nadie pidió: menciónalo como sugerencia aparte, no lo metas
en el diff.

---

> **P9 y P10 son el antídoto contra la degradación.** El enforcement automático captura
> las violaciones explícitas (un `import` prohibido en `domain/`). Simplicity First y
> Surgical Changes capturan las sutiles: mover una clase de dominio a un adaptador "para
> reorganizar", o crear abstracciones especulativas. Los dos mecanismos son necesarios.

---

## Standards técnicos

### Naming

- **Puertos**: sufijo `Port` (`LLMPort`, `KnowledgeStorePort`). Los puertos primarios
  usan `UseCase` (`ChatUseCase`).
- **Adaptadores**: sufijo `Adapter`, con la tecnología por delante (`QdrantAdapter`).
  Los dobles de prueba llevan prefijo `Fake` (`FakeLLMAdapter`).
- **Dominio en el lenguaje del negocio (español)**: entidades, value objects, policies y
  métodos de puerto (`Ticket`, `ContextoDeNegocio`, `PoliticaRetrieval`,
  `generar_respuesta`). Es deliberado: *el puerto habla en lenguaje de dominio, no de
  framework*.
- **Adaptadores, infraestructura y todo lo que toca frameworks: en inglés.**
- Archivos y carpetas: según la convención del stack (Node.js).

### Testing

- Tres niveles: `unit` (dominio, con **fakes**) · `integration` (adaptador contra infra
  real) · `e2e`.
- **Fakes, no mocks.** El doble de prueba es un adaptador más que satisface el puerto.
- **Un adaptador se testea como una unidad**: no se fragmenta si fragmentarlo no mejora
  la testabilidad.
- **Invariante**: agregar un adaptador nunca obliga a tocar los tests del dominio.
- Cobertura mínima: **80%**.

### Documentation

- `CLAUDE.md` en la raíz, **<200 líneas**.
- ADRs en `docs/decisions/YYYYMMDD-<slug>.md` (`/adr-new`). Inmutables una vez aceptados:
  una decisión nueva supersede a la anterior, no la edita.
- Gotchas que costaron >1 h → `docs/gotchas/`. Patterns que aparecieron 3+ veces →
  `docs/patterns/`. Learnings del día → `notes.md`.
- **Todo trade-off significativo se documenta como ADR.**

### Security

- Secretos **nunca** en el repo. `.env` en `.gitignore`, `.env.example` sin valores.
- En producción: secret manager del cloud provider.
- Claude Code tiene denegada la lectura de `.env`, `secrets/**`, `*.pem` e `id_rsa*` vía
  `permissions.deny` en `.claude/settings.json`. Ese es el mecanismo real —
  `.claudeignore` no existe y se ignora en silencio.
- Si una credencial se expone por accidente: **rotarla**, no solo borrar el commit.

---

## Restricciones de herramientas

- Toda herramienta nueva (dependencia, MCP, CLI, servicio) se evalúa con la skill
  `ccem-research` **antes** de adoptarse.
- No instalar CLIs globales sin justificación documentada.
- Preferir la standard library del lenguaje sobre dependencias externas.
- Preferir CLIs nativos del stack sobre MCP servers equivalentes: cada tool definition
  cuesta tokens en **cada** turno, para siempre.

## Governance

- Contradicciones entre esta constitución y un spec/plan: **se corrige el spec o el
  plan**, no la constitución.
- Si una propiedad de éxito se rompe, la causa es la violación de un principio o de una
  regla de enforcement. **La corrección es restaurar la regla, no parchear el síntoma.**
- Revisión trimestral. Histórico en el git log de este archivo.
