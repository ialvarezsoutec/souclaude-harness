# AGENTS.md — Orquestación de agentes bajo CCEM

Este archivo explica **cómo trabajan los agentes** en un repo con el harness de SOUTEC. No
es una biblia de reglas: esas viven en `docs/constitution.md` y en las skills de
`.claude/skills/`. Esto es el **mapa** del flujo multi-agente. Lee lo que necesites cuando lo
necesites.

## Los cuatro roles

Viven en `.claude/agents/`. Cada uno tiene sus herramientas acotadas a propósito.

| Agente | Rol | Escribe código | Herramienta clave |
|---|---|---|---|
| `orchestrator` | Descompone y coordina; hace respetar los checkpoints. | ❌ | `Agent` (lanza a los otros) |
| `spec-author` | Redacta `spec.md` / `plan.md` / `tasks.md`, una fase a la vez. | ❌ | `Write`/`Edit` (solo en `specs/`) |
| `implementer` | Implementa el spec del hito task por task, cada cambio con su test. | ✅ | `Write`/`Edit` |
| `reviewer` | Aprueba o rechaza de forma **independiente**. | ❌ | (sin `Write`/`Edit`: dictamina) |

La separación es el punto: quien especifica no implementa, y quien implementa **no se
aprueba a sí mismo**.

## El flujo

```
hito (ID <PREFIJO>-H<n>) ─► rama tipo/<ID-hito>-<slug>
        │
        ▼
spec.md ─► ⏸ ─► plan.md ─► ⏸ ─► tasks.md ─► ⏸ ─► implement ─► review ─► PR
```

Son **tres checkpoints** antes de escribir código, no uno. Hasta que `spec.md`, `plan.md` y
`tasks.md` estén aprobados, la rama **solo admite commits `docs:`**. Durante `implement`, el
review es incremental (task por task), nunca en batch al final.

Quién levanta cada `⏸` depende del **modo de trabajo**.

## Modo de trabajo: `manual` y `auto`

**El default es `auto`: el flujo corre solo.** No hay que configurar nada para trabajar
desatendido — es el comportamiento base del harness.

Quien quiera revisar fase por fase lo pide explícito:

```
npx souclaude mode          # muestra el modo actual
npx souclaude mode manual   # pide OK en cada checkpoint
npx souclaude mode auto     # vuelve al default (borra el opt-in)
```

El opt-in vive en `.claude/mode.local.json` — **archivo local, gitignorado**, como
`.claude/vault.local.json`: es de tu máquina, no del proyecto. Si falta, está corrupto o trae
un valor inválido, **el modo es `auto`**.

Por qué el default es autónomo: el modo de trabajo lo eliges con el **permission mode de
Claude Code** (shift+tab), y ese modo **no se expone en runtime** — un agente no puede
consultarlo. Si el flujo desatendido dependiera de escribir un archivo, ciclar a automático no
cambiaría nada. Por eso el harness corre solo por defecto y `manual` es el opt-in.

| | `auto` (default) | `manual` |
|---|---|---|
| Checkpoints spec/plan/tasks | El `orchestrator` verifica y encadena | Esperan tu OK |
| Entre task y task | Encadena | Espera tu OK |
| `reviewer` | **Obligatorio** | Obligatorio |
| Ambigüedad, `blocked`, tests rojos | **Para** | Para |
| Acciones destructivas o externas (P6) | **Para** | Para |

Lo que `auto` elimina es **la espera por una aprobación humana**, no el control de calidad. El
`reviewer` independiente sigue corriendo y su `CHANGES_REQUESTED` sigue bloqueando; el
Anti-Hack de `ccem-prompting` sigue vigente; y P6 —"no existe autonomía total sobre sistemas
externos"— sigue mandando: en `auto`, `git push`, merge a `main`, tags, releases y deploys
**siguen pidiendo tu confirmación**. Relajar eso no es cuestión de un flag: exige un ADR y
cambiar la constitución.

En `auto`, el `orchestrator` toma el checkpoint en tu lugar: lee el artefacto recién escrito,
verifica que esté completo y sea coherente, y recién ahí encadena, dejando `auto_ok` en
`progress/history.md`. Un artefacto a medias no se aprueba solo por estar en `auto`.

