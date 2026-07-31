# Spec Lite: el CLI entrega el harness completo

**Status**: approved
**Owner**: Ignacio A
**Hito**: SHS-H2
**Creado**: 2026-07-31

> SDD Lite. Cambio de infraestructura interna, un solo stakeholder (el dueño del harness),
> sin superficie de negocio. Si al llegar a `plan.md` el alcance pasa de 8 horas, se
> escala al spec completo.

---

## Contexto

`npx souclaude init` promete instalar el harness CCEM en un repo. Hoy entrega una versión
incompleta y el repo generador no puede probar que lo que entrega esté completo, porque su
propia suite de tests falla.

Tres huecos concretos, verificados en la inspección de la rama `dev`:

1. **Los cuatro comandos de la capa de rocas no se cargan nunca.** El manifest los instala
   en `.claude/skills/ccem-rocas/<comando>/SKILL.md`, a dos niveles de profundidad. Claude
   Code descubre skills de proyecto en `.claude/skills/<nombre>/SKILL.md`, **un solo
   nivel** — lo que la doc llama *nested skills* es un `.claude/skills/` dentro de un
   subdirectorio del repo, no un agrupador dentro de `skills/`. Como `ccem-rocas/` tampoco
   tiene `SKILL.md` propio, Claude Code descarta la carpeta entera. `/rock-plan`,
   `/rock-status`, `/rock-close` y `/export-ninety` no existen en ningún repo que haya
   instalado este harness, pese a que `CLAUDE.md` y `AGENTS.md` los anuncian.

2. **El instalador manda al usuario a un archivo que no le llegó.** Cuando el Vault no se
   conecta, el CLI dice "Detalle en `docs/vault-setup.md`". Ese archivo vive solo en el
   repo generador: no es una entrada del manifest y `package.json.files` tampoco lo
   publica en el tarball de npm. El usuario recibe una ruta muerta justo en el momento en
   que necesita ayuda.

3. **El repo no puede auditarse a sí mismo.** `npm test` falla (66 de 67). El test de
   dogfood camina `.claude/**` sin excluir las carpetas `backup-*/` que crea el propio
   instalador ni los `.new` que crea el propio motor de aplicación, así que denuncia como
   deriva los artefactos que el harness genera por diseño. Mientras ese test esté rojo, el
   repo no tiene forma de demostrar que su superficie instalada coincide con el manifest —
   que es exactamente la garantía que este spec necesita.

Además, el auditor de manifest (`verify --strict`) excluye a propósito los archivos con
política `append-block`, así que los nueve fragmentos de `.gitignore` por stack quedan
fuera de toda validación: uno roto, renombrado o no referenciado por la detección de stack
no se detectaría nunca.

## Goals

En orden de prioridad:

1. Los cuatro comandos de la capa de rocas se cargan y responden a `/rock-plan`,
   `/rock-status`, `/rock-close` y `/export-ninety` en cualquier repo que instale el
   harness.
2. Todo archivo que el harness le pide al usuario que lea, le llega al usuario.
3. `npm test` pasa 67 de 67, y sigue pasando en un checkout con backups y `.new` en disco.
4. Ningún archivo distribuible del harness queda fuera de la auditoría del manifest,
   incluidos los fragmentos por stack.

## Non-goals

- **No se cambia el contenido de las skills de rocas.** El aplanamiento mueve archivos y
  actualiza rutas; el texto se sincroniza con la versión de Claude web en S3, que es otro
  spec.
- **No se agregan skills nuevas.** `souclaude-budget` es de S5.
- **No se resuelve la notación de IDs ni la purga de `PLN-023`.** Es S4.
- **No se toca el flujo interactivo del Vault** (autodetección, clone en un paso). Es S2.
  Aquí solo se corrige el mensaje que apunta a un archivo inexistente.
- **No se borra el histórico.** `CHANGELOG.md`, `docs/decisions/` y las carpetas de specs
  cerradas quedan intactas.
