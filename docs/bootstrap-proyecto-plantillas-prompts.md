# Bootstrap de un proyecto SOUTEC desde cero — plantillas de prompts

Secuencia reutilizable para levantar un proyecto nuevo con el harness `souclaude`, el Vault y Jira. Derivada de la puesta en marcha de **Chatbot Spacar** (19-ago-2026), incluidos los tropiezos reales de esa corrida.

Cada fase trae: el prompt para copiar, qué te va a preguntar el agente, qué debe quedar hecho al terminar, y los errores conocidos que hay que esquivar.

---

## Cómo usar este documento

1. Rellena la tabla de variables de abajo.
2. Sustituye los `{{PLACEHOLDER}}` en cada prompt antes de pegarlo.
3. Ejecuta las fases **en orden**. La 3 depende de la 2, y la 6 de la 4 y la 5.
4. No pegues varias fases juntas: cada una tiene puntos de decisión que conviene resolver antes de seguir.

### Variables

| Variable | Qué es | Ejemplo |
|---|---|---|
| `{{REPO}}` | Nombre del repositorio en GitHub | `chatbot-spacar` |
| `{{PROYECTO}}` | Nombre legible del proyecto | `Chatbot Spacar` |
| `{{PREFIJO}}` | Prefijo de 2-4 letras. Nombra `Project-<PREFIJO>/` en el Vault **y** es la clave del proyecto en Jira | `CSC` |
| `{{RUTA_LOCAL}}` | Dónde vive el repo en tu disco. **Fuera de OneDrive** | `C:\Users\tu-usuario\dev\chatbot-spacar` |
| `{{RUTA_VAULT}}` | Dónde clonas el Vault. **Fuera de OneDrive** | `C:\Users\tu-usuario\dev\soubunker-vault` |
| `{{HARNESS_REPO}}` | Repo del harness | `https://github.com/ialvarezsoutec/souclaude-harness` |
| `{{VAULT_REPO}}` | Repo del Vault | `https://github.com/ialvarezsoutec/soubunker-vault` |
| `{{JIRA_SITE}}` | Sitio de Atlassian | `https://dev-soutec.atlassian.net` |

### Prerrequisitos

Verifícalos antes de empezar; si falta alguno, las fases fallan a mitad de camino:

- `gh` instalado y autenticado (`gh auth status`).
- Node **≥ 22.4** (el harness lo exige; su `.nvmrc` pide 24).
- Acceso de escritura al repo del Vault.
- Prefijo acordado y **libre** en `00-System/id-registry.md` del Vault.
- Proyecto creado en Jira con la clave `{{PREFIJO}}` (el agente no lo crea).
- Conector MCP de Atlassian autorizado (`/mcp` en sesión interactiva).

---

## Fase 1 · Repositorio y andamiaje base

```
Crea en GitHub un repositorio para el proyecto que se llame {{REPO}} y encárgate de
la configuración local inicial y del primer commit/push.

El proyecto es: {{PROYECTO}}.

Antes de crear nada, verifica si el repositorio ya existe: si existe y está vacío,
reutilízalo en vez de duplicarlo. Trabaja en {{RUTA_LOCAL}}.
```

**Te va a preguntar:** visibilidad (privado salvo que haya razón para lo contrario) y stack. Si el stack no está decidido, pide un andamiaje genérico: es preferible a condicionar la arquitectura antes de tiempo.

**Debe quedar:** `.gitignore`, `.gitattributes`, `.editorconfig`, `.env.example`, `README.md`, primer commit y push.

> **Ojo — OneDrive.** Si el repo queda dentro de una carpeta sincronizada, OneDrive sincroniza también `.git/` y eso corrompe el índice y genera copias en conflicto. Trabaja fuera del área sincronizada.

---

## Fase 2 · Instalar el harness

```
Quiero instalar el harness de Claude Code de SOUTEC en este proyecto. Vive en
{{HARNESS_REPO}}.

Antes de ejecutar nada:
1. Verifica qué tags y ramas existen realmente. El comando que documenta el README
   puede apuntar a un tag que todavía no está publicado.
2. Corre un --dry-run y muéstrame el plan antes de escribir un solo byte.
3. Si instalas desde una rama en vez de un tag, anota el commit exacto en el mensaje
   del commit: las ramas se mueven y el lockfile no lo registra.

Confírmame desde qué ref vas a instalar antes de hacerlo.
```

