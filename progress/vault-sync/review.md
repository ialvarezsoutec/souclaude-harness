# Review — feat/vault-sync

**Reviewer**: agente `reviewer` · **Fecha**: 2026-08-11
**Alcance**: commits `c674ea5..9eb940f` + verificación en vivo contra el Vault real.

## Ronda 1 — CHANGES_REQUESTED

Trazabilidad requisito↔test completa (SC1-SC8), constitución OK (P2, P9, P10),
Anti-Hack OK (tests de comportamiento real, guard central anti `--force`), refactor
del publisher sin cambio de comportamiento. `npm test` 391/391.

Bloqueantes (docs-only, código aprobado):

- **B1**: `spec.md` SC2 decía "sobre `Project-<PREFIJO>/` por defecto" pero el plan
  decidió y la implementación hace `add -A` sobre el Vault completo. → Corregido: el
  SC2 ahora documenta el default real (`-A`) y `--paths` como restricción.
- **B2**: tasks y success criteria sin marcar pese a estar cumplidos. → Corregido:
  T1-T5 marcadas con sus commits (T5 con evidencia `b77a2ef`/`4dfafa9` en el Vault) y
  criterios tildados.

Observaciones no bloqueantes (deuda anotada):

- `docs/vault-guide.md` y `docs/vault-setup.md` aún enseñan la secuencia git cruda —
  fuera del scope del spec (P10); pendiente para no dejar dos vías sancionadas.
- `gitFake` hard-codea `C:/vault` en la detección de subcomando (frágil para tests
  futuros con otra ruta).
- En `pushSeguro`, un fallo del `add` se etiqueta `push_fallo` (impreciso, sin efecto
  en exit codes).

## Ronda 2 — APPROVED

Verificado sobre `1753e58` (+ `63e97f8`, pr-body): B1 y B2 resueltos; `git diff` de
`src/`, `test/` y `.claude/` vacío desde la ronda 1, así que trazabilidad, constitución,
anti-hack y tests (391/391) siguen vigentes. Deuda no bloqueante anotada arriba.

APPROVED -> progress/vault-sync/review.md
