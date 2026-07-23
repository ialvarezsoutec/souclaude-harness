# Plan Lite: Integrar it-security-review con la skill `soutec-md-a-pdf` y retirar el renderer embebido

**Spec**: [spec-lite.md](./spec-lite.md)
**Status**: implemented
**Owner**: Leonardo Ibarra

> SDD Lite. Objetivo de tiempo: **15 minutos**.

---

## Cambios concretos

Cada archivo managed se toca en **fuente e instancia** (quedan idénticas).

| Archivo | Cambio |
|---------|--------|
| `…/agents/security-evidence-compiler.md` (fuente + instancia) | Frontmatter: `tools` +`Skill`, `skills` +`soutec-md-a-pdf`. Fase «Crear Markdown»: escribir el `.md` con el formato de autoría de la skill (front-matter + secciones `#`, callouts, tablas ≤6-7 col). Fase «Generar PDF»: invocar la skill `soutec-md-a-pdf`; como su base dir es un montaje efímero que `python.exe` no lee, **copiar la skill a un temp de disco real** (`cp -r`, MSYS sí lee el montaje) y renderizar desde la copia; limpiar al terminar. Si faltan skill/deps o falla el render → `REPORT_GENERATION_FAILED`, sin instalar ni fabricar PDF. «Entradas esperadas»: quitar la «ruta del renderer». |
| `…/skills/it-security-review/SKILL.md` (fuente + instancia) | `allowed-tools`: quitar `Bash(python3 …render_security_report.py *)`. Fase 7: el agente ya no recibe ruta de renderer; genera el PDF **invocando la skill** `soutec-md-a-pdf`. |
| `…/skills/it-security-review/report-template.md` (fuente + instancia) | Reescribir al formato de la skill: front-matter (`title`/`header`/`subtitle`/`date`/`author`/`confidential`/`url`), secciones principales con `#`, guía interna en comentario `<!-- -->` (el parser la ignora), callouts/tablas/badges igual que hoy. Base = versión rica de la instancia. |
| `…/skills/it-security-review/scripts/render_security_report.py` (fuente + instancia) + dir `scripts/` | **Eliminar** ambos archivos y el directorio `scripts/` (queda vacío). |
| `templates/harness.manifest.json` | Quitar la entrada `skill-it-security-review-renderer` (ya no se distribuye el renderer). |
| `.claude/harness.json` | **No se edita a mano** (lockfile del CLI). Quedará listando el renderer y con hashes viejos hasta que el CLI reconcilie. |
| Entorno (una vez) | `pip install --user reportlab pillow markdown` (deps de la skill; aprobado). |
| `notes.md` | Registrar el gotcha: `soutec-md-a-pdf` es ReportLab (no WeasyPrint); `harness.json` es lockfile del CLI. |

## Decisiones técnicas

- **Render por skill, no embebido**: el agente invoca `soutec-md-a-pdf` (ReportLab, Python puro). Descartado: crear la gemela `soutec-md-a-pdf-nativo` — la oficial ya es nativa (la premisa WeasyPrint del spec previo quedó obsoleta). Descartado: conservar el renderer local — duplica el render de marca (P7/P9).
- **Formato del `.md`**: con `title` en front-matter, **todos los `#` son secciones numeradas**. La guía de formato de la plantilla va en un comentario `<!-- -->`; `md_to_pdf.py` no define `handle_comment`, así que lo ignora y no se filtra al PDF (a confirmar en T6).
- **Invocación por nombre**: la ruta real de la skill es de sesión; se invoca vía el tool `Skill` (resuelve la ruta), nunca hardcodeada.
- **Fallar y reportar**: si faltan skill/deps, `REPORT_GENERATION_FAILED`; el flujo del agente no instala paquetes (respeta «no instalar sin confirmar»).
- **Fuente + instancia idénticas**; `harness.json` lo reconcilia el CLI.

## Risks

| Risk | Mitigación |
|------|------------|
| El comentario `<!-- -->` de la plantilla se filtra al PDF | El parser HTML de `md_to_pdf.py` no define `handle_comment` → ignora comentarios. Se confirma con el render de prueba (T6). |
| `harness.json` queda desincronizado (renderer listado, hashes viejos) | Comportamiento esperado del lockfile; se reconcilia con el CLI (`/harness-upgrade`) fuera de este PR. Documentado. |
| El entorno de IT/CI no tiene las deps | El flujo falla con mensaje claro (Goal 4); se documenta el `pip install`. |
| Borrar el renderer antes de validar el reemplazo | Se instala y valida la skill (T1) y se hace el render E2E (T6) **antes** de eliminar (T5). git conserva el archivo. |
| El montaje efímero de la skill (`AppData/…/skills-plugin/…`) no es accesible por `python.exe` nativo (verificado en T1: `os.path.exists`=False aun con ruta Windows) | El agente copia la skill a un temp de disco real con `cp -r` (MSYS sí lee el montaje) y renderiza desde la copia; limpia al terminar. Si copia o render fallan → `REPORT_GENERATION_FAILED`. |
| La skill pierde los badges de color de severidad/estado (verificado en T1) | Aceptado: se conserva el texto y el resto del estilo (cabecera azul, cebra, callouts). No se toca el motor. |

## Constitution check

- [x] **P5** — ¿Destructivo? Sí: se elimina `render_security_report.py`. Vive en git (recuperable); el reemplazo se valida (T1, T6) antes de borrar (T5). Rollback = revertir el PR.
- [x] **P6** — ¿ADR? Sí, breve: «depender de una skill global externa para el PDF de evidencia» es una decisión con trade-off (acoplamiento vs. reuso). Se crea con `/adr-new` (T7).
- [x] **P7** — ¿Mínimo? Sí: se reusa la skill existente y se elimina duplicación; sin abstracciones nuevas.
- [x] **P8/P10** — ¿Cada archivo traza al spec? Sí: agente/SKILL/plantilla → Goals 1-2; borrar renderer + manifest → Goal 3; fallo por deps → Goal 4.

## Rollback

`git revert` del PR: reaparece `render_security_report.py` y se deshacen las ediciones; `harness.json` se reconcilia con el CLI. Sin migraciones de datos ni estado externo.

---

## Checklist antes de avanzar a tasks-lite

- [x] ¿La tabla de archivos está completa? — sí (4 managed × 2, manifest, lockfile-nota, entorno, notes).
- [x] ¿Los 4 principios del constitution check están respondidos, no tildados a ciegas? — sí.