**Debe quedar:** `CLAUDE.md`, `.claude/` (settings, skills, hook, lockfile), `.github/` (plantilla de PR y CODEOWNERS), `docs/decisions/`, `progress/`, `notes.md`, y el bloque gestionado añadido al `.gitignore` sin tocar tus líneas.

> **Problema conocido.** El README del harness documenta `npx github:...#v3`, pero ese tag **no existe** (verificado 19-ago-2026, HTTP 422). Los tags publicados llegan a `v2.4.0`; v3.x vive en la rama `dev`. Instala desde `dev` hasta que se publique el tag, y después repunta con `souclaude upgrade`.

---

## Fase 3 · Adoptar el flujo Git (la fase que se olvida)

El harness no es solo archivos: trae reglas que cambian cómo se trabaja **desde ese momento**, incluso sobre lo que ya hiciste. Ejecútala antes de commitear la fase 2.

```
Ya instalaste el harness, así que ahora rige la skill soutec-github. Léela completa y
reencuadra el trabajo según esas reglas antes de commitear:

1. Crea la rama dev si no existe. main solo recibe merges desde dev.
2. Mueve el trabajo del harness a una rama propia nacida de dev, con PR contra dev.
3. Revisa si algo que ya escribiste (README incluido) contradice la guía y corrígelo
   en el mismo cambio.
4. Corre /security-review antes de abrir el PR y documenta los hallazgos.
5. Completa la plantilla de PR de verdad: las casillas que no apliquen se dejan sin
   marcar y explicadas, y las secciones que no apliquen se omiten enteras.

No mergees el PR: dime cuándo está listo.
```

**Debe quedar:** ramas `main` y `dev` en remoto, rama de trabajo con PR abierto contra `dev`, plantilla completada y security review documentado.

> **Por qué importa.** En la corrida original el primer commit fue directo a `main` y el README afirmaba que las ramas entraban a `main` por PR — las dos cosas contra la guía. Se detectó justo aquí. Sin esta fase, el proyecto arranca con el método equivocado y se propaga.

---

## Fase 4 · Conectar el Vault y dar de alta el proyecto

```
Conecta el Vault a este proyecto y da de alta Project-{{PREFIJO}}.

1. Clona {{VAULT_REPO}} en {{RUTA_VAULT}} (fuera de OneDrive) y conéctalo con
   souclaude upgrade --vault-path.
2. Verifica que el prefijo {{PREFIJO}} esté registrado en 00-System/id-registry.md.
   Si no lo está, agrégalo — solo agregar filas, nunca editar las ajenas.
3. Crea Project-{{PREFIJO}}/ con milestones.md, kanban.md, sessions.md y plans/,
   replicando el formato real de un proyecto existente del Vault, no el de la
   documentación.
4. Comprueba que el hook de SessionStart lee el tablero. Si no lo encuentra,
   arréglalo.
5. Pushea directo a main del Vault: ese repo no usa PR.

Los tableros nacen vacíos: no inventes milestones.
```

**Debe quedar:** el hook imprimiendo el tablero de `Project-{{PREFIJO}}` al arrancar.

> **Problema conocido.** `souclaude upgrade --vault-path` escribe solo `path` y `repo` en `.claude/vault.local.json`. Falta `project`, y el hook únicamente autodetecta la carpeta cuando el Vault tiene **un solo** `Project-*`. Con dos o más queda ciego y **no da error**. Añádelo a mano:
>
> ```json
> {
>   "path": "{{RUTA_VAULT}}",
>   "repo": "{{VAULT_REPO}}",
>   "project": "Project-{{PREFIJO}}"
> }
> ```
>
> Ese archivo está ignorado a propósito: la ruta es de cada máquina, así que **cada integrante repite este paso en la suya**.

---

## Fase 5 · Configurar el espejo en Jira

```
Configura el proyecto Jira destino de este repositorio.

- Sitio: {{JIRA_SITE}}, proyecto {{PREFIJO}} (la convención es projectKey = prefijo
  del Vault).
- Actualiza .claude/jira.json y verifica que el conector MCP de Atlassian responde y
  que el proyecto existe.
- El cambio va por rama y PR contra dev, con /security-review previo.
```

**Debe quedar:** `.claude/jira.json` sin placeholders y el conector verificado.

> **Dos cosas que el agente no puede hacer por ti:** autorizar el conector MCP (es OAuth, requiere `/mcp` en sesión interactiva) y crear el proyecto en Jira. La skill `jira-sync` sincroniza issues *dentro de* un proyecto existente.
>
> Si el conector no está autorizado, no bloquea: el trabajo local y el Vault siguen, y el espejo pendiente queda anotado en `notes.md`.

