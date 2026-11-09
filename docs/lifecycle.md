# Lifecycle and evidence gates

## Commands

Use `node scripts/dev-agent.mjs` in this repo and
`node .dev-agent/tools/dev-agent.mjs` in an installed workspace.
Workspace commands support `--workspace PATH`; otherwise they use the current
working directory.

```powershell
node .dev-agent\tools\dev-agent.mjs feature-init --id example-feature
node .dev-agent\tools\dev-agent.mjs feature-status --id example-feature
node .dev-agent\tools\dev-agent.mjs fingerprint --kind design --id example-feature
node .dev-agent\tools\dev-agent.mjs fingerprint
node .dev-agent\tools\dev-agent.mjs feature-check --id example-feature --gate design
```

The new feature record is intentionally incomplete and cannot pass a gate.
Edit it using [the feature schema](../schemas/feature.schema.json).
Attach real private evidence files, not success-shaped placeholders.

## Sequence

1. Discover workspace skills/knowledge and clarify the requirement.
2. Design viable options, each with all six delivery plans and measurable exits.
3. Security reviews every option; present findings before human approval.
4. Record the chosen option, current design-security report, and human approval.
5. Implement approved work, tests, diagnostics, and documentation.
6. Security and Review independently assess the final candidate and actual checks.
7. Resolve findings; rerun checks/reviews affected by changed source.
8. Verify rollback rehearsal, release readiness, and human deployment approval.
9. Deploy under externally enforced authorization, verify health and revision,
   update runtime/build SBOM inventory, and track dependency remediation.

Material design changes require new review and approval. Changing the selected
option invalidates design-bound records even if its prose remains unchanged.

## Gate contract

| Gate | Required evidence |
|---|---|
| design | Nonempty requirement/options; six plans per option; valid selection; current Security design report and explicit design approval |
| implementation | Design gate plus current passing tests, implementation Security, and Review reports |
| release | Implementation gate, completed onboarding, required commands, current documentation/rollback-rehearsal reports, deployment approval |
| closure | Release gate, verified current release and explicit dependency remediation attestation |

Reports contain status, revision, evidence paths, and optional findings. Mandatory
reports do not accept not-applicable. Failed, blocked, absent, malformed, stale,
or inaccessible evidence blocks. Open critical/high findings block unless the
record contains an authorized, scoped, unexpired exception. A finding marked
accepted without a valid exception is not sufficient.

Findings should include stable IDs, impact/prerequisites, mitigation, and
regression-test recommendations in their attached detailed report.

## Fingerprints and evidence

Design hashes bind requirement, option plans, and selection. Source hashes bind
workspace file content, including configuration and knowledge. Generated/private
feature, evidence, history, security-result directories and dependency/build
output directories are excluded to avoid recursive report hashes.
File ordering is deterministic; source bytes must match when moving evidence
across machines, including line-ending differences.

Finish documentation/source changes before generating the final source
fingerprint. Then attach report files in ignored private evidence storage.
Changing tracked source, knowledge, or config requires refreshed reports.

Approvals contain a human identity, timestamp, and applicable revision. The
orchestrator records an actual human decision, never its own authorization.
The CLI cannot authenticate those assertions.

## Hard authorization and CI

The optional workspace workflow validates config and manually supplied sanitized
records. It does **not** enforce every consumer's production rollout automatically.
Private local records are not present in normal checkouts.

A repository administrator must:

- Require successful project build/tests/security checks before merge.
- Protect the default branch and disallow bypass where appropriate.
- Protect production environments with designated reviewers.
- Retrieve trusted revision-bound evidence from approved storage.
- Keep deployment credentials away from untrusted PR jobs.
- Reject missing/stale evidence in the actual protected release pipeline.

Inspect real successful check names before configuring required checks; don't
assume job labels are the platform's final check context.

## Recovery/debugging

A failing command returns nonzero and an explicit error. Diagnose missing paths,
configuration, evidence revisions, scanner coverage, or expired exceptions;
do not edit approval/finding records merely to make a gate green.
After interruption, read `feature-status`, inspect evidence, recompute applicable
fingerprints, and resume from the earliest valid phase.
