# Plan Lite: el CLI clona el Vault de forma segura y con menos fricción

**Spec**: [spec.md](./spec.md)
**Status**: draft
**Owner**: Ignacio A
**Hito**: SHS-H2

---

## Cambios concretos

| Archivo | Cambio |
|---|---|
| `src/core/vault.js` | `isInsideCwd(cwd, target)` nueva: usa `path.relative` para decidir si `target` es `cwd` o cae adentro. `ensureVault()` la aplica en los dos puntos donde hoy se resuelve un destino de clonado (ruta tipeada en el prompt, y `--vault-path` combinado con `--vault-clone`) y **reintenta preguntar** en vez de clonar. Autodetección del sibling (`../soubunker-vault`) antes de cualquier pregunta. Colapso de las dos preguntas encadenadas a una sola cuando no hay Vault detectado |
| `src/cli.js` | Flag nuevo `'vault-clone': { type: 'boolean' }` en `OPTIONS`, documentado en `printHelp()` |
| `test/vault.test.js` | Casos nuevos: ruta interactiva dentro de cwd se rechaza y reintenta; `--vault-path` + `--vault-clone` dentro de cwd se rechaza en modo `--yes`; sibling existente se conecta sin preguntar; el camino interactivo hace una sola pregunta |

## Decisiones técnicas

- **`isInsideCwd` por `path.relative`, no por prefijo de string.** Un chequeo tipo
  `target.startsWith(cwd)` falla con casos como `cwd = /repo` y `target = /repo-otro`
  (prefijo de string coincide, contención real no). El patrón correcto:
  `const rel = path.relative(cwd, target); const inside = rel !== '' && !rel.startsWith('..') && !path.isAbsolute(rel)`.
  `rel === ''` es el caso `target === cwd` exacto, que también se rechaza (clonar el Vault
  encima del propio repo es el mismo problema).

- **La detección compara rutas resueltas (`path.resolve`), no las rutas crudas
  tipeadas.** Ya es lo que hace `ensureVault` hoy antes de esta implementación
  ([vault.js:136,146](../../src/core/vault.js#L136)); el chequeo nuevo se inserta después
  de esa resolución, no la reemplaza. No se resuelven symlinks (`fs.realpathSync`):
  si alguien crea un symlink dentro del repo apuntando afuera para eludir el chequeo, ya
  demostró que sabe lo que está haciendo — no es el caso que este spec previene (usuario
  descuidado tipeando una ruta relativa sin pensar).

- **Reintentar en vez de abortar, en el camino interactivo.** Descartado terminar el paso
  del Vault entero ante una ruta inválida: sería peor experiencia que simplemente volver a
  preguntar con un mensaje claro de por qué se rechazó. En el camino no interactivo
  (`--vault-clone` + `--yes`), sí se aborta con warning — no hay a quién reprEguntarle.

- **Corrección encontrada al implementar T102**: la única pregunta del camino feliz
  (`Clonar <repo> en <destino>? [Y/n]`) usa un destino que **calcula el propio CLI**
  (`../soubunker-vault`), nunca texto libre del usuario — por construcción, ese destino
  jamás puede caer dentro de `cwd`. Poner el chequeo `isInsideCwd` ahí sería código muerto.
  El texto libre — y por lo tanto el riesgo real del goal 1 — solo reaparece si el usuario
  **rechaza** el destino sugerido: recién ahí se le pregunta una ruta, y es ahí donde vive
  el bucle de reintento. El camino feliz sigue siendo una sola pregunta (goal 3); el
  escape hatch (rechazar + tipear) es el único lugar donde `isInsideCwd` se ejecuta de
  verdad.

- **`--vault-clone` es un flag nuevo, no una reinterpretación de `--vault-path`.**
  `--vault-path` hoy significa "conectá esto que ya existe" — mezclar semánticas (a veces
  conecta, a veces clona) sería sorprendente. `--vault-clone` es explícito: "si no existe,
  cloná ahí". Sin él, `--yes` sigue sin clonar nunca, que es el comportamiento actual y
  correcto para CI.

- **La autodetección del sibling solo mira `../soubunker-vault`** (el mismo nombre que
  usa el default actual), no escanea el directorio padre completo buscando cualquier
  carpeta con `00-System/`. Escanear es más "mágico" y más lento; un nombre fijo es
  predecible y ya es lo que todo el flujo actual asume como default.

## Risks

| Risk | Mitigación |
|---|---|
| El reintento interactivo entra en loop infinito si el usuario insiste con rutas inválidas | No es un riesgo nuevo: `ui.text`/`ui.confirm` de `@clack/prompts` ya permiten cancelar (Ctrl+C); no se agrega un límite de reintentos artificial que la librería ya resuelve |
| Cambiar de "dos preguntas" a "una" rompe algún test existente que asuma el flujo viejo | `test/vault.test.js` no tiene ningún caso hoy que ejercite el camino interactivo completo (ensureVault:113-146 no está cubierto) — se confirmó en la inspección original. No hay test que romper, solo que escribir |
| `isInsideCwd` con `cwd` y `target` en discos distintos en Windows (`C:` vs `D:`) | `path.relative` de Node ya devuelve una ruta absoluta cuando no hay relación posible entre discos, que `!path.isAbsolute(rel)` captura correctamente como "no está adentro" |

## Constitution check

- [x] **P5 (destructivo)** — No hay nada destructivo: la función nueva previene una
      escritura, no la ejecuta. Nada que backupear ni confirmar dos veces.
- [x] **P6 (ADR)** — No amerita: es una corrección de bug (falta de validación), no una
      decisión de arquitectura con alternativas de peso similar.
- [x] **P7 (mínimo)** — Una función pura (`isInsideCwd`), su aplicación en dos puntos
      existentes, un flag, y la autodetección/colapso de preguntas que ya estaban
      especificados en el hallazgo original. No se toca `cloneVault`, `finish`, ni el
      formato de `vault.local.json`.
- [x] **P8 (traza)** — `isInsideCwd` traza al goal 1; autodetección al goal 2; colapso de
      preguntas al goal 3; `--vault-clone` al goal 4. Nada fuera de esos cuatro.

## Rollback

`git revert` del merge commit. Sin migraciones de datos ni de formato — el rollback no
deja ningún repo en estado inconsistente.

---

## Checklist antes de avanzar a tasks-lite

- [x] ¿La tabla de archivos está completa?
- [x] ¿Los 4 principios del constitution check están respondidos, no tildados a ciegas?
