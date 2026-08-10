# Spec: Monitor de tokens — extra congelado, dedup de filas e histórico

**Status**: draft
**Owner**: Ignacio A
**Stakeholders**: Ignacio A (único — dueño del harness)
**Hito**: SHS-H3
**Creado**: 2026-08-10
**Aprobado**: pending

---

## Reglas de escritura

- Esta spec describe el QUÉ y el POR QUÉ, no el CÓMO técnico. El CÓMO va en `plan.md`.
- **Origen**: esta spec transcribe al formato SDD un plan de investigación ya aprobado
  por el humano (`plan-inicial.md`, en esta misma carpeta), que verificó las causas raíz
  archivo:línea sobre el código real de `feature/SHS-H3-monitor-tokens`. No amplía ni
  reinterpreta ese alcance.
- **Por qué spec completo y no Lite**: aunque el trabajo cabe en ~7 tasks de 15-30 min,
  la causa raíz de los tres bugs fue la misma — `panel-presenter.js` y
  `usage-limits-reader.js` tenían **cero cobertura de test** y las verificaciones que
  existían eran "correr el panel y mirarlo". Una spec Lite no exige requisitos
  funcionales con criterio de aceptación individual; este documento sí, deliberadamente,
  para no repetir el patrón que dejó pasar estos bugs. **Ningún RF de esta spec se cierra
  con "verificación manual" como único criterio** — la verificación manual solo aparece
  como paso complementario final (confirmación humana sobre datos reales), nunca en
  lugar de un test automatizado.

---

## Context

### Business background

`souclaude monitor` (`SHS-H3`, spec hermana `SHS-H3-monitor-tokens`) es el panel que
muestra en vivo el consumo de tokens y los límites de plan de Claude Code. El dueño del
harness lo usa a diario para saber si está cerca de algún límite. El jueves 2026-08-06 el
gasto "Extra" (créditos pagos por fuera del plan) llegó a su tope mensual
($21.36 sobre $20.00) en otra máquina, y desde entonces el panel de **esta** máquina
muestra esa fila clavada arriba, en rojo, como si fuera una alarma activa y en curso —
todos los días, indefinidamente, hasta el reset mensual de la organización. El panel no
distingue "esto está pasando ahora" de "esto ya pasó y no va a cambiar hasta el mes que
viene", y esa es la señal que el usuario necesita para no perder tiempo revisándola cada
vez.

Investigando ese síntoma aparecieron dos problemas más, verificados contra el código real
(`plan-inicial.md`): una fila del panel (`Semanal Fable`) puede desaparecer sin aviso por
una colisión de deduplicación, y un fallo de red al refrescar los límites de plan es
100% silencioso — el panel sigue mostrando datos viejos sin decirlo.

### Why now

El panel de `SHS-H3-monitor-tokens` ya está en uso real y estos tres defectos afectan la
confianza en lo que muestra: una alarma permanente que no se puede silenciar entrena al
usuario a ignorar el rojo del panel (fatiga de alarma), una fila que desaparece sin aviso
rompe la premisa de que "lo que no se ve, no está pasando", y un dato viejo mostrado como
fresco es peor que no mostrar nada. Los tres se corrigen juntos porque comparten el mismo
archivo de origen (`panel-presenter.js`) y el mismo patrón de causa (lógica sin test).

---

## Goals

En orden de prioridad:

1. La fila del gasto "Extra" refleja fielmente lo que la API ya informa (`utilization`,
   `is_enabled`, `spend_limit_reached`) en vez de recalcular un porcentaje distinto, y
   deja de participar de la alarma del panel a partir de las 24 horas de haberse
   detectado alcanzada — bajando a una sección de **Histórico** al pie, sin desaparecer.
2. Ninguna fila del panel desaparece por una colisión accidental de deduplicación: dos
   límites de tipo/modelo distintos con el mismo porcentaje y el mismo instante de reset
   se muestran ambos.
3. Un fallo al refrescar los límites de plan por red deja de ser silencioso: el panel
   avisa explícitamente que está mostrando datos viejos y hace cuánto.
