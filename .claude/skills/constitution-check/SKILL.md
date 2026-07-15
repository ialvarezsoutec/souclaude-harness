---
name: constitution-check
description: Audita el diff actual contra los principios P1-P10 de docs/constitution.md y reporta violaciones concretas, con archivo y línea. Úsalo antes de abrir un PR, o cuando un cambio se está poniendo más grande de lo que debería.
allowed-tools: Read, Grep, Glob, Bash(git diff:*), Bash(git status:*), Bash(git log:*)
---

# /constitution-check

Esto es lo que hace que la constitución sea ejecutable en vez de decorativa.

## Input

Constitución del proyecto:
@docs/constitution.md

Diff actual (staged + unstaged, contra el merge-base con la rama principal):

```!
git --no-pager diff --stat HEAD
git --no-pager diff HEAD
```

## Qué hacer

Auditá el diff contra **cada** principio P1-P10. Leelos del archivo — no asumas qué
dicen, porque P7 y P8 son específicos de este proyecto.

Para cada uno, un veredicto: **cumple**, **viola**, o **no aplica**. Cuando digas
"viola", tienes que poder señalar archivo y línea. Un "podría violar P3" sin evidencia no
sirve: si no lo puedes señalar, es "cumple".

Los tres que un diff viola sin querer:

**P2 — Hexagonal.** El más grave, porque rompe la arquitectura en silencio:
- Un import de framework, ORM o SDK de proveedor dentro de `domain/` o `application/`.
  Revisa cada import nuevo en esas carpetas.
- Lógica de negocio que se coló en un adaptador o en `infrastructure/`.
- Un puerto nuevo **sin segundo adaptador ni fake** que lo justifique (eso es P1 + P9).
- **Cambios a la config del enforcement.** Si el diff toca el archivo del enforcer,
  pregunta por qué: modificarlo para que un check pase es hacer trampa, y es un
  hallazgo bloqueante.

**P9 — Simplicity First.** Buscá:
- Abstracciones para código de un solo uso: interfaces con una sola implementación,
  factories que fabrican una cosa, capas que solo delegan.
- Configurabilidad que nadie pidió y nadie usa.
- Error handling para escenarios imposibles.
- Ramas de código inalcanzables desde el minuto cero.

**P10 — Surgical Changes.** Buscá:
- Archivos tocados que **no trazan a ningún requisito**. Es el hallazgo más valioso: por
  cada archivo del diff, pregúntate por qué está ahí. Si no lo puedes contestar en una
  frase, es scope creep.
- Reformateos, renames y "mejoras" de código adyacente que nadie pidió.
- Clases movidas entre capas "para reorganizar".
- Dead code preexistente **borrado** (no corresponde: se menciona, no se borra).
- Imports o variables que **este** cambio dejó huérfanos y no se limpiaron (esto sí
  corresponde limpiarlo).

## Output

```
P1 [nombre] — cumple / viola / no aplica
    └─ archivo.ts:42 — [qué exactamente, en una línea]
...
```

Cerrá con:
- **Veredicto**: ¿se puede abrir el PR?
- **Bloqueantes**: las violaciones que hay que arreglar sí o sí, en orden.
- **Sugerencias aparte**: lo que mejorarías pero **nadie pidió** — explícitamente
  fuera de este cambio. Mencionarlas, no aplicarlas. Eso también es P8.

Si el diff está limpio, decilo en una línea y no inventes hallazgos para justificar
la corrida.
