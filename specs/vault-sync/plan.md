# Plan Lite: comando `souclaude vault-sync`

**Spec**: `specs/vault-sync/spec.md`
**Creado**: 2026-08-11

---

## Diseño

### Nuevo módulo `src/core/vault-sync.js` (async, no toca `core/vault.js`)

`core/vault.js` es síncrono e interactivo (instalador); la sincronización es async y
sin UI. Módulo nuevo, mismo criterio que separó al publisher.

```js
export async function pullRebaseSeguro({ vaultPath, git = gitReal })
// → { ok: true } | { ok: false, motivo: 'pull_fallo' }
// pull --rebase; ante fallo, rebase --abort defensivo (ignora su propio fallo) y
// NO toca nada más. Patrón extraído de vault-monitor-publisher.js:194-204.

export async function pushSeguro({ vaultPath, mensaje, paths = null, git = gitReal })
// → { ok: true, motivo: null | 'sin_cambios' } | { ok: false, motivo: 'push_fallo' | 'pull_fallo' }
// add <paths> → commit -m <mensaje> → pullRebaseSeguro → push.
// "nothing to commit" (commit sale con error y el status lo confirma) => ok con
// motivo 'sin_cambios'. Jamás --force. git inyectable (patrón execFile async del
// publisher, exportado como gitReal).
```

`vault-monitor-publisher.js` importa `pullRebaseSeguro` y borra su bloque duplicado
(líneas 192-204). Su backoff y su manejo de `git_fallo` quedan como están.

### Comando `src/commands/vault-sync.js`

```
souclaude vault-sync              → pull seguro
souclaude vault-sync --push -m "<msg>" [--paths a,b]  → espejo/kanban
souclaude vault-sync --status     → configurado o no, ruta, dirty state
```

- Lee config con `readVaultConfig(cwd)` (ya existe). Sin config → mensaje con el
  runbook (`harnessDocsUrl('docs/vault-setup.md')`) y **exit 3**.
- `--push` sin `-m` → error de uso, exit 2 (coherente con el resto del CLI).
- Default de `--paths`: si no se pasa, `add -A` sobre el Vault completo (el Vault es
  chico y de push directo; el llamador que quiera precisión pasa `--paths`).
- Salidas con `ui.log.*`, sin stack traces (patrón `monitor.js`).
- Exit codes: 0 / 1 / 2 (uso) / 3 (sin config).

### Cableado `src/cli.js`

- `import { vaultSync }` + entrada `'vault-sync': vaultSync` en `COMMANDS`.
- Flags nuevos en `OPTIONS`: `push` (boolean), `message` (string, short `m`),
  `paths` (string, lista separada por comas), `status` (boolean).
- Sección nueva en el help.
- Nota: el comando llega por positional (`positionals[0]`), no colisiona con
  `autoDetect`.

### Permisos `.claude/settings.json`

`permissions.allow` += `"Bash(node bin/cli.mjs vault-sync:*)"`,
`"Bash(npx souclaude vault-sync:*)"`. No se toca `Bash(git push:*)` de ask.

### Prosa → comando

- `progress/README.md`: la sección de comandos canónicos pasa a mostrar
  `vault-sync` / `vault-sync --push -m "..."` (la secuencia git cruda queda como
  referencia de lo que hace por dentro).
- `.claude/agents/{orchestrator,spec-author,implementer,reviewer}.md`: los bloques de
  pre-flight y espejo invocan el comando. El orchestrator además reporta al humano en
  el cierre si `vault-sync` salió ≠ 0 (distinguiendo exit 3 = sin configurar de
  exit 1 = falló), manteniendo la línea `vault_skip`/`vault_fail` en `history.md`.

## Tests (`node --test`, git fake inyectado como en `test/monitor-vault-publisher.test.js`)

`test/vault-sync.test.js` — sobre el módulo core y el comando:
1. `pullRebaseSeguro` feliz: llama `pull --rebase` y devuelve ok.
2. `pullRebaseSeguro` con pull fallido: intenta `rebase --abort`, devuelve
   `pull_fallo`, y no ejecuta nada más.
3. `pushSeguro` feliz: orden exacto add→commit→pull→push.
4. `pushSeguro` con "nothing to commit": ok + `sin_cambios`, sin push... (ver task —
   si no hay commit nuevo no se pushea).
5. Comando sin config → exit 3. Con config → exit 0/1 según el git fake.
6. `--push` sin `-m` → exit 2.
7. Aserción anti-hack: ningún test registra jamás un arg `--force` en el git fake
   (guard central en el fake que falla el test si aparece).

Ajuste en `test/monitor-vault-publisher.test.js`: solo si el import del helper cambia
la forma de inyectar `git` (se espera que no: la firma se conserva).

## Riesgos

- CRLF/rutas con espacios: git via `execFile` con args en array ya lo cubre.
- Concurrencia entre máquinas: la cubre `pull --rebase` + push directo (mismo modelo
  ya validado por el publisher).