### Modo ≠ permisos: son dos perillas distintas

| | Qué gobierna | Dónde se configura |
|---|---|---|
| **Modo** (`auto`/`manual`) | Los **checkpoints metodológicos** del flujo SDD: ¿hay que esperar tu OK entre fases y entre tasks? | `.claude/mode.local.json` |
| **Permisos** | Si Claude pide confirmación para **ejecutar una herramienta** (correr un comando, editar un archivo) | `permissions` en `.claude/settings.json` + el permission mode de Claude Code (shift+tab) |

Para que Claude ejecute comandos sin preguntarte, la perilla es **permisos**, no el modo. El
harness deja `permissions.deny` sobre secretos (`.env`, claves, credenciales) y `permissions.ask`
sobre el puñado de operaciones que P6 marca como irreversibles:

```
git push · git merge · git tag · git reset --hard · gh pr merge · gh release
```

Esa lista es corta a propósito: **todo lo demás corre sin preguntar**. Editar, leer, `npm test`,
`git add`, `git commit`, `git fetch` — nada de eso pide permiso. Lo que queda en `ask` es lo que
reescribe historia, publica hacia afuera o destruye trabajo, que es exactamente lo que P6
protege ("no existe autonomía total sobre sistemas externos"). Un `git push` es la frontera
donde el trabajo deja tu máquina y pasa a ser de todos.

Si en tu contexto necesitas que esas seis también corran solas, sácalas de `ask` en tu
`.claude/settings.local.json` (personal, gitignorado) — pero es una decisión consciente que
va contra P6, no un default del harness.

## Cómo se invoca (opt-in)

La orquestación **no** corre en cada sesión: la pides cuando la quieres.

> "Actuá como `orchestrator` para el hito REA-H3."

Un subagente de Claude Code no siempre puede lanzar otros subagentes, así que en la práctica
**la sesión principal adopta el rol `orchestrator`** y desde ahí lanza a `spec-author`,
`implementer` y `reviewer` según la fase. Para un cambio que la matriz de `ccem-sdd` marca
como "saltá SDD" (fix puntual, cosmético, spike, hotfix), no montes el flujo: hazlo directo.

## Agentes especialistas bajo demanda

Además del cuarteto de orquestación SDD, este harness puede incluir agentes
especialistas invocados para una tarea concreta y acotada, no como parte del
flujo diario. El caso real hoy es `security-evidence-compiler.md`: se activa
solo cuando la skill `it-security-review` completa un gate de seguridad
(`FINAL_SECURITY_GATE=PASSED`) y compila la evidencia en un informe para IT.
No es un rol genérico de "asesor" — es un agente con contrato de activación
explícito y entradas/salidas bien definidas. Si en el futuro aparece otro
caso concreto de este tipo, se agrega con su propio nombre descriptivo, no
como una casilla vacía a llenar.

## Reconocimiento: el `Explore` nativo

Antes de redactar el CÓMO técnico hay que conocer el terreno, y barrerlo con `Glob`/`Grep`
quema el contexto más caro del flujo. Para eso se usa el agente **`Explore` de Claude Code**
—read-only, devuelve la conclusión y no el volcado de archivos—, **no** un rol nuevo del
harness: no existe `.claude/agents/explorer.md` ni hace falta. Decisión y costos en
[`docs/decisions/20260811-explorer-nativo-en-el-flujo-sdd.md`](docs/decisions/20260811-explorer-nativo-en-el-flujo-sdd.md).

| Agente | ¿Puede lanzar `Explore`? | Cuándo |
|---|---|---|
| `spec-author` | ✅ **solo en fase Plan** | Mapear el terreno antes de redactar `plan.md`. Máx. 1 por fase. |
| `implementer` | ✅ acotado | Solo si el task toca código que `plan.md` no describe. Máx. 1 por task. |
| `reviewer` | ❌ nunca | Su valor es la independencia del juicio: lee él, no un tercero que resume. |
| `orchestrator` | ❌ nunca | Su reconocimiento es de estado, no semántico; ya tiene `Read`/`Glob`/`Grep`. |

