import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { parseScan, runMonitoring, toSarif } from './monitor-dependencies.mjs';

function scan(vulnerabilities = []) {
  return {
    status: vulnerabilities.length ? 1 : 0,
    stdout: JSON.stringify({ results: [{ source: { path: 'package-lock.json', type: 'lockfile' }, packages: [{
      package: { name: 'yaml', version: '2.9.1', ecosystem: 'npm' }, vulnerabilities,
    }] }] }),
    stderr: '',
  };
}

test('scanner output validates packages, advisories, and exact SBOM coverage', () => {
  assert.equal(parseScan(scan()).findings, 0);
  assert.equal(parseScan(scan([{ id: 'TEST-001' }])).findings, 1);
  assert.throws(() => parseScan(scan(), [{ name: 'missing', version: '1' }]), /did not recognize/);
  assert.throws(() => parseScan({ status: 0, stdout: '{}' }), /recognized package sources/);
  assert.throws(() => parseScan({ status: 0, stdout: 'not JSON' }), /malformed JSON/);
  assert.throws(() => parseScan({ ...scan(), status: 1 }), /without a corresponding/);
  assert.throws(() => parseScan({ ...scan(), status: 2 }), /failed/);
});

function fixture(t) {
  const workspace = mkdtempSync(join(tmpdir(), 'dev-agent-monitor-'));
  t.after(() => rmSync(workspace, { recursive: true, force: true }));
  mkdirSync(join(workspace, '.dev-agent'));
  writeFileSync(join(workspace, '.dev-agent', 'project.json'), JSON.stringify({
    schemaVersion: 1, monitoring: { enabled: true, releaseInventory: '.dev-agent/releases.json' },
  }));
  writeFileSync(join(workspace, '.dev-agent', 'releases.json'), JSON.stringify({
    schemaVersion: 1, releases: [],
  }));
  const scanner = join(workspace, 'scanner');
  writeFileSync(scanner, 'stub');
  writeFileSync(join(workspace, 'package-lock.json'), '{}');
  return { workspace, scanner };
}

test('repository-only monitoring is explicit, private, and credential minimized', (t) => {
  const f = fixture(t);
  process.env.DEV_AGENT_TEST_SECRET = 'do-not-inherit';
  t.after(() => delete process.env.DEV_AGENT_TEST_SECRET);
  const result = runMonitoring({ ...f, repositoryOnly: true, run: (binary, args, options) => {
    assert.equal(binary, f.scanner);
    assert.equal(options.env.DEV_AGENT_TEST_SECRET, undefined);
    assert.equal(options.shell, false);
    assert.ok(args.includes('--all-packages'));
    return scan();
  } });
  assert.equal(result.passed, true);
  assert.match(result.summary.scope, /deployed releases not reviewed/);
  assert.equal(JSON.parse(readFileSync(join(result.folder, 'summary.json'))).observations.length, 1);
});

test('empty release inventory and disabled monitoring block', (t) => {
  const f = fixture(t);
  assert.throws(() => runMonitoring({ ...f, run: () => scan() }), /No supported releases/);
  writeFileSync(join(f.workspace, '.dev-agent', 'project.json'), JSON.stringify({
    schemaVersion: 1, monitoring: { enabled: false },
  }));
  assert.throws(() => runMonitoring({ ...f, repositoryOnly: true }), /not enabled/);
});

test('both runtime and build SBOMs are scanned; vulnerabilities remain open', (t) => {
  const f = fixture(t);
  writeFileSync(join(f.workspace, 'runtime.json'), JSON.stringify({
    bomFormat: 'CycloneDX', specVersion: '1.5',
    components: [{ type: 'library', name: 'yaml', version: '2.9.1' }],
  }));
  writeFileSync(join(f.workspace, 'build.json'), JSON.stringify({
    spdxVersion: 'SPDX-2.3', packages: [{ name: 'yaml', versionInfo: '2.9.1' }],
  }));
  writeFileSync(join(f.workspace, '.dev-agent', 'releases.json'), JSON.stringify({
    schemaVersion: 1, releases: [{
      id: 'release-1', revision: 'abc', environment: 'staging', supported: true,
      runtimeSbom: 'runtime.json', buildSbom: 'build.json', remediated: false,
    }],
  }));
  const result = runMonitoring({ ...f, run: () => scan([{ id: 'TEST-001' }]) });
  assert.equal(result.passed, false);
  assert.equal(result.summary.observations.length, 3);
  assert.deepEqual(result.summary.observations.map((item) => item.target),
    ['repository', 'release-1-runtime', 'release-1-build']);
});

