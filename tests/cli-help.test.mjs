import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import fs from 'node:fs';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';
import { HELP, parseArgs, run } from '../scripts/dev-agent.mjs';
import { fixture, TEST_ROOT } from './helpers.mjs';

const cli = path.resolve(TEST_ROOT, '..', 'scripts', 'dev-agent.mjs');
for (const command of ['--help', 'help']) {
  test(`${command} requires no workspace or configuration`, t => {
    const root = fixture(t);
    assert.deepEqual(parseArgs([command]), { command: 'help', options: {} });
    assert.equal(run([command], { cwd: path.join(root, 'nonexistent') }), HELP);
    const output = execFileSync(process.execPath, [cli, command], { cwd: root, encoding: 'utf8' });
    assert.equal(output.trim(), HELP.trim());
    assert.deepEqual(fs.readdirSync(root), []);
  });
}
test('help lists exact syntax, defaults, schemas, report contracts and revision binding', () => {
  for (const expected of [
    '--target PATH [--apply | --dry-run] [--monitoring]',
    'fingerprint [--kind source]', 'fingerprint --kind design --id SLUG',
    '--gate design|implementation|release|closure', '--limit 1..100',
    '--workspace PATH', 'limit defaults to 30', 'Install defaults to --dry-run',
    'project.schema.json', 'feature.schema.json', 'releases.schema.json', 'history.schema.json',
    'passed|failed|blocked|not-applicable', '{by,at,revision}',
    '{requirement,options,selectedOption}', 'SHA-256(file bytes)',
    'does not enable configuration', 'designSecurity', 'rollbackRehearsal',
    'install --global [--agents-only]', 'install --target PATH --agents-only',
    'install --global --skill-only', 'install --target PATH --skill-only',
  ]) assert.ok(HELP.includes(expected), `Help missing: ${expected}`);
});
test('unknown command continues to fail with nonzero exit', t => {
  const root = fixture(t);
  assert.throws(() => run(['unknown-command'], { cwd: root }), /Unknown command/);
  assert.throws(() => execFileSync(process.execPath, [cli, 'unknown-command'], { cwd: root, stdio: 'pipe' }),
    error => error.status === 1 && /Unknown command/.test(error.stderr.toString()));
  assert.deepEqual(fs.readdirSync(root), []);
});
for (const args of [['help', '--unknown'], ['--help', '--workspace', '.'], ['help', 'extra']]) {
  test(`help still rejects unexpected arguments ${JSON.stringify(args)}`, () => assert.throws(() => parseArgs(args)));
}
for (const args of [
  ['install'], ['install', '--global', '--target', '.'],
  ['install', '--global', '--monitoring'],
  ['install', '--target', '.', '--agents-only', '--monitoring'],
  ['install', '--global', '--global'], ['install', '--global', '--agents-only', '--agents-only'],
  ['install', '--global', '--skill-only', '--skill-only'],
  ['install', '--global', '--agents-only', '--skill-only'],
  ['install', '--target', '.', '--agents-only', '--skill-only'],
  ['install', '--target', '.', '--skill-only', '--monitoring'],
  ['install', '--global', '--skill-only', '--monitoring'],
]) test(`installer rejects incompatible or duplicate arguments ${JSON.stringify(args)}`, () => {
  assert.throws(() => parseArgs(args));
});

test('CLI routes global installs to the user home rather than the current workspace', t => {
  const home = fs.mkdtempSync(path.join(tmpdir(), 'dev-agent-global-'));
  t.after(() => fs.rmSync(home, { recursive: true, force: true }));
  const preview = run(['install', '--global', '--agents-only'], { cwd: path.join(home, 'missing'), home });
  assert.equal(preview.root, path.join(home, '.copilot'));
  assert.deepEqual(fs.readdirSync(home), []);
  const result = run(['install', '--global', '--agents-only', '--apply'], { home });
  assert.equal(result.agentsOnly, true);
  assert.equal(result.scope, 'global');
  assert.equal(fs.readdirSync(path.join(home, '.copilot', 'agents')).length, 3);
  assert.equal(fs.existsSync(path.join(home, '.copilot', 'skills')), false);
  assert.equal(fs.existsSync(path.join(home, '.copilot', '.dev-agent')), false);
});

test('real global CLI applies to an isolated home and preserves full agent definitions', t => {
  const home = fs.mkdtempSync(path.join(tmpdir(), 'dev-agent-global-cli-'));
  t.after(() => fs.rmSync(home, { recursive: true, force: true }));
  const options = { cwd: home, encoding: 'utf8', env: { ...process.env, HOME: home, USERPROFILE: home } };
  const preview = JSON.parse(execFileSync(process.execPath, [cli, 'install', '--global'], options));
  assert.equal(preview.root, path.join(home, '.copilot'));
  assert.deepEqual(fs.readdirSync(home), []);
  execFileSync(process.execPath, [cli, 'install', '--global', '--agents-only', '--apply'], options);
  for (const name of ['development', 'security', 'review']) {
    assert.deepEqual(fs.readFileSync(path.join(home, '.copilot', 'agents', `${name}.agent.md`)),
      fs.readFileSync(path.resolve(TEST_ROOT, '..', '.github', 'agents', `${name}.agent.md`)));
  }
  assert.equal(fs.existsSync(path.join(home, '.copilot', 'skills')), false);
  const installed = JSON.parse(execFileSync(process.execPath, [cli, 'install', '--global', '--apply'], options));
  assert.equal(installed.scope, 'global');
  assert.equal(fs.readdirSync(path.join(home, '.copilot', 'skills')).length, 10);
  assert.deepEqual(fs.readFileSync(path.join(home, '.copilot', 'skills', 'dev-design', 'assets', 'option.md')),
    fs.readFileSync(path.resolve(TEST_ROOT, '..', '.github', 'skills', 'dev-design', 'assets', 'option.md')));
  const again = JSON.parse(execFileSync(process.execPath, [cli, 'install', '--global', '--apply'], options));
  assert.ok(again.files.every(file => file.action === 'identical'));
});

test('real CLI installs only skills globally or into a workspace', t => {
  const home = fs.mkdtempSync(path.join(tmpdir(), 'dev-agent-skill-only-'));
  t.after(() => fs.rmSync(home, { recursive: true, force: true }));
  const options = { cwd: home, encoding: 'utf8', env: { ...process.env, HOME: home, USERPROFILE: home } };
  for (const scope of [['--global'], ['--target', home]]) {
    const preview = JSON.parse(execFileSync(process.execPath, [cli, 'install', ...scope, '--skill-only'], options));
    assert.equal(preview.skillsOnly, true);
    assert.ok(preview.files.every(file => file.path.includes('skills/') || file.path.endsWith('/LICENSE')));
    const result = JSON.parse(execFileSync(process.execPath, [cli, 'install', ...scope, '--skill-only', '--apply'], options));
    const root = scope[0] === '--global' ? path.join(home, '.copilot') : path.join(home, '.github');
    assert.equal(result.skillsOnly, true);
    assert.equal(fs.existsSync(path.join(root, 'agents')), false);
    assert.equal(fs.readdirSync(path.join(root, 'skills')).length, 10);
    assert.deepEqual(fs.readFileSync(path.join(root, 'skills', 'dev-design', 'assets', 'option.md')),
      fs.readFileSync(path.resolve(TEST_ROOT, '..', '.github', 'skills', 'dev-design', 'assets', 'option.md')));
  }
  assert.equal(fs.existsSync(path.join(home, '.dev-agent', 'project.json')), false);
  assert.equal(fs.existsSync(path.join(home, '.dev-agent', 'tools')), false);
});
