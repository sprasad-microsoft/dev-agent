---
name: dev-dependency-security
description: "Use on dependency changes, releases, advisories, or scheduled runs to monitor runtime/build/transitive dependencies and track fixes through deployed remediation."
---
# Dependency security

A skill cannot schedule itself. CI/advisory services detect findings; this skill
defines investigation and remediation. Invoke Security for contextual triage.

1. Inventory exact resolved direct/transitive runtime, build/dev/test dependencies,
   CI actions, toolchains, plugins, and base images. Build-only can expose signing
   credentials or alter shipped artifacts; do not automatically downgrade it.
2. Produce runtime and build CycloneDX/SPDX SBOMs and associate them with every
   supported deployed release in `.dev-agent/releases.json`. A default-branch
   lockfile is not a historical deployment inventory.
3. Enable repository advisory alerts and update PRs where supported. Install the
   optional scheduled monitoring template only after reviewing its permissions
   and approving advisory queries/artifact retention.
4. Run repository/dependency scans on change and release. Rescan supported release
   inventories on schedule and new advisories. Validate the inventory first;
   missing SBOMs, unsupported formats, or unavailable scanners block.
5. Maintain `.dev-agent/vulnerabilities.json` using the ledger template. Record
   advisory IDs, versions, scope, affected releases/build environments, evidence,
   owner, deadline, exceptions with expiry, fix PR, and deployment status.
   The monitor adds/deduplicates observed findings and reopens reappearing fixed
   findings; humans/agents supply triage and verified closure evidence.
6. Assess exploit prerequisites, exposure, reachability (with stated tool limits),
   active exploitation, and impact. Known CVE scanning does not detect every
   malicious dependency or novel flaw.
7. Route updates through implementation/testing/Security/Review and authorized
   release. Close only after affected releases/build environments are remediated
   or retired and evidence is attached; a merged PR alone is insufficient.
8. Alert owners on scan failures and overdue findings. Do not auto-merge patches,
   grant exceptions, or run production fixes from scheduled monitoring.

The supplied monitoring script validates inventory, scans root lockfiles and
supported release SBOMs with an explicitly supplied OSV-Scanner binary, persists
private scan evidence, and exits nonzero on failures/findings. It does not
automatically publish security details or claim all inventory components were
recognized by an advisory database.