**No genera artefacto propio.** El hallazgo se consume en el momento y aterriza en el
artefacto que ya existía —`plan.md` o `impl_summary.md`—, así que la regla
anti-teléfono-descompuesto se respeta: el disco sigue siendo la fuente de verdad. Un
`exploration.md` versionado sería ruido que caduca apenas cambia el código.

**Lo que esto cuesta, dicho de frente**: en `auto`, el `orchestrator` encadena verificando el
artefacto él mismo. Si `plan.md` se apoya en un mapa que nadie más vio, esa verificación
alcanza para decir que el plan está *completo*, no que sea *correcto respecto del código
real*. Por eso la autorización se acota a la fase Plan, donde `plan.md` es lo bastante
detallado como para que un error de reconocimiento se note al leerlo.

**Telemetría**: el `orchestrator` registra cada lanzamiento en `progress/model-router.jsonl`
con `agente: "explore"`, igual que cualquier otro. Corre siempre en `inherit` —no se le
elige tier—, pero su costo tiene que ser visible.

## Reglas que todos respetan

Los agentes **no redefinen** las reglas del harness; las cumplen. Fuente de verdad:

- **`docs/constitution.md`** — P1-P10. P2 (dominio no importa frameworks), P9 (Simplicity),
  P10 (Surgical) y P6 (human-in-the-loop, que es lo que hacen los checkpoints).
- **`ccem-planner`** — el ID del hito es el hilo: hito ↔ `specs/<ID-hito>-<slug>/` ↔ rama ↔
  commits ↔ PR. Sin ID, el `orchestrator` para y lo pide; no lo inventa.
- **`ccem-prompting`** (Anti-Hack) — el `reviewer` caza tests que no prueban, mocks que fingen
  lógica y errores tragados. Ningún agente reporta "listo" con trabajo simulado.
- **`ccem-core`** — selección de modelo por rol (razonamiento alto para diseño/review).
- **`soutec-github`** — nombres de rama, Conventional Commits en español, plantilla de PR.
  Nadie hace commit/merge a `main` ni crea tags/releases.
- **`CLAUDE.md` (Idioma)** — todo agente responde en **español neutro**, tuteo, nunca voseo
  rioplatense ("usa", no "usá"; "dilo", no "decilo"). Vale para la salida de cada rol.

## Resultados por disco, no por chat

Cada agente escribe su resultado en un archivo versionado y devuelve **solo una referencia**
(`spec_ready -> specs/<ID>-<slug>/spec.md`, `done -> progress/<ID>-<slug>/impl_summary.md`,
`APPROVED -> progress/<ID>-<slug>/review.md`). El contenido vive en el repo, no en la
conversación: así queda trazable y no se pierde entre sesiones.

La estructura completa de `progress/` está en `progress/README.md`: `current.md` (estado
vivo), `history.md` (historial compartido append-only — cada agente agrega una línea al
cerrar su artefacto) y una subcarpeta `progress/<ID-hito>-<slug>/` por spec en marcha con
`summary.md` (spec-author), `impl_summary.md` (implementer) y `review.md` (reviewer).

**Regla de arquitectura**: si un task cambia la arquitectura (puerto nuevo, contrato
público, dependencia entre capas), su cierre exige el doc de `docs/` actualizado **y** un
ADR en `docs/decisions/`. El `reviewer` rechaza un cambio de arquitectura sin ambas cosas.

**Espejo al Vault y estado vivo**: los artefactos SDD y los resúmenes de progreso se
copian además al Vault (repo aparte para no ensuciar este; ruta local en
`.claude/vault.local.json`), y la tarjeta de cada task se mueve en
`Project-<PREFIJO>/kanban.md` **al empezar** a trabajarla — el tablero refleja el ahora, no
el último push. Reglas y formato en `progress/README.md`.

**Los dos repos**: el Vault tiene su propio remoto y su regla es la opuesta a la de este
repo — **push directo a su `main`**, sin PR, para que el tablero esté vivo. Antes de tomar
un task: `git -C "<vault>" pull --rebase` y leer el kanban. Si la tarjeta ya está **En
curso** con otro dueño, la trabaja otra máquina: **paras y preguntas**, no la tomas. Al
tomarla, mueves y pusheas en ese momento. Protocolo completo en `progress/README.md`.
