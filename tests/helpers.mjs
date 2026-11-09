import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { COMMANDS, PHASES, PLANS, REPORTS } from '../scripts/lib/contracts.mjs';
import { designFingerprint, initFeature, sourceFingerprint } from '../scripts/lib/lifecycle.mjs';

export const TEST_ROOT = path.dirname(fileURLToPath(import.meta.url));
export const AT = '2026-01-01T00:00:00.000Z';
export function fixture(t) {
  const root = path.join(TEST_ROOT, `.work-${randomUUID()}`);
  fs.mkdirSync(root);
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return root;
}
export function put(root, reference, value) {
  const filename = path.join(root, reference);
  fs.mkdirSync(path.dirname(filename), { recursive: true });
  fs.writeFileSync(filename, typeof value === 'string' ? value : `${JSON.stringify(value, null, 2)}\n`);
}
export function projectFixture(root) {
  const project = {
    schemaVersion: 1, project: { name: 'example', onboardingComplete: true },
    skills: Object.fromEntries(PHASES.map(phase => [phase, `.github/skills/dev-${phase}/SKILL.md`])),
    commands: Object.fromEntries(COMMANDS.map(command => [command, ['functional', 'faultInjection', 'performance'].includes(command) ? null : `npm run ${command}`])),
    knowledge: Object.fromEntries(['architecture', 'principles', 'reviewGuidance', 'similarProducts'].map(key => [key, `.dev-agent/knowledge/${key}.md`])),
    security: { blockingSeverities: ['critical', 'high'], providers: [], allowExternalSourceSharing: false },
    monitoring: { enabled: false, releaseInventory: '.dev-agent/releases.json' }, review: { repository: null },
  };
  for (const reference of [...Object.values(project.skills), ...Object.values(project.knowledge)]) put(root, reference, 'Reference content');
  put(root, '.dev-agent/project.json', project);
  put(root, 'src/example.mjs', 'export const answer = 42;\n');
  return project;
}
export function featureFixture(root) {
  const feature = initFeature(root, 'example');
  feature.requirement = 'Provide an example feature';
  feature.options = ['option-1', 'option-2'].map(id => ({ id, ...Object.fromEntries(PLANS.map(key => [key, `${key} for ${id}`])) }));
  feature.selectedOption = 'option-1';
  feature.designRevision = designFingerprint(feature);
  feature.approvals.design = { by: 'Human reviewer', at: AT, revision: feature.designRevision };
  put(root, '.dev-agent/evidence/scan.txt', 'Durable review and test evidence');
  const source = sourceFingerprint(root);
  for (const name of REPORTS) feature.reports[name] = {
    status: 'passed', revision: name === 'designSecurity' ? feature.designRevision : source,
    evidence: ['.dev-agent/evidence/scan.txt'], findings: [],
  };
  feature.approvals.deployment = { by: 'Release manager', at: AT, revision: source };
  feature.release = { revision: source, environment: 'production', verified: true, at: AT };
  feature.dependenciesRemediated = true;
  put(root, '.dev-agent/features/example.json', feature);
  return feature;
}
export function inventoryFixture(root) {
  projectFixture(root);
  put(root, '.dev-agent/evidence/runtime.json', {
    bomFormat: 'CycloneDX', specVersion: '1.6',
    components: [{ name: 'runtime-package', version: '1.2.3', components: [{ name: 'transitive-package', version: '4.5.6' }] }],
  });
  put(root, '.dev-agent/evidence/build.json', {
    spdxVersion: 'SPDX-2.3', packages: [{ name: 'builder', versionInfo: '2.0.0' }, { name: 'transitive-builder', versionInfo: '0.3.1' }],
  });
  const inventory = { schemaVersion: 1, releases: [{
    id: 'release-1', revision: 'a'.repeat(64), supported: true,
    runtimeSbom: '.dev-agent/evidence/runtime.json', buildSbom: '.dev-agent/evidence/build.json', environment: 'production', remediated: true,
  }] };
  put(root, '.dev-agent/releases.json', inventory);
  return inventory;
}
export function packageFixture(root) {
  const project = projectFixture(root);
  for (const name of ['development', 'security', 'review']) put(root, `.github/agents/${name}.agent.md`, `Agent ${name}`);
  put(root, '.github/agents/unrelated.agent.md', 'must not copy');
  put(root, '.github/skills/unrelated/SKILL.md', 'must not copy');
  put(root, 'scripts/dev-agent.mjs', 'export const cli = true;');
  put(root, 'scripts/lib/example.mjs', 'export const library = true;');
  put(root, 'schemas/example.schema.json', '{}');
  for (const [key] of Object.entries(project.knowledge)) put(root, `templates/knowledge/${key}.md`, 'Reference content');
  put(root, 'templates/project.json', project);
  put(root, 'templates/dev-agent.gitignore', 'features/\nevidence/\nhistory/\nsecurity-results/\nvulnerabilities.json\n');
  put(root, 'templates/releases.json', { schemaVersion: 1, releases: [] });
  put(root, 'templates/vulnerabilities.json', { schemaVersion: 1, findings: [] });
  put(root, 'templates/workflows/security.yml', 'name: security');
  put(root, 'templates/workflows/not-a-workflow.txt', 'not copied');
  put(root, 'templates/dependabot.yml', 'version: 2');
  return project;
}
export function symlink(t, destination, target, type = 'file') {
  try { fs.symlinkSync(target, destination, type === 'dir' && process.platform === 'win32' ? 'junction' : type); }
  catch (error) {
    if (['EPERM', 'EACCES', 'ENOSYS'].includes(error.code)) { t.skip(`Symlink privileges unavailable: ${error.code}`); return false; }
    throw error;
  }
  return true;
}
