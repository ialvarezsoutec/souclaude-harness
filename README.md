# souclaude-harness

**v1.0.0**

CLI para instalar y migrar el harness de Claude Code de SOUTEC (metodología CCEM) en
cualquier repo: uno nuevo, uno legacy de cinco años, o uno que ya tiene una versión
vieja del harness.

```bash
npx github:ialvarezsoutec/souclaude-harness#v1
```

Sin registry, sin `.npmrc`, sin token. Solo hace falta git y Node ≥20.

## Qué instala

```
CLAUDE.md                     contexto del proyecto para Claude
AGENTS.md                     mapa de navegación para agentes de IA
docs/constitution.md          principios no-negociables P1-P10
docs/decisions/               ADRs + su template
specs/                        Spec-Driven Development (templates full y lite)
notes.md                      scratchpad persistente
.claude/
  settings.json               permisos y effort (schema-correcto)
  harness.json                lockfile: versión + hash de cada archivo
  agents/
    orchestrator, spec-author, implementer, reviewer   orquestación multi-agente opcional del flujo SDD
    security-evidence-compiler                    compila evidencia de security review para IT
  skills/
    ccem-core, ccem-sdd, ccem-planner, ccem-research, ccem-stack, ccem-prompting
    spec-new, adr-new, constitution-check, harness-upgrade, soutec-github
    it-security-review, security-report-standard
.gitignore                    bloque gestionado, tus líneas intactas
```

Las skills son **project-local**: se commitean con el repo. Quien clona, las tiene.
No hay instalación global por dev ni por máquina, y el `upgrade` puede mantenerlas al
día proyecto por proyecto.

## Comandos

| | |
|---|---|
| `souclaude init` | Instala. Sirve igual en un repo vacío y en uno con 5 años de código. |
| `souclaude upgrade` | Actualiza a la última versión. Aplica migraciones. |
| `souclaude status` | Solo lectura. Exit 0 = al día · 1 = hay upgrade · 2 = drift. |
| `souclaude adopt` | Para una estructura hecha a mano. **No toca ningún archivo**: solo escribe el lockfile. |

Sin comando, se autodetecta: hay lockfile → `upgrade` · hay estructura previa →
`adopt` · repo limpio → `init`.

Flags que importan: `--dry-run` (imprime el plan, escribe cero bytes), `--yes`,
`--force`, `--prune`, `--no-backup`, `--verbose`.

## La garantía

**Un archivo tuyo nunca se sobrescribe en silencio.**

El motor clasifica cada archivo comparando tres cosas: qué hay en disco, qué dice el
lockfile que había, y qué querría emitir el harness hoy.

| En disco | En el lockfile | ¿Cambió el template? | Qué pasa |
|---|---|---|---|
| no está | no está | — | se crea |
| **está** | **no está** | — | **nunca se pisa** → `.new` al lado |
| está, intacto | está | no | nada |
| está, intacto | está | sí | se actualiza (no pierdes nada: no lo habías tocado) |
| está, **editado por ti** | está | no | se respeta, no se toca |
| está, **editado por ti** | está | sí | **nunca se pisa** → `.new` al lado |
| está | está, ya no en el manifest | — | obsoleto: se ofrece con `--prune` + doble confirmación |

Por eso init, adopción de un repo legacy y migración de versión **son el mismo code
path**. No hay tres flujos: hay una tabla.

Además: backup de todo lo sobrescrito en `.claude/backup-<timestamp>/`, `--prune` exige
tipear `BORRAR`, y `--force` exige tipear `FORCE`. La herramienta obedece la misma
constitución que instala (P5 y P8).

Para los dos archivos que el harness no posee del todo:
- `.gitignore` — solo es dueño de un bloque delimitado. Tus líneas nunca se tocan.
- `.claude/settings.json` — solo **agrega** claves que faltan. Nunca pisa un valor que
  tú escribiste.

## Desarrollo

```bash
npm install
npm test                                    # node:test, sin dependencias de testing
node bin/cli.mjs init --dry-run --yes       # probar sin escribir nada
```

Los tests cubren cada camino de migración con repos temporales reales (incluyendo uno
con un espacio en la ruta, porque los repos de SOUTEC viven bajo OneDrive). Los dos
invariantes que atrapan casi todo: **idempotencia** (correr `init` dos veces no cambia
nada la segunda vez) y **pureza de `--dry-run`** (el árbol queda byte-idéntico).

## Publicar una versión

```bash
git tag v1.0.0 && git tag -f v1
git push origin v1.0.0 && git push -f origin v1
```

La organización usa `#v1` (tag móvil) y recibe los parches sin hacer nada.