test('unsafe SBOM paths and malformed inventory fail before scanning', (t) => {
  const f = fixture(t);
  writeFileSync(join(f.workspace, '.dev-agent', 'releases.json'), JSON.stringify({
    schemaVersion: 1, releases: [{
      id: 'release-1', revision: 'abc', environment: 'staging', supported: true,
      runtimeSbom: '../outside.json', buildSbom: 'build.json', remediated: false,
    }],
  }));
  assert.throws(() => runMonitoring(f), /Traversal forbidden/);
});

test('scanner failures preserve evidence and report blocked rather than passed', (t) => {
  const f = fixture(t);
  const result = runMonitoring({
    ...f, repositoryOnly: true, run: () => ({ status: 2, stdout: '', stderr: 'network unavailable' }),
  });
  assert.equal(result.passed, false);
  assert.equal(result.summary.observations[0].status, 'blocked');
  assert.equal(existsSync(join(f.workspace, '.dev-agent', 'security-results', 'dependencies.sarif')), false);
});

test('SARIF deduplicates stable dependency identities and records target scope', () => {
  const finding = {
    advisoryId: 'TEST-001', target: 'release-1-build', sourcePath: 'build.cdx.json',
    package: { name: 'yaml', version: '2.9.1', ecosystem: 'npm' },
  };
  const first = toSarif([finding, finding]);
  const second = toSarif([{ ...finding, evidence: 'different-run.json' }]);
  assert.equal(first.runs[0].results.length, 1);
  assert.deepEqual(first.runs[0].results[0].partialFingerprints,
    second.runs[0].results[0].partialFingerprints);
  assert.equal(first.runs[0].results[0].properties.target, 'release-1-build');
});

test('dependency ledger tracks observations, preserves ownership, and never auto-closes', (t) => {
  const f = fixture(t);
  const path = join(f.workspace, '.dev-agent', 'vulnerabilities.json');
  runMonitoring({ ...f, repositoryOnly: true, run: () => scan([{ id: 'TEST-001' }]) });
  let ledger = JSON.parse(readFileSync(path, 'utf8'));
  assert.equal(ledger.findings.length, 1);
  assert.equal(ledger.findings[0].status, 'open');
  ledger.findings[0].owner = 'security-team';
  writeFileSync(path, JSON.stringify(ledger));
  runMonitoring({ ...f, repositoryOnly: true, run: () => scan() });
  ledger = JSON.parse(readFileSync(path, 'utf8'));
  assert.equal(ledger.findings[0].status, 'open');
  assert.equal(ledger.findings[0].owner, 'security-team');
  ledger.findings[0].status = 'remediated';
  writeFileSync(path, JSON.stringify(ledger));
  runMonitoring({ ...f, repositoryOnly: true, run: () => scan([{ id: 'TEST-001' }]) });
  ledger = JSON.parse(readFileSync(path, 'utf8'));
  assert.equal(ledger.findings.length, 1);
  assert.equal(ledger.findings[0].status, 'open');
  assert.ok(ledger.findings[0].reopenedAt);
  writeFileSync(path, '{"schemaVersion":1,"findings":[{}]}');
  assert.throws(() => runMonitoring({ ...f, repositoryOnly: true, run: () => scan() }), /ledger is malformed/);
});

test('monitor CLI rejects absent, unknown, duplicate, and incomplete arguments', () => {
  const script = fileURLToPath(new URL('./monitor-dependencies.mjs', import.meta.url));
  for (const args of [
    [], ['--unknown'], ['--scanner'], ['--scanner', '--repository-only'],
    ['--repository-only', '--repository-only'],
  ]) {
    const result = spawnSync(process.execPath, [script, ...args], { encoding: 'utf8' });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /Dependency monitoring error/);
  }
});

