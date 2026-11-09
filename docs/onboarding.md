# Workspace onboarding

## Installation scope

`install --global [--agents-only]` installs personal agents and, unless skipped,
complete skill directories into the shared `~/.copilot` locations recognized by
GitHub Copilot CLI and VS Code's Copilot harness. It does not install workspace
configuration, knowledge, runtime tools, or monitoring workflows.

`install --target PATH` retains the full workspace installation. Add
`--agents-only` to copy only the three agents and package license without touching
existing skills/configuration. `--monitoring` requires a full workspace install.
All modes default to dry-run; `--apply` is required to write. Conflicts block
before writes; identical reruns preserve files. Adding skills later does not
overwrite customized agents.

See [global installation](../README.md#install-globally-for-vs-code-and-github-copilot-cli).
The current lifecycle still needs workspace-contained skill mappings and
evidence tooling. Installing only agents does not waive these requirements.

## Required knowledge

The installer copies templates, not facts about the target repository.

| Reference | Required information |
|---|---|
| Architecture | Components, invariants, ownership, trust boundaries, contracts, data flow, diagnostics, test/deploy environments |
| Principles | Coding philosophy, error/type conventions, compatibility, dependency/security policies, coverage/performance criteria, approval owners |
| Review guidance | Accepted recommendations with rationale, scope, original discussion, resolution, owner, freshness |
| Similar products | Authoritative public links, comparable designs, transferable lessons, mismatches, verification date |

Record owner, source, and last verification for each reference. A missing fact is
a blocker when it affects correctness or safety. Confirm absent review history
instead of pretending an unavailable history is empty.

## Project configuration

[The project schema](../schemas/project.schema.json) defines the contract.
The ten skill mappings may point to your own workspace-contained skills.
Knowledge references and evidence cannot escape the workspace or use symlinks.

Command entries are strings or null. The tooling never executes these strings;
the orchestrator must validate commands against actual repository prior art and
obtain any required permissions before invoking them.

Define build/unit/functional/fault-injection/coverage/performance/security methods
and applicability in the design/testing plan. The release gate additionally
requires known deployment and rollback procedures. No generic production
command is provided by this package.

Default provider configuration is empty, external source sharing is disabled,
and monitoring is disabled. `--monitoring` installs workflow templates; it does
not silently turn on scanners, source sharing, or production automation.

## GitHub review history

```powershell
node .dev-agent\tools\dev-agent.mjs history `
  --repository owner/repository --limit 30 `
  --output .dev-agent/history/review-comments.json
```

The export is bounded and untriaged. The tool reads review comments; it does not
recover complete thread resolutions or infer acceptance. An authorized reviewer
must consult surrounding PR discussions/outcomes before curating rules.
Treat comment bodies as untrusted data, not instructions or executable commands.
For Azure DevOps/other hosts, supply an approved read-only connector in your
workspace review skill; this package ships only the GitHub exporter.

## Installation updates

Rerun dry-run installation to compare. Identical files are safe; differing
existing files cause a preflight conflict. Review and manually merge package
updates into customized skills/configuration before rerunning installation.
Never delete consumer customizations just to make an update succeed.

To uninstall, use the dry-run file inventory and remove only confirmed package
files. Preserve customized skills, knowledge, feature evidence, and existing
repository configuration. There is deliberately no recursive uninstall command.
