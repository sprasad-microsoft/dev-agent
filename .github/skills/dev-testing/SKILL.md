---
name: dev-testing
description: "Use to plan, write, and run unit, functional, fault-injection, coverage, and performance tests using the codebase's actual test harness and acceptance criteria."
---
# Testing

Read mapped test commands and knowledge. Do not invent framework flags or
silently omit unsupported checks. Establish applicability with the human during
design; missing required commands is a blocker.

1. Build a [requirement matrix](./assets/matrix.md). Cover changed behavior,
   boundaries, invalid input, failure/recovery, concurrency, permissions, and
   compatibility. Prefer representative existing fixtures and harnesses.
2. **Unit:** isolate the behavior; assert outputs and failure contracts. Avoid
   mocks that replace the logic under test.
3. **Functional:** exercise real component boundaries and user/API workflows in
   an approved environment. Validate persistence and externally visible results.
4. **Fault injection:** simulate timeouts, unavailable dependencies, malformed
   data, partial writes, and resource pressure where relevant. Define blast radius,
   cleanup, and abort criteria. Never inject faults into production by default.
5. **Coverage:** capture the existing tool's line/branch results, changed-code
   gaps, and threshold checks. Percentages alone do not establish risk coverage.
6. **Performance:** for performance-sensitive features, compare baseline and
   candidate under equivalent hardware, data, load, warmup, and duration. Repeat
   runs; report latency percentiles, throughput, resources, variability, and
   agreed regression thresholds. Do not claim a win from a single noisy run.
7. **Diagnostics:** induce an approved failure and prove the debugging plan's
   collected signals distinguish it and correlate the relevant operations.
8. Record commands, environment, revision, outcomes, and evidence. Missing,
   skipped, failed, or unsupported checks must be visible. Only a real passing
   run can produce the mandatory `tests` report.

Outputs: complete acceptance mapping, test results, coverage gaps, performance
results when applicable, and revision-bound report.
