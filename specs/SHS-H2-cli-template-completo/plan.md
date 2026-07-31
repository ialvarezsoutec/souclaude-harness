# Plan Lite: el CLI entrega el harness completo

**Spec**: [spec.md](./spec.md)
**Status**: draft
**Owner**: Ignacio A
**Hito**: SHS-H2

---

## Corrección al spec

El spec dice "basura versionada en el árbol" sobre `CLAUDE.md.new`, los dos `.new` de
`it-security-review` y las cuatro carpetas `.claude/backup-*/`. **No están versionados**:
`git ls-files` no devuelve ninguno, y el propio `.gitignore` los excluye
([.gitignore:19,26](../../.gitignore#L19)) — reglas que emite el mismo harness
([templates/fragments/gitignore/base.txt:16](../../templates/fragments/gitignore/base.txt#L16)).

Eso cambia el diagnóstico del test roto, y para mejor. `dogfood.test.js` no está
denunciando suciedad del repo: está **leyendo el disco en vez de leer el repo**. Camina
`.claude/**` con `fs.readdirSync` y por eso ve archivos que git ignora a propósito. El test
falla en la copia de trabajo de cualquiera que haya corrido `upgrade` alguna vez, y pasa en
CI solo porque CI clona limpio. Es un falso negativo con forma de falso positivo: el día
que haya deriva real en un repo con backups, el test ya estaba rojo y nadie lo mira.

Borrar los artefactos locales (Q2) sigue en pie, pero como higiene de esta máquina — no
arregla el test. El test se arregla haciéndolo preguntar por archivos versionados.

## Cambios concretos

### Bloque 1 — Las skills de rocas se cargan

| Archivo | Cambio |
|---|---|
| `templates/base/claude/skills/rock-plan/SKILL.md` | Movido desde `ccem-rocas/rock-plan/`. Contenido sin tocar (es S3) |
| `templates/base/claude/skills/rock-status/SKILL.md` | Ídem |
| `templates/base/claude/skills/rock-close/SKILL.md` | Ídem |
| `templates/base/claude/skills/export-ninety/SKILL.md` | Ídem |
| `templates/base/claude/skills/ccem-rocas/SKILL.md` | **Nuevo.** Skill paraguas (Q1): qué es la capa trimestral, la frontera roca→hito→CCEM, y cuál de los cuatro comandos usar en cada momento. Sin `disable-model-invocation`: es conceptual, se aplica sola |
| `templates/harness.manifest.json` | Los 4 `dest` pasan de `.claude/skills/ccem-rocas/<cmd>/SKILL.md` a `.claude/skills/<cmd>/SKILL.md`; entry nueva `skill-ccem-rocas`; los 4 `dest` viejos se agregan a `obsolete[]` con su razón |
| `.claude/skills/**` | El mismo movimiento en el árbol dogfood: este repo instala lo que distribuye |

**Por qué el aplanamiento es la única opción**: Claude Code descubre skills de proyecto en
`.claude/skills/<nombre>/SKILL.md`, exactamente un nivel. Lo que la doc llama *nested
skills* es un `.claude/skills/` dentro de un subdirectorio del repo
(`apps/web/.claude/skills/deploy/` → `/apps/web:deploy`), no un agrupador dentro de
`skills/`. No hay frontmatter ni setting que cambie eso.

**La migración sale gratis y ya está implementada.** `computePlan` marca `OBSOLETE` todo
`dest` que esté en el lockfile y ya no en el manifest
([src/core/plan.js:34-39](../../src/core/plan.js#L34-L39)), y además detecta los declarados
muertos en `manifest.obsolete[]` aunque el repo **no tenga lockfile**
([plan.js:44-48](../../src/core/plan.js#L44-L48)) — que es el caso de quien copió el Kit a
mano. Los cuatro archivos viejos se ofrecen para borrar con `--prune` y doble confirmación.
No hay que escribir código de migración.

### Bloque 2 — Los docs del Vault llegan al usuario

| Archivo | Cambio |
|---|---|
| `templates/base/docs/vault-setup.md` | **Nuevo.** Copia de `docs/vault-setup.md` con los placeholders del render donde hoy hay valores de este repo |
| `templates/base/docs/vault-guide.md` | **Nuevo.** Ídem con `docs/vault-guide.md` |
| `templates/harness.manifest.json` | Dos entries nuevas, política `managed` |
| `src/core/vault.js:77` | `'Detalle en docs/vault-setup.md.'` se mantiene — ahora el archivo sí existe en el repo destino |

### Bloque 3 — El repo se audita a sí mismo

| Archivo | Cambio |
|---|---|
| `test/dogfood.test.js` | `walkClaudeDir()` pasa de `fs.readdirSync` recursivo a `git ls-files .claude`. El test pregunta por archivos **versionados**, que es lo que el manifest describe |
| `src/core/verify.js` | `findOrphanFragments()` nueva: todo `.txt` de `templates/fragments/gitignore/` debe ser `base.txt` o corresponder a un stack de `detect.js`. Warning, no error |
| `test/verify.test.js` | Caso positivo (los 9 fragmentos actuales pasan) y negativo (un `cobol.txt` fabricado en tmp dispara el warning) |
| `notes.md` | Gotcha del desfase Node 20 / `engines >=22.4` (decisión Q3: no se tocan versiones) |

### Bloque 4 — Higiene local (no toca el repo)

Borrar `.claude/backup-20260714T172916/`, `.claude/backup-20260714T174401/`,
`.claude/backup-20260721T135144/`, `.claude/backup-20260727T124013/`, `CLAUDE.md.new`,
`.claude/skills/it-security-review/report-template.md.new` y
`.claude/skills/it-security-review/scripts/render_security_report.py.new`.

Ninguno está versionado, así que **no aparece en el diff del PR**. Es limpieza de esta
máquina, pedida en Q2.

## Decisiones técnicas

- **`ccem-rocas` sobrevive como skill paraguas, no como carpeta contenedora** (Q1). Su
  `SKILL.md` es conceptual y se auto-aplica; los cuatro comandos son hermanos suyos en
  `.claude/skills/`, no hijos. Descartado absorberlo en `ccem-planner`: `ccem-planner`
  cubre el hilo de trazabilidad de la carpeta de spec hacia abajo y ya declara que la capa
  trimestral es de `ccem-rocas` ([ccem-planner/SKILL.md:11-14](../../.claude/skills/ccem-planner/SKILL.md#L11-L14));
  fundirlos borra una frontera que el propio método defiende.

- **Las subcarpetas viejas pueden quedar en disco sin romper nada.** Una vez que
  `ccem-rocas/` tenga su `SKILL.md`, cualquier `rock-plan/SKILL.md` que sobreviva ahí
  adentro pasa a ser un archivo de apoyo de esa skill, que es un layout válido. El
  `--prune` limpia; no hacerlo no rompe.

- **`git ls-files` en vez de una lista de exclusiones en el test.** Descartado agregar
  `backup-*/` y `*.new` al filtro: sería tapar el síntoma y la lista crecería con cada
  artefacto nuevo que el harness aprenda a generar. El `.gitignore` ya es la fuente de
  verdad de qué es del repo y qué es de la máquina; el test debe consultarla, no
  duplicarla. Costo: el test pasa a depender de `git` en el PATH, que ya es una dependencia
  dura del CLI ([vault.js:51-53](../../src/core/vault.js#L51-L53)).

- **El auditor de fragmentos emite warning, no error.** Un fragmento de más es basura, no
  una rotura. `verify --strict` ya trata los warnings como bloqueantes en CI, así que el
  efecto práctico es el mismo sin volver frágil el uso interactivo.

- **No se toca `when: "empty-repo"` de `README.md` y `.env.example`.** Es correcto: pisar
  el README de un repo con código sería peor. Se agrega un comentario en el manifest para
  que deje de leerse como olvido.

## Risks

| Risk | Mitigación |
|---|---|
| Mover las skills deja huérfanos en repos ya instalados | `manifest.obsolete[]` los declara muertos, y el motor los detecta con o sin lockfile ([plan.js:44-48](../../src/core/plan.js#L44-L48)) |
| `git ls-files` falla si el test corre fuera de un repo git | El test es del repo generador, que siempre es un repo git. Si `git` falla, el test falla ruidoso — correcto, no se degrada en silencio |
| Los docs del Vault duplican contenido entre `docs/` y `templates/base/docs/` y van a divergir | Un test que compare ambos está fuera del alcance de este spec; se anota como deuda en `notes.md`. La alternativa (que el generador se auto-instale sus propios docs) es un cambio de arquitectura que no traza a este spec |
| Borrar `backup-20260714T174401/` pierde el único respaldo de un CLAUDE.md previo | Su contenido está en el historial de git (es la versión anterior de archivos versionados). Se verifica con `git log` antes de borrar |

## Constitution check

- [x] **P5 (destructivo)** — Sí hay algo destructivo: borrar los backups. Van fuera del
      repo, no entran al PR, y se verifica contra `git log` antes. El borrado de los
      archivos viejos de skills en repos consumidores lo hace `--prune`, que ya exige
      tipear `BORRAR` ([_shared.js:106-111](../../src/commands/_shared.js#L106-L111)).
- [x] **P6 (ADR)** — Sí, uno: **por qué las skills se aplanan**. Es una restricción de la
      plataforma que va a tentar a alguien a re-anidarlas en seis meses. `/adr-new` al
      cerrar el bloque 1.
- [x] **P7 (mínimo)** — El bloque 3 es lo que más tienta a crecer. Se acota a un auditor de
      fragmentos y un test arreglado. No se toca el motor de plan/apply, que funciona.
- [x] **P8 (traza)** — Cada archivo traza a un goal: bloque 1 → goal 1, bloque 2 → goal 2,
      bloque 3 → goals 3 y 4, bloque 4 → Q2. Nada más entra.

## Rollback

`git revert` del merge commit. Los repos consumidores que ya hicieron `upgrade` recuperan
las rutas viejas en el siguiente `upgrade` (el motor las volvería a crear como `RESTORE`),
y las nuevas quedarían como `OBSOLETE` — simétrico, sin pérdida.

---

## Checklist antes de avanzar a tasks-lite

- [x] ¿La tabla de archivos está completa?
- [x] ¿Los 4 principios del constitution check están respondidos, no tildados a ciegas?
