---
name: spec-new
description: Arranca una feature con Spec-Driven Development. Crea la rama y specs/<ID-hito>-<slug>/ con spec, plan y tasks desde los templates, y entrevista para llenar la spec. Requiere el ID del hito y sus criterios de aceptación congelados. Usa --lite para la variante comprimida.
argument-hint: <REA-H3> <slug-corto> [--lite]
disable-model-invocation: true
---

# /spec-new

ID de hito: **$1**
Slug: **$2**
Argumentos: `$ARGUMENTS`

## 1. El ID no es opcional

**Sin ID de hito no hay rama, no hay spec, no hay trabajo.**

El ID (`REA-H3`, `PAC-H2`, `PLN-H1`…) es el hilo que amarra el hito, la carpeta de spec, la
rama, los commits, el PR, el release y el despliegue. Una rama sin ID rompe la cadena. **El
emisor es el hito, definido en el Paso 2 de la roca (`/rock-plan`). Planner no se usa.**

Si `$1` no parece un ID de hito válido (`<PREFIJO>-H<n>`): **para y pídelo. No lo inventes.**
Si el hito todavía no existe, se define primero en el plan de la roca.

Esto vale también para hotfixes: la urgencia cambia la prioridad, no el procedimiento.

## 2. Contrato de entrada hito → spec

CCEM arranca asumiendo que el trabajo ya tiene identificador y alcance. Este comando necesita,
además del ID, lo que el hito ya congeló en el Paso 2. Si esta entrada no está, `/spec-new`
produce un spec plausible sobre un alcance inventado (mismo fallo que `ccem-core` P1, un nivel
más arriba). **Pídela antes de escribir la spec:**

- **ID del hito** (`<PREFIJO>-H<n>`).
- **Criterios de aceptación heredados del hito** — congelados en t=0. Son la semilla de los
  success criteria del `spec.md`.
- **No-alcance del hito** — lo que el hito excluye explícitamente.
- **Entregable esperado y su ruta.**
- **Plan de rollback**, si el trabajo toca algo en ejecución.

Si falta el criterio de aceptación o el no-alcance, **para como `blocked`** y pídelos. No
inventes requisitos que el hito no soporta (Anti-Hack, `ccem-prompting`).

## 3. ¿Aplica SDD?

Lee la skill `ccem-sdd`. Si esto es un bug fix puntual, un ajuste cosmético, un spike o un
script one-off, **dilo y no crees nada**: la ceremonia inútil viola P9. Ofrece hacer el
trabajo directo.

Si dudas entre completo y `--lite`, pregunta cuánto estima el cambio.

## 4. Crear rama y estructura

El **mismo slug** va en la rama y en la carpeta. No son dos slugs distintos.

```bash
git checkout main && git pull origin main
git checkout -b feature/$1-$2          # o fix/ · hotfix/ · refactor/ … según el tipo

mkdir -p specs/$1-$2
```

Copia desde `specs/_templates/`:

| Perfil | Archivos |
|---|---|
| completo | `spec.md`, `plan.md`, `tasks.md` |
| `--lite` | `spec-lite.md`, `plan-lite.md`, `tasks-lite.md` |

Prellena solo lo que ya sabes: el ID, el nombre derivado del slug, la fecha, el owner
(`git config user.name`), y los criterios de aceptación heredados del hito como semilla de los
success criteria. Nada más.

Commit inicial: `docs: spec inicial para $1 <descripción>`

**Un hito puede producir varios specs**, todos con el mismo ID; el slug los distingue. El
criterio: una carpeta de spec = una rama = un PR.

## 5. Entrevistar

Empieza por **Goals** y **Non-goals**, en ese orden, y no sigas hasta que estén: son la parte
que decide si la feature sale bien. Los Goals nacen de los criterios de aceptación del hito; los
Non-goals, de su no-alcance. De a una sección. No llenes la spec entera y se la muestres al
final — eso es justo lo que SDD trata de evitar.

## 6. Checkpoint

Con `spec.md` completa, **para** y pregunta:
*¿un stakeholder no-técnico lee esto y entiende qué se va a construir?*

No avances a `plan.md` sin esa respuesta.

## Reglas

- En la spec **no va tech stack**. Si aparece "usamos Postgres", eso es `plan.md`.
- Hasta que spec, plan y tasks estén listos, la rama **solo admite commits `docs:`**. Nada de
  código todavía.
- Si `specs/$1-$2/` ya existe, **no la pises**. Avisa y pregunta.
- Los non-goals no son opcionales: si un lector puede asumir algo que no está excluido
  explícitamente, la spec está incompleta.
