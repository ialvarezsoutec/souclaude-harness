# Tasks Lite: Integrar it-security-review con la skill `soutec-md-a-pdf`

**Spec**: [spec-lite.md](./spec-lite.md)
**Plan**: [plan-lite.md](./plan-lite.md)
**Estimated total**: ~2.5-3 h
**Status**: implementado (2026-07-22) — pendiente de review/PR

> SDD Lite. Cada task 15-30 min, con su verificación. Un commit por task.
> Fuente = `templates/base/claude/…`, instancia = `.claude/…` (quedan idénticas).

---

## Tasks

- [x] **T1** — Instalar deps y smoke-test de la skill · entorno · 15 min
      `pip install --user reportlab pillow markdown` OK (reportlab 5.0.0). Smoke render
      `%PDF-`; portada/TOC/secciones/callouts OK; el comentario `<!-- -->` no se filtra.

- [x] **T2** — Reescribir la plantilla al formato de la skill · `report-template.md` (fuente + instancia) · 30 min
      Front-matter + secciones `#` + guía en `<!-- -->`. Títulos acortados a ≤28 chars
      (banner de ancho fijo). Render de ejemplo verificado; fuente==instancia.

- [x] **T3** — Cablear el agente a la skill · `security-evidence-compiler.md` (fuente + instancia) · 30 min
      Frontmatter (+`Skill`, +`soutec-md-a-pdf`); «Crear Markdown» (formato de autoría);
      «Generar PDF» (invocar skill + copiar a temp + `REPORT_GENERATION_FAILED`). 0 refs a
      renderer; fuente==instancia.

- [x] **T4** — Actualizar el workflow · `it-security-review/SKILL.md` (fuente + instancia) · 20 min
      `allowed-tools` sin el renderer; Fase 7 sin ruta de renderer, con «invocar la skill».
      0 refs; fuente==instancia.

- [x] **T5** — Eliminar renderer + referencia del manifest · `scripts/` (×2) + `harness.manifest.json` · 15 min
      `render_security_report.py` y dir `scripts/` eliminados (×2); entrada
      `skill-it-security-review-renderer` quitada del manifest (JSON OK, 38 files).
      Extra: 2 permisos muertos del renderer quitados de `settings.local.json`.

- [x] **T6** — Verificación E2E del informe de marca · scratchpad · 30 min
      Informe de ejemplo con la plantilla nueva, renderizado vía la skill: `%PDF-`, portada
      con isotipo, TOC con folios reales, secciones numeradas, callouts, contraportada.
      Tabla de trazabilidad (7 col) densa pero legible (aceptado).

- [x] **T7** — ADR de la decisión · `docs/decisions/20260722-render-pdf-evidencia-via-skill-soutec-md-a-pdf.md` · 15 min
      Contexto, decisión, consecuencias y alternativas (renderer embebido / gemela nativa).

- [x] **T8** — Cierre · `notes.md` · 10 min
      Gotchas: ReportLab (no WeasyPrint), montaje efímero (copiar a disco), `harness.json`
      lockfile, banner de ancho fijo, sin badges.

---

## Checkpoint humano

- [x] **Después de T2**: plantilla nueva OK en PDF (portada, TOC, secciones sin truncar).
- [x] **Después de T6**: informe de marca cumple; texto equivalente al de hoy.

## Cierre

- [x] Render E2E OK (T6) — el «test» de este cambio (repo-harness, sin suite de app)
- [x] `notes.md` actualizado
- [ ] `harness.json` reconciliado con el CLI (`/harness-upgrade`) — nota; fuera del PR
- [ ] PR abierto y, tras revisión, mergeado
