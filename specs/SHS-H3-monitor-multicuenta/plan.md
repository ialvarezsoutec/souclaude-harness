# Plan: Trazabilidad multi-cuenta en el monitor (vía Vault)

**Spec**: [spec.md](./spec.md)
**Hito**: SHS-H3
**Creado**: 2026-08-10
**Aprobado**: 2026-08-10 (Ignacio A)

---

## Resumen de diseño (Simplicity First)

**Una cuenta = un archivo JSON pequeño en el Vault**, publicado por el monitor en vivo a
intervalo. El mismo mecanismo cubre los dos escenarios (cuenta en otra máquina, o varios
homes en una): cada home publica el suyo y todos leen la carpeta. Descartado
explícitamente: daemons, servidores, DB, y la fusión de árboles de transcripts de N
homes (complejidad alta, valor bajo — la atribución fina ya viaja por `--emit-router`
con campo de cuenta).

Respeta la arquitectura hexagonal existente (`adapters → application → domain`,
enforcement en `test/monitor-layers.test.js`): la identidad y las cuentas remotas entran
al dominio como datos del snapshot; el dominio solo normaliza y proyecta, sin `node:*`
ni `Date.now()` (recibe `ahora`).

## Contratos de datos

### Identidad (nueva salida de `usage-limits-reader.js`)

```json
{ "cuenta": { "accountUuid": "…", "email": "dev@soutec-group.com",
              "organizacion": "SOUTEC", "machineID": "…" } }
```

Alias legible calculado en dominio: `aliasDeCuenta(email)` → parte local del email
(`dev`). Todo el objeto es `null` si `.claude.json` no trae `oauthAccount`.

### Snapshot en el Vault — `00-System/monitor/<accountUuid8>--<machineID8>.json`

Nombre con **cuenta Y máquina** (primeros 8 caracteres de cada uuid): escritores git
disjuntos, cero conflictos de merge. El lector agrupa por `accountUuid` y muestra el más
fresco.

```json
{
  "version": 1,
  "generadoEn": "2026-08-10T14:32:00.000Z",
  "cuenta": { "accountUuid": "…", "alias": "dev", "email": "…", "organizacion": "SOUTEC" },
  "maquina": { "machineID": "…", "hostname": "SOUTEC-PC01" },
  "limites": {
    "cincoHoras": { "porcentaje": 42, "reseteaEn": "…" },
    "sieteDias":  { "porcentaje": 61, "reseteaEn": "…" },
    "gastoExtra": { "habilitado": true, "usadoUsd": 12.5, "limiteUsd": 50, "utilizacion": 25 },
    "leidoEn": 1754834000000
  },
  "totalesDia": { "tokensIn": 0, "tokensOut": 0, "costoUsd": 0, "llamadas": 0 },
  "origen": "souclaude vX.Y.Z"
}
```

Reglas duras: se construye **campo por campo (whitelist), jamás con spread** del JSON
crudo; pasa por `contieneSecreto()` antes de escribir; tamaño esperado <1 KB.

### Línea del router log (extensión de la SKILL ccem-model-router §5)

Después de `medicion`: `"cuenta"` (alias), `"cuenta_uuid"`, `"maquina"` — los tres
`null` si la vista no trae identidad. Idempotencia intacta (`task` + `fuente.agentId`).
La SKILL se actualiza en el mismo commit.

### `VistaMonitor` (dominio)

```
VistaMonitor += {
  cuenta: { accountUuid, alias, email, organizacion, machineID } | null,
  cuentas: [{ accountUuid, alias, esLocal, maquina, limites, totalesDia,
              generadoEn, frescuraMs }]
}
```

`cuentas` = la local (`esLocal: true`, `frescuraMs: 0`) + remotas del Vault.
`frescuraMs = ahora − generadoEn`; negativa ⇒ aviso "reloj adelantado", no rompe orden.

## Fases y archivos

### Fase 1 — Identidad + router log (S; sin dependencias)

| Archivo | Cambio |
|---|---|
| `src/monitor/adapters/usage-limits-reader.js` | En `buildValue()` extraer también `oauthAccount.*` y `machineID`; devolver `{limits, cuenta, warnings}`. Aprovecha el caché mtime+TTL existente — cero lecturas nuevas. |
| `src/monitor/adapters/snapshot-source.js` | Propagar `cuenta` en `collect()`. |
| `src/monitor/domain/cuentas.js` (**nuevo**, puro) | `aliasDeCuenta(email)`, `normalizarCuenta(cruda)`. |
| `src/monitor/domain/arbol.js` | `construirVista()` agrega `cuenta`. |
| `src/monitor/adapters/router-log-writer.js` | Campos nuevos en `construirLinea()` desde `vista.cuenta`. |
| `.claude/skills/ccem-model-router/SKILL.md` | §5 con los campos nuevos (mismo commit). |
| `src/monitor/adapters/panel-presenter.js` | Alias en el header (`dev@SOUTEC-PC01`), cambio mínimo. |

### Fase 2 — Publicación al Vault (M; requiere ADR aprobado)

**Nuevo** `src/monitor/adapters/vault-monitor-publisher.js` —
`createVaultPublisher({ vaultPath, intervaloMs = 5*60_000, git })`:

