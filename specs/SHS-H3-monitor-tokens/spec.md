# Spec: Monitor de tokens en terminal (`souclaude monitor`)

**Status**: draft
**Owner**: Ignacio A
**Stakeholders**: Ignacio A (único — dueño del harness)
**Hito**: SHS-H3
**Creado**: 2026-08-04
**Aprobado**: pending

---

## Reglas de escritura

- Esta spec describe el QUÉ y el POR QUÉ, no el CÓMO técnico. El CÓMO va en `plan.md`.
- Cambio de infraestructura interna del harness, sin superficie de negocio. Se usa el
  spec completo (no SDD Lite) porque el alcance —27 tareas, ~20 archivos nuevos, un
  layering `domain/application/adapters` propio y un renderer TTY con reglas de
  anti-parpadeo— supera con holgura las 4-8 horas que delimitan la Lite; a diferencia de
  `SHS-H2`, aquí sí hay decisiones de arquitectura, modelo de datos y superficie de
  comando lo bastante grandes como para necesitar journeys y criterios de aceptación
  explícitos por requisito.

---

## Context

### Business background

La metodología CCEM depende de telemetría de consumo de tokens para dos cosas: que
`/rock-close` pueda reportar cuánto costó un hito, y que la skill `ccem-model-router`
pueda decidir cuándo escalar de Sonnet a Opus con datos reales en vez de intuición. Hoy
esa telemetría **no existe**: `ccem-model-router` define un log
`progress/model-router.jsonl` que el `orchestrator` debería escribir a mano, estimando
tokens por tamaño de artefactos (~4 caracteres/token) y marcando `medicion: "estimado"`.
Ese archivo ni siquiera existe en el repo, y `/rock-close` pide reportar el porcentaje de
líneas `"medido"` — que hoy es 0 %.

Mientras tanto, la máquina donde corre Claude Code ya tiene el dato real y nadie lo lee:
cada respuesta de cada modelo queda registrada en `~/.claude/projects/**/*.jsonl` con su
`message.usage` completo (tokens de entrada, salida y cache), cada subagente escribe su
propio archivo con `attributionAgent` (el tipo: `Explore`, `implementer`, `reviewer`…), y
`~/.claude.json` guarda los porcentajes de límite de plan ya calculados por el propio
Claude Code, sin necesidad de llamar a ninguna API de facturación.

### Why now

`SHS-H2` dejó el harness completo (comandos de rocas cargando, manifest auditado,
`npm test` en verde). El siguiente hueco visible es que el propio proceso CCEM no puede
medirse a sí mismo: no hay forma de ver, de un vistazo, cuánto se está gastando ahora
mismo entre todas las sesiones y subagentes de todas las máquinas-proyecto, ni de cerrar
una roca con datos medidos en vez de estimados. El dato ya está en disco; construir el
lector es la parte que falta.

---

## Goals

En orden de prioridad:

1. Un panel en terminal (`souclaude monitor`) que muestre, en vivo, límites de plan,
   agentes corriendo ahora mismo (con su tipo), consumo de las últimas 24 h, desglose por
   modelo, sesiones y proyectos — de todas las máquinas-proyecto que comparten el mismo
   `~/.claude`.
2. Que el comando funcione igual de bien sin TTY (CI, pipes) con salidas `--compact` y
   `--json`, para que se pueda usar tanto en un hook `SessionStart` como desde un script.
3. Un puente (`--emit-router`) que convierta la telemetría del router de `"estimado"` a
   `"medido"`, cerrando el hueco que hoy deja `/rock-close` en 0 %.
4. Cero mentiras: todo dato mostrado se distingue explícitamente entre medido y estimado,
   y ningún error de lectura tumba el panel ni se esconde en silencio.

---

## Non-goals

Explícitamente **NO** se construirá:

- Un cliente de la API de facturación de Anthropic. Todo el dato sale de archivos locales
  ya presentes en `~/.claude`; no hay llamadas de red.
- Persistencia de histórico propio. El monitor lee el estado actual de los jsonl en cada
  tick; no mantiene su propia base de datos ni agrega una fuente de verdad nueva.
- Cambios al `templates/harness.manifest.json` ni a la superficie distribuida a proyectos
  destino. El monitor es código del CLI (`souclaude`), no un archivo que `init`/`upgrade`
  instalen en otro repo.
- Un dashboard web ni ninguna superficie fuera de la terminal.
- Refactor de `src/core/` ni de ningún comando existente más allá del wiring puntual en
  `src/cli.js` (registrar el comando, sus flags y el bloque de ayuda).

