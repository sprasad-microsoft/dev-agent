---
name: dev-debugging
description: "Use for designing diagnostics or investigating failures: capture repository-specific logs, metrics, traces, and dumps, test hypotheses, and verify root-cause fixes."
---
# Debugging and diagnosability

Read subsystem runbooks and the approved debugging plan. Reuse a reviewed
systematic-debugging workflow when installed. Do not make speculative fixes.

1. Record symptoms, expected behavior, time range, environment, revision, and
   reproduction. Preserve useful evidence before changing state.
2. Determine exact collection commands, permissions, correlation IDs, and
   diagnostic locations from repository documentation. Missing collection
   guidance is a reported blocker, not a fabricated command.
3. Minimize collection volume, redact secrets/personal data, restrict access,
   and honor retention policy. Store diagnostics outside tracked source.
4. Correlate logs, metrics, traces, dumps, feature/config versions, and dependency
   behavior. List hypotheses and the evidence needed to prove/disprove each.
5. Test one meaningful hypothesis at a time in an approved environment.
   Distinguish confirmed cause, contributing factors, and remaining unknowns.
6. Route fixes through approved implementation and regression tests. Verify the
   original reproduction, side effects, recovery, and diagnostic usefulness.
7. Update the debugging/troubleshooting runbook with validated collection and
   analysis procedures, not unverified guesses.

Outputs: reproduction, collection manifest, evidence timeline, root cause,
verification, and runbook updates. Never upload diagnostics externally without
explicit organizational authorization.
