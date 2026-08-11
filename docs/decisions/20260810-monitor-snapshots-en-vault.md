# ADR: Snapshots agregados del monitor en el Vault (excepción a la regla de telemetría)

**Fecha**: 2026-08-10
**Status**: accepted
**Deciders**: Ignacio A

## Context

El equipo incorpora una segunda cuenta de Claude. La pregunta operativa diaria — *¿con
cuál cuenta trabajo ahora?* — necesita ver los límites de plan de **ambas** cuentas de
un vistazo, aunque cada una corra en una máquina distinta. El monitor
(`souclaude monitor`) es local por diseño: lee `~/.claude` de su máquina y no ve nada de
las demás.

Hay dos reglas escritas que este trabajo toca:

1. **`progress/README.md` y `docs/vault-guide.md` §8 excluyen la telemetría cruda del
   Vault** (`model-router.jsonl` explícitamente). La razón de fondo: el Vault es el
   tablero del "ahora" (kanban, espejos de specs/progreso), no un data lake.
2. **La spec de `SHS-H3-monitor-tokens` declara como non-goal la persistencia de
   histórico propio del monitor.** (El spec hermano `SHS-H3-extra-historico` ya está
   abriendo una excepción local acotada con `usage-history.json`.)

Alternativas consideradas y descartadas:

- **Un servicio/daemon central o una DB compartida**: infraestructura nueva, credenciales
  nuevas, y contradice Simplicity First (P9) para un equipo de dos cuentas.
- **Compartir los `~/.claude` por red / OneDrive**: mezcla credenciales de cuentas
  distintas y rompe la política de seguridad del `usage-fetcher`.
- **Publicar en el repo del proyecto**: el consumo es de la organización, no de un
  proyecto; además todo cambio al repo del proyecto exige rama + PR, incompatible con
  publicación automática cada pocos minutos.

El Vault ya tiene exactamente las propiedades que se necesitan: repo git compartido por
todas las máquinas, push directo a `main` sin PR, protocolo de concurrencia escrito
(`pull --rebase`, nunca `--force`), y semántica de "refleja el ahora".

## Decision

1. **Se admite en el Vault una clase nueva y acotada de contenido: snapshots *agregados*
   del monitor**, en `00-System/monitor/` (nivel organización, no `Project-*`, porque
   las cuentas no pertenecen a un proyecto). La regla general sigue vigente:
   `model-router.jsonl` crudo y cualquier dato por sesión/proyecto siguen **prohibidos**
   en el Vault.
2. **Un archivo por (cuenta, máquina)**: `00-System/monitor/<accountUuid8>--<machineID8>.json`.
   Escritores git disjuntos ⇒ sin conflictos de merge. El lector agrupa por cuenta y usa
   el snapshot más fresco.
3. **Formato v1** (campo `version: 1`): identidad de cuenta y máquina, límites de plan
   (5 h / 7 d / gasto extra), totales agregados del día y `generadoEn`. Tamaño <1 KB.
   Cambios de forma ⇒ bump de `version`; los lectores ignoran versiones desconocidas con
   aviso.
4. **Política de escritura**: el monitor publica solo con el flag opt-in `--publish` y
   solo en modo en vivo; commit únicamente ante cambio material (ignorando `generadoEn`)
   o heartbeat de 30 min; secuencia `pull --rebase` → write → `add` → `commit` → `push`;
   nunca `--force`; ante fallo, backoff y aviso en el panel — el render nunca se
   bloquea. El snapshot se construye por whitelist de campos y pasa por
   `contieneSecreto()` antes de escribir.

## Consequences

- El equipo ve los límites y el consumo agregado de todas las cuentas desde cualquier
  máquina, con frescura visible, sin infraestructura nueva.
- El Vault gana ~2-12 commits/día por máquina activa con mensaje
  `monitor: snapshot <alias>@<host>`. Es ruido aceptado a cambio de frescura; el
  heartbeat + comparación material lo acotan.
- La excepción queda documentada en `docs/vault-guide.md` §8 y `progress/README.md` en
  la misma rama que la implementa; cualquier ampliación futura de qué puede publicar el
  monitor requiere revisar este ADR.
- Riesgo aceptado: relojes desincronizados entre máquinas distorsionan la frescura; se
  mitiga mostrando aviso ante frescura negativa, sin romper el orden de la vista.
