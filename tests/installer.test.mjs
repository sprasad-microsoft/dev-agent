import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { installWorkspace, PACKAGE_ROOT } from '../scripts/lib/installer.mjs';
import { PHASES, validateProject } from '../scripts/lib/contracts.mjs';
import { fixture, packageFixture, put, symlink } from './helpers.mjs';

function setup(t) { const source = fixture(t); packageFixture(source); return { source, target: fixture(t) }; }
function actualPackageSource(t) {
  const source = fixture(t);
  for (const reference of ['.github', 'templates', 'scripts', 'schemas', 'LICENSE']) {
    fs.cpSync(path.join(PACKAGE_ROOT, reference), path.join(source, reference), { recursive: true, verbatimSymlinks: true });
  }
  return source;
}
test('actual package installation runs installed CLI, imports monitor and preserves separate licenses', async t => {
  const source = actualPackageSource(t);
  const target = fixture(t);
  put(target, 'LICENSE', 'Consumer proprietary license\n');
  installWorkspace({ source, target, apply: true });
  assert.equal(fs.readFileSync(path.join(target, 'LICENSE'), 'utf8'), 'Consumer proprietary license\n');
  assert.deepEqual(fs.readFileSync(path.join(target, '.dev-agent', 'LICENSE')), fs.readFileSync(path.join(PACKAGE_ROOT, 'LICENSE')));
  const cli = path.join(target, '.dev-agent', 'tools', 'dev-agent.mjs');
  const output = execFileSync(process.execPath, [cli, 'project-check', '--workspace', target], { cwd: target, encoding: 'utf8' });
  assert.equal(JSON.parse(output).passed, true);
  const help = execFileSync(process.execPath, [cli, '--help'], { cwd: target, encoding: 'utf8' });
  assert.match(help, /Dev agent/);
  const monitor = await import(pathToFileURL(path.join(target, '.dev-agent', 'tools', 'monitor-dependencies.mjs')).href);
  assert.equal(typeof monitor.runMonitoring, 'function');
  assert.equal(fs.existsSync(path.join(target, '.dev-agent', 'tools', 'lib', 'inventory.mjs')), true);
  assert.equal(fs.existsSync(path.join(target, '.dev-agent', 'tools', 'schemas', 'project.schema.json')), true);
  assert.equal(fs.existsSync(path.join(target, '.dev-agent', 'tools', 'scripts')), false);
  const again = installWorkspace({ source, target, apply: true });
  assert.equal(again.files.find(file => file.path === '.dev-agent/LICENSE').action, 'identical');
});
for (const apply of [false, true]) test(`packaged license conflict preflights all writes (apply=${apply})`, t => {
  const source = actualPackageSource(t);
  const target = fixture(t);
  put(target, 'LICENSE', 'Consumer license\n');
  put(target, '.dev-agent/LICENSE', 'Conflicting packaged license\n');
  assert.throws(() => installWorkspace({ source, target, apply }), /conflict.*LICENSE/);
  assert.equal(fs.readFileSync(path.join(target, 'LICENSE'), 'utf8'), 'Consumer license\n');
  assert.equal(fs.readFileSync(path.join(target, '.dev-agent', 'LICENSE'), 'utf8'), 'Conflicting packaged license\n');
  assert.equal(fs.existsSync(path.join(target, '.github')), false);
  assert.equal(fs.existsSync(path.join(target, '.dev-agent', 'project.json')), false);
});
test('installer defaults to dry-run and copies only explicit assets', t => {
  const { source, target } = setup(t);
  const result = installWorkspace({ source, target });
  assert.equal(result.applied, false);
  assert.deepEqual(fs.readdirSync(target), []);
  assert.equal(result.files.some(f => f.path.includes('unrelated')), false);
  assert.equal(result.files.some(f => f.path.includes('workflows')), false);
  assert.equal(result.files.some(f => f.path.includes('dependabot')), false);
  assert.equal(result.files.some(f => f.path === '.dev-agent/tools/dev-agent.mjs'), true);
});
test('apply installs valid workspace and identical reinstall preserves content', t => {
  const { source, target } = setup(t);
  installWorkspace({ source, target, apply: true });
  const filename = path.join(target, '.dev-agent', 'project.json');
  validateProject(JSON.parse(fs.readFileSync(filename, 'utf8')), target);
  const before = fs.statSync(filename).mtimeMs;
  const again = installWorkspace({ source, target, apply: true });
  assert.equal(again.files.every(f => f.action === 'identical'), true);
  assert.equal(fs.statSync(filename).mtimeMs, before);
});
test('monitoring requires explicit option', t => {
  const { source, target } = setup(t);
  installWorkspace({ source, target, apply: true, monitoring: true });
  assert.equal(fs.existsSync(path.join(target, '.github', 'workflows', 'security.yml')), true);
  assert.equal(fs.existsSync(path.join(target, '.github', 'dependabot.yml')), true);
  assert.equal(fs.existsSync(path.join(target, '.github', 'workflows', 'not-a-workflow.txt')), false);
  const project = JSON.parse(fs.readFileSync(path.join(target, '.dev-agent', 'project.json')));
  assert.equal(project.monitoring.enabled, false);
  assert.equal(project.security.allowExternalSourceSharing, false);
});
test('installer adds private ignore rules without changing consumer root gitignore', t => {
  const { source, target } = setup(t);
  put(target, '.gitignore', 'consumer-specific-ignore\n');
  installWorkspace({ source, target, apply: true });
  assert.equal(fs.readFileSync(path.join(target, '.gitignore'), 'utf8'), 'consumer-specific-ignore\n');
  assert.equal(fs.readFileSync(path.join(target, '.dev-agent', '.gitignore'), 'utf8'),
    fs.readFileSync(path.join(source, 'templates', 'dev-agent.gitignore'), 'utf8'));
});
for (const apply of [false, true]) test(`private gitignore conflict preflights all writes (apply=${apply})`, t => {
  const { source, target } = setup(t);
  put(target, '.dev-agent/.gitignore', 'user-private-rules\n');
  assert.throws(() => installWorkspace({ source, target, apply }), /conflict/);
  assert.equal(fs.readFileSync(path.join(target, '.dev-agent', '.gitignore'), 'utf8'), 'user-private-rules\n');
  assert.equal(fs.existsSync(path.join(target, '.github')), false);
  assert.equal(fs.existsSync(path.join(target, '.dev-agent', 'project.json')), false);
});
test('installation includes release templates and optional runtime metadata but excludes validators and tests', t => {
  const { source, target } = setup(t);
  put(source, 'templates/upstream.json', { schemaVersion: 1, enabled: false });
  put(source, 'scripts/monitor-dependencies.mjs', 'export const monitor = true;');
  put(source, 'scripts/validate-package.mjs', 'not installed');
  put(source, 'scripts/monitor-dependencies.test.mjs', 'not installed');
  const result = installWorkspace({ source, target, apply: true });
  for (const reference of ['releases.json', 'vulnerabilities.json', 'upstream.json', 'tools/monitor-dependencies.mjs']) {
    assert.equal(fs.existsSync(path.join(target, '.dev-agent', reference)), true);
  }
  assert.equal(result.files.some(file => file.path.includes('validate-package')), false);
  assert.equal(result.files.some(file => file.path.includes('.test.mjs')), false);
});
test('monitoring files can be installed after default installation without changing project config', t => {
  const { source, target } = setup(t);
  installWorkspace({ source, target, apply: true });
  const filename = path.join(target, '.dev-agent', 'project.json');
  const before = fs.readFileSync(filename, 'utf8');
  installWorkspace({ source, target, apply: true, monitoring: true });
  assert.equal(fs.readFileSync(filename, 'utf8'), before);
  assert.equal(fs.existsSync(path.join(target, '.github', 'workflows', 'security.yml')), true);
});
for (const apply of [false, true]) test(`late conflict preflight does not write anything (apply=${apply})`, t => {
  const { source, target } = setup(t); put(target, '.dev-agent/project.json', 'user customization');
  assert.throws(() => installWorkspace({ source, target, apply }), /conflict/);
  assert.equal(fs.readFileSync(path.join(target, '.dev-agent', 'project.json'), 'utf8'), 'user customization');
  assert.equal(fs.existsSync(path.join(target, '.github')), false);
});
test('existing directory destination and file ancestor both block before writes', t => {
  const { source, target } = setup(t);
  fs.mkdirSync(path.join(target, '.github', 'agents', 'review.agent.md'), { recursive: true });
  assert.throws(() => installWorkspace({ source, target, apply: true }), /conflict/);
  assert.equal(fs.existsSync(path.join(target, '.dev-agent')), false);
  fs.rmSync(path.join(target, '.github'), { recursive: true });
  put(target, '.dev-agent', 'a file');
  assert.throws(() => installWorkspace({ source, target, apply: true }), /ancestor/);
  assert.equal(fs.existsSync(path.join(target, '.github')), false);
});
test('malformed or missing source templates block before writes', t => {
  const { source, target } = setup(t);
  put(source, 'templates/project.json', '{broken');
  assert.throws(() => installWorkspace({ source, target, apply: true }), /JSON/);
  assert.deepEqual(fs.readdirSync(target), []);
  fs.unlinkSync(path.join(source, '.github', 'agents', 'development.agent.md'));
  assert.throws(() => installWorkspace({ source, target, apply: true }), /Missing/);
});
test('template reference not in planned installation blocks', t => {
  const { source, target } = setup(t);
  const template = JSON.parse(fs.readFileSync(path.join(source, 'templates', 'project.json')));
  template.skills.design = 'missing/skill.md'; put(source, 'templates/project.json', template);
  assert.throws(() => installWorkspace({ source, target, apply: true }), /not installed/);
  assert.deepEqual(fs.readdirSync(target), []);
});
test('source and target overlap in either direction forbidden', t => {
  const { source, target } = setup(t);
  assert.throws(() => installWorkspace({ source, target: source }), /overlap/);
  fs.mkdirSync(path.join(source, 'nested'));
  assert.throws(() => installWorkspace({ source, target: path.join(source, 'nested') }), /overlap/);
  assert.throws(() => installWorkspace({ source: path.join(source, 'nested'), target: source }), /overlap/);
  assert.throws(() => installWorkspace({ source, target: path.join(target, 'missing') }), /ENOENT/);
});
test('target symlink ancestor rejects install without external writes', t => {
  const { source, target } = setup(t); const outside = fixture(t);
  if (!symlink(t, path.join(target, '.github'), outside, 'dir')) return;
  assert.throws(() => installWorkspace({ source, target, apply: true }), /Symlink/);
  assert.deepEqual(fs.readdirSync(outside), []);
  assert.equal(fs.existsSync(path.join(target, '.dev-agent')), false);
});
test('source symlink directory rejects before install', t => {
  const { source, target } = setup(t); const outside = fixture(t);
  put(outside, 'library.mjs', 'external');
  fs.rmSync(path.join(source, 'scripts', 'lib'), { recursive: true });
  if (!symlink(t, path.join(source, 'scripts', 'lib'), outside, 'dir')) return;
  assert.throws(() => installWorkspace({ source, target, apply: true }), /Symlink/);
  assert.deepEqual(fs.readdirSync(target), []);
});

