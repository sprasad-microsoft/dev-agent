# Dev Agent

A reusable, workspace-aware development lifecycle for GitHub Copilot in VS Code
and GitHub Copilot CLI.
One **Development** orchestrator loads codebase skills and delegates independent
analysis to **Security** and **Review**.

This is an agent customization and tooling package, not a hosted autonomous
service. It does not provision cloud resources or deploy applications by itself.

## Included

- Three custom agents and ten workspace-mapped skills.
- Design options with implementation, testing, rollback, debugging,
  documentation, and rollout plans for **each** option.
- Security analysis after design and after implementation.
- Review against current architecture and accepted historical PR guidance.
- Durable, revision-bound feature records and fail-closed evidence gates.
- Conflict-safe, dry-run-first workspace installation.
- Bounded, read-only GitHub review-comment retrieval.
- Runtime/build release SBOM validation and scheduled dependency monitoring.
- Pinned CI actions, CodeQL, Dependabot, tests, and coverage reporting.

## Install globally for VS Code and GitHub Copilot CLI

Install all three agents at user level so **Development** can invoke **Security**
and **Review** as sub-agents across workspaces. Both GitHub Copilot CLI and VS
Code's **Copilot** harness use the same personal directories, so one installation
serves both clients. This is not a marketplace, VSIX, or system-wide installation.

Install Node.js separately before running the installer. Version 22.8 or later is
required. Prefer the latest patch release of a supported Node.js LTS version.

Clone this repository, then run the installer commands below from the cloned
`dev-agent` directory.

### Linux

```bash
git clone https://github.com/sprasad-microsoft/dev-agent.git
cd dev-agent

# Preview agents and skills; no files or directories are created.
node scripts/dev-agent.mjs install --global

# Apply explicitly.
node scripts/dev-agent.mjs install --global --apply

# Alternative: install only the three agents, skipping all skills.
node scripts/dev-agent.mjs install --global --agents-only --apply
```

### Windows PowerShell

```powershell
git clone https://github.com/sprasad-microsoft/dev-agent.git
Set-Location dev-agent
node scripts\dev-agent.mjs install --global
node scripts\dev-agent.mjs install --global --apply

# Alternative: agents only.
node scripts\dev-agent.mjs install --global --agents-only --apply
```

### Contents and safety

| Option | Destination and contents |
|---|---|
| `--global` | `~/.copilot/agents/`: three agents; `~/.copilot/skills/`: ten complete skill directories, including assets |
| `--global --agents-only` | Three agents only; existing skills are untouched and skipped |
| Both modes | Package license in `~/.copilot/dev-agent/LICENSE` |

On Windows, `~` is the current user's home directory. The installer creates
missing destination directories only with `--apply`, refuses symlinks and
differing existing files before writing, and preserves identical files on rerun.
To add skills after an agents-only installation, rerun with `--global --apply`.
Customized agents still require manual merging; there is no force-overwrite.

`--global` cannot be combined with `--target` or `--monitoring`. Global installs
do not copy workspace configuration, knowledge templates, evidence tools, or CI
workflows and do not modify client settings. `--agents-only` also works with
`--target PATH`, installing just workspace agents and the license.

