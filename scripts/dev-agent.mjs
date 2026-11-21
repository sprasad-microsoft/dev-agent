#!/usr/bin/env node
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { assert, workspaceRoot } from './lib/io.mjs';
import { loadProject } from './lib/contracts.mjs';
import { checkGate, designFingerprint, featureStatus, initFeature, loadFeature, sourceFingerprint } from './lib/lifecycle.mjs';
import { installWorkspace } from './lib/installer.mjs';
import { retrieveHistory } from './lib/history.mjs';
import { checkInventory } from './lib/inventory.mjs';

export { installWorkspace } from './lib/installer.mjs';
export { validateProject, validateFeature, validateReport, PHASES, COMMANDS } from './lib/contracts.mjs';
export { checkGate, designFingerprint, sourceFingerprint, featureStatus, initFeature } from './lib/lifecycle.mjs';
export { retrieveHistory } from './lib/history.mjs';
export { checkInventory, validateSbom } from './lib/inventory.mjs';

export const HELP = `Dev agent — Node.js >=22, zero runtime dependencies

Usage: node scripts\\dev-agent.mjs COMMAND [FLAGS]
  --help | help
  install --target PATH [--apply | --dry-run] [--monitoring]
  install --global [--agents-only] [--apply | --dry-run]
  install --global --skill-only [--apply | --dry-run]
  install --target PATH --agents-only [--apply | --dry-run]
  install --target PATH --skill-only [--apply | --dry-run]
  feature-init --id SLUG [--workspace PATH]
  feature-check --id SLUG --gate design|implementation|release|closure [--workspace PATH]
  feature-status --id SLUG [--workspace PATH]
  fingerprint [--kind source] [--workspace PATH]
  fingerprint --kind design --id SLUG [--workspace PATH]
  project-check [--workspace PATH]
  history --repository OWNER/REPO --output PATH [--limit 1..100] [--workspace PATH]
  inventory-check [--workspace PATH]

Install defaults to --dry-run; only --apply writes. --target must be an existing
directory, with no source/target overlap, symlinks or differing destination files.
--global installs agents and complete skill directories in ~/.copilot for the
current user, shared by VS Code's Copilot harness and GitHub Copilot CLI.
--agents-only installs the three agents and license, without skills, workspace
configuration or runtime tools. It also works with --target.
--skill-only installs complete skill directories and license, leaving existing
agents untouched. It works with --global or --target and conflicts with --agents-only.
Global or partial installs do not provide workspace evidence tools or knowledge.
--global cannot be combined with --target; --monitoring requires a full workspace
installation. Global installation never executes or modifies client settings.
--monitoring copies monitoring files only; it does not enable configuration or
external source sharing. Workspace defaults to cwd. History limit defaults to 30;
output must be a new contained workspace path. History uses read-only gh API calls.
No command deploys, pushes, grants approvals, runs project commands or scans.

Contracts (JSON Schema files under schemas\\):
  project.schema.json: schemaVersion 1; project, all ten skills, all nine
    commands (nonempty string|null), knowledge, security, monitoring, review.
  feature.schema.json: schemaVersion 1; id, requirement, options with id and
    implementationPlan, testingPlan, rollbackPlan, debuggingPlan,
    documentationPlan, rolloutPlan; selectedOption, designRevision,
    approvals {design,deployment}, reports {designSecurity,implementationSecurity,
    review,tests,documentation,rollbackRehearsal}, release, dependenciesRemediated.
    Approval: {by,at,revision}. Report: {status,revision,evidence,findings?,reason?}.
    Status: passed|failed|blocked|not-applicable. Mandatory gate reports must pass
    with existing contained evidence files. Not-applicable requires reason but
    still blocks mandatory gates, including rollback rehearsal.
    Findings: {id,severity,confidence,summary,status,exception?}; severity is
    critical|high|medium|low; confidence 0..1; status open|fixed|accepted.
    Unfixed high/critical requires exception {approvedBy,expiresAt,reason}.
    Release: {revision,environment,verified,at}. Timestamps are ISO date-time.
  releases.schema.json: schemaVersion 1; releases with id,revision,supported,
    runtimeSbom,buildSbom,environment,remediated. Both SBOMs require exact versions
    in CycloneDX components (including nested) or SPDX 2.x packages.
  history.schema.json: untriaged review records; never authoritative rules.

Revisions are lowercase SHA-256 hex. Design hashes canonical JSON of
{requirement,options,selectedOption}; object keys sort, array order is preserved.
designRevision, designSecurity report and design approval must match that hash.
Source (default fingerprint kind) hashes canonical JSON of ordered
[workspace-relative forward-slash path,SHA-256(file bytes)] pairs.
Traversal sorts each directory by filename. Source excludes directories named
.git,node_modules,coverage,dist,artifacts,temp,tmp and .dev-agent/features,
.dev-agent/evidence,.dev-agent/history,.dev-agent/security-results plus
.dev-agent/releases.json and .dev-agent/vulnerabilities.json. Config and knowledge
remain included. Symlinks fail.
All other reports, deployment approval and verified release bind source revision.
Feature-init writes blocking placeholders and refuses existing feature files.
Inventory reads project.monitoring.releaseInventory from .dev-agent/project.json.
Inventory checks structure only, not vulnerability absence or completeness.
`;