test('scanner rejects empty/malformed packages, missing identity, and timeouts', () => {
  for (const report of [
    { results: [{ packages: [] }] },
    { results: [{}] },
    { results: [{ packages: [{ package: {} }] }] },
    { results: [{ packages: [{
      package: { name: 'yaml', version: '2.9.1', ecosystem: 'npm' },
      vulnerabilities: {},
    }] }] },
  ]) {
    assert.throws(() => parseScan({ status: 0, stdout: JSON.stringify(report) }));
  }
  assert.throws(() => parseScan({ error: new Error('timeout') }), /timeout/);
  assert.throws(() => parseScan({ signal: 'SIGTERM' }), /SIGTERM/);
});

test('unsupported SBOM and duplicate release identifiers block before execution', (t) => {
  const f = fixture(t);
  writeFileSync(join(f.workspace, 'runtime.cdx.json'), JSON.stringify({ unsupported: true }));
  const release = {
    id: 'release-1', revision: 'abc', environment: 'staging', supported: true,
    runtimeSbom: 'runtime.cdx.json', buildSbom: 'runtime.cdx.json', remediated: false,
  };
  writeFileSync(join(f.workspace, '.dev-agent', 'releases.json'), JSON.stringify({
    schemaVersion: 1, releases: [release],
  }));
  assert.throws(() => runMonitoring(f), /CycloneDX|SPDX|unsupported/i);
  writeFileSync(join(f.workspace, 'runtime.cdx.json'), JSON.stringify({
    bomFormat: 'CycloneDX', specVersion: '1.5',
    components: [{ type: 'library', name: 'yaml', version: '2.9.1' }],
  }));
  writeFileSync(join(f.workspace, '.dev-agent', 'releases.json'), JSON.stringify({
    schemaVersion: 1, releases: [release, release],
  }));
  assert.throws(() => runMonitoring(f), /unique/);
});

test('nested transitive CycloneDX components must be recognized by the scanner', (t) => {
  const f = fixture(t);
  writeFileSync(join(f.workspace, 'runtime.cdx.json'), JSON.stringify({
    bomFormat: 'CycloneDX', specVersion: '1.5', components: [{
      name: 'yaml', version: '2.9.1',
      components: [{ group: '@scope', name: 'unrecognized', version: '1.0.0' }],
    }],
  }));
  writeFileSync(join(f.workspace, '.dev-agent', 'releases.json'), JSON.stringify({
    schemaVersion: 1, releases: [{
      id: 'release-1', revision: 'abc', environment: 'staging', supported: true,
      runtimeSbom: 'runtime.cdx.json', buildSbom: 'runtime.cdx.json', remediated: false,
    }],
  }));
  const result = runMonitoring({ ...f, run: () => scan() });
  assert.equal(result.passed, false);
  assert.match(result.summary.observations[1].reason, /did not recognize 1 SBOM component/);
  assert.equal(result.summary.observations[2].status, 'blocked');
});

test('real OSV scans root, runtime, and build dependencies', {
  skip: process.env.DEV_AGENT_OSV_BINARY ? false : 'Set DEV_AGENT_OSV_BINARY to opt into external advisory queries.',
}, (t) => {
  const f = fixture(t);
  writeFileSync(join(f.workspace, 'package-lock.json'), JSON.stringify({
    name: 'dev-agent-test', version: '1.0.0', lockfileVersion: 3,
    packages: {
      '': { name: 'dev-agent-test', version: '1.0.0', dependencies: { yaml: '2.9.1' } },
      'node_modules/yaml': { version: '2.9.1' },
    },
  }));
  for (const scope of ['runtime', 'build']) {
    writeFileSync(join(f.workspace, `${scope}.cdx.json`), JSON.stringify({
      bomFormat: 'CycloneDX', specVersion: '1.5', version: 1,
      components: [{ type: 'library', name: 'yaml', version: '2.9.1', purl: 'pkg:npm/yaml@2.9.1' }],
    }));
  }
  writeFileSync(join(f.workspace, '.dev-agent', 'releases.json'), JSON.stringify({
    schemaVersion: 1, releases: [{
      id: 'release-1', revision: 'abc', environment: 'isolated-test', supported: true,
      runtimeSbom: 'runtime.cdx.json', buildSbom: 'build.cdx.json', remediated: false,
    }],
  }));
  const result = runMonitoring({ ...f, scanner: process.env.DEV_AGENT_OSV_BINARY });
  assert.equal(result.passed, true, JSON.stringify(result.summary));
  assert.equal(result.summary.observations.length, 3);
});
