# Review: SHS-H3-extra-historico

**Reviewer**: reviewer (independiente)
**Fecha**: 2026-08-10
**Rama**: `fix/SHS-H3-extra-historico`
**Alcance**: 12 commits `origin/main..HEAD` (1 docs de spec + 3 docs de ajuste, 7 de codigo T101-T107, 1 rework de `cli.js`)
**Spec**: `specs/SHS-H3-extra-historico/{spec.md,plan.md,tasks.md}`

## Veredicto

**CHANGES_REQUESTED**

Los tres bugs de la spec estan corregidos y la suite corre verde (**317/317, 0 fail**, verificado
por mi con `npm test`). El trabajo es de buena calidad: los fixes de T101/T102 estan probados
contra el payload real pasando por el pipeline completo (sin mocks), la regla de las 24h vive en
`domain/` sin un solo import externo, y verifique end-to-end por CLI que `--json` trae
`historico` con `usado:21.36 / limite:20` y que `--once` pinta la seccion HISTORICO al pie sin
`LIMITE` en el titulo.

Rechazo por cuatro huecos concretos: un TypeError de dominio alcanzable en produccion y tragado
por un catch vacio (rompe RF-04 en el camino del reset), un criterio de exito de la spec cerrado
con verificacion manual contra su propia regla de escritura, un test que pasa igual con la feature
revertida, y una perdida total de la informacion del extra en los modos compact/agents/angosto.

## Tests: resultado real

```
tests 317   pass 317   fail 0   duration_ms 19771
```

`tasks.md` T106 declara 316/316; el conteo real hoy es 317 (el rework de `cli.js` agrego uno mas).
Ningun test preexistente fue modificado ni borrado para hacer pasar nada: `git diff --numstat -- test/`
da **0 deleciones** en los seis archivos tocados. Ese punto del Anti-Hack esta limpio.

## Trazabilidad requisito vs test

| RF | Implementacion | Test que lo verifica | Estado |
|---|---|---|---|
| RF-01 extra usa utilization | `usage-limits-reader.js:161-162`, `panel-presenter.js:135` | `monitor-presenter.test.js:400` "payload real 2026-08-06: la fila del extra reporta 100%, no el 107%"; `:415` etiqueta $21.36/$20.00; `:422` fallback sin utilization numerica | OK |
| RF-02 dedup por tipo+modelo | `panel-presenter.js:127,133`, `agregarVentana` `:164-171` | `monitor-presenter.test.js:452` (seven_day + weekly_scoped/Fable -> 2 filas); `:470` (weekly_all -> 1 fila) | OK |
| RF-03 regla 24h en dominio | `domain/gasto-extra.js:12-17` | `monitor-domain.test.js:395` (23h59 vivo / 24h01 historico / 24h00 exacto historico); `:410` (alcanzado:false, detectadoEn:null); `monitor-layers.test.js:70` (enforcement automatico por readdir de domain/) | OK |
| RF-04 persistencia | `adapters/usage-history.js` | `monitor-history.test.js:240` (primera deteccion), `:263` (sellado por reset), `:283` (corrupto), `:297` (seed y su descarte), `:332` (sin paths); `monitor-cmd.test.js:78` (el flag llega por subproceso hasta el JSON en disco) | **PARCIAL** - el camino gastoExtra:null con registro abierto lanza (hallazgo 1) |
| RF-05 seccion Historico | `domain/arbol.js:68,627-645`, `panel-presenter.js:64,396-404`, `panel-layout.js:256-265,820-840` | `monitor-presenter.test.js:517` (25h -> sale de vivas, entra a historico), `:530` (1h -> sigue viva); `monitor-view.test.js:602,617` (collect() propaga registroExtra); `monitor-render.test.js:551` (seccion HISTORICO al pie) | **PARCIAL** - sin test del campo en `--json` (hallazgo 2); el test de "no pinta rojo" es vacuo (hallazgo 3); desaparece en compact/agents/angosto (hallazgo 4) |
| RF-06 aviso de datos viejos | `snapshot-source.js:107-119`, `commands/monitor.js:127-136,170-180` | `monitor-view.test.js:633` (backoff -> aviso), `:645` (fetcher sano -> sin aviso), `monitor-cmd.test.js:21` (regresion: sin fetcher, nunca aparece) | OK |
| RF-07 documentacion | `README.md:84-101,161-190`, `cli.js:167-171` | revision editorial (RF sin test por diseno): los tres casos de "sin refresco" y `usage-history.json` con ejemplo estan documentados | OK |

