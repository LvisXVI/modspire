const assert = require('node:assert/strict');
const { createSetupDiscovery } = require('../setup-discovery.cjs');
const releases = ['26.3', '26.2', '1.20.6', '1.20.5', '1.20.4', '1.20.3', '1.20.2', '1.20.1', '1.20', '1.12.2'];
let active = 0, maxActive = 0;
const discovery = createSetupDiscovery(async input => {
  active++; maxActive = Math.max(active, maxActive);
  try {
    await new Promise(resolve => setTimeout(resolve, 2));
    const url = new URL(input);
    if (url.hostname.includes('mojang')) return { versions: [...releases.map(id => ({ id, type: 'release' })), { id: '26.4-snapshot-3', type: 'snapshot' }] };
    if (url.pathname.includes('/project/')) return [{ game_versions: ['1.20.1'], loaders: ['forge'] }];
    const facets = JSON.parse(url.searchParams.get('facets'));
    const version = facets.flat().find(value => value.startsWith('versions:'))?.slice(9);
    const loader = facets.flat().find(value => value.startsWith('categories:'))?.slice(11);
    const query = url.searchParams.get('query');
    if (!version) return { hits: [{ project_id: query, versions: ['26.3', '26.2', '1.20.1'], categories: ['fabric', 'forge'] }] };
    const total = version === '26.3' ? (query === 'magic' ? 0 : 1000) : version === '26.2' ? (loader === 'fabric' ? 30 : 2) : 10;
    return { total_hits: total, hits: total ? [{ project_id: `${query}-${version}-${loader}` }] : [] };
  } finally { active--; }
});
(async () => {
  const catalog = await discovery.catalog();
  assert.equal(catalog.source, 'mojang');
  for (const version of releases.slice(0, 9)) assert.ok(catalog.versions.includes(version));
  assert.ok(!catalog.versions.includes('26.4-snapshot-3'));
  const best = await discovery.choose({ queries: ['dungeons', 'magic'] });
  assert.equal(best.minecraftVersion, '26.2', 'full theme coverage beats many hits for only one theme');
  assert.equal(best.loader, 'fabric');
  assert.equal(best.coverage, 2);
  assert.equal(best.verified, true);
  const retained = await discovery.choose({ queries: ['dungeons', 'magic'], mods: [{ provider: 'modrinth', id: 'required' }] });
  assert.equal(retained.minecraftVersion, '1.20.1', 'retain compatibility with selected mods');
  assert.equal(retained.loader, 'forge');
  const blocked = await discovery.choose({ queries: ['magic'], mods: [{ provider: 'curseforge', id: 'required' }] });
  assert.equal(blocked.unchanged, true);
  const offline = await createSetupDiscovery(async () => { throw new Error('offline'); }).catalog();
  assert.equal(offline.source, 'offline');
  assert.ok(offline.versions.includes('26.3'));
  assert.ok(maxActive <= 6, 'bound outgoing request concurrency');
  console.log('Version discovery: live release catalog, theme coverage, exact loader filters, existing mods, offline fallback, and concurrency passed.');
})().catch(error => { console.error(error); process.exitCode = 1; });