for (const agentsOnly of [false, true]) test(`global installation uses shared Copilot locations (agentsOnly=${agentsOnly})`, t => {
  const { source, target: home } = setup(t);
  put(source, 'LICENSE', 'Package license');
  put(source, '.github/skills/dev-design/assets/example.md', 'Design asset');
  const preview = installWorkspace({ source, home, global: true, agentsOnly });
  assert.equal(preview.scope, 'global');
  assert.equal(preview.root, path.join(home, '.copilot'));
  assert.deepEqual(fs.readdirSync(home), []);
  const installed = installWorkspace({ source, home, global: true, agentsOnly, apply: true });
  assert.equal(installed.files.filter(file => /^agents\/.*[.]agent[.]md$/.test(file.path)).length, 3);
  for (const name of ['development', 'security', 'review']) {
    assert.equal(fs.existsSync(path.join(home, '.copilot', 'agents', `${name}.agent.md`)), true);
  }
  assert.equal(fs.existsSync(path.join(home, '.copilot', 'skills')), !agentsOnly);
  if (!agentsOnly) {
    assert.equal(fs.readdirSync(path.join(home, '.copilot', 'skills')).length, 10);
    assert.equal(fs.readFileSync(path.join(home, '.copilot', 'skills', 'dev-design', 'assets', 'example.md'), 'utf8'), 'Design asset');
  }
  assert.equal(fs.existsSync(path.join(home, '.copilot', 'dev-agent', 'LICENSE')), true);
  assert.equal(fs.existsSync(path.join(home, '.copilot', '.dev-agent')), false);
  assert.equal(fs.existsSync(path.join(home, '.github')), false);
  const again = installWorkspace({ source, home, global: true, agentsOnly, apply: true });
  assert.ok(again.files.every(file => file.action === 'identical'));
});

