import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { checkGate, designFingerprint, featureStatus, initFeature, sourceFingerprint } from '../scripts/lib/lifecycle.mjs';
import { loadProject, validateFeature, validateProject } from '../scripts/lib/contracts.mjs';
import { AT, featureFixture, fixture, projectFixture, put, symlink } from './helpers.mjs';

const now = Date.parse('2026-02-01T00:00:00.000Z');
function setup(t) {
  const root = fixture(t);
  const project = projectFixture(root);
  const feature = featureFixture(root);
  return { root, project, feature };
}
for (const gate of ['design', 'implementation', 'release', 'closure']) test(`${gate} passes with complete current evidence`, t => {
  const { root } = setup(t);
  assert.equal(checkGate(root, 'example', gate, { now }).passed, true);
});
test('feature-init placeholders block all gates and never overwrite', t => {
  const root = fixture(t); projectFixture(root);
  initFeature(root, 'new-feature');
  assert.throws(() => initFeature(root, 'new-feature'), /overwrite/);
  const status = featureStatus(root, 'new-feature');
  assert.equal(Object.values(status).every(value => !value.passed), true);
});
for (const id of ['../evil', 'Feature', '-dash', 'has spaces', '', 'x/y']) test(`feature id rejects ${JSON.stringify(id)}`, t => {
  assert.throws(() => initFeature(fixture(t), id), /slug/);
});
const gateFailures = [
  ['empty requirement', 'design', f => { f.requirement = ''; }, /requirement/],
  ['empty testing plan', 'design', f => { f.options[1].testingPlan = ''; }, /testingPlan/],
  ['duplicate options', 'design', f => { f.options[1].id = f.options[0].id; }, /Duplicate/],
  ['missing selected option', 'design', f => { f.selectedOption = null; }, /Select/],
  ['unknown selected option', 'design', f => { f.selectedOption = 'unknown'; }, /selectedOption/],
  ['stale design inputs', 'design', f => { f.options[1].rolloutPlan += ' changed'; }, /stale/],
  ['stale selected option', 'design', f => { f.selectedOption = 'option-2'; }, /stale/],
  ['missing design revision', 'design', f => { f.designRevision = null; }, /stale/],
  ['missing design approval', 'design', f => { f.approvals.design = null; }, /human approval/],
  ['stale design approval', 'design', f => { f.approvals.design.revision = 'b'.repeat(64); }, /approval stale/],
  ['future design approval', 'design', f => { f.approvals.design.at = '2099-01-01T00:00:00Z'; }, /future-dated/],
  ['missing design security', 'design', f => { f.reports.designSecurity = null; }, /report missing/],
  ['missing implementation scan', 'implementation', f => { f.reports.implementationSecurity = null; }, /report missing/],
  ['stale tests', 'implementation', f => { f.reports.tests.revision = 'b'.repeat(64); }, /stale/],
  ['failed review', 'implementation', f => { f.reports.review.status = 'failed'; }, /must pass/],
  ['blocked tests', 'implementation', f => { f.reports.tests.status = 'blocked'; }, /must pass/],
  ['missing review', 'implementation', f => { f.reports.review = null; }, /report missing/],
  ['N/A security', 'implementation', f => { f.reports.implementationSecurity.status = 'not-applicable'; f.reports.implementationSecurity.reason = 'Not scanned'; }, /must pass/],
  ['N/A tests', 'implementation', f => { f.reports.tests.status = 'not-applicable'; f.reports.tests.reason = 'Not run'; }, /must pass/],
  ['N/A documentation', 'release', f => { f.reports.documentation.status = 'not-applicable'; f.reports.documentation.reason = 'Not written'; }, /must pass/],
  ['N/A rollback', 'release', f => { f.reports.rollbackRehearsal.status = 'not-applicable'; f.reports.rollbackRehearsal.reason = 'Not rehearsed'; }, /must pass/],
  ['empty evidence', 'implementation', f => { f.reports.tests.evidence = []; }, /durable evidence/],
  ['missing evidence file', 'implementation', f => { f.reports.tests.evidence = ['missing.txt']; }, /Missing file/],
  ['evidence path escape', 'implementation', f => { f.reports.tests.evidence = ['../evidence.txt']; }, /Traversal/],
  ['absolute evidence', 'implementation', f => { f.reports.tests.evidence = ['C:\\evidence.txt']; }, /Absolute/],
  ['evidence not array', 'implementation', f => { f.reports.tests.evidence = 'scan'; }, /array/],
  ['report unknown field', 'implementation', f => { f.reports.tests.approved = true; }, /unknown/],
  ['report malformed revision', 'implementation', f => { f.reports.tests.revision = 'abc'; }, /SHA-256/],
  ['report invalid status', 'implementation', f => { f.reports.tests.status = 'success'; }, /invalid/],
  ['approval empty author', 'design', f => { f.approvals.design.by = ''; }, /nonempty/],
  ['approval malformed timestamp', 'design', f => { f.approvals.design.at = 'yesterday'; }, /timestamp/],
  ['missing deployment approval', 'release', f => { f.approvals.deployment = null; }, /human approval/],
  ['stale deployment approval', 'release', f => { f.approvals.deployment.revision = 'b'.repeat(64); }, /approval stale/],
  ['missing documentation', 'release', f => { f.reports.documentation = null; }, /report missing/],
  ['missing rollback rehearsal', 'release', f => { f.reports.rollbackRehearsal = null; }, /report missing/],
  ['unverified release', 'closure', f => { f.release.verified = false; }, /verified/],
  ['stale release', 'closure', f => { f.release.revision = 'b'.repeat(64); }, /verified/],
  ['missing release', 'closure', f => { f.release = null; }, /verified/],
  ['future release', 'closure', f => { f.release.at = '2099-01-01T00:00:00Z'; }, /future-dated/],
  ['dependencies not remediated', 'closure', f => { f.dependenciesRemediated = false; }, /Dependencies/],
];
for (const [name, gate, mutate, error] of gateFailures) test(`${name} blocks ${gate}`, t => {
  const { root, feature } = setup(t); mutate(feature);
  put(root, '.dev-agent/features/example.json', feature);
  assert.throws(() => checkGate(root, 'example', gate, { now }), error);
});
const finding = { id: 'SEC-1', severity: 'high', confidence: 0.95, summary: 'Security finding', status: 'open' };
for (const severity of ['critical', 'high']) for (const status of ['open', 'accepted']) test(`${status} ${severity} blocks without exception`, t => {
  const { root, feature } = setup(t);
  feature.reports.review.findings = [{ ...finding, severity, status }];
  put(root, '.dev-agent/features/example.json', feature);
  assert.throws(() => checkGate(root, 'example', 'implementation', { now }), /nonexpired approved exception/);
});
for (const expiresAt of [AT, '2026-02-01T00:00:00.000Z']) test(`exception expired at ${expiresAt} blocks`, t => {
  const { root, feature } = setup(t);
  feature.reports.review.findings = [{ ...finding, exception: { approvedBy: 'Human', expiresAt, reason: 'Risk accepted' } }];
  put(root, '.dev-agent/features/example.json', feature);
  assert.throws(() => checkGate(root, 'example', 'implementation', { now }), /nonexpired/);
});
for (const status of ['open', 'accepted']) test(`approved unexpired ${status} exception passes`, t => {
  const { root, feature } = setup(t);
  feature.reports.review.findings = [{ ...finding, status, exception: { approvedBy: 'Human', expiresAt: '2027-01-01T00:00:00Z', reason: 'Risk accepted' } }];
  put(root, '.dev-agent/features/example.json', feature);
  assert.equal(checkGate(root, 'example', 'closure', { now }).passed, true);
});
for (const mutate of [
  f => { f.confidence = 2; }, f => { f.confidence = '1'; }, f => { f.severity = 'informational'; },
  f => { f.exception = { approvedBy: '', expiresAt: AT, reason: 'Risk' }; },
]) test('malformed finding rejected', t => {
  const { root, feature } = setup(t); const item = { ...finding }; mutate(item);
  feature.reports.review.findings = [item]; put(root, '.dev-agent/features/example.json', feature);
  assert.throws(() => checkGate(root, 'example', 'implementation', { now }), /finding|exception/i);
});
test('fixed high and open low findings pass', t => {
  const { root, feature } = setup(t);
  feature.reports.review.findings = [{ ...finding, status: 'fixed' }, { ...finding, id: 'LOW', severity: 'low' }];
  put(root, '.dev-agent/features/example.json', feature);
  assert.equal(checkGate(root, 'example', 'implementation', { now }).passed, true);
});
test('design fingerprint canonical object keys, binds all options and choice', t => {
  const { feature } = setup(t);
  const reverse = Object.fromEntries(Object.entries(feature).reverse());
  reverse.options = feature.options.map(o => Object.fromEntries(Object.entries(o).reverse()));
  assert.equal(designFingerprint(reverse), designFingerprint(feature));
  reverse.selectedOption = 'option-2';
  assert.notEqual(designFingerprint(reverse), designFingerprint(feature));
});
test('source changes stale implementation but not design', t => {
  const { root } = setup(t); put(root, 'src/example.mjs', 'changed');
  assert.equal(checkGate(root, 'example', 'design', { now }).passed, true);
  assert.throws(() => checkGate(root, 'example', 'implementation', { now }), /stale/);
});
test('private vulnerability ledger updates preserve source reports and closure approval', t => {
  const { root } = setup(t);
  put(root, '.dev-agent/vulnerabilities.json', { schemaVersion: 1, findings: [] });
  assert.equal(checkGate(root, 'example', 'closure', { now }).passed, true);
  put(root, '.dev-agent/vulnerabilities.json', { schemaVersion: 1, findings: [{ id: 'new-private-finding' }] });
  assert.equal(checkGate(root, 'example', 'closure', { now }).passed, true);
});
for (const reference of ['.dev-agent/project.json', '.dev-agent/knowledge/principles.md', 'docs/source.md']) test(`source fingerprint includes ${reference}`, t => {
  const { root } = setup(t); const before = sourceFingerprint(root); put(root, reference, 'changed');
  assert.notEqual(sourceFingerprint(root), before);
});
for (const reference of ['.dev-agent/features/example.json', '.dev-agent/evidence/scan.txt', '.dev-agent/history/reviews.json', '.dev-agent/security-results/scan.json', '.dev-agent/releases.json', '.dev-agent/vulnerabilities.json', 'node_modules/a.js', '.git/config', 'dist/a.js', 'coverage/a.json', 'artifacts/a.log', 'temp/a.txt']) test(`source fingerprint excludes ${reference}`, t => {
  const { root } = setup(t); const before = sourceFingerprint(root); put(root, reference, 'changed');
  assert.equal(sourceFingerprint(root), before);
});
test('source fingerprint binds filenames and binary content', t => {
  const root = fixture(t); put(root, 'a', 'content');
  const before = sourceFingerprint(root); fs.renameSync(path.join(root, 'a'), path.join(root, 'b'));
  assert.notEqual(sourceFingerprint(root), before);
  const renamed = sourceFingerprint(root); fs.writeFileSync(path.join(root, 'b'), Buffer.from([0, 255]));
  assert.notEqual(sourceFingerprint(root), renamed);
});
const projectFailures = [
  ['missing skills key', p => { delete p.skills.design; }, /skills.design/],
  ['unknown key', p => { p.unrecognized = true; }, /unknown/],
  ['traversal knowledge', p => { p.knowledge.architecture = '../outside'; }, /Traversal/],
  ['missing knowledge', p => { p.knowledge.architecture = 'missing.md'; }, /Missing/],
  ['absolute skill', p => { p.skills.design = 'C:\\outside'; }, /Absolute/],
  ['missing command', p => { delete p.commands.build; }, /commands.build/],
  ['empty command', p => { p.commands.build = ''; }, /nonempty/],
  ['severity downgrade', p => { p.security.blockingSeverities = ['medium']; }, /critical and high/],
  ['wrong boolean', p => { p.monitoring.enabled = 'false'; }, /boolean/],
  ['invalid repository', p => { p.review.repository = '-bad/repo'; }, /OWNER\/REPO/],
];
for (const [name, mutate, error] of projectFailures) test(`project check rejects ${name}`, t => {
  const root = fixture(t); const project = projectFixture(root); mutate(project);
  assert.throws(() => validateProject(project, root), error);
});
for (const command of ['build', 'unit', 'coverage', 'security', 'deploy', 'rollback']) test(`release blocks absent ${command} command`, t => {
  const { root, project, feature } = setup(t);
  project.commands[command] = null; put(root, '.dev-agent/project.json', project);
  const current = sourceFingerprint(root);
  for (const key of ['tests', 'implementationSecurity', 'review', 'documentation', 'rollbackRehearsal']) feature.reports[key].revision = current;
  feature.approvals.deployment.revision = current; put(root, '.dev-agent/features/example.json', feature);
  assert.throws(() => checkGate(root, 'example', 'release', { now }), new RegExp(`commands.${command}`));
});
test('release blocks incomplete onboarding', t => {
  const { root, project, feature } = setup(t);
  project.project.onboardingComplete = false; put(root, '.dev-agent/project.json', project);
  const current = sourceFingerprint(root);
  for (const key of ['tests', 'implementationSecurity', 'review']) feature.reports[key].revision = current;
  put(root, '.dev-agent/features/example.json', feature);
  assert.throws(() => checkGate(root, 'example', 'release', { now }), /onboarding/);
});
test('project check never executes configured commands', t => {
  const root = fixture(t); const project = projectFixture(root);
  project.commands.build = 'this is not a runnable command & rm anything';
  put(root, '.dev-agent/project.json', project);
  assert.equal(loadProject(root).commands.build, project.commands.build);
});
test('malformed feature JSON and mismatched id rejected', t => {
  const { root, feature } = setup(t);
  put(root, '.dev-agent/features/example.json', '{broken');
  assert.throws(() => checkGate(root, 'example', 'design', { now }), /JSON/);
  feature.id = 'other'; put(root, '.dev-agent/features/example.json', feature);
  assert.throws(() => checkGate(root, 'example', 'design', { now }), /filename/);
  assert.throws(() => validateFeature({ ...feature, reports: null }, root), /object/);
});
test('symlinked knowledge and evidence directory rejected', t => {
  const { root, feature, project } = setup(t);
  const other = fixture(t); put(other, 'scan.txt', 'external');
  if (!symlink(t, path.join(root, 'linked'), other, 'dir')) return;
  feature.reports.tests.evidence = ['linked/scan.txt'];
  assert.throws(() => validateFeature(feature, root), /Symlink/);
  project.knowledge.architecture = 'linked/scan.txt';
  assert.throws(() => validateProject(project, root), /Symlink/);
  assert.throws(() => sourceFingerprint(root), /Symlink/);
});
