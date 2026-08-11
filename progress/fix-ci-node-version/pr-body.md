# PR — fix: CI en Node 22/24 y trigger en dev

> Rama: `fix/ci-node-version` → `dev`
> Abrir en: https://github.com/ialvarezsoutec/souclaude-harness/pull/new/fix/ci-node-version

## Descripción del cambio

El workflow de CI fijaba `node-version: 20` mientras `src/cli.js:75` usa
`parseArgs({ allowNegative: true })`, disponible recién desde Node 22.4 (coherente con
`engines: ">=22.4"` de `package.json`, subido en el commit `00421fd` sin actualizar el
workflow). En Node 20 todo flag `--no-<flag>` (`--no-vault`, `--no-backup`) salía con
exit 2, tumbando `test/vault.test.js:88-89` y `test/mode.test.js:103` solo en CI —
localmente pasaban porque los devs corren Node 24.

Cambios:
- `ci.yml`: matriz `node: [22, 24]` — 22 custodia el piso de `engines` (el bug fue
  exactamente un desfase engines↔CI), 24 es la versión de trabajo del equipo.
- `ci.yml`: `push` a `dev` también dispara CI (antes solo `main`; los merges directos a
  `dev` no corrían nada).
- `package-lock.json` regenerado: estaba fosilizado en `1.0.0` / `engines >=20`.
- `.nvmrc` (24) y `.npmrc` (`engine-strict=true`): un `npm ci` con Node incorrecto
  falla ruidoso en local en vez de instalar y romper después.

## Hito relacionado
- ID del hito (`<PREFIJO>-H<n>`): N/A (rocas desactivadas — excepción temporal de CLAUDE.md)
- Roca / trimestre: N/A

## Tipo de cambio
- [x] Corrección de error
- [x] Configuración / mantenimiento

## Pruebas realizadas
- [x] Ejecuté el proyecto en local
- [x] Probé el flujo principal afectado (`npm ci` + `npm test`: 375/375 en verde con el lockfile regenerado; `node bin/cli.mjs verify --strict` y `upgrade --dry-run --yes` con exit 0)
- [x] Validé que no se subieron credenciales ni .env
- [x] Validé que el cambio no rompe funcionalidades existentes
- [x] Actualicé documentación si aplica (no aplica)

## Evidencia

```
ℹ tests 375
ℹ pass 375
ℹ fail 0
```

Nota de entorno: con `NO_COLOR=1` en el shell fallan 2 tests de `monitor-render.test.js`
(picocolors prioriza `NO_COLOR` sobre `FORCE_COLOR`). Los runners de GitHub no fijan
`NO_COLOR`, así que no afecta CI; queda anotado por si algún dev lo tiene seteado.

## Impacto / Riesgos

Solo CI y tooling local. No toca código de producción ni integraciones (Odoo, APIs,
Docker, Azure, Jetson, DGX Spark). Riesgo: `engine-strict=true` hará fallar `npm ci`
a quien tenga Node < 22.4 — es intencional y el mensaje de npm indica la versión.

## Requiere versión / release
- [x] No

## Notas para despliegue

Ninguna. Al mergear, verificar que los 4 jobs (windows/ubuntu × 22/24) queden en verde.
