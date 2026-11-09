import test from 'node:test';
import assert from 'node:assert/strict';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { validateFrontmatter, validateWorkflow, validatePackage } from './validate-package.mjs';

test('frontmatter requires meaningful discovery and read-only specialist tools', () => {
  const text = '---\nname: Security\ndescription: "Use for security analysis of approved changes"\ntools: [read, search]\n---\nBody';
  assert.equal(validateFrontmatter(text, 'Security', true).name, 'Security');
  assert.throws(() => validateFrontmatter(text.replace('[read, search]', '[execute]'), 'Security', true), /read-only/);
  assert.throws(() => validateFrontmatter(text.replace('name: Security', 'name: Other'), 'Security'), /invalid name/);
  assert.throws(() => validateFrontmatter('No frontmatter', 'Security'), /missing YAML/);
  assert.throws(() => validateFrontmatter(text.replace('tools:', 'model: Example\ntools:'), 'Security'), /force a model/);
});

test('workflow validation rejects unpinned actions, privileged PRs, and ignored failures', () => {
  const text = 'on:\n  pull_request:\npermissions:\n  contents: read\njobs:\n  test:\n    runs-on: ubuntu-latest\n    steps:\n      - uses: actions/checkout@11d5960a326750d5838078e36cf38b85af677262\n';
  assert.ok(validateWorkflow(text).jobs);
  assert.throws(() => validateWorkflow(text.replace(/@[0-9a-f]{40}/, '@v4')), /pinned/);
  assert.throws(() => validateWorkflow(text.replace('pull_request:', 'pull_request_target:')), /privileged/);
  assert.throws(() => validateWorkflow(text + '        continue-on-error: true\n'), /ignore failures/);
});

test('real package validates all installed contracts and CLI exit status', () => {
  const root = dirname(dirname(fileURLToPath(import.meta.url)));
  const result = validatePackage(root);
  assert.equal(result.agents, 3);
  assert.equal(result.skills, 10);
  const cli = spawnSync(process.execPath, ['scripts/validate-package.mjs'], {
    cwd: root, encoding: 'utf8',
  });
  assert.equal(cli.status, 0, cli.stderr);
  assert.match(cli.stdout, /Package contracts valid/);
});

test('frontmatter and workflow reject malformed mappings and duplicated keys', () => {
  assert.throws(() => validateWorkflow('on: [\n'), /workflow/);
  assert.throws(() => validateWorkflow('[]'), /mapping/);
  assert.throws(() => validateWorkflow('name: no-jobs'), /missing workflow controls/);
  assert.throws(() => validateFrontmatter(
    '---\nname: Security\nname: Security\ndescription: meaningful discovery text here\n---\n', 'Security'), /unique/i);
});
