# Spec Lite: Integrar it-security-review con la skill `soutec-md-a-pdf` (render corporativo nativo) y retirar el renderer embebido

**Status**: approved
**Owner**: Leonardo Ibarra
**Creado**: 2026-07-22
**Actualizado**: 2026-07-22 — cambio de enfoque (ver Contexto)

> SDD Lite. Para cambios de 4-8 horas. Si esto crece más allá de eso, o si
> aparecen stakeholders no-técnicos, pasa al spec completo (`spec-template.md`).

---

## Contexto

El workflow `/it-security-review` (en este repo) genera el PDF de evidencia para IT
con un **renderer propio embebido** (`render_security_report.py`), que dibuja un PDF
sin dependencias. En paralelo existe una **skill global `soutec-md-a-pdf`** que
produce el *look* corporativo oficial: portada con isotipo, índice con **folios
reales**, secciones numeradas en banners cyan, contraportada y encabezado/pie
corridos.

**Corrección de premisa (2026-07-22).** La versión anterior de este spec-lite
asumía que `soutec-md-a-pdf` dependía de **WeasyPrint** (libs nativas Pango/Cairo,
frágiles en Windows) y, por eso, proponía **crear una skill gemela nativa**
(`soutec-md-a-pdf-nativo`). Esa premisa ya no aplica: la skill instalada declara
que **su motor es ReportLab — 100% Python, sin dependencias nativas del sistema**
(nada de Pango/Cairo/GTK ni Chrome), y solo requiere los paquetes Python
`reportlab`, `pillow` y `markdown` (instalables con `pip` en cualquier SO). Es
decir, `soutec-md-a-pdf` **ya cumple** el objetivo de "render de marca local sin
dependencias frágiles" — no hace falta construir una gemela.

**Decisión.** `/it-security-review` deja de renderizar por sí mismo y **delega el
PDF en la skill `soutec-md-a-pdf`, invocándola por nombre**. El agente
`security-evidence-compiler` escribe el `.md` del informe siguiendo la **guía de
autoría de esa skill** (front-matter + secciones con `#`) y luego invoca la skill
para el render. El renderer embebido deja de usarse. Los 4 archivos afectados son
`policy: managed` del harness, así que el cambio se aplica en la **fuente**
(`templates/base/claude/…`) y en la **instancia** (`.claude/…`), dejándolas idénticas.

## Goals

1. `/it-security-review` (vía `security-evidence-compiler`) genera el PDF de
   evidencia **invocando por nombre la skill `soutec-md-a-pdf`**, con la identidad
   visual oficial (portada con isotipo, índice con folios reales, secciones
   numeradas en banners, contraportada, encabezado/pie por página). Sin renderer
   embebido.
2. El `.md` del informe se escribe con el **formato de autoría de
   `soutec-md-a-pdf`** (front-matter `title`/`subtitle`/`date`/`author`/
   `confidential`/`url`; secciones principales con `#`; callouts semánticos; tablas
   de ≤ 6-7 columnas), **sin cambiar** el contenido, la trazabilidad ni el gate del
   informe (`security-report-standard`): mismo texto, mismas tablas, mismos badges
   de severidad/estado.
3. El renderer embebido (`render_security_report.py`) **deja de vivir en
   `souclaude-harness`**: el repo queda más liviano y el render de marca es
   reutilizable fuera de él (la skill sirve cualquier `.md`).
4. Si la skill no está instalada o le faltan sus paquetes (`reportlab`/`pillow`/
   `markdown`), `/it-security-review` **falla con un mensaje claro**
   (`REPORT_GENERATION_FAILED` indicando la dependencia ausente) — nunca un PDF
   vacío, una extensión renombrada ni un error opaco— y **no instala nada** por su
   cuenta.

## Non-goals

- **No** se crea una skill nueva ni una "gemela nativa": se usa `soutec-md-a-pdf`
  tal como está, que ya es ReportLab-nativa. (Reemplaza el non-goal anterior sobre
  WeasyPrint.)
