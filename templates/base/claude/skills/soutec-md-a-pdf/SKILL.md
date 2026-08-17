---
name: soutec-md-a-pdf
description: >-
  Convierte un archivo Markdown (.md) en un PDF con la identidad corporativa de
  Soutec: portada con isotipo, banner cyan corrido, índice con números de página
  reales, secciones numeradas en banners cyan, tablas de cabecera azul,
  contraportada cyan y pie "Página X de Y". Actívate SIEMPRE que el
  usuario quiera pasar un markdown a PDF con formato/estilo Soutec, o pida un
  informe, reporte, manual o procedimiento en PDF con la estética Soutec:
  "convierte este markdown a pdf", "pásame este .md a pdf con formato Soutec",
  "hazme un documento Soutec desde este markdown", "dale formato Soutec a este md",
  "exporta a PDF con la marca Soutec". Aplica aunque no diga "markdown" si pide un
  documento o informe con la estética Soutec o "un PDF como los de Soutec". No lo
  uses para .docx, .pptx ni PDFs ajenos a Soutec.
---

# Soutec — Markdown a PDF corporativo

Genera un PDF con la identidad visual de Soutec Group a partir de un `.md`:
banner cyan corrido en cada página, logo soutec arriba a la derecha, portada con
el isotipo grande, índice de contenidos con números de página reales, secciones
numeradas en banners cyan, subtítulos azules, tablas con cabecera azul, notas en
texto plano y pie con copyright + "Página X de Y".

El motor de render es **ReportLab** — 100% Python, sin dependencias nativas del
sistema (nada de Pango/Cairo/GTK ni Chrome headless). Corre en cualquier máquina
que tenga Python: Windows, macOS o Linux, solo con `pip`. Usa fuentes internas
(Helvetica/Courier), así que tampoco depende de fuentes instaladas. La cromática
de marca (banners angulados, portada, contraportada) se dibuja con primitivas del
canvas y el contenido fluye con Platypus (párrafos justificados, tablas, TOC con
números de página reales vía multi-pass). No cambies de motor (no uses WeasyPrint,
pandoc/LaTeX ni Chrome): este ya está afinado para verse como los ejemplos y para
ser portable.

## Uso rápido

```bash
python3 <skill>/scripts/md_to_pdf.py ENTRADA.md [SALIDA.pdf] [opciones]
```

Si no se pasa `SALIDA.pdf`, se genera junto al `.md` con el mismo nombre.
Ejemplo mínimo:

```bash
python3 scripts/md_to_pdf.py informe.md informe.pdf
```

### Dependencias

Requiere tres paquetes de Python puro, instalables con pip en cualquier SO (sin
librerías del sistema):

```bash
pip install reportlab pillow markdown
```

(`reportlab` dibuja el PDF, `pillow` maneja los PNG de marca con transparencia,
`markdown` parsea el `.md`.) En entornos gestionados agrega
`--break-system-packages -q`. Si el render falla, es por falta de uno de estos
tres paquetes — instálalo y reintenta; no cambies de motor.

## De dónde salen el título y el encabezado

Regla por defecto (sin configuración): **el primer `# H1` del `.md` es el título
del documento** (va en la portada y en el banner corrido) y se retira del cuerpo;
los `# H1` siguientes son las secciones numeradas (1, 2, 3…). Los `##` son
subtítulos azules y los `###` sub-subtítulos, y ambos entran al índice indentados.

Esto significa que un `.md` normal, sin nada especial, ya sale bien: encabézalo
con un `# Título` y luego usa `#` para cada sección grande.

### Front-matter opcional (control fino)

Si el `.md` empieza con un bloque `---`, se leen estos campos (todos opcionales):

```markdown
---
title: Informe de Arquitectura         # título en portada; si está, TODOS los # son secciones
header: Informe de Arquitectura        # texto del banner corrido (default: el título)
subtitle: Plataforma Edge AI           # subtítulo en la portada
date: Julio 2026                       # fecha en portada (default: hoy en español)
author: Innovación y Desarrollo        # línea de autor/área en portada
confidential: true                     # muestra el sello "CONFIDENCIAL"
---
```

### Opciones de línea de comandos

Sobre-escriben el front-matter y los defaults: `--title`, `--header`,
`--subtitle`, `--date`, `--author`, `--url`, `--confidential`, `--no-cover`,
`--no-toc`, `--no-backcover`.

Usa `--no-cover` / `--no-toc` para documentos cortos (una nota de una página) en
los que la portada y el índice sobran.

## Cómo debe venir escrito el `.md`

Si vas a **generar** el Markdown (o instruir a otro agente para que lo haga),
sigue `references/guia-autoria-md.md` — cubre front-matter, cuándo usar `#` vs
`##`, párrafos sin sangría manual, notas, tablas y un checklist final. Regla
de oro: Markdown limpio y estándar; el estilo lo pone el script.

## Convenciones de Markdown que el estilo aprovecha

Escribe Markdown normal; estos elementos ya tienen estilo Soutec:

- **Secciones**: `#` → banner cyan numerado. `##` → azul. `###` → azul menor.
- **Tablas**: sintaxis de tabla estándar → cabecera azul, filas cebra.
- **Código**: bloques ```` ``` ```` y `inline` con fondo gris azulado.
- **Listas**: viñetas con marcador azul; numeradas normales.
- **Negrita** para destacar (queda en color carbón, como en los ejemplos).

### Notas (blockquotes)

Un blockquote se renderiza como **nota en texto plano**, igual que en los informes
de referencia: sin caja, sin borde ni relleno de color. El rótulo en negrita
(`**Nota:**`, `**Advertencia:**`, etc.) queda inline al inicio de un párrafo
normal. Ambas sintaxis funcionan y producen el mismo resultado neutro:

```markdown
> **Nota:** información o contexto.

> [!NOTA] Título opcional
> Cuerpo del aviso (estilo admonición GitHub → el título sale en negrita).
```

No hay codificación de color por tipo: `[!ADVERTENCIA]`, `[!PELIGRO]`, etc. se
aceptan por compatibilidad, pero todas salen como texto plano con el rótulo en
negrita. Para destacar una palabra dentro de la nota, usa `**negrita**` normal.

## Identidad de marca (ya incorporada, no la reproduzcas a mano)

Los colores, la geometría y los estilos viven dentro de
`scripts/md_to_pdf.py` (constantes de paleta + funciones de dibujo). Los assets
de imagen están en `assets/`:

- Colores: cyan `#00A5BC`, azul `#00688F`, profundo `#004F64`, carbón `#3D4543`,
  verde `#47B45A`, amarillo `#F2D13F`, magenta `#C81E54`.
- `assets/soutec_logo.png` — logo soutec a color (cabecera y portada).
- `assets/soutec_logo_white.png` — logo blanco knockout (contraportada cyan).
- `assets/soutec_isotipo.png` — isotipo grande de la portada (fondo transparente).

Si el usuario tiene el logo/isotipo oficial en vector o alta resolución, puede
reemplazar esos PNG dentro del skill sin tocar el código.

## Después de generar

Entrega el PDF al usuario con `SendUserFile`. Si algo del layout no calza (una
tabla muy ancha, un salto de página feo), ajusta las constantes o funciones de
dibujo en `scripts/md_to_pdf.py` y vuelve a renderizar — no post-proceses el PDF
a mano.
