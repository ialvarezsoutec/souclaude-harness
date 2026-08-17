# Guía de autoría del `.md` para el PDF corporativo Soutec

Instrucciones para que un agente (o persona) escriba un Markdown que el script
`md_to_pdf.py` renderice correctamente con la identidad Soutec. Escribe Markdown
**limpio y estándar**: el estilo (sangrías, justificado, colores, banners) lo
aplica el script. No metas formato manual.

## 1. Front-matter (placeholders del documento)

Opcional pero recomendado. Va al inicio del archivo, entre `---`. Controla la
portada, el banner corrido y la contraportada:

```markdown
---
title: Revisión de Seguridad — souclaude-harness   # título en portada
header: Revisión de Seguridad – IT                 # texto del banner corrido (default: el título)
subtitle: souclaude-harness                        # subtítulo en portada
date: 21 de julio de 2026                          # default: fecha de hoy en español
author: Innovación y Desarrollo                    # línea de autor/área en portada
confidential: true                                 # muestra el sello CONFIDENCIAL
url: www.soutec-group.com                          # URL de la contraportada
---
```

Reglas:
- Si NO pones `title`, se usa el primer `#` (H1) del cuerpo como título.
- Cualquier campo se puede sobre-escribir por CLI (`--title`, `--subtitle`, etc.).
- No inventes otros campos: solo estos se leen.

## 2. Estructura de secciones (lo más importante)

El nivel de encabezado define el estilo:

- `#` (H1) → **franja cyan numerada** que sangra al borde izquierdo (1, 2, 3…).
  Úsalo para las secciones principales del documento.
- `##` (H2) → subtítulo azul en negrita.
- `###` (H3) → sub-subtítulo azul, más pequeño.
- `####` (H4) → rótulo en carbón.

Regla clave del título: **el primer `#` del documento se usa como título de la
portada y se retira del cuerpo** (a menos que definas `title` en el front-matter,
en cuyo caso todos los `#` son secciones).

Consecuencia práctica: si quieres que tus secciones principales salgan con la
franja cyan numerada, **numéralas con `#`**, no con `##`. Ejemplo correcto:

```markdown
---
title: Revisión de Seguridad
---

# Resumen para IT
Texto...

# Alcance y metodología
Texto...

## Sub-tema del alcance
Texto...
```

Aquí "Resumen para IT" y "Alcance y metodología" salen como franjas 1 y 2; el
sub-tema como subtítulo azul. El índice se genera solo, con números de página.

## 3. Párrafos

Escríbelos normal, en líneas corridas. **No** agregues sangría manual, espacios
al inicio, ni saltos de línea forzados dentro de un párrafo: el script pone la
sangría de primera línea y justifica automáticamente. Separa párrafos con una
línea en blanco.

## 4. Notas (blockquotes)

Un blockquote sale como **nota en texto plano** (sin caja ni color), como en los
informes de referencia: el rótulo en negrita queda inline al inicio de un párrafo
normal. Dos sintaxis válidas, mismo resultado:

```markdown
> **Nota:** información o contexto.

> [!NOTA] Título opcional
> Cuerpo del aviso (el título sale en negrita).
```

No hay color por tipo: `[!ADVERTENCIA]`, `[!PELIGRO]`, etc. se aceptan por
compatibilidad pero todas se renderizan igual, en texto plano. Para resaltar
dentro de la nota usa `**negrita**`.

## 5. Tablas

Markdown estándar (cabecera azul y filas cebra automáticas):

```markdown
| Campo | Valor |
|---|---|
| Proyecto | souclaude-harness |
| Estado | Listo para revisión |
```

Recomendación: mantén las tablas en **≤ 6–7 columnas** y celdas cortas. El script
reparte el ancho de forma proporcional, pero muchas columnas con texto largo se
ven apretadas. Si necesitas más, parte la información en dos tablas o usa una
lista de campos.

## 6. Código

Bloques con triple backtick (fondo gris con barra profunda) e inline con
backtick simple (`código`):

    ```text
    Estado: DONE
    Commit: 50f07ea
    ```

## 7. Listas

Viñetas con `-` (marcador azul) o numeradas con `1.`. Evita anidar más de un
nivel; el render aplana listas muy profundas.

## 8. Inline

`**negrita**` (queda en color carbón), `*cursiva*`, `` `código` ``,
`[enlace](https://…)`. Evita HTML crudo dentro del Markdown.

## Checklist para el agente generador

1. ¿Front-matter con `title` (y `subtitle`/`date`/`author`/`confidential` si aplican)?
2. ¿Secciones principales con `#` para que salgan como franjas numeradas?
3. ¿Párrafos en prosa, sin sangría ni espacios manuales?
4. ¿Callouts con `[!TIPO]` o `**Palabra:**` y color correcto por rol?
5. ¿Tablas de ≤ 6–7 columnas con celdas concisas?
6. ¿Sin HTML crudo ni listas anidadas profundas?
