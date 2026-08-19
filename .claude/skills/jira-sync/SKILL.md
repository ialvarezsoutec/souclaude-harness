---
name: jira-sync
description: Sincroniza el tablero del Vault con Jira vía el conector MCP de Atlassian - cada milestone es una tarjeta madre (issue propio con su descripción) y cada tarea del kanban es un issue propio etiquetado con su milestone y vinculado a la tarjeta madre con "relates to"; se crea o transiciona en el momento en que la tarjeta se mueve. Actívate SIEMPRE que muevas una tarjeta del kanban del Vault (alta, En curso, En review, Hecho), al dar de alta, tomar o cerrar un milestone, o cuando el usuario pida sincronizar, ver o actualizar el estado del proyecto en Jira.
---

# jira-sync — el Vault espejado en Jira

El Vault es la fuente de verdad del progreso; Jira es su **espejo para la
organización**. Esta skill mantiene ese espejo: **cada movimiento de tarjeta en el
Vault se refleja en Jira en el mismo momento**, sin que el usuario lo pida — igual
que el push inmediato al Vault.

## Configuración

1. **Conector**: el harness distribuye `.mcp.json` con el servidor MCP oficial de
   Atlassian. Cada usuario lo autoriza **una vez** (`/mcp` → autenticar Atlassian).
2. **Destino**: `.claude/jira.json` (commiteado, no es secreto) define el proyecto:

```json
{
  "url": "https://<org>.atlassian.net",
  "projectKey": "<CLAVE>"
}
```

**Convención SOUTEC**: cada proyecto del Vault tiene su **propio proyecto en
Jira**, y la clave (`projectKey`) es el **PREFIJO** del proyecto en el Vault
(`Project-SHS` → proyecto Jira `SHS`). Si `.claude/jira.json` tiene otra cosa,
manda el archivo.

**Degradación — nunca bloquees el trabajo local por Jira**: si el conector no está
autorizado, `.claude/jira.json` no existe o todavía tiene placeholders, **dilo una
vez, sugiere el paso que falta y sigue** con el trabajo local y el Vault. El espejo
pendiente se anota en `notes.md` para la próxima sesión con conector.

## Mapeo Vault → Jira

Sin Epics: el flujo en Jira queda libre a propósito. Hay **dos clases de issue**,
ambas type Task, y la relación entre ellas va por **etiquetas y vínculos**:

**La tarjeta madre (milestone)** — cada milestone de `milestones.md` es un issue
propio, para que el backlog de Jira muestre todo lo que hay por delante y no solo
las tareas ya desglosadas:

| Vault | Jira |
|---|---|
| Milestone (`<PREFIJO>-M<n>`) | Un **issue** (type Task) propio |
| Summary del issue | `<PREFIJO>-M<n> · <título del milestone>` |
| Description del issue | La descripción del milestone en `milestones.md` |
| Labels | `<PREFIJO>-M<n>` **y** `milestone` (esta última identifica a las tarjetas madre como grupo) |
| Sus tareas | Vínculo **"relates to"** hacia cada issue de tarea del milestone |
| Columna en `milestones.md` (Backlog / En curso / Hecho) | Status **To Do** / **In Progress** / **Done** |

**La tarea del kanban** — igual que siempre:

| Vault | Jira |
|---|---|
| Tarea del kanban (`<PREFIJO>-M<n>-T<m>`) | Un **issue** (type Task) propio |
| Milestone de la tarea | **Label** `<PREFIJO>-M<n>` en el issue + vínculo "relates to" con su tarjeta madre |
| Summary del issue | `<PREFIJO>-M<n>-T<m> · <descripción de la tarjeta>` |
| Columna Backlog | Status **To Do** |
| Columna En curso | Status **In Progress** |
| Columna En review | Status **In Review** (si el proyecto no lo tiene: In Progress) |
| Columna Hecho | Status **Done** |
| Dueño de la tarjeta (`@quién`) | Assignee, si se puede resolver; si no, se omite |

Los estados son **independientes**: mover una tarea nunca mueve la tarjeta madre,
y viceversa. La tarjeta madre espeja la columna del **milestone** en
`milestones.md`; las tareas espejan su columna en `kanban.md`.

El **ID en el summary es la clave de idempotencia** — para las dos clases: antes
de crear, busca en el proyecto un issue cuyo summary empiece con ese ID
(`<PREFIJO>-M<n> ·` para milestones, `<PREFIJO>-M<n>-T<m> ·` para tareas — el `·`
tras el ID evita que `M1` matchee `M11`). Si existe, se actualiza/transiciona; si
no, se crea. **Nunca dupliques** issues.

## Herramientas del conector

Las que importan del servidor MCP de Atlassian (búscalas con ToolSearch si están
diferidas): `searchJiraIssuesUsingJql` (idempotencia: `project = <CLAVE> AND
summary ~ "<ID-tarea>"`), `createJiraIssue`, `editJiraIssue` (labels),
`getTransitionsForJiraIssue` + `transitionJiraIssue` (estados),
`createIssueLink` (type `Relates`, para atar tareas a su tarjeta madre),
`addCommentToJiraIssue`, `lookupJiraAccountId` (assignee por email). El conector
no permite borrar issues — coherente con la regla de nunca borrar.

## Cuándo sincronizar

En el mismo flujo en que tocas el Vault — el orden es siempre Vault primero
(fuente de verdad), Jira inmediatamente después:

- **Alta de tarea** en el kanban → crear el issue en To Do con su label **y el
  vínculo "relates to" hacia su tarjeta madre** (si la tarjeta madre no existe,
  créala primero).
- **Tomar una tarea** (→ En curso) → transicionar a In Progress (crear si falta).
- **Tarea a En review / Hecho** → transicionar al status correspondiente.
- **Milestone nuevo** → crear su tarjeta madre en To Do, con la descripción del
  milestone y las labels `<PREFIJO>-M<n>` + `milestone`.
- **Milestone a En curso** → transicionar su tarjeta madre a In Progress.
- **Milestone a Hecho** → verificar que todos sus issues de tarea (label del
  milestone) estén en Done; si alguno no lo está, repórtalo antes de cerrar. Si
  está todo cerrado, transicionar la tarjeta madre a Done.

## Reglas

- **Jira nunca es la fuente**: no muevas tarjetas del Vault para "igualar" Jira.
  Si detectas divergencia (alguien movió el issue en Jira), repórtala al usuario y
  deja que él decida — el Vault manda.
- **No toques issues ajenos**: solo los issues cuyo summary empieza con un ID del
  proyecto (`<PREFIJO>-M<n> ·` o `<PREFIJO>-M<n>-T<m> ·`). El resto del proyecto
  Jira no es territorio de esta skill.
- No borres issues. Una tarea eliminada del Vault se comenta en su issue y se
  transiciona a Done (o al status que el usuario indique) — nunca delete.
- Reporta cada sincronización en una línea ("Jira: SHS-M9-T001 → In Progress"),
  sin volcar payloads.
