# ADR: El monitor persiste un historico propio del gasto extra

**Fecha**: 2026-08-10
**Status**: accepted
**Deciders**: Ignacio A

## Context

`specs/SHS-H3-monitor-tokens/spec.md` (Non-goals) es explícito: *"Persistencia de
histórico propio. El monitor lee el estado actual de los jsonl en cada tick; no mantiene
su propia base de datos ni agrega una fuente de verdad nueva."* Esa decisión sigue siendo
correcta para el consumo de tokens: los `.jsonl` de transcripts son la fuente de verdad y
releerlos en cada tick es barato y siempre consistente.

El gasto extra (`usage_limits.extra_usage`, expuesto por `cachedUsageUtilization` /
el endpoint de uso) es un caso distinto. La API solo informa el **estado actual**:
`is_enabled`, `used_credits`, `monthly_limit`, `utilization`, `spend_limit_reached`. No
expone en ningún campo **cuándo** se alcanzó el límite, ni conserva un historial de
periodos ya cerrados — cuando el periodo se resetea, el estado anterior simplemente
desaparece del payload. `SHS-H3-T103` agrega la regla de dominio "un extra alcanzado
pasa a histórico a las 24 horas de haberse detectado" (`estadoDelExtra`,
`domain/gasto-extra.js`), pero esa regla necesita un dato — `detectadoEn` — que no existe
en ningún jsonl ni en ningún campo de la API. Sin persistirlo en algún lado, es imposible
saber si ya pasaron 24 horas: cada arranque del proceso vería el mismo `alcanzado: true`
sin poder distinguir "recién detectado" de "detectado hace tres días".

## Decision

El monitor agrega una segunda fuente de verdad, deliberadamente y **solo para el gasto
extra**: `~/.claude/souclaude/usage-history.json`, mantenido por el adaptador nuevo
`src/monitor/adapters/usage-history.js` (`{ abierto: PeriodoDeGastoExtra | null,
archivados: PeriodoDeGastoExtra[] }`). La decisión de negocio (abrir un registro nuevo,
mantenerlo igual, o cerrarlo/archivarlo por reset) vive en una función pura de dominio
(`siguienteRegistro`, `domain/gasto-extra.js`, `SHS-H3-T103`); el adaptador solo persiste
lo que esa función devuelve, con escritura directa (`writeFileSync`, sin temp+rename —
mismo motivo que `usage-fetcher.js`: EPERM bajo sync de OneDrive) y lectura tolerante a
archivo ausente o corrupto (arranca vacío, nunca lanza).

Esto contradice el non-goal de `SHS-H3-monitor-tokens` a propósito y en un alcance
acotado: el resto del monitor (tokens, costo, sesiones, proyectos) sigue leyendo
exclusivamente los `.jsonl` en cada tick, sin ningún estado propio. Solo el gasto extra
gana una fuente de verdad adicional, porque es el único dato del panel que la API no
puede reconstruir por sí sola en cada lectura.

## Consequences

### Positivas
- El panel puede mostrar "hace cuánto se alcanzó el límite" y una sección Histórico
  (`SHS-H3-T105`) con datos que ninguna otra fuente disponible tiene.
- La lógica de negocio (`siguienteRegistro`) es pura y se testea sin tocar el
  filesystem; el adaptador es un envoltorio delgado sobre esa función, fácil de
  reemplazar (otra ruta, otro formato) sin tocar el dominio.
- Sigue el mismo patrón ya validado por `usage-fetcher.js` (cache propio, escritura
  directa, lectura tolerante): no introduce un mecanismo nuevo al proyecto.

### Negativas
- El monitor ya no es 100 % "lee el estado actual y listo" para este dato puntual: hay un
  archivo nuevo en disco cuyo contenido puede quedar desincronizado si se borra a mano
  (el próximo `alcanzado: true` simplemente vuelve a abrir un registro con
  `detectadoEn = ahora`, perdiendo el histórico previo — no rompe nada, pero pierde
  memoria).
- Un segundo proceso del monitor corriendo en paralelo (dos terminales) puede pisar la
  escritura del otro entre lecturas: no hay locking. Aceptable porque el peor caso es
  perder un registro de detección puntual, no corromper el archivo (cada escritura es un
  `JSON.stringify` completo y atómico a nivel de proceso).
- `usage-history.json` es un archivo más que un backup/restauración de `~/.claude` tendría
  que contemplar si algún día se documenta ese flujo (hoy no existe tal flujo en este
  proyecto).

### Neutras
- El campo aditivo `vista.historico` (planeado para `SHS-H3-T105`) expone este dato al
  `--json` del monitor sin transformar nada, siguiendo la regla ya documentada de
  `plain-renderer.js` ("expone el modelo de dominio tal cual").

## Alternatives considered

### Alternativa A: no persistir nada, y mostrar el extra alcanzado indefinidamente como alarma activa
**Pros**: cero estado nuevo, cumple el non-goal de `SHS-H3-monitor-tokens` sin excepción.
**Cons**: es exactamente el bug que motiva este hito (`SHS-H3-extra-historico`) — un
extra ya vencido hace días sigue mostrando el marco rojo y `LIMITE 107%` de forma
permanente, sin ninguna señal de que ya no es información accionable.
**Por qué se descartó**: el spec de este hito existe para resolver ese bug; ignorarlo no
es una opción sobre la mesa.

### Alternativa B: derivar `detectadoEn` de otra fuente ya existente (jsonl, `.claude.json`, mtime de algún archivo)
**Pros**: no requeriría un archivo nuevo si algún timestamp ya disponible sirviera.
**Cons**: ningún archivo existente registra el instante en que `spend_limit_reached`
pasó a `true`. `cachedUsageUtilization.fetchedAtMs` es cuándo se *leyó* el dato, no
cuándo el límite se *alcanzó* — pueden diferir por horas o días si el humano no corrió
`/usage` en el medio. Los `.jsonl` de transcripts no incluyen el estado de límites en
absoluto.
**Por qué se descartó**: el dato simplemente no existe en ningún lado fuera de un
registro que el propio monitor mantenga.

### Alternativa C: guardar el historico en memoria del proceso, sin persistir a disco
**Pros**: cero I/O nuevo, ningún archivo que gestionar.
**Cons**: el panel en vivo (`souclaude monitor`) es un proceso de larga duración, pero
`--once`/`--json` (usados desde hooks y scripts, incluyendo el propio `codigoDeSalida`
que corre en cada invocación) arrancan un proceso nuevo en cada llamada — sin disco,
`detectadoEn` se resetearía a "ahora" en cada invocación y la regla de 24h de
`SHS-H3-T103` nunca se cumpliría en ese modo.
**Por qué se descartó**: rompe el caso de uso más común de automatización (hooks que
llaman `souclaude monitor --json` puntualmente, no el panel en vivo).

## References

- `specs/SHS-H3-monitor-tokens/spec.md` — Non-goals, "Persistencia de histórico propio"
  (la regla que este ADR contradice, deliberada y acotadamente).
- `specs/SHS-H3-extra-historico/plan.md` — sección "Decisión que requiere ADR" y "D3:
  La decisión de abrir/cerrar el registro es un reducer puro, la mecánica de leer/escribir
  es del adaptador".
- `src/monitor/domain/gasto-extra.js` (`SHS-H3-T103`) — `estadoDelExtra`,
  `siguienteRegistro`.
- `src/monitor/adapters/usage-history.js` (`SHS-H3-T104`) — adaptador de persistencia.
- `src/monitor/adapters/usage-fetcher.js:175-187` — precedente de escritura directa sin
  temp+rename por EPERM bajo OneDrive.
