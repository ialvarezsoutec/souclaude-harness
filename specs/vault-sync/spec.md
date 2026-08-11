# Spec Lite: comando `souclaude vault-sync`

**Status**: approved
**Owner**: Ignacio A (plan aprobado en sesión del 2026-08-11)
**Creado**: 2026-08-11

> SDD Lite. Rama `feat/vault-sync` (sin ID de hito — excepción temporal de CLAUDE.md,
> rocas desactivadas).

---

## Contexto

La sincronización con el Vault es hoy prosa en `.claude/agents/*.md`: una secuencia de
comandos git que cada subagente debe recordar ejecutar. Si el agente omite el paso, el
espejo no ocurre y nadie se entera (`vault_skip` silencioso en `progress/history.md`).
Además, `Bash(git push:*)` en `permissions.ask` frena cada push manual al Vault.

## Goals

1. Un comando ejecutable `souclaude vault-sync` reemplaza la secuencia git en prosa:
   pull seguro por defecto, push seguro con `--push`, estado con `--status`.
2. El pull/push al Vault es "seguro" por construcción: `pull --rebase` antes de
   escribir, `rebase --abort` defensivo ante fallo, jamás `--force`, git vía
   `execFile` con args en array (nunca shell).
3. Los exit codes distinguen las tres situaciones que hoy se confunden:
   `0` ok / sin cambios · `1` falló el sync (red, conflicto) · `3` Vault no configurado.
4. El push al Vault deja de chocar con `permissions.ask` de `git push`: ocurre dentro
   del proceso Node del CLI, y el comando queda en `permissions.allow`.
5. `vault-monitor-publisher.js` reutiliza el helper de pull en lugar de su copia local
   del patrón (menos duplicación, mismo comportamiento).
6. La prosa de agentes y `progress/README.md` invoca el comando en lugar de la
   secuencia git a mano.

## Non-goals

- NO hooks automáticos de push (Stop/PostToolUse) ni daemon/cron/watcher.
- NO abrir `Bash(git push:*)` en allow — sigue en ask protegiendo el repo del proyecto.
- NO convertir el Vault en dependencia dura: exit ≠ 0 se reporta ruidoso pero el
  trabajo local sigue (doctrina de `docs/vault-guide.md`).
- NO tocar el backoff del publisher (es política de su bucle, no del helper).
- NO submodules, NO dependencias nuevas.

## Success criteria

- [ ] `souclaude vault-sync` con Vault configurado hace pull --rebase y sale 0.
- [ ] `souclaude vault-sync --push -m "docs: espejo X"` hace add→commit→pull→push
      (en ese orden) sobre `Project-<PREFIJO>/` por defecto y sale 0; con `--paths`
      restringe el add a esas rutas relativas.
- [ ] "nothing to commit" sale 0 (no es un error).
- [ ] Pull que falla → `rebase --abort` defensivo + exit 1, sin tocar nada más.
- [ ] Sin `.claude/vault.local.json` ni `VAULT_PATH` → exit 3 con mensaje accionable.
- [ ] Ningún camino de código pasa `--force` a git (aserción explícita en tests).
- [ ] `npm test` completo en verde; tests nuevos en `test/vault-sync.test.js`.
- [ ] Los `.md` de agentes y `progress/README.md` referencian el comando.

## Open questions

- (ninguna — decisiones tomadas en el plan aprobado)
