---
name: soutec-github
description: Flujo Git/GitHub obligatorio de SOUTEC (Guía Operativa v2.0). Aplicar SIEMPRE antes de crear una rama, commitear, pushear o abrir un Pull Request en un repo de SOUTEC. Cubre nombres de rama tipo/ID-tarea, commits Conventional Commits, la plantilla obligatoria de PR, squash & merge, semver vX.Y.Z y las reglas de secretos.
---

# SOUTEC — Git & GitHub

> *"Primero disciplina, luego automatización. Automatizar el desorden solo produce
> caos más rápido."* — Guía Operativa v2.0

## Reglas inviolables

Estas no se negocian, ni siquiera en un hotfix.

- **Nunca `git push origin main`.** `main` es producción. Nadie trabaja directo sobre
  `main` — tampoco el coordinador ni los administradores.
- **Nunca hacer merge a `main`.** El autor del cambio no mergea. El squash & merge lo
  hace el coordinador o el aprobador suplente.
- **Nunca aprobar un PR.** Nadie aprueba lo suyo.
- **Nunca `git push --force`.** Solo `--force-with-lease`, solo sobre rama propia, y
  solo si se usó rebase. Con la política por defecto (merge) no hay force-push nunca.
- **Nunca commitear secretos**: `.env`, `*.pem`, `*.key`, `*.pfx`, `credentials.json`,
  `secrets.json`, tokens, contraseñas, llaves privadas.
- **Nunca crear una rama sin ID de tarea.** Toda rama nace de una tarea registrada en
  Planner (`PLN-XXX`) o SharePoint (`SP-XXX`). **Si no tienes el ID, pregunta. No lo
  inventes.**
- **Nunca crear repositorios, tags ni releases.** Eso es del coordinador.
- **Un hotfix NO es un bypass.** Aun en máxima criticidad: rama + Pull Request.

## Antes de tocar código

```bash
git checkout main
git pull origin main          # siempre partir de main actualizado
git checkout -b tipo/ID-tarea-descripcion-corta
```

Chequeo previo: ¿hay tarea asignada en Planner/SharePoint? ¿leíste el README?
¿tienes el `.env` local configurado?

## Nombre de rama

```
tipo/ID-tarea-descripcion-corta
```

| Tipo | Uso |
|---|---|
| `feature/` | Nueva funcionalidad |
| `fix/` | Corrección de error no crítico |
| `hotfix/` | Corrección urgente sobre producción |
| `docs/` | Documentación |
| `chore/` | Mantenimiento, dependencias o configuración |
| `refactor/` | Mejora interna sin cambiar comportamiento |
| `experiment/` | Pruebas, POC, IA o laboratorio |

```
feature/PLN-023-login-usuarios
fix/SP-118-error-integracion-odoo
hotfix/PLN-052-correccion-produccion
refactor/PLN-081-mejorar-estructura-api
experiment/PLN-095-prueba-modelo-rag
```

**Prohibidos**: `cambios`, `prueba`, `final`, `final-final`, `arreglo`, o el nombre de
una persona.

## Commits

```
tipo: descripción breve del cambio
```

Sin scope. Sin ID de tarea en el mensaje (el ID va en la rama y en el PR).
Descripciones en español.

| | | |
|---|---|---|
| `feat` | `fix` | `docs` |
| `chore` | `refactor` | `test` |
| `style` | `build` | `ci` |
| `perf` | `revert` | |

```
feat: agregar endpoint de consulta de órdenes
fix: corregir error de autenticación con Odoo
refactor: reorganizar servicio de conexión a BD
```

**Ojo**: no existe el tipo de commit `hotfix`. Un hotfix **se commitea como `fix:`**.

**Prohibidos**: `update`, `fix`, `cosas`, `ya`, `ahora sí`.
*Git tiene memoria; no le demos material para novela de misterio.*

## Sincronizar con main

**Por defecto, merge.** Simple, no reescribe historia, no requiere force-push.

```bash
git fetch origin
git merge origin/main
# resolver conflictos si los hay
git push origin <tu-rama>
```

Rebase es opcional y solo para uso avanzado: nunca sobre rama compartida, y con
`--force-with-lease`. Como el squash & merge descarta el historial granular de la rama
igual, el rebase es esencialmente cosmético.

## Pull Request

Antes de pedir revisión:
- El proyecto corre localmente.
- El flujo afectado está probado.
- No hay `.env` ni credenciales en el commit.
- El README está actualizado si aplica.
- El PR indica la tarea Planner/SharePoint.
- El PR indica si requiere versión/release.

**Completa `.github/pull_request_template.md` de verdad.** Checkboxes tildadas porque
se hizo, no por rellenar. Nada de "N/A" genéricos.

Si piden correcciones: **pushear a la misma rama.** El PR se actualiza solo. Crear un
PR nuevo por cada corrección rompe la trazabilidad y duplica el ruido.

Integración: **squash & merge**, y la hace el coordinador. Para un `refactor/` grande o
una migración, el coordinador puede optar por merge commit y lo registra en el PR.

Después del merge (esto sí lo puedes hacer):
```bash
git checkout main && git pull origin main && git branch -d <tu-rama>
```

## Versionamiento

SemVer con prefijo `v`: `v1.2.3`.

| Cambio | Regla |
|---|---|
| Corrección menor | PATCH · `v1.0.0 → v1.0.1` |
| Funcionalidad compatible | MINOR · `v1.0.1 → v1.1.0` |
| Cambio incompatible | MAJOR · `v1.1.0 → v2.0.0` |

El desarrollador **propone** la versión en el PR. El coordinador **crea** el tag y el
release.

## Secretos

Nunca en el repo. `.env.example` sin valores. Si una credencial se expone por accidente:
**rotarla**, no solo borrar el commit.

## Lo que esta guía NO define

No lo inventes. Si hace falta, pregunta:

- Formato del **título** del PR.
- **Scopes** de commit (`feat(api):`) — el formato es solo `tipo: descripción`.
- **Trailers** de commit (`Co-Authored-By`, `Signed-off-by`).
- `CHANGELOG.md` — el changelog es el `git log` de `main`.
- Ramas `release/*` — no existen.
- `BREAKING CHANGE` / `!` de Conventional Commits.
- Git hooks, `--no-verify`.
- Commits firmados: **no** son obligatorios hoy.
