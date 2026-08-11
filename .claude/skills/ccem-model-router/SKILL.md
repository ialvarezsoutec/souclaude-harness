---
name: ccem-model-router
description: Soutec Model Router — política declarativa para asignar modelo y esfuerzo a cada subagente del flujo SDD, optimizando calidad, velocidad y costo. Aplicar cada vez que el orchestrator lanza un subagente (spec-author, implementer, reviewer), al decidir si escalar a un modelo más capaz, y al revisar la telemetría de ruteo en /rock-close. El orchestrator es quien la ejecuta; esta skill es la única fuente de verdad de la política.
---

# Soutec Model Router

Política para que cada subagente corra con el mejor modelo posible según el triángulo
**Calidad / Velocidad / Costo**. La lógica la ejecuta el **orchestrator** (es el único con
la herramienta `Agent`, que acepta overrides de `model` y `effort` por invocación); esta
skill es la política. Cambiar un modelo o agregar un agente = editar **este archivo**,
nada más.

Complementa la sección "Selección de modelo" de `ccem-core` (roles abstractos
Decisiones / Ejecución / Volumen): aquí esos roles se vuelven operables.

## 1. Clasificación de la tarea

Toda tarea a delegar cae en una de **tres clases**:

| Clase | Qué es |
|---|---|
| **mecánica** | Rename, formato, docs, config trivial, task de `tasks.md` sin ninguna decisión. |
| **estándar** | Feature o fix acotado con spec aprobado, siguiendo un patrón que ya existe en el repo. |
| **compleja** | Decisión arquitectónica, contrato público, root cause no evidente, superficie de seguridad. |

## 2. Estimación de dificultad — checklist de señales

La clase no se decide por intuición: se cuenta contra este checklist y las señales
encontradas **se registran en la telemetría** (la clasificación queda auditable).

**Señales duras** — una sola basta para clasificar **compleja**:

- Requiere decisión arquitectónica o un ADR.
- Cambia un contrato público (API, esquema de datos, puerto de dominio).
- Toca superficie de seguridad (auth, secretos, permisos, datos sensibles).
- El root cause del problema es desconocido.

**Señales blandas** — cada una suma 1:

- Se estiman más de 3 archivos tocados.
- El área no tiene patrón previo en el repo.
- Introduce una dependencia nueva (dispara además `ccem-research`).
- El task está ambiguo en `tasks.md`.

**Regla**: 0 señales → mecánica · 1-2 blandas → estándar · ≥3 blandas o ≥1 dura → compleja.

## 3. Matriz de selección — agente × clase → (modelo, effort)

Los roles son los de `ccem-core`; el mapeo rol → alias vive en la tabla del §6 (único
lugar a actualizar cuando cambie la familia de modelos).

| Agente | mecánica | estándar | compleja |
|---|---|---|---|
| `spec-author` | Volumen / medium | Ejecución / high | **Decisiones / high** |
| `implementer` | Volumen ligero / low | Volumen / medium | Ejecución / high + Advisor |
| `reviewer` | Volumen / medium | Ejecución / high | Ejecución / high |
| `orchestrator` | `inherit` — es la sesión top-level, no se rutea a sí mismo. |||
| `security-evidence-compiler` | Fijo por frontmatter (`model: inherit`, `effort: high`). No se rutea. |||
| `explore` | `inherit` — read-only, no se le elige tier. **Se registra igual** (ver §5). |||

Notas deliberadas:

- La única celda que usa el tier Decisiones **por defecto** es `spec-author` en tareas
  complejas: el diseño es donde un error cuesta más.
- `implementer` estándar corre en **Volumen**: la telemetría de SHS-H3 (T103-T105) mostró
  que tareas estándar con spec aprobado salen `approved` en ese tier con rework ≤ 1. Si
  una celda concentra rework, se sube en `/rock-close`, no por intuición.
- **Volumen ligero** (tareas mecánicas del `implementer`): renames, formato, docs y config
  trivial no ameritan un modelo de razonamiento. Es el tier más barato de la familia.
- El `implementer` complejo **no** sube a Decisiones: usa la **Advisor Strategy** de
  `ccem-core` (consulta puntual de ~400-700 tokens al modelo de Decisiones en el momento
  crítico), que es mucho más barata que correr todo el task en el modelo caro.
- Nunca "optimize at all costs" (`ccem-core`): la matriz optimiza el triángulo, no un
  solo eje.

## 4. Fallback y escalamiento

Escalar es **excepcional**. El default de la matriz debe resolver la gran mayoría de los
lanzamientos sin subir de tier.

**Escalar a Decisiones solo si se cumple alguno de estos criterios objetivos:**

1. El `reviewer` devolvió `CHANGES_REQUESTED` **2 veces sobre el mismo task**.
2. Hubo **2 intentos de root cause fallidos**, documentados en `progress/`.
3. El `spec-author` declara explícitamente una decisión con trade-off que amerita ADR.

**Presupuesto: máximo 1 escalada por hito.** Si el presupuesto está agotado y el problema
persiste, **no se vuelve a escalar**: el orchestrator para y consulta al humano (coherente
con los checkpoints SDD). Toda escalada lleva `motivo` obligatorio en la telemetría.

