# ADR: Registro estructurado de consumo por sesión en el Vault (base de datos del monitor)

**Fecha**: 2026-08-20
**Status**: accepted
**Deciders**: Ignacio A

## Context

La pregunta "¿cuánto consumió tal contribuyente / cuenta / proyecto en tal período?"
no se puede responder hoy desde el Vault. Lo que el monitor publica es insuficiente
a propósito:

- `00-System/monitor/<cuenta8>--<maquina8>.json` (ADR 20260810): un snapshot
  **agregado y sobrescrito** por (cuenta, máquina) — límites de plan y totales del
  día. Sin histórico, sin sesiones, sin proyecto.
- `Project-<PREFIJO>/sessions.md` (ADR 20260817): **una línea Markdown por sesión**,
  con tokens redondeados a "k". Legible para humanos, pero pierde costo USD, desglose
  de cache, modelo, identidad de cuenta y timestamps — y no es parseable con
  garantías.

El monitor ya tiene en memoria todo el dato rico por sesión (`domain/arbol.js`):
tokens con desglose de cache, costo USD, llamadas, consumo por modelo, cuenta
(UUID + alias), timestamps, rama y milestone inferido. Falta únicamente un lugar
estructurado donde persista. Este es el milestone SHS-M2 ("base de datos del
monitor").

La regla vigente (ADR 20260810, ampliada por 20260817) **prohíbe** en el Vault
cualquier dato por sesión que no sea la línea agregada de `sessions.md`, así que
este cambio exige revisar la decisión, no solo implementar.

## Decision

Se amplía por segunda vez la excepción de telemetría del Vault: se autoriza un
**registro estructurado de consumo por sesión**, append-only, en
`00-System/monitor/usage/` (nivel organización — el consumo cruza proyectos y
cuentas).

1. **Formato**: JSONL — un objeto JSON por línea, **una línea por sesión**, versionado
   con `version: 1`. Cambios de forma ⇒ bump de `version`; los lectores ignoran
   versiones desconocidas con aviso (mismo contrato que los snapshots).
2. **Particionado: un archivo por (máquina, mes)** —
   `00-System/monitor/usage/<maquina8>--<AAAA-MM>.jsonl`, donde `<maquina8>` es el
   `machineID` corto (o el hostname saneado como respaldo) y el mes es el del
   **inicio** de la sesión (estable: una sesión nunca cambia de archivo). Escritores
   git disjuntos ⇒ sin conflictos de merge, igual que los snapshots y las tarjetas.
3. **Esquema v1 por whitelist**, campo a campo, nunca volcando un nodo del árbol:
   `sessionId`, `generadoEn`, `inicio`/`fin` (ISO), `proyecto` (solo el **nombre**,
   nunca la ruta local), `rama`, `milestone`, `quien` (contribuyente de
   `vault.local.json`), `cuenta` (uuid + alias), `maquina` (machineID + hostname),
   `tokens` (entrada / salida / cacheCreacion / cacheLectura), `costoUsd`,
   `llamadas` y `porModelo` (alias + tokens + costo por modelo). **Sin prosa libre**:
   el título de la sesión queda fuera (vive saneado en `sessions.md`); los campos de
   texto se sanean y `contieneSecreto()` corre sobre cada línea como último filtro.
4. **Política de escritura**: la misma disciplina probada de los dos publishers
   existentes — publica por defecto con Vault configurado, solo en modo en vivo,
   `--no-publish` la apaga; intervalo ~5 min con commit únicamente ante **cambio
   material** (ignorando `generadoEn`); idempotencia por `sessionId` en un registro
   local (nunca re-parseando el Vault); la línea propia se actualiza en el lugar
   mientras la sesión crece y una línea ajena o editada jamás se pisa;
   `pull --rebase` → write → add → commit → push, nunca `--force`; ante fallo,
   backoff y aviso en el panel — `publicar()` nunca lanza ni bloquea el render.
5. **La telemetría cruda sigue prohibida**: `model-router.jsonl`, transcripts y
   eventos por mensaje no entran al Vault. La granularidad máxima autorizada es
   **una línea agregada por sesión**.

## Alternatives considered

- **Extender `sessions.md` con más campos**: rompe la legibilidad humana que ese
  archivo tiene como único propósito, y el formato de línea Markdown no es un
  contrato parseable (el usuario puede editar sus líneas — es suyo por diseño).
- **Una base de datos real (SQLite) en el Vault**: binario no mergeable en un repo
  git compartido — un solo conflicto corrompe el archivo. JSONL por (máquina, mes)
  da consultas equivalentes con merges triviales.
- **Un archivo por sesión**: miles de archivos pequeños; git y OneDrive lo pagan
  caro y una consulta necesita leerlos todos igual.
- **Registrar también la ruta local del proyecto**: expone la estructura de discos
  de cada máquina sin aportar a la agregación; el nombre del proyecto es la clave
  de join suficiente.

## Consequences

- El consumo por cuenta, sesión, contribuyente y proyecto se vuelve **consultable
  desde cualquier máquina** (`souclaude monitor --usage`), sin acceso a los
  transcripts de las demás — la base sobre la que SHS-M3 monta sus vistas.
- El Vault gana un commit `monitor: usage <host>` cada ~5 min **solo mientras hay
  sesiones creciendo** (el cambio material lo acota); los archivos crecen ~una línea
  por sesión de trabajo y rotan por mes.
- El campo `quien` de `.claude/vault.local.json` pasa de opcional-manual a
  capturado por el instalador: sin él, el eje "contribuyente" degrada al alias de
  cuenta.
- Tercera clase de contenido de monitor en el Vault: cualquier ampliación futura
  (más granularidad, más campos de prosa) requiere revisar **este** ADR, no
  agregarse a la whitelist en silencio.
