# Tasks: Trazabilidad multi-cuenta en el monitor (vía Vault)

**Spec**: [spec.md](./spec.md)
**Plan**: [plan.md](./plan.md)
**Estimated total**: ~8-11 horas (11 tareas)
**Status**: in progress (spec/plan y ADR aprobados el 2026-08-10)

---

## Reglas de escritura

- Un commit por task, con footer `Refs: <ID-task>`. No en batch al final.
- ID de task: `SHS-H3-T2nn`. Tercer spec del hito → bloque `T201`-`T299` (el primero usó
  `T01`-`T27`, el segundo `T101`-`T107`).
- Regla de asignación de modelo (heredada del plan del hito): `mecanica` → **Sonnet** ·
  `estandar` → **Sonnet** · `compleja` → **Opus**.
- **Bloqueo duro**: T205-T211 no arrancan sin el ADR aprobado
  (`docs/decisions/20260810-monitor-snapshots-en-vault.md`).

---

## Tabla de tareas

| # | Título | Archivos | Dependencias | Clase | Modelo |
|---|---|---|---|---|---|
| T201 | Dominio puro de cuentas: `aliasDeCuenta`, `normalizarCuenta` + tests | `domain/cuentas.js`, `test/monitor-cuentas.test.js` | — | mecanica | Sonnet |
| T202 | Identidad en el lector de límites: `{limits, cuenta, warnings}` + fixture con/sin `oauthAccount` | `adapters/usage-limits-reader.js`, `test/usage-limits-reader.test.js` | — | estandar | Sonnet |
| T203 | Propagar `cuenta` por snapshot y vista; header con `alias@hostname` | `adapters/snapshot-source.js`, `domain/arbol.js`, `adapters/panel-presenter.js` | T201, T202 | estandar | Sonnet |
| T204 | Router log con `cuenta`/`cuenta_uuid`/`maquina` + SKILL §5 (mismo commit) | `adapters/router-log-writer.js`, `.claude/skills/ccem-model-router/SKILL.md`, test | T203 | estandar | Sonnet |
| T205 | Publisher al Vault: snapshot whitelist, cambio material, heartbeat, secuencia git, backoff, `contieneSecreto` | `adapters/vault-monitor-publisher.js`, test con git fake | ADR, T203 | **compleja** | **Opus** |
| T206 | Wiring `--publish` en el comando: `readVaultConfig`, degradación sin Vault, solo en vivo | `src/commands/monitor.js`, `src/cli.js` | T205 | estandar | Sonnet |
| T207 | Lector de snapshots del Vault: working tree, caché mtime, corruptos → aviso | `adapters/vault-accounts-reader.js`, test con fixtures | ADR | estandar | Sonnet |
| T208 | `consolidarCuentas` (dominio puro): dedup, frescura, reloj futuro | `domain/cuentas.js`, test | T201 | estandar | Sonnet |
| T209 | Sección CUENTAS en panel, plain y `--json` | `adapters/panel-presenter.js`, `adapters/panel-layout.js`, `adapters/plain-renderer.js`, `adapters/snapshot-source.js` | T207, T208 | **compleja** | **Opus** |
| T210 | Documentación: excepción del Vault (`vault-guide.md` §8, `progress/README.md`) y `--publish`/CUENTAS en `README.md` | docs | T206, T209 | mecanica | Sonnet |
| T211 | E2E dos homes falsos + Vault falso (bare + 2 clones): publica A y B, consolida, emite router con cuenta | `test/monitor-multicuenta-e2e.test.js`, `test/fixtures/home-{a,b}/` | T206, T209 | **compleja** | **Opus** |

## Checklist

- [x] T201 · [x] T202 · [x] T203 · [x] T204 (Fase 1 — sin dependencia del ADR)
- [x] ADR aprobado (checkpoint humano, 2026-08-10)
- [x] T205 · [x] T206 (Fase 2)
- [x] T207 · [ ] T208 · [ ] T209 (Fase 3)
- [ ] T210 · [ ] T211 (cierre)

## Coordinación externa (no es task de esta rama)

- Pedir en `SHS-H3-extra-historico` que el formato v1 de
  `~/.claude/souclaude/usage-history.json` (su T104, aún no congelado) incluya
  `accountUuid`.