(Los non-goals son tan importantes como los goals. Si un stakeholder asume que este
comando llama a una API de Anthropic para saber el gasto, el spec está incompleto sin
esta lista.)

---

## User journeys

### Journey 1: Ver de un vistazo si me estoy quedando sin cupo

**Actor**: desarrollador con Claude Code corriendo en varias sesiones/proyectos a la vez.
**Trigger**: sospecha que está cerca del límite de 5 h u Opus semanal, quiere confirmarlo
sin salir de la terminal.
**Precondiciones**: `~/.claude.json` existe con `cachedUsageUtilization` poblado.

**Pasos**:
1. Ejecuta `souclaude monitor`.
2. El panel abre en pantalla alterna, header con las barras de límite ordenadas por
   severidad descendente (el peor caso siempre arriba).
3. Si algún límite pasa 85 %, el borde superior se pinta rojo y el título muta a
   `souclaude monitor  LIMITE 91% Opus`.
4. Sale con `q` o `Ctrl+C`; la terminal vuelve a su estado normal (cursor visible, echo
   restaurado, scrollback intacto).

**Resultado esperado**: en menos de 1 segundo de lectura, sabe si está cerca de algún
límite y cuándo resetea.
**Edge cases**: `~/.claude.json` no existe o pesa más de 32 MB → el bloque de límites se
omite con un aviso visible, el resto del panel sigue funcionando.

### Journey 2: Ver qué está corriendo ahora mismo durante un `/orchestrate`

**Actor**: el mismo desarrollador, en medio de una corrida de `orchestrator` con varios
subagentes en paralelo.
**Trigger**: quiere confirmar que los subagentes correctos están corriendo con el modelo
correcto, y verlos terminar.
**Precondiciones**: hay al menos una sesión con subagentes activos.

**Pasos**:
1. Ejecuta `souclaude monitor --agents` (o deja el panel completo abierto).
2. La sección `AHORA` muestra cada agente vivo: tipo (`Explore`, `implementer`,
   `reviewer`…), proyecto, modelo, tokens, duración, herramientas usadas, sesión.
3. Al terminar un subagente, pasa a `en_duda` y luego desaparece de `AHORA` (o queda
   marcado `(fin hace Ns)` un rato corto).

**Resultado esperado**: puede correlacionar cada fila con el subagente real que lanzó,
sin adivinar por proceso de PID.
**Edge cases**: un agente cuyo PID murió sin dejar `toolUseResult` de cierre queda en
`en_duda`, nunca se pinta como `corriendo` sin evidencia.

### Journey 3: Cerrar una roca con telemetría medida, no estimada

**Actor**: `orchestrator`, al cierre de un hito, o el desarrollador a mano.
**Trigger**: `/rock-close` pide el porcentaje de líneas `"medido"` en
`progress/model-router.jsonl`.
**Precondiciones**: el hito y el task tienen ID conocidos; el agente ya terminó.

**Pasos**:
1. Ejecuta `souclaude monitor --emit-router --hito SHS-H3 --task SHS-H3-T004 --agente
   implementer --resultado approved`.
2. El comando agrega la línea correspondiente a `progress/model-router.jsonl` con
   `medicion: "medido"`, el modelo dominante por tokens, el effort más frecuente, y el
   costo (o `null` si algún modelo del tramo no tenía precio).
3. Repetir el mismo comando para la misma tupla `(task, agentId)` sin `--force` es
   rechazado (idempotencia).

**Resultado esperado**: `progress/model-router.jsonl` gana una línea medida real, sin
intervención manual de estimar tokens.
**Edge cases**: la tupla ya existe → error explícito, no se duplica ni se sobrescribe sin
`--force`.

---

## Success criteria

Métricas objetivamente medibles:

- [ ] `node bin/cli.mjs monitor --once` corre sobre esta máquina y muestra datos reales
      de las carpetas de proyecto existentes en `~/.claude/projects/`, sin lanzar
      excepción.
- [ ] `node bin/cli.mjs monitor --once --json --since all` produce un JSON válido
      (`JSON.parse` no falla) cuyo total de llamadas coincide, contra un jsonl chico, con
      un conteo manual de `message.id` únicos.
- [ ] Redimensionar la terminal de 120 a 70 columnas durante `monitor` en vivo no rompe la
      alineación ni dispara una excepción; `Ctrl+C` y `q` dejan la terminal limpia
      (cursor visible, echo restaurado, scrollback intacto).
