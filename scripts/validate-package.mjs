#!/usr/bin/env node
import { readFileSync, readdirSync, existsSync, lstatSync } from 'node:fs';
import { join, dirname, resolve, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseDocument } from 'yaml';

const phases = [
  'design', 'implementation', 'testing', 'debugging', 'deployment',
  'documentation', 'security', 'dependency-security', 'review', 'knowledge-base',
];

function parseYaml(text, label) {
  const document = parseDocument(text, { uniqueKeys: true });
  if (document.errors.length) {
    throw new Error(`${label}: ${document.errors.map((error) => error.message).join('; ')}`);
  }
  const data = document.toJS();
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw new Error(`${label}: expected YAML mapping.`);
  }
  return data;
}

export function validateFrontmatter(text, expectedName, specialist = false) {
  const match = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(text);
  if (!match) throw new Error(`${expectedName}: missing YAML frontmatter.`);
  const data = parseYaml(match[1], expectedName);
  if (data.name !== expectedName || typeof data.description !== 'string' ||
      data.description.length < 20 || data.description.length > 1024) {
    throw new Error(`${expectedName}: invalid name or discovery description.`);
  }
  if (specialist && (!Array.isArray(data.tools) ||
      data.tools.length === 0 || data.tools.some((tool) => !['read', 'search'].includes(tool)))) {
    throw new Error(`${expectedName}: specialist tools must be read-only.`);
  }
  if (data.model !== undefined) throw new Error(`${expectedName}: package must not force a model.`);
  return data;
}

export function validateWorkflow(text, label = 'workflow') {
  const data = parseYaml(text, label);
  if (!data.on || !data.jobs || !data.permissions) throw new Error(`${label}: missing workflow controls.`);
  if ('pull_request_target' in data.on) throw new Error(`${label}: untrusted privileged PR trigger is prohibited.`);
  function checkUses(uses) {
    if (typeof uses !== 'string' || (!uses.startsWith('./') && !/@[0-9a-f]{40}$/.test(uses))) {
      throw new Error(`${label}: action/reusable workflow must be pinned to a full SHA.`);
    }
  }
  for (const job of Object.values(data.jobs)) {
    if (job.uses) checkUses(job.uses);
    for (const step of job.steps ?? []) {
      if (step.uses) checkUses(step.uses);
      if (step.continueOnError || step['continue-on-error']) {
        throw new Error(`${label}: checks must not ignore failures.`);
      }
    }
  }
  return data;
}

function files(root) {
  return readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    if (basename(root) === 'tests' && entry.name.startsWith('.work-')) return [];
    if (['.git', 'node_modules', 'coverage', 'dist', 'features', 'evidence', 'history', 'security-results'].includes(entry.name)) {
      return [];
    }
    const path = join(root, entry.name);
    if (lstatSync(path).isSymbolicLink()) throw new Error(`Package symlink is prohibited: ${path}`);
    return entry.isDirectory() ? files(path) : [path];
  });
}

export function validatePackage(root) {
  const lock = JSON.parse(readFileSync(join(root, 'package-lock.json'), 'utf8'));
  for (const [name, entry] of Object.entries(lock.packages)) {
    if (!name) continue;
    const url = new URL(entry.resolved);
    if (url.protocol !== 'https:' || url.hostname !== 'registry.npmjs.org' ||
        url.username || url.password || !entry.integrity?.startsWith('sha512-')) {
      throw new Error('Public package lock requires credential-free npm registry URLs and SHA-512 integrity.');
    }
  }
  const agents = new Map([
    ['development', 'Development'], ['security', 'Security'], ['review', 'Review'],
  ]);
  for (const [filename, name] of agents) {
    validateFrontmatter(readFileSync(join(root, '.github', 'agents', `${filename}.agent.md`), 'utf8'),
      name, filename !== 'development');
  }
  for (const phase of phases) {
    validateFrontmatter(readFileSync(join(root, '.github', 'skills', `dev-${phase}`, 'SKILL.md'), 'utf8'),
      `dev-${phase}`);
  }
  for (const relative of ['templates/project.json', '.dev-agent/project.json']) {
    const profile = JSON.parse(readFileSync(join(root, relative), 'utf8'));
    if (profile.schemaVersion !== 1 || Object.keys(profile.skills).length !== phases.length ||
        phases.some((phase) => profile.skills[phase] !== `.github/skills/dev-${phase}/SKILL.md`)) {
      throw new Error(`${relative}: phase mappings do not match packaged skills.`);
    }
    if (profile.security.allowExternalSourceSharing !== false || profile.security.providers.length !== 0) {
      throw new Error(`${relative}: external security providers must be disabled by default.`);
    }
  }
  const template = JSON.parse(readFileSync(join(root, 'templates', 'project.json'), 'utf8'));
  if (template.project.onboardingComplete !== false || template.monitoring.enabled !== false ||
      Object.values(template.commands).some((command) => command !== null)) {
    throw new Error('Consumer onboarding and commands must remain unconfigured by default.');
  }
  const list = files(root);
  for (const file of list) {
    if (file.endsWith('.json')) JSON.parse(readFileSync(file, 'utf8'));
    if (file.endsWith('.yml') && file.includes(`${join('.github', 'workflows')}`)) {
      validateWorkflow(readFileSync(file, 'utf8'), file);
    } else if (file.endsWith('.yml') && file.includes(`${join('templates', 'workflows')}`)) {
      validateWorkflow(readFileSync(file, 'utf8'), file);
    } else if (file.endsWith('.yml')) parseYaml(readFileSync(file, 'utf8'), file);
    if (file.endsWith('.md')) {
      const text = readFileSync(file, 'utf8');
      for (const match of text.matchAll(/\[[^\]]+\]\(([^)]+)\)/g)) {
        const target = match[1];
        if (target.startsWith('http') || target.startsWith('#') || target.includes('://')) continue;
        const path = target.split('#')[0];
        if (path && !existsSync(resolve(dirname(file), path))) {
          throw new Error(`${file}: broken local link ${target}`);
        }
      }
    }
  }
  return { agents: agents.size, skills: phases.length, files: list.length };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const root = dirname(dirname(fileURLToPath(import.meta.url)));
    console.log(`Package contracts valid: ${JSON.stringify(validatePackage(root))}`);
  } catch (error) {
    console.error(`Package validation error: ${error.message}`);
    process.exitCode = 1;
  }
}
