# Tasks Lite: el CLI clona el Vault de forma segura y con menos fricción

**Spec**: [spec.md](./spec.md)
**Plan**: [plan.md](./plan.md)
**Estimated total**: ~5 horas

> Segundo spec del hito SHS-H2 — bloque de 100 arranca en T101.

---

## Tasks

- [x] **SHS-H2-T101** — Agregar `isInsideCwd(cwd, target)` a `src/core/vault.js`:
      `path.relative(cwd, target)`, adentro si el resultado no empieza con `..` y no es
      absoluto (incluye el caso `target === cwd`, `rel === ''`). Función pura, sin efectos
      secundarios — no toca `ensureVault` todavía.
      `src/core/vault.js` · 20 min · depende de: ninguna · commit `806641b`
      Verificación: caso nuevo en `test/vault.test.js` — `isInsideCwd` exportada, casos
      positivo (`cwd/sub/dir`), negativo (`../sibling`), borde (`target === cwd`), y
      discos distintos en Windows (`C:\a` vs `D:\a`).

- [x] **SHS-H2-T102** — Reescribir el tramo interactivo de `ensureVault()`. **Corrección de
      diseño encontrada al implementar** (documentada en `plan.md`): el destino sugerido
      del camino feliz lo calcula el propio CLI (`../soubunker-vault`), nunca texto libre
      del usuario, así que por construcción nunca puede caer dentro de `cwd` — poner
      `isInsideCwd` ahí sería código muerto. El texto libre (y el riesgo real del goal 1)
      solo reaparece si el usuario **rechaza** el destino sugerido: recién ahí se le
      pregunta una ruta, y ahí vive el bucle de reintento. Además se inyectó `prompts`
      (default: `ui`) en `ensureVault`/`clonarInteractivo` para poder testear el camino
      interactivo sin TTY real ni mockear el módulo entero.
      `src/core/vault.js` · 40 min · depende de: T101 · commit `f7ec4cd`
      Verificación: sibling presente conecta sin ninguna llamada a `confirm`/`text`;
      camino sin sibling hace exactamente una confirmación antes de clonar; quien la
      rechaza y tipea una ruta dentro de `cwd` la ve rechazada y se le vuelve a preguntar.

- [x] **SHS-H2-T103** — Flag `--vault-clone` en `src/cli.js` (`OPTIONS` + `printHelp`). En
      `ensureVault()`, camino `yes`: si `flags['vault-clone']` y hay `repo`, calcular
      destino (`flags['vault-path']` si vino, si no el sibling/default), aplicar
      `isInsideCwd` — si cae adentro, abortar con warning (no hay a quién reprEguntarle en
      modo no interactivo); si no, clonar sin confirmar (ya se confirmó vía el flag).
      `src/cli.js` · `src/core/vault.js` · 30 min · depende de: T101 · commit `f7ec4cd`
      Verificación: `--vault-path <dentro-de-cwd> --vault-clone --yes` no clona nada y
      devuelve `null`; `--vault-clone --yes` con destino válido clona sin ningún prompt.

- [x] **SHS-H2-T104** — Cerrar cobertura de `test/vault.test.js` contra los 5 criterios de
      éxito del spec. **Hallazgo durante la escritura de los tests**: `mkRepo()` crea el
      repo directo bajo `os.tmpdir()`, así que `path.dirname(cwd)` es siempre el mismo
      valor para todos los tests — el sibling `../soubunker-vault` que usa `ensureVault`
      por default hubiera sido una ruta **compartida** entre tests, y uno que dejara ese
      directorio clonado de verdad (como el de "una sola confirmación") habría contaminado
      los siguientes. Se agregó `mkIsolatedRepo()` local al archivo de test — cada repo de
      prueba nace en un padre único, así su "afuera" también lo es.
      `test/vault.test.js` · 20 min · depende de: T101, T102, T103 · commit `6317d13`
      Verificación: los 5 criterios de éxito de `spec.md` tienen un test que los nombra
      explícitamente. 21/21 en `vault.test.js`.

---

## Cierre

- [x] `npm test` → 289/289 verde total
- [x] `node bin/cli.mjs verify --strict` limpio
- [ ] PR draft abierto contra `main` con la plantilla completa (encadenado sobre el PR de
      SHS-H2-cli-template-completo — este spec depende de sus cambios en `vault.js`)