## Constitucion

- **P2 - OK.** `src/monitor/domain/gasto-extra.js` no tiene un solo import (ni `node:*`).
  `domain/arbol.js:10` solo agrega `import { estadoDelExtra } from './gasto-extra.js'`. La decision
  vivo/historico esta en el dominio y el adaptador (`usage-history.js:534`) solo persiste lo que
  `siguienteRegistro()` devuelve - no reimplementa la regla. `test/monitor-layers.test.js` recorre
  `domain/` por readdirSync, asi que el archivo nuevo queda cubierto sin tocar la config del
  enforcement.
- **Naming - OK.** Dominio en espanol (`estadoDelExtra`, `siguienteRegistro`, `gasto-extra.js`);
  adaptadores en ingles (`createUsageHistory`, `usageFetcher`).
- **P9 - OK con una observacion.** Nada especulativo: una funcion pura, un adaptador de 90 lineas,
  una seccion de layout. Unica grasa: `motivoDeshabilitado` (`usage-limits-reader.js:162`) se expone
  y **nunca se consume** en ningun lado. Lo pide RF-01 explicitamente, asi que pasa por P10, pero es
  un campo muerto.
- **P10 - OK con una observacion.** Todo el diff traza a T101-T107 y los commits llevan
  `Refs: SHS-H3-T1xx`. Sin scope creep. Dos excepciones menores: los commits `aac0282` y `e2afccf`
  (docs de ajuste de tasks.md) no llevan footer Refs, y `progress/model-router.jsonl` entra al
  diff con una sola linea (spec-author) sin trazar a ninguna task.
- **Arquitectura documentada - OK.** El ADR pedido por T104 existe:
  `docs/decisions/20260810-monitor-persiste-historico-de-gasto-extra.md`.

## Cambios requeridos (bloqueantes)

### 1. siguienteRegistro lanza TypeError y el error se traga en silencio

`src/monitor/domain/gasto-extra.js:34`

    const seReseteo = gastoExtra?.habilitado === true || gastoExtra.usadoUsd < registroActual.usado

El operador opcional de la izquierda protege el primer acceso; el de la derecha no existe.
Reproducido por mi:

    siguienteRegistro(null, {detectadoEn:1000, usado:21.36, ...}, 2000)
      -> TypeError: Cannot read properties of null (reading 'usadoUsd')
    createUsageHistory({paths}).registrar(null, ahora)   // con un abierto en disco
      -> TypeError: Cannot read properties of null (reading 'usadoUsd')

Es alcanzable en produccion: `src/commands/monitor.js:154` pasa
`vista?.limites?.gastoExtra ?? null`, y `snapshot.limites` es null cuando `.claude.json` no trae
`cachedUsageUtilization` o la lectura falla. En la maquina del owner, que **ya tiene un registro
abierto**, cualquier tick sin cache de limites explota. Y explota mudo:
`src/commands/monitor.js:155-158` lo captura con un catch vacio cuyo comentario habla de
"un fallo de disco" - esta tragando un TypeError de dominio, exactamente el patron que Journey 3
de la spec existe para erradicar.

Consecuencia sobre RF-04: si el reset de la organizacion llega junto con un payload sin
`extra_usage` (o con `limites: null`), el registro **nunca se sella ni se archiva** y el panel
arrastra un historico eterno.

