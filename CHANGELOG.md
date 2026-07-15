# Changelog

El harness y el CLI se versionan juntos.

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
