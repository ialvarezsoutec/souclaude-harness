# Changelog

El harness y el CLI se versionan juntos.

## [2.2.0] — no publicado

Progreso por disco formalizado, IDs de task amarrados al hito y costo por tarea en la
telemetría del router.

### Agregado

- **Carpeta `progress/` formalizada y emitida por el harness**: `progress/README.md`
  (managed — documenta la convención) y `progress/history.md` (user-owned — historial
  compartido append-only, una línea por task/sesión cerrada, con regla de resolución de
  merge en el encabezado). Subcarpeta `progress/<ID-hito>-<slug>/` por spec en marcha con
  `summary.md` (spec-author), `impl_summary.md` (implementer) y `review.md` (reviewer) —
  reemplaza la convención plana `spec_/impl_/review_<ID>.md`.
- **IDs de task `<PREFIJO>-H<n>-T<nnn>`** (ej. `TNP-H1-T001`), emitidos por el spec-author
  en la fase Tasks con **bloques de 100 por spec** según el orden de reserva en
  `/rock-plan` (1.er spec desde T001, 2.º desde T101) — cero colisiones entre specs en
  ramas paralelas. Footer `Refs: <ID-task>` obligatorio en el commit-por-task. La cadena
  de `ccem-planner` se extiende: Roca → Hito → Spec → **Task** → commit.
- **Costo por tarea en la telemetría del router**: `progress/model-router.jsonl` suma
  `task`, `tokens_in`, `tokens_out`, `costo_usd` y `medicion` (`medido`|`estimado`, con
  regla de honestidad: un estimado es orden de magnitud, nunca cifra contable), más la
  tabla de precios referencial en `ccem-model-router` §7 (único lugar a actualizar).
  `/rock-close` suma el bloque "Resumen de costo" (% medido primero, total después).
- **Regla de arquitectura**: si un task cambia la arquitectura (puerto nuevo, contrato
  público, dependencia entre capas), el cierre exige doc en `docs/` + ADR; el implementer
  actualiza docs y declara el ADR pendiente (sigue siendo del spec-author), y el reviewer
  rechaza sin ambas cosas.
- **`docs/vault-guide.md`** (solo este repo, no distribuido): guía de creación del Vault
  central multi-proyecto — estructura, archivos semilla (`id-registry.md`), quién escribe
  qué, relación Vault↔repos↔Ninety, concurrencia multi-persona.

### Cambiado

- `AGENTS.md`, los 4 agentes SDD y el orchestrator usan las rutas nuevas de `progress/` y
  agregan su línea a `history.md` al cerrar cada artefacto.
- Templates `tasks-template.md` y `tasks-lite-template.md` con IDs completos y la regla de
  numeración por bloques.

## [2.1.0] — no publicado

Soutec Model Router: cada subagente corre con el mejor modelo posible según el triángulo
Calidad / Velocidad / Costo. El orchestrator es el router; la política es declarativa.

### Agregado

- **Skill `ccem-model-router`** (distribuida por el manifest, policy managed): única fuente
  de verdad de la política de ruteo — clasificación de tarea (mecánica/estándar/compleja),
  checklist de señales de dificultad, matriz agente × clase → (modelo, effort), escalamiento
  excepcional (criterios objetivos + máximo 1 escalada por hito + fallback a `inherit`) y
  telemetría en `progress/model-router.jsonl` con revisión trimestral en `/rock-close`.
  El mapeo rol → alias (Decisiones→`fable`, Ejecución→`opus`, Volumen→`sonnet`) vive en
  una sola tabla, el único lugar a actualizar cuando cambie la familia de modelos.

### Cambiado

- **`orchestrator`**: la sección "Selección de modelo" pasa de prosa orientativa a protocolo
  de router obligatorio (clasificar → resolver overrides `model`/`effort` en la llamada
  Agent → escalar solo con criterios y presupuesto → registrar cada lanzamiento en JSONL).
- **`spec-author` y `reviewer`** suman `effort: high`, **`implementer`** suma
  `effort: medium` en el frontmatter — red de seguridad para invocaciones sin orchestrator.
  Se mantiene la decisión de **no** emitir `model:` en frontmatter: forzar un modelo rompe
  a quien no lo tiene; el modelo se decide por invocación con fallback a `inherit`.
- **`ccem-core`** enlaza su sección "Selección de modelo" con la política operable;
  **`/rock-close`** suma el paso "Revisión de política de modelos" (umbral de escaladas
  >10 %, rework por celda).

## [2.0.0] — no publicado

Capa de rocas: el **hito** reemplaza a Planner como emisor de IDs. Implementa la Fase 0 de la
Metodología de Roca v2.1.0 en el repo de código.

### BREAKING CHANGE

