# Plan — Monitor de tokens: extra congelado, "Semanal Fable" y sección de histórico

> Escrito para ser ejecutado por agentes con modelo **Sonnet** bajo el flujo SDD del repo.
> Responder y redactar todo en **español neutro (tuteo)**. Respetar P1-P10, en especial
> P2 (el dominio no importa frameworks ni Node APIs), P9 (Simplicity First) y P10
> (cambios quirúrgicos: nada fuera de lo listado aquí).

## Contexto

El comando `souclaude monitor` (rama `feature/SHS-H3-monitor-tokens`) muestra los
límites de uso de Claude. El usuario reportó dos síntomas:

1. **"Semanal Fable" y el "Extra" parecen no actualizarse automáticamente.**
2. **El extra llegó a su límite el jueves 2026-08-06** ($21.36 consumidos sobre $20.00)
   y desde entonces la fila queda clavada arriba en alarma permanente
   (`LIMITE 107% Extra $21.36/$20.00`). El usuario quiere que, pasadas **24 horas** de
   alcanzado el límite, esa fila baje a una sección de **histórico** al pie del panel.

La investigación (2026-08-10) confirmó las causas reales:

- **El extra NO tiene un bug de refresco: está congelado en el origen.** La API
  (`GET https://api.anthropic.com/api/oauth/usage`) devuelve
  `extra_usage: { is_enabled: false, monthly_limit: 2000, used_credits: 2136,
  utilization: 100, disabled_reason: "org_level_disabled_until",
  spend_limit_reached: true }`. El valor no va a cambiar hasta el reset mensual de la
  organización. El bug es de **presentación**: el panel lo pinta como límite vivo.
- `usage-limits-reader.js` calcula `habilitado` y `alcanzado` (líneas 154 y 158), pero
  **`panel-presenter.js:122-130` los ignora**, y además **recalcula** el porcentaje
  (`toGastoExtra`, `usage-limits-reader.js:151`: `usado/limite*100` = 106.8 → 107 %)
  descartando el `utilization: 100` que la API ya trae. Como las filas se ordenan por
  porcentaje descendente y 107 ≥ `UMBRAL_ALARMA` (85), la fila queda primera y el
  título en rojo para siempre.
- **"Semanal Fable" sí se actualiza**, pero con TTL de 5 min del fetcher
  (`usage-fetcher.js:39`) frente a ticks de 2 s — comportamiento correcto, hay que
  comunicarlo, no cambiarlo. Además hay un **bug latente de dedup**:
  `panel-presenter.js:102-120` descarta filas de `porGrupo` cuya clave
  `${porcentaje}|${reseteaEn}` coincida con una ventana ya emitida; hoy
  `weekly_scoped/Fable` (7 % @ ...01:59:59) se salvó de colisionar con `seven_day`
  (7 % @ ...02:00:00) por **1 segundo**. Si coinciden, la fila Fable desaparece sin aviso.
- **Los fallos de red son 100 % silenciosos**: `usage-fetcher.js` hace `return null` +
  fallback al cache ante token ausente/401/timeout, con backoff de 15/60 min, y su
  `estado()` (líneas 63-65) solo lo consume un test — el panel nunca avisa que está
  mostrando datos viejos.
- **No existe histórico**: el único estado en disco es
  `~/.claude/souclaude/usage-cache.json`, que se sobrescribe en cada fetch. Cuando un
  periodo cierra, el dato se pierde. Los tokens consumidos por esos $20 extra **ya no
  son recuperables** (los consumió otra máquina sin el monitor); lo único rescatable es
  el snapshot en dólares que sí tenemos: `$21.36 / $20.00`, límite alcanzado el
  2026-08-06.

### Respuesta a "¿cada cuánto se debería actualizar una vez pasado el límite?"

