---
name: spec-new
description: Arranca una feature con Spec-Driven Development. Crea la rama y specs/<ID-slug>/ con spec, plan y tasks desde los templates, y entrevista para llenar la spec. Requiere el ID de la tarjeta de Planner. Usá --lite para la variante comprimida.
argument-hint: <PLN-023> <slug-corto> [--lite]
disable-model-invocation: true
---

# /spec-new

ID de Planner: **$1**
Slug: **$2**
Argumentos: `$ARGUMENTS`

## 1. El ID no es opcional

**Sin ID de tarjeta de Planner no hay rama, no hay spec, no hay trabajo.**

El ID (`PLN-023`, `RAM001`, `PAC005`, `SP-118`…) es el hilo que amarra la tarjeta, la
carpeta de spec, la rama, los commits, el PR, el release y el despliegue. Una rama sin
ID rompe la cadena.

Si `$1` no parece un ID válido (`<PREFIX><NNN>` o `<PREFIX>-<NNN>`): **para y pedilo.
No lo inventes.** Ofrecé crear la tarjeta en Planner primero.

Esto vale también para hotfixes: la urgencia cambia la prioridad, no el procedimiento.

## 2. ¿Aplica SDD?

Lee la skill `ccem-sdd`. Si esto es un bug fix puntual, un ajuste cosmético, un spike o
un script one-off, **decilo y no crees nada**: la ceremonia inútil viola P7. Ofrecé
hacer el trabajo directo.

Si dudas entre completo y `--lite`, pregunta cuánto estima el cambio.

## 3. Crear rama y estructura

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

Prellena solo lo que ya sabes: el ID, el nombre derivado del slug, la fecha, y el owner
(`git config user.name`). Nada más.

Commit inicial: `docs: spec inicial para $1 <descripción>`

## 4. Avisar en Planner

Recuérdale al usuario que mueva la tarjeta a **Doing** y comente:

```
Rama: feature/$1-$2
Spec: specs/$1-$2/
```

## 5. Entrevistar

Empezá por **Goals** y **Non-goals**, en ese orden, y no sigas hasta que estén: son la
parte que decide si la feature sale bien. De a una sección. No llenes la spec entera y
se la muestres al final — eso es justo lo que SDD trata de evitar.

## 6. Checkpoint

Con `spec.md` completa, **para** y pregunta:
*¿un stakeholder no-técnico lee esto y entiende qué se va a construir?*

No avances a `plan.md` sin esa respuesta.

## Reglas

- En la spec **no va tech stack**. Si aparece "usamos Postgres", eso es `plan.md`.
- Hasta que spec, plan y tasks estén listos, la rama **solo admite commits `docs:`**.
  Nada de código todavía.
- Si `specs/$1-$2/` ya existe, **no la pises**. Avisa y pregunta.
- Los non-goals no son opcionales: si un lector puede asumir algo que no está excluido
  explícitamente, la spec está incompleta.
