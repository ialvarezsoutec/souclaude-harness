# Guía del desarrollador — cómo trabajamos en SOUTEC

Bienvenido. Esta guía te dice **cómo desarrollar** en un repo de SOUTEC: el método (CCEM),
el flujo con Git y Planner, y las herramientas que Claude Code ya tiene instaladas para
ayudarte. Si la sigues, tu código entra sin fricción y queda trazable.

Léela una vez entera. Después la usas de referencia.

---

## En una frase

**Planner ordena el QUÉ. CCEM diseña el CÓMO técnico. Git/GitHub registra el HECHO. El ID
de la tarjeta de Planner es el hilo que amarra los tres.**

---

## Día 1 — setup

1. Ten **git** y **Node ≥ 20** instalados.
2. Cloná el repo en el que vas a trabajar. Si ya tiene una carpeta `.claude/` y un
   `CLAUDE.md`, **ya tiene el harness**: no hace falta nada más.
3. Si arrancas un repo desde cero (o uno viejo sin harness), instálalo:
   ```bash
   npx github:ialvarezsoutec/souclaude-harness#v1
   ```
   Corre igual en un repo vacío y en uno con años de código: en el legacy solo agrega la
   superficie de Claude, no toca tu código.
4. Abrí el repo con Claude Code. Lo primero que Claude lee es `CLAUDE.md` y
   `docs/constitution.md`.

---

## Las reglas de oro

Estas no se negocian. Si te acuerdas solo de esto, ya evitas el 90% de los problemas.

1. **Nunca commit, push ni merge directo a `main`.** Todo pasa por rama + Pull Request.
   Los hotfixes también.
2. **Toda rama nace de una tarjeta de Planner.** Sin ID (`PLN-023`, `RAM001`, `SP-118`…)
   no hay rama. Si no lo tienes, pídelo o crea la tarjeta — no lo inventes.
3. **P9 — Simplicity First.** El mínimo código que resuelve el problema. Nada
   especulativo. Si escribiste 200 líneas y podían ser 50, reescribe.
4. **P10 — Surgical Changes.** Cada línea que cambias traza al pedido. Nada de "ya que
   estoy, mejoro esto otro".
5. **P2 — el dominio no importa frameworks.** `adapters → application → domain`, nunca al
   revés. El enforcement corre en CI y bloquea el merge.
6. **Secretos jamás en el repo.** Ni `.env`, ni claves, ni tokens.

---

## Tu flujo diario

El ciclo completo tiene 8 fases; a ti te tocan estas. Claude te acompaña en cada paso con
las skills y comandos de abajo.

```
1. Tomas una tarjeta de Planner  ──►  tienes el ID (ej. PLN-023)
2. Creas la rama                 ──►  feature/PLN-023-login-usuarios
3. /spec-new PLN-023 login-usuarios
      ├─ spec.md   (QUÉ y POR QUÉ, sin tech stack)      ← checkpoint humano
      ├─ plan.md   (CÓMO técnico, con stack + ADRs)      ← checkpoint humano
      └─ tasks.md  (tasks de 15-30 min, un commit c/u)   ← checkpoint humano
4. Implementas task por task, esperando tu OK entre uno y otro
5. Abrís el PR draft tras 2-3 commits (no al final)
6. El coordinador revisa y hace el squash & merge
7. Se despliega y se registra
8. La tarjeta pasa a Done con todo su trail
```

**Hasta que spec, plan y tasks estén listos, la rama solo admite commits `docs:`.** No se
escribe código antes del plan.

### Cuándo usar SDD (y cuándo no)

| Usá SDD | Saltá SDD |
|---|---|
| Feature nueva, refactor de +3 archivos, migración, cambio de contrato, +2 días | Bug fix puntual, ajuste cosmético, spike, script one-off, hotfix (ADR después) |

Para un cambio mediano (4-8 h), usá la versión comprimida: `/spec-new PLN-023 slug --lite`.
Mismos checkpoints, menos ceremonia (~45 min vs 2-3 h).

Si el trabajo cae en la columna "saltá SDD", **dilo y hazlo directo**. Ceremonia que no
sirve viola P9.

---

## Las herramientas que ya tienes

Viven en `.claude/skills/`, versionadas con el repo. No hay que instalar nada.

### Comandos (los invocas con `/`)

