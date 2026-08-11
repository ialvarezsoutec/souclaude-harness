# PR draft — fix/SHS-H3-extra-historico

> Cuerpo listo para pegar al abrir el PR (`gh` no está instalado en la máquina donde se
> ejecutó el hito; el PR se abre desde la web). Rama: `fix/SHS-H3-extra-historico` → `main`.
> Abrir como **draft**.

---

## Descripción del cambio

El monitor de tokens pintaba el gasto extra agotado ($21.36/$20.00, congelado por la API
desde el 2026-08-06) como límite vivo al 107% en alarma permanente, y la fila "Semanal
Fable" podía desaparecer por una colisión de deduplicación. Este PR:

- usa el `utilization` que ya trae la API para el extra (100%, no un recálculo local de 107%)
  y respeta sus flags `is_enabled`/`spend_limit_reached` (T101);
- corrige el dedup de filas para distinguir tipo y modelo (T102);
- agrega la regla pura de dominio "extra vencido pasa a histórico a las 24 h"
  (`domain/gasto-extra.js`, T103);
- persiste el periodo en `~/.claude/souclaude/usage-history.json` con sellado al reset
  mensual y flag `--seed-extra-detectado-en` (T104 + ADR
  `docs/decisions/20260810-monitor-persiste-historico-de-gasto-extra.md`);
- muestra el extra archivado en una sección **HISTORICO** al pie del panel (todos los
  modos) y en `historico` de `--json`, sin disparar la alarma del título (T105);
- avisa cuando el fetcher de límites acumula fallos/backoff y los datos quedan viejos (T106);
- documenta la cadencia real de refresco (TTL 5 min; `--no-refresh`/CI/`--claude-home`
  desactivan la red) en el README (T107).

Los tokens consumidos por esos $20 extra no son recuperables (otra máquina, sin monitor);
solo se conserva el snapshot en dólares y la fecha real del límite vía seed.

## Hito relacionado

- ID del hito (`<PREFIJO>-H<n>`): **SHS-H3** (spec `specs/SHS-H3-extra-historico/`)
- Roca / trimestre: la de SHS en curso (misma roca que `SHS-H3-monitor-tokens`)

## Tipo de cambio

- [x] Nueva funcionalidad (histórico + aviso de datos viejos)
- [x] Corrección de error (107%, dedup, null-safety, flag no registrado)
- [ ] Hotfix producción
- [ ] Refactor
- [x] Documentación (README, ADR, spec/plan/tasks, rastro de progreso)
- [ ] Configuración / mantenimiento
- [ ] Experimento / POC

## Pruebas realizadas

- [x] Ejecuté el proyecto en local (`node bin/cli.mjs monitor --once/--json`, máquina real)
- [x] Probé el flujo principal afectado (extra real archivado como HISTORICO al pie, sin
      alarma; `--json` con `historico`; seed `2026-08-06T18:00Z` aplicado)
- [x] Validé que no se subieron credenciales ni .env
- [x] Validé que el cambio no rompe funcionalidades existentes (`npm test`: **325/325**,
      0 tests preexistentes modificados salvo el vacuo que el review exigió reemplazar)
- [x] Actualicé documentación (README + ADR + spec)

## Evidencia

- Review independiente en `progress/SHS-H3-extra-historico/review.md`: primer dictamen
  CHANGES_REQUESTED (4 hallazgos de código + rastro), rework en `3f8ef3b`/`d96fc32`/
  `40652ee`/`40074bd`, segundo dictamen **APPROVED** con verificación anti-vacuo en
  worktrees (los tests nuevos fallan contra el código pre-fix).
- Trazabilidad por task en `progress/SHS-H3-extra-historico/impl_summary.md` y
  `progress/history.md`.
- Panel real tras el cambio: título sin `LIMITE`, filas vivas 5h/7d/Semanal Fable, y al pie
  `HISTORICO | Extra ago-2026  $21.36/$20.00  alcanzado 06-08`.

## Impacto / Riesgos

Solo CLI local del harness (comando `monitor`). No toca producción, Odoo, APIs, Docker,
Azure, Jetson ni DGX. Nuevo archivo de estado local `~/.claude/souclaude/usage-history.json`
(lectura tolerante a corrupto; escritura directa por EPERM de OneDrive, igual que
`usage-cache.json`).

**No-bloqueantes diferidos** (del review, con registro aquí para que tengan dueño futuro):
1. `usadoUsd` null hace desaparecer la fila del extra (mismo efecto que el hallazgo 4 original).
2. `detectadoEn` en el futuro deja el extra como `vivo` permanente (sin clamp).
3. El monto del registro abierto no se actualiza si el gasto sube después de la primera observación.
4. `--json` necesita dos corridas para exponer `historico` la primera vez (el snapshot se lee antes del primer registro).
5. `motivoDeshabilitado` se mapea pero nadie lo muestra (campo muerto).
6. `tipo` solo se agregó a las filas de ventana, no a las de `porGrupo`.
7. Commits `aac0282`/`e2afccf` quedaron sin footer `Refs:`.

## Requiere versión / release

- [ ] No
- [x] Sí
Versión sugerida: **MINOR** sobre la última `v1.x` (nueva funcionalidad compatible:
sección Histórico + persistencia). El coordinador crea el tag.

## Notas para despliegue

Ninguna especial. Opcional en máquinas donde el límite se alcanzó antes de instalar esta
versión: correr una vez
`node bin/cli.mjs monitor --once --seed-extra-detectado-en <fecha ISO>` para sembrar la
fecha real del límite (solo aplica si no existe registro previo).
