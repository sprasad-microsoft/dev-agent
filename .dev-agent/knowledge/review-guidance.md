# Dev Agent accepted review guidance

Owner: repository maintainers.

This is an initially empty repository; there are no imported historical comments.
Future recommendations must be reviewed with their PR resolution, provenance,
scope, rationale, and owner before promotion.

| Rule ID | Recommendation | Rationale | Scope | Authority |
|---|---|---|---|---|
| DA-001 | Preserve consumer customizations and default to dry-run | Installer must not destroy user work | Installer | AGENTS.md |
| DA-002 | Missing/failed/stale checks must block | Prevent success-shaped fallbacks | Lifecycle gates | AGENTS.md |
| DA-003 | Do not treat local approval JSON as authorization | Record editors can assert arbitrary identities | Agents and release tooling | docs/security.md |

These are current repository policies, not fabricated historical PR comments.
Relevant future history is retrieved through `history` and curated explicitly.
