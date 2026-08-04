# Tasks Lite: el CLI entrega el harness completo

**Spec**: [spec.md](./spec.md)
**Plan**: [plan.md](./plan.md)
**Estimated total**: ~5 horas

> Bloques de 100 según el orden de reserva del hito SHS-H2. Este es el primer (y único,
> por ahora) spec del hito, así que arranca en T001.

---

## Tasks

- [ ] **SHS-H2-T001** — Mover las 4 skills de rocas a `.claude/skills/<cmd>/SKILL.md` y su
      espejo en `templates/base/claude/skills/<cmd>/SKILL.md`. Contenido sin tocar.
      `.claude/skills/{rock-plan,rock-status,rock-close,export-ninety}/SKILL.md` ·
      `templates/base/claude/skills/{rock-plan,rock-status,rock-close,export-ninety}/SKILL.md`
      · 20 min
      Verificación: `git mv` preserva historial; los 4 archivos existen en la ruta nueva y
      no existe la vieja.

- [ ] **SHS-H2-T002** — Escribir `ccem-rocas/SKILL.md` como skill paraguas conceptual (Q1):
      qué es la capa trimestral, la frontera roca→hito→CCEM, y cuál de los 4 comandos usar
      en cada momento. Sin `disable-model-invocation`.
      `.claude/skills/ccem-rocas/SKILL.md` · `templates/base/claude/skills/ccem-rocas/SKILL.md`
      · 25 min · depende de T001
      Verificación: la skill tiene frontmatter `name`/`description` válido y describe los 4
      comandos por nombre.

- [ ] **SHS-H2-T003** — Actualizar `templates/harness.manifest.json`: los 4 `dest` de rocas
      pasan a la ruta plana, entry nueva `skill-ccem-rocas`, y las 4 rutas viejas
      (`ccem-rocas/<cmd>/SKILL.md`) se agregan a `obsolete[]` con su razón.
      `templates/harness.manifest.json` · 15 min · depende de T001, T002
      Verificación: `node bin/cli.mjs verify --strict` sale limpio (0 errores, 0 warnings
      nuevos).

- [ ] **SHS-H2-T004** — Corregir `manualHint()` en `src/core/vault.js` para que el aviso
      apunte a la URL de GitHub del repo generador (leída de
      `package.json.repository.url`, no hardcodeada) en vez de a `docs/vault-setup.md`,
      ruta que nunca existe en el repo consumidor porque el doc es intencionalmente
      singleton y no distribuido (`docs/vault-guide.md:3-5`, `CHANGELOG.md:76`).
      `src/core/vault.js` · `test/vault.test.js` · 15 min
      Verificación: `test/vault.test.js` nuevo caso — el mensaje de `manualHint` no
      contiene ninguna ruta relativa `docs/`, solo la URL completa.

- [ ] **SHS-H2-T005** — Reescribir `walkClaudeDir()` en `test/dogfood.test.js` para usar
      `git ls-files .claude` en vez de `fs.readdirSync` recursivo.
      `test/dogfood.test.js` · 20 min
      Verificación: `npm test` pasa el test de dogfood con las 4 carpetas
      `.claude/backup-*/` presentes en disco (sin borrarlas todavía).

- [ ] **SHS-H2-T006** — Agregar `findOrphanFragments()` a `src/core/verify.js`: todo
      `.txt` de `templates/fragments/gitignore/` debe ser `base.txt` o corresponder a un
      stack declarado en `src/core/detect.js`. Cablear el warning en `verifyManifest()`.
      `src/core/verify.js` · 25 min · depende de: ninguna
      Verificación: test nuevo en `test/verify.test.js` con caso positivo (los 9
      fragmentos actuales no disparan nada) y negativo (un `cobol.txt` fabricado en tmp sí).

- [ ] **SHS-H2-T007** — Anotar en `notes.md` el gotcha del desfase Node 20 (CI) vs
      `engines >=22.4` (decisión del dueño: no se tocan versiones en este spec).
      `notes.md` · 10 min
      Verificación: la entrada explica el riesgo concreto (`--no-vault`/`--no-backup`
      fallarían en CI) y no toca ningún archivo de configuración de versión.

- [ ] **SHS-H2-T008** — `/adr-new`: por qué las skills de rocas se aplanan (restricción de
      la plataforma, no preferencia de estilo).
      `docs/decisions/<fecha>-aplanar-skills-de-rocas.md` · 15 min · depende de T001-T003
      Verificación: el ADR existe y referencia SHS-H2.

- [ ] **SHS-H2-T009** — Higiene local (Q2): verificar contra `git log` que el contenido de
      `.claude/backup-20260714T174401/` está en el historial versionado, y borrar las 4
      carpetas `.claude/backup-*/` más los 3 archivos `.new` sueltos. No entra al PR (nada
      versionado).
      (sin archivo de repo — limpieza de disco local) · 15 min
      Verificación: `git status --short` no cambia antes/después del borrado.

---

## Checkpoint humano

- [ ] **Después de T003**: confirmar que `/rock-plan`, `/rock-status`, `/rock-close` y
      `/export-ninety` aparecen en el autocompletado `/` de una sesión de Claude Code sobre
      este mismo repo, antes de seguir con los docs del Vault.

## Cierre

- [ ] `npm test` → 67/67
- [ ] `node bin/cli.mjs verify --strict` limpio
- [ ] `notes.md` actualizado (T007)
- [ ] PR draft abierto contra `main` con la plantilla completa