test('agents-only installs require no skills, config, or tools and can add skills later', t => {
  const { source, target: home } = setup(t);
  fs.rmSync(path.join(source, 'templates'), { recursive: true });
  fs.rmSync(path.join(source, 'scripts'), { recursive: true });
  fs.rmSync(path.join(source, '.github', 'skills'), { recursive: true });
  installWorkspace({ source, home, global: true, agentsOnly: true, apply: true });
  assert.equal(fs.existsSync(path.join(home, '.copilot', 'skills')), false);
  for (const phase of PHASES) {
    put(source, `.github/skills/dev-${phase}/SKILL.md`, 'Skill content');
  }
  installWorkspace({ source, home, global: true, apply: true });
  assert.equal(fs.readdirSync(path.join(home, '.copilot', 'skills')).length, 10);
});

test('workspace agents-only leaves existing skills/configuration untouched', t => {
  const { source, target } = setup(t);
  put(target, '.github/skills/dev-design/SKILL.md', 'Consumer skill');
  put(target, '.dev-agent/project.json', 'Consumer config');
  fs.unlinkSync(path.join(source, 'templates', 'project.json'));
  const result = installWorkspace({ source, target, agentsOnly: true, apply: true });
  assert.equal(result.files.length, 3);
  assert.equal(fs.readFileSync(path.join(target, '.github', 'skills', 'dev-design', 'SKILL.md'), 'utf8'), 'Consumer skill');
  assert.equal(fs.readFileSync(path.join(target, '.dev-agent', 'project.json'), 'utf8'), 'Consumer config');
  assert.equal(fs.existsSync(path.join(target, '.dev-agent', 'tools')), false);
});

