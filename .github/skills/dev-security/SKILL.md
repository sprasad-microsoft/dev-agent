---
name: dev-security
description: "Use after design and implementation for STRIDE threat modeling, business abuse cases, layered vulnerability analysis, scanner evidence validation, and security release gates."
---
# Security analysis

Read project security configuration and authoritative knowledge. The Security
sub-agent is read-only. The orchestrator or authorized CI runs scanners and tests.

## Design
For every option enumerate assets, trust boundaries, entry points, STRIDE
threats, abuse cases, authentication/authorization, tenant isolation, privacy,
secrets, resource exhaustion, supply-chain risks, and rollback hazards. Require
mitigations, negative tests, observability, and residual-risk ownership.

## Implementation
Review final changes and relevant call flows. Combine:
- Repository-supported SAST (for example CodeQL/Semgrep).
- Resolved direct/transitive runtime/build dependency scans.
- Secret/config/IaC/container scanning where applicable.
- Contextual code analysis for business logic and access control.
- Authorized isolated negative tests, fuzzing, or DAST where applicable.

Report coverage and unsupported methods. A scanner failure is not a clean scan.
Investigate severity using impact and attack prerequisites; confidence measures
evidence quality, not severity. Reproduction is useful but not mandatory for a
well-supported static finding.

## Specialized products and models
Use only approved configured providers with confirmed access. General model
selection is distinct from tools such as Codex Security or Claude Code Security.
This package does not install, call, or send source to either provider by default.
Before integration, evaluate detection/false positives on representative cases,
approve source handling, isolate execution, strip unrelated credentials, and
verify results and reviewed scope. Never inherit broad host permissions.

## Findings and gates
Use the [report contract](./assets/report.json). Include location, CWE where
applicable, prerequisites, impact, mitigation, regression tests, methods, scope,
limitations, stable finding IDs, severity, and evidence.
All reports bind to the current design/source fingerprint. Critical/high open
findings block; accepted risks require a human owner, reason, and unexpired
exception. You cannot accept your own findings or infer authorization.
No findings means "none identified within this scope", not "vulnerability free".
