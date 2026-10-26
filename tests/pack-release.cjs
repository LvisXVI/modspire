const assert = require('node:assert/strict');
const { test } = require('node:test');
const zlib = require('node:zlib');
const { readIndex } = require('../mrpack.cjs');
let createPackReleaseService;
try { ({ createPackReleaseService } = require('../pack-release.cjs')); } catch (error) { if (error.code !== 'MODULE_NOT_FOUND') throw error; }
const setup = { id: 'pack', name: 'My Pack', minecraftVersion: '1.21.1', loader: 'fabric', mods: [] };
const mod = (id, versionId) => ({ id, provider: 'modrinth', kind: 'mod', title: id, ...(versionId ? { versionId, versionNumber: versionId } : {}) });
const file = (filename) => ({ filename, primary: true, url: `https://cdn.modrinth.com/data/fixture/${encodeURIComponent(filename)}`, size: 123, hashes: { sha1: '1'.repeat(40), sha512: '2'.repeat(128) } });
const version = (id, project_id, extra = {}) => ({ id, project_id, version_number: id, date_published: '2025-01-01T00:00:00Z', game_versions: ['1.21.1'], loaders: ['fabric'], version_type: 'release', status: 'listed', dependencies: [], files: [file(`${id}.jar`)], ...extra });
function fixture({ versions = [], projects = {}, routes = {}, fail = [] } = {}) {
  const calls = [];
  const fetchJson = async (raw) => {
    const url = new URL(raw); calls.push(url.href);
    if (fail.some(part => url.pathname.includes(part))) throw new Error('Network unavailable');
    if (Object.hasOwn(routes, url.href)) return structuredClone(routes[url.href]);
    if (url.host === 'meta.fabricmc.net') return [{ loader: { version: '0.16.10', stable: true } }];
    const parts = url.pathname.split('/').filter(Boolean);
    if (parts[1] === 'version') {
      const found = versions.find(entry => entry.id === parts[2]);
      if (!found) throw new Error(`Missing version ${parts[2]}`);
      return structuredClone(found);
    }
    if (parts[1] === 'project') {
      const id = parts[2];
      if (parts[3] === 'version') {
        const found = versions.filter(entry => entry.project_id === id);
        assert.deepEqual(JSON.parse(url.searchParams.get('game_versions')), ['1.21.1']);
        return structuredClone(found);
      }
      return { id, slug: id, title: id, project_type: 'mod', client_side: 'required', server_side: 'optional', ...structuredClone(projects[id] || {}) };
    }
    throw new Error(`Unexpected request ${raw}`);
  };
  return { calls, service: () => { assert.equal(typeof createPackReleaseService, 'function', 'release backend must provide createPackReleaseService'); return createPackReleaseService({ fetchJson }); } };
}