Se espera: `gastoExtra` ausente/null tratado explicitamente en la funcion pura (un extra que ya no
se reporta es, como minimo, "no alcanzado"), y que el catch de `registrarHistorico` deje de ser
un agujero negro - al menos empujar el motivo a `avisos`, como ya hace `snapshot-source.js:113` con
el fallo de `usageHistory.leer()`.

Ademas, `test/monitor-history.test.js:322` ("gastoExtra null ... no abre nada y no lanza") **da
falsa cobertura**: solo prueba el caso sin registro abierto, que es el unico que no falla. Falta el
caso con un registro abierto.

### 2. RF-05 / criterio de exito de spec.md:209-211: historico en --json no tiene test

No existe ningun test automatizado sobre `renderJson`/`--json` que afirme el campo `historico`.
El grep de "historico" en `test/` devuelve solo monitor-domain, monitor-render y monitor-presenter
(este ultimo verifica `proyeccion.historico` del presenter, no la salida JSON ni `vista.historico`
del modelo canonico). `tasks.md:219-225` cierra ese punto con [x] apoyandose en verificacion
manual sobre la maquina real - contra la regla que la propia spec fija en las lineas 24-27
("Ningun RF de esta spec se cierra con verificacion manual como unico criterio").

Verifique a mano que el comportamiento **es correcto** (fixture con extra alcanzado +
`usage-history.json` con detectadoEn 25h atras -> `--json` trae
historico con usado 21.36 / limite 20 / moneda USD, y `limites.gastoExtra.historico === true`).
El problema no es el codigo, es que nada lo protege de una regresion. Se espera un test en
`test/monitor-cmd.test.js` (o monitor-view) que corra el pipeline con `--claude-home` y afirme el
campo sobre el JSON.parse de la salida.

### 3. test/monitor-render.test.js:415 es un test que no prueba nada

El caso "color: un extra historico no pinta el marco de rojo" usa
`vistaEjemplo({ limites: [limite({ porcentaje: 42 })], historico: [...] })`. Con un unico limite al
42%, `limiteEnAlarma()` (`panel-layout.js:267`) devuelve null **siempre**, asi que sus dos asserts
-titulo sin LIMITE y ninguna linea con el ANSI de rojo- son ciertos aunque la feature no exista.
Comprobado: renderizando esa misma vista **sin** la clave `historico`, ambos asserts pasan igual.
El test es verde con T105 completamente revertido.

Eso deja sin cobertura el criterio de RF-05 "test de snapshot del layout confirmando que una fila
historica no dispara el marco rojo ni el texto LIMITE N%". Se espera el caso que si duele: extra al
100% + registroExtra.abierto.detectadoEn de 25h atras pasando por `construirVista`, y afirmar que
el marco no es rojo; y su contraparte de 1h, donde el marco **si** debe ser rojo (hoy tampoco esta
probado que la alarma siga funcionando cuando corresponde).

El test hermano `:551` ("la seccion Historico se pinta al pie sin disparar el titulo LIMITE") si
falla al revertir, por el assert de HISTORICO. Ese no lo cuento como problema.

### 4. En compact, agents y modo angosto el extra historico desaparece por completo

`panel-presenter.js:135` lo saca de `limites` y `lineasHistorico()` solo se invoca desde
`renderFull` (`panel-layout.js:820`). Medido:

    [full]     HISTORICO: si   | "Extra ago": si
    [compact]  HISTORICO: no   | "Extra ago": no
    [agents]   HISTORICO: no   | "Extra ago": no
    [cols=40]  (renderAngosto) | "Extra ago": no

`spec.md:69` es explicito: "bajando a una seccion de Historico al pie, **sin desaparecer**", y el
Journey 2 entero se apoya en "lo que no se ve, no esta pasando". En terminal chica el dato se
evapora sin aviso. Se espera: o pintarlo (aunque sea una linea condensada) en compact/agents, o
declarar la exclusion como decision consciente en spec.md/plan.md con su justificacion. Hoy no
esta ni implementado ni declarado, y ningun test cubre esos modos con historico presente.

