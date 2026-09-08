---
name: azdo-sync
description: Sincroniza el tablero del Vault con Azure DevOps Boards vía el servidor MCP oficial de Azure DevOps - cada milestone es un Epic (con su descripción) y cada tarea del kanban es un work item hijo de ese Epic, etiquetado con su milestone; se crea o transiciona en el momento en que la tarjeta se mueve. Alternativa a jira-sync para equipos que usan Azure Boards en vez de Jira. Actívate SIEMPRE que muevas una tarjeta del kanban del Vault (alta, En curso, En review, Hecho), al dar de alta, tomar o cerrar un milestone, o cuando el usuario pida sincronizar, ver o actualizar el estado del proyecto en Azure Boards.
---

# azdo-sync — el Vault espejado en Azure Boards

El Vault es la fuente de verdad del progreso; Azure Boards es su **espejo para la
organización**. Esta skill mantiene ese espejo: **cada movimiento de tarjeta en el
Vault se refleja en Azure Boards en el mismo momento**, sin que el usuario lo pida
— igual que el push inmediato al Vault.

**Excluyente con `jira-sync`**: un proyecto usa una de las dos, no ambas — instala
la que corresponda a la herramienta real del equipo.

## Configuración

1. **Conector**: `.mcp.json` ya tiene un único dueño en el manifest del harness
   (la entrada de `jira-sync`), así que el servidor de Azure DevOps **no se
   distribuye automáticamente** — se agrega a mano una vez por repo, al bloque
   `mcpServers` de `.mcp.json`. Es el paquete oficial de Microsoft
   (`@azure-devops/mcp`), corre local por `stdio` (no es un endpoint HTTP alojado
   como el de Atlassian) y necesita Node.js 20+.

   **Autenticación — `envvar` con PAT es el método usado por SOUTEC.** El
   servidor MCP local oficial se ejecuta con:

   ```
   npx -y @azure-devops/mcp soutec --authentication envvar
   ```

   El PAT se proporciona mediante la variable de entorno `ADO_MCP_AUTH_TOKEN`,
   en texto original (no en base64). Nunca guardar ni commitear el PAT en
   `.mcp.json`, `.claude/azdo.json` ni ningún archivo del repositorio; el
   proceso de Claude debe heredarla del entorno.

   Ejemplo `.mcp.json`:

   ```json
   "azure-devops": {
     "command": "cmd",
     "args": [
       "/c",
       "npx",
       "-y",
       "@azure-devops/mcp",
       "soutec",
       "--authentication",
       "envvar"
     ]
   }
   ```
2. **Destino**: `.claude/azdo.json` (commiteado, no es secreto) define la
   organización y el proyecto:

```json
{
  "organization": "<org>",
  "project": "<proyecto-ADO>",
  "areaPath": "<proyecto-ADO>",
  "epicWorkItemType": "Epic",
  "taskWorkItemType": "Task"
}
```

**Convención SOUTEC**: cada proyecto del Vault tiene su **propio proyecto en
Azure DevOps** dentro de la organización de la empresa. Si `.claude/azdo.json`
tiene otra cosa, manda el archivo.

**Tipos de work item por plantilla de proceso**: `epicWorkItemType` y
`taskWorkItemType` son configurables porque Azure DevOps no tiene un único juego
de tipos — depende de la plantilla del proyecto (Basic, Agile, Scrum, CMMI). Antes
del primer uso, confirma con el usuario los tipos y los estados reales del
proyecto (ver tabla de estados más abajo) y ajusta `azdo.json` si no coinciden con
los valores por defecto.

**Degradación — nunca bloquees el trabajo local por Azure Boards**: si el
conector no está autorizado, `.claude/azdo.json` no existe o todavía tiene
placeholders, **dilo una vez, sugiere el paso que falta y sigue** con el trabajo
local y el Vault. El espejo pendiente se anota en `notes.md` para la próxima
sesión con conector.

## Mapeo Vault → Azure Boards

Jerarquía nativa de Azure Boards, para que el tablero agrupe por Epic en vez de
acumular work items sueltos:

**El Epic (milestone)** — cada milestone de `milestones.md` es un Epic, para que
el backlog de Azure Boards muestre todo lo que hay por delante y no solo las
tareas ya desglosadas:

| Vault | Azure Boards |
|---|---|
| Milestone (`<PREFIJO>-M<n>`) | Un **Epic** (`epicWorkItemType` de `azdo.json`) |
| Title | `<PREFIJO>-M<n> · <título del milestone>` |
| Description | La descripción del milestone en `milestones.md` |
| Tags | `<PREFIJO>-M<n>` |
| Sus tareas | Work items **hijos** del Epic (vínculo `System.LinkTypes.Hierarchy-Forward`) |
| Columna en `milestones.md` (Backlog / En curso / Hecho) | State **New** / **Active** / **Closed** (nombres reales según la plantilla del proyecto — ver abajo) |

