---
name: jira-sync
description: Sincroniza el tablero del Vault con Jira vía el conector MCP de Atlassian - cada tarea del kanban es un issue propio en Jira, etiquetado con su milestone, y se crea o transiciona en el momento en que la tarjeta se mueve. Actívate SIEMPRE que muevas una tarjeta del kanban del Vault (alta, En curso, En review, Hecho), al dar de alta o cerrar un milestone, o cuando el usuario pida sincronizar, ver o actualizar el estado del proyecto en Jira.
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

**Degradación — nunca bloquees el trabajo local por Jira**: si el conector no está
autorizado, `.claude/jira.json` no existe o todavía tiene placeholders, **dilo una
vez, sugiere el paso que falta y sigue** con el trabajo local y el Vault. El espejo
pendiente se anota en `notes.md` para la próxima sesión con conector.

## Mapeo Vault → Jira

Sin Epics: el flujo en Jira queda libre a propósito. La relación con el milestone
va por **etiquetas**.

| Vault | Jira |
|---|---|
| Tarea del kanban (`<PREFIJO>-M<n>-T<m>`) | Un **issue** (type Task) propio |
| Milestone de la tarea | **Label** `<PREFIJO>-M<n>` en el issue |
| Summary del issue | `<PREFIJO>-M<n>-T<m> · <descripción de la tarjeta>` |
| Columna Backlog | Status **To Do** |
| Columna En curso | Status **In Progress** |
| Columna En review | Status **In Review** (si el proyecto no lo tiene: In Progress) |
| Columna Hecho | Status **Done** |
| Dueño de la tarjeta (`@quién`) | Assignee, si se puede resolver; si no, se omite |

El **ID de la tarea en el summary es la clave de idempotencia**: antes de crear,
busca en el proyecto un issue cuyo summary empiece con ese ID. Si existe, se
actualiza/transiciona; si no, se crea. **Nunca dupliques** issues de una tarea.

## Herramientas del conector

Las que importan del servidor MCP de Atlassian (búscalas con ToolSearch si están
diferidas): `searchJiraIssuesUsingJql` (idempotencia: `project = <CLAVE> AND
summary ~ "<ID-tarea>"`), `createJiraIssue`, `editJiraIssue` (labels),
`getTransitionsForJiraIssue` + `transitionJiraIssue` (estados),
`addCommentToJiraIssue`, `lookupJiraAccountId` (assignee por email). El conector
no permite borrar issues — coherente con la regla de nunca borrar.

## Cuándo sincronizar

En el mismo flujo en que tocas el Vault — el orden es siempre Vault primero
(fuente de verdad), Jira inmediatamente después:

- **Alta de tarea** en el kanban → crear el issue en To Do con su label.
- **Tomar una tarea** (→ En curso) → transicionar a In Progress (crear si falta).
- **Tarea a En review / Hecho** → transicionar al status correspondiente.
- **Milestone nuevo** → no crea issue: el milestone existe en Jira solo como
  etiqueta de sus tareas.
- **Milestone a Hecho** → verificar que todos sus issues (label del milestone)
  estén en Done; si alguno no lo está, repórtalo antes de cerrar.

## Reglas

- **Jira nunca es la fuente**: no muevas tarjetas del Vault para "igualar" Jira.
  Si detectas divergencia (alguien movió el issue en Jira), repórtala al usuario y
  deja que él decida — el Vault manda.
- **No toques issues ajenos**: solo los issues cuyo summary empieza con un ID de
  tarea del proyecto (`<PREFIJO>-M<n>-T<m>`). El resto del proyecto Jira no es
  territorio de esta skill.
- No borres issues. Una tarea eliminada del Vault se comenta en su issue y se
  transiciona a Done (o al status que el usuario indique) — nunca delete.
- Reporta cada sincronización en una línea ("Jira: SHS-M9-T001 → In Progress"),
  sin volcar payloads.