---

## Fase 6 · Primer milestone

```
Crea el primer milestone del proyecto: definir los milestones del proyecto.

Declara sobre qué milestone vas a trabajar antes de tocar nada. El milestone va a En
curso con su plan en plans/ y sus tareas en el kanban — un milestone En curso sin plan
es una inconsistencia que la propia skill vault-milestones marca.

Las tareas salen de las decisiones pendientes reales del proyecto, no de suposiciones.
Sincroniza con Jira en el mismo flujo: Vault primero, Jira inmediatamente después, y
verifica idempotencia antes de crear issues. Cierra con la línea de sesión en
sessions.md.
```

**Debe quedar:** milestone `{{PREFIJO}}-M1` En curso con plan `P1` y tareas `{{PREFIJO}}-M1-T00n`; los issues correspondientes en Jira con la etiqueta del milestone; y la línea de sesión registrada.

> **Cómo se ve el milestone en Jira.** Desde SHS-M7-T005, cada milestone tiene su **tarjeta madre**: un issue propio (labels `<PREFIJO>-M<n>` + `milestone`) con la descripción del milestone, y sus tareas vinculadas con "relates to". Un milestone sin tareas igualmente aparece en Jira como su tarjeta madre en To Do.

---

## Prompts auxiliares

**Aprobar un merge** (el autor no mergea; esto lo dice el coordinador):

```
Mergea el PR #{{N}} con squash & merge. Asegúrate de que el commit resultante conserve
el cuerpo del mensaje: el squash genera un commit nuevo.
```

**Corregir un PR ya abierto:**

```
Aplica estas correcciones al PR #{{N}} y pushea a la misma rama — nunca abras un PR
nuevo, rompe la trazabilidad: {{CORRECCIONES}}
```

**Auditar el tablero:**

```
Analiza el tablero de Project-{{PREFIJO}} en el Vault: foto del estado,
inconsistencias y diagnóstico. Repórtalo, no lo ejecutes: propón y yo decido.
```

---

## Verificación final

- [ ] `main` y `dev` existen en remoto; `main` solo recibió merges desde `dev`.
- [ ] `souclaude status` sale con exit code 0.
- [ ] El hook de `SessionStart` imprime el tablero de `Project-{{PREFIJO}}`.
- [ ] `.claude/vault.local.json` tiene el campo `project`.
- [ ] `.claude/jira.json` sin placeholders y conector verificado.
- [ ] Prefijo `{{PREFIJO}}` registrado en `id-registry.md`.
- [ ] Milestone en curso con plan y tareas; issues espejados en Jira.
- [ ] Línea de sesión en `sessions.md`.
- [ ] Nada sensible commiteado (`.env`, claves, tokens).

---

## Lo que no se delega

Decisiones que el agente debe consultar, no resolver solo:

| Decisión | Por qué |
|---|---|
| Visibilidad del repositorio | Público es irreversible en la práctica: queda indexado |
| Prefijo del proyecto | Es para siempre; nombra el Vault y Jira, y no se reutiliza |
| Alcance de cada milestone | El tablero refleja compromisos reales, no suposiciones |
| Merge y aprobación de PR | El autor no mergea ni aprueba lo suyo |
| Autorización del conector MCP | Es OAuth: solo la persona puede |

---

## Problemas abiertos del harness (19-ago-2026)

Cuatro cosas que van a repetirse en cada proyecto hasta que se arreglen en origen:

1. **El tag `v3` no existe.** El comando de instalación del README falla tal cual está escrito. *(Pendiente a propósito: el tag se publica cuando todo esté listo.)*
2. **`upgrade --vault-path` no escribe el campo `project`.** El hook queda ciego en silencio en cuanto el Vault tiene más de un proyecto.
3. **`CODEOWNERS` referencia equipos `@org-soutec/...`**, que solo existen en organizaciones de GitHub. En una cuenta personal nunca resuelven: la aprobación obligatoria **no se aplica y no avisa**. Sumado a la falta de branch protection, la regla de "el coordinador mergea" queda sin respaldo técnico.
4. ~~**El prefijo `SHS` no está en `id-registry.md`**~~ **Resuelto** (20-ago-2026): registrado en el Vault.

Los cuatro tienen la misma raíz en el caso 3: mientras los repositorios vivan en una cuenta personal y no en una organización de GitHub, el gobierno que la metodología describe no puede aplicarse técnicamente.
