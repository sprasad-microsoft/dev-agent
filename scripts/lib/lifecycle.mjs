import fs from 'node:fs';
import path from 'node:path';
import { assert, canonical, contained, hash, listFiles, readJson, workspaceRoot, writeNew } from './io.mjs';
import { loadProject, PLANS, REPORTS, SLUG, validateFeature } from './contracts.mjs';

export function designFingerprint(feature) {
  return hash(canonical({ requirement: feature.requirement, options: feature.options, selectedOption: feature.selectedOption }));
}
export function sourceFingerprint(workspace) {
  const root = workspaceRoot(workspace);
  const ignoredNames = new Set(['.git', 'node_modules', 'coverage', 'dist', 'artifacts', 'temp', 'tmp']);
  const files = listFiles(root, '', relative => ignoredNames.has(relative.split('/').at(-1)) ||
    /^(?:[.]dev-agent\/(?:features|evidence|history|security-results)(?:\/|$)|[.]dev-agent\/(?:releases|vulnerabilities)[.]json$)/.test(relative));
  return hash(canonical(files.map(reference => [reference, hash(fs.readFileSync(path.join(root, reference)))])));
}
export function featurePath(root, id) {
  assert(typeof id === 'string' && SLUG.test(id), 'Feature id must be a lowercase slug');
  return contained(root, `.dev-agent/features/${id}.json`);
}
export function loadFeature(root, id, options) {
  const feature = validateFeature(readJson(featurePath(root, id)), root, options);
  assert(feature.id === id, 'Feature id does not match filename');
  return feature;
}
export function initFeature(workspace, id) {
  const root = workspaceRoot(workspace);
  featurePath(root, id);
  const feature = {
    schemaVersion: 1, id, requirement: '',
    options: [{ id: 'option-1', ...Object.fromEntries(PLANS.map(key => [key, ''])) }],
    selectedOption: null, designRevision: null,
    approvals: { design: null, deployment: null },
    reports: Object.fromEntries(REPORTS.map(key => [key, null])),
    release: null, dependenciesRemediated: false,
  };
  writeNew(root, `.dev-agent/features/${id}.json`, feature);
  return feature;
}
function requireApproval(approval, current, label, now) {
  assert(approval !== null, `${label} human approval missing`);
  assert(approval.revision === current, `${label} approval stale`);
  assert(Date.parse(approval.at) <= now, `${label} approval cannot be future-dated`);
}
function requireReport(report, current, label, now) {
  assert(report !== null, `${label} report missing`);
  assert(report.status === 'passed', `${label} report must pass; ${report.status} blocks`);
  assert(report.revision === current, `${label} report stale`);
  assert(report.evidence.length > 0, `${label} report requires durable evidence`);
  for (const finding of report.findings ?? []) {
    if (['critical', 'high'].includes(finding.severity) && finding.status !== 'fixed') {
      assert(finding.exception && Date.parse(finding.exception.expiresAt) > now, `${label}: unresolved ${finding.severity} finding ${finding.id} requires a nonexpired approved exception`);
    }
  }
}
export function checkGate(workspace, id, gate, { now = Date.now() } = {}) {
  assert(['design', 'implementation', 'release', 'closure'].includes(gate), 'Unknown gate');
  const root = workspaceRoot(workspace);
  const project = loadProject(root);
  const feature = loadFeature(root, id);
  const design = designFingerprint(feature);
  assert(feature.selectedOption !== null, 'Select an option before design approval');
  assert(feature.designRevision === design, 'designRevision is missing or stale');
  requireReport(feature.reports.designSecurity, design, 'designSecurity (all options)', now);
  requireApproval(feature.approvals.design, design, 'design', now);
  if (gate === 'design') return { gate, passed: true, revision: design };
  const source = sourceFingerprint(root);
  for (const report of ['tests', 'implementationSecurity', 'review']) requireReport(feature.reports[report], source, report, now);
  if (gate === 'implementation') return { gate, passed: true, revision: source };
  assert(project.project.onboardingComplete, 'Project onboarding incomplete');
  for (const command of ['build', 'unit', 'coverage', 'security', 'deploy', 'rollback']) assert(project.commands[command]?.trim(), `Release requires commands.${command}`);
  for (const report of ['documentation', 'rollbackRehearsal']) requireReport(feature.reports[report], source, report, now);
  requireApproval(feature.approvals.deployment, source, 'deployment', now);
  if (gate === 'closure') {
    assert(feature.release?.verified === true && feature.release.revision === source, 'Release must be verified at current revision');
    assert(Date.parse(feature.release.at) <= now, 'Release cannot be future-dated');
    assert(feature.dependenciesRemediated, 'Dependencies must be remediated before closure');
  }
  return { gate, passed: true, revision: source };
}
export function featureStatus(workspace, id) {
  const root = workspaceRoot(workspace);
  loadFeature(root, id, { allowPlaceholders: true });
  return Object.fromEntries(['design', 'implementation', 'release', 'closure'].map(gate => {
    try { return [gate, checkGate(root, id, gate)]; }
    catch (error) { return [gate, { gate, passed: false, reason: error.message }]; }
  }));
}
