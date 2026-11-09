import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

export function assert(condition, message) {
  if (!condition) throw new Error(message);
}

export function noSymlinks(filename) {
  const absolute = path.resolve(filename);
  const { root } = path.parse(absolute);
  let current = root;
  for (const part of absolute.slice(root.length).split(path.sep).filter(Boolean)) {
    current = path.join(current, part);
    if (fs.existsSync(current) || fs.lstatSync(current, { throwIfNoEntry: false })) {
      assert(!fs.lstatSync(current).isSymbolicLink(), `Symlink forbidden: ${current}`);
    }
  }
  return absolute;
}

export function workspaceRoot(root) {
  const absolute = noSymlinks(root);
  assert(fs.statSync(absolute).isDirectory(), 'Workspace must be an existing directory');
  return absolute;
}

export function contained(root, reference, { existing = false, file = false } = {}) {
  assert(typeof reference === 'string' && reference.trim() && !reference.includes('\0'), 'Path must be a nonempty string');
  assert(!path.isAbsolute(reference) && !path.win32.isAbsolute(reference), `Absolute path forbidden: ${reference}`);
  assert(!reference.split(/[\\/]/).includes('..'), `Traversal forbidden: ${reference}`);
  assert(!reference.includes(':'), `Invalid path: ${reference}`);
  const resolved = path.resolve(root, reference.replace(/[\\/]/g, path.sep));
  const relative = path.relative(path.resolve(root), resolved);
  assert(relative !== '' && !relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative), `Path outside workspace: ${reference}`);
  noSymlinks(resolved);
  if (existing) {
    assert(fs.existsSync(resolved), `Missing file: ${reference}`);
    if (file) assert(fs.statSync(resolved).isFile(), `Expected file: ${reference}`);
  }
  return resolved;
}

export function readJson(filename) {
  noSymlinks(filename);
  try { return JSON.parse(fs.readFileSync(filename, 'utf8')); }
  catch (error) { throw new Error(`Cannot read JSON ${filename}: ${error.message}`); }
}

export function writeNew(root, reference, value) {
  const filename = contained(root, reference);
  assert(!fs.existsSync(filename), `Refusing overwrite: ${reference}`);
  fs.mkdirSync(path.dirname(filename), { recursive: true });
  noSymlinks(filename);
  fs.writeFileSync(filename, `${JSON.stringify(value, null, 2)}\n`, { flag: 'wx' });
  return filename;
}

export function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;
  return JSON.stringify(value);
}

export function hash(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

export function listFiles(root, prefix = '', ignore = () => false) {
  const result = [];
  for (const entry of fs.readdirSync(path.join(root, prefix), { withFileTypes: true }).sort((a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0)) {
    const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
    assert(!entry.isSymbolicLink(), `Symlink forbidden: ${relative}`);
    if (ignore(relative, entry)) continue;
    if (entry.isDirectory()) result.push(...listFiles(root, relative, ignore));
    else {
      assert(entry.isFile(), `Unsupported source entry: ${relative}`);
      result.push(relative);
    }
  }
  return result;
}
