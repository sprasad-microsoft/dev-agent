---
name: dev-deployment
description: "Use for release readiness, staged production rollout, post-deployment verification, and authorized rollback with repository-specific commands and approvals."
---
# Deployment and rollback

Inputs: approved rollout/rollback plans, current implementation/security/review
evidence, documentation, release inventory, and human deployment approval.

1. Validate package/artifact provenance, environment, permissions, configuration,
   schema compatibility, flags, dependency inventory, and health checks.
2. Rehearse rollback in staging. Record data recovery or roll-forward procedures
   for irreversible operations; an old binary may not reverse data mutations.
3. Run the release gate. Obtain human authorization bound to the final candidate.
   Use protected CI environments and least-privilege deployment credentials.
   Local JSON approval records do not enforce access control.
4. Execute only explicitly approved commands. Roll out in bounded stages with
   agreed duration, exposure, health thresholds, and abort criteria.
5. Capture actual deployment revision and environment. Verify readiness and
   sustained health, not just command exit or an HTTP 200 from an unrelated page.
6. If a trigger fires, stop expansion. Perform rollback only under explicit
   authorization or a documented pre-approved bounded automation policy.
   Reverify service/data health and record residual risks.
7. Associate each supported release with runtime and build SBOMs. Invoke
   dependency-security monitoring and record operational ownership.

Outputs: release/recovery evidence, verified revision, inventory, and closure
check. This package never supplies generic production credentials or commands.