Use this on your own user account; no `sudo` is needed. With Remote SSH, WSL,
or a container, install on the machine where the Copilot harness runs.
See the official [agent locations](https://code.visualstudio.com/docs/agents/reference/custom-agent-file-reference)
and [skill locations](https://code.visualstudio.com/docs/agent-customization/agent-skills#_skill-locations),
and [Copilot CLI configuration directory](https://docs.github.com/en/copilot/reference/copilot-cli-reference/cli-config-dir-reference).
The installer targets the default personal directory; a custom CLI `COPILOT_HOME`
is not automatically followed. If you override it, manually merge the installed
files into that directory and verify discovery in both clients.

Start a fresh session after installation. In VS Code, select the Copilot harness,
open **Chat: Open Customizations**, and confirm the installed agents/skills. In
Copilot CLI, use `/agent` to choose **Development**. Verify specialist delegation
in the actual client; discovery does not guarantee every tool is supported.

### What still needs workspace setup?

The global installer uses Node.js to copy the files, and **the current
Development workflow still requires the workspace configuration and Node.js
evidence tools below**. Global discovery alone is not a runtime-free installation.
Agents-only installation is useful when a workspace already supplies the required
skills. It does not make missing skills optional or bypass lifecycle gates.

Keep architecture, principles, accepted review guidance, similar-product
references, project commands, and private feature evidence specific to each
repository. Run the workspace installer below to supply these files and tools;
it also copies workspace agents/skills. Avoid divergent same-name global and
workspace copies, and verify which source the host loads in Customizations.
Current skill mappings resolve workspace files, not home-directory paths.

Select **Development**, not the specialists, for normal work. It requests Security
after design and implementation, and Review on the final candidate before release.
If the host cannot invoke either specialist, the workflow blocks rather than
silently replacing independent review.

## Set up each workspace (required by the current workflow)

Prerequisites: a separately installed Node.js version 22.8 or later (prefer the
latest patch release of a supported LTS version), a skills-compatible Copilot
experience, and an existing target workspace. Node.js is not included in this
repository. GitHub history retrieval additionally requires
the authenticated `gh` CLI. OSV-Scanner is needed only for dependency scanning.

```powershell
git clone https://github.com/sprasad-microsoft/dev-agent.git
Set-Location dev-agent

# Inspect changes first. Nothing is written by default.
node scripts\dev-agent.mjs install --target "C:\path\to\your-repository"

# Apply explicitly; optional workflows require --monitoring.
node scripts\dev-agent.mjs install --target "C:\path\to\your-repository" --apply
```

The installer refuses differing existing destination files before any writes.
It preserves existing repository instructions and the root ignore file. It
adds a private `.dev-agent/.gitignore`; do not remove privacy rules casually.
There is no force-overwrite or automatic plugin installation.

After installation:

1. Fill `.dev-agent/project.json` and the four `.dev-agent/knowledge` references
   using actual code, commands, architecture, review outcomes, and owners.
2. Add subsystem skills and change phase mappings if the default skill needs
   specialization. Review command strings before execution.
3. Set `project.onboardingComplete` only after onboarding is genuinely complete.
   Deployment/recovery commands stay unset until your real procedures are known.
4. Run `node .dev-agent\tools\dev-agent.mjs project-check`.
5. Reopen/reload the VS Code workspace if necessary, select **Development**, and
   provide a requirement. Verify the three agents and ten skills are discovered.

Native skill loading, tool aliases, and sub-agent invocation vary by host/version.
If the host cannot invoke the specialists, the orchestrator must block rather
than silently self-review.

See [workspace onboarding](docs/onboarding.md) and
[lifecycle/evidence gates](docs/lifecycle.md).

## Superpowers reuse

The optional integration reuses reviewed Superpowers workflows when installed;
this repository does not copy or vendor upstream instructions.
[Integration guidance](docs/superpowers.md) explains compatibility, the pinned
review baseline, and safety overrides. The local lifecycle works independently.

## Dependency monitoring

Install optional workflows with:

```powershell
node scripts\dev-agent.mjs install --target "C:\path\to\your-repository" --apply --monitoring
```

Choose this during initial installation. If the workspace is already customized,
merge the optional workflow templates manually; reinstalling never overwrites
different existing configuration.

Review the workflow files before committing. Configure actual dependency
ecosystems, enable advisory alerts, explicitly enable monitoring, and populate
supported release inventories with runtime **and** build SBOMs.
Empty/malformed/missing release inventory blocks release monitoring.

```powershell
node .dev-agent\tools\dev-agent.mjs inventory-check
node .dev-agent\tools\monitor-dependencies.mjs --scanner "C:\tools\osv-scanner.exe"
```

There is an explicit `--repository-only` mode for tooling repositories with no
deployed releases; it never claims post-release coverage.
See [security and dependency operations](docs/security.md).

## Develop this package

```powershell
npm ci --ignore-scripts
npm run check
npm run test:coverage
node scripts\dev-agent.mjs help
```

Runtime installation needs no npm dependencies. The YAML package is development
tooling for validating customization/workflow syntax.

Tests exercise positive/negative gates, stale evidence, installer conflicts and
path/link safety, review retrieval, inventory validation, and scanner failures.
Optional real-scanner integration tests are documented in
[evaluation](docs/evaluation.md).

## Important boundaries

- Local approval JSON is a human decision record, **not authenticated authorization**.
- Protected branches, required CI checks, and production environment reviewers
  must be configured by repository administrators.
- Security providers/models are not installed or contacted by default.
- A passing gate does not prove tests ran honestly, absence of vulnerabilities,
  successful deployment, or completeness of the dependency inventory.
- Findings, diagnostics, and history exports are private by default. Public
  workflow artifacts may expose them; report uploading is explicit opt-in.
- Consumers own production commands, diagnostic access, SBOM storage, supported
  release inventory, applicability decisions, and remediation SLAs.

## License

The original implementation is [MIT licensed](LICENSE). Optional upstream
integrations retain their own licenses and are installed separately.
