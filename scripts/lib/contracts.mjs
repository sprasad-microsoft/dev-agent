import path from 'node:path';
import { assert, contained, readJson } from './io.mjs';

export const PHASES = ['design', 'implementation', 'testing', 'debugging', 'deployment', 'documentation', 'security', 'dependency-security', 'review', 'knowledge-base'];
export const COMMANDS = ['build', 'unit', 'functional', 'faultInjection', 'coverage', 'performance', 'security', 'deploy', 'rollback'];
export const PLANS = ['implementationPlan', 'testingPlan', 'rollbackPlan', 'debuggingPlan', 'documentationPlan', 'rolloutPlan'];
export const REPORTS = ['designSecurity', 'implementationSecurity', 'review', 'tests', 'documentation', 'rollbackRehearsal'];
export const SEVERITIES = ['critical', 'high', 'medium', 'low'];
export const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function object(value, label, keys) {
  assert(value && typeof value === 'object' && !Array.isArray(value), `${label} must be an object`);
  if (keys) {
    for (const key of keys) assert(Object.hasOwn(value, key), `${label}.${key} is required`);
    for (const key of Object.keys(value)) assert(keys.includes(key), `${label}.${key} is unknown`);
  }
}
export function text(value, label, nonempty = true) {
  assert(typeof value === 'string' && (!nonempty || value.trim().length > 0), `${label} must be ${nonempty ? 'a nonempty' : 'a'} string`);
}
export function boolean(value, label) { assert(typeof value === 'boolean', `${label} must be boolean`); }
export function timestamp(value, label) {
  text(value, label);
  assert(/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?(?:Z|[+-]\d\d:\d\d)$/.test(value) && Number.isFinite(Date.parse(value)), `${label} must be an ISO timestamp`);
  const [year, month, day, hour, minute, second] = value.slice(0, 19).split(/[-T:]/).map(Number);
  assert(month >= 1 && month <= 12 && day >= 1 && day <= new Date(Date.UTC(year, month, 0)).getUTCDate() && hour <= 23 && minute <= 59 && second <= 59, `${label} must be a valid ISO timestamp`);
}
export function revision(value, label) { assert(typeof value === 'string' && /^[a-f0-9]{64}$/.test(value), `${label} must be a SHA-256 revision`); }
export function validateProject(project, root, { checkFiles = true } = {}) {
  object(project, 'project config', ['schemaVersion', 'project', 'skills', 'commands', 'knowledge', 'security', 'monitoring', 'review']);
  assert(project.schemaVersion === 1, 'schemaVersion must be 1');
  object(project.project, 'project', ['name', 'onboardingComplete']);
  text(project.project.name, 'project.name'); boolean(project.project.onboardingComplete, 'project.onboardingComplete');
  object(project.skills, 'skills', PHASES);
  object(project.knowledge, 'knowledge', ['architecture', 'principles', 'reviewGuidance', 'similarProducts']);
  for (const map of ['skills', 'knowledge']) for (const [key, reference] of Object.entries(project[map])) {
    text(reference, `${map}.${key}`); contained(root, reference, { existing: checkFiles, file: checkFiles });
  }
  object(project.commands, 'commands', COMMANDS);
  for (const key of COMMANDS) if (project.commands[key] !== null) text(project.commands[key], `commands.${key}`);
  object(project.security, 'security', ['blockingSeverities', 'providers', 'allowExternalSourceSharing']);
  assert(Array.isArray(project.security.blockingSeverities) && project.security.blockingSeverities.length === 2 && ['critical', 'high'].every(s => project.security.blockingSeverities.includes(s)), 'security.blockingSeverities must contain critical and high');
  assert(Array.isArray(project.security.providers) && project.security.providers.every(p => typeof p === 'string' && p.trim()), 'security.providers must be strings');
  boolean(project.security.allowExternalSourceSharing, 'security.allowExternalSourceSharing');
  object(project.monitoring, 'monitoring', ['enabled', 'releaseInventory']);
  boolean(project.monitoring.enabled, 'monitoring.enabled');
  contained(root, project.monitoring.releaseInventory);
  object(project.review, 'review', ['repository']);
  if (project.review.repository !== null) validateRepository(project.review.repository);
  return project;
}
export function loadProject(root) { return validateProject(readJson(contained(root, '.dev-agent/project.json', { existing: true, file: true })), root); }
export function validateRepository(repository) {
  assert(typeof repository === 'string' && /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})\/[A-Za-z0-9_][A-Za-z0-9_.-]{0,99}$/.test(repository) && !repository.endsWith('/.') && !repository.endsWith('/..'), 'Repository must be OWNER/REPO');
  return repository;
}
export function approval(value, label) {
  if (value === null) return;
  object(value, label, ['by', 'at', 'revision']); text(value.by, `${label}.by`); timestamp(value.at, `${label}.at`); revision(value.revision, `${label}.revision`);
}
export function validateReport(report, label, root) {
  if (report === null) return;
  object(report, label);
  for (const key of ['status', 'revision', 'evidence']) assert(Object.hasOwn(report, key), `${label}.${key} is required`);
  for (const key of Object.keys(report)) assert(['status', 'revision', 'evidence', 'findings', 'reason'].includes(key), `${label}.${key} is unknown`);
  assert(['passed', 'failed', 'blocked', 'not-applicable'].includes(report.status), `${label}.status invalid`);
  revision(report.revision, `${label}.revision`);
  assert(Array.isArray(report.evidence), `${label}.evidence must be an array`);
  for (const evidence of report.evidence) {
    const filename = contained(root, evidence, { existing: true, file: true });
    assert(!/^[.]dev-agent[\\/]features(?:[\\/]|$)/.test(path.relative(root, filename)), `${label}: feature state is not evidence`);
    assert(filename, `${label}.evidence invalid`);
  }
  if (report.reason !== undefined) text(report.reason, `${label}.reason`);
  if (report.status === 'not-applicable') text(report.reason, `${label}.reason`);
  if (report.findings !== undefined) {
    assert(Array.isArray(report.findings), `${label}.findings must be array`);
    const ids = new Set();
    for (const finding of report.findings) {
      object(finding, 'finding');
      for (const key of ['id', 'severity', 'confidence', 'summary', 'status']) assert(Object.hasOwn(finding, key), `finding.${key} is required`);
      for (const key of Object.keys(finding)) assert(['id', 'severity', 'confidence', 'summary', 'status', 'exception'].includes(key), `finding.${key} is unknown`);
      text(finding.id, 'finding.id'); assert(!ids.has(finding.id), 'Duplicate finding id'); ids.add(finding.id);
      text(finding.summary, 'finding.summary');
      assert(SEVERITIES.includes(finding.severity), 'Invalid finding severity');
      assert(typeof finding.confidence === 'number' && Number.isFinite(finding.confidence) && finding.confidence >= 0 && finding.confidence <= 1, 'Invalid finding confidence');
      assert(['open', 'fixed', 'accepted'].includes(finding.status), 'Invalid finding status');
      if (finding.exception !== undefined) {
        object(finding.exception, 'exception', ['approvedBy', 'expiresAt', 'reason']);
        text(finding.exception.approvedBy, 'exception.approvedBy'); text(finding.exception.reason, 'exception.reason'); timestamp(finding.exception.expiresAt, 'exception.expiresAt');
      }
    }
  }
}
export function validateFeature(feature, root, { allowPlaceholders = false } = {}) {
  object(feature, 'feature', ['schemaVersion', 'id', 'requirement', 'options', 'selectedOption', 'designRevision', 'approvals', 'reports', 'release', 'dependenciesRemediated']);
  assert(feature.schemaVersion === 1 && SLUG.test(feature.id), 'Invalid feature schemaVersion or id');
  text(feature.requirement, 'requirement', !allowPlaceholders);
  assert(Array.isArray(feature.options) && feature.options.length > 0, 'options must be a nonempty array');
  const ids = new Set();
  for (const option of feature.options) {
    object(option, 'option', ['id', ...PLANS]); text(option.id, 'option.id');
    assert(!ids.has(option.id), 'Duplicate option id'); ids.add(option.id);
    for (const key of PLANS) text(option[key], `option.${key}`, !allowPlaceholders);
  }
  assert(feature.selectedOption === null || (typeof feature.selectedOption === 'string' && ids.has(feature.selectedOption)), 'selectedOption must match an option');
  if (feature.designRevision !== null) revision(feature.designRevision, 'designRevision');
  object(feature.approvals, 'approvals', ['design', 'deployment']);
  for (const key of ['design', 'deployment']) approval(feature.approvals[key], `approvals.${key}`);
  object(feature.reports, 'reports', REPORTS);
  for (const key of REPORTS) validateReport(feature.reports[key], `reports.${key}`, root);
  boolean(feature.dependenciesRemediated, 'dependenciesRemediated');
  if (feature.release !== null) {
    object(feature.release, 'release', ['revision', 'environment', 'verified', 'at']);
    revision(feature.release.revision, 'release.revision'); text(feature.release.environment, 'release.environment');
    boolean(feature.release.verified, 'release.verified'); timestamp(feature.release.at, 'release.at');
  }
  return feature;
}