- **No** se modifica el motor (`md_to_pdf.py`), los assets ni la paleta de
  `soutec-md-a-pdf`. Se la invoca; no se la reescribe.
- **No** se cambia la lógica del gate de seguridad, las fases del workflow, ni el
  estándar de contenido (`security-report-standard`).
- **No** se acopla la skill al dominio de seguridad: es **genérica** (cualquier
  `.md`).
- **No** se agrega badging de color a la skill: severidad/estado se muestran como
  texto (la skill no los pinta; aceptado en T1). Conservarlos exigiría tocar el
  motor, lo que este cambio no hace.
- **No** se convierte el informe en certificación; el disclaimer se mantiene.
- **No** se instalan dependencias automáticamente dentro del flujo del agente.

## Success criteria

- [ ] `/it-security-review` produce su PDF **invocando la skill `soutec-md-a-pdf`
      por nombre**; para una misma evidencia, el **texto** del informe (hallazgos,
      trazabilidad, estado) es el mismo que hoy y conserva tablas y callouts.
      **Nota (T1):** la skill **no** pinta badges de color; severidad/estado quedan
      como texto legible sobre cabecera azul + filas cebra. Aceptado.
- [ ] El `.md` generado lleva **front-matter válido** (`title`, `subtitle`, `date`,
      `author`, `confidential`, `url`) y **secciones principales con `#`** (franjas
      numeradas), según la guía de autoría de la skill.
- [ ] Sobre una evidencia de prueba, el PDF muestra: portada con isotipo, índice
      cuyos números de página **coinciden** con la página real de cada sección,
      secciones numeradas, contraportada y encabezado/pie por página.
- [ ] Si la skill o sus paquetes (`reportlab`/`pillow`/`markdown`) no están
      disponibles, `/it-security-review` **falla con mensaje claro** (no un PDF
      vacío ni un error opaco) y no instala paquetes.
- [ ] Tras la migración, `render_security_report.py` **ya no se referencia** en el
      workflow, el agente ni la plantilla.
- [ ] El cambio queda aplicado en **fuente e instancia idénticas**
      (`templates/base/claude/…` y `.claude/…`); los hashes de `.claude/harness.json`
      los recalcula el CLI (no se editan a mano).

## Open questions

- [ ] **Destino de `render_security_report.py`** tras migrar: eliminar vs. conservar
      como referencia. Recomendación: **eliminar** (Goal 3 + P10: no dejar dead
      code). Se decide en `plan-lite`.
- [ ] **Deps del entorno**: este entorno **no** tiene `reportlab`/`pillow`/`markdown`
      instalados, así que hoy el flujo caería en "falla con mensaje claro". ¿Se
      instalan esos 3 paquetes Python (una vez, con `pip`) para poder generar y
      verificar el PDF en este repo, o se acepta el modo "falla claro" hasta que IT
      los instale? Se confirma en `plan-lite`/`tasks-lite`.
- [ ] **Assets de marca**: `soutec-md-a-pdf` trae sus propios PNG (isotipo/logo). Se
      asume que el look oficial sale de esos assets; no se copian al repo. Confirmar
      en `plan-lite`.

---

## Checklist antes de avanzar a plan-lite

- [x] ¿Los goals son medibles, no aspiracionales? — sí, verificables sobre el PDF y
      sobre las referencias en workflow/agente/plantilla.
- [x] ¿Los non-goals cubren la asunción más probable de un lector? — sí (no crea
      skill nueva; no toca gate/contenido; no reescribe la skill oficial).
- [ ] ¿Sigue siendo un cambio de 4-8 horas? — **sí, probablemente menos**: al reusar
      `soutec-md-a-pdf` se elimina el trabajo de construir una skill; queda cablear
      el workflow/agente, reescribir la plantilla y retirar el renderer.