const OPTIONS = {
  help: [],
  install: ['target', 'apply', 'dry-run', 'monitoring', 'global', 'agents-only', 'skill-only'],
  'feature-init': ['workspace', 'id'],
  'feature-check': ['workspace', 'id', 'gate'],
  'feature-status': ['workspace', 'id'],
  fingerprint: ['workspace', 'id', 'kind'],
  'project-check': ['workspace'],
  history: ['workspace', 'repository', 'limit', 'output'],
  'inventory-check': ['workspace'],
};
export function parseArgs(argv) {
  const [rawCommand, ...args] = argv;
  const command = rawCommand === '--help' ? 'help' : rawCommand;
  assert(Object.hasOwn(OPTIONS, command), `Unknown command: ${command ?? '(missing)'}`);
  const options = {};
  for (let i = 0; i < args.length; i++) {
    const flag = args[i];
    assert(/^--[a-z][a-z-]*$/.test(flag), `Malformed flag: ${flag}`);
    const key = flag.slice(2);
    assert(OPTIONS[command].includes(key), `Unknown flag: ${flag}`);
    assert(!Object.hasOwn(options, key), `Duplicate flag: ${flag}`);
    if (['apply', 'dry-run', 'monitoring', 'global', 'agents-only', 'skill-only'].includes(key)) options[key] = true;
    else {
      const value = args[++i];
      assert(value !== undefined && !value.startsWith('--') && value.trim(), `Missing value for ${flag}`);
      options[key] = value;
    }
  }
  assert(!(options.apply && options['dry-run']), '--apply and --dry-run conflict');
  for (const key of command === 'install' && !options.global ? ['target'] : ['feature-init', 'feature-check', 'feature-status'].includes(command) ? ['id'] : command === 'history' ? ['repository', 'output'] : []) assert(options[key], `--${key} is required`);
  if (command === 'install') {
    assert(!options.global || options.target === undefined, '--global and --target conflict');
    assert(!(options['agents-only'] && options['skill-only']), '--agents-only and --skill-only conflict');
    assert(!options.monitoring || (!options.global && !options['agents-only'] && !options['skill-only']), '--monitoring requires a full workspace installation');
  }
  if (command === 'feature-check') assert(options.gate, '--gate is required');
  if (command === 'fingerprint') {
    assert(options.kind === undefined || ['source', 'design'].includes(options.kind), '--kind must be source or design');
    assert(options.kind !== 'design' || options.id, '--id is required for design fingerprint');
    assert(!options.id || options.kind === 'design', '--id only applies to design fingerprint');
  }
  if (options.limit !== undefined) assert(/^(?:[1-9]|[1-9][0-9]|100)$/.test(options.limit), '--limit must be 1..100');
  return { command, options };
}
export function run(argv, { cwd = process.cwd(), execute, home } = {}) {
  const { command, options } = parseArgs(argv);
  if (command === 'help') return HELP;
  if (command === 'install') return installWorkspace({
    ...(options.target ? { target: path.resolve(cwd, options.target) } : {}),
    ...(home !== undefined ? { home } : {}),
    global: !!options.global, agentsOnly: !!options['agents-only'], skillsOnly: !!options['skill-only'],
    apply: !!options.apply, monitoring: !!options.monitoring,
  });
  const root = workspaceRoot(path.resolve(cwd, options.workspace ?? '.'));
  switch (command) {
    case 'feature-init': return initFeature(root, options.id);
    case 'feature-check': return checkGate(root, options.id, options.gate);
    case 'feature-status': return featureStatus(root, options.id);
    case 'fingerprint': return { kind: options.kind ?? 'source', revision: options.kind === 'design' ? designFingerprint(loadFeature(root, options.id)) : sourceFingerprint(root) };
    case 'project-check': loadProject(root); return { passed: true };
    case 'history': return retrieveHistory({ workspace: root, repository: options.repository, output: options.output, limit: options.limit === undefined ? 30 : Number(options.limit), ...(execute ? { execute } : {}) });
    case 'inventory-check': return checkInventory(root);
  }
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    assert(Number(process.versions.node.split('.')[0]) >= 22, 'Node.js >=22 is required');
    const result = run(process.argv.slice(2));
    console.log(typeof result === 'string' ? result : JSON.stringify(result, null, 2));
    if (result.passed === false) process.exitCode = 1;
  } catch (error) {
    console.error(JSON.stringify({ passed: false, error: error.message }));
    process.exitCode = 1;
  }
}