### 5. Rastro de progreso incompleto y tasks sin cerrar

- No existe `progress/SHS-H3-extra-historico/impl_summary.md` ni `summary.md`, pese a que
  `progress/README.md:19-20,33-34` los declara obligatorios. `progress/history.md` no tiene **ni una
  linea de implementer** para T101-T107: solo las tres del spec-author.
- `tasks.md:334-341` (Checkpoints humanos) y `:347-357` (Cierre) siguen todos en [ ] sin
  justificacion documentada, incluidos items ya cumplidos y verificables (npm test verde, ADR
  creado, README actualizado).
- `spec.md:3` sigue en Status: draft y sus ocho Success criteria en [ ], aunque seis esten
  cumplidos.
- `.claude/vault.local.json` no existe en esta maquina, asi que el espejo al Vault de este veredicto
  no se pudo hacer (registrado como vault_skip en history.md, igual que hizo el orchestrator).
- No pude verificar el PR draft que pide `tasks.md:355`: `gh` no esta instalado en este entorno.

## Observaciones no bloqueantes

1. **usadoUsd/limiteUsd null hace desaparecer el extra.** `toGastoExtra`
   (`usage-limits-reader.js:149-150`) devuelve null si la API omite monthly_limit/used_credits.
   Con alcanzado:true se abre un registro con usado:null; tras 24h `arbol.js:642` marca
   `gastoExtra.historico = true` (sale de las filas vivas) pero el filtro Number.isFinite de
   `panel-presenter.js:399` deja historico vacio -> el extra no aparece en ningun lado. Borde
   improbable, mismo sintoma que el hallazgo 4.
2. **detectadoEn en el futuro** (reloj corregido hacia atras, seed erroneo) -> la resta da negativo
   -> 'vivo' para siempre (`gasto-extra.js:16`). Comportamiento defendible, sin test.
3. **El monto del registro nunca se actualiza.** Si el extra se detecta a $20.00 y luego sube a
   $21.36, el historico muestra el valor de la deteccion (`gasto-extra.js:47-53` devuelve la misma
   referencia mientras siga alcanzado). Coherente con la letra de RF-04, pero el panel puede
   reportar menos de lo realmente gastado.
4. **--json necesita dos corridas** para exponer historico la primera vez: `registrarHistorico()`
   corre *despues* de buildView (`commands/monitor.js:137`), asi que la corrida que crea el registro
   todavia no lo ve. Vale una linea en el README.
5. **Asimetria en las filas de limites**: `agregarVentana` agrega el campo tipo
   (`panel-presenter.js:167`) pero las filas de porGrupo (`:134-139`) no lo llevan. Sin impacto hoy
   -yaEmitidos se calcula antes del loop- pero invita a un bug futuro.
6. **progress/model-router.jsonl**: una sola linea (spec-author) para siete lanzamientos de
   implementer; y el archivo tiene cambios locales sin commitear.