**La tarea del kanban** — un work item estándar colgado de su Epic:

| Vault | Azure Boards |
|---|---|
| Tarea del kanban (`<PREFIJO>-M<n>-T<m>`) | Un work item de `taskWorkItemType` con **parent = el Epic de su milestone** |
| Milestone de la tarea | El **parent** + tag `<PREFIJO>-M<n>` (redundancia útil para consultas WIQL) |
| Title | `<PREFIJO>-M<n>-T<m> · <descripción de la tarjeta>` |
| Columna Backlog | State **New** (o **To Do** en Basic) |
| Columna En curso | State **Active** (o **Doing** en Basic) |
| Columna En review | State **Resolved** si el proceso lo tiene; si no, se queda en Active con un comentario |
| Columna Hecho | State **Closed** (o **Done** en Basic) |
| Dueño de la tarjeta (`@quién`) | `System.AssignedTo`, si se puede resolver el usuario en la organización; si no, se omite |

**Estados por plantilla de proceso** — Azure DevOps no tiene estados fijos: varían
según Basic / Agile / Scrum / CMMI. **No asumas los nombres**: la primera vez que
sincronices en un proyecto, consulta sus estados reales (los del work item type
usado) y guarda el mapeo acordado con el usuario como nota en `azdo.json` o en
`notes.md`. Si un estado de la tabla no existe en el proceso del proyecto, usa el
más cercano y repórtalo.

Los estados son **independientes**: mover una tarea nunca mueve el Epic, y
viceversa. El Epic espeja la columna del **milestone** en `milestones.md`; las
tareas espejan su columna en `kanban.md`.

El **ID en el Title es la clave de idempotencia** — para las dos clases: antes de
crear, consulta con WIQL un work item del proyecto cuyo Title empiece con ese ID
(`<PREFIJO>-M<n> ·` para milestones, `<PREFIJO>-M<n>-T<m> ·` para tareas — el `·`
tras el ID evita que `M1` matchee `M11`). Si existe, se actualiza/transiciona; si
no, se crea. **Nunca dupliques** work items.

## Herramientas del conector

Las que importan del servidor MCP de Azure DevOps (búscalas con ToolSearch si
están diferidas — los nombres pueden variar de versión a versión, confírmalos con
la lista de tools disponible en runtime antes de asumirlos):

- Consulta / idempotencia: la tool de **WIQL** del dominio de work items (query
  por `[System.TeamProject] = '<proyecto>' AND [System.Title] CONTAINS '<ID> ·'`).
- Lectura: **get** / **get_batch** de work items, **list_comments**.
- Escritura: **create** / **update** (para setear `System.State`,
  `System.AssignedTo`, `System.Tags`, `System.Description`), **add_child** para
  crear una tarea ya vinculada a su Epic.
- Vínculos: la tool de **link** cuando el parent se agrega después de crear
  (`System.LinkTypes.Hierarchy-Forward` desde el Epic hacia la tarea).
- Comentarios: la tool de **comment add/update**.

El conector no permite borrar work items — coherente con la regla de nunca
borrar.

## Cuándo sincronizar

En el mismo flujo en que tocas el Vault — el orden es siempre Vault primero
(fuente de verdad), Azure Boards inmediatamente después:

- **Alta de tarea** en el kanban → crear el work item en el state inicial con su
  tag y **parent = el Epic de su milestone** (si el Epic no existe, créalo
  primero).
- **Tomar una tarea** (→ En curso) → transicionar al state "en curso" del
  proceso (crear si falta).
- **Tarea a En review / Hecho** → transicionar al state correspondiente.
- **Milestone nuevo** → crear su Epic en el state inicial, con la descripción del
  milestone y el tag `<PREFIJO>-M<n>`.
- **Milestone a En curso** → transicionar su Epic al state "en curso".
- **Milestone a Hecho** → verificar que todos sus work items hijos estén
  cerrados; si alguno no lo está, repórtalo antes de cerrar. Si está todo
  cerrado, transicionar el Epic al state final.

## Reglas

- **Azure Boards nunca es la fuente**: no muevas tarjetas del Vault para
  "igualar" el tablero de Azure. Si detectas divergencia (alguien movió el work
  item en Azure Boards), repórtala al usuario y deja que él decida — el Vault
  manda.
- **No toques work items ajenos**: solo los que tienen Title que empieza con un
  ID del proyecto (`<PREFIJO>-M<n> ·` o `<PREFIJO>-M<n>-T<m> ·`). El resto del
  proyecto de Azure DevOps no es territorio de esta skill.
- No borres work items. Una tarea eliminada del Vault se comenta en su work item
  y se transiciona al state que el usuario indique (o al más parecido a
  "descartado" que tenga el proceso) — nunca delete.
- Reporta cada sincronización en una línea ("Azure Boards: SHS-M9-T001 →
  Active"), sin volcar payloads.
