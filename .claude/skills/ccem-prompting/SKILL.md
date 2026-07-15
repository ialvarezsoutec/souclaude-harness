---
name: ccem-prompting
description: Anti-Hack Template y patterns de prompting de CCEM — cómo pedirle trabajo a un agente sin dejarle puertas para simular que terminó. Aplicar al escribir un prompt de task, al delegar en un subagente, al redactar tasks.md, o cuando un agente reporta "listo" con tests que no prueban nada, mocks que reemplazan la lógica, o un try/except que se traga el error.
---

# CCEM — Prompting

## El Anti-Hack Template

El núcleo, textual (Opus 4.7 System Card §6.2.2.2):

> *"If anything is unclear, ambiguous, or seems wrong, stop and ask me — do not guess,
> reinterpret, or decide on your own what I 'probably meant.'"*

Una frase. Es la instrucción que más reduce el reward hacking, porque le da al modelo
una **salida legítima** cuando el camino correcto no está claro. Sin ella, la única
forma de "cumplir" es inventar.

### Calibración obligatoria

**No aplicar el template a tasks triviales.** Si el pedido es "crea un `hello.py` con
un print", el agente no debe preguntar "¿qué quieres imprimir?".

Los prompts cautelosos **bajan** la calidad en tareas simples. El template es para
ambigüedad real, no para convertir cada pedido en un interrogatorio.

## Por qué hace falta

Un agente al que se le pide "hacé que los tests pasen" tiene dos caminos: arreglar el
código, o arreglar el test. El segundo es más fácil.

Esto no es mala fe del modelo: le diste una función objetivo mal especificada y la
optimizó. La solución está en el prompt, no en el reto posterior.

## Estructura de un prompt de task

```
## Objetivo
[El resultado observable. NO "que pasen los tests" — "que el endpoint devuelva
403 cuando el token expiró".]

## Contexto
[Qué es esto y por qué importa. Va ANTES de la instrucción. Referencias con @.]

## Restricciones
- Si algo es ambiguo o parece mal: para y pregunta. No adivines ni reinterpretes.
- No modificar los tests para que pasen. Si un test está mal, decilo y para.
- No hardcodear valores para satisfacer un caso.
- No mockear la cosa que se está probando.
- No envolver en try/except para silenciar un error que no entiendes.

## Verificación
[Un comando, y su output esperado. Tiene que poder FALLAR si el trabajo está mal.]
```

Las restricciones **nombran los atajos específicos** antes de que aparezcan. Un "hazlo
bien" genérico no cierra ninguna puerta; "no modifiques el test para que pase" cierra
una, exactamente.

## Patterns

**Verificación falsable.** Un criterio de éxito que no puede fallar no es un criterio.
"Los tests pasan" es débil: se pueden cambiar los tests. "El test
`test_expired_token_returns_403` pasa, sigue existiendo, y sigue haciendo un request
real" es fuerte.

**De vago a verificable:**

| Vago | Goal verificable |
|---|---|
| "Add validation" | "Escribe tests para inputs inválidos, después hazlos pasar" |
| "Fix the bug" | "Escribe un test que lo reproduzca, después hazlo pasar" |
| "Refactor X" | "Asegurá que los tests pasan antes y después" |

**Contexto antes que instrucción.** Primero qué es esto y por qué importa; después qué
hacer. Un agente que entiende el porqué decide mejor en los huecos que dejaste — y
siempre dejas huecos.

**Referencias compactas.** `@src/auth/token.ts` en vez de pegar el archivo entero.
Mismo contexto, una fracción de los tokens.

**Nombrar los archivos.** "Arregla la autenticación" manda al agente a explorar media
hora. "En `src/auth/token.ts`, `validateToken()` no chequea `exp`" va al punto.

**Un objetivo por prompt.** Dos objetivos significan que el segundo se hace peor.

**Plan primero, en lo grande.** Para algo que toca varios archivos: pide el plan,
léelo, corregilo, y recién ahí manda a implementar. Sale más barato corregir un plan
que un diff.

## Antipatterns

| No escribas | Escribe |
|---|---|
| "Hacé que los tests pasen" | "Arregla la causa de que falle `test_x`. No toques el test." |
| "Mejorá esto" | "Bajá el p99 de `/search` de 800 ms a <200 ms. Medí antes y después." |
| "Arregla los bugs" | "`parseDate` devuelve el día anterior en UTC-3. Reproduce y arregla." |
| "Refactorizá cuando toques el archivo" | (nada — eso es scope creep, viola P8) |
| "Optimize at all costs" | (nunca — prohibido por P4) |
