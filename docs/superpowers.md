# Optional Superpowers integration

[Superpowers](https://github.com/obra/superpowers) is the closest reusable
skills-first workflow foundation found during planning. Its workflows can
complement workspace skills for brainstorming, writing/executing plans, TDD,
systematic debugging, and verification.

This package's original instructions and gates run independently. Upstream
instructions are not copied, vendored, downloaded, or enabled by the installer.
The [upstream metadata](../templates/upstream.json) records a review baseline,
not proof that a marketplace install resolves to that revision.

## Enable deliberately

1. Review a specific upstream release/commit and its scripts/hooks.
2. Verify installation and tool compatibility with your actual Copilot harness.
   The upstream README documents a Copilot CLI marketplace plugin; VS Code
   plugin/skill support must be tested in the installed version.
3. Use upstream's documented installation procedure. If marketplace tooling
   cannot pin a version, verify its resolved revision before use and updates.
4. Confirm skill discovery, sub-agent invocation, design approval, and verification
   on a safe pilot workspace.
5. Record the reviewed installed revision and enable the workspace integration
   metadata only after the pilot passes.

Never install several competing lifecycle orchestrators by default.
Review upstream updates; do not enable untrusted hooks or automatic source sharing.

## Composition

The Development agent first resolves workspace guidance, then reuses an available,
reviewed upstream process skill where it fits. Workspace-specific architecture,
testing, debugging, deployment, review history, and security evidence remain
authoritative within applicable platform/user policies.

Local gates always require Security after design and implementation and independent
Review before release. Never let upstream execution skip these checks or erase
existing work to enforce a process convention.
