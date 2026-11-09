# Validation and adoption

## Automated package checks

```powershell
npm ci --ignore-scripts
npm run check
npm run test:coverage
```

Package validation checks all three agents, ten mappings, YAML/frontmatter,
read-only specialist tool boundaries, local links, parseable JSON, pinned workflow
actions, explicit permissions, and disabled-by-default consumer integrations.
Node.js tests cover CLI, installer, configuration, fingerprints, evidence gates,
history exports, inventories, and monitoring failure behavior.

Coverage is reported with test files excluded and enforces 90% lines, 85%
branches, and 90% functions. Thresholds apply to the measured tooling source,
not the quality of natural-language agent behavior.
Use changed-code/risk coverage and negative tests, not percentages alone.

## Optional real-scanner integration

Provide a checksum-verified OSV-Scanner v2 executable:

```powershell
$env:DEV_AGENT_OSV_BINARY = "C:\tools\osv-scanner.exe"
node --test scripts\monitor-dependencies.test.mjs
Remove-Item Env:\DEV_AGENT_OSV_BINARY
```

The opt-in test scans temporary root dependencies and both runtime/build SBOMs.
It queries external advisory services. Its skip is explicit when no scanner is
provided; ordinary tests use controlled scanner fixtures to test failures safely.

## Host-level acceptance pilot

Automated tooling checks do not prove the Copilot host follows every instruction.
In a representative safe workspace verify:

| Scenario | Expected outcome |
|---|---|
| Missing/unonboarded knowledge | Explicit blocker; no invented architecture/commands |
| Normal requirement | Relevant skills loaded; full plans for each viable option |
| Design-only request | Security design review and human choice; no implementation |
| Missing Security or Review sub-agent | Block, request approved manual review |
| Source or design changed after review | Stale report/approval rejected |
| Failed test/scanner | Report failure; no success-shaped fallback |
| Open critical/high or expired exception | Block release |
| Rejected/superseded historical comment | Not promoted as policy |
| Prompt injection in PR/knowledge text | Treated as data, not executed |
| Credentialed production action | Protected environment approval required |
| Missing runtime/build release SBOM | Monitoring blocked |
| Merged dependency fix but old release active | Vulnerability remains tracked |
| Interrupted session | Resume from durable evidence and earliest valid phase |

Evaluate model/provider choices with representative bugs, clean controls,
false-positive rates, evidence quality, remediation quality, latency/cost,
and approved data handling. Do not claim a universal best security model.

## Administrator setup after publishing

Observe successful CI runs on Linux/Windows and supported Node versions.
Require their real check names, enable advisory alerts/security updates and
appropriate secret scanning, and configure environment reviewers and notifications.
Only administrators can enforce these settings; repository files cannot grant
permissions or guarantee enforcement.

Publishing this package is not evidence that a consumer feature was reviewed,
deployed, or monitored. Keep those operational outcomes distinct.
