# Tasks Lite: el CLI entrega el harness completo

**Spec**: [spec.md](./spec.md)
**Plan**: [plan.md](./plan.md)
**Estimated total**: ~5 horas

> Bloques de 100 según el orden de reserva del hito SHS-H2. Este es el primer (y único,
> por ahora) spec del hito, así que arranca en T001.

---

## Tasks

- [x] **SHS-H2-T001** — Mover las 4 skills de rocas a `.claude/skills/<cmd>/SKILL.md` y su
      espejo en `templates/base/claude/skills/<cmd>/SKILL.md`. Contenido sin tocar.
      `.claude/skills/{rock-plan,rock-status,rock-close,export-ninety}/SKILL.md` ·
      `templates/base/claude/skills/{rock-plan,rock-status,rock-close,export-ninety}/SKILL.md`
      · 20 min · commit `c25356d`
      Verificación: `git mv` preserva historial; los 4 archivos existen en la ruta nueva y
      no existe la vieja. Confirmado en vivo: `/rock-status` apareció como skill disponible
      apenas movida.

- [x] **SHS-H2-T002** — Escribir `ccem-rocas/SKILL.md` como skill paraguas conceptual (Q1):
      qué es la capa trimestral, la frontera roca→hito→CCEM, y cuál de los 4 comandos usar
      en cada momento. Sin `disable-model-invocation`.
      `.claude/skills/ccem-rocas/SKILL.md` · `templates/base/claude/skills/ccem-rocas/SKILL.md`
      · 25 min · depende de T001 · commit `c1d76cf`
      Verificación: la skill tiene frontmatter `name`/`description` válido y describe los 4
      comandos por nombre.

- [x] **SHS-H2-T003** — Actualizar `templates/harness.manifest.json`: los 4 `dest` de rocas
      pasan a la ruta plana, entry nueva `skill-ccem-rocas`, y las 4 rutas viejas
      (`ccem-rocas/<cmd>/SKILL.md`) se agregan a `obsolete[]` con su razón.
      `templates/harness.manifest.json` · 15 min · depende de T001, T002 · commit `08f325a`
      Verificación: `node bin/cli.mjs verify --strict` sale limpio (0 errores, 0 warnings
      nuevos).

- [x] **SHS-H2-T004** — Corregir `manualHint()` en `src/core/vault.js`. **Corrección de
      alcance encontrada al planificar el detalle**: convertir `vault-setup.md`/
      `vault-guide.md` en templates (como decía la primera versión de este task)
      contradecía el propio diseño de esos docs — `vault-guide.md:3-5` declara que son
      singleton, no distribuidos, confirmado por `CHANGELOG.md:76`. El arreglo real: el
      aviso apunta a la URL de GitHub del repo generador (leída de
      `package.json.repository.url`, no hardcodeada) en vez de a una ruta local que nunca
      existe en el repo consumidor.
      `src/core/vault.js` · `test/vault.test.js` · 15 min · commit `be1b090`
      Verificación: `test/vault.test.js` nuevo caso — `harnessDocsUrl()` devuelve una URL
      de GitHub, nunca una ruta relativa.

- [x] **SHS-H2-T005** — Reescribir `walkClaudeDir()` en `test/dogfood.test.js` para usar
      `git ls-files .claude` en vez de `fs.readdirSync` recursivo.
      `test/dogfood.test.js` · 20 min · commit `0a89a67`
      Verificación: `npm test` pasa el test de dogfood con las 4 carpetas
      `.claude/backup-*/` presentes en disco (sin borrarlas todavía).

- [x] **SHS-H2-T006** — Agregar `findOrphanFragments()` a `src/core/verify.js`: todo
      `.txt` de `templates/fragments/gitignore/` debe ser `base.txt` o corresponder a un
      stack declarado en `src/core/detect.js`. Cablear el warning en `verifyManifest()`.
      `src/core/verify.js` · 25 min · depende de: ninguna · commit `e4b2734`
      Verificación: test nuevo en `test/verify.test.js` con caso positivo (los 9
      fragmentos actuales no disparan nada) y negativo (un `cobol.txt` fabricado en tmp sí).

- [x] **SHS-H2-T007** — Anotar en `notes.md` el gotcha del desfase Node 20 (CI) vs
      `engines >=22.4` (decisión del dueño: no se tocan versiones en este spec).
      `notes.md` · 10 min · commit `dbf6b4f`
      Verificación: la entrada explica el riesgo concreto (`--no-vault`/`--no-backup`
      fallarían en CI) y no toca ningún archivo de configuración de versión.

- [x] **SHS-H2-T008** — `/adr-new`: por qué las skills de rocas se aplanan (restricción de
      la plataforma, no preferencia de estilo).
      `docs/decisions/20260804-aplanar-skills-de-rocas.md` · 15 min · depende de T001-T003
      · commit `f1353fb`
      Verificación: el ADR existe y referencia SHS-H2.

- [x] **SHS-H2-T009** — Higiene local (Q2). **Hallazgo durante la ejecución**: el
      contenido de `.claude/backup-20260714T174401/` (7 archivos) verificado por hash de
      blob contra `git log --all` **no coincide con ningún commit** — es un estado
      intermedio real (CLAUDE.md pre-reescritura de `ccem-planner`, harness 1.0.0) que
      nunca se commiteó tal cual. Se consultó al dueño (no se asumió); decisión: borrar
      igual, por ser contenido superado sin valor recuperable. Las carpetas
      `backup-20260714T172916/` (3 SKILL.md, tampoco en historial) y
      `backup-20260721T135144/`, `backup-20260727T124013/` (sus `.gitignore` sí están en
      historial) se borraron bajo el mismo criterio. Más los 3 `.new` sueltos.
      (sin archivo de repo — limpieza de disco local) · 15 min
      Verificación: `git status --short` no cambió antes/después del borrado — confirmado.

---

## Checkpoint humano

- [x] **Después de T003**: confirmado — `/rock-status` apareció disponible en el
      autocompletado apenas se movió el archivo (T001), antes incluso de T002/T003.

## Cierre

- [x] `npm test` → 70/70 (67 originales + el caso nuevo de T004 + los 2 de T006)
- [x] `node bin/cli.mjs verify --strict` limpio
- [x] `notes.md` actualizado (T007)
- [ ] PR draft abierto contra `main` con la plantilla completa
