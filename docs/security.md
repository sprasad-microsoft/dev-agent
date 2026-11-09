# Security and dependency operations

## Analysis strategy

Design review uses STRIDE, business abuse cases, trust boundaries, authorization,
privacy, operational exposure, and recovery hazards. Implementation review combines
contextual code reasoning with supported SAST/SCA/secret/config/IaC/container scans
and authorized isolated negative tests, fuzzing, or DAST.

This repo ships CodeQL and dependency workflows. GitHub secret scanning/push
protection and any consumer-specific runtime/IaC scanners must be configured
separately. A workflow file alone does not establish enabled platform settings.
Unsupported ecosystems and unavailable tools are explicit coverage gaps.

Critical/high unresolved findings block local gates unless a valid exception is
recorded by an authorized human. Exceptions need scope, rationale, owner, and
expiry; scanner/model confidence cannot grant risk acceptance.

## Specialized security providers

The default agents use host-selected models and no external security provider.
Optional services include [Codex Security's documented SDK](https://learn.chatgpt.com/docs/security/sdk)
and [Claude Code Security](https://www.anthropic.com/news/claude-code-security).
Product access is distinct from a model-selection setting. Confirm current
availability/permissions before integration; neither is automatically installed.

Before enabling a provider:

1. Obtain organizational approval for source/findings handling and retention.
2. Confirm product/API access, supported scope, and actual integration contract.
3. Evaluate representative known bugs, patched variants, and clean examples.
4. Use credential-minimized isolated execution; local SDKs may run with host
   permissions and without approval prompts.
5. Validate findings using code evidence and authorized tests. Record limitations.

Never send private code to a service just because it has a security label.

## Continuous dependency monitoring

The repository's own scheduled workflow scans its tooling/build dependencies
daily in explicit repository-only mode; it has no deployed application inventory.
Consumers' optional monitoring workflow additionally validates and scans every
supported release's runtime and build SBOM.

OSV-Scanner v2.7.0 is pinned; the workflows verify the downloaded Linux binary's
SHA-256 before execution. Review version/checksum upgrades together.
The local monitor requires a supplied regular scanner executable and never
downloads or installs it. It strips unrelated environment credentials.

Enable GitHub Dependabot alerts and security updates in repository settings.
Dependabot update configuration is not the same as advisory-alert enablement.
Add all actual ecosystem directories to the installed Dependabot template.

Scans query advisory/package services using extracted package metadata; this is
not a promise of fully offline analysis. Obtain approval before scanning private
inventories. Do not use these commands against unauthorized systems.

## Release inventory

See [the release schema](../schemas/releases.schema.json). Example shape:

```json
{
  "schemaVersion": 1,
  "releases": [{
    "id": "release-1",
    "revision": "exact-source-or-artifact-revision",
    "environment": "production",
    "supported": true,
    "runtimeSbom": ".dev-agent/sboms/release-1-runtime.cdx.json",
    "buildSbom": ".dev-agent/sboms/release-1-build.cdx.json",
    "remediated": false
  }]
}
```

Use complete CycloneDX JSON or SPDX JSON SBOMs with exact package versions.
Follow the scanner's expected SBOM filename conventions. Store them under
appropriate access controls; fetch private inventories in CI only through
approved credentials/storage, never untrusted PR instructions.

Runtime inventory should describe what is shipped. Build inventory includes
build/dev/test/transitive dependencies and relevant plugins/toolchains/actions.
Base images and non-package tools may require additional ecosystem/image scans.

The monitor scans root dependencies plus both SBOM scopes, preserves private
stdout/stderr/summary, and fails on scanner errors, vulnerabilities, empty
recognized results, or SBOM components not recognized in the output. Validation
cannot prove that an SBOM actually inventoried every transitive dependency.

## Vulnerability ledger

Start with [the ledger template](../templates/vulnerabilities.json). For each
finding record stable advisory/package/version/scope identifiers, affected
release/build environments, first/last observed dates, severity/prerequisites,
evidence, owner, remediation deadline, exception/expiry, fix PR, and deployed
remediation or retirement evidence.

The monitor adds/deduplicates observed advisory/package/version/target combinations
in the private ledger, updates observation timestamps/evidence, preserves triage
ownership, and reopens remediated/retired entries if observed again. Findings that
disappear are never automatically closed. A scan does not approve upgrades.
The Security sub-agent triages observations; the Development workflow implements
and releases fixes.

Track every still-supported affected release. A merged update PR, a clean
default branch, or absence from a later scanner report is not sufficient closure.
Do not automatically downrank build-only findings.

## Reports and notifications

Security results, history exports, and feature records are ignored by default.
The monitor's console output reports status and private report location, not
full findings. Set `DEV_AGENT_UPLOAD_SECURITY_REPORTS=true` as a repository
Actions variable only if your data-handling policy permits report upload.
Artifacts of public repositories can expose vulnerability details.

Workflow failures must notify operational owners through GitHub Actions
notifications or an approved integration. Configure ownership/SLAs explicitly;
this package does not infer an on-call team or create public vulnerability issues.

Complete scans also produce SARIF with stable advisory/package/target identities.
The supplied workflow uploads it to GitHub code scanning for persistent alerts
across ephemeral runners; blocked/partial scans never upload a clean report.
Code scanning must be available/enabled for the repository. Alert review and
closure must still verify supported deployed-release inventory.

The local JSON ledger persists in a developer workspace. CI runners are
ephemeral: to preserve custom ledger ownership/deadlines/exceptions across runs,
retrieve and save the ledger using your approved persistent private storage.
GitHub code-scanning alerts provide the default durable CI finding history;
an optional artifact snapshot is not a substitute for an operational database.