No hace falta pollear más rápido: una vez `spend_limit_reached === true` y
`is_enabled === false`, el valor está congelado hasta el reset mensual. El TTL de 5 min
actual es suficiente; lo que cambia es la **presentación** (histórico) y la
**detección del reset** (cuando la API vuelva a traer `is_enabled: true` o
`used_credits` menor, el periodo archivado se cierra y el extra vuelve a la zona viva).

## Encuadre SDD (decisión del usuario)

**Nueva carpeta de spec bajo el mismo hito**: `specs/SHS-H3-extra-historico/`
(mismo ID `SHS-H3`, slug nuevo), **nueva rama** `fix/SHS-H3-extra-historico` nacida de
`main` actualizado, **PR propio**. Hasta que `spec.md`, `plan.md` y `tasks.md` estén
aprobados por el humano, la rama solo admite commits `docs:`. Un commit por task,
esperar OK humano entre tasks, PR draft tras 2-3 commits. Antes de tomar el trabajo:
`git -C "<vault>" pull --rebase` y revisar `Project-SHS/kanban.md` según
`.claude/vault.local.json` y `progress/README.md`.

## Archivos involucrados

| Archivo | Cambio |
|---|---|
| `src/monitor/adapters/panel-presenter.js` | Respetar `habilitado`/`alcanzado`, usar el % de la API, fix de dedup, separar filas vivas vs. histórico |
| `src/monitor/adapters/usage-limits-reader.js` | `toGastoExtra`: no recalcular el %, exponer `utilization`/`disabled_reason` |
| `src/monitor/adapters/usage-history.js` (**nuevo**) | Persistencia del histórico en `~/.claude/souclaude/usage-history.json` |
| `src/monitor/adapters/snapshot-source.js` | Componer el nuevo adaptador; pasar `estado()` del fetcher a `avisos` |
| `src/monitor/adapters/panel-layout.js` | Sección "Histórico" al pie + aviso de datos viejos |
| `src/monitor/domain/ventanas.js` o `consumo.js` | Regla pura de dominio: cuándo un gasto extra pasa a histórico (24 h) |
| `test/monitor-*.test.js` | Cobertura nueva (hoy `toGastoExtra` y el dedup de `filasDeLimites` tienen **cero tests**) |

## Tasks propuestas (para `tasks.md` de la nueva spec)

Cada task = un commit, con su test en el mismo commit. Sin mocks que reemplacen la
lógica; los tests deben fallar si se revierte el fix (Anti-Hack).

**T1 — `fix:` el extra usa el porcentaje de la API y respeta sus flags.**
En `usage-limits-reader.js:145-160`, `toGastoExtra()` debe devolver también
`utilizacion` (el `utilization` de la API), `motivoDeshabilitado`
(`disabled_reason`) — sin descartar `usado`/`limite`, que se siguen mostrando como
`$21.36/$20.00`. En `panel-presenter.js:122-130`, la fila usa `utilizacion` (100 %),
no el recálculo local (107 %). Test: con el payload real de hoy, la fila reporta
100 %, no 107 %.

**T2 — `fix:` el dedup de filas distingue tipo y modelo.**
En `panel-presenter.js:102-120`, incluir `tipo` (kind) y el modelo del scope en la
clave de dedup, no solo `${porcentaje}|${reseteaEn}`. Test: `seven_day` y
`weekly_scoped/Fable` con idéntico porcentaje e idéntico `resets_at` → ambas filas
presentes; `weekly_all` duplicado de `seven_day` → sigue deduplicado.

**T3 — `feat:` regla de dominio "extra vencido pasa a histórico a las 24 h".**
Función pura en dominio (sin I/O, sin `Date.now()` implícito — recibe `ahora` como
parámetro): dado un gasto extra con `alcanzado === true` y la fecha en que se detectó
por primera vez, decide `viva | historica`. Umbral: **24 horas** desde la detección.
Test de la regla pura con fechas límite (23:59 h → viva; 24:01 h → histórica).