test('full workspace installation includes skill assets', t => {
  const { source, target } = setup(t);
  put(source, '.github/skills/dev-design/assets/option.md', 'Option template');
  installWorkspace({ source, target, apply: true });
  assert.equal(fs.readFileSync(path.join(target, '.github', 'skills', 'dev-design', 'assets', 'option.md'), 'utf8'), 'Option template');
});

for (const apply of [false, true]) test(`global late skill conflict prevents all writes (apply=${apply})`, t => {
  const { source, target: home } = setup(t);
  put(home, '.copilot/skills/dev-testing/SKILL.md', 'Consumer customization');
  assert.throws(() => installWorkspace({ source, home, global: true, apply }), /conflict/);
  assert.equal(fs.existsSync(path.join(home, '.copilot', 'agents')), false);
  assert.equal(fs.readFileSync(path.join(home, '.copilot', 'skills', 'dev-testing', 'SKILL.md'), 'utf8'), 'Consumer customization');
  installWorkspace({ source, home, global: true, agentsOnly: true, apply });
  assert.equal(fs.existsSync(path.join(home, '.copilot', 'agents')), apply);
});

test('global installation rejects symlink roots and destinations without outside writes', t => {
  const { source, target: home } = setup(t);
  const outside = fixture(t);
  if (!symlink(t, path.join(home, '.copilot'), outside, 'dir')) return;
  assert.throws(() => installWorkspace({ source, home, global: true, apply: true }), /Symlink/);
  assert.deepEqual(fs.readdirSync(outside), []);
});

test('invalid global combinations and non-directory roots fail before writes', t => {
  const { source, target: home } = setup(t);
  assert.throws(() => installWorkspace({ source, home, global: true, target: home }), /conflict/);
  assert.throws(() => installWorkspace({ source, home, global: true, monitoring: true }), /full workspace/);
  assert.throws(() => installWorkspace({ source, target: home, agentsOnly: true, monitoring: true }), /full workspace/);
  assert.deepEqual(fs.readdirSync(home), []);
  put(home, '.copilot', 'not a directory');
  assert.throws(() => installWorkspace({ source, home, global: true, apply: true }), /directory/);
});

test('a checkout in the user home is allowed but overlapping global destinations are rejected', t => {
  const home = fixture(t);
  const source = path.join(home, 'checkout');
  fs.mkdirSync(source);
  packageFixture(source);
  installWorkspace({ source, home, global: true, apply: true });
  assert.equal(fs.existsSync(path.join(home, '.copilot', 'agents', 'development.agent.md')), true);
  assert.throws(() => installWorkspace({ source: home, home, global: true }), /overlap/);
  assert.throws(() => installWorkspace({ source: path.join(home, '.copilot', 'agents'), home, global: true }), /overlap/);
});