**Fallback descendente**: si el lanzamiento con override de modelo falla porque el usuario
no tiene acceso a ese modelo, se reintenta con `inherit` y se registra `fallback: true`.
Nunca se aborta un hito por falta de acceso a un modelo.

## 5. Telemetría y aprendizaje

**Registro**: `progress/model-router.jsonl`, append-only, **una línea por lanzamiento**,
escrita por el orchestrator (Bash, `>>`). Campos:

```json
{"ts": "2026-07-23T15:04:00Z", "hito": "REA-H3", "task": "REA-H3-T003",
 "agente": "implementer", "clase": "estandar", "senales": ["mas_de_3_archivos"],
 "modelo": "opus", "effort": "medium", "resultado": "approved", "rework": 0,
 "motivo": null, "tokens_in": 42150, "tokens_out": 8300, "costo_usd": 0.94,
 "medicion": "estimado", "cuenta": "dev", "cuenta_uuid": "aaaa1111-…", "maquina": "bbbb2222-…"}
```

- `task`: ID completo del task (`<PREFIJO>-H<n>-T<nnn>`) cuando el lanzamiento ejecuta
  uno; `null` en lanzamientos de fase (ej. spec-author escribiendo `spec.md`).
- `resultado`: `approved` | `changes_requested` | `escalated` | `fallback` | `aborted`.
- `rework`: número de devoluciones del reviewer sobre ese task.
- `motivo`: obligatorio solo en escaladas y fallbacks; `null` en el resto.
- `tokens_in` / `tokens_out`: enteros, o `null` si no hay dato.
- `costo_usd`: tokens × tabla de precios del §7; `null` si no hay tokens.
- `medicion`: `"medido"` **solo** cuando el resultado de la herramienta Agent reporta el
  uso real de tokens. Si no lo reporta, el orchestrator **estima** por tamaño de
  artefactos (prompt enviado + archivos leídos/escritos, ~4 caracteres por token) y marca
  `"estimado"`. **Regla de honestidad**: un `"estimado"` es orden de magnitud para
  comparar celdas de la matriz — jamás se presenta como cifra contable ni de facturación.
- `cuenta` / `cuenta_uuid` / `maquina`: atribución multi-cuenta (SHS-H3-monitor-multicuenta).
  `cuenta` es el alias legible (parte local del email), `cuenta_uuid` el `accountUuid` y
  `maquina` el `machineID` de `~/.claude.json`. Los tres van en `null` si la máquina no
  tiene identidad. Las líneas anteriores a este campo son válidas sin él; en `/rock-close`
  se agrupa por `cuenta_uuid` cuando existe.

**Lanzamientos de `Explore`**: el agente `Explore` de Claude Code lo lanzan `spec-author`
(fase Plan) e `implementer` (task sobre código no descrito en `plan.md`); `reviewer` y
`orchestrator` no. No se rutea —corre en `inherit`— pero **se registra igual**, con
`agente: "explore"`, `clase: "mecanica"`, `modelo: "inherit"` y `resultado: "approved"`. Su
costo entra al total del hito como cualquier otro lanzamiento: si el reconocimiento se vuelve
caro, tiene que verse en `/rock-close`, no esconderse. Decisión completa en
`docs/decisions/20260811-explorer-nativo-en-el-flujo-sdd.md`.

**Aprendizaje = ritual humano, sin ML.** En `/rock-close` se resume el JSONL del
trimestre y se ajusta la matriz si:

- las escaladas superan el **10 %** de los lanzamientos, o
- una celda de la matriz concentra el rework (señal de que su tier quedó corto), o
- una celda nunca falla (señal de que puede bajar un tier).

Un hito sin líneas en el JSONL es una violación visible del protocolo del orchestrator.

## 6. Mapeo rol → modelo (único lugar a actualizar)

| Rol (`ccem-core`) | Alias de modelo |
|---|---|
| **Decisiones** | `fable` |
| **Ejecución** | `opus` |
| **Volumen** | `sonnet` |
| **Volumen ligero** | `haiku` |

Los IDs y precios concretos cambian con cada release: al actualizar esta tabla, verifica
la doc oficial de Anthropic en vez de confiar en memoria. Se usan **aliases de familia**,
no IDs versionados, y jamás se fija `model:` en el frontmatter de los agentes SDD:
forzar un modelo rompe a quien no lo tiene (por eso existe el fallback a `inherit`).

## 7. Tabla de precios (referencial)

Para calcular `costo_usd` en la telemetría. USD por millón de tokens (verificados contra
la doc oficial en julio 2026):

| Alias | Input (USD/MTok) | Output (USD/MTok) |
|---|---|---|
| `fable` | 10.00 | 50.00 |
| `opus` | 5.00 | 25.00 |
| `sonnet` | 3.00 (intro 2.00 hasta 2026-08-31) | 15.00 (intro 10.00) |
| `haiku` | 1.00 | 5.00 |

**Los precios cambian por release: verifica la doc oficial de Anthropic al actualizar esta
tabla** — no confíes en valores de memoria. La tabla existe para que
la estimación sea **reproducible** (mismo cálculo en todos los hitos), no para
contabilidad. Al cambiar un precio, anótalo en el CHANGELOG del repo: los costos de
trimestres distintos dejan de ser comparables si la tabla cambió en el medio.
