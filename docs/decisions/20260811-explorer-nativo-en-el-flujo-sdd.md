# ADR: Adoptar el agente `Explore` nativo en el flujo SDD, acotado a reconocimiento

**Fecha**: 2026-08-11
**Status**: accepted
**Deciders**: Leonardo Ibarra

## Context

El flujo SDD tiene cuatro roles (`orchestrator`, `spec-author`, `implementer`, `reviewer`) y
un punto donde falta reconocimiento de código: el arranque de la fase **Plan**. El
`spec-author` escribe ahí el CÓMO técnico —stack, arquitectura, data contracts, alignment
principio por principio— y hoy descubre el terreno él mismo con `Glob`/`Grep`. Ese agente
corre con `effort: high` ([spec-author.md:5](../../.claude/agents/spec-author.md#L5)) y en
tareas complejas la matriz del router lo pone en el tier **Decisiones**
([ccem-model-router](../../.claude/skills/ccem-model-router/SKILL.md)): es el contexto más
caro del flujo, gastado en barrer directorios. El mismo patrón, más leve, aparece cuando el
`implementer` toca código que `plan.md` no describe.

Claude Code ya provee un agente `Explore`: read-only, fan-out sobre muchos archivos, lee
extractos en vez de archivos completos y devuelve la conclusión en vez del volcado. Cubre
exactamente ese hueco sin escribir nada nuevo.

Tres restricciones acotan la decisión:

1. **P9 y la política de especialistas.** `AGENTS.md` ya fija que los agentes especialistas
   se agregan "con su propio nombre descriptivo, no como una casilla vacía a llenar", con
   contrato de activación explícito. Un rol "explorador" genérico y permanente es justamente
   la casilla vacía que esa sección rechaza.
2. **La regla anti-teléfono-descompuesto.** Todo subagente escribe en disco y devuelve una
   referencia; el `orchestrator` "no acepta resultados que lleguen en chat sin referencia a
   archivo" ([orchestrator.md:180](../../.claude/agents/orchestrator.md#L180)). Un explorador
   devuelve un mapa en prosa y efímero por naturaleza.
3. **La telemetría del router.** "Un lanzamiento sin línea es una violación del protocolo"
   ([orchestrator.md:149-150](../../.claude/agents/orchestrator.md#L149-L150)), y un hito sin
   líneas en el JSONL es una violación visible. Un `Explore` no contemplado abre un agujero
   silencioso en esa telemetría.

## Decision

Se adopta el agente **`Explore` nativo de Claude Code** como herramienta de reconocimiento,
**no** como quinto rol del flujo. En concreto:

- **No se crea** `.claude/agents/explorer.md`. Escribir uno propio duplicaría un agente que
  la plataforma ya provee.
- **Autorizado en `spec-author`, fase Plan únicamente**: un lanzamiento para mapear el
  terreno antes de redactar. El resultado **no genera artefacto propio**: se consume en el
  momento y queda reflejado en `plan.md`, que ya es el artefacto versionado de esa fase.
- **Autorizado en `implementer`**, solo cuando el task toca código fuera de lo que `plan.md`
  describe. Mismo trato: sin artefacto propio, el hallazgo aterriza en `impl_summary.md`.
- **Prohibido en `reviewer`.** Su valor es la independencia del juicio; delegar su lectura a
  un tercero que resume es cómo un review se vuelve ceremonial.
- **Prohibido en `orchestrator`.** Su reconocimiento es de estado (qué artefactos existen, en
  qué rama está), no semántico, y ya tiene `Read`/`Glob`/`Grep`/`Bash` para eso.
- **Telemetría**: cada lanzamiento de `Explore` se registra en `progress/model-router.jsonl`
  con `agente: "explore"` y `clase: "mecanica"`, igual que cualquier otro. No se rutea modelo
  (corre en `inherit`): la fila existe para que el costo del reconocimiento sea visible, no
  para elegirle tier.
- **Presupuesto: máximo 1 lanzamiento por fase Plan y 1 por task.** Sin tope, "explorar
  primero" degenera en barrer el repo antes de cada archivo.

## Consequences

### Positivas
- El contexto caro (`spec-author` en tier Decisiones) deja de gastarse en barrer directorios;
  el reconocimiento corre en un contexto desechable y devuelve solo la conclusión.
- Cero superficie nueva de mantenimiento: no hay agente propio que versionar ni mantener
  sincronizado con el resto del harness.
- El costo del reconocimiento queda medible en el JSONL y revisable en `/rock-close`, junto
  al resto de los lanzamientos.

### Negativas
- **Debilita la verificación de `auto`.** El `orchestrator` encadena verificando el artefacto
  él mismo, y esa verificación es lo que hace seguro el modo. Si `plan.md` se construye sobre
  un mapa que nadie más vio y que no quedó en disco, el `orchestrator` puede comprobar que el
  plan está *completo*, no que sea *correcto respecto del código real*. En `manual` el humano
  tampoco ve ese mapa. Es el costo aceptado, y la razón de acotar la autorización a la fase
  Plan: ahí `plan.md` es lo bastante detallado como para que un error de reconocimiento se
  note al leerlo.
- Un `Explore` que devuelve un mapa incompleto puede inducir un `plan.md` plausible pero
  equivocado, y el error se propaga a `tasks.md` e implementación.

### Neutras
- `Explore` no aparece en la matriz agente × clase del router: corre siempre en `inherit`,
  así que la matriz no necesita una fila nueva, solo la skill una nota.

## Alternatives considered

### Alternativa A: crear un agente propio `.claude/agents/explorer.md`
**Pros**: control total sobre su prompt y sus herramientas; encaja con el patrón de los otros
cuatro roles.
**Cons**: duplica un agente que la plataforma ya provee; superficie nueva que mantener;
adoptar algo nuevo debería pasar por `ccem-research` sin ganancia clara sobre el nativo.
**Por qué se descartó**: P9. La ganancia sobre `Explore` es nula y el costo de mantenimiento
es permanente.

### Alternativa B: explorador como quinto rol, con artefacto en `progress/<ID>-<slug>/exploration.md`
**Pros**: respeta al pie de la letra la regla anti-teléfono-descompuesto; el `orchestrator` y
el humano pueden auditar el mapa que alimentó el plan, cerrando el agujero de verificación de
`auto`.
**Cons**: versiona un artefacto que caduca apenas cambia el código; agrega un checkpoint más
a un flujo que ya tiene tres antes de escribir código; convierte reconocimiento en ceremonia.
**Por qué se descartó**: P9 otra vez. El mapa ya queda reflejado en `plan.md`, que sí es
durable; un archivo intermedio que nadie vuelve a leer es ruido versionado.

### Alternativa C: no hacer nada
**Pros**: cero cambios; el flujo funciona hoy.
**Cons**: el contexto más caro del flujo se sigue gastando en `Glob`/`Grep`.
**Por qué se descartó**: el hueco es real y el remedio es barato y acotado.

## References

- [AGENTS.md](../../AGENTS.md) — sección "Agentes especialistas bajo demanda" y "Regla
  anti-teléfono-descompuesto"
- [.claude/agents/orchestrator.md](../../.claude/agents/orchestrator.md#L130-L150) — protocolo
  del router y telemetría obligatoria
- [.claude/skills/ccem-model-router/SKILL.md](../../.claude/skills/ccem-model-router/SKILL.md)
- [docs/constitution.md](../constitution.md) — P6, P9, P10