- [ ] `SOUCLAUDE_ASCII=1` y `NO_COLOR=1` producen un panel legible sin Unicode ni ANSI.
- [ ] `node bin/cli.mjs monitor --once | cat` (sin TTY) cae a modo `compact` sin
      secuencias ANSI y con el exit code correspondiente al umbral de límites.
- [ ] `souclaude monitor --emit-router --hito SHS-H3 --task SHS-H3-T004 --agente
      implementer --resultado approved` agrega una línea válida con `medicion: "medido"`
      a `progress/model-router.jsonl`; repetir el mismo comando sin `--force` es
      rechazado.
- [ ] `npm test` pasa en verde incluyendo la suite nueva de `test/monitor-*.test.js`, en
      Windows y Linux (CI corre ambos), y ningún test de esa suite lee el `~/.claude`
      real.
- [ ] `node bin/cli.mjs verify --strict` y `node bin/cli.mjs upgrade --dry-run --yes`
      siguen pasando sin cambios (el manifest no se toca).
- [ ] Owner (único stakeholder) confirma en vivo que el panel es legible y útil durante
      una corrida real de `/orchestrate`.

---

## Requisitos funcionales

Cada requisito lleva su criterio de aceptación verificable — por test automatizado o por
paso de verificación manual (ver `## Verificación` al final).

- **RF-01 — Panel en vivo.** Sin `--once`/`--json`/`--compact` y con TTY, `monitor`
  entra en pantalla alterna y repinta el panel completo (límites, `AHORA`, `CONSUMO`,
  `DESGLOSE`, `SESIONES`, `PROYECTOS`) cada `--interval` (default 2000 ms, mínimo 250 ms),
  con cronómetros que refrescan cada 1 s.
  *Aceptación*: `test/monitor-render.test.js` verifica que ninguna línea supera el ancho
  de columnas dado y que no hay `\x1b` cuando `color:false`; verificación manual §3 del
  plan.

- **RF-02 — Agentes corriendo con su tipo.** La sección `AHORA` lista cada agente vivo
  con `tipo` (`Explore`, `implementer`, `reviewer`, `principal`…), proyecto, modelo,
  tokens, duración y herramientas usadas, usando el estado de `domain/actividad.js`
  (`corriendo` | `en_duda` | `terminado`).
  *Aceptación*: `test/monitor-domain.test.js` cubre los tres estados con `pid` vivo/muerto
  determinista (`process.pid` vs `999999`); `test/monitor-view.test.js` verifica que el
  árbol agregado expone `tipoAgente` por agente.

- **RF-03 — Sesiones y proyectos.** El panel agrupa `proyecto → sesión → agente →
  modelo`, con sesiones vivas siempre antes que muertas y proyectos que no entran
  agregados en una fila real `otros (N)` (los porcentajes suman 100).
  *Aceptación*: `test/monitor-view.test.js` sobre fixtures con más sesiones/proyectos que
  `--top`.

- **RF-04 — Límites de plan.** El header muestra `cincoHoras`, `sieteDias`, límites por
  grupo y gasto extra, leídos de `~/.claude.json` (`cachedUsageUtilization`), ordenados
  por severidad descendente, con color + símbolo redundante (`!`, `!!`) por rango.
  *Aceptación*: `test/monitor-domain.test.js` (mapeo de porcentaje a severidad y símbolo);
  verificación manual §1 del plan sobre esta máquina.

- **RF-05 — Desglose por modelo.** Sección `DESGLOSE` con tokens por tipo (`input`,
  `output`, `cache_creation`, `cache_read`) y por alias de modelo (`opus`, `sonnet`,
  `fable`, `haiku`), con costo estimado y `sinPrecio` para alias desconocidos.
  *Aceptación*: `test/monitor-domain.test.js`, caso "alias desconocido: costoUsd no sube,
  sinPrecio === 1".

- **RF-06 — Serie de 24 h.** Sparkline de tokens/hora con 24 buckets horarios y el pico
  anotado.
  *Aceptación*: `test/monitor-domain.test.js` para el bucketing de `domain/ventanas.js`;
  `test/monitor-render.test.js` para el sparkline en texto plano.

- **RF-07 — Modo `--compact`.** Sin TTY, con `CI=true`, o con `--compact` explícito:
  header + una línea por sesión viva + total, imprime y sale (no entra en loop).
  *Aceptación*: `test/monitor-cmd.test.js`.

- **RF-08 — Modo `--agents`.** Header + sección `AHORA` refrescada a 1 s, pensado para
  correr en paralelo a un `/orchestrate`.
  *Aceptación*: `test/monitor-cmd.test.js` (flag reconocida, modo correcto seleccionado).