| Comando | Qué hace |
|---|---|
| `/spec-new <ID> <slug>` | Arma la rama y `specs/<ID>-<slug>/` con spec, plan y tasks. `--lite` para la versión corta. |
| `/adr-new <título>` | Registra una decisión arquitectónica en `docs/decisions/`. |
| `/constitution-check` | Audita tu diff actual contra P1-P10 y te marca las violaciones. Córrelo antes del PR. |
| `/harness-upgrade` | Actualiza el harness del repo a la última versión. |

### Skills (se activan solas cuando el contexto lo amerita)

- `ccem-core` — los 6 principios y cómo elegir el modelo.
- `ccem-sdd` — el flujo Spec-Driven Development.
- `ccem-planner` — la trazabilidad Planner ↔ specs ↔ Git.
- `ccem-research` — cómo evaluar una herramienta antes de sumarla.
- `ccem-stack` — cómo documentar las convenciones del proyecto.
- `ccem-prompting` — cómo pedirle trabajo a un agente sin que "haga trampa".
- `soutec-github` — el flujo Git/GitHub obligatorio.

---

## Dónde va cada cosa

| Qué | Dónde |
|---|---|
| Requisitos de una feature | `specs/<ID>-<slug>/` |
| Principios del proyecto | `docs/constitution.md` |
| Decisión arquitectónica con trade-off | `docs/decisions/` (`/adr-new`) |
| Gotcha que te costó más de 1 h | `docs/gotchas/` |
| Pattern que ya viste 3+ veces | `docs/patterns/` |
| Learning del día, nota suelta | `notes.md` |
| Contexto para Claude | `CLAUDE.md` (<200 líneas) |

Regla mental: si es algo que Claude necesita saber **antes** de empezar → `CLAUDE.md`. Si
es la historia de una decisión → ADR. Si es un gotcha de ayer → `notes.md`.

---

## Git — referencia rápida

```bash
# 1. Partí de main actualizado y ramificá (con el ID de Planner)
git checkout main && git pull origin main
git checkout -b feature/PLN-023-login-usuarios

# 2. Commits: tipo: descripción breve (en español, sin scope)
git commit -m "feat: agregar validación de token expirado"
#   tipos: feat fix docs chore refactor test style build ci perf revert
#   un hotfix se commitea como fix:

# 3. Sincronizar con main (merge, NO rebase por defecto)
git fetch origin && git merge origin/main

# 4. Abrir el PR (completa la plantilla de verdad)
git push origin feature/PLN-023-login-usuarios
```

- **Nunca `git push --force`.** El squash & merge lo hace el coordinador, no tú.
- Tú **no** apruebas PRs, no creas tags/releases, no creas repositorios.
- Si te piden correcciones: push a la **misma** rama. Nunca abras un PR nuevo.

El detalle completo (nombres de rama, tipos de commit, plantilla de PR, semver) está en la
skill `soutec-github`. Pregúntale a Claude "revisa mi cambio con soutec-github".

---

## Manten el harness al día

De vez en cuando salen versiones nuevas (skills mejores, reglas nuevas). Para actualizar:

```
/harness-upgrade
```

o directo:

```bash
npx github:ialvarezsoutec/souclaude-harness#v1 upgrade --dry-run   # ver qué cambiaría
npx github:ialvarezsoutec/souclaude-harness#v1 upgrade              # aplicarlo
```

**Nunca te va a pisar un archivo que editaste tú.** Si un archivo tuyo difiere del nuevo,
la propuesta queda al lado como `<archivo>.new` y tú decides qué incorporar:

```bash
git diff --no-index CLAUDE.md CLAUDE.md.new
```

---

## Los errores que más se cometen

1. **Codear antes de tener spec/plan/tasks.** Hasta ahí, solo commits `docs:`.
2. **Rama sin ID de Planner** (`arreglo`, `prueba-final`, `mi-feature`). Rompe la cadena.
3. **Meter el stack en la spec.** "Usamos Postgres" va en `plan.md`, no en `spec.md`.
4. **Importar un framework desde `domain/`.** Rompe P2; el CI te lo va a rechazar.
5. **Scope creep.** Tocaste un archivo que no traza a la tarjeta → sácalo (P10).
6. **PR sin la plantilla completa**, o abrir un PR nuevo por cada corrección.
7. **Mover la tarjeta a Done sin el registro de despliegue.**

Si una tarjeta, rama o release no tiene el ID de Planner asociado, **la cadena está rota y
hay que repararla antes de seguir.**
