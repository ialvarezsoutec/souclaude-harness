# Plan: Monitor de tokens en terminal (`souclaude monitor`)

**Spec**: [spec.md](./spec.md)
**Status**: draft
**Owner**: Ignacio A
**Creado**: 2026-08-04
**Aprobado**: pending

---

## Reglas de escritura

- Aquí va el CÓMO técnico: arquitectura, modelo de datos, estrategia de lectura,
  renderizado, riesgos y alineación con la constitución. La spec (`spec.md`) es input —
  no se duplican goals ni journeys.

---

## Stack decisions

### Runtime y dependencias

- Tecnología elegida: Node.js core (`node:fs`, `node:path`, `node:process`) +
  `picocolors` (ya es dependencia del repo). ANSI se escribe a mano.
- Rationale: el panel es I/O de archivos locales + un renderer de texto — no hay
  justificación para sumar una librería de TUI (`blessed`, `ink`) cuando el volumen de
  UI es un solo panel con secciones fijas. Sumar una dependencia nueva exigiría pasar por
  `ccem-research` antes de adoptarla (regla de la constitución, sección "Restricciones de
  herramientas"); este plan la evita por diseño (P9).
- Componentes existentes reutilizados: `src/core/fsx.js` (I/O tolerante a errores, ya
  documenta el caso EPERM bajo OneDrive), `src/ui.js` (solo para errores fatales antes de
  entrar al alternate buffer — es log secuencial, no sirve para full-screen),
  `test/helpers.js` (patrón `mkRepo()`, incluido el tmpdir con espacio en el nombre a
  propósito, para no perder cobertura de ese caso real).
- Componentes nuevos necesarios: todo `src/monitor/**` (ver mapa de archivos) y
  `src/commands/monitor.js`.

---

## Architecture

```
                    ┌────────────────────────┐
                    │  src/commands/monitor.js│  adapter inbound
                    │  (flags, cwd) -> exitCode│
                    └───────────┬─────────────┘
                                │
                 ┌──────────────┼──────────────┐
                 ▼              ▼              ▼
        ┌────────────┐ ┌───────────────┐ ┌─────────────┐
        │ tty-renderer│ │ plain-renderer│ │router-log-  │
        │ (panel vivo)│ │ (compact/json)│ │writer(--emit)│
        └──────┬──────┘ └───────┬───────┘ └──────┬──────┘
               │                │                │
               └────────┬───────┴────────────────┘
                         ▼
              ┌─────────────────────┐
              │ application/         │   caso de uso
              │ build-view.js         │   (usa ports.js)
              └──────────┬───────────┘
                         ▼
              ┌─────────────────────┐
              │ adapters/            │   snapshot-source.js
              │ claude-home · jsonl-  │   compone los 3 lectores,
              │ tailer · session-    │   mantiene estado incremental
              │ reader · usage-limits │
              └──────────┬───────────┘
                         ▼
              ┌─────────────────────┐
              │ domain/               │   eventos, consumo, ventanas,
              │ (puro, sin I/O)       │   actividad, arbol, formato, precios
              └─────────────────────┘
```

Descripción del flujo:
1. `commands/monitor.js` parsea flags, resuelve `~/.claude` (o el override), y elige modo
   (`live` | `compact` | `agents` | `json`) según TTY y flags.
2. El modo invoca `application/build-view.js` con un `SnapshotSource` (adapter) y un
   `Clock` (puerto, inyectado — nunca `Date.now()` directo en el dominio).
3. `build-view.js` orquesta: pide el snapshot crudo al adapter, llama a
   `domain/arbol.js` para construir la `VistaMonitor` agregada.
4. El renderer correspondiente (`tty-renderer.js` o `plain-renderer.js`) consume
   `VistaMonitor` — nunca el snapshot crudo — y la pinta o la serializa.
5. `--emit-router` reusa la misma `VistaMonitor` ya agregada para escribir la línea en
   `progress/model-router.jsonl`.

**Regla de dependencias del monitor** (aplicación local de P2):
`adapters → application → domain`, siempre hacia adentro. `commands/monitor.js` es en sí
mismo un adapter inbound y puede importar de las tres capas de `src/monitor/`.

---

## Modelo de datos

```js
// EventoDeUso — unidad atómica, la salida de domain/eventos.js
{ id: 'msg_01ABC', requestId, ts: 1754300000000, sessionId, agentId: null,
  tipoAgente: 'principal'|'Explore'|'implementer'|…, cwd, rama,
  modeloId: 'claude-opus-5[1m]', alias: 'opus'|'sonnet'|'fable'|'haiku'|'desconocido',
  effort, esSidechain,
  uso: { entrada, salida, cacheCreacion, cacheLectura, cache1h, cache5m } }

// Consumo — acumulador monoide (vacio / sumar / fusionar), producido por domain/consumo.js
{ llamadas, entrada, salida, cacheCreacion, cacheLectura, cache1h, cache5m,
  costoUsd, sinPrecio, primerTs, ultimoTs }

// VistaMonitor — lo único que ve cualquier renderer. 100% serializable a JSON.
{ generadoEn, ventana: {desde, hasta, etiqueta},
  limites: { cincoHoras:{porcentaje,reseteaEn}, sieteDias:{…},
             porGrupo:[{tipo,grupo,porcentaje,severidad,reseteaEn,modelo,activo}],
             gastoExtra:{habilitado,usadoUsd,limiteUsd,porcentaje,alcanzado} } | null,
  totales: Consumo,
  ritmo: { tokensPorMin, ventanaMin },
  serieHoraria: [{ hora, tokens }],          // 24 buckets, para el sparkline
  proyectos: [{ slug, ruta, nombre, consumo,
    sesiones: [{ sessionId, titulo, rama, inicio, ultimoTs, estado, pid, consumo,
      porModelo: [{ alias, consumo }],       // array, no Map: serializable sin transformar
      agentes: [{ agentId, tipo, modeloId, alias, effort, inicio, ultimoTs,
                  duracionMs, estado, consumo, cierre }] }] }],
  vivos: [{ pid, sessionId, cwd, startedAt, kind, entrypoint, name, procesoVivo }],
  avisos: [{ archivo, motivo }] }            // errores de lectura VISIBLES, nunca silenciados
```

**Determinismo temporal**: el dominio nunca llama `Date.now()`. `construirVista(snapshot,
{ ahora, ventana, precios })` recibe `ahora` como parámetro. Sin esto la mitad de los
tests serían flaky (dependen del reloj real) y la otra mitad, tautologías (comparan contra
el mismo `Date.now()` que usó el código bajo test).

---

## Fuentes de datos (verificadas en esta máquina)

| Dato | Origen | Confianza |
|---|---|---|
| Tokens por llamada | `~/.claude/projects/<slug>/<sessionId>.jsonl`, líneas `type:"assistant"` → `message.usage` | **Medido** |
| Tokens por subagente | `~/.claude/projects/<slug>/<sessionId>/subagents/agent-<id>.jsonl` (trae `agentId` + `attributionAgent`; el `sessionId` es el del padre) | **Medido** |
| Título humano de sesión | línea `type:"ai-title"` → `aiTitle` | Medido |
| Cierre de subagente | en el jsonl del padre, `user.toolUseResult` con `{agentId, agentType, resolvedModel, totalTokens, totalToolUseCount, toolStats}` | Medido, pero no siempre presente |
| Sesiones vivas | `~/.claude/sessions/<pid>.json` → `{pid, sessionId, cwd, startedAt, kind, entrypoint, name}` | Alta |
| % de límite de plan | `~/.claude.json` → `cachedUsageUtilization.utilization` (`five_hour`, `seven_day`, `limits[]`, `extra_usage`, `spend`) — ya vienen calculados, local, sin red | Alta |
| Costo USD | tabla hardcodeada de `ccem-model-router` §7 | **Estimado** |

---

## Mapa de archivos

Responsabilidad de cada archivo nuevo, en una línea:

```
src/commands/monitor.js                    — adapter inbound: (flags, cwd) => exitCode; wiring y elección de modo.

src/monitor/domain/precios.js              — tabla USD/MTok, modeloId -> alias, costo de un Consumo.
src/monitor/domain/eventos.js              — línea cruda del jsonl -> EventoDeUso; decide qué se descarta.
src/monitor/domain/consumo.js              — acumulador con dedup por message.id; sumar/fusionar.
src/monitor/domain/ventanas.js             — parseo de "24h"/"7d", filtrado y bucketing horario.
src/monitor/domain/actividad.js            — corriendo | en_duda | terminado a partir de señales.
src/monitor/domain/arbol.js                — construye VistaMonitor: proyecto -> sesión -> agente -> modelo.
src/monitor/domain/formato.js              — formateo puro a texto plano: tokens, dinero, duración, barra, sparkline, truncado, displayWidth.

src/monitor/application/ports.js           — contratos JSDoc (SnapshotSource, Clock, RouterLog). Sin implementación.
src/monitor/application/build-view.js      — caso de uso: snapshot + reloj inyectado -> VistaMonitor.

src/monitor/adapters/claude-home.js        — resuelve ~/.claude (override por flag/env) e indexa los jsonl.
src/monitor/adapters/jsonl-tailer.js       — lectura incremental por offset, streaming por líneas, línea partida, truncado.
src/monitor/adapters/session-reader.js     — sessions/*.json + chequeo de pid vivo.
src/monitor/adapters/usage-limits-reader.js— cachedUsageUtilization de ~/.claude.json, cache por mtime + TTL.
src/monitor/adapters/snapshot-source.js    — compone los tres; mantiene el estado incremental entre ticks.
src/monitor/adapters/caps.js               — detección de entorno: TTY, columnas, color, Unicode vs ASCII.
src/monitor/adapters/tty-renderer.js       — alternate buffer, ANSI, resize, teclas, cleanup idempotente.
src/monitor/adapters/panel-layout.js       — layout del panel: secciones, presupuesto de altura, overflow, breakpoints.
src/monitor/adapters/plain-renderer.js     — snapshot estático sin ANSI + salida JSON/NDJSON.
src/monitor/adapters/router-log-writer.js  — append a progress/model-router.jsonl con medicion:"medido".

test/helpers-monitor.js                    — construye un ~/.claude falso en tmpdir.
test/monitor-domain.test.js · monitor-tailer.test.js · monitor-view.test.js
test/monitor-render.test.js · monitor-cmd.test.js · monitor-layers.test.js
```

**Modificados (quirúrgico)**: `src/cli.js` (registrar `monitor` en `COMMANDS`, flags en
`OPTIONS`, bloque en `printHelp`), `README.md`, `CHANGELOG.md`, `notes.md`.
`templates/harness.manifest.json` **no** se toca: el monitor es código del CLI, no un
archivo distribuido al proyecto destino.

---

## Lectura eficiente

Los jsonl llegan a 3.4 MB y hay ~120 archivos. Estrategia en cuatro capas:

1. **Poda antes de abrir**: si `mtimeMs < ventana.desde`, el archivo no se abre. Con
   `--since 24h` esto descarta casi todo el histórico. Si `size === offset && mtime`
   igual, se salta.
2. **Prefiltro por substring antes de `JSON.parse`** (el hot path):
   `if (!linea.includes('"type":"assistant"')) continue` +
   `if (!linea.includes('"usage"')) continue`. Descarta >80% de las líneas sin parsear;
   el cold start de 3.4 MB baja de segundos a decenas de ms. (Igual prefiltro para
   `"ai-title"` y `"agentId"`.)
3. **Tail incremental** — estado por archivo `{ offset, mtimeMs, resto, ids:Set, consumo
   }`:
   - `size < offset` → truncado/rotación: resetear todo el estado de ese archivo.
   - `createReadStream(ruta, { start: offset, end: size-1 })`, por chunk
     `texto = resto + chunk; partes = texto.split('\n'); resto = partes.pop()`.
   - La línea parcial (Claude escribiendo mientras leemos) queda en `resto` y se
     completa en el tick siguiente — se emite exactamente una vez, nunca cero ni dos.
   - `offset = size` al final, no hasta el último `\n`.
4. **`~/.claude.json`** pesa 42 KB pero puede crecer: se lee solo si cambió el mtime, TTL
   30 s, y guard de tamaño (>32 MB → aviso y se omite el bloque de límites en vez de
   comerse la RAM).

Errores por archivo (`EBUSY`, `EPERM`, `ENOENT` entre `readdir` y `open`) se capturan, se
empujan a `vista.avisos` y el panel sigue. Nunca tumban el proceso (RNF-03 del spec).

**Por qué polling de `mtime` y no `fs.watch`**: `fs.watch` recursivo en Windows sobre
~120 archivos pierde eventos bajo carga y bajo OneDrive, y necesitaría debounce igual.
Statear 120 archivos cuesta ~1 ms — más simple y más confiable (P9).

---

## Detección de "corriendo AHORA"

Tres señales combinadas en `domain/actividad.js` (función pura, recibe señales ya
recolectadas por el adapter, nunca hace I/O):

| Señal | Origen | Fiabilidad |
|---|---|---|
| `pidVivo` | `sessions/<pid>.json` + `process.kill(pid, 0)` (`ESRCH`=muerto, `EPERM`=vivo de otro usuario) | Alta |
| `escrituraReciente` | `mtimeMs > ahora - 60_000` | Media — un agente pensando largo no escribe |
| `tieneCierre` | `toolUseResult` con ese `agentId` en el jsonl del padre | Alta para "terminó", pero no siempre presente |

```js
if (tieneCierre) return 'terminado'
if (!pidVivo) return 'terminado'
if (escrituraReciente) return 'corriendo'
if (antiguedadMs < 10 * 60_000) return 'en_duda'
return 'terminado'
```

El estado `en_duda` existe porque la heurística no es determinista. Pintar verde un
agente colgado sería peor que mostrar la duda; el pie del panel lo declara.

---

## Costo USD — qué es medido y qué es supuesto

```js
// VERIFICADO contra .claude/skills/ccem-model-router/SKILL.md §7
PRECIOS = { fable:  {entrada: 10.00, salida: 50.00},
            opus:   {entrada:  5.00, salida: 25.00},
            sonnet: {entrada:  3.00, salida: 15.00,
                     intro: {entrada: 2.00, salida: 10.00, hasta: '2026-08-31'}} }

// SUPUESTO — no hay tabla de precios local (additionalModelCostsCache está vacío).
// Convención estándar de prompt caching:
MULTIPLICADORES = { cacheLectura: 0.10, cacheCreacion5m: 1.25, cacheCreacion1h: 2.00 }
```

```
usd = (entrada*P_in + salida*P_out + cacheLectura*P_in*0.10
       + cacheCreacion5m*P_in*1.25 + cacheCreacion1h*P_in*2.00) / 1e6
```

Supuesto adicional documentado en el propio archivo: `input_tokens` no incluye los
cacheados (son campos disjuntos). Si fuese falso, se subcontaría el input; ningún test lo
puede detectar, así que el comentario `// SUPUESTO` en `domain/precios.js` es la única
defensa honesta.

**Alias desconocido** (modelo nuevo, o uno que no está en la tabla): no se suma costo, se
incrementa `consumo.sinPrecio`, y el pie imprime `N llamadas sin precio conocido`. Nunca
se inventa un precio por defecto. El pie siempre dice:
`tokens medidos · costo estimado con tabla local · estado de agentes heuristico`.

---

## Panel

### Jerarquía de secciones

| Banda | Pregunta que responde | Lectura |
|---|---|---|
| **Header** (4 barras de límite) | ¿Estoy cerca del límite? ¿Cuándo se libera? | < 1 s |
| **AHORA + CONSUMO** | ¿Qué está quemando tokens ahora mismo? ¿Sube? | 2-5 s |
| **DESGLOSE / SESIONES / PROYECTOS** | ¿A dónde se fue? (forense, no alarma) | 10 s+ |

Reglas duras:
- El header se ordena por severidad descendente, no por tipo de ventana: el peor caso
  siempre está en la primera fila.
- El header nunca entra en la negociación de espacio. Si `rows < 12`, todo el resto cae y
  se degrada a `--compact` con aviso.
- `AHORA` va antes que `SESIONES` porque los agentes son efímeros; en 30 s ya no están.
- Si algún límite pasa 85%, el borde superior se pinta rojo y el título muta a
  `souclaude monitor  LIMITE 91% Opus`.

### Color y símbolo redundante

| Rango | Color | Símbolo |
|---|---|---|
| 0-59% | `green` | — |
| 60-84% | `yellow` | `!` |
| 85-94% | `red` | `!!` |
| ≥95% | `bold(red)` + `bgRed` en la parte llena | `!!` |

El símbolo no es decorativo: es la redundancia no-cromática que mantiene el panel
legible con `NO_COLOR`, en daltonismo rojo-verde y en capturas monocromas. Nunca se
codifica severidad solo con color. Solo los 8 colores ANSI base, nunca `black`/`white`
como foreground ni fondos fijos. `picocolors` ya respeta `NO_COLOR`/`FORCE_COLOR`/
`isTTY`; lo que no hace es cambiar glifos, de eso se encarga `caps.js`.

### Sin emojis

Ancho inconsistente entre terminales (Windows Terminal cuenta 2, conhost cuenta 1 o
produce mojibake), ZWJ y VS16 invisibles para `.length`. Un emoji mal medido corre toda
la fila. `>` / `.` / `!` / `!!` hacen el mismo trabajo y miden 1 siempre.

### Anti-parpadeo

Regla: nunca `\x1b[2J` dentro del loop — eso es exactamente el flash.

- Arranque: `\x1b[?1049h` (alternate screen, el scrollback del usuario queda intacto) +
  `\x1b[?25l`.
- Cada frame: `\x1b[H`, cada línea + `\x1b[K`, y `\x1b[0J` una vez al final si el frame
  encogió. Un solo `process.stdout.write()` con todo concatenado — escribir línea por
  línea es la segunda causa de tearing.
- Resize: debounce 100-150 ms, invalidar cache de líneas, `\x1b[2J\x1b[H` una sola vez,
  repintar.
- `Ctrl+C` con `setRawMode(true)` deja de generar `SIGINT`: hay que interceptar el byte
  `0x03` a mano. Si se omite, el usuario queda con la terminal sin cursor y sin echo — es
  el bug número uno de este tipo de herramientas.
- `restaurar()` idempotente registrado en `exit`, `SIGINT`, `SIGTERM`,
  `uncaughtException` y en el `finally` del loop: `setRawMode(false)` +
  `\x1b[?25h\x1b[?1049l`.

**Truncar sobre texto plano, colorear después, nunca al revés.** `picocolors` inyecta
escapes que `String.length` cuenta y la terminal no dibuja. Esa restricción es lo que
justifica arquitectónicamente que `formato.js` viva en el dominio: es texto plano puro,
sin dependencia de la librería de color.

### Ancho de caracteres

`displayWidth(str)`: quitar ANSI → iterar por code points → clasificar (box-drawing y
bloques `0x2500-0x259F` = 1; rangos wide CJK/pictográficos = 2; combinantes/ZWJ/VS16 = 0).
Encima, `sanitizeCell()` aplicado a todo texto de origen externo (títulos de sesión,
ramas): `NFC` → quitar `\p{Cc}\p{Cf}` → `\p{Extended_Pictographic}` → `·` → colapsar
espacios. Así un `aiTitle` con emoji nunca rompe la tabla.

### Overflow

Presupuesto de altura calculado antes de dibujar. Orden de corte (de abajo hacia arriba):
`DESGLOSE` cae primero, luego `PROYECTOS` (mín. 2 filas), `CONSUMO` (2 líneas,
indivisible), `SESIONES` (mín. 3), `AHORA` (mín. 1).

- Sesiones: orden por `ultimoTs` desc, las vivas siempre primero. `... y 35 sesiones mas
  [s] ver todas`.
- Proyectos: los que no entran se agregan en una fila real `otros (3)`, no se descartan
  — los porcentajes tienen que sumar 100.
- Agentes: nunca top-N por tokens. Se muestran todos los corriendo; los terminados se
  recortan primero.
- Los totales del header y del pie se calculan sobre el conjunto completo, jamás sobre
  las filas visibles.

A 80 columnas se cae la columna `RAMA`, `DESGLOSE` se apila en vez de ir a dos columnas, y
las barras pasan de 32 a 22 celdas. Sin Unicode (conhost legacy o `--ascii`): `+-|` para
el marco, `#` / `.` para las barras, `>` / `-` para estado.

---

## Comando y flags

| Modo | Cuándo | Salida |
|---|---|---|
| `live` | TTY, sin `--once`/`--json` | Panel completo, alternate buffer |
| `compact` | `--compact` o sin TTY o `CI=true` | Header + 1 línea por sesión viva + total. Imprime y sale |
| `agents` | `--agents` | Header + `AHORA` a 1 s. Para mirar durante un `/orchestrate` |
| `json` | `--json` | `JSON.stringify(vista)`. Con `--interval`, NDJSON |

```
--interval <ms>      Refresco. Default 2000. Minimo 250.
--since <dur>        1h | 6h | 24h | 7d | all. Default 24h.
--project <txt>      Filtra por nombre o ruta. "." = el cwd actual.
--session <id>       Filtra por sessionId (prefijo basta).
--sort <criterio>    tokens | costo | reciente. Default reciente.
--top <n>            Filas por seccion. Default 10.
--once               Un snapshot y sale. Implicito sin TTY.
--compact --agents --json --ascii
--claude-home <ruta> Override de ~/.claude. Para tests y para inspeccionar otra maquina.
                     (tambien via env SOUCLAUDE_CLAUDE_HOME)
--emit-router        Escribe una linea en progress/model-router.jsonl. Unica escritura del comando.
  --hito <ID>        Obligatorio con --emit-router.
  --task <ID> --agente <n> --resultado <r> --rework <n> --motivo <txt>
```

**Códigos de salida** (siguiendo la convención de `src/commands/status.js`): `0` todos
los límites <85% · `1` alguno en 85-94% · `2` alguno ≥95%. Usable en un hook
`SessionStart` que avise "estás al 91% de Opus".

Cadencia en vivo: repintado cada 1 s (cronómetros fluidos); agentes y transcripts se
releen cada `--interval`; límites cada 60 s desde el cache local. El indicador
`actualizado hace Xs` refleja la edad del dato más viejo mostrado, no la del último
repintado — mentir sobre eso es peor que no mostrarlo.

---

## Puente con `progress/model-router.jsonl`

```bash
souclaude monitor --emit-router --session a7f3 --agente implementer \
  --hito SHS-H3 --task SHS-H3-T004 --resultado approved
```

Construye la línea desde la `VistaMonitor` ya agregada, con `medicion: "medido"`,
`modelo` = alias dominante por tokens de ese agente, `effort` = el más frecuente entre
sus eventos, y un campo extra `fuente: {sessionId, agentId, llamadas}`.

Decisiones:
- `tokens_in` = `entrada + cacheCreacion + cacheLectura` (todo lo facturado como
  entrada). Documentado en el writer y en el CHANGELOG: si no, los costos no cierran
  contra la facturación.
- `costo_usd` es `null` si algún modelo del tramo no tenía precio. Un `null` honesto vale
  más que un número incompleto.
- **Idempotencia**: se lee el jsonl y se rechaza si ya existe la tupla `(task,
  fuente.agentId)`, salvo `--force`.
- Escritura con `appendFileSync`, sin write-temp-then-rename: es la única ruta bajo
  OneDrive y el rename da EPERM (misma regla que ya documenta `src/core/fsx.js`).

Camino complementario: `souclaude monitor --once --json --session a7f3` deja que el
`orchestrator` arme la línea desde su Bash. Ambos usan la misma agregación.

---

## Constitution alignment

Verificación contra `docs/constitution.md`, principio por principio. Se responde por qué
aplica o por qué no, no solo con checkboxes.

| Principio | Veredicto | Cómo aplica |
|---|---|---|
| **P1** — Contratos antes que tecnologías | cumple | `application/ports.js` define `SnapshotSource`, `Clock`, `RouterLog` como contratos JSDoc en lenguaje de dominio, sin implementación. El adapter real (`snapshot-source.js`) es reemplazable sin tocar `build-view.js` ni el dominio. No se crean puertos especulativos: los tres existen porque los tests necesitan un fake (`Clock` fijo, `SnapshotSource` fake sobre fixtures). |
| **P2** — Hexagonal con enforcement automático | cumple, enforcement propio | `src/monitor/` estrena `domain ← application ← adapters` desde cero, sin tocar `src/core/` (que sigue plano). El dominio no importa `node:fs` ni `picocolors`. **Enforcement por test, no por dependency-cruiser**: `test/monitor-layers.test.js` lee los `import` de `src/monitor/domain/**` y falla si alguno no es relativo (`./...`) o si el dominio importa un módulo core de Node. Ver "Decisión: enforcement por test" abajo — la razón por la que no se suma dependency-cruiser. |
| **P3** — Medir antes de optimizar | cumple | La estrategia de lectura (poda por mtime, prefiltro por substring, tail incremental) responde a una medición real: 120 archivos de hasta 3.4 MB en esta máquina, no a una optimización especulativa. No se optimiza más allá de ese caso medido. |
| **P4** — Modularidad por capas | cumple | El namespace `src/monitor/` separa por capa (`domain/application/adapters`), no por feature ("panel", "router"). Un archivo por responsabilidad concreta, sin agrupar por pantalla. |
| **P5** — Observabilidad desde el día uno | cumple, con alcance acotado | El propio comando *es* observabilidad de consumo. `vista.avisos` es el canal estructurado de errores del monitor mismo (RNF-03). No aplica logging estructurado adicional: es un CLI de un solo tick o un loop corto, no un servicio de larga vida con requests. |
| **P6** — Human-in-the-loop en acciones sensibles | cumple | La única escritura es `--emit-router`, append-only, idempotente por `(task, agentId)`, y requiere `--force` explícito para sobrescribir. No hay borrado ni migración irreversible en este hito. |
| **P9** — Simplicity First (universal) | cumple | Cero dependencias nuevas (evita `ccem-research`); ANSI a mano en vez de una librería de TUI; polling de `mtime` en vez de `fs.watch` (más simple y sin pérdida de eventos bajo OneDrive); enforcement de capas con un test de 20 líneas en vez de sumar dependency-cruiser al proyecto. Cada decisión de este plan elige la opción de menos superficie que igual cumple el requisito. |
| **P10** — Surgical Changes (universal) | cumple | Los únicos archivos existentes que se tocan son `src/cli.js` (wiring puntual: registrar comando, flags, ayuda), `README.md`, `CHANGELOG.md`, `notes.md` — todos quirúrgicos y trazables a T18/T27. `templates/harness.manifest.json` no se toca porque el monitor no es un artefacto distribuido. No se refactoriza `src/core/` ni ningún comando existente más allá de ese wiring. |

### Decisión: enforcement de P2 por test, no por dependency-cruiser

`docs/constitution.md` (P2) nombra dependency-cruiser (o ESLint no-restricted-imports)
como la herramienta de enforcement de referencia. Este plan usa en su lugar
`test/monitor-layers.test.js`: un test que lee los `import` de `src/monitor/domain/**` y
falla si alguno no es relativo, o si el dominio importa un módulo core de Node
(`node:fs`, etc.).

**Por qué**: sumar dependency-cruiser es adoptar una herramienta nueva, y la constitución
exige pasar por `ccem-research` (7 criterios) antes de adoptar cualquier dependencia
nueva — evaluación que este hito no necesita para resolver un problema que un test con
regex ya resuelve con cero dependencias (RNF-01, P9). Si en el futuro el repo adopta
dependency-cruiser para el resto de `src/`, este test se puede reemplazar sin tocar el
dominio (el contrato — "el dominio no importa frameworks" — no cambia, solo la
herramienta que lo verifica, que es exactamente el espíritu de P1).

**Costo de esta decisión**: el test cubre solo `src/monitor/domain/`, no el resto del
repo (que hoy no tiene enforcement de capas porque `src/core/` es plano por diseño). Si
`src/core/` alguna vez adopta hexagonal, ese enforcement es un plan aparte.

---

## Dependencies

### Deben existir ANTES de empezar
- [x] `src/core/fsx.js` — ya existe, se reutiliza tal cual.
- [x] `src/ui.js` — ya existe, se reutiliza solo para errores fatales pre-render.
- [x] `test/helpers.js` (patrón `mkRepo()`) — ya existe, se reutiliza como referencia de
      estilo para `test/helpers-monitor.js`.

### Se crean DURANTE
- [ ] Todo `src/monitor/**`, `src/commands/monitor.js`, `test/monitor-*.test.js`,
      `test/helpers-monitor.js` — ver tabla de tareas en `tasks.md`.

### Se modifican DURANTE
- [ ] `src/cli.js` — registrar `monitor` en `COMMANDS`, sus flags en `OPTIONS`, bloque en
      `printHelp`. Único punto de contención real (T18, ver `tasks.md`).
- [ ] `README.md`, `CHANGELOG.md`, `notes.md` — documentación del comando nuevo (T27).

---

## Risks y mitigaciones

| Risk | Impact | Likelihood | Mitigation |
|------|--------|-----------|------------|
| Doble conteo por `message.id` repetido infla el consumo silenciosamente | H | M | Dedup por `message.id` en `domain/consumo.js`, con test dedicado que verifica "3 líneas con el mismo `message.id` → 1 llamada" |
| Slug de carpeta de proyecto no reversible a ruta real | M | Alta (siempre) | La ruta sale siempre de `cwd` dentro del jsonl o de `sessions/<pid>.json`, nunca del slug |
| `isApiErrorMessage: true` rompe el parseo si no se filtra | M | M | `domain/eventos.js` descarta explícitamente esas líneas antes de intentar leer `usage` |
| `Ctrl+C` con `setRawMode(true)` deja la terminal sin cursor/echo si no se intercepta | H | M si se omite | Interceptar el byte `0x03` a mano; `restaurar()` idempotente en `exit`/`SIGINT`/`SIGTERM`/`uncaughtException`/`finally` |
| `fs.watch` recursivo pierde eventos en Windows/OneDrive | M | Alta si se usara | Se descarta `fs.watch`; polling de `mtime` sobre ~120 archivos (~1 ms) |
| `~/.claude.json` crece sin límite y se come RAM | M | Baja | Guard de tamaño (>32 MB → aviso, se omite el bloque de límites) |
| Multiplicadores de cache supuestos no reflejan la facturación real | M | Desconocida | Documentado como `// SUPUESTO` en `domain/precios.js`, declarado en el pie del panel; ningún dato de costo se presenta como medido |
| `src/cli.js` compartido con los 5 comandos existentes: colisión de flags | M | Baja | T18 va sola, en su propio commit; flags nuevos revisados contra `--force`/`--dry-run` existentes antes de mergear |

---

## Research notes

### D1: Polling de `mtime` en vez de `fs.watch`

**Decisión**: statear los ~120 archivos cada tick en vez de suscribirse a eventos del
filesystem.
**Rationale**: `fs.watch` recursivo en Windows sobre ~120 archivos pierde eventos bajo
carga y bajo OneDrive, y de todas formas necesitaría debounce — la complejidad no se
ahorra, solo se esconde. Statear 120 archivos cuesta ~1 ms.
**Alternativa descartada**: `fs.watch` con debounce manual — más código, menos confiable.

### D2: Enforcement de capas por test propio, no dependency-cruiser

Ver "Decisión: enforcement de P2 por test, no por dependency-cruiser" arriba.

### D3: Todo lo que ve el renderer es serializable a JSON

**Decisión**: `VistaMonitor` es el único objeto que consumen los renderers, y
`--json` es literalmente `JSON.stringify(vista)`.
**Rationale**: el panel TTY y la salida `--json` no pueden divergir si comparten el
mismo objeto sin transformación, y los tests e2e pueden comparar JSON en vez de parsear
ANSI.
**Alternativa descartada**: que el renderer TTY reciba un objeto más rico (con
referencias a colores/formato ya aplicado) y `--json` uno reducido aparte — dos fuentes
de verdad que divergen con el tiempo.

---

## Implementation strategy

### Approach
- [ ] Rollout: incremental, por olas de paralelismo (ver `tasks.md`). Sin feature flag —
      es un comando nuevo (`monitor`), no modifica comportamiento existente hasta T18.
- [ ] Test strategy: unit sobre dominio con fixtures deterministas (`test/monitor-domain.test.js`),
      integración de adapters sobre un `~/.claude` falso (`test/monitor-tailer.test.js`,
      `test/monitor-view.test.js`), e2e del comando completo (`test/monitor-cmd.test.js`),
      más el test de enforcement de capas (`test/monitor-layers.test.js`).

### Rollback plan
Si el comando falla en uso real: revertir el merge commit (el comando es aditivo, no
modifica ningún comando existente salvo el wiring de `src/cli.js`, que revierte limpio).
No hay migración de datos que deshacer — el monitor no persiste estado propio.

---

## Observability

- **Métricas**: el propio comando es la superficie de observabilidad de consumo del
  harness; no aplica una capa de métricas adicional sobre sí mismo.
- **Logs**: `vista.avisos` es el canal estructurado de errores de lectura, visible en el
  panel y en el JSON. No hay logging a archivo — el CLI es de vida corta.
- **Alertas**: los códigos de salida (`0`/`1`/`2`) son el mecanismo de alerta,
  consumibles desde un hook `SessionStart` o un script externo.
- **Dashboard**: el panel en sí (`souclaude monitor`) es el dashboard.

---

## Checklist antes de avanzar a Tasks

- [x] ¿Plan alineado con constitución (verificado punto por punto)? Sí, tabla completa
      arriba, con ADR pendiente de crear para D2 si el reviewer lo pide (`/adr-new`).
- [x] ¿Data contracts completos y sin ambigüedad? Sí — `EventoDeUso`, `Consumo`,
      `VistaMonitor` documentados con determinismo temporal explícito.
- [x] ¿Risks identificados con mitigación concreta (no genérica)? Sí, 8 riesgos con
      mitigación puntual cada uno.
- [x] ¿Dependencies verificadas como existentes o planeadas? Sí.
- [x] ¿Developer lead aprobó el plan? Pendiente — este plan transcribe el plan ya
      aprobado por el owner como fuente de verdad.
- [x] ¿ADRs creados para decisiones significativas? D1 y D2 son candidatas a ADR
      (`/adr-new`); D2 en particular porque "por qué no dependency-cruiser" es la clase de
      decisión que alguien va a querer revertir sin este contexto.