**T4 — `feat:` persistencia del histórico (`usage-history.js`).**
Nuevo adaptador que mantiene `~/.claude/souclaude/usage-history.json`:
- Al observar por primera vez `alcanzado === true`, registra
  `{ detectadoEn, usado, limite, moneda }` del periodo en curso.
- Al observar el **reset** (vuelve `is_enabled: true` o `used_credits` cae por debajo
  del valor registrado), sella el periodo (`cerradoEn`) y lo archiva.
- Escritura directa sin temp+rename (misma razón que `usage-fetcher.js:177-187`:
  EPERM de OneDrive). Lectura tolerante a archivo ausente/corrupto (arranca vacío).
- **Seed inicial**: si al primer arranque el extra ya está `alcanzado` y no hay
  registro, usar como `detectadoEn` la fecha conocida **2026-08-06** solo si se pasa
  por flag/entrada explícita; si no, la primera observación. (No inventar datos: los
  tokens de esos $20 no existen y no se estiman.)
Test con FS temporal: detección, sellado por reset, archivo corrupto.

**T5 — `feat:` sección "Histórico" en el panel.**
`panel-presenter.js` separa filas vivas de históricas usando la regla de T3 + los
datos de T4; `panel-layout.js` pinta las históricas **al pie del panel**, atenuadas,
con formato tipo `Extra ago-2026  $21.36/$20.00  alcanzado 06-08`. Una fila histórica
**no** participa del orden por severidad ni del `UMBRAL_ALARMA` del título: al pasar
a histórico, el marco rojo y el `LIMITE 107%` del header desaparecen. `--json`
expone `historico: [...]`. Tests de snapshot del layout y del JSON.

**T6 — `feat:` avisar cuando los datos de límites están viejos.**
Consumir `usageFetcher.estado()` en `snapshot-source.js` (hoy solo lo usa un test):
si hay `fallosSeguidos > 0` o `backoffHasta` en el futuro, agregar a `avisos` una
línea tipo `límites sin refrescar desde hace Xm (reintento en Ym)`. El panel ya tiene
canal de avisos (`snapshot-source.js:95-103`); no crear uno nuevo. Test: fetcher en
backoff → el aviso aparece; fetcher sano → no aparece.

**T7 — `docs:` explicar la cadencia real de actualización.**
En `README.md` (sección del monitor): los límites se refrescan cada 5 min (TTL del
fetcher) aunque el panel tique cada 2 s; con `--no-refresh`, `CI` o `--claude-home`
solo se usa `~/.claude.json`, que únicamente cambia cuando alguien corre `/usage`.
Documentar la sección Histórico y el archivo `usage-history.json`.

## Fuera de alcance (P9/P10 — no hacer)

- Histórico de las ventanas semanales/5 h (solo el gasto extra, que fue lo pedido).
- Cambiar TTLs, backoff o la política de red del fetcher.
- Recuperar/estimar los tokens consumidos por los $20 extra: **imposible**, se
  consumieron en otra máquina sin el monitor. No estimar ni inventar.
- Tocar `precios.js`, el árbol de sesiones, el router o cualquier cosa no listada.

## Verificación end-to-end

1. `npm test` completo (incluye los tests de capas que hacen enforcement hexagonal —
   la regla de 24 h debe quedar en `domain/`, no en el adaptador).
2. `node bin/cli.mjs monitor --once --no-refresh` con el `~/.claude.json` real de esta
   máquina: el extra debe aparecer **al pie, como histórico, al 100 %**, sin marco
   rojo ni `LIMITE 107%` en el título, y "Semanal Fable" visible con su % vigente.
3. `node bin/cli.mjs monitor --json` debe incluir `historico` con
   `usado: 21.36, limite: 20`.
4. Simular colisión de dedup (fixture con mismo % y mismo `resets_at` para
   `seven_day` y `weekly_scoped/Fable`) → ambas filas visibles.
5. Cuando llegue el reset mensual real, verificar manualmente que el periodo se sella
   en `usage-history.json` y el extra vuelve a la zona viva en $0.
