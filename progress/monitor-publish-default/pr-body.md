# PR — feat: el monitor publica al Vault por defecto

> Rama: `feat/monitor-publish-default` → `dev`
> Abrir en: https://github.com/ialvarezsoutec/souclaude-harness/pull/new/feat/monitor-publish-default

## Descripción del cambio

El consumo global de tokens dependía de que cada miembro recordara pasar `--publish` al
monitor: en la práctica nadie lo hacía y la sección CUENTAS de las demás máquinas quedaba
vacía. Con este PR, tener `.claude/vault.local.json` configurado ya activa la publicación
(solo panel en vivo). Semántica tri-estado del flag: sin flag = auto; `--publish`
explícito = avisa si falta el Vault; `--no-publish` = opt-out por corrida.

No viola el ADR `docs/decisions/20260810-monitor-snapshots-en-vault.md`: se publican
exactamente los mismos agregados < 1 KB por whitelist — el ADR autoriza el *qué*, no
condiciona el *cuándo*.

Archivos: `src/cli.js` (flag + help), `src/commands/monitor.js` (`crearPublisher`,
ahora exportado para test), `test/monitor-publish-default.test.js` (4 tests nuevos).

## Hito relacionado
- ID del hito (`<PREFIJO>-H<n>`): N/A (rocas desactivadas — excepción temporal de CLAUDE.md)
- Roca / trimestre: N/A

## Tipo de cambio
- [x] Nueva funcionalidad

## Pruebas realizadas
- [x] Ejecuté el proyecto en local
- [x] Probé el flujo principal afectado (4 tests nuevos: auto-on con Vault, opt-out,
      sin Vault sin ruido, aviso solo con --publish explícito)
- [x] Validé que no se subieron credenciales ni .env
- [x] Validé que el cambio no rompe funcionalidades existentes (`npm test` 379/379)
- [x] Actualicé documentación si aplica (help del CLI)

## Evidencia

`npm test`: 379/379 en verde (375 previos + 4 nuevos).

## Impacto / Riesgos

Cada monitor en vivo con Vault configurado empezará a commitear snapshots agregados al
Vault cada ~5 min (solo si cambian; heartbeat 30 min). Es el comportamiento deseado para
el consumo global multicuenta. Sin impacto en producción ni integraciones.

## Requiere versión / release
- [x] No (puede ir junto con vault-sync en v2.4.0)

## Notas para despliegue

Requiere Vault conectado por máquina (`docs/vault-setup.md`). Depende conceptualmente de
que `feat/vault-sync` y `fix/ci-node-version` mergeen primero (CI verde), aunque no hay
conflicto de código directo salvo `src/cli.js` (trivial).