4. El gasto extra alcanzado queda registrado en disco (fecha de detección, monto, fecha
   de cierre en el reset) para no perder esa información en el próximo reset mensual —
   sin inventar ni estimar los tokens ya consumidos, que no son recuperables.

---

## Non-goals

Explícitamente **NO** se construirá (ver `plan-inicial.md`, "Fuera de alcance"):

- Histórico de las ventanas semanales o de 5 horas. Solo el gasto extra, que fue lo
  reportado.
- Cambios a los TTLs, al backoff o a la política de red del `usage-fetcher.js` existente
  (ya introducido en `SHS-H3-monitor-tokens`).
- Recuperar o estimar los tokens consumidos por los $20 de extra ya gastados: **es
  imposible** — se consumieron en otra máquina sin el monitor corriendo. No se estima ni
  se inventa ningún número; lo único rescatable es el snapshot en dólares que la API ya
  entregó ($21.36 / $20.00).
- Tocar `precios.js`, el árbol de sesiones, el router de modelos (`--emit-router`) o
  cualquier archivo del monitor no listado en `plan.md`.
- Un histórico visible de *todos* los periodos de gasto extra pasados dentro del panel.
  El archivo en disco puede acumular más de uno con el tiempo, pero la sección del panel
  solo muestra el periodo vigente cuando cruza el umbral de 24 horas (ver Journey 1 y
  RF-05).

(Los non-goals son tan importantes como los goals. Si alguien asume que esta spec agrega
un dashboard de gasto histórico completo, o que "arregla" el extra llamando a otra API,
el spec está incompleto sin esta lista.)

---

## User journeys

### Journey 1: El extra alcanzado deja de ser una alarma permanente

**Actor**: dueño del harness, revisando `souclaude monitor` en su día a día.
**Trigger**: el gasto extra llegó a su límite mensual hace más de 24 horas y no va a
cambiar hasta el reset de la organización.
**Precondiciones**: `~/.claude.json` (o el refresco de red) informa
`extra_usage.spend_limit_reached: true` desde hace más de 24 horas.

**Pasos**:
1. Abre `souclaude monitor`.
2. La fila del extra **no** aparece en el header como alarma (sin marco rojo, sin
   `LIMITE 107% Extra` en el título).
3. Al pie del panel aparece una sección **Histórico** con una línea atenuada, tipo
   `Extra ago-2026  $21.36/$20.00  alcanzado 06-08`.
4. El resto de los límites (5h, 7d, semanales) se siguen mostrando y ordenando con
   normalidad, sin verse afectados por el extra archivado.

**Resultado esperado**: el usuario sabe, de un vistazo, que ese gasto ya está cerrado
para este ciclo y no necesita revisarlo cada vez que abre el panel.
**Edge cases**: si el extra se alcanzó hace **menos** de 24 horas, sigue apareciendo como
alarma activa en el header (es información nueva y accionable). Cuando la organización
resetea el ciclo (`is_enabled` vuelve a `true` o `used_credits` cae), el periodo
archivado se sella con su fecha de cierre y el extra vuelve a la zona viva en $0.

### Journey 2: Ninguna fila desaparece por casualidad

**Actor**: el mismo usuario, revisando el detalle de límites semanales.
**Trigger**: dos límites distintos (`Semanal Fable` y el total semanal `seven_day`)
comparten el mismo porcentaje y el mismo instante de reset.
**Precondiciones**: la API devuelve ambos límites con `percent` y `resets_at`
coincidentes.

**Pasos**:
1. Abre el panel o corre `souclaude monitor --once`.
2. Ambas filas (`Semanal Fable` y `Ventana 7d`) aparecen, cada una con su propio modelo y
   tipo indicados.

**Resultado esperado**: el usuario nunca pierde información real por una coincidencia
numérica entre dos límites que miden cosas distintas.
**Edge cases**: dos entradas que son **literalmente el mismo límite** publicado dos veces
por la API (mismo tipo, mismo modelo, mismo porcentaje, mismo reset) siguen colapsando en
una sola fila — ese caso sí es una duplicación real, no una coincidencia.

