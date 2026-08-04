# Tasks Lite: el CLI clona el Vault de forma segura y con menos fricción

**Spec**: [spec.md](./spec.md)
**Plan**: [plan.md](./plan.md)
**Estimated total**: ~5 horas

> Segundo spec del hito SHS-H2 — bloque de 100 arranca en T101.

---

## Tasks

- [ ] **SHS-H2-T101** — Agregar `isInsideCwd(cwd, target)` a `src/core/vault.js`:
      `path.relative(cwd, target)`, adentro si el resultado no empieza con `..` y no es
      absoluto (incluye el caso `target === cwd`, `rel === ''`). Función pura, sin efectos
      secundarios — no toca `ensureVault` todavía.
      `src/core/vault.js` · 20 min · depende de: ninguna
      Verificación: caso nuevo en `test/vault.test.js` — `isInsideCwd` exportada, casos
      positivo (`cwd/sub/dir`), negativo (`../sibling`), borde (`target === cwd`), y
      discos distintos en Windows (`C:\a` vs `D:\a`).

- [ ] **SHS-H2-T102** — Reescribir el tramo interactivo de `ensureVault()`
      ([vault.js:127-146](../../src/core/vault.js#L127-L146)):
      1. Antes de preguntar nada, si `../soubunker-vault` existe y tiene `00-System/`,
         conectar directo (`finish`) sin ninguna pregunta.
      2. Si no, una sola pregunta: `Clonar <repo> en <destino>? [Y/n]` con el default ya
         resuelto (`../soubunker-vault`) — se elimina la pregunta previa "¿tenés el Vault
         clonado?". Quien ya lo tiene clonado en otro lado sigue usando `--vault-path`
         (camino no interactivo, ya existe).
      3. Antes de llamar a `clonar()`, aplicar `isInsideCwd`. Si el destino cae adentro,
         `ui.log.warn` explicando por qué, y volver a preguntar la ruta (no abortar el
         paso completo).
      `src/core/vault.js` · 40 min · depende de: T101
      Verificación: casos nuevos en `test/vault.test.js` — sibling presente conecta sin
      ninguna llamada a `ui.confirm`/`ui.text` (mock que falla el test si se invocan);
      camino sin sibling hace exactamente una pregunta antes de clonar; ruta dentro de
      `cwd` tipeada en el prompt se rechaza y vuelve a preguntar en vez de clonar ahí.

- [ ] **SHS-H2-T103** — Flag `--vault-clone` en `src/cli.js` (`OPTIONS` + `printHelp`).
      En `ensureVault()`, camino `yes` ([vault.js:121-125](../../src/core/vault.js#L121-L125)):
      si `flags['vault-clone']` y hay `repo`, calcular destino (`flags['vault-path']` si
      vino, si no el sibling autodetectado o el default), aplicar `isInsideCwd` — si cae
      adentro, abortar con warning explicando por qué (no hay a quién reprEguntarle en
      modo no interactivo); si no, clonar sin confirmar (ya se confirmó vía el flag
      explícito).
      `src/cli.js` · `src/core/vault.js` · 30 min · depende de: T101
      Verificación: caso nuevo en `test/vault.test.js` — `--vault-path <dentro-de-cwd>
      --vault-clone --yes` no clona nada y devuelve `null`; `--vault-clone --yes` con
      destino válido clona sin llamar ningún prompt.

- [ ] **SHS-H2-T104** — Cerrar cobertura de `test/vault.test.js` contra los 5 criterios de
      éxito del spec en un solo barrido (algunos ya quedan cubiertos por T101-T103;
      esta task es la pasada final que confirma que los 5 están, no que agrega lógica
      nueva).
      `test/vault.test.js` · 20 min · depende de: T101, T102, T103
      Verificación: los 5 criterios de éxito de `spec.md` tienen un test que los nombra
      explícitamente (por `it()`/`test()` description), no solo cobertura incidental.

---

## Cierre

- [ ] `npm test` → verde total (70 + los nuevos de esta spec)
- [ ] `node bin/cli.mjs verify --strict` limpio
- [ ] PR draft abierto contra `main` con la plantilla completa (encadenado sobre el PR de
      SHS-H2-cli-template-completo — este spec depende de sus cambios en `vault.js`)