- **No se cambia la política `when: "empty-repo"`** de `README.md` y `.env.example`. Es
  intencional: un repo con código no quiere que le pisen su README. Solo se documenta en
  el manifest para que deje de parecer un olvido.

## Success criteria

- [ ] En una sesión de Claude Code sobre un repo recién inicializado, los cuatro comandos
      de rocas aparecen en el autocompletado de `/` y ejecutan.
- [ ] `npx souclaude init` en un directorio vacío deja en disco `docs/vault-setup.md` y
      `docs/vault-guide.md`, y ningún mensaje del CLI referencia una ruta que no exista en
      el repo destino.
- [ ] `npm test` sale 67/67 en esta máquina (con `.claude/backup-*/` y `*.new` presentes)
      y en CI sobre un checkout limpio.
- [ ] `node bin/cli.mjs verify --strict` sale limpio y ahora falla si un fragmento de
      `.gitignore` existe sin que ninguna firma de detección de stack lo referencie.
- [ ] El desfase Node 20 (CI) contra `engines: >=22.4` queda documentado en `notes.md` como
      gotcha conocido, sin cambiar ninguna versión (decisión del dueño, Q3).

## Riesgos

- **Aplanar las skills de rocas cambia rutas que el lockfile ya registró.** Un repo que
  hizo `upgrade` con la versión vieja tiene entradas apuntando a
  `.claude/skills/ccem-rocas/rock-plan/SKILL.md`. Sin una entrada `obsolete`, esos archivos
  quedan huérfanos en disco y siguen sin cargarse. El plan debe resolver la migración, no
  solo el destino.
- **Borrar las carpetas `backup-*/` versionadas es destructivo.** Se confirma con el dueño
  antes, y se verifica que no contengan nada que no esté ya en el historial de git.

## Open questions — resueltas

- [x] Q1: ¿`ccem-rocas` queda como skill paraguas o se absorbe en `ccem-planner`?
      **Queda como skill paraguas real**, con su propio `SKILL.md` explicando la capa
      trimestral y cuándo usar cada comando. — Ignacio A, 2026-07-31.
- [x] Q2: ¿Las cuatro carpetas `.claude/backup-*/` se borran?
      **Sí, se borran** las cuatro, previa verificación de que su contenido ya está en el
      historial de git. — Ignacio A, 2026-07-31.
- [x] Q3: ¿CI sube a Node 22 o `engines` baja a 20?
      **Ninguna de las dos: no se tocan versiones.** CI sigue en Node 20 y `engines` sigue
      en `>=22.4`. — Ignacio A, 2026-07-31.

### Consecuencia de Q3, declarada

La divergencia entre CI (Node 20) y `engines` (`>=22.4`) **queda en pie a propósito**. Hoy
no rompe nada porque los dos pasos de CI (`verify --strict` y `upgrade --dry-run --yes`)
no usan flags negados. Pero `parseArgs({allowNegative})` exige Node 22.4, así que **el día
que CI ejecute `--no-vault`, `--no-backup` o cualquier otro flag negado, fallará solo en
CI y no en local**. Se documenta en `notes.md` como gotcha conocido para que el próximo que
agregue un paso de CI no pierda una tarde. No se agrega ningún paso de CI con flags negados
en este spec.

---

## Checklist antes de avanzar a plan-lite

- [x] ¿Los goals son medibles, no aspiracionales?
- [x] ¿Los non-goals cubren la asunción más probable de un lector? (que aquí se arregla
      también el Vault y los IDs — no, son S2 y S4)
- [x] ¿Sigue siendo un cambio de 4-8 horas? Sí: con Q3 resuelta como "no tocar", el
      alcance se achica a mover archivos, agregar entradas al manifest, extender el
      auditor y arreglar un test.
- [x] ¿El dueño respondió Q1, Q2 y Q3? Sí, 2026-07-31.
