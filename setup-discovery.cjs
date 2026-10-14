const LOADERS = ['fabric', 'neoforge', 'forge', 'quilt'];
const FALLBACK = ['26.3','26.2','26.1.2','26.1.1','26.1','1.21.11','1.21.10','1.21.9','1.21.8','1.21.7','1.21.6','1.21.5','1.21.4','1.21.3','1.21.2','1.21.1','1.21','1.20.6','1.20.5','1.20.4','1.20.3','1.20.2','1.20.1','1.20','1.19.2','1.18.2','1.16.5','1.12.2'];

async function mapLimit(items, count, callback) {
  const results = new Array(items.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(count, items.length) }, async () => {
    while (next < items.length) { const index = next++; results[index] = await callback(items[index]); }
  }));
  return results;
}
function createSetupDiscovery(fetchJSON) {
  let cachedCatalog;
  async function catalog() {
    if (cachedCatalog && Date.now() - cachedCatalog.time < 6 * 3600000) return cachedCatalog.value;
    try {
      const manifest = await fetchJSON('https://piston-meta.mojang.com/mc/game/version_manifest_v2.json');
      const releases = manifest.versions.filter(entry => entry.type === 'release').map(entry => entry.id);
      const versions = releases.filter(id => /^(?:2\d\.|1\.(?:2\d|[3-9]\d))/.test(id));
      for (const id of ['1.19.2', '1.18.2', '1.16.5', '1.12.2']) if (releases.includes(id) && !versions.includes(id)) versions.push(id);
      cachedCatalog = { time: Date.now(), value: { versions, releases, source: 'mojang' } };
    } catch { return { versions: FALLBACK, releases: FALLBACK, source: 'offline' }; }
    return cachedCatalog.value;
  }
  async function search(query, version, loader) {
    const url = new URL('https://api.modrinth.com/v2/search');
    url.searchParams.set('query', query);
    url.searchParams.set('limit', '50');
    const facets = [['project_type:mod']];
    if (version) facets.push([`versions:${version}`]);
    if (loader) facets.push([`categories:${loader}`]);
    url.searchParams.set('facets', JSON.stringify(facets));
    const result = await fetchJSON(url.href);
    return { ...result, total: Number(result.total_hits ?? result.total) || result.hits?.length || 0 };
  }
  async function choose(input) {
    const options = input && !Array.isArray(input) && typeof input === 'object' ? input : { queries: input };
    const queries = [...new Set((Array.isArray(options.queries) ? options.queries : [options.queries]).map(value => String(value || '').trim().slice(0, 120)).filter(Boolean))].slice(0, 4);
    if (!queries.length) return null;
    const game = await catalog();
    const released = new Set(game.releases);
    const broad = await mapLimit(queries, 4, query => search(query));
    const matrix = new Map();
    for (const [index, batch] of broad.entries()) for (const hit of batch.hits || []) {
      for (const version of hit.versions || []) {
        if (!released.has(version)) continue;
        for (const loader of LOADERS.filter(value => [...(hit.categories || []), ...(hit.display_categories || [])].includes(value))) {
          const key = `${version}:${loader}`;
          if (!matrix.has(key)) matrix.set(key, { minecraftVersion: version, loader, themes: new Set(), projects: new Set() });
          const entry = matrix.get(key); entry.themes.add(index); entry.projects.add(hit.project_id);
        }
      }
    }
    const shortlisted = [...matrix.values()].sort((a, b) => b.themes.size - a.themes.size || b.projects.size - a.projects.size || game.releases.indexOf(a.minecraftVersion) - game.releases.indexOf(b.minecraftVersion)).slice(0, 12);
    if (!shortlisted.length) return null;
    // The global search is only a shortlist: exact filtered requests below are
    // necessary because loader support can differ between versions of a mod.
    const verified = await mapLimit(shortlisted, 3, async candidate => {
      try {
        const batches = await mapLimit(queries, 2, query => search(query, candidate.minecraftVersion, candidate.loader));
        const mods = [...new Map(batches.flatMap(batch => batch.hits || []).map(hit => [hit.project_id, hit])).values()];
        return { minecraftVersion: candidate.minecraftVersion, loader: candidate.loader, coverage: batches.filter(batch => batch.total > 0).length, total: batches.reduce((sum, batch) => sum + (Number(batch.total) || 0), 0), count: mods.length };
      } catch { return null; }
    });
    const existing = Array.isArray(options.mods) ? options.mods : [];
    // Never silently move an existing pack to an unverified game/loader pair.
    // CurseForge entries cannot be verified through Modrinth IDs.
    if (existing.some(mod => mod.provider !== 'modrinth')) return { unchanged: true, reason: 'Automatische Versionsänderung pausiert: Die vorhandenen CurseForge-Mods müssen zuerst geprüft werden.' };
    const modVersions = await mapLimit(existing, 3, mod => fetchJSON(`https://api.modrinth.com/v2/project/${encodeURIComponent(mod.id)}/version`));
    const candidates = verified.filter(Boolean).filter(candidate => candidate.count > 0 && modVersions.every(versions => versions.some(version => version.game_versions?.includes(candidate.minecraftVersion) && version.loaders?.includes(candidate.loader))));
    candidates.sort((a, b) => b.coverage - a.coverage || b.total - a.total || b.count - a.count || game.releases.indexOf(a.minecraftVersion) - game.releases.indexOf(b.minecraftVersion));
    if (!candidates.length) return { unchanged: true, reason: 'Keine bessere Kombination gefunden, die alle ausgewählten Mods unterstützt.' };
    return { ...candidates[0], queryCount: queries.length, alternatives: candidates.slice(1, 4), source: 'Modrinth', verified: true };
  }
  return { catalog, choose };
}
module.exports = { createSetupDiscovery, FALLBACK, mapLimit };
