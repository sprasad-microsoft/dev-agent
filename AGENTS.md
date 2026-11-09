# Working on Dev Agent

This repository packages agent instructions, not an autonomous production service.
Read `.dev-agent/project.json` and the relevant workspace skills before changes.
Use Node.js 22.8 or later. Runtime tools use only the Node.js standard library.
YAML is a development-only dependency used to validate package metadata.

Run `npm ci`, `npm run check`, and `npm run test:coverage` before publishing.
Never bypass failing checks. Test installers against temporary workspaces.
Do not overwrite consumer customizations, execute configured project commands
implicitly, or publish feature evidence containing private code or diagnostics.

Keep the three agents, ten skill mappings, schemas, installer, and documentation
consistent. Changes to evidence contracts require positive and negative gate tests.
Pin GitHub Actions to full commit SHAs and review updates through pull requests.
Use repository/environment protection for authorization; local JSON approvals are
records of human decisions, not an authorization boundary.
