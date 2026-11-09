#!/usr/bin/env node
import { mkdirSync, writeFileSync, lstatSync, existsSync, unlinkSync } from 'node:fs';
import { resolve, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { randomUUID, createHash } from 'node:crypto';
import { workspaceRoot, noSymlinks, contained, readJson } from './lib/io.mjs';
import { validateSbom } from './lib/inventory.mjs';

function components(path) {
  const bom = readJson(path);
  validateSbom(bom, path);
  let list;
  if (bom.bomFormat === 'CycloneDX' && Array.isArray(bom.components)) {
    const visit = (items) => items.flatMap((item) => [{
      name: item.group ? `${item.group}/${item.name}` : item.name, version: item.version,
    }, ...visit(item.components ?? [])]);
    list = visit(bom.components);
  } else if (typeof bom.spdxVersion === 'string' && Array.isArray(bom.packages)) {
    list = bom.packages.map((item) => ({ name: item.name, version: item.versionInfo }));
  } else {
    throw new Error(`Unsupported SBOM format: ${path}`);
  }
  return list;
}

export function parseScan(result, expected = []) {
  if (result.error || result.signal || ![0, 1].includes(result.status)) {
    throw new Error(`OSV-Scanner failed (${result.status ?? 'no exit code'}): ${
      result.error?.message ?? result.signal ?? 'inspect private scanner stderr'}`);
  }
  let report;
  try {
    report = JSON.parse(result.stdout);
  } catch (error) {
    throw new Error('OSV-Scanner returned malformed JSON.', { cause: error });
  }
  if (!Array.isArray(report.results) || !report.results.length) {
    throw new Error('OSV-Scanner did not report any recognized package sources.');
  }
  const packages = report.results.flatMap((source) => {
    if (typeof source.source?.path !== 'string' || !source.source.path.trim()) {
      throw new Error('OSV-Scanner source identity is missing.');
    }
    if (!Array.isArray(source.packages)) throw new Error('OSV-Scanner package results are malformed.');
    return source.packages;
  });
  if (!packages.length) throw new Error('OSV-Scanner did not recognize any packages.');
  const identities = new Set();
  let findings = 0;
  for (const item of packages) {
    if (!item.package || typeof item.package.name !== 'string' ||
        typeof item.package.version !== 'string' ||
        typeof item.package.ecosystem !== 'string' || !item.package.ecosystem) {
      throw new Error('OSV-Scanner returned an unrecognized package identity.');
    }
    identities.add(`${item.package.name}\0${item.package.version}`);
    if (item.vulnerabilities !== undefined && !Array.isArray(item.vulnerabilities)) {
      throw new Error('OSV-Scanner vulnerability results are malformed.');
    }
    if (item.vulnerabilities?.some((finding) => typeof finding?.id !== 'string' || !finding.id.trim())) {
      throw new Error('OSV-Scanner returned a vulnerability without an advisory ID.');
    }
    findings += item.vulnerabilities?.length ?? 0;
  }
  const missing = expected.filter((item) => !identities.has(`${item.name}\0${item.version}`));
  if (missing.length) throw new Error(`Scanner did not recognize ${missing.length} SBOM component(s).`);
  if (result.status === 1 && findings === 0) {
    throw new Error('OSV-Scanner failed without a corresponding vulnerability finding.');
  }
  return { packages: packages.length, findings, report };
}

function updateLedger(workspace, observations) {
  const path = contained(workspace, '.dev-agent/vulnerabilities.json');
  const ledger = existsSync(path) ? readJson(path) : { schemaVersion: 1, findings: [] };
  if (ledger.schemaVersion !== 1 || !Array.isArray(ledger.findings) ||
      ledger.findings.some((finding) => typeof finding.id !== 'string' ||
        typeof finding.status !== 'string') ||
      new Set(ledger.findings.map((finding) => finding.id)).size !== ledger.findings.length) {
    throw new Error('Vulnerability ledger is malformed; preserve and repair it before monitoring.');
  }
  const now = new Date().toISOString();
  for (const observed of observations) {
    const identity = JSON.stringify([observed.target, observed.advisoryId, observed.package]);
    const id = createHash('sha256').update(identity).digest('hex');
    let finding = ledger.findings.find((item) => item.id === id);
    if (!finding) {
      finding = {
        id, advisoryId: observed.advisoryId, package: observed.package,
        target: observed.target, firstSeen: now, status: 'open', owner: null,
        dueAt: null, exception: null, fixPullRequest: null, remediationEvidence: [],
      };
      ledger.findings.push(finding);
    }
    if (['remediated', 'retired'].includes(finding.status)) {
      finding.status = 'open';
      finding.reopenedAt = now;
    }
    finding.lastSeen = now;
    finding.observationEvidence = observed.evidence;
  }
  writeFileSync(path, `${JSON.stringify(ledger, null, 2)}\n`, { mode: 0o600 });
  return path;
}

export function toSarif(observations) {
  const rules = [...new Set(observations.map((item) => item.advisoryId))].sort().map((id) => ({
    id, shortDescription: { text: `Known dependency advisory ${id}` },
    helpUri: `https://osv.dev/vulnerability/${encodeURIComponent(id)}`,
  }));
  const unique = new Map();
  for (const item of observations) {
    const identity = JSON.stringify([item.target, item.advisoryId, item.package]);
    unique.set(identity, {
      ruleId: item.advisoryId, level: 'warning',
      message: { text: `${item.package.ecosystem}/${item.package.name}@${item.package.version} is affected by ${item.advisoryId} in ${item.target}. Verify impact and deployed remediation.` },
      locations: [{
        physicalLocation: {
          artifactLocation: { uri: encodeURI(item.sourcePath), uriBaseId: '%SRCROOT%' },
          region: { startLine: 1 },
        },
      }],
      partialFingerprints: {
        primaryLocationLineHash: createHash('sha256').update(identity).digest('hex'),
      },
      properties: { target: item.target, package: item.package },
    });
  }
  return {
    version: '2.1.0',
    $schema: 'https://json.schemastore.org/sarif-2.1.0.json',
    runs: [{
      tool: { driver: {
        name: 'Dev Agent dependency monitoring', version: '0.1.0',
        informationUri: 'https://github.com/sprasad-microsoft/dev-agent', rules,
      } },
      invocations: [{ executionSuccessful: true }],
      results: [...unique.values()],
    }],
  };
}

export function runMonitoring({ workspace, scanner, repositoryOnly = false, run = spawnSync }) {
  workspace = workspaceRoot(workspace);
  const sarifPath = contained(workspace, '.dev-agent/security-results/dependencies.sarif');
  if (existsSync(sarifPath)) unlinkSync(sarifPath);
  const scannerPath = noSymlinks(resolve(scanner));
  if (!lstatSync(scannerPath).isFile()) {
    throw new Error('Scanner must be an explicitly supplied regular executable file.');
  }
  const project = readJson(contained(workspace, '.dev-agent/project.json', { existing: true, file: true }));
  if (project.schemaVersion !== 1 || project.monitoring?.enabled !== true) {
    throw new Error('Monitoring is not enabled in the workspace project configuration.');
  }
  const targets = [{ id: 'repository', args: ['--recursive', workspace], expected: [] }];
  if (!repositoryOnly) {
    const inventory = readJson(contained(workspace, project.monitoring.releaseInventory, { existing: true, file: true }));
    if (inventory.schemaVersion !== 1 || !Array.isArray(inventory.releases)) {
      throw new Error('Invalid release inventory.');
    }
    if (inventory.releases.some((release) => typeof release.supported !== 'boolean')) {
      throw new Error('Every release must explicitly declare whether it is supported.');
    }
    const supported = inventory.releases.filter((release) => release.supported);
    if (!supported.length) throw new Error('No supported releases inventoried; release monitoring is blocked.');
    const ids = new Set();
    for (const release of supported) {
      if (typeof release.id !== 'string' || !/^[a-z0-9][a-z0-9._-]{0,99}$/.test(release.id) ||
          ids.has(release.id) || typeof release.revision !== 'string' || !release.revision.trim() ||
          typeof release.environment !== 'string' || !release.environment.trim() ||
          typeof release.remediated !== 'boolean') {
        throw new Error('Supported releases require unique safe IDs, revisions, environments, and remediation flags.');
      }
      ids.add(release.id);
      for (const scope of ['runtime', 'build']) {
        const path = contained(workspace, release[`${scope}Sbom`], { existing: true, file: true });
        targets.push({
          id: `${release.id}-${scope}`,
          args: ['--sbom', path],
          expected: components(path),
        });
      }
    }
  }
  const folder = contained(workspace, `.dev-agent/security-results/${randomUUID()}`);
  mkdirSync(folder, { recursive: true, mode: 0o700 });
  const env = {};
  for (const key of ['PATH', 'Path', 'SYSTEMROOT', 'SystemRoot', 'WINDIR', 'TEMP', 'TMP']) {
    if (process.env[key]) env[key] = process.env[key];
  }
  const observations = [];
  const ledgerObservations = [];
  for (const target of targets) {
    const args = ['scan', 'source', '--format', 'json', '--all-packages', ...target.args];
    const result = run(scannerPath, args, {
      cwd: workspace, env, encoding: 'utf8', timeout: 300_000,
      maxBuffer: 32 * 1024 * 1024, shell: false,
    });
    writeFileSync(join(folder, `${target.id}.stdout.json`), result.stdout ?? '', { mode: 0o600 });
    writeFileSync(join(folder, `${target.id}.stderr.txt`), result.stderr ?? '', { mode: 0o600 });
    try {
      const parsed = parseScan(result, target.expected);
      observations.push({
        target: target.id, status: parsed.findings ? 'findings' : 'scanned',
        packages: parsed.packages, findings: parsed.findings,
      });
      for (const source of parsed.report.results) {
        const sourceFile = target.id === 'repository'
          ? contained(workspace, relative(workspace, resolve(workspace, source.source.path)),
            { existing: true, file: true })
          : target.args[1];
        for (const item of source.packages) {
          for (const advisory of item.vulnerabilities ?? []) {
            ledgerObservations.push({
              target: target.id, advisoryId: advisory.id,
              package: {
                name: item.package.name, version: item.package.version,
                ecosystem: item.package.ecosystem,
              },
              sourcePath: relative(workspace, sourceFile).split('\\').join('/'),
              evidence: relative(workspace, join(folder, `${target.id}.stdout.json`)).split('\\').join('/'),
            });
          }
        }
      }
    } catch (error) {
      observations.push({ target: target.id, status: 'blocked', reason: error.message });
    }
  }
  const summary = {
    schemaVersion: 1, at: new Date().toISOString(),
    scope: repositoryOnly ? 'repository-only; deployed releases not reviewed' : 'repository and supported release SBOMs',
    observations,
    limitations: [
      'Known-advisory matching is not proof of exploitability or absence of novel vulnerabilities.',
      'SBOM completeness, scanner configuration, and platform/CI-tool coverage require independent review.',
      'No vulnerability ledger entry is automatically closed by a scan.',
    ],
  };
  writeFileSync(join(folder, 'summary.json'), JSON.stringify(summary, null, 2), { mode: 0o600 });
  const ledger = updateLedger(workspace, ledgerObservations);
  if (!observations.some((item) => item.status === 'blocked')) {
    writeFileSync(sarifPath, `${JSON.stringify(toSarif(ledgerObservations), null, 2)}\n`, { mode: 0o600 });
  }
  return { folder, summary, ledger, passed: observations.every((item) => item.status === 'scanned') };
}

function main(argv) {
  const options = { workspace: process.cwd(), repositoryOnly: false };
  const seen = new Set();
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (seen.has(arg)) throw new Error(`Duplicate argument: ${arg}`);
    seen.add(arg);
    if (arg === '--repository-only') options.repositoryOnly = true;
    else if (arg === '--workspace' || arg === '--scanner') {
      if (!argv[i + 1] || argv[i + 1].startsWith('--')) throw new Error(`Missing value for ${arg}`);
      options[arg.slice(2)] = argv[++i];
    } else throw new Error(`Unknown argument: ${arg}`);
  }
  if (!options.scanner) throw new Error('Required: --scanner PATH [--workspace PATH] [--repository-only]');
  const result = runMonitoring(options);
  console.log(`Security observations saved privately to ${result.folder}`);
  console.log(`Scope: ${result.summary.scope}`);
  if (!result.passed) throw new Error('Dependency monitoring found vulnerabilities or blocked scans; inspect private evidence.');
  console.log('No known advisories identified in the recognized scanned packages; see coverage limitations.');
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    main(process.argv.slice(2));
  } catch (error) {
    console.error(`Dependency monitoring error: ${error.message}`);
    process.exitCode = 1;
  }
}
