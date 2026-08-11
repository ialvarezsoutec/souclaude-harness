# PR — feat: comando vault-sync (sincronización segura con el Vault)

> Rama: `feat/vault-sync` → `dev`
> Abrir en: https://github.com/ialvarezsoutec/souclaude-harness/pull/new/feat/vault-sync

## Descripción del cambio

La sincronización con el Vault era prosa en `.claude/agents/*.md`: una secuencia git que
cada subagente debía recordar. Si la omitía, el espejo no ocurría y nadie se enteraba
(`vault_skip` silencioso). Además `Bash(git push:*)` en `permissions.ask` frenaba cada
push al Vault.

Este PR la convierte en un comando ejecutable (flujo SDD: `specs/vault-sync/`):

- **`src/core/vault-sync.js`** (nuevo): `pullRebaseSeguro` (pull --rebase con
  `rebase --abort` defensivo) y `pushSeguro` (add → commit → pull → push, jamás
  `--force`), git vía `execFile` con args en array, inyectable para tests.
- **`souclaude vault-sync`** (comando nuevo): pull seguro por defecto;
  `--push -m "<msg>" [--paths a,b]` para espejos/kanban; `--status`. Exit codes
  0 ok / 1 falló / 2 uso / 3 sin configurar — los agentes ya no confunden "sin Vault"
  con "falló la red".
- **`vault-monitor-publisher.js`**: adopta el helper (borra su copia del patrón);
  comportamiento idéntico, sus tests pasan sin cambios.
- **Agentes + `progress/README.md`**: el pre-flight y los espejos invocan el comando;
  exit ≠ 0 se anota (`vault_skip`/`vault_fail`) y se reporta al humano en el cierre.
- **`.claude/settings.json`**: allow para el comando (el push ocurre dentro del proceso
  Node; `git push` crudo sigue en ask).

## Hito relacionado
- ID del hito (`<PREFIJO>-H<n>`): N/A (rocas desactivadas — excepción temporal de CLAUDE.md)
- Roca / trimestre: N/A

## Tipo de cambio
- [x] Nueva funcionalidad

## Pruebas realizadas
- [x] Ejecuté el proyecto en local
- [x] Probé el flujo principal afectado (16 tests nuevos en `test/vault-sync.test.js`;
      end-to-end real: espejo de prueba pusheado y retirado del Vault, commits
      `b77a2ef`/`4dfafa9` en `soubunker-vault`)
- [x] Validé que no se subieron credenciales ni .env
- [x] Validé que el cambio no rompe funcionalidades existentes (`npm test` 391/391)
- [x] Actualicé documentación si aplica (agentes, progress/README.md, help del CLI)

## Evidencia

- `npm test`: 391/391 en verde.
- Review del agente `reviewer`: ronda 1 `CHANGES_REQUESTED` (2 hallazgos docs-only,
  corregidos en `1753e58`); dictamen en `progress/vault-sync/review.md`.
- Guard anti `--force` central en el git fake: ningún camino de código puede forzar.

## Impacto / Riesgos

Afecta el flujo de trabajo de los agentes y el repo compartido del Vault. Sin impacto en
producción, Odoo, APIs, Docker, Azure, Jetson ni DGX Spark. Deuda anotada:
`docs/vault-guide.md` y `docs/vault-setup.md` aún muestran la secuencia git cruda
(fuera del scope por P10); las plantillas de `templates/base/` (agentes y
progress/README de los repos consumidores) se actualizan en un PR aparte.

## Requiere versión / release
- [x] Sí
Versión sugerida: v2.4.0 (comando nuevo del CLI)

## Notas para despliegue

Cada máquina del equipo necesita el Vault conectado (`docs/vault-setup.md`):
`git clone <vault> <ruta-fuera-del-repo>` + `npx souclaude upgrade --vault-path <ruta>`.