- `publicar(vista, { ahora })`: arma el snapshot por whitelist; compara contra el
  archivo existente **ignorando `generadoEn`** — solo escribe/commitea si cambió
  materialmente o si lo publicado tiene >30 min (heartbeat). ~2-12 commits/día por
  máquina activa.
- Secuencia git: `pull --rebase` → escribir (directa, **sin temp+rename** — regla
  OneDrive) → `add` → `commit -m "monitor: snapshot <alias>@<host>"` → `push`.
  `execFile` con args en array (mismo criterio que `src/core/vault.js`), nunca
  `--force`. Si el rebase falla: `rebase --abort` + backoff.
- **Nunca bloquea el render**: fire-and-forget con guard `enPublicacion` (patrón
  `enTick` de `monitor.js`); backoff copiado de `usage-fetcher.js` (3 fallos → 15 min,
  6 → 60 min); `estado()` para el aviso en panel.
- `contieneSecreto()` sobre el JSON serializado; si dispara, aborta y avisa.

`src/commands/monitor.js` — flag `--publish` (opt-in): resuelve `readVaultConfig()` de
`src/core/vault.js`; sin Vault → warning único y local-only. Solo publica en modo en
vivo (no en `--once`/`--json`). Documentar la excepción en `docs/vault-guide.md` §8 y
`progress/README.md`.

### Fase 3 — Consolidación: sección CUENTAS (S-M; desarrollable en paralelo con fixtures)

**Nuevo** `src/monitor/adapters/vault-accounts-reader.js` — lee
`<vault>/00-System/monitor/*.json` del **working tree local** (caché por mtime, TTL
60 s; sin `git pull` en el camino del render — el refresco remoto llega con el pull del
publisher; sin `--publish`, un pull cada 5 min con el mismo backoff, fuera del tick).
Corruptos/versión desconocida → aviso, nunca caída.

| Archivo | Cambio |
|---|---|
| `src/monitor/adapters/snapshot-source.js` | Inyectar `accountsReader` opcional; `collect()` agrega `cuentasRemotas`. |
| `src/monitor/domain/cuentas.js` | `consolidarCuentas({cuentaLocal, remotas, ahora})` (pura): dedup por accountUuid, gana el más fresco; la local gana sobre su propio snapshot publicado. |
| `src/monitor/adapters/panel-presenter.js` + `panel-layout.js` | Sección "CUENTAS": `alias  5h:42%  7d:61%  extra:$12.5/$50  hace 3m  [remota]`; umbrales 85/95; atenuada + "(dato viejo)" si frescura >15 min. |
| `src/monitor/adapters/plain-renderer.js` | Sección en modo plain; `--json` la expone gratis. |

### Fase 4 — Multi-home local explícito (OPCIONAL, diferida)

Solo si se corren dos cuentas en una máquina sin querer dos terminales:
`~/.claude/souclaude/accounts.json` con lista de homes; para los secundarios se
instancia únicamente `createLimitsReader` + `createUsageFetcher` (solo límites, sin
árbol de transcripts) y sus cuentas entran a CUENTAS/publicación.

**MVP = Fases 1-3.** Camino crítico: F1 → (ADR) → F2 → F3. F1 y el ADR van en paralelo.

## Riesgos

| Riesgo | Mitigación |
|---|---|
| Conflictos git en el Vault (2+ máquinas) | Un archivo por (cuenta, máquina) → escritores disjuntos; `pull --rebase`; abort + backoff si falla |
| Fuga de credenciales al repo compartido | Whitelist + `contieneSecreto()` + test con token plantado que debe abortar |
| Vault no configurado / sin red | `--publish` degrada a warning; monitor 100 % funcional local-only |
| Reloj desincronizado | `frescuraMs` negativa → aviso, no rompe orden |
| OneDrive (EPERM en rename) | Escritura directa sin temp+rename (regla ya establecida) |
| `.claude.json` viejo sin `oauthAccount` | `cuenta: null` en toda la cadena; router log emite `null`s |

## Verificación

Tests por capa (respetando `test/monitor-layers.test.js` — los adaptadores nuevos pueden
importar `node:*`; `domain/cuentas.js` no importa nada y recibe `ahora`):

- `usage-limits-reader`: fixture con/sin `oauthAccount` → `{limits, cuenta}` /
  `cuenta: null`.
- `cuentas` (dominio puro): alias, `consolidarCuentas` (dedup, frescura, reloj futuro).
- `router-log-writer`: línea con/sin identidad; idempotencia intacta.
- `vault-monitor-publisher`: git inyectado como fake (array de llamadas) → secuencia
  pull→write→add→commit→push; "sin cambio material" ⇒ cero llamadas git; backoff; token
  plantado ⇒ aborta.
- `vault-accounts-reader`: fixture con 3 JSON (uno corrupto, uno versión 99) → 2 cuentas
  + 2 avisos.

End-to-end con dos homes falsos (patrón `--claude-home`, que además apaga la red):

1. `test/fixtures/home-a/` y `home-b/` con `.claude.json` hermanos (cuentas A y B).
2. Vault falso: `git init --bare` + dos clones.
3. Publicar desde A y desde B → dos archivos en `00-System/monitor/`, sin conflicto.
4. `pull` en el clone A + `monitor --json --claude-home home-a/.claude` → `cuentas` con
   A (local) y B (remota) y frescura correcta.
5. `--emit-router` sobre A → línea con `cuenta`, `cuenta_uuid`, `maquina`.