### Journey 3: Un dato viejo nunca se muestra como si fuera fresco

**Actor**: el mismo usuario, en una máquina con problemas de red o un token vencido.
**Trigger**: el refresco de límites contra la API falla varias veces seguidas (401,
timeout, sin red).
**Precondiciones**: el `usage-fetcher.js` ya existente entra en backoff tras 3+ fallos
seguidos.

**Pasos**:
1. Abre el panel.
2. Entre los avisos del panel aparece una línea explícita, tipo `límites sin refrescar
   desde hace 42m (reintento en 12m)`.

**Resultado esperado**: el usuario entiende que lo que ve puede estar desactualizado, en
vez de asumir que el panel está al día porque no dice lo contrario.
**Edge cases**: si el fetcher está sano (sin fallos), el aviso no aparece — el panel no
debe generar ruido cuando todo funciona.

### Journey 4: El dato del gasto extra no se pierde en el próximo reset

**Actor**: el dueño del harness, semanas después, tratando de recordar cuándo y cuánto se
gastó de extra.
**Trigger**: el reset mensual de la organización ya ocurrió.
**Precondiciones**: el periodo de extra fue detectado y luego cerrado por el monitor.

**Pasos**:
1. Revisa `~/.claude/souclaude/usage-history.json`.
2. Encuentra el registro con la fecha en que se detectó el límite alcanzado, el monto
   ($21.36/$20.00) y la fecha en que se cerró.

**Resultado esperado**: el dato en dólares no se pierde, aunque los tokens que lo
generaron nunca fueron capturados (se gastaron en otra máquina, sin el monitor corriendo,
y esa parte es información perdida de forma permanente y aceptada).
**Edge cases**: archivo ausente o corrupto en el primer arranque → arranca vacío, nunca
rompe el panel.

---

## Success criteria

Métricas objetivamente medibles — **ninguna se cierra solo con "verificación manual"**:

- [ ] `npm test` pasa en verde incluyendo las suites nuevas/ampliadas
      (`test/monitor-presenter.test.js`, `test/monitor-domain.test.js` o el archivo
      dedicado a `gasto-extra.js`, `test/monitor-history.test.js`,
      `test/monitor-view.test.js`, `test/monitor-render.test.js`,
      `test/monitor-layers.test.js`) — cada bug corregido tiene un test que falla si el
      fix se revierte.
- [ ] Con un fixture del payload real del 2026-08-06
      (`extra_usage: { is_enabled: false, monthly_limit: 2000, used_credits: 2136,
      utilization: 100, spend_limit_reached: true }`), la fila del extra reporta
      **100%**, nunca 107% — cubierto por test, no por lectura visual del panel.
- [ ] Con un fixture donde `seven_day` y `weekly_scoped` (modelo `Fable`) comparten
      porcentaje e instante de reset, ambas filas están presentes en la salida — cubierto
      por test.
- [ ] La función pura que decide `vivo | historico` tiene un test con los dos bordes del
      umbral de 24 horas (23:59 → vivo, 24:01 → histórico) usando un `ahora` inyectado,
      sin depender del reloj real.
- [ ] `node bin/cli.mjs monitor --json` (sobre un fixture o `--claude-home` de prueba)
      incluye `historico: [{ usado: 21.36, limite: 20, ... }]` cuando el extra archivado
      corresponde al payload real — `JSON.parse` de la salida no falla y el campo existe.
- [ ] Un fetcher de límites en estado de backoff produce un aviso visible en
      `vista.avisos`; un fetcher sano no produce ninguno — cubierto por test de
      integración de `snapshot-source.js`.
- [ ] **Verificación manual final** (complementaria, posterior a que todo lo anterior
      pase): sobre esta máquina real, `node bin/cli.mjs monitor --once --no-refresh`
      muestra el extra al pie como histórico al 100%, sin marco rojo ni `LIMITE 107%` en
      el título, con "Semanal Fable" visible con su porcentaje vigente.
