import fs from 'node:fs';
import path from 'node:path';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { assert, contained, listFiles, noSymlinks, readJson, workspaceRoot } from './io.mjs';
import { PHASES, validateProject } from './contracts.mjs';

export const PACKAGE_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

export function installWorkspace({ target, source = PACKAGE_ROOT, apply = false, monitoring = false, global = false, agentsOnly = false, skillsOnly = false, home = homedir() }) {
  assert(!global || target === undefined, '--global and --target conflict');
  assert(!(agentsOnly && skillsOnly), '--agents-only and --skill-only conflict');
  assert(!monitoring || (!global && !agentsOnly && !skillsOnly), '--monitoring requires a full workspace installation');
  assert(global || typeof target === 'string', '--target is required for workspace installation');
  const root = global ? contained(workspaceRoot(home), '.copilot') : workspaceRoot(target);
  if (fs.existsSync(root)) assert(fs.statSync(root).isDirectory(), 'Installation root must be a directory');
  source = workspaceRoot(source);
  for (const [parent, child] of [[source, root], [root, source]]) {
    const relative = path.relative(parent, child);
    assert(relative && (relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)), 'Source and target must not overlap');
  }
  const plan = [];
  const add = (reference, destination) => {
    const filename = contained(source, reference, { existing: true, file: true });
    plan.push({ destination, content: fs.readFileSync(filename) });
  };
  const license = contained(source, 'LICENSE');
  if (fs.existsSync(license)) add('LICENSE', global ? 'dev-agent/LICENSE' : '.dev-agent/LICENSE');
  if (!skillsOnly) for (const agent of ['development', 'security', 'review']) add(`.github/agents/${agent}.agent.md`, `${global ? '' : '.github/'}agents/${agent}.agent.md`);
  if (!agentsOnly) for (const phase of PHASES) {
    const directory = `.github/skills/dev-${phase}`;
    const base = contained(source, directory, { existing: true });
    contained(base, 'SKILL.md', { existing: true, file: true });
    for (const file of listFiles(base)) add(`${directory}/${file}`, `${global ? '' : '.github/'}skills/dev-${phase}/${file}`);
  }
  let project;
  if (!global && !agentsOnly && !skillsOnly) {
    add('scripts/dev-agent.mjs', '.dev-agent/tools/dev-agent.mjs');
    const monitor = contained(source, 'scripts/monitor-dependencies.mjs');
    if (fs.existsSync(monitor)) add('scripts/monitor-dependencies.mjs', '.dev-agent/tools/monitor-dependencies.mjs');
    for (const directory of ['scripts/lib', 'schemas']) {
      const base = contained(source, directory, { existing: true });
      const destination = directory === 'scripts/lib' ? 'lib' : directory;
      for (const file of listFiles(base)) add(`${directory}/${file}`, `.dev-agent/tools/${destination}/${file}`);
    }
    const knowledge = contained(source, 'templates/knowledge', { existing: true });
    for (const file of listFiles(knowledge)) add(`templates/knowledge/${file}`, `.dev-agent/knowledge/${file}`);
    project = readJson(contained(source, 'templates/project.json', { existing: true, file: true }));
    validateProject(project, root, { checkFiles: false });
    plan.push({ destination: '.dev-agent/project.json', content: Buffer.from(`${JSON.stringify(project, null, 2)}\n`) });
    add('templates/dev-agent.gitignore', '.dev-agent/.gitignore');
    for (const name of ['releases', 'vulnerabilities']) add(`templates/${name}.json`, `.dev-agent/${name}.json`);
    const upstream = contained(source, 'templates/upstream.json');
    if (fs.existsSync(upstream)) add('templates/upstream.json', '.dev-agent/upstream.json');
    if (monitoring) {
      const base = contained(source, 'templates/workflows', { existing: true });
      for (const file of listFiles(base)) if (/^[^/]+[.]yml$/.test(file)) add(`templates/workflows/${file}`, `.github/workflows/${file}`);
      add('templates/dependabot.yml', '.github/dependabot.yml');
    }
  }
  const destinations = new Set();
  for (const item of plan) {
    const filename = contained(root, item.destination);
    assert(!destinations.has(filename.toLowerCase()), `Duplicate installation destination: ${item.destination}`);
    destinations.add(filename.toLowerCase());
    const relative = path.relative(root, filename);
    let ancestor = root;
    for (const part of relative.split(path.sep).slice(0, -1)) {
      ancestor = path.join(ancestor, part);
      if (fs.existsSync(ancestor)) assert(fs.statSync(ancestor).isDirectory(), `Destination ancestor is not a directory: ${ancestor}`);
    }
    item.exists = fs.existsSync(filename);
    if (item.exists) assert(fs.statSync(filename).isFile() && fs.readFileSync(filename).equals(item.content), `Installation conflict: ${item.destination}`);
  }
  // Verify configured references against the complete planned workspace before any write.
  const planned = new Set(plan.map(item => path.resolve(contained(root, item.destination))));
  for (const reference of project ? [...Object.values(project.skills), ...Object.values(project.knowledge)] : []) {
    const filename = contained(root, reference);
    assert(planned.has(filename) || (fs.existsSync(filename) && fs.statSync(filename).isFile()), `Project reference is not installed: ${reference}`);
  }
  if (apply) for (const item of plan) if (!item.exists) {
    const filename = contained(root, item.destination);
    fs.mkdirSync(path.dirname(filename), { recursive: true });
    noSymlinks(filename);
    fs.writeFileSync(filename, item.content, { flag: 'wx' });
  }
  return { applied: apply, scope: global ? 'global' : 'workspace', root, agentsOnly, skillsOnly, monitoring, files: plan.map(({ destination, exists }) => ({ path: destination, action: exists ? 'identical' : 'create' })) };
}
