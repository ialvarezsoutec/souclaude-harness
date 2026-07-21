# IT Security Review Report

> Este archivo es una referencia estructural. El agente `security-evidence-compiler` debe sustituir los placeholders usando evidencia real y no debe inventar resultados.

## Review status

| Field | Value |
|---|---|
| Project | {{PROJECT}} |
| Status | {{STATUS}} |
| Review date | {{DATE}} |
| Scope | {{SCOPE}} |
| Branch | {{BRANCH}} |
| Initial commit | {{INITIAL_COMMIT}} |
| Final commit | {{FINAL_COMMIT}} |
| IT approval | PENDING |

## Executive summary

{{EXECUTIVE_SUMMARY}}

## Project identification

{{PROJECT_IDENTIFICATION}}

## Scope, exclusions and limitations

{{SCOPE_AND_LIMITATIONS}}

## Review methodology

- Native Claude Code command: `/security-review`
- SDD remediation cycles: {{REMEDIATION_CYCLES}}
- Required tests: {{TEST_SUMMARY}}

## System and attack-surface overview

{{ATTACK_SURFACE}}

## Initial findings summary

| Severity | Initial | Remediated | Open |
|---|---:|---:|---:|
| Critical | {{INITIAL_CRITICAL}} | {{FIXED_CRITICAL}} | 0 |
| High | {{INITIAL_HIGH}} | {{FIXED_HIGH}} | 0 |
| Medium | {{INITIAL_MEDIUM}} | {{FIXED_MEDIUM}} | {{OPEN_MEDIUM}} |
| Low | {{INITIAL_LOW}} | {{FIXED_LOW}} | {{OPEN_LOW}} |
| Informational | {{INITIAL_INFO}} | — | {{OPEN_INFO}} |

## Critical and High remediation traceability

| ID | Initial severity | Requirement/spec | Change | Security test | Final status |
|---|---|---|---|---|---|
| {{ID}} | {{SEVERITY}} | {{SPEC_REF}} | {{CHANGE}} | {{TEST_REF}} | REMEDIATED |

## SDD remediation specification

{{SDD_SPEC}}

## Implemented security changes

{{IMPLEMENTED_CHANGES}}

## Test and validation evidence

| Command | Purpose | Result | Evidence |
|---|---|---|---|
| {{COMMAND}} | {{PURPOSE}} | PASSED | {{EVIDENCE}} |

## Final security review results

{{FINAL_REVIEW}}

## Remaining Medium, Low and informational findings

{{REMAINING_FINDINGS}}

## Residual risk and deployment conditions

{{RESIDUAL_RISK}}

## Recommendation to IT

{{IT_RECOMMENDATION}}

## Evidence index

{{EVIDENCE_INDEX}}

## Assurance statement

En la revisión final automatizada no se identificaron hallazgos Critical o High dentro del alcance y las limitaciones declaradas. Este informe habilita la evaluación final de IT, pero no sustituye un pentest formal, la validación de infraestructura de producción ni la aprobación corporativa de despliegue.