test('update candidates use exact baseline and publication time, exclude beta and older releases', async () => {
  const versions = [version('old', 'a', { date_published: '2024-01-01Z' }), version('current', 'a'), version('beta', 'a', { version_type: 'beta', date_published: '2026-01-01Z' }), version('new', 'a', { date_published: '2025-02-01Z' })];
  const original = { ...setup, mods: [mod('a', 'current')] };
  const before = structuredClone(original);
  const entries = await fixture({ versions }).service().checkUpdates(original);
  assert.equal(entries[0].key, 'modrinth:a'); assert.equal(entries[0].status, 'update');
  assert.equal(entries[0].candidate.versionId, 'new'); assert.equal(entries[0].candidate.versionNumber, 'new');
  assert.equal(entries[0].candidate.title, 'a'); assert.deepEqual(original, before);
  assert.equal((await fixture({ versions }).service().checkUpdates({ ...setup, mods: [mod('a', 'new')] }))[0].status, 'current');
});
test('unpinned entries are never current but carry a concrete candidate', async () => {
  const entries = await fixture({ versions: [version('latest', 'a')] }).service().checkUpdates({ ...setup, mods: [mod('a')] });
  assert.equal(entries[0].status, 'unpinned'); assert.equal(entries[0].candidate.versionId, 'latest');
});
test('unsupported providers and network failures have explicit non-current results', async () => {
  const entries = await fixture({ fail: ['/version'] }).service().checkUpdates({ ...setup, mods: [mod('a'), { ...mod('b'), provider: 'curseforge' }] });
  assert.deepEqual(entries.map(entry => entry.status), ['unavailable', 'unsupported']);
  assert.match(entries[1].message, /CurseForge|curseforge/);
});
test('incompatible or wrong-project pinned versions cannot become baselines', async () => {
  for (const bad of [version('current', 'different'), version('current', 'a', { loaders: ['forge'] }), version('current', 'a', { date_published: 'bad' })]) {
    const entries = await fixture({ versions: [bad, version('new', 'a', { date_published: '2025-02-01Z' })] }).service().checkUpdates({ ...setup, mods: [mod('a', 'current')] });
    assert.equal(entries[0].status, 'unavailable');
  }
});
test('export creates a valid ZIP with exact transitive pinned dependency closure and metadata', async () => {
  const versions = [version('a1', 'a', { dependencies: [{ dependency_type: 'required', project_id: 'b', version_id: 'b1' }] }), version('b1', 'b', { dependencies: [{ dependency_type: 'required', project_id: 'c', version_id: null }] }), version('b2', 'b', { date_published: '2025-02-01Z' }), version('c1', 'c')];
  const f = fixture({ versions }); const original = { ...setup, mods: [mod('a', 'a1')] };
  const { buffer, manifest } = await f.service().prepareExport(original);
  assert.ok(Buffer.isBuffer(buffer)); assert.equal(buffer.readUInt32LE(0), 0x04034b50);
  assert.deepEqual(readIndex(buffer), manifest);
  assert.deepEqual(manifest.dependencies, { minecraft: '1.21.1', 'fabric-loader': '0.16.10' });
  assert.equal(manifest.formatVersion, 1); assert.equal(manifest.game, 'minecraft'); assert.equal(manifest.name, 'My Pack');
  assert.deepEqual(manifest.files.map(entry => entry.path).sort(), ['mods/a1.jar', 'mods/b1.jar', 'mods/c1.jar']);
  assert.deepEqual(manifest.files[0].hashes, { sha1: '1'.repeat(40), sha512: '2'.repeat(128) });
  assert.equal(manifest.files[0].fileSize, 123); assert.deepEqual(manifest.files[0].env, { client: 'required', server: 'optional' });
  const nameLength = buffer.readUInt16LE(26), extraLength = buffer.readUInt16LE(28), length = buffer.readUInt32LE(18);
  assert.equal(buffer.subarray(30, 30 + nameLength).toString(), 'modrinth.index.json');
  const raw = buffer.subarray(30 + nameLength + extraLength, 30 + nameLength + extraLength + length);
  const decoded = buffer.readUInt16LE(8) === 8 ? zlib.inflateRawSync(raw) : raw;
  assert.equal(JSON.parse(decoded).files.length, 3);
  // An independent CRC computation catches archives accepted by our forgiving importer.
  let crc = 0xffffffff;
  for (const byte of decoded) { crc ^= byte; for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0); }
  assert.equal(buffer.readUInt32LE(14), (crc ^ 0xffffffff) >>> 0);
  assert.ok(f.calls.some(url => url === 'https://meta.fabricmc.net/v2/versions/loader/1.21.1'));
});
test('version-only required dependencies and cycles resolve once without duplicate files', async () => {
  const versions = [version('a1', 'a', { dependencies: [{ dependency_type: 'required', version_id: 'b1' }] }), version('b1', 'b', { dependencies: [{ dependency_type: 'required', project_id: 'a', version_id: 'a1' }] })];
  const f = fixture({ versions }); const { manifest } = await f.service().prepareExport({ ...setup, mods: [mod('a', 'a1')] });
  assert.equal(manifest.files.length, 2); assert.ok(f.calls.length < 12);
});
test('contradictory root pins and two-parent required pins fail instead of silently changing versions', async () => {
  const versions = [version('a1', 'a', { dependencies: [{ dependency_type: 'required', project_id: 'b', version_id: 'b1' }] }), version('c1', 'c', { dependencies: [{ dependency_type: 'required', project_id: 'b', version_id: 'b2' }] }), version('b1', 'b'), version('b2', 'b')];
  for (const mods of [[mod('a', 'a1'), mod('b', 'b2')], [mod('a', 'a1'), mod('c', 'c1')], [mod('b', 'b1'), mod('b', 'b2')]]) {
    await assert.rejects(() => fixture({ versions }).service().prepareExport({ ...setup, mods }), /conflict|pin|widerspr|Konflikt/i);
  }
});
test('an unpinned root can satisfy a later exact dependency requirement', async () => {
  const versions = [version('b2', 'b', { date_published: '2025-02-01Z' }), version('b1', 'b'), version('a1', 'a', { dependencies: [{ dependency_type: 'required', project_id: 'b', version_id: 'b1' }] })];
  const { manifest } = await fixture({ versions }).service().prepareExport({ ...setup, mods: [mod('b'), mod('a')] });
  assert.deepEqual(manifest.files.map(entry => entry.path).sort(), ['mods/a1.jar', 'mods/b1.jar']);
});
test('missing required dependencies, incompatible declarations and unsupported members fail visibly', async () => {
  const cases = [
    { versions: [version('a1', 'a', { dependencies: [{ dependency_type: 'required', file_name: 'unknown.jar' }] })], mods: [mod('a')] },
    { versions: [version('a1', 'a', { dependencies: [{ dependency_type: 'required', project_id: 'missing' }] })], mods: [mod('a')] },
    { versions: [version('a1', 'a', { dependencies: [{ dependency_type: 'incompatible', project_id: 'b' }] }), version('b1', 'b')], mods: [mod('a'), mod('b')] },
    { versions: [], mods: [{ ...mod('a'), provider: 'curseforge' }] },
    { versions: [], mods: [{ ...mod('a'), provider: 'local' }] },
  ];
  for (const value of cases) await assert.rejects(() => fixture(value).service().prepareExport({ ...setup, mods: value.mods }), /required|dependency|unresolved|unsupported|CurseForge|missing|incompat|Abhäng|nicht unterstützt/i);
});
test('unsafe file paths, collisions, bad URLs, invalid hashes and missing binary metadata fail export', async () => {
  const invalidFiles = [
    { filename: '../escape.jar' }, { filename: 'a\\escape.jar' }, { filename: 'CON.jar' }, { filename: 'a.jar ' },
    { url: 'http://cdn.modrinth.com/a.jar' }, { url: 'https://cdn.modrinth.com.evil.test/a.jar' }, { url: 'https://user:pass@cdn.modrinth.com/a.jar' }, { url: 'https://cdn.modrinth.com/a jar' }, { url: 'https://cdn.modrinth.com/a{b}.jar' },
    { hashes: { sha1: '1'.repeat(40), sha512: 'bad' } }, { size: -1 },
  ];
  for (const invalid of invalidFiles) await assert.rejects(() => fixture({ versions: [version('a1', 'a', { files: [{ ...file('a.jar'), ...invalid }] })] }).service().prepareExport({ ...setup, mods: [mod('a')] }), /file|path|hash|download|size|Datei|Pfad|URL/i);
  await assert.rejects(() => fixture({ versions: [version('a1', 'a', { files: [file('same.jar')] }), version('b1', 'b', { files: [file('SAME.jar')] })] }).service().prepareExport({ ...setup, mods: [mod('a'), mod('b')] }), /collision|Kollision/i);
});
test('resource packs and shaders use their own paths and environment without pretending to be loader mods', async () => {
  const versions = [version('shader1', 'shader', { loaders: ['iris'], files: [file('shader.zip')], environment: 'client_only' }), version('resource1', 'resource', { loaders: ['minecraft'], files: [file('resource.zip')] }), version('iris1', 'YL57xq9U', { environment: 'client_only' })];
  const projects = { iris: { id: 'YL57xq9U', slug: 'iris' }, shader: { project_type: 'shader', client_side: 'required', server_side: 'unsupported' }, resource: { project_type: 'resourcepack', client_side: 'required', server_side: 'unsupported' } };
  const { manifest } = await fixture({ versions, projects }).service().prepareExport({ ...setup, mods: [{ ...mod('shader'), kind: 'shader' }, { ...mod('resource'), kind: 'resourcepack' }, mod('YL57xq9U', 'iris1')] });
  assert.deepEqual(manifest.files.map(entry => entry.path).sort(), ['mods/iris1.jar', 'resourcepacks/resource.zip', 'shaderpacks/shader.zip']);
  assert.ok(manifest.files.every(entry => entry.env.server === 'unsupported'));
});
test('loader override is validated against authoritative metadata and automatic Forge/NeoForge selection is concrete', async () => {
  const versions = [version('a1', 'a')];
  await assert.rejects(() => fixture({ versions }).service().prepareExport({ ...setup, loaderVersion: '0.99.99', mods: [mod('a')] }), /loader|Loader/);
  const cases = [
    { loader: 'forge', key: 'forge', expected: '52.1.0', routes: { 'https://files.minecraftforge.net/net/minecraftforge/forge/maven-metadata.json': { '1.21.1': ['1.21.1-52.0.0', '1.21.1-52.1.0'] }, 'https://files.minecraftforge.net/net/minecraftforge/forge/promotions_slim.json': { promos: { '1.21.1-recommended': '52.1.0', '1.21.1-latest': '52.1.0' } } } },
    { loader: 'neoforge', key: 'neoforge', expected: '21.1.20', routes: { 'https://maven.neoforged.net/api/maven/versions/releases/net/neoforged/neoforge': { versions: ['21.0.9', '21.1.9', '21.1.20', '21.1.21-beta', '21.10.20'] } } },
  ];
  for (const entry of cases) {
    const { manifest } = await fixture({ versions: [version('a1', 'a', { loaders: [entry.loader] })], routes: entry.routes }).service().prepareExport({ ...setup, loader: entry.loader, mods: [mod('a')] });
    assert.equal(manifest.dependencies[entry.key], entry.expected);
  }
});
test('selection and dependency traversal have finite limits', async () => {
  await assert.rejects(() => fixture().service().prepareExport({ ...setup, mods: Array.from({ length: 501 }, (_, i) => mod(`a${i}`)) }), /limit|Limit|500/);
});
test('update preview excludes automatically derived dependencies to preserve parent pins', async () => {
  const entries = await fixture({ versions: [version('a1', 'a'), version('b1', 'b')] }).service().checkUpdates({ ...setup, mods: [mod('a'), { ...mod('b', 'b1'), dependency: true }] });
  assert.deepEqual(entries.map(entry => entry.key), ['modrinth:a']);
});
test('malformed candidate metadata never produces an applicable update', async () => {
  for (const patch of [{ version_number: '' }, { id: '' }, { files: [] }]) {
    const entries = await fixture({ versions: [version('a1', 'a'), version('new', 'a', { date_published: '2025-02-01Z', ...patch })] }).service().checkUpdates({ ...setup, mods: [mod('a', 'a1')] });
    assert.equal(entries[0].status, 'unavailable'); assert.equal(entries[0].candidate, null);
  }
});
test('empty loader override means automatic selection and server-only mods remain usable in singleplayer', async () => {
  const { manifest } = await fixture({ versions: [version('a1', 'a', { environment: 'server_only' })] }).service().prepareExport({ ...setup, loaderVersion: '', mods: [mod('a')] });
  assert.deepEqual(manifest.files[0].env, { client: 'optional', server: 'required' });
});
test('metadata lacking known environment cannot produce a purportedly valid pack', async () => {
  await assert.rejects(() => fixture({ versions: [version('a1', 'a')], projects: { a: { client_side: 'unknown', server_side: 'unknown' } } }).service().prepareExport({ ...setup, mods: [mod('a')] }), /environment/i);
});
test('required resource pack attachment is exported alongside a primary mod jar', async () => {
  const { manifest } = await fixture({ versions: [version('a1', 'a', { files: [file('a.jar'), { ...file('needed.zip'), primary: false, file_type: 'required-resource-pack' }] })] }).service().prepareExport({ ...setup, mods: [mod('a')] });
  assert.deepEqual(manifest.files.map(entry => entry.path), ['mods/a.jar', 'resourcepacks/needed.zip']);
});
test('Quilt loader metadata ordering cannot select an obsolete loader', async () => {
  const routes = { 'https://meta.quiltmc.org/v3/versions/loader/1.21.1': [{ loader: { version: '0.24.0' } }, { loader: { version: '0.29.3' } }, { loader: { version: '0.30.0-beta.1' } }] };
  const { manifest } = await fixture({ routes }).service().prepareExport({ ...setup, loader: 'quilt', mods: [] });
  assert.equal(manifest.dependencies['quilt-loader'], '0.29.3');
});
test('Iris shaders cannot be exported or offered as compatible updates on Forge or without their runtime', async () => {
  const versions = [version('shader1', 'shader', { loaders: ['iris'], files: [file('shader.zip')], environment: 'client_only' })];
  const projects = { shader: { project_type: 'shader', client_side: 'required', server_side: 'unsupported' } };
  const shader = { ...mod('shader'), kind: 'shader' };
  const routes = { 'https://files.minecraftforge.net/net/minecraftforge/forge/maven-metadata.json': { '1.21.1': ['1.21.1-52.1.0'] }, 'https://files.minecraftforge.net/net/minecraftforge/forge/promotions_slim.json': { promos: { '1.21.1-latest': '52.1.0' } } };
  for (const loader of ['forge', 'fabric', 'neoforge', 'quilt']) {
    const project = { ...setup, loader, mods: [shader] };
    await assert.rejects(() => fixture({ versions, projects, routes }).service().prepareExport(project), /shader|Iris|engine|runtime/i);
    const [entry] = await fixture({ versions, projects, routes }).service().checkUpdates(project);
    assert.equal(entry.status, 'unsupported'); assert.equal(entry.candidate, null);
    assert.match(entry.message, /Iris|engine|runtime/i);
  }
});
test('a mod called Iris is not runtime evidence and an incompatible exact Iris pin is rejected', async () => {
  const projects = { shader: { project_type: 'shader' }, iris: { id: 'YL57xq9U', slug: 'iris', project_type: 'mod' } };
  const shader = { ...mod('shader'), kind: 'shader' };
  const shaderVersion = version('shader1', 'shader', { loaders: ['iris'], files: [file('shader.zip')] });
  for (const [engine, engineVersion] of [[{ ...mod('impostor'), title: 'Iris' }, version('fake', 'impostor')], [mod('YL57xq9U', 'irisWrong'), version('irisWrong', 'YL57xq9U', { loaders: ['neoforge'] })]]) {
    const project = { ...setup, mods: [shader, engine] };
    await assert.rejects(() => fixture({ projects, versions: [shaderVersion, engineVersion] }).service().prepareExport(project), /Iris|engine|runtime/i);
    const [entry] = await fixture({ projects, versions: [shaderVersion, engineVersion] }).service().checkUpdates(project);
    assert.equal(entry.status, 'unsupported'); assert.equal(entry.candidate, null);
  }
});
test('Minecraft 1.21 NeoForge uses the verified 21.0 series including an explicit exact override', async () => {
  const routes = { 'https://maven.neoforged.net/api/maven/versions/releases/net/neoforged/neoforge': { versions: ['21.0.166', '21.0.167', '21.1.20'] } };
  for (const loaderVersion of [undefined, '21.0.166']) {
    const { manifest } = await fixture({ routes }).service().prepareExport({ ...setup, minecraftVersion: '1.21', loader: 'neoforge', loaderVersion, mods: [] });
    assert.equal(manifest.dependencies.neoforge, loaderVersion || '21.0.167');
  }
  await assert.rejects(() => fixture({ routes }).service().prepareExport({ ...setup, minecraftVersion: '1.21', loader: 'neoforge', loaderVersion: '21.1.20', mods: [] }), /verified|loader/i);
});
test('shader updates and exports retain a verified selected Iris runtime on Fabric and NeoForge', async () => {
  const projects = { shader: { project_type: 'shader' }, iris: { id: 'YL57xq9U', slug: 'iris' } };
  const routes = { 'https://maven.neoforged.net/api/maven/versions/releases/net/neoforged/neoforge': { versions: ['21.1.20'] } };
  for (const loader of ['fabric', 'neoforge']) {
    const versions = [version('shader1', 'shader', { loaders: ['iris'], files: [file('shader1.zip')] }), version('shader2', 'shader', { loaders: ['iris'], date_published: '2025-02-01Z', files: [file('shader2.zip')] }), version('iris1', 'YL57xq9U', { loaders: [loader] })];
    const project = { ...setup, loader, mods: [{ ...mod('shader', 'shader1'), kind: 'shader' }, { ...mod('YL57xq9U', 'iris1'), dependency: true }] };
    const [entry] = await fixture({ projects, versions, routes }).service().checkUpdates(project);
    assert.equal(entry.status, 'update'); assert.equal(entry.candidate.versionId, 'shader2');
    const { manifest } = await fixture({ projects, versions, routes }).service().prepareExport(project);
    assert.deepEqual(manifest.files.map(entry => entry.path).sort(), ['mods/iris1.jar', 'shaderpacks/shader1.zip']);
  }
});
test('unverified shader engines remain unsupported even when a different runtime is selected', async () => {
  const projects = { shader: { project_type: 'shader' }, iris: { id: 'YL57xq9U', slug: 'iris' } };
  for (const engine of ['canvas', 'optifine', 'vanilla']) {
    const versions = [version('shader1', 'shader', { loaders: [engine], files: [file('shader1.zip')] }), version('iris1', 'YL57xq9U')];
    const project = { ...setup, mods: [{ ...mod('shader'), kind: 'shader' }, { ...mod('YL57xq9U', 'iris1'), dependency: true }] };
    const [entry] = await fixture({ projects, versions }).service().checkUpdates(project);
    assert.equal(entry.status, 'unsupported'); assert.equal(entry.candidate, null);
    await assert.rejects(() => fixture({ projects, versions }).service().prepareExport(project), /Iris|engine/i);
  }
});
