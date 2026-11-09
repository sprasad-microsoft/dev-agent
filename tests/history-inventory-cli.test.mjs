import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { retrieveHistory } from '../scripts/lib/history.mjs';
import { checkInventory, validateSbom } from '../scripts/lib/inventory.mjs';
import { parseArgs, run } from '../scripts/dev-agent.mjs';
import { contained } from '../scripts/lib/io.mjs';
import { fixture, inventoryFixture, projectFixture, put, symlink, TEST_ROOT } from './helpers.mjs';

function comment(id) {
  return { html_url: `https://github.com/owner/repo/pull/1#discussion_r${id}`, path: 'src/example.mjs', line: id, body: `Review ${id}`, created_at: '2026-01-01T00:00:00Z', pull_request_url: 'https://api.github.com/repos/owner/repo/pulls/1' };
}
test('history bounded pagination uses execFile arguments, untriaged records', t => {
  const root = fixture(t); const calls = [];
  const result = retrieveHistory({ workspace: root, repository: 'owner/repo', limit: 65, output: '.dev-agent/evidence/history.json',
    execute: (executable, args, options) => {
      calls.push({ executable, args, options });
      return JSON.stringify(Array.from({ length: 30 }, (_, i) => comment(i + 1)));
    },
  });
  assert.equal(result.count, 65); assert.equal(calls.length, 3);
  assert.equal(calls[0].executable, 'gh');
  assert.deepEqual(calls[0].args.slice(0, 3), ['api', '--method', 'GET']);
  assert.match(calls[2].args[3], /repos\/owner\/repo\/pulls\/comments.*page=3/);
  assert.equal(calls.every(c => !c.options.shell && c.options.timeout === 30000), true);
  const saved = JSON.parse(fs.readFileSync(path.join(root, '.dev-agent', 'evidence', 'history.json')));
  assert.equal(saved.records.length, 65);
  assert.equal(saved.records.every(r => r.classification === 'untriaged'), true);
  assert.equal(saved.records[0].pullRequestUrl, 'https://github.com/owner/repo/pull/1');
});
test('empty history stops on first page and original line fallback preserved', t => {
  const root = fixture(t); let calls = 0;
  retrieveHistory({ workspace: root, repository: 'owner/repo', limit: 100, output: 'history.json', execute: () => { calls++; return '[]'; } });
  assert.equal(calls, 1);
  const data = { ...comment(1), line: null, original_line: 20 };
  retrieveHistory({ workspace: root, repository: 'owner/repo', limit: 1, output: 'second.json', execute: () => JSON.stringify([data]) });
  assert.equal(JSON.parse(fs.readFileSync(path.join(root, 'second.json'))).records[0].line, 20);
});
for (const repository of ['owner', '../repo', 'owner/repo;echo evil', '--flag/repo', 'owner/repo/extra', 'owner/repo?query', 'owner/..']) test(`history rejects repository ${repository} before remote calls`, t => {
  let calls = 0;
  assert.throws(() => retrieveHistory({ workspace: fixture(t), repository, output: 'history.json', execute: () => { calls++; return '[]'; } }), /OWNER\/REPO/);
  assert.equal(calls, 0);
});
for (const limit of [0, 101, 1.5, NaN, '5']) test(`history rejects limit ${limit}`, t => {
  assert.throws(() => retrieveHistory({ workspace: fixture(t), repository: 'owner/repo', limit, output: 'history.json', execute: () => assert.fail('remote call') }), /integer/);
});
for (const output of ['../outside.json', 'C:\\outside.json', '/outside.json', 'file:stream', '']) test(`history rejects output ${output}`, t => {
  assert.throws(() => retrieveHistory({ workspace: fixture(t), repository: 'owner/repo', output, execute: () => assert.fail('remote call') }), /Path|path|Traversal|Absolute/);
});
test('history rejects overwrite and remote failure without output', t => {
  const root = fixture(t); put(root, 'existing.json', 'user data');
  assert.throws(() => retrieveHistory({ workspace: root, repository: 'owner/repo', output: 'existing.json', execute: () => assert.fail('remote call') }), /overwrite/);
  assert.throws(() => retrieveHistory({ workspace: root, repository: 'owner/repo', output: 'history.json', execute: () => { throw new Error('offline'); } }), /retrieval failed.*offline/);
  assert.equal(fs.existsSync(path.join(root, 'history.json')), false);
});
for (const response of ['broken', '{}', JSON.stringify([{ ...comment(1), html_url: 'https://github.com/other/repo/pull/1' }]), JSON.stringify([{ ...comment(1), pull_request_url: 'https://api.github.com/repos/owner/repo/pulls/1/extra' }]), JSON.stringify([{ ...comment(1), line: -1 }])]) test('malformed history response produces no artifact', t => {
  const root = fixture(t);
  assert.throws(() => retrieveHistory({ workspace: root, repository: 'owner/repo', limit: 1, output: 'history.json', execute: () => response }));
  assert.equal(fs.existsSync(path.join(root, 'history.json')), false);
});
test('history refuses symlink output ancestor', t => {
  const root = fixture(t); const external = fixture(t);
  if (!symlink(t, path.join(root, 'linked'), external, 'dir')) return;
  assert.throws(() => retrieveHistory({ workspace: root, repository: 'owner/repo', output: 'linked/history.json', execute: () => assert.fail('remote call') }), /Symlink/);
});
test('inventory accepts exact runtime, build and nested transitive inventory', t => {
  const root = fixture(t); inventoryFixture(root);
  const result = checkInventory(root);
  assert.equal(result.passed, true);
  assert.equal(result.releases[0].runtimeComponents, 2);
  assert.equal(result.releases[0].buildComponents, 2);
  assert.match(result.assertion, /not a vulnerability scan/);
});
test('inventory-check honors configured custom release inventory and preserves blocked behavior', t => {
  const root = fixture(t); const inventory = inventoryFixture(root);
  const project = JSON.parse(fs.readFileSync(path.join(root, '.dev-agent', 'project.json')));
  project.monitoring.releaseInventory = '.dev-agent/evidence/custom-releases.json';
  put(root, '.dev-agent/project.json', project);
  put(root, project.monitoring.releaseInventory, inventory);
  put(root, '.dev-agent/releases.json', { schemaVersion: 1, releases: [] });
  assert.equal(checkInventory(root).passed, true);
  assert.equal(run(['inventory-check', '--workspace', root]).passed, true);
  inventory.releases[0].supported = false;
  put(root, project.monitoring.releaseInventory, inventory);
  assert.deepEqual(checkInventory(root).blocked, ['release-1: unsupported']);
  inventory.releases = [];
  put(root, project.monitoring.releaseInventory, inventory);
  assert.throws(() => checkInventory(root), /No releases/);
});
test('inventory-check does not fall back when configured inventory is missing', t => {
  const root = fixture(t); inventoryFixture(root);
  const project = JSON.parse(fs.readFileSync(path.join(root, '.dev-agent', 'project.json')));
  project.monitoring.releaseInventory = '.dev-agent/missing-releases.json';
  put(root, '.dev-agent/project.json', project);
  assert.throws(() => checkInventory(root), /Missing file.*missing-releases/);
});
for (const reference of ['../releases.json', 'C:\\outside\\releases.json']) test(`inventory-check rejects unsafe configured inventory ${reference}`, t => {
  const root = fixture(t); inventoryFixture(root);
  const project = JSON.parse(fs.readFileSync(path.join(root, '.dev-agent', 'project.json')));
  project.monitoring.releaseInventory = reference;
  put(root, '.dev-agent/project.json', project);
  assert.throws(() => checkInventory(root), /Traversal|Absolute/);
});
test('inventory-check rejects symlinked custom inventory directory', t => {
  const root = fixture(t); const inventory = inventoryFixture(root);
  const external = fixture(t); put(external, 'releases.json', inventory);
  if (!symlink(t, path.join(root, 'linked'), external, 'dir')) return;
  const project = JSON.parse(fs.readFileSync(path.join(root, '.dev-agent', 'project.json')));
  project.monitoring.releaseInventory = 'linked/releases.json';
  put(root, '.dev-agent/project.json', project);
  assert.throws(() => checkInventory(root), /Symlink/);
});
for (const field of ['runtimeSbom', 'buildSbom']) test(`inventory blocks missing ${field}`, t => {
  const root = fixture(t); const inventory = inventoryFixture(root);
  inventory.releases[0][field] = 'missing.json'; put(root, '.dev-agent/releases.json', inventory);
  assert.throws(() => checkInventory(root), /Missing file/);
});
test('inventory explicitly blocks no releases, unsupported and unremediated', t => {
  const root = fixture(t); const inventory = inventoryFixture(root);
  inventory.releases[0].supported = false; put(root, '.dev-agent/releases.json', inventory);
  assert.deepEqual(checkInventory(root).blocked, ['release-1: unsupported']);
  inventory.releases[0].supported = true; inventory.releases[0].remediated = false; put(root, '.dev-agent/releases.json', inventory);
  assert.deepEqual(checkInventory(root).blocked, ['release-1: not remediated']);
  inventory.releases = []; put(root, '.dev-agent/releases.json', inventory);
  assert.throws(() => checkInventory(root), /No releases/);
});
for (const version of ['', '^1.2.3', '~1.0', '>=1', '*', 'latest', 'NOASSERTION', '1.x']) test(`inventory rejects inexact version ${version}`, () => {
  assert.throws(() => validateSbom({ bomFormat: 'CycloneDX', specVersion: '1.6', components: [{ name: 'package', version }] }, 'SBOM'));
});
for (const sbom of [
  {}, { bomFormat: 'CycloneDX', specVersion: '1.6', components: [] },
  { bomFormat: 'CycloneDX', specVersion: '1.6', components: [{ name: 'package' }] },
  { spdxVersion: 'SPDX-2.3', packages: [{ name: 'package' }] },
  { bomFormat: 'CycloneDX', specVersion: '1.6', components: [{ name: 'package', version: '1.0', components: [{ name: 'transitive' }] }] },
]) test('inventory malformed or missing transitive version blocks', () => {
  assert.throws(() => validateSbom(sbom, 'SBOM'));
});
test('inventory rejects malformed JSON, path escapes, schema and duplicate release ids', t => {
  const root = fixture(t); const inventory = inventoryFixture(root);
  inventory.releases[0].runtimeSbom = '../outside.json'; put(root, '.dev-agent/releases.json', inventory);
  assert.throws(() => checkInventory(root), /Traversal/);
  inventory.releases[0].runtimeSbom = '.dev-agent/evidence/runtime.json';
  inventory.releases.push({ ...inventory.releases[0] }); put(root, '.dev-agent/releases.json', inventory);
  assert.throws(() => checkInventory(root), /Duplicate/);
  put(root, '.dev-agent/releases.json', '{broken');
  assert.throws(() => checkInventory(root), /JSON/);
});
const badArgs = [
  [], ['unknown'], ['install'], ['install', '--target', 'x', '--apply', '--dry-run'],
  ['install', '--target=x'], ['install', '--target', 'x', '--unknown'],
  ['install', '--target', 'x', '--target', 'y'], ['install', '--target', '--apply'],
  ['install', '--target', 'x', 'positional'], ['feature-init'], ['feature-check', '--id', 'a'],
  ['feature-status', '--id', 'a', '--approve'], ['fingerprint', '--kind', 'git'],
  ['fingerprint', '--kind', 'design'], ['fingerprint', '--id', 'a'],
  ['history', '--repository', 'owner/repo'], ['history', '--repository', 'owner/repo', '--output', 'x', '--limit', '01'],
  ['history', '--repository', 'owner/repo', '--output', 'x', '--limit', '1.5'],
  ['project-check', '--workspace', '.','--apply'],
];
for (const args of badArgs) test(`CLI rejects ${JSON.stringify(args)}`, () => assert.throws(() => parseArgs(args)));
test('CLI fingerprint and project-check use workspace paths only', t => {
  const root = fixture(t); projectFixture(root);
  assert.equal(run(['project-check', '--workspace', root]).passed, true);
  assert.match(run(['fingerprint', '--workspace', root]).revision, /^[a-f0-9]{64}$/);
  assert.equal(parseArgs(['install', '--target', 'some path;with shell']).options.target, 'some path;with shell');
});
test('CLI import has no side effects and CLI errors return nonzero', t => {
  const root = fixture(t);
  const cli = path.resolve(TEST_ROOT, '..', 'scripts', 'dev-agent.mjs');
  const url = new URL('../scripts/dev-agent.mjs', import.meta.url).href;
  assert.equal(execFileSync(process.execPath, ['--input-type=module', '-e', `await import(${JSON.stringify(url)}); console.log("imported")`], { cwd: root, encoding: 'utf8' }).trim(), 'imported');
  assert.deepEqual(fs.readdirSync(root), []);
  assert.throws(() => execFileSync(process.execPath, [cli, 'install', '--target', root, '--unknown'], { cwd: root, stdio: 'pipe' }), error => error.status === 1 && /Unknown flag/.test(error.stderr.toString()));
});
test('CLI inventory blocked result sets nonzero exit code', t => {
  const root = fixture(t); const inventory = inventoryFixture(root);
  inventory.releases[0].supported = false; put(root, '.dev-agent/releases.json', inventory);
  assert.throws(() => execFileSync(process.execPath, [path.resolve(TEST_ROOT, '..', 'scripts', 'dev-agent.mjs'), 'inventory-check', '--workspace', root], { stdio: 'pipe' }), error => error.status === 1 && JSON.parse(error.stdout).passed === false);
});
for (const reference of ['..\\outside', '\\\\server\\share\\file', 'C:relative', 'a\\..\\b', 'file\u0000name']) test(`contained rejects ${JSON.stringify(reference)}`, t => {
  assert.throws(() => contained(fixture(t), reference));
});
test('schema files are parseable and describe strict contracts', () => {
  for (const name of ['project', 'feature', 'releases', 'history']) {
    const schema = JSON.parse(fs.readFileSync(path.resolve(TEST_ROOT, '..', 'schemas', `${name}.schema.json`)));
    assert.equal(schema.additionalProperties, false);
    assert.equal(schema.properties.schemaVersion.const, 1);
  }
});