- [ ] Owner confirma en vivo que el panel deja de mostrar la alarma permanente del extra.

---

## Requisitos funcionales

Cada requisito lleva su criterio de aceptación verificable por test automatizado. La
verificación manual, cuando aparece, es un paso adicional — nunca el único.

- **RF-01 — El extra respeta los flags y el porcentaje que la API ya calculó.**
  `usage-limits-reader.js` (`toGastoExtra`) deja de ser la única fuente del porcentaje: en
  vez de solo recalcularlo (`usadoUsd/limiteUsd*100`), expone también `utilizacion`
  (`extra_usage.utilization`) y `motivoDeshabilitado` (`extra_usage.disabled_reason`),
  sin dejar de exponer `usadoUsd`/`limiteUsd` (que se siguen mostrando como
  `$21.36/$20.00`). `panel-presenter.js` usa `utilizacion` para la fila del extra, no el
  recálculo local.
  *Aceptación*: `test/monitor-presenter.test.js`, caso "con el payload real de hoy, la
  fila reporta 100%, no 107%".

- **RF-02 — El dedup de filas de límites distingue tipo y modelo, no solo porcentaje y
  reset.**
  La clave de deduplicación de `panel-presenter.js` incluye el tipo (`kind`) y el modelo
  del límite, no únicamente `${porcentaje}|${reseteaEn}`.
  *Aceptación*: `test/monitor-presenter.test.js`, dos casos: `seven_day` y
  `weekly_scoped/Fable` con idéntico porcentaje e idéntico `resets_at` → ambas filas
  presentes; `weekly_all` duplicado exacto de `seven_day` (mismo tipo, modelo, porcentaje
  y reset) → sigue colapsando a una sola fila.

- **RF-03 — Regla de dominio: un gasto extra alcanzado pasa a histórico a las 24 horas.**
  Función pura (sin I/O, sin `Date.now()` implícito — recibe `ahora` como parámetro) que,
  dado un gasto extra `alcanzado === true` y la fecha en que se detectó por primera vez,
  decide `vivo | historico`. Umbral: 24 horas desde la detección.
  *Aceptación*: test de la regla pura con fechas límite (23:59h → vivo, 24:01h →
  histórico; `alcanzado: false` → siempre vivo). Cubierto también por el test de
  enforcement de capas (la función vive en `domain/`, no en un adaptador).

- **RF-04 — Persistencia del gasto extra alcanzado.**
  Nuevo adaptador que mantiene un registro en disco: al detectar `alcanzado === true` por
  primera vez, registra `{detectadoEn, usado, limite, moneda}`; al detectar el reset
  (`habilitado` vuelve a `true`, o `usadoUsd` cae por debajo del valor registrado), sella
  el periodo con `cerradoEn` y lo archiva. Lectura tolerante a archivo ausente o
  corrupto (arranca vacío, nunca rompe el panel). Un seed inicial con la fecha conocida
  del 2026-08-06 solo se aplica si el humano lo pide explícitamente (flag/entrada); sin
  eso, la fecha de detección es siempre la primera observación real. No se inventan
  fechas ni montos.
  *Aceptación*: test con sistema de archivos temporal cubriendo detección, sellado por
  reset, y archivo corrupto/ausente.

- **RF-05 — Sección "Histórico" en el panel y en `--json`.**
  El panel separa las filas de límites vigentes de las históricas usando la regla de
  RF-03 sobre el registro de RF-04. Las filas históricas se muestran al pie, atenuadas,
  y no participan del orden por severidad ni del título de alarma del header. La salida
  `--json` incluye el campo `historico` con los mismos datos.
  *Aceptación*: test de separación de filas vivas/históricas; test de snapshot del
  layout confirmando que una fila histórica no dispara el marco rojo ni el texto `LIMITE
  N%` del título; test sobre la salida JSON confirmando `historico: [{usado: 21.36,
  limite: 20, ...}]` con el fixture del payé real.

