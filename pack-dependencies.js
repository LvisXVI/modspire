(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.WorkshopPackDependencies = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const clean = value => String(value ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').trim();
  function environment(mod) {
    const side = value => value === true ? 'optional' : value === false ? 'unsupported' : String(value || '').toLowerCase();
    const client = side(mod.clientSide ?? mod.client_side), server = side(mod.serverSide ?? mod.server_side);
    const supported = value => ['required', 'optional'].includes(value);
    if (supported(client) && supported(server)) return 'both';
    if (supported(client) && server === 'unsupported') return 'client';
    if (supported(server) && client === 'unsupported') return 'server';
    // Only use explicit environment metadata, never names, categories or summaries.
    const explicit = clean(mod.environment).toLowerCase();
    if (['client_only', 'client_only_server_optional', 'singleplayer_only'].includes(explicit)) return 'client';
    if (['server_only', 'server_only_client_optional', 'dedicated_server_only'].includes(explicit)) return 'server';
    if (['client_and_server', 'client_or_server', 'client_or_server_prefers_both'].includes(explicit)) return 'both';
    return 'unknown';
  }
  function describe(mod = {}, mods = [], locale = 'de') {
    const en = String(locale).toLowerCase().startsWith('en');
    const labels = en ? { by: 'Required by', environment: 'Environment', both: 'Client and server', client: 'Client only', server: 'Server only', unknown: 'Unknown' } : { by: 'Benötigt von', environment: 'Umgebung', both: 'Client und Server', client: 'Nur Client', server: 'Nur Server', unknown: 'Unbekannt' };
    const seen = new Set();
    const parents = (Array.isArray(mod.requiredBy) ? mod.requiredBy : []).flatMap(parent => {
      if (!parent || typeof parent !== 'object') return [];
      const key = `${parent.provider || ''}:${parent.id || ''}`;
      if (seen.has(key)) return [];
      seen.add(key);
      const selected = (Array.isArray(mods) ? mods : []).find(item => String(item.id) === String(parent.id) && item.provider === parent.provider);
      const title = clean(selected?.title || parent.title || parent.id);
      return title ? [title] : [];
    });
    const parts = parents.length ? [`${labels.by}: ${parents.join(', ')}`] : [];
    parts.push(`${labels.environment}: ${labels[environment(mod)]}`);
    return parts.join(' · ');
  }
  return { describe };
});