- **El emisor de IDs pasa de la tarjeta de Planner al hito** (`<PREFIJO>-H<n>`, ej. `REA-H3`),
  definido en el Paso 2 de la roca (`/rock-plan`). El hilo de trazabilidad es ahora
  `Roca → Hito → specs/<ID-hito>-<slug>/ → rama → PR → tag`. Los repos consumidores reciben la
  reescritura en el próximo `upgrade`. ADR: `docs/decisions/20260722-capa-rocas-hito-emisor-de-ids.md`
  (supersede al de orquestación solo en cuanto al emisor).

### Agregado

- **Paquete de skills `ccem-rocas`** (4 comandos, distribuidos por el manifest): `/rock-plan`
  (Paso 2, con las 7 reglas de construcción de hitos y el checklist de validación E1/E4),
  `/rock-status` (snapshot semanal derivado de GitHub; falla ante campos derivados editados a
  mano, E2/E3), `/rock-close` (cierre contra criterios congelados, exige evidencia por criterio,
  E5) y `/export-ninety` (contrato por fases con Ninety; Fase 0 manual).

### Cambiado

- **`ccem-planner` reescrito**: el hito es el emisor, el estado del trabajo se **deriva** de
  GitHub (rama/PR) en vez de un tablero, y el WIP pasa de "2-3 tarjetas por dev" a "**2 ramas
  vivas por persona**" (`git branch -r`). Conserva su nombre para no romper manifest/lockfile.
- **`spec-new`** suma el contrato de entrada hito → spec (criterios heredados, no-alcance,
  entregable, rollback) y deja de hablar de Planner. Corrige una referencia P7 → P9.
- **`soutec-github`**, los agentes `orchestrator`/`spec-author`/`implementer` y ambos `CLAUDE.md`
  pasan de "tarjeta de Planner" al hito como origen del trabajo.

### No incluido (tracks aparte)

- El repo Vault (`00-System`, `id-registry.md`, `plantilla_apertura_roca.yaml`), los jobs
  semanales (E2/E3 como cron), el cierre de hito con evidencia automatizado (E5) y la API de
  Ninety (Fases 1-3). P7/P8 de la constitución se dejan como placeholder a propósito
  (metodología §9).

## [1.1.0] — no publicado

Orquestación multi-agente: cuatro roles que siguen el flujo SDD de CCEM con separación de
responsabilidades y checkpoints humanos.

### Agregado

- **Cuatro agentes** en `.claude/agents/`, distribuidos por el harness: `orchestrator`
  (coordina, no escribe código), `spec-author` (redacta spec/plan/tasks, una fase por
  invocación), `implementer` (task por task, cada cambio con su test) y `reviewer` (aprueba
  o rechaza de forma **independiente**, sin `Write`/`Edit`).
- **`AGENTS.md`** en la raíz: el mapa del flujo multi-agente, los cuatro roles, y las reglas
  del harness que respetan **por referencia** (no las redefinen).
- El patrón se subordina a la constitución: los checkpoints humanos y "ningún agente se
  auto-aprueba ni marca `done`" son **P6 hecho producto**. El hilo sigue siendo el ID de
  Planner; no se introduce `feature_list.json` ni un segundo sistema de estado.

### Decisiones

- **Opt-in, no líder global.** La orquestación se invoca a demanda; no se fuerza a cada
  sesión vía `CLAUDE.md` — forzarlo secuestraría el proyecto consumidor (P9/P10). ADR:
  `docs/decisions/20260721-orquestacion-multiagente.md`.
- **Identificadores en inglés, prosa en español.** `name:`/`subagent_type` toca el framework
  → inglés kebab-case; el cuerpo instructivo que lee el dev → español.
- Patrón **derivado** de `betta-tech/harness-sdd` (repo sin LICENSE): se adopta el patrón, no
  la prosa — todo redactado original. Evaluado con `ccem-research`.

## [1.0.0] — no publicado

Primera versión. Reemplaza la copia manual de la carpeta `Kit/`.

### Agregado

- CLI `souclaude` con `init`, `upgrade`, `status` y `adopt`. Se distribuye por
  `npx github:ialvarezsoutec/souclaude-harness#v1` — sin registry ni token.
- **Motor de migración**: un solo code path para instalar en un repo vacío, adoptar un
  repo legacy y migrar de una versión del harness a otra. Lockfile en
  `.claude/harness.json` con el hash de cada archivo emitido.
- **Garantía de no-sobrescritura**: un archivo editado por el usuario nunca se pisa; la
  propuesta del harness queda al lado como `.new`.
- Skills project-local en `.claude/skills/`: `ccem-core`, `ccem-sdd`, `ccem-planner`,
  `ccem-research`, `ccem-stack`, `ccem-prompting`, `soutec-github`.
- Comandos `/spec-new`, `/adr-new`, `/constitution-check`, `/harness-upgrade`.
- Templates SDD Lite, que el `specs/README.md` del Kit prometía y nunca existieron.
- `.github/pull_request_template.md` y `.github/CODEOWNERS` — **obligatorios en Fase 1**
  según la Guía Operativa Git v2.0, y que el Kit no emitía.
