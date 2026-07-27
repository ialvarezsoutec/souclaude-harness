# Guía del Vault — centro de información multi-proyecto

> Esta guía vive en el repo del harness porque el Vault todavía no es un repo propio. El
> día que lo sea, esta guía **migra allá** y aquí queda solo un puntero. No se distribuye
> a los repos consumidores: el Vault es **uno por organización** (singleton).

## 1. Qué es y qué no es

El Vault es la **memoria ejecutiva** de todos los proyectos: las rocas trimestrales, los
hitos con sus criterios congelados, el registro de prefijos y la evidencia ejecutiva de
los cierres. Es esencial para orquestar múltiples agentes con varias personas trabajando
sobre los mismos repos, porque es la **fuente única** de dos cosas que ningún repo puede
poseer: los prefijos de proyecto y el estado de las rocas.

**No es** un repo de código, ni un tablero de tareas, ni un archivo de specs. El detalle
técnico vive en cada repo (`specs/`, `progress/`, ADRs); a este nivel solo cruza el
**hito** (regla de `ccem-planner`: a Ninety y al Vault sube el nivel hito, nunca specs ni
tasks).

## 2. Estructura de carpetas

```
Vault/
├── 00-System/                          # el sistema — no pertenece a ningún proyecto
│   ├── id-registry.md                  # AUTORIDAD de prefijos (ver §3)
│   ├── metodologia-roca.md             # Metodología de Roca v2.1.0 (copia de referencia)
│   └── templates/
│       └── plantilla_apertura_roca.yaml  # esquema del YAML de apertura de roca
├── Project-<PREFIJO>/                  # una carpeta por proyecto (Project-REA, Project-RAM…)
│   ├── roca_<TRIMESTRE>_<PREFIJO>.yaml   # abre /rock-plan, cierra /rock-close (MISMO archivo)
│   └── Project-State.md                # GENERADO — derivado de GitHub, no editable
└── evidence/
    └── <TRIMESTRE>/                    # evidencia ejecutiva de cierres, por trimestre
```

## 3. Archivos semilla

### `00-System/id-registry.md` — la autoridad de prefijos

Su ausencia **bloquea `/rock-plan`** (el checklist exige que el prefijo exista aquí; no se
inventa). Formato:

```markdown
# Registro de prefijos — fuente única. Un prefijo = un proyecto, para siempre.
# Solo se AGREGAN filas. Nunca edites ni reutilices una fila ajena.

| Prefijo | Proyecto                    | Dueño | Fecha de alta | Estado |
|---------|-----------------------------|-------|---------------|--------|
| RAM     | Ramón                       | [dueño] | [fecha]     | activo |
| REA     | Reachy                      | [dueño] | [fecha]     | activo |
| PAC     | Paco                        | [dueño] | [fecha]     | activo |
| ALF     | Alfred                      | [dueño] | [fecha]     | activo |
| PLN     | Transversal / multi-proyecto | [dueño] | [fecha]     | activo |
| SP      | Origen SharePoint           | [dueño] | [fecha]     | activo |
```

Reglas: un prefijo se pide **antes** de la reunión trimestral, no durante. Los prefijos
son de **proyecto**, no de tarjeta ni de persona. Un proyecto cerrado pasa a estado
`retirado` — su prefijo jamás se reutiliza (los IDs históricos lo referencian).

### `00-System/templates/plantilla_apertura_roca.yaml`

El esquema que `/rock-plan` llena en el Paso 2: identidad (prefijo, trimestre), enunciado
verificable, dueño, hitos con IDs `<PREFIJO>-H<n>` y fechas, criterios de éxito
**congelados desde t=0** con método de verificación, riesgos `<PREFIJO>-R-<nn>` con
mitigación, `descarte_planificado.minimo_irrenunciable`, specs reservados (1-3 por hito,
solo título y slug), y los campos de Ninety vacíos desde el día uno (`ninety_rock_id`,
`ninety_milestone_id`, `ultima_sincronizacion`). Los bloques `[CIERRE]` (estado,
evidencias, desviaciones, lecciones, firma) los llena `/rock-close` en el **mismo
archivo**.

