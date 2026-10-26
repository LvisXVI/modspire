const assert = require('node:assert/strict');
const { test } = require('node:test');
const zlib = require('node:zlib');
let createCurseForgeExportService;
try { ({ createCurseForgeExportService } = require('../pack-curseforge.cjs')); } catch (e) { if (e.code !== 'MODULE_NOT_FOUND') throw e; }
const setup = { name: 'Test pack', version: '1.2.3', minecraftVersion: '1.21.1', loader: 'fabric' };
const mod = (id, versionId) => ({ provider: 'curseforge', kind: 'mod', id: String(id), ...(versionId === undefined ? {} : { versionId: String(versionId) }) });
const file = (id, modId, extra = {}) => ({ id, modId, gameId: 432, releaseType: 1, fileStatus: 4, isAvailable: true, fileDate: '2026-01-01T00:00:00Z', gameVersions: ['1.21.1', 'Fabric'], dependencies: [], ...extra });
function fixture({ files = [file(11, 1)], projects = {}, route, loader = { minecraft: '1.21.1', 'fabric-loader': '0.16.10' } } = {}) {
  const calls = [];
  const fetchJson = async raw => {
    const url = new URL(raw); calls.push(raw);
    assert.equal(url.origin, 'https://api.curseforge.com');
    assert.match(url.pathname, /^\/v1\//);
    if (route) { const result = await route(url); if (result !== undefined) return structuredClone(result); }
    const path = url.pathname.split('/'); const id = Number(path[3]);
    if (path.length === 4) return { data: { id, gameId: 432, classId: 6, isAvailable: true, allowModDistribution: true, ...projects[id] } };
    if (path[4] === 'files' && path[5]) return { data: structuredClone(files.find(f => f.modId === id && f.id === Number(path[5]))) };
    const values = files.filter(f => f.modId === id);
    return { data: structuredClone(values), pagination: { index: 0, resultCount: values.length, pageSize: 50, totalCount: values.length } };
  };
  return { calls, service: () => { assert.equal(typeof createCurseForgeExportService, 'function', 'CurseForge export service must exist'); return createCurseForgeExportService({ fetchJson, resolveLoader: async () => loader }); } };
}
// Independently parse the central directory and verify local headers/CRC, rather than using exporter internals.
function unzip(buffer) {
  const end = buffer.length - 22; assert.equal(buffer.readUInt32LE(end), 0x06054b50);
  const entries = new Map(); let cursor = buffer.readUInt32LE(end + 16);
  for (let i = 0; i < buffer.readUInt16LE(end + 10); i++) {
    assert.equal(buffer.readUInt32LE(cursor), 0x02014b50);
    const method = buffer.readUInt16LE(cursor + 10), size = buffer.readUInt32LE(cursor + 20), n = buffer.readUInt16LE(cursor + 28);
    const name = buffer.subarray(cursor + 46, cursor + 46 + n).toString(); const local = buffer.readUInt32LE(cursor + 42);
    assert.equal(buffer.readUInt32LE(local), 0x04034b50);
    const start = local + 30 + buffer.readUInt16LE(local + 26) + buffer.readUInt16LE(local + 28);
    const bytes = buffer.subarray(start, start + size); const decoded = method === 8 ? zlib.inflateRawSync(bytes) : bytes;
    assert.equal(decoded.length, buffer.readUInt32LE(cursor + 24));
    let crc = 0xffffffff;
    for (const byte of decoded) { crc ^= byte; for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0); }
    assert.equal((crc ^ 0xffffffff) >>> 0, buffer.readUInt32LE(cursor + 16));
    entries.set(name, decoded); cursor += 46 + n + buffer.readUInt16LE(cursor + 30) + buffer.readUInt16LE(cursor + 32);
  }
  return entries;
}
test('exports standard manifest ZIP containing no mod binaries and preserves exact pins', async () => {
  const f = fixture({ files: [file(11, 1), file(12, 1, { fileDate: '2026-02-01Z' })] });
  const project = { ...setup, mods: [mod(1, 11)] }; const before = structuredClone(project);
  const result = await f.service().prepareExport(project); const archive = unzip(result.buffer);
  assert.deepEqual([...archive.keys()], ['manifest.json', 'overrides/']);
  assert.deepEqual(JSON.parse(archive.get('manifest.json')), result.manifest);
  assert.deepEqual(result.manifest, { minecraft: { version: '1.21.1', modLoaders: [{ id: 'fabric-0.16.10', primary: true }] }, manifestType: 'minecraftModpack', manifestVersion: 1, name: 'Test pack', version: '1.2.3', author: 'LvisXVI', files: [{ projectID: 1, fileID: 11, required: true }], overrides: 'overrides' });
  assert.deepEqual(project, before); assert.equal(f.calls.some(u => u.endsWith('/files')), false);
});
test('unpinned chooses newest stable compatible approved release and paginates', async () => {
  const f = fixture({ route: u => u.pathname.endsWith('/files') ? { data: Number(u.searchParams.get('index')) === 0 ? [file(11, 1)] : [file(12, 1, { fileDate: '2026-02-01Z' }), file(13, 1, { releaseType: 2, fileDate: '2026-03-01Z' }), file(14, 1, { gameVersions: ['1.21.1'] })], pagination: { index: Number(u.searchParams.get('index')), resultCount: Number(u.searchParams.get('index')) === 0 ? 1 : 3, totalCount: 4 } } : undefined });
  assert.equal((await f.service().prepareExport({ ...setup, mods: [mod(1)] })).manifest.files[0].fileID, 12);
  assert.equal(f.calls.filter(u => new URL(u).pathname.endsWith('/files')).length, 2);
});
test('required transitive/shared/cyclic dependencies resolve once, respect a root pin, ignore optional edges', async () => {
  const files = [file(11, 1, { dependencies: [{ modId: 2, relationType: 3 }, { modId: 3, relationType: 3 }, { modId: 99, relationType: 2 }] }), file(21, 2, { dependencies: [{ modId: 3, relationType: 3 }] }), file(31, 3, { dependencies: [{ modId: 1, relationType: 3 }] }), file(32, 3, { fileDate: '2026-03-01Z' })];
  const f = fixture({ files }); const manifest = (await f.service().prepareExport({ ...setup, mods: [mod(1), mod(3, 31)] })).manifest;
  assert.deepEqual(manifest.files, [{ projectID: 1, fileID: 11, required: true }, { projectID: 2, fileID: 21, required: true }, { projectID: 3, fileID: 31, required: true }]);
  assert.equal(f.calls.filter(u => new URL(u).pathname === '/v1/mods/3').length, 1);
  assert.equal(f.calls.some(u => u.includes('/99')), false);
});
test('rejects conflicting root pins and incompatible dependency relations', async () => {
  await assert.rejects(fixture().service().prepareExport({ ...setup, mods: [mod(1, 11), mod(1, 12)] }), /conflict/i);
  const f = fixture({ files: [file(11, 1, { dependencies: [{ modId: 2, relationType: 5 }] }), file(21, 2)] });
  await assert.rejects(f.service().prepareExport({ ...setup, mods: [mod(1), mod(2)] }), /incompatible|conflict/i);
});
test('rejects absent/wrong-project pins and missing Minecraft or loader compatibility evidence', async () => {
  for (const extra of [{ modId: 2 }, { gameId: 1 }, { gameVersions: ['Fabric'] }, { gameVersions: ['1.21.1'] }, { gameVersions: undefined }, { id: 12 }]) {
    const f = fixture({ route: u => u.pathname.endsWith('/files/11') ? { data: file(11, 1, extra) } : undefined });
    await assert.rejects(f.service().prepareExport({ ...setup, mods: [mod(1, 11)] }), /exact|compatib|Minecraft|project|file/i);
  }
});
test('rejects unavailable, unapproved, blocked distribution files/projects and wrong metadata kind', async () => {
  for (const extra of [{ isAvailable: false }, { fileStatus: 7 }, { fileStatus: 3 }, { dependencies: null }]) {
    await assert.rejects(fixture({ files: [file(11, 1, extra)] }).service().prepareExport({ ...setup, mods: [mod(1, 11)] }), /available|approved|dependenc/i);
  }
  for (const extra of [{ allowModDistribution: false }, { isAvailable: false }, { gameId: 1 }, { classId: 12 }, { id: 2 }]) {
    await assert.rejects(fixture({ projects: { 1: extra } }).service().prepareExport({ ...setup, mods: [mod(1)] }), /distribut|available|Minecraft|kind|project/i);
  }
});
test('rejects empty/mixed/unknown-provider/unsupported-kind selection and invalid numeric IDs', async () => {
  for (const mods of [[], [{ ...mod(1), provider: 'modrinth' }], [mod(1), { ...mod(2), provider: 'other' }], [{ ...mod(1), kind: 'shader' }], [{ ...mod(1), kind: undefined }], [mod('1x')], [mod('9007199254740992')], [mod('01')], [{ ...mod(1), id: 1 }], [mod(1, '')]]) {
    await assert.rejects(fixture().service().prepareExport({ ...setup, mods }), /CurseForge|provider|kind|type|empty|select|ID/i);
  }
});
test('requires supported and verified exact loader, and actionable authentication errors', async () => {
  for (const [loader, resolved] of [['quilt', { minecraft: '1.21.1', 'quilt-loader': '0.28.0' }], ['fabric', { minecraft: '1.20', 'fabric-loader': '0.16.10' }], ['fabric', { minecraft: '1.21.1' }]]) {
    await assert.rejects(fixture({ loader: resolved }).service().prepareExport({ ...setup, loader, mods: [mod(1)] }), /loader|Minecraft|supported/i);
  }
  await assert.rejects(fixture({ route: () => { const e = new Error('Unauthorized'); e.status = 401; throw e; } }).service().prepareExport({ ...setup, mods: [mod(1)] }), /API key|authentication/i);
});
test('bounded metadata pagination fails closed instead of silently truncating release choices', async () => {
  const f = fixture({ route: u => u.pathname.endsWith('/files') ? { data: [file(11, 1)], pagination: { index: Number(u.searchParams.get('index')), resultCount: 1, totalCount: 999999 } } : undefined });
  await assert.rejects(f.service().prepareExport({ ...setup, mods: [mod(1)] }), /limit|many|narrow/i);
});