- La constitución prellena **P1 (Contratos antes que tecnologías)** y **P2 (Hexagonal
  con enforcement automático)**, con la herramienta de enforcement **derivada del stack
  detectado** (import-linter en Python, dependency-cruiser en Node, ArchUnit en Java…).

### Decisiones que resuelven contradicciones del corpus

- **Numeración canónica P1-P10.** El corpus numeraba los mismos dos principios
  universales de tres formas: CCEM v3.0 los llama #5/#6, el Kit P7/P8, y el doc de
  Arquitectura P9/P10. **Gana P9 (Simplicity First) y P10 (Surgical Changes)**, la del
  doc de Arquitectura. Pendiente: corregir el Kit y CCEM v3.0 para que coincidan.
- **Idioma**: el dominio se nombra en español (entidades, value objects, policies,
  métodos de puerto) porque *el puerto habla en lenguaje de dominio, no de framework*.
  Adaptadores, infraestructura y todo lo que toca frameworks, en inglés. La regla previa
  del Kit ("todo en inglés") contradecía al doc de Arquitectura.
- **La carpeta de spec lleva el ID de Planner**: `specs/<PLN-023>-<slug>/`, con el mismo
  slug que la rama. El Kit usaba solo el slug, lo que rompe el hilo de trazabilidad
  Planner ↔ specs ↔ rama ↔ commits ↔ PR ↔ release.
- **Skills project-local, no globales.** CCEM v3.0 dice `~/.claude/skills/`. Se eligió
  local: cero instalación por dev, versionadas con el código, funcionan en CI, y —
  decisivo — una skill global **no se puede actualizar por proyecto**, lo que dejaría al
  motor de migración sin nada que migrar.

### Estilo

- **Conjugación en español: tuteo, no voseo.** Estándar de la organización — aplica a
  toda respuesta de Claude, no solo al contenido del harness. `CLAUDE.md` ahora lo
  declara explícitamente. Se convirtió todo el texto en voseo argentino que traía el
  proyecto (skills, comandos, README, MAINTAINERS, guía del desarrollador, comentarios de
  código) a tuteo — ~250 formas corregidas en 3 pasadas de verificación.

### Corregido (respecto del Kit v0)

- **`.claude/settings.json` tenía 4 de 5 claves inválidas.** `effort`,
  `auto_confirm_destructive`, `display_tools` y `token_budget_warning` no existen en el
  schema de Claude Code: se ignoraban en silencio. El archivo parecía configurado y no
  hacía nada. Hay una migración que las remueve.
  **Ojo**: estas claves las prescribe el propio doc de Arquitectura (§14). Ese documento
  también hay que corregirlo, o los repos nuevos las van a volver a copiar.
- **`model: "opusplan"` no es un valor válido.** El harness ya no fija `model` a nivel
  proyecto: forzarlo rompe a quien no tenga ese modelo.
- **`.claudeignore` nunca fue una feature de Claude Code.** El archivo se ignora en
  silencio. La exclusión real de secretos se configura en `permissions.deny` de
  `settings.json`, que el harness ahora emite. El `.claudeignore` de un repo viejo se
  marca obsoleto y se ofrece borrarlo con `--prune`.
- **`plan-template.md` emitía el antipattern #15** del doc de Arquitectura: constitution
  alignment con checkboxes sin referenciar ADRs ("alignment teatral"). Ahora exige el
  ADR concreto que respalda cada principio.
- **`tasks-template.md` imponía 15-30 min sin escape hatch**, cuando el doc de
  Arquitectura ya había documentado la excepción para adaptadores (2-3 h si son un
  componente único y verificable en aislamiento). La excepción ahora está en el template
  y hay que justificarla al usarla.
- **`apply()` revertía en silencio las ediciones del usuario.** Escribía toda acción con
  `writePath`, incluidas las `local-edit` — si editabas una skill, el siguiente `upgrade`
  te la pisaba sin avisar. Era la violación más grave posible de la garantía central.
  Encontrado por los tests, no por inspección manual.
- **Un repo recién creado con `README.md` de 0 bytes quedaba con un `.new` para siempre.**
  Un archivo vacío ahora se trata como ausente: no hay nada del usuario que perder.
- **`DATE` se recalculaba en cada corrida.** Un `CLAUDE.md`/`constitution.md` intactos
  aparecían como `conflict` -> `.new` espurio con solo cruzar la medianoche, porque el
  contenido deseado cambiaba de fecha aunque nada real hubiera cambiado. Ahora es sticky,
  igual que `OWNER`: se siembra una vez al instalar y no se toca más. Encontrado
  dogfooding el propio harness sobre este repo.

### Pendiente (falta la fuente)

- `ccem-research` (los 7 criterios) y `ccem-stack` están escritos como reconstrucción, no
  desde la fuente. Los documentos que los contienen —
  `CCEM-External-Sources-Evaluation.md` y `CCEM-Project-Startup-Guide.md` — no están en
  el repo. **Reescribirlos apenas aparezcan**; los repos los reciben con
  `souclaude upgrade`.