- **RF-09 — Modo `--json`.** `JSON.stringify(vista)` sin transformación; con
  `--interval`, emite NDJSON (una línea JSON por tick).
  *Aceptación*: `test/monitor-cmd.test.js`, `JSON.parse` sobre la salida no falla y el
  shape coincide con `VistaMonitor`.

- **RF-10 — Códigos de salida.** `0` si todos los límites están por debajo de 85 %, `1`
  si alguno está entre 85-94 %, `2` si alguno llega a 95 % o más — siguiendo la
  convención de `src/commands/status.js`.
  *Aceptación*: `test/monitor-cmd.test.js` con fixtures de `.claude.json` en cada rango.

- **RF-11 — `--emit-router`.** Con `--hito` obligatorio (y `--task --agente --resultado`
  según corresponda), agrega una línea a `progress/model-router.jsonl` con
  `medicion: "medido"`, modelo y effort dominantes por tokens de ese agente, y
  `fuente: {sessionId, agentId, llamadas}`. Rechaza la tupla repetida `(task,
  fuente.agentId)` salvo `--force`.
  *Aceptación*: `test/monitor-cmd.test.js` (o un test dedicado del writer) cubre
  escritura, idempotencia y `--force`.

- **RF-12 — Filtros y orden.** `--since`, `--project`, `--session`, `--sort`, `--top`
  filtran y ordenan la vista sin alterar los totales del header/pie (que siempre se
  calculan sobre el conjunto completo, nunca sobre las filas visibles).
  *Aceptación*: `test/monitor-view.test.js`.

- **RF-13 — `--claude-home` / `SOUCLAUDE_CLAUDE_HOME`.** Permite apuntar a un
  `~/.claude` alternativo, tanto para tests como para inspeccionar otra máquina.
  *Aceptación*: es el mecanismo que usa toda la suite de tests (regla dura: ningún test
  lee el `~/.claude` real); `test/monitor-cmd.test.js` verifica el override explícito.

---

## Requisitos no funcionales

- **RNF-01 — Cero dependencias nuevas.** Todo sale de Node core + `picocolors` (ya
  presente en el repo). No se pasa por `ccem-research` porque no se adopta nada nuevo.
  *Aceptación*: `package.json` no cambia sus `dependencies`.

- **RNF-02 — Ningún test lee el `~/.claude` real.** Toda la suite construye un
  `~/.claude` falso en tmpdir vía `--claude-home`/`SOUCLAUDE_CLAUDE_HOME`.
  *Aceptación*: revisión de `test/helpers-monitor.js` y de cada test nuevo — ninguno
  referencia `os.homedir()` sin pasar por el override.

- **RNF-03 — Resiliencia a archivos ilegibles.** Un jsonl corrupto, truncado a mitad de
  escritura, o con permisos denegados (`EBUSY`/`EPERM`/`ENOENT`) no tumba el panel: se
  captura, se agrega a `vista.avisos`, y el resto de la vista sigue siendo válida.
  *Aceptación*: `test/monitor-tailer.test.js`, caso "archivo ilegible aparece en
  `vista.avisos` y la vista sigue siendo válida".

- **RNF-04 — Rendimiento sobre el volumen real.** Con ~120 archivos de hasta 3.4 MB, el
  cold start se mantiene en decenas de milisegundos gracias a la poda por `mtime` y al
  prefiltro por substring antes de `JSON.parse`; cada tick posterior solo lee los bytes
  nuevos (offset incremental).
  *Aceptación*: verificación manual §2 del plan sobre los datos reales de esta máquina
  (`node bin/cli.mjs monitor --once`, tiempo de respuesta perceptualmente instantáneo).

---

## Constraints and assumptions

### Constraints (restricciones)

- Debe funcionar en Windows y Linux (CI corre ambos) sin dependencias nativas.
- No puede depender de que `~/.claude` esté disponible por red; todo es lectura local de
  archivos.
- No puede modificar `templates/harness.manifest.json`: el monitor es código del CLI, no
  un artefacto distribuido a proyectos destino.
- Debe respetar `NO_COLOR`/`FORCE_COLOR`/`isTTY` (ya cubierto por `picocolors`) y degradar
  a ASCII cuando el terminal no soporta Unicode o se pide `--ascii`.

### Assumptions (supuestos explícitos)