- **RF-06 — Aviso cuando los datos de límites de plan están desactualizados.**
  El snapshot del panel consulta también el estado del refrescador de límites (fallos
  seguidos, backoff activo) y, si corresponde, agrega un aviso visible del tipo `límites
  sin refrescar desde hace Xm (reintento en Ym)` al mismo canal de avisos que ya existe.
  *Aceptación*: test de integración con un fetcher en backoff (el aviso aparece) y uno
  sano (no aparece).

- **RF-07 — Documentación de la cadencia real de actualización.**
  El `README.md` explica bajo qué condiciones el monitor no refresca los límites por red
  (además de `--no-refresh`, ya documentado: modo CI y `--claude-home`), y documenta la
  nueva sección Histórico y el archivo de persistencia.
  *Aceptación*: revisión editorial — es el único RF sin test automatizado posible, por
  ser texto, no comportamiento; no reemplaza ningún criterio de los RF-01 a RF-06.

---

## Constraints and assumptions

### Constraints (restricciones)

- No se agregan dependencias nuevas: todo con Node core, siguiendo el mismo patrón de
  `usage-fetcher.js` (escritura directa sin temp+rename, por el `EPERM` conocido bajo
  sincronización de OneDrive).
- La regla de negocio del umbral de 24 horas vive en el dominio (`domain/`), nunca en un
  adaptador — enforcement automático ya existente (`test/monitor-layers.test.js`).
- Debe seguir funcionando en Windows y Linux sin dependencias nativas, igual que el resto
  del monitor.

### Assumptions (supuestos explícitos)

- Asumimos que solo puede haber **un** periodo de gasto extra abierto a la vez (no hay
  forma de que la API reporte dos ciclos de extra simultáneos); el registro persistido
  modela un único `abierto` más una lista de archivados.
- Asumimos que los tokens consumidos durante el periodo ya alcanzado ($21.36/$20.00) no
  son recuperables ni estimables — se consumieron en otra máquina sin el monitor
  corriendo. Este dato queda perdido de forma permanente y aceptada; no se intenta
  reconstruirlo.
- Asumimos que "reset" se detecta únicamente por los campos que la propia API ya expone
  (`is_enabled`, `used_credits`), sin inferencias adicionales.

---

## Fuera de alcance

(Duplicado deliberado de la sección Non-goals, para quien lea solo esta parte del
documento):

- Histórico de ventanas semanales o de 5 horas.
- Cambios a TTL, backoff o política de red del fetcher existente.
- Recuperación o estimación de tokens del gasto extra ya perdido.
- Cualquier archivo del monitor no listado en `plan.md`.

---

## Open questions

Ninguna pendiente: `plan-inicial.md` (fuente de esta spec) ya resolvió las decisiones de
causa raíz, alcance y verificación. Si aparece una decisión de diseño no cubierta durante
la implementación (por ejemplo, cómo representar más de un periodo archivado si algún día
hiciera falta mostrarlo en el panel), se documenta como ADR (`/adr-new`) antes de
continuar.

---

## Checklist antes de avanzar a Plan

- [x] ¿Un stakeholder no-técnico lee esto y entiende qué se construirá? (único
      stakeholder es técnico — el dueño del harness; igual la spec evita CÓMO técnico)
- [x] ¿No hay decisiones técnicas prematuras (no se menciona tech stack)? Sí — el mapa de
      archivos, la arquitectura y el modelo de datos van en `plan.md`.
- [x] ¿Open questions asignadas con dueño y deadline? No hay pendientes.
- [x] ¿Success criteria son medibles objetivamente? Sí — 8 criterios, todos con test
      automatizado salvo el paso final de confirmación humana, que es explícitamente
      complementario.
- [x] ¿Non-goals explícitos cubriendo asunciones comunes? Sí — en particular que esto no
      recupera ni estima los tokens del gasto extra ya perdido, y que el panel no muestra
      un histórico completo de todos los periodos pasados.
- [x] ¿Stakeholder firmó off o dio feedback positivo? Pendiente — este spec nace del plan
      de investigación ya aprobado por el owner (`plan-inicial.md`); el firmoff final es
      al cierre del hito.
