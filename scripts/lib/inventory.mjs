import { assert, contained, readJson, workspaceRoot } from './io.mjs';
import { boolean, loadProject, object, revision, text } from './contracts.mjs';

export function validateSbom(sbom, label) {
  object(sbom, label);
  let items;
  let versionKey;
  if (sbom.bomFormat === 'CycloneDX') {
    assert(typeof sbom.specVersion === 'string', `${label}: missing CycloneDX specVersion`);
    assert(Array.isArray(sbom.components), `${label}: components required`);
    items = [];
    const visit = components => {
      assert(Array.isArray(components), `${label}: nested components must be an array`);
      for (const component of components) {
        object(component, `${label} component`); items.push(component);
        if (component.components !== undefined) visit(component.components);
      }
    };
    visit(sbom.components);
    versionKey = 'version';
  } else if (typeof sbom.spdxVersion === 'string' && /^SPDX-2[.]\d+$/.test(sbom.spdxVersion)) {
    assert(Array.isArray(sbom.packages), `${label}: packages required`);
    items = sbom.packages; versionKey = 'versionInfo';
  } else throw new Error(`${label}: expected CycloneDX or SPDX 2.x JSON`);
  assert(items.length > 0, `${label}: empty inventory blocks verification`);
  for (const item of items) {
    object(item, `${label} component`); text(item.name, `${label} name`); text(item[versionKey], `${label} exact version`);
    assert(!/^(?:NOASSERTION|NONE|UNKNOWN|latest|\*)$/i.test(item[versionKey]) && !/[\s*^~<>=|]/.test(item[versionKey]) && !/(?:^|[.])x(?:[.]|$)/i.test(item[versionKey]), `${label}: exact version required for ${item.name}`);
  }
  return items.length;
}
export function checkInventory(workspace) {
  const root = workspaceRoot(workspace);
  const project = loadProject(root);
  const inventory = readJson(contained(root, project.monitoring.releaseInventory, { existing: true, file: true }));
  object(inventory, 'inventory', ['schemaVersion', 'releases']);
  assert(inventory.schemaVersion === 1 && Array.isArray(inventory.releases), 'Invalid release inventory schema');
  assert(inventory.releases.length > 0, 'No releases: inventory verification blocked');
  const ids = new Set();
  const releases = inventory.releases.map(release => {
    object(release, 'release inventory entry', ['id', 'revision', 'supported', 'runtimeSbom', 'buildSbom', 'environment', 'remediated']);
    text(release.id, 'release.id'); assert(!ids.has(release.id), 'Duplicate release id'); ids.add(release.id);
    revision(release.revision, 'release.revision'); text(release.environment, 'release.environment');
    boolean(release.supported, 'release.supported'); boolean(release.remediated, 'release.remediated');
    const runtimeComponents = validateSbom(readJson(contained(root, release.runtimeSbom, { existing: true, file: true })), 'runtime SBOM');
    const buildComponents = validateSbom(readJson(contained(root, release.buildSbom, { existing: true, file: true })), 'build SBOM');
    return { id: release.id, supported: release.supported, remediated: release.remediated, runtimeComponents, buildComponents };
  });
  const blocked = releases.filter(release => !release.supported || !release.remediated).map(release => `${release.id}: ${!release.supported ? 'unsupported' : 'not remediated'}`);
  return { passed: blocked.length === 0, blocked, releases, assertion: 'Inventory structure only; not a vulnerability scan or proof of transitive completeness' };
}