- Asumimos que `message.usage` de cada línea `assistant` no cuenta doble entre `entrada`
  y los campos de cache (son campos disjuntos). Es un supuesto documentado, no verificado
  contra la facturación real — ningún test automatizado lo puede probar por sí solo.
- Asumimos los multiplicadores estándar de prompt caching (`cacheLectura: 0.10`,
  `cacheCreacion5m: 1.25`, `cacheCreacion1h: 2.00`) porque `additionalModelCostsCache`
  está vacío en esta máquina; no hay tabla de precios local que los confirme.
  **Costo en USD es siempre estimado**, nunca medido — se declara así en el pie del panel.
  Tokens sí son medidos.
- Asumimos que el slug de carpeta de proyecto no es reversible a ruta (espacios y acentos
  colapsan a `-`), y que la ruta real solo se puede recuperar del campo `cwd` dentro del
  jsonl o de `sessions/<pid>.json`.

---

## Fuera de alcance

- No es un cliente de la API de facturación de Anthropic.
- No persiste histórico propio: no hay base de datos ni archivo de estado adicional a
  `progress/model-router.jsonl` (que ya existía como concepto, sin implementación).
- No toca `templates/harness.manifest.json` ni se distribuye a los proyectos destino que
  instalan el harness.
- No refactoriza `src/core/` (queda plano, tal como está hoy).

---

## Open questions

Ninguna pendiente: el plan aprobado (fuente de esta spec) ya resolvió las decisiones de
arquitectura, fuentes de datos y modelo de datos. Si aparece una decisión no cubierta
durante la implementación, se documenta como ADR (`/adr-new`) y se anota aquí antes de
continuar.

---

## Riesgos y supuestos (honestidad medido vs. estimado)

Este hito es, en el fondo, un ejercicio de honestidad sobre qué se puede afirmar con
certeza y qué no. Tres trampas concretas, más los dos supuestos de costo:

- **Doble conteo.** Varias líneas `assistant` del mismo turno comparten `message.id` /
  `requestId` y repiten el mismo objeto `usage`. Sin deduplicar por `message.id`, el
  consumo se infla 2-3× de forma silenciosa — los números "parecen" grandes y nadie lo
  nota. Mitigación: `domain/consumo.js` deduplica por `message.id` antes de sumar; test
  dedicado (`RF-*`, ver `## Verificación`).
- **Slug de proyecto no reversible.** El nombre de carpeta bajo
  `~/.claude/projects/<slug>/` colapsa espacios y acentos a `-`; no se puede reconstruir
  la ruta real desde el slug. Mitigación: la ruta sale siempre del campo `cwd` dentro del
  jsonl, o de `sessions/<pid>.json` para sesiones vivas que aún no escribieron nada.
- **`isApiErrorMessage: true`.** Una línea así no trae `usage` y debe descartarse sin
  romper el parseo del resto del archivo.
- **Multiplicadores de cache supuestos**, no verificados contra una tabla de precios
  local (`additionalModelCostsCache` vacío en esta máquina).
- **`input_tokens` se asume disjunto de los tokens cacheados.** Si la API algún día
  cambiara ese contrato, el monitor subcontaría el input sin que ningún test lo detecte;
  es el motivo por el que el pie del panel declara explícitamente
  `tokens medidos · costo estimado con tabla local · estado de agentes heuristico`.

**Regla de honestidad**: tokens son **medidos** (vienen de `message.usage` real). Costo en
USD es **siempre estimado** (tabla local + multiplicadores supuestos). Estado de actividad
de un agente (`corriendo`/`en_duda`/`terminado`) es **heurístico**, nunca una certeza.
Ningún dato estimado se presenta con la misma confianza visual que uno medido.

---

## Checklist antes de avanzar a Plan

- [x] ¿Un stakeholder no-técnico lee esto y entiende qué se construirá? (único
      stakeholder es técnico — el dueño del harness; igual la spec evita CÓMO técnico)
- [x] ¿No hay decisiones técnicas prematuras (no se menciona tech stack)? Sí — el mapa de
      archivos, el layering y el modelo de datos van en `plan.md`.
- [x] ¿Open questions asignadas con dueño y deadline? No hay pendientes.
- [x] ¿Success criteria son medibles objetivamente? Sí, 9 criterios verificables.
- [x] ¿Non-goals explícitos cubriendo asunciones comunes? Sí — en particular que esto NO
      llama a una API de facturación.
- [x] ¿Stakeholder firmó off o dio feedback positivo? Pendiente — este spec nace del plan
      ya aprobado por el owner; el firmoff final es al cierre del hito.
