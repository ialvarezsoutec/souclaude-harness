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

El Vault vive en un **repo distinto** al de cada proyecto a propósito: toda la
visibilidad se acumula ahí sin ensuciar los repos de código. Además de la capa ejecutiva,
el Vault recibe el **espejo** de lo que los agentes generan (specs, plans, tasks,
resúmenes de progreso) y un **kanban con estado vivo** por proyecto — todo suma, y el
progreso se visualiza sin abrir el repo (ver §6).

**No es** un repo de código: el código, los diffs, los tests y la evidencia técnica
pesada viven en cada repo, que sigue siendo la **fuente de verdad técnica**. El Vault es
la vista. A **Ninety** sigue subiendo solo el nivel hito (regla de `ccem-planner`).

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
│   ├── Project-State.md                # GENERADO — derivado de GitHub, no editable
│   ├── kanban.md                       # ESTADO VIVO — tablero de tasks (plugin Kanban de Obsidian)
│   ├── specs/                          # espejo de artefactos SDD del repo
│   │   └── <ID-hito>-<slug>/           #   spec.md, plan.md, tasks.md
│   └── progress/                       # espejo de resúmenes de progreso del repo
│       ├── history.md                  #   copia del historial compartido
│       └── <ID-hito>-<slug>_*.md       #   summary, impl_summary, review por spec
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
| `kanban.md` | **Agentes**, en vivo | spec-author crea tarjetas; implementer y reviewer las mueven al cambiar el estado (§6). |
| `specs/` y `progress/` (espejos) | **Agentes**, al cerrar cada artefacto | Copias desde el repo; nunca se editan aquí — se corrige en el repo y se re-espeja. |
| `evidence/` | Humano | Solo evidencia **ejecutiva**; la técnica queda en el repo. |

## 5. Relación Vault ↔ repos de código ↔ Ninety

La frontera es el **hito**: es lo único que existe a ambos lados.

| Nivel | Vive en | Contiene |
|---|---|---|
| Ejecutivo (Ninety) | Ninety | Rocas, hitos, issues ejecutivos, to-dos, scorecard. Vínculo por `[<PREFIJO>]` en el título. **Nunca specs ni tasks.** |
| Estratégico + vista (Vault) | Vault | Rocas + hitos con criterios congelados, registro de IDs, evidencia ejecutiva, **espejos de specs/plans/tasks y progreso, kanban con estado vivo**. |
| Técnico (repo) | Cada repo | **Fuente de verdad**: `specs/<ID-hito>-<slug>/`, `progress/` (current, history, subcarpetas por spec, telemetría del router), ADRs, código, tests, evidencia técnica. |

Recuperar contexto desde cualquier punto: buscar el ID de hito (`REA-H3`) en el Vault da
el compromiso y sus criterios; en GitHub da rama/PR/commits; en el repo, `grep -r REA-H3
specs/` da spec/plan/tasks.

## 6. Espejo de artefactos y estado vivo (kanban)

Todo lo que un agente genera **suma**: además de vivir en el repo, se espeja al Vault
para que el progreso de todos los proyectos se visualice desde un solo lugar.

**Qué se espeja y cuándo** (reglas operativas en el `progress/README.md` de cada repo):

- Al cerrar cada artefacto SDD: `spec.md`, `plan.md`, `tasks.md` →
  `Project-<PREFIJO>/specs/<ID-hito>-<slug>/`.
- Al cerrar cada fase/task: `summary.md`, `impl_summary.md`, `review.md` y `history.md` →
  `Project-<PREFIJO>/progress/`.
- Los espejos **no se editan en el Vault**: se corrige en el repo y se re-espeja.

**Estado vivo — la regla central**: cuando un agente **empieza** a trabajar un task o un
plan, mueve su tarjeta en `Project-<PREFIJO>/kanban.md` **en ese momento**. El tablero
nunca depende de un push final: refleja el ahora. Por eso el Vault es un repo distinto al
del proyecto — la actualización constante de estado no ensucia el historial del repo de
código.

