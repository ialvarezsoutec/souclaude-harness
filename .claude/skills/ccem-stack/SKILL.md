---
name: ccem-stack
description: Cómo documentar las convenciones de este proyecto en CLAUDE.md y en la constitución — qué merece estar escrito y qué es ruido. Aplicar cuando hay que llenar o actualizar CLAUDE.md, completar la sección Stack de docs/constitution.md, o cuando Claude repite el mismo error dos veces (eso es una regla que falta escribir).
---

# CCEM — Stack y convenciones

`CLAUDE.md` no es documentación. Es el prompt que Claude lee en **cada** sesión.
Cada línea cuesta tokens para siempre, así que cada línea tiene que ganárselo.

## El filtro

Una regla va a `CLAUDE.md` si, y solo si, **omitirla causa un error**.

**Sí van:**
- "Las migraciones se corren con `X`, nunca a mano contra la DB."
- "Todo endpoint nuevo va versionado bajo `/v2`. El `/v1` está congelado."
- "El cliente de Redis es un singleton en `lib/redis.ts`. No instanciar otro."
- "Los tests de integración necesitan `docker compose up db` corriendo primero."

**No van** (Claude ya lo sabe, o lo deduce leyendo el código):
- "Usamos TypeScript."
- "Escribe código limpio y mantenible."
- "Sigue las mejores prácticas."
- "Usá nombres de variables descriptivos."

**El test**: si borras la línea, ¿Claude hace algo mal? Si no, sácala.

## Límite duro

`CLAUDE.md` < 200 líneas. Es un límite de la constitución, y es un límite real: un
CLAUDE.md de 600 líneas no se lee mejor, se diluye. Si no entra, lo que sobra es
documentación, y la documentación va en `docs/`.

## De dónde salen las reglas

Las buenas reglas no se escriben al empezar. **Se cosechan.**

Cuando Claude comete un error por no saber algo del proyecto, esa es exactamente
una regla que faltaba. Escribila ahí mismo, en la categoría que corresponda. Un
`CLAUDE.md` maduro es un registro de errores que ya no se repiten.

Si Claude comete **el mismo error dos veces**, la regla no está o está mal escrita.
No lo corrijas otra vez a mano: arregla el archivo.

## Cómo organizarlas

Agrupadas por categoría, no en una lista plana. Las categorías salen del proyecto,
no de una plantilla: `API`, `Data`, `Auth`, `Deployment`, `Testing`, lo que sea.

Reglas concretas y accionables. "Cuidado con las fechas" no es una regla.
"Todos los timestamps se guardan en UTC; la conversión a zona horaria pasa solo en
la capa de presentación" sí lo es.

## Qué va en cada archivo

| Archivo | Contenido | Vida |
|---|---|---|
| `CLAUDE.md` | Reglas que evitan errores. Contexto mínimo. | Se lee en cada sesión |
| `docs/constitution.md` | Principios no-negociables, standards, stack | Cambios vía PR |
| `notes.md` | Gotchas, comandos, cosas que probaste y fallaron | Scratchpad, sin ceremonia |
| `docs/decisions/` | Por qué se decidió lo que se decidió | Inmutable |
| `specs/` | Qué se está construyendo ahora | Por feature |

Si estás por escribir algo en `CLAUDE.md` y en realidad es la historia de una
decisión → ADR. Si es un gotcha que aprendiste ayer → `notes.md`. `CLAUDE.md` es
solo para lo que Claude necesita saber **antes** de empezar a trabajar.
