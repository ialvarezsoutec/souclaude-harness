# Tasks: comando `souclaude vault-sync`

**Plan**: `specs/vault-sync/plan.md`
Un commit por task, con su test. Commits `feat:`/`refactor:`/`docs:` según el task.

---

## T1 — Helper `src/core/vault-sync.js` + tests del módulo

- Crear `src/core/vault-sync.js` con `gitReal`, `pullRebaseSeguro`, `pushSeguro`
  (contratos del plan).
- `test/vault-sync.test.js`: casos 1-4 del plan + guard anti `--force` en el fake.
- Commit: `feat: helper de sincronizacion segura con el Vault (pull/push)`

## T2 — Refactor del publisher para reutilizar el helper

- `vault-monitor-publisher.js` importa `pullRebaseSeguro`; borra el bloque duplicado.
- `npm test`: los tests existentes del publisher siguen en verde sin cambios (la
  inyección de `git` se conserva).
- Commit: `refactor: el publisher del monitor reutiliza pullRebaseSeguro`

## T3 — Comando `vault-sync` + cableado en cli.js + tests del comando

- `src/commands/vault-sync.js` (pull default, `--push -m`, `--status`, exit 0/1/2/3).
- `src/cli.js`: COMMANDS, OPTIONS (`push`, `message` short `m`, `paths`, `status`),
  help.
- Tests: casos 5-6 del plan + `vault-sync` reconocido por el CLI.
- Commit: `feat: comando vault-sync (pull/push seguro al Vault desde el CLI)`

## T4 — Permisos y prosa de agentes

- `.claude/settings.json`: allow para `node bin/cli.mjs vault-sync` y
  `npx souclaude vault-sync`.
- `progress/README.md` + `.claude/agents/*.md`: el pre-flight y los espejos invocan
  el comando; el orchestrator reporta exit ≠ 0 en el cierre.
- Commit: `docs: agentes y progreso invocan vault-sync en lugar de git a mano`

## T5 — Verificación end-to-end real

- `node bin/cli.mjs vault-sync --status` y `vault-sync` contra el Vault real de esta
  máquina; espejo de prueba con `--push` y verificación en el remoto.
- `npm test` completo en verde.
- (Sin commit propio si no hay cambios; la evidencia va al PR.)