7. **Fuera del diff pero en el arbol**: `docs/presentacion/` sin trackear y modificaciones sin
   commitear en CLAUDE.md, notes.md y .claude/agents/*. No los evalue: no pertenecen a esta rama.
   Conviene que no entren al PR por accidente.

## Que hay que hacer para aprobar

1. Arreglar `gasto-extra.js:34` (encadenamiento opcional en el segundo acceso) y dejar de tragar el
   error en `commands/monitor.js:155-158`, con un test de `registrar(null, ahora)` **con registro
   abierto**.
2. Test automatizado del campo historico en la salida `--json`.
3. Reescribir `monitor-render.test.js:415` para que falle si T105 se revierte (extra al 100% + 25h
   por construirVista), y agregar el caso inverso (menos de 24h -> marco rojo).
4. Resolver el hallazgo 4: pintar el historico en compact/agents/angosto, o declarar la exclusion
   en la spec.
5. Cerrar el rastro: impl_summary.md, lineas de implementer en history.md, checkboxes de tasks.md
   (Checkpoints y Cierre) y Status de spec.md con el estado real.

---

# Segundo dictamen (re-review del rework)

**Fecha**: 2026-08-11
**Alcance**: SOLO los 5 commits nuevos `a31b9d1..HEAD` - `3f8ef3b`, `40652ee`, `d96fc32`,
`40074bd`, `77df325`. El primer dictamen queda arriba sin modificar.

## Veredicto

**APPROVED**

Los 4 hallazgos bloqueantes estan corregidos de verdad, no maquillados. Verifique cada fix
contra el codigo previo en worktrees separados (sin tocar el arbol del implementer) y los tests
nuevos **fallan** ahi, con el error exacto que reporte. El hallazgo 5 (rastro de proceso) se cerro
con documentacion honesta: lo que sigue pendiente sigue en [ ] y con el motivo escrito.

## (c) Tests: numero real

Corrido por mi, `npm test` sobre `77df325`:

    tests 325   pass 325   fail 0   duration_ms 26506

**325/325, 0 fail.** Cuadra exactamente con el delta esperado: 317 (primer dictamen) + 8 nuevos
= 2 del hallazgo 1 + 1 neto del hallazgo 3 (reemplaza uno vacuo y agrega el caso inverso) + 3 del
hallazgo 4 + 2 del hallazgo 2.

## (a) Cada fix corrige lo que senale

### Hallazgo 1 -> 3f8ef3b - CORREGIDO

`gasto-extra.js:52` ahora corta antes: `if (gastoExtra == null) return registroActual`, y la linea
siguiente ya no necesita el encadenamiento opcional. Reproduje mi caso original contra el codigo
nuevo:

    siguienteRegistro(null, abierto, 2000)       -> registro intacto, cerradoEn: null
    siguienteRegistro(undefined, abierto, 2000)  -> registro intacto, cerradoEn: null
    createUsageHistory({paths}).registrar(null, 999999) -> no lanza, abierto intacto
    reset real: registrar({habilitado:true, usadoUsd:0}) -> archivados: 1, abierto: null

La semantica elegida ("el dato no llego este tick" no es un reset) es mas conservadora que la que
sugeri y esta documentada en el comentario `gasto-extra.js:34-37`. Correcta: no sella con una fecha
falsa.

El catch vacio de `commands/monitor.js` murio: ahora empuja `{file:'usage-history', reason}` a
`vista.avisos`, el mismo canal de `snapshot-source.js`. El fallo silencioso que contradecia
Journey 3 ya no existe.

### Hallazgo 2 -> d96fc32 - CORREGIDO

`test/monitor-cmd.test.js` agrega el caso end-to-end que pedia el criterio de `spec.md:209-211`:
`assert.deepEqual(vista.historico, [{usado:21.36, limite:20, moneda:'USD', detectadoEn}])` mas
`vista.limites.gastoExtra.historico === true`, sobre el pipeline real con `--claude-home`. Suma
gratis un assert que yo no habia pedido y que vale: `code === 0`, o sea que un extra ya historico
tampoco dispara el codigo de salida por alarma. Y el caso complementario (sin registro en disco ->
`historico: []`).

### Hallazgo 3 -> 40652ee - CORREGIDO

El test vacuo desaparecio. En su lugar, `proyeccionConExtra()` pasa por construirVista -> presentar
con el extra al 100% (la unica fila que puede pintar el marco), y quedan dos casos: 25h -> sin
LIMITE y sin rojo; 1h -> **con** LIMITE y **con** rojo. El caso inverso es justamente el que
faltaba: nada probaba que la alarma siguiera viva dentro de las 24h.

### Hallazgo 4 -> 40074bd - CORREGIDO

`renderAgents` reutiliza `lineasHistorico()` descontando su altura del presupuesto (no corre el pie
fuera del contrato de rows); `renderCompact` agrega una linea plana por entrada **y la suma a la
cola** que se preserva con poca altura (detalle correcto: sin eso, el historico se perdia primero
al recortar); `renderAngosto` agrega una linea condensada. Los tres modos tienen test.

### Hallazgo 5 -> 77df325 - CORREGIDO

`impl_summary.md` existe y es honesto: dice explicitamente que **no** hay un veredicto APPROVED en
disco y no se lo atribuye. `history.md` suma las 7 lineas de implementer (T101-T107) con sus
commits reales mas la de rework_done. Los checkboxes de `tasks.md` se marcaron **con evidencia
citada**, y los dos que siguen abiertos (Checkpoints humanos final y PR draft, mas el ultimo
Success criterion) quedan en [ ] con el motivo escrito: falta el firmoff en vivo del owner y el PR.
Eso satisface mi regla dura: no hay [ ] sin justificacion documentada. `Status: implemented` aclara
en la misma linea que el firmoff y el PR siguen pendientes - no es un "listo" inflado.

## (b) Los tests nuevos no son vacuos - medido en worktrees

Worktree en `a31b9d1` (pre-rework) con los archivos de test de HEAD copiados encima:

    tests 172   pass 167   fail 5
    x gasto-extra: siguienteRegistro con gastoExtra null y un registro abierto no lanza y no lo sella
        AssertionError: Got unwanted exception. actual: TypeError: Cannot read properties of null (reading 'usadoUsd')
    x gastoExtra null CON un registro ya abierto: no lanza y deja el registro intacto
        AssertionError: Got unwanted exception. actual: TypeError: Cannot read properties of null (reading 'usadoUsd')
    x contenido: en modo agents el extra historico se pinta al pie, no desaparece
    x contenido: en modo compact el extra historico se pinta al pie, no desaparece
    x contenido: en modo angosto (cols < 60) el extra historico se pinta, no desaparece

Mi TypeError original aparece literal en los dos tests del hallazgo 1. Los tests de los hallazgos 2
y 3 no podian fallar ahi (su codigo ya existia desde T105; lo que faltaba era el test), asi que los
corri contra un segundo worktree en `fa6f36a` = **antes de T105**:

    monitor-render.test.js:  tests 107  pass 102  fail 5
      x color: un extra detectado hace 25h (historico) no pinta el marco de rojo   <- el vacuo de antes PASABA aqui
      x contenido: la seccion Historico se pinta al pie... / agents / compact / angosto
    monitor-cmd.test.js:     tests 21   pass 18   fail 3
      x monitor --once --json: con un registro abierto de mas de 24h, historico trae el extra archivado
      x monitor --once --json: sin ningun registro de gasto extra en disco, historico es []

El contraste es la prueba del hallazgo 3: la version anterior de ese mismo test pasaba con T105
revertido; la nueva falla. Ambos worktrees fueron eliminados despues de medir.

## (d) Ningun test preexistente modificado para pasar

`git diff a31b9d1..HEAD -- test/` tiene **exactamente 2 lineas eliminadas**, y son la firma y el
fixture del test vacuo que yo mismo exigi reemplazar:

    -test('color: un extra historico no pinta el marco de rojo (color real, no solo texto)', () => {
    -    historico: ['Extra ago-2026  $21.36/$20.00  alcanzado 06-08'],

Todo lo demas es adicion. Cero tests preexistentes ajustados para acomodar codigo.

## (e) P10 - cada commit toca solo lo que dice

| Commit | Archivos | Coincide con el mensaje |
|---|---|---|
| `3f8ef3b` | gasto-extra.js, commands/monitor.js, monitor-domain.test.js, monitor-history.test.js | Si |
| `40652ee` | monitor-render.test.js (solo) | Si |
| `d96fc32` | monitor-cmd.test.js (solo) | Si |
| `40074bd` | panel-layout.js, monitor-render.test.js | Si |
| `77df325` | impl_summary.md, history.md, spec.md, plan.md, tasks.md | Si (doc-only) |

Sin scope creep, sin archivos de paso, sin "mejoras" no pedidas. Los 4 commits de codigo/test llevan
footer Refs. `77df325` no lo lleva (es cierre de rastro, no una task) - consistente con los otros
commits doc-only de la rama.

**P2**: `gasto-extra.js` sigue sin un solo import; el rework solo agrego un `if` y comentarios.
`monitor-layers.test.js` en verde dentro de los 325. **P9**: los tres fixes de layout son la
representacion minima de cada modo, sin abstraer un "renderer de historico" que nadie pidio.

## No-bloqueantes diferidos: aceptable

Confirmo que los 7 no-bloqueantes del primer dictamen pueden ir al PR o a un hito futuro. Ninguno
afecta el camino real (extra alcanzado con montos validos, panel en cualquier modo) ni tiene riesgo
de corrupcion de datos: son bordes de payload incompleto, precision de monto y ergonomia. Pido solo
que queden anotados en el cuerpo del PR o en `notes.md` para que no se evaporen - un no-bloqueante
sin registro es un bloqueante futuro sin dueno.

## Observaciones nuevas del rework (ninguna bloqueante)

1. **Consecuencia de la nueva semantica de gastoExtra null** (`gasto-extra.js:52`): si la API dejara
   de reportar `extra_usage` de forma permanente tras el reset, el registro abierto no se sella nunca
   y el panel arrastraria el historico indefinidamente. No es regresion (antes crasheaba y tampoco
   sellaba) y RF-04 define el reset por campos del payload, asi que es coherente con la spec. Sucesor
   natural del hallazgo 1 para un hito futuro.
2. **El nuevo catch no tiene test** (`commands/monitor.js:65-67`): nada ejerce el `avisos.push`.
   Ademas depende de que `vista.avisos` exista - hoy `construirVista` siempre lo crea, pero un
   `vista` sin `avisos` perderia el aviso en silencio otra vez.
3. **El test de modo compact es el unico de los tres nuevos sin verificarContrato**
   (`monitor-render.test.js`): un desborde de ancho en la linea de historico de compact no se
   detectaria. Los de agents y angosto si lo llaman.
4. **renderAngosto inserta el historico antes de la linea "terminal muy angosta"**: con rows <= 5 el
   `slice(0, rows)` final puede cortar esa advertencia. Marginal.
5. **Atribucion inexacta de mi verificacion manual** en `spec.md` (Success criteria, 7mo bullet),
   `tasks.md` (Checkpoints, T107 final) e `impl_summary.md`: dicen que el reviewer verifico "sobre
   esta maquina real" / "el payload real de esta maquina". Lo que hice fue con un **fixture** en
   tmpdir via `--claude-home` (con el payload real replicado), no sobre `~/.claude`, y **no**
   verifique "Semanal Fable visible con su porcentaje vigente" - eso esta cubierto por el test de
   dedup de RF-02, no por una lectura mia del panel real. Conviene ajustar la redaccion antes del PR,
   o dejar que el firmoff del owner (que sigue pendiente) cubra ese bullet. Sin impacto tecnico, pero
   una spec no deberia acreditar a un verificador algo que no hizo.
6. **Higiene mia**: use dos worktrees temporales para medir (b). Los directorios estan borrados, pero
   `git worktree prune` no pudo eliminar sus metadatos en `.git/worktrees/` (`wt-pre`, `wt-preT105`)
   por permisos de OneDrive. `git worktree list` ya no los reporta y no afecta al arbol ni al diff;
   si molestan, se borran a mano.

## Pendientes que NO bloquean este veredicto

- Firmoff en vivo del owner (ultimo Success criterion) - por diseno, es humano.
- PR draft contra `main` con la plantilla completa (`tasks.md`, Cierre). No pude verificarlo: `gh` no
  esta instalado en este entorno.
- Espejo al Vault: sigue sin `.claude/vault.local.json` en esta maquina, asi que este segundo
  dictamen tampoco se pudo espejear ni mover la tarjeta del kanban. Queda registrado como
  `vault_skip` en `history.md`.
