const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '../main.cjs'), 'utf8');
const start = source.indexOf('async function resolveModrinthRequiredDependencies(');
const end = source.indexOf("handleWorkshop('mods:required-dependencies'", start);
const version = (project, id, dependencies = [], extra = {}) => ({ project_id: project, id, version_number: id, game_versions: ['1.21.1'], loaders: ['fabric'], version_type: 'release', dependencies, ...extra });
const required = (project_id, version_id) => ({ project_id, version_id, dependency_type: 'required' });
const root = (id, versionId) => ({ provider: 'modrinth', id, title: `Title ${id}`, versionId });
function resolver(versions, projects = {}, cf = null) {
  const calls = [];
  const fetchModrinthJson = async address => {
    const url = new URL(address); calls.push(url.pathname);
    const parts = url.pathname.split('/').filter(Boolean).slice(1);
    let result;
    if (parts[0] === 'version') result = Object.values(versions).flat().find(item => item.id === parts[1]);
    else if (parts[2] === 'version') result = versions[parts[1]];
    else result = { id: parts[1], title: `Title ${parts[1]}`, slug: parts[1], project_type: 'mod', client_side: 'required', server_side: 'optional', ...projects[parts[1]] };
    if (!result || result instanceof Error) throw result || new Error('missing fixture');
    return structuredClone(result);
  };
  const context = { URLSearchParams, fetchModrinthJson, secret: async () => cf ? 'fixture-key' : '', loaderId: () => 4, AbortSignal, fetch: async address => { const endpoint = new URL(address).pathname.replace('/v1', ''); calls.push(endpoint); return { ok: Boolean(cf[endpoint]), status: cf[endpoint] ? 200 : 404, json: async () => ({ data: cf[endpoint] }) }; } };
  const resolve = vm.runInNewContext(`${source.slice(start, end)}; resolveModrinthRequiredDependencies`, context);
  return { calls, resolve: async input => JSON.parse(JSON.stringify(await resolve(input))) };
}
async function main() {
  {
    const { resolve, calls } = resolver({ A: [version('A', 'A-new'), version('A', 'A-old', [required('B', 'B-old')])], B: [version('B', 'B-new'), version('B', 'B-old', [required('C')])], C: [version('C', 'C-1')] });
    const result = await resolve({ mods: [root('A', 'A-old')] });
    assert.deepEqual(result.dependencies.map(mod => [mod.id, mod.versionId]), [['B', 'B-old'], ['C', 'C-1']], 'root pin and required pin must determine the transitive closure');
    assert.ok(calls.includes('/v2/version/A-old'), 'root pins must be fetched directly');
    assert.deepEqual(result.dependencies[0].requiredBy, [{ provider: 'modrinth', id: 'A', title: 'Title A' }]);
    assert.deepEqual(result.dependencies[1].requiredBy, [{ provider: 'modrinth', id: 'B', title: 'Title B' }]);
    assert.equal(result.dependencies[0].clientSide, 'required');
    assert.equal(result.dependencies[0].serverSide, 'optional');
  }
  {
    const { resolve } = resolver({ A: [version('A', 'a', [required('B'), required('D')])], B: [version('B', 'b', [required('C')])], D: [version('D', 'd', [required('C')])], C: [version('C', 'c')] });
    const result = await resolve({ mods: [root('A')] });
    assert.deepEqual(result.dependencies.find(mod => mod.id === 'C').requiredBy.map(mod => mod.id).sort(), ['B', 'D'], 'shared dependencies explain every direct parent');
  }
  {
    const { resolve } = resolver({ A: [version('A', 'a', [required('C'), required('B')])], B: [version('B', 'b', [required('C', 'old')])], C: [version('C', 'new', [required('obsolete')]), version('C', 'old', [required(undefined, 'right')])], obsolete: [version('obsolete', 'obsolete')], final: [version('final', 'right')] });
    const result = await resolve({ mods: [root('A')] });
    assert.equal(result.dependencies.find(mod => mod.id === 'C').versionId, 'old', 'late pins replace an initially unpinned version');
    assert.ok(!result.dependencies.some(mod => mod.id === 'obsolete'), 'requirements of a discarded version must not leak into the closure');
    assert.ok(result.dependencies.some(mod => mod.id === 'final' && mod.versionId === 'right'), 'version-only requirements resolve their project IDs');
    assert.deepEqual(result.unresolved, []);
  }
  {
    const { resolve } = resolver({ A: [version('A', 'latest'), version('A', 'old', [], { loaders: ['forge'] })] });
    const result = await resolve({ mods: [root('A', 'old')] });
    assert.ok(result.unresolved.some(text => text.includes('A')), 'an incompatible root pin cannot fall back to latest');
  }
  for (const badPin of ['missing', 'incompatible']) {
    const versions = { A: [version('A', 'a', [required('B', 'bad')])], B: [version('B', 'good')] };
    if (badPin === 'incompatible') versions.B.push(version('B', 'bad', [], { game_versions: ['1.20.1'] }));
    const result = await resolver(versions).resolve({ mods: [root('A')] });
    assert.equal(result.dependencies.length, 0, `${badPin} required pin must never fall back to a different version`);
    assert.ok(result.unresolved.length, 'unavailable or incompatible pins must be reported');
  }
  {
    const { resolve } = resolver({ A: [version('A', 'a', [required('C', 'c1')])], B: [version('B', 'b', [required('C', 'c2')])], C: [version('C', 'c1'), version('C', 'c2')] });
    const result = await resolve({ mods: [root('A'), root('B')] });
    assert.ok(result.unresolved.some(text => text.includes('C')), 'conflicting shared pins must be reported');
    assert.ok(!result.dependencies.some(mod => mod.id === 'C'), 'conflicting pins cannot produce a claimed-compatible version');
  }
  {
    const { resolve } = resolver({ A: [version('A', 'a', [required('B', 'other')])], B: [version('B', 'selected'), version('B', 'other')] });
    const result = await resolve({ mods: [root('A'), root('B', 'selected')] });
    assert.ok(result.unresolved.some(text => text.includes('B')), 'an existing root pin must not hide a required-version conflict');
  }
  {
    const result = await resolver({ A: new Error('offline') }).resolve({ mods: [root('A')] });
    assert.ok(result.unresolved.some(text => text.includes('A')), 'failed root lookup must be visible');
  }
  {
    const { resolve } = resolver({ A: [version('A', 'a', [required('B', 'wrong-project')])], B: [version('elsewhere', 'wrong-project')] });
    const result = await resolve({ mods: [root('A')] });
    assert.equal(result.dependencies.length, 0, 'a pin belonging to a different project cannot be accepted');
    assert.ok(result.unresolved.length);
  }
  {
    const versions = {};
    for (let index = 0; index < 8; index++) versions[`M${index}`] = [version(`M${index}`, `v${index}`, index < 7 ? [required(`M${index + 1}`)] : [])];
    const result = await resolver(versions).resolve({ mods: [root('M0')] });
    assert.ok(result.unresolved.length || result.dependencies.length === 7, 'closure limits must be explicit');
  }
  {
    const cf = { '/mods/1/files': [{ id: 10, releaseType: 1, dependencies: [{ relationType: 3, modId: 3 }] }], '/mods/2/files': [{ id: 20, releaseType: 1, dependencies: [{ relationType: 3, modId: 3 }] }], '/mods/3': { name: 'Shared CF', clientSide: 'required', serverSide: 'unsupported' }, '/mods/3/files': [{ id: 30, releaseType: 1, dependencies: [] }] };
    const result = await resolver({}, {}, cf).resolve({ mods: [{ id: '1', provider: 'curseforge', title: 'CF one' }, { id: '2', provider: 'curseforge', title: 'CF two' }] });
    assert.deepEqual(result.dependencies[0].requiredBy.map(mod => mod.id).sort(), ['1', '2']);
    assert.equal(result.dependencies[0].clientSide, 'required');
    assert.equal(result.dependencies[0].serverSide, 'unsupported');
  }
  {
    const cf = {
      '/mods/1/files': [{ id: 11, dependencies: [{ relationType: 3, modId: 3 }] }],
      '/mods/1/files/10': { id: 10, modId: 1, gameVersions: ['1.21.1', 'Fabric'], dependencies: [{ relationType: 3, modId: 2, fileId: 20 }] },
      '/mods/2': { name: 'Pinned CF' }, '/mods/2/files': [{ id: 21, dependencies: [{ relationType: 3, modId: 4 }] }],
      '/mods/2/files/20': { id: 20, modId: 2, gameVersions: ['1.21.1', 'Fabric'], dependencies: [{ relationType: 3, modId: 5 }] },
      '/mods/3': { name: 'Wrong root dependency' }, '/mods/3/files': [{ id: 30 }],
      '/mods/4': { name: 'Wrong file dependency' }, '/mods/4/files': [{ id: 40 }],
      '/mods/5': { name: 'Transitive CF' }, '/mods/5/files': [{ id: 50, gameVersions: ['1.21.1', 'Fabric'] }],
    };
    const { resolve, calls } = resolver({}, {}, cf);
    const result = await resolve({ mods: [{ id: '1', provider: 'curseforge', title: 'CF root', versionId: '10' }] });
    assert.deepEqual(result.dependencies.map(mod => [mod.id, mod.versionId]), [['2', '20'], ['5', '50']], 'CurseForge exact root and required-file pins determine the transitive closure');
    assert.ok(calls.includes('/mods/1/files/10') && calls.includes('/mods/2/files/20'));
    assert.deepEqual(result.unresolved, []);
  }
  for (const mismatch of ['game', 'loader', 'project', 'file', 'missing']) {
    const pinned = { id: 10, modId: 1, gameVersions: ['1.21.1', 'Fabric'], dependencies: [] };
    if (mismatch === 'game') pinned.gameVersions = ['1.20.1', 'Fabric'];
    if (mismatch === 'loader') pinned.gameVersions = ['1.21.1', 'Forge'];
    if (mismatch === 'project') pinned.modId = 99;
    if (mismatch === 'file') pinned.id = 11;
    const cf = { '/mods/1/files': [{ id: 11, dependencies: [] }], ...(mismatch !== 'missing' ? { '/mods/1/files/10': pinned } : {}) };
    const result = await resolver({}, {}, cf).resolve({ mods: [{ id: '1', provider: 'curseforge', versionId: '10' }] });
    assert.ok(result.unresolved.some(text => text.includes('1')), `CurseForge ${mismatch} pin failure must be reported without fallback`);
  }
  {
    const cf = {
      '/mods/1/files': [{ id: 10, dependencies: [{ relationType: 3, modId: 3, fileId: 30 }] }],
      '/mods/2/files': [{ id: 20, dependencies: [{ relationType: 3, modId: 3, fileId: 31 }] }],
      '/mods/3': { name: 'Conflicting CF' }, '/mods/3/files': [{ id: 30 }],
      '/mods/3/files/30': { id: 30 }, '/mods/3/files/31': { id: 31 },
    };
    const result = await resolver({}, {}, cf).resolve({ mods: [{ id: '1', provider: 'curseforge' }, { id: '2', provider: 'curseforge' }] });
    assert.ok(result.unresolved.some(text => text.includes('3')), 'conflicting CurseForge required-file pins must be reported');
    assert.ok(!result.dependencies.some(mod => mod.id === '3'), 'conflicting files cannot be claimed compatible');
  }
  {
    const cf = {
      '/mods/1/files': [{ id: 10, dependencies: [{ relationType: 3, modId: 2, fileId: 21 }] }],
      '/mods/2/files/20': { id: 20, gameVersions: ['1.21.1', 'Fabric'] },
      '/mods/2/files/21': { id: 21, gameVersions: ['1.21.1', 'Fabric'] },
    };
    const result = await resolver({}, {}, cf).resolve({ mods: [{ id: '1', provider: 'curseforge' }, { id: '2', provider: 'curseforge', versionId: '20' }] });
    assert.ok(result.unresolved.some(text => text.includes('2')), 'existing CurseForge root pins participate in shared-file conflicts');
  }
  for (const mismatch of ['game', 'loader', 'missing']) {
    const cf = {
      '/mods/1/files': [{ id: 10, dependencies: [{ relationType: 3, modId: 2, fileId: 20 }] }],
      '/mods/2': { name: 'Unavailable pinned requirement' }, '/mods/2/files': [{ id: 21, gameVersions: ['1.21.1', 'Fabric'] }],
      ...(mismatch !== 'missing' ? { '/mods/2/files/20': { id: 20, gameVersions: mismatch === 'game' ? ['1.20.1', 'Fabric'] : ['1.21.1', 'Forge'] } } : {}),
    };
    const result = await resolver({}, {}, cf).resolve({ mods: [{ id: '1', provider: 'curseforge' }] });
    assert.ok(result.unresolved.some(text => text.includes('2')) && !result.dependencies.some(mod => mod.id === '2'), `CurseForge ${mismatch} required-file pin cannot fall back to another file`);
  }
  for (const metadata of ['missing', 'game-only', 'loader-only']) {
    const partial = metadata === 'game-only' ? { gameVersions: ['1.21.1'] } : metadata === 'loader-only' ? { loaders: ['fabric'] } : {};
    const cf = {
      '/mods/1/files/10': { id: 10, modId: 1, ...partial, dependencies: [{ relationType: 3, modId: 2 }] },
      '/mods/1/files': [{ id: 11, gameVersions: ['1.21.1', 'Fabric'] }],
      '/mods/2': { name: 'Unverified root dependency' }, '/mods/2/files': [{ id: 20, gameVersions: ['1.21.1', 'Fabric'] }],
    };
    const result = await resolver({}, {}, cf).resolve({ mods: [{ id: '1', provider: 'curseforge', versionId: '10' }] });
    assert.ok(result.unresolved.some(text => text.includes('1')), `CurseForge ${metadata} direct pin metadata cannot prove compatibility`);
    assert.equal(result.dependencies.length, 0, 'unverified pinned roots cannot introduce claimed-compatible dependencies');
  }
  {
    const cf = {
      '/mods/1/files/10': { id: 10, modId: 1, dependencies: [{ relationType: 3, modId: 2, fileId: 20 }] },
      '/mods/1/files': [{ id: 10 }],
      '/mods/2': { name: 'Unverified required file' }, '/mods/2/files/20': { id: 20, modId: 2 },
      '/mods/2/files': [{ id: 21 }],
    };
    const result = await resolver({}, {}, cf).resolve({ mods: [{ id: '1', provider: 'curseforge', versionId: '10' }] });
    assert.ok(result.unresolved.some(text => text.includes('2')), 'required file pins also need game and loader evidence or filtered-list confirmation');
    assert.equal(result.dependencies.length, 0);
    cf['/mods/2/files'] = [{ id: 20 }];
    const confirmed = await resolver({}, {}, cf).resolve({ mods: [{ id: '1', provider: 'curseforge', versionId: '10' }] });
    assert.deepEqual(confirmed.dependencies.map(mod => [mod.id, mod.versionId]), [['2', '20']], 'an exact pin present in the game/loader-filtered listing supplies compatibility evidence');
    assert.deepEqual(confirmed.unresolved, []);
  }
  const { mapModrinthSearchHit } = require('../catalog-search.cjs');
  const mapped = mapModrinthSearchHit({ project_id: 'client', client_side: 'required', server_side: 'unsupported' });
  assert.equal(mapped.clientSide, 'required'); assert.equal(mapped.serverSide, 'unsupported');
  const { describe } = require('../pack-dependencies.js');
  const dependency = { clientSide: 'required', serverSide: 'optional', requiredBy: [{ id: 'A', provider: 'modrinth', title: 'Old title' }, { id: 'B', provider: 'modrinth', title: '<img onerror=bad>' }] };
  const english = describe(dependency, [root('A')], 'en');
  assert.ok(english.includes('Title A') && english.includes('<img onerror=bad>') && english.includes('Required by') && english.includes('Client and server'));
  assert.ok(describe(dependency, [], 'de').includes('Benötigt von') && describe(dependency, [], 'de').includes('Client und Server'));
  assert.ok(describe({ title: 'Dedicated server mod' }, [], 'en').includes('Unknown'), 'titles must not be used to guess environment');
  assert.ok(describe({ clientSide: 'required', serverSide: 'unsupported' }, [], 'en').includes('Client only'));
  assert.ok(describe({ client_side: 'unsupported', server_side: 'optional' }, [], 'de').includes('Nur Server'));
  assert.ok(describe({ clientSide: 'required' }, [], 'en').includes('Unknown'), 'partial metadata cannot imply server support');
  assert.ok(describe({ environment: 'client_only' }, [], 'en').includes('Client only'));
  const browser = {}; vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../pack-dependencies.js'), 'utf8'), browser);
  assert.equal(browser.WorkshopPackDependencies.describe({ clientSide: 'unsupported', serverSide: 'required' }, [], 'en'), 'Environment: Server only');
  console.log('Dependency closure: exact pins, shared/transitive parents, metadata, conflicts/failures/limits, CurseForge and localized plain descriptions passed.');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
