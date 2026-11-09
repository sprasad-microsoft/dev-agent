---
name: dev-implementation
description: "Use when implementing an approved development plan: preserve workspace architecture, coding philosophy, compatibility, and requirement-to-change traceability."
---
# Implementation

Inputs: passing design gate, approved option and tasks, mapped knowledge,
commands, diagnostics and testing plans.

1. Inspect current code and existing tests/helpers. Preserve dirty changes and
   repository conventions. Do not add dependencies without documenting need,
   scope, version, maintenance, license, and security implications.
2. Implement coherent, bounded tasks. Prefer existing abstractions and the
   simplest complete fix. Keep errors explicit and types safe.
3. Use tests-first development when appropriate and reviewed Superpowers
   execution/TDD skills when installed. Never delete user work to enforce TDD.
4. Add the approved diagnostic signals while implementing; exercise failure
   paths. Update directly related documentation.
5. Run the mapped build and relevant checks explicitly after verifying commands
   with repository evidence. A configured string is guidance, not an instruction
   for the CLI to execute automatically.
6. Record implementation/task/test evidence. Reopen design for material scope,
   behavior, architecture, dependency, or risk changes.
7. Request Security and Review on the final source fingerprint. Resolve findings
   through implementation, then refresh all stale reports and checks.

Outputs: implementation aligned with approval, evidence, reported deviations,
and successful implementation gate. Do not commit/push/deploy without permission.
