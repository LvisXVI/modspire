const sorts = new Set(['relevance', 'downloads', 'follows', 'newest', 'updated']);
const environments = new Set(['client_and_server', 'client_only', 'client_only_server_optional', 'singleplayer_only', 'server_only', 'server_only_client_optional', 'dedicated_server_only', 'client_or_server', 'client_or_server_prefers_both', 'unknown']);
const categories = new Set(['adventure', 'cursed', 'decoration', 'economy', 'equipment', 'food', 'game-mechanics', 'library', 'magic', 'management', 'minigame', 'mobs', 'optimization', 'social', 'storage', 'technology', 'transportation', 'utility', 'worldgen']);

function buildModrinthSearch(input = {}) {
  const kind = ['mod', 'visual', 'shader', 'resourcepack'].includes(input.kind) ? input.kind : 'mod';
  const type = ['shader', 'resourcepack'].includes(kind) ? kind : 'mod';
  const version = String(input.minecraftVersion || '1.21.1');
  const loader = String(input.loader || 'fabric').toLowerCase();
  const facets = [[`project_type:${type}`], [`versions:${version}`]];
  if (type === 'mod') facets.push([`categories:${loader}`]);
  if (categories.has(input.category)) facets.push([`categories:${input.category}`]);
  if (type === 'mod' && Array.isArray(input.categories)) {
    const selected = [...new Set(input.categories.filter(category => categories.has(category)))];
    if (selected.length) facets.push(selected.map(category => `categories:${category}`));
  }
  if (environments.has(input.environment)) facets.push([`environment:${input.environment}`]);
  if (input.openSource === true) facets.push(['open_source:true']);
  const url = new URL('https://api.modrinth.com/v2/search');
  url.searchParams.set('query', String(input.query || '').trim());
  url.searchParams.set('facets', JSON.stringify(facets));
  url.searchParams.set('index', sorts.has(input.sort) ? input.sort : 'relevance');
  url.searchParams.set('offset', String(Math.max(0, Math.floor(Number(input.offset) || 0))));
  url.searchParams.set('limit', String(Math.min(50, Math.max(1, Math.floor(Number(input.limit) || 12)))));
  return url;
}
module.exports = { buildModrinthSearch };
