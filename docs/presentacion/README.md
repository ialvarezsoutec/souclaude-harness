# Presentación — el harness de punta a punta

Deck de 15 láminas que explica cómo se usa `souclaude-harness`: en un proyecto nuevo, en
uno que ya existe, y cómo el tablero compartido y el monitor de tokens hacen visible el
trabajo del equipo.

## Qué hay acá

| Archivo | Qué es |
|---|---|
| `deck.html` | La presentación navegable. Es la fuente de contenido. |
| `build-svg.mjs` | Generador de las láminas en SVG, para importar a Figma. |
| `slides/` | 15 SVG de 1920×1080, tema claro. Se regeneran, no se editan a mano. |
| `slides-dark/` | Lo mismo en tema oscuro (solo si corres el script con `--dark`). |

## Presentar

Abre `deck.html` en el navegador.

- `←` `→` (o barra espaciadora) para navegar · `Home` / `End` para ir a los extremos
- `F` o el botón **Pantalla completa**
- La barra de abajo agrupa las láminas por sección: haz clic en cualquier marca para saltar

Se adapta solo al tema claro u oscuro del sistema.

## Llevarlo a Figma

```bash
node docs/presentacion/build-svg.mjs           # tema claro  -> slides/
node docs/presentacion/build-svg.mjs --dark    # tema oscuro -> slides-dark/
```

En Figma: **File → Import…** y selecciona los `.svg`. Cada lámina entra como un frame de
1920×1080 con las capas nombradas (`slide-01`, `cards`, `table`, `terminal`, …) y el texto
editable.

Dos cosas que conviene saber al importar:

- **Fuentes.** Los SVG piden Georgia (títulos), Segoe UI (cuerpo) y Roboto Mono (datos y
  terminal). Figma tiene Roboto Mono; Georgia y Segoe UI vienen del sistema. Si falta
  alguna, Figma la sustituye y solo hay que reasignarla una vez desde el panel de texto.
- **El texto viene cortado en líneas.** SVG no tiene salto de línea automático, así que
  cada párrafo llega como varias líneas independientes. Si reescribes un texto largo,
  conviene reacomodar los saltos a mano — o editar el contenido en `build-svg.mjs` y
  volver a generar.

## Editar el contenido

Todo el texto de las láminas vive en el array `slides` de `build-svg.mjs`, en bloques
declarativos (`cards`, `table`, `term`, `chain`, `kanban`, `tiles`, `bars`, `steps`, …).
Dentro de un texto, `*así*` marca negrita y `` `así` `` marca código.

`deck.html` mantiene el mismo contenido en HTML. **Los dos archivos son independientes:**
si cambias una lámina, cámbiala en ambos.

## Verificación

El generador no valida por sí solo que el contenido entre en la lámina. Después de
regenerar, conviene revisar que ninguna lámina se desborde de los 1080 px de alto — se
nota a simple vista abriendo los SVG en el navegador.

## Los datos del monitor de tokens

La lámina 14 muestra un panel con costo por hito, escaladas y rework. **Esas cifras son de
ejemplo**, para mostrar la forma del informe: no son telemetría real de ningún proyecto.
Los datos reales salen de `progress/model-router.jsonl` y se resumen en `/rock-close`.