**Formato del kanban** (compatible con el plugin **Kanban de Obsidian** — el Vault se
visualiza como tablero sin ninguna herramienta extra):

```markdown
---
kanban-plugin: board
---

## Backlog

- [ ] TNP-H1-T004 · validar formulario · @pendiente

## En curso

- [ ] TNP-H1-T003 · capturar lead al cierre · @nacho

## En review

- [ ] TNP-H1-T002 · persistencia del ticket · @nacho

## Hecho

- [x] TNP-H1-T001 · esqueleto del dominio · @nacho
```

Una tarjeta = un task (`<ID-hito>-T<nnn> · qué · @quién`). Movimientos: el `spec-author`
crea las tarjetas en Backlog al emitir `tasks.md`; el `implementer` mueve a **En curso**
al tomar el task y a **En review** al cerrarlo; el `reviewer` mueve a **Hecho** con
`APPROVED` o devuelve a **En curso** con `CHANGES_REQUESTED`.

**Cómo llegan los agentes**: cada repo declara `VAULT_PATH` en su `.env` (ruta local al
clon o carpeta del Vault). Si no está definida o no existe, el espejo se omite **sin
bloquear el trabajo** y queda anotado en el `history.md` del repo (`vault_skip`).

## 7. Concurrencia — varias personas, múltiples agentes

- **Recomendado: el Vault como repo git** con la misma regla que los repos de código —
  nada directo a `main`, cambios por PR para lo estratégico. Para el estado vivo
  (kanban, espejos), cada persona/agente escribe **solo las tarjetas y espejos de su
  proyecto y su task** — la partición natural por `Project-<PREFIJO>/` evita conflictos.
- Si es una carpeta compartida (OneDrive/SharePoint/vault de Obsidian sincronizado), la
  convención mínima: `id-registry.md` **solo agrega filas** (nunca editar ajenas), cada
  `roca_*.yaml` tiene **un solo dueño**, los generados no se tocan, y en `kanban.md`
  solo se mueven las tarjetas propias.
- La capa **estratégica** (registro de IDs, rocas) la escriben solo `/rock-plan`,
  `/rock-status` y `/rock-close` operados por el dueño. La capa de **vista** (espejos,
  kanban) la escriben los agentes en vivo (§6). Un agente que necesita un prefijo o un
  ID que no existe, **para y lo pide** — regla dura de `ccem-planner`.

## 8. Qué NO va al Vault

Código, diffs, tests, la telemetría cruda del router (`progress/model-router.jsonl`),
evidencia técnica pesada (logs, capturas), gotchas y patterns del repo. Eso vive
versionado en cada repo, que es la fuente de verdad técnica. La distinción: al Vault van
los **artefactos de conocimiento y estado** (specs, plans, tasks, resúmenes, kanban);
en el repo queda la **materia prima técnica**. Y a Ninety, solo el nivel hito.

## 9. Checklist de creación (primera vez)

1. Crear el repo (o carpeta) `Vault/` con la estructura del §2.
2. Sembrar `00-System/id-registry.md` con los prefijos activos (tabla del §3) y asignar
   dueño a cada uno.
3. Colocar `metodologia-roca.md` y `plantilla_apertura_roca.yaml` en `00-System/`.
4. Crear `Project-<PREFIJO>/` para cada proyecto activo con un `kanban.md` semilla
   (frontmatter `kanban-plugin: board` + columnas Backlog / En curso / En review / Hecho
   vacías). Los YAML nacen en la próxima `/rock-plan`.
5. Si el Vault es un vault de Obsidian: instalar el plugin **Kanban** para visualizar los
   tableros.
6. En cada repo de proyecto: declarar `VAULT_PATH` en el `.env` apuntando al clon local.
7. Si es repo git: proteger `main` para la capa estratégica y dar escritura a dueños de
   roca y agentes (la capa de vista se particiona por proyecto).
8. Anunciar la regla de oro: **sin ID del Vault no hay rama** — todo trabajo empieza con
   un hito que existe aquí.
