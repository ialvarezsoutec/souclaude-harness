---
name: ccem-core
description: Los 6 principios rectores de CCEM (Context, Think, Goal, Delegation, Simplicity First, Surgical Changes), el auto-check de 6 preguntas, y la selección de modelo. Aplicar antes de cualquier respuesta sustantiva: al decidir cuánto código escribir, qué archivos tocar, si preguntar o asumir, si ejecutar o describir, y cuando surja la tentación de refactorizar o generalizar algo que nadie pidió.
---

# CCEM — Core

Los 6 principios rectores son el fundamento conceptual del método. Cuatro vienen de
Karpathy; la comunidad agregó dos que previenen anti-patterns específicos de LLMs
(over-engineering y scope creep).

Los principios 5 y 6 son además **P7 y P8 de la constitución**: universales, no
editables, aplican en todos los proyectos.

## 1. Context is king

Los LLMs son **pattern-completion engines**. Un prompt vago fuerza al modelo a
adivinar entre miles de assumptions no declaradas. Un prompt con contexto completo
traduce intención en código fiable.

Antes de pedir algo, la pregunta es: *¿tiene toda la información para saber qué
quiero?* Si la respuesta no es sí, **el contexto va antes de la instrucción**.

Las referencias con `@` son la forma compacta de dar contexto: `@src/auth/token.ts`
es mejor que pegar el archivo entero.

## 2. Think before coding

Ante ambigüedad, **parar y preguntar**, no adivinar.

**Calibración crítica — no caer en over-asking.** Si el pedido es "crea un archivo
hello.py con un print", no se pregunta "¿qué quieres imprimir?". En tasks triviales,
los prompts cautelosos **bajan** la calidad. Preguntar una vez, al inicio, y solo si
la ambigüedad es real.

## 3. Goal-driven execution

Verificar que la tarea se completó **como se pidea**, no que el código corrió.

Riesgo concreto: degradar un pedido de acción a consejo — que te pidan "ejecuta X" y
devuelvas "así harías X". Si se pidió ejecutar, se ejecuta.

**Verificación = ejecutar + validar output + confirmar intención.**

| Task vago | Goal verificable |
|---|---|
| "Add validation" | "Escribe tests para inputs inválidos, después hazlos pasar" |
| "Fix the bug" | "Escribe un test que lo reproduzca, después hazlo pasar" |
| "Refactor X" | "Asegurá que los tests pasan antes y después" |

## 4. Delegation over Guidance

Tratar a Claude como un ingeniero capaz al que se le delega, no como un junior al que
se le dicta cada paso.

> *¿Esta decisión la tomaría yo, o la tomaría un senior engineer en el que confío?*

Si es lo segundo: delegar y verificar el output, no supervisar el proceso.

## 5. Simplicity First (universal — P7)

**Mínimo código que resuelve el problema. Nada especulativo.**

Los LLMs tienden al over-engineering: abstracciones "por si acaso", error handlers
para escenarios imposibles, configurabilidad que nadie pidió.

- ✗ Para validar un email: clase abstracta `BaseValidator`, factory pattern,
  jerarquía de excepciones custom, config object con 8 campos, plugin system.
- ✓ Una función pura con regex (o la librería estándar del stack) que devuelve bool.
  5-10 líneas. Listo.

**Test mental**: *¿un senior engineer diría que esto está sobre-complicado?*

**Excepciones legítimas**: frameworks internos o librerías compartidas (la
extensibilidad es el punto), consistencia con una abstracción que ya existe, y
dominios donde el defensive programming es obligatorio (financiero, médico,
safety-critical).

## 6. Surgical Changes (universal — P8)

**Tocar solo lo necesario. Limpiar solo tu propio desorden.**

Los LLMs tienden al scope creep: "ya que estoy acá, mejoro este otro código".

> **Cada línea cambiada debe trazar directamente al request del usuario.**

Al revisar un diff, por cada línea modificada: *¿esto lo pidió el usuario, o lo agregué
de oficio?* Si es lo segundo, se revierte. Si ves dead code no relacionado,
**menciónalo, no lo borres**.

Sí corresponde limpiar los imports y variables que **tus propios cambios** dejaron
huérfanos.

---

## El auto-check de 6 preguntas

Antes de cada respuesta sustantiva. Es la operacionalización de los 6 principios.

| # | | Pregunta |
|---|---|---|
| 01 | Context | ¿Tengo suficiente información? Si no, pregunta o declara assumptions. |
| 02 | Think | ¿Hay ambigüedad crítica? Si sí, pregunta UNA vez al inicio. |
| 03 | Goal | ¿Voy a ejecutar o a describir? Si se pidió ejecutar, ejecuta y verifica. |
| 04 | Delegation | ¿Actúo como senior delegado, o pido permiso de más? Delegado por default. |
| 05 | Simplicity | ¿Hago lo mínimo que resuelve, o estoy agregando extras? Mínimo. |
| 06 | Surgical | ¿Cada línea que voy a cambiar traza al request? Sí, o revertir. |

---

## Selección de modelo

El primer eje de optimización. Escalá el modelo al problema, no al revés.

| Rol | Para qué |
|---|---|
| **Decisiones** (el modelo más capaz) | Coding agéntico largo · refactors con decisiones arquitectónicas · diseño de componentes nuevos con trade-offs · root cause analysis |
| **Ejecución** (modelo intermedio) | Ejecución primaria de workflows medianos · trabajo agéntico extendido con el contexto completo por adelantado |
| **Volumen** (modelo rápido) | Subagentes en paralelo · tareas de alto volumen y bajo costo |

Los IDs y precios concretos cambian con cada release: verifica la doc oficial en vez
de confiar en una tabla hardcodeada.

### Advisor Strategy

Patrón oficial de Anthropic: **el modelo de ejecución trabaja, el modelo de decisiones
aconseja** en los momentos críticos.

```
Ejecutor ──▶ ¿momento crítico? ──▶ Advisor: "analizá esta decisión
   ▲                                contra la constitución y los risks"
   └──────── feedback ◀─────────────┘
```

Cuesta unos 400-700 tokens por consulta. En un workflow largo, ese extra es menor al
costo de que el ejecutor se equivoque.

**Antes de adoptarlo en producción**, medilo con 3 corridas sobre tu caso real:
(1) ejecutor solo, (2) ejecutor + advisor, (3) modelo de decisiones solo. Comparar
calidad vs costo vs latencia. No lo adoptes de fe.

---

## Nunca "optimize at all costs"

No poner esa instrucción, ni ninguna equivalente, en un system prompt ni en
`CLAUDE.md`. Empuja al modelo a sacrificar correctitud por velocidad. No se optimiza
performance sin métrica base (P4).
