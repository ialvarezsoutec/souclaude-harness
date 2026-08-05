# ADR: Render del PDF de evidencia de seguridad delegado a la skill `soutec-md-a-pdf`

**Fecha**: 2026-07-22
**Status**: proposed
**Deciders**: Leonardo Ibarra

## Context

El workflow `/it-security-review` generaba el PDF de evidencia para IT con un **renderer
embebido** en el repo (`render_security_report.py`): Python puro, sin dependencias, con
badges de color de severidad/estado, pero con una estética propia (sin la portada/isotipo
ni la contraportada corporativa).

En paralelo existe la skill global **`soutec-md-a-pdf`** (motor `md_to_pdf.py`, ReportLab),
que produce el *look* corporativo oficial de Soutec: portada con isotipo, índice con folios
reales, secciones en banners cyan, contraportada y encabezado/pie corridos. La skill es
genérica (sirve cualquier `.md`) y no depende de librerías nativas del sistema.

Se busca que la evidencia para IT tenga la identidad de marca oficial y que el harness no
mantenga un segundo renderer. Restricciones detectadas al validar (PLN-002, T1):

- la skill vive en un **montaje efímero de sesión** que `python.exe` nativo no puede leer
  en Windows;
- requiere los paquetes `reportlab`, `pillow` y `markdown`;
- **no** pinta badges de color: severidad/estado quedan como texto.

## Decision

`/it-security-review`, a través del agente `security-evidence-compiler`, **genera el PDF
invocando por nombre la skill `soutec-md-a-pdf`** y se **elimina** el renderer embebido
(`render_security_report.py`) del harness. El agente escribe el `.md` con el formato de
autoría de la skill (front-matter + secciones `#`), copia la skill a un temporal de disco
real (por el montaje efímero) y renderiza desde ahí. Si la skill o sus dependencias no
están disponibles, el flujo **falla con `REPORT_GENERATION_FAILED`** sin fabricar un PDF.
El contenido, la trazabilidad y el gate del informe no cambian.

## Consequences

### Positivas
- Identidad de marca oficial y consistente (portada con isotipo, TOC con folios reales,
  contraportada), reutilizable para cualquier documento `.md`.
- Un solo renderer que mantener; el harness queda más liviano (renderer y assets fuera).

### Negativas
- Dependencia de runtime: la skill global y `reportlab`/`pillow`/`markdown` deben estar
  instaladas donde corra el workflow; si no, no hay PDF (falla clara, no PDF vacío).
- Se pierden los badges de color de severidad/estado; se muestran como texto.
- En Windows hace falta copiar la skill a disco real antes de renderizar (montaje efímero
  no accesible por `python.exe`).

### Neutras
- El texto, las tablas, los callouts y el gate del informe son los mismos que antes.
- `.claude/harness.json` (lockfile) sigue listando el renderer hasta que el CLI lo
  reconcilie (`/harness-upgrade`).

## Alternatives considered

### Alternativa A: Mantener el renderer embebido (`render_security_report.py`)
**Pros**: self-contained, sin dependencias, con badges de color.
**Cons**: duplica el render de marca; no reutilizable; estética distinta de la oficial
(sin isotipo ni contraportada).
**Por qué se descartó**: el objetivo es el look corporativo oficial y el reuso; mantener
dos renderers viola P7/P9.

### Alternativa B: Crear una skill gemela nativa (`soutec-md-a-pdf-nativo`)
**Pros**: control local del renderer de marca.
**Cons**: redundante — `soutec-md-a-pdf` ya es ReportLab-nativa; es otro artefacto que
construir y mantener.
**Por qué se descartó**: la premisa que la motivaba (que `soutec-md-a-pdf` dependía de
WeasyPrint, frágil) quedó obsoleta; la skill oficial ya cumple el objetivo.

## References

- [spec-lite.md](../../specs/PLN-002-auditoria-harness/spec-lite.md)
- [plan-lite.md](../../specs/PLN-002-auditoria-harness/plan-lite.md)
- [tasks-lite.md](../../specs/PLN-002-auditoria-harness/tasks-lite.md)
