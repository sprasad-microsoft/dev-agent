---
name: dev-design
description: "Use when designing development requirements: inspect architecture, research comparable products, compare options, and plan implementation, tests, rollback, diagnostics, docs, and rollout."
---
# Design

Read the mapped architecture, principles, similar-products, and applicable
subsystem references from `.dev-agent/project.json`. Trace current relevant code
before asking questions answered by the workspace. Identify behavior, ownership,
compatibility, privacy, performance, and deployment constraints.

1. Clarify requirements, users, acceptance criteria, exclusions, and uncertainty.
2. Look for existing helpers and similar implementations. Consult the curated
   similar-products list using authoritative public documentation. Explain which
   comparisons transfer to this architecture; do not copy code or disclose
   private requirements to search services.
3. Produce viable options with trade-offs and the full
   [option contract](./assets/option.md). A justified single option is acceptable;
   do not create artificial alternatives.
4. Capture all six plans as nonempty fields in the feature's `options`. Include
   measurable acceptance criteria in the testing plan and diagnostic acceptance
   criteria in the debugging plan.
5. Request Security design review covering every option. Record its report at
   the design fingerprint for the selected option; reselection requires a new
   fingerprint/report and approval.
6. Present options, findings, risks, and recommendations to the human. Record
   the chosen option and their explicit revision-bound approval. Run the design
   gate before implementation. Design-only requests stop here.

Outputs: requirement, options, security review, selection, human approval, and
passing design gate. Unknown architecture or missing security review blocks.