### `00-System/metodologia-roca.md`

Copia de referencia de la Metodología de Roca v2.1.0, para que la doctrina sea legible
sin salir del Vault.

## 4. Quién escribe qué

| Artefacto | Quién | Cómo |
|---|---|---|
| `id-registry.md` | Humano (coordinador) | Agregar filas; jamás editar ajenas. |
| `roca_*.yaml` — apertura | Dueño + agente vía `/rock-plan` | El agente propone; el dueño decide fechas y recortes. |
| `roca_*.yaml` — cierre | Dueño vía `/rock-close` | Contra criterios congelados, con evidencia por criterio. |
| `roca_*.yaml` — campos derivados (`fecha_real`, desviaciones) | **Generado** (`/rock-status`) | Nunca a mano: un derivado escrito a mano es un dato falso. |
| `Project-State.md` | **Generado** (`/rock-status`, semanal) | Derivado de GitHub (ramas/PRs). No editable. |
| `evidence/` | Humano | Solo evidencia **ejecutiva**; la técnica queda en el repo. |

## 5. Relación Vault ↔ repos de código ↔ Ninety

La frontera es el **hito**: es lo único que existe a ambos lados.

| Nivel | Vive en | Contiene |
|---|---|---|
| Ejecutivo (Ninety) | Ninety | Rocas, hitos, issues ejecutivos, to-dos, scorecard. Vínculo por `[<PREFIJO>]` en el título. **Nunca specs ni tasks.** |
| Estratégico (Vault) | Vault | Rocas + hitos con criterios congelados, registro de IDs, evidencia ejecutiva. |
| Técnico (repo) | Cada repo | `specs/<ID-hito>-<slug>/`, `progress/` (current, history, subcarpetas por spec, telemetría del router), ADRs, código, tests, evidencia técnica. |

Recuperar contexto desde cualquier punto: buscar el ID de hito (`REA-H3`) en el Vault da
el compromiso y sus criterios; en GitHub da rama/PR/commits; en el repo, `grep -r REA-H3
specs/` da spec/plan/tasks.

## 6. Concurrencia — varias personas, múltiples agentes

- **Recomendado: el Vault como repo git** con la misma regla que los repos de código —
  nada directo a `main`, cambios por PR. Es la única forma de que dos personas editen
  el registro o dos rocas en paralelo sin pisarse.
- Si es una carpeta compartida (OneDrive/SharePoint), la convención mínima:
  `id-registry.md` **solo agrega filas** (nunca editar ajenas), cada `roca_*.yaml` tiene
  **un solo dueño** que la edita, y los archivos generados no se tocan.
- Los agentes de los repos **leen** el Vault (el ID de hito, los criterios) pero **no lo
  escriben**: la escritura pasa por `/rock-plan`, `/rock-status` y `/rock-close`
  operados por el dueño. Un agente que necesita un prefijo o un ID que no existe, **para
  y lo pide** — regla dura de `ccem-planner`.

## 7. Qué NO va al Vault

Specs, plans, tasks, código, diffs, tests, la telemetría del router
(`progress/model-router.jsonl`), evidencia técnica (logs, capturas de tests), gotchas y
patterns. Todo eso vive versionado en cada repo. Si algo de nivel técnico parece
necesitar visibilidad ejecutiva, la respuesta es resumirlo **en el hito**, no subir el
artefacto.

## 8. Checklist de creación (primera vez)

1. Crear el repo (o carpeta) `Vault/` con la estructura del §2.
2. Sembrar `00-System/id-registry.md` con los prefijos activos (tabla del §3) y asignar
   dueño a cada uno.
3. Colocar `metodologia-roca.md` y `plantilla_apertura_roca.yaml` en `00-System/`.
4. Crear `Project-<PREFIJO>/` para cada proyecto activo (vacías: los YAML nacen en la
   próxima `/rock-plan`).
5. Si es repo git: proteger `main`, exigir PR, y dar acceso de lectura a todo el equipo
   y escritura a los dueños de roca.
6. Anunciar la regla de oro: **sin ID del Vault no hay rama** — todo trabajo empieza con
   un hito que existe aquí.
