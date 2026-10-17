'use strict';
const DENY_TOOLS = [{ permission: '*', pattern: '*', action: 'deny' }];
function normalizeOpenCodeUrl(value = 'http://127.0.0.1:4096') {
  let url;
  try { url = new URL(String(value).trim()); } catch { throw Error('Enter a valid local OpenCode address.'); }
  if (!['http:', 'https:'].includes(url.protocol) || !['localhost','127.0.0.1','[::1]'].includes(url.hostname) || url.username || url.password || !['','/'].includes(url.pathname) || url.search || url.hash) throw Error('OpenCode must use a loopback address on this PC, without a path or embedded credentials.');
  return url.origin;
}
async function request(config, endpoint, { method = 'GET', body, timeout = 8000 } = {}) {
  const url = new URL(normalizeOpenCodeUrl(config.baseUrl) + endpoint);
  if (config.directory && endpoint !== '/global/health') url.searchParams.set('directory', config.directory);
  const headers = { 'Content-Type': 'application/json' };
  if (config.password) headers.Authorization = 'Basic ' + Buffer.from(`${config.username || 'opencode'}:${config.password}`).toString('base64');
  let response;
  try { response = await fetch(url, { method, headers, body: body === undefined ? undefined : JSON.stringify(body), redirect: 'error', signal: AbortSignal.timeout(timeout) }); }
  catch { throw Error('OpenCode is not reachable or timed out. Start opencode serve --hostname 127.0.0.1 --port 4096 and check the local address.'); }
  if (response.status === 401 || response.status === 403) throw Error('OpenCode rejected the connection. Check its server username and password.');
  if (!response.ok) throw Error(`OpenCode returned HTTP ${response.status}. Check the server and selected provider.`);
  try { return await response.json(); } catch { throw Error('OpenCode returned an invalid response.'); }
}
async function listOpenCodeModels(config) {
  const health = await request(config, '/global/health');
  if (health.healthy !== true) throw Error('The OpenCode server is not healthy.');
  const providers = await request(config, '/provider');
  const connected = new Set(providers.connected || []);
  const models = (providers.all || []).filter(p => connected.has(p.id)).flatMap(p => Object.entries(p.models || {}).filter(([,m]) => m.status !== 'deprecated').map(([key,m]) => ({ id: `${p.id}/${m.id || key}`, name: `${p.name || p.id} · ${m.name || m.id || key}`, image: !!m.capabilities?.input?.image, restricted: p.id === 'opencode' && (/-free$/.test(m.id || key) || (m.id || key) === 'big-pickle'), default: providers.default?.[p.id] === (m.id || key) })));
  return { version: String(health.version || ''), models };
}
async function askOpenCode(config, instructions, input, { onProgress } = {}) {
  const catalog = await listOpenCodeModels(config);
  const selected = catalog.models.find(m => m.id === config.model);
  if (!selected) throw Error('Select an available model from a connected OpenCode provider in Settings.');
  if (selected.restricted) throw Error('OpenCode free models are restricted to its own client. Connect another provider in OpenCode, then reload models.');
  const divider = selected.id.indexOf('/');
  const model = { providerID: selected.id.slice(0, divider), modelID: selected.id.slice(divider + 1) };
  const parts = [];
  for (const turn of input || []) {
    if (typeof turn.content === 'string') parts.push({ type: 'text', text: `${turn.role}: ${turn.content}` });
    else for (const part of turn.content || []) {
      if (part.type === 'input_text') parts.push({ type: 'text', text: `${turn.role}: ${part.text}` });
      else if (part.type === 'input_image') {
        if (!selected.image) throw Error('The selected OpenCode model does not support image input. Choose an image-capable model.');
        const match = /^data:(image\/(?:png|jpeg|webp));base64,/.exec(part.image_url || '');
        if (!match) throw Error('OpenCode image input must be an attached image.');
        parts.push({ type: 'file', mime: match[1], url: part.image_url });
      }
    }
  }
  let session;
  try {
    session = await request(config, '/session', { method: 'POST', body: { title: 'Modspire assistant', permission: DENY_TOOLS } });
    if (!session?.id || !/^ses_[a-zA-Z0-9_-]+$/.test(session.id)) throw Error('OpenCode did not create a valid session.');
    if (!(Array.isArray(session.permission) && session.permission.length === 1 && session.permission[0].permission === '*' && session.permission[0].pattern === '*' && session.permission[0].action === 'deny')) throw Error('OpenCode did not confirm the restricted session permissions. Update OpenCode before connecting.');
    const result = await request(config, `/session/${session.id}/message`, { method: 'POST', timeout: 120000, body: { model, system: instructions, parts } });
    if (result.info?.error) throw Error(String(result.info.error.data?.message || result.info.error.name || 'OpenCode model request failed.').slice(0, 400));
    const text = (result.parts || []).filter(p => p.type === 'text' && !p.ignored).map(p => p.text || '').join('\n').trim();
    if (!text) throw Error('OpenCode returned no answer. Check provider quota and model availability.');
    onProgress?.(text);
    return text;
  } finally {
    if (session?.id && /^ses_[a-zA-Z0-9_-]+$/.test(session.id)) {
      await request(config, `/session/${session.id}/abort`, { method: 'POST', timeout: 3000 }).catch(() => {});
      await request(config, `/session/${session.id}`, { method: 'DELETE', timeout: 3000 }).catch(() => {});
    }
  }
}
module.exports = { normalizeOpenCodeUrl, listOpenCodeModels, askOpenCode };
