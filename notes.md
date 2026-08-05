# notes.md — souclaude-harness

Scratchpad persistente del proyecto. Lo que aprendiste y no quieres volver a
aprender: gotchas del stack, comandos que nunca te acuerdas, decisiones chicas que
no merecen un ADR, cosas que probaste y no funcionaron.

Lo que **no** va acá: decisiones arquitectónicas (van en `docs/decisions/`),
requisitos de features (van en `specs/`), convenciones del proyecto (van en
`CLAUDE.md` y `docs/constitution.md`).

---

## Gotchas

- **`soutec-md-a-pdf` usa ReportLab, no WeasyPrint.** La skill de MD→PDF de marca es
  Python puro (`reportlab` + `pillow` + `markdown`); no necesita Pango/Cairo. Un spec
  viejo la daba por frágil/WeasyPrint y proponía una gemela nativa: quedó obsoleto (ver
  `docs/decisions/20260722-render-pdf-evidencia-via-skill-soutec-md-a-pdf.md`).
- **Las skills globales se montan en una ruta efímera que `python.exe` nativo no lee.**
  En Windows/Git Bash, `ls`/`cat`/`cp` (MSYS) ven `…/local-agent-mode-sessions/…/skills/…`
  pero `python.exe` da `No such file` aun con la ruta Windows correcta. Solución:
  `cp -r "<skill-base>" "$(mktemp -d)"` y correr el script desde la copia.
- **`.claude/harness.json` es el lockfile del CLI; no editarlo a mano.** Si borras o
  cambias un archivo `managed`, el lockfile queda desincronizado hasta que el CLI lo
  reconcilie (`/harness-upgrade`).
- **El banner de sección de `soutec-md-a-pdf` tiene ancho fijo (~9.6 cm).** Un título `#`
  de más de ~28 caracteres se sale del banner (texto blanco sobre blanco = ilegible).
  Mantené cortos los títulos de sección.
- **La skill no pinta badges de color** en las tablas: severidad/estado quedan como texto.
  Cabecera azul + filas cebra, sí.
- **CI corre en Node 20, pero `package.json.engines` exige `>=22.4` — y es real, no
  decorativo.** `parseArgs({ allowNegative: true })` en `src/cli.js` necesita 22.4+ para
  que `--no-vault`/`--no-backup`/cualquier flag negado no explote. Hoy ningún paso de CI
  usa un flag negado, así que el desfase no se nota. El día que alguien agregue un test o
  un paso de CI que sí lo use, va a fallar **solo en CI** y no en local (donde cada quien
  corre Node más nuevo) — el síntoma no va a apuntar a la causa. Decisión del dueño
  (SHS-H2, 2026-07-31): no se sube CI ni se baja `engines` todavía. Si tocás CI, revisa
  esto primero.

## Comandos útiles

```bash
# Render de un .md a PDF con identidad Soutec (deps: pip install reportlab pillow markdown)
WORK="$(mktemp -d)"; cp -r "<skill-base>"/* "$WORK"/
python3 "$WORK/scripts/md_to_pdf.py" informe.md informe.pdf
rm -rf "$WORK"
```

## Descartado (y por qué)

- **Renderer embebido `render_security_report.py`** — eliminado en PLN-002: duplicaba el
  render de marca. Tenía badges de color y no dependía de nada, pero divergía del look
  oficial (sin isotipo/contraportada). Si hace falta un fallback sin la skill, está en el
  historial de git.
- **Skill gemela `soutec-md-a-pdf-nativo`** — no se creó: `soutec-md-a-pdf` ya es nativa.
