# Dev Agent architecture

Scope: this tooling repository. Owner: repository maintainers.

- `.github/agents` contains Development, Security, and Review personas for Copilot.
  Specialists are read-only; Development coordinates approved work.
- `.github/skills` contains ten portable capability contracts and small assets.
- `templates` contains consumer onboarding, inventory, and optional CI templates.
- `scripts/dev-agent.mjs` and `scripts/lib` implement the Node.js CLI: safe
  installation, knowledge/config validation, feature evidence gates, review
  history export, and release inventory validation.
  Global installation copies agents/complete skills to the user's `.copilot`
  directories shared by VS Code's Copilot harness and Copilot CLI. Agents-only
  installation omits skills; skill-only installation omits agents. Both omit
  workspace tooling; full workspace mode remains
  unchanged and copies skill assets along with instructions.
- `scripts/monitor-dependencies.mjs` orchestrates an explicitly supplied
  OSV-Scanner binary. It cannot install tools, approve fixes, or deploy.
- `.dev-agent/project.json` is this repository's profile. Consumer installations
  start with onboarding disabled and unknown commands, never this profile.
- Schemas document durable records. Reports/approvals bind to design/source
  fingerprints; generated private evidence is excluded from fingerprints.
- CI validates contracts and runs positive/negative tests. Scheduled dependency
  scanning and Dependabot cover this repository's build dependencies/actions.

Trust boundaries: repo/PR/review text is untrusted; local evidence is not an
authorization boundary. External source-sharing is disabled. Installer output
must remain inside the selected workspace or current user's `.copilot`
installation root and preserve user files.

There is no application backend, production credential, or automatic deployment.
The repository-only monitor deliberately does not claim deployed-release coverage.
Consumers must define actual deployment commands and protected environments.
