import { createServer } from 'node:http';
import { createHash, createPublicKey, randomBytes, randomUUID, verify } from 'node:crypto';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const AUTH = 'https://auth.openai.com';
const API = 'https://api.openai.com/v1';
const REQUIRED_SCOPE = 'chatgpt.tokens.use.direct';

export function createChatGPTAuth({ dataDir, vault, openExternal }) {
  const credentialFile = join(dataDir, 'chatgpt.auth');
  const modelFile = join(dataDir, 'chatgpt.model');
  const hostFile = join(dataDir, 'chatgpt.host');
  let record = null;
  let hostId = null;
  let attempt = null;
  let callbackServer = null;
  let selectedModel = null;

  async function load() {
    await mkdir(dataDir, { recursive: true });
    if (!hostId) {
      try { hostId = (await readFile(hostFile, 'utf8')).trim(); }
      catch { hostId = `urn:uuid:${randomUUID()}`; await writeFile(hostFile, hostId, { flag: 'wx' }).catch(async () => { hostId = (await readFile(hostFile, 'utf8')).trim(); }); }
    }
    if (!record && vault?.available?.()) {
      try { record = JSON.parse(vault.decrypt(await readFile(credentialFile, 'utf8'))); }
      catch { record = null; }
    }
    if (!selectedModel) {
      try { selectedModel = (await readFile(modelFile, 'utf8')).trim() || null; }
      catch { selectedModel = null; }
    }
  }

  async function save() {
    if (!vault?.available?.()) throw new Error('Sichere lokale Speicherung wird von dieser Laufzeit nicht bereitgestellt.');
    await mkdir(dataDir, { recursive: true });
    const temporary = `${credentialFile}.${process.pid}.tmp`;
    await writeFile(temporary, vault.encrypt(JSON.stringify(record)), { flag: 'w' });
    const { rename } = await import('node:fs/promises'); await rename(temporary, credentialFile);
  }

  async function status() {
    await load();
    const planUsageEnabled = Boolean(record?.scopes?.includes(REQUIRED_SCOPE));
    return record?.subject
      ? { connected: true, planUsageEnabled, label: record.email || 'ChatGPT verbunden', detail: planUsageEnabled ? 'ChatGPT-Plan freigegeben' : 'Freigabe für ChatGPT-Plan fehlt' }
      : { connected: false, planUsageEnabled: false, label: 'ChatGPT verbinden', detail: 'KI-Chat optional' };
  }

  async function beginSignIn() {
    if (!vault?.available?.()) throw new Error('Die sichere App-Speicherung ist noch nicht bereit.');
    await load();
    if (record?.subject && record.scopes?.includes(REQUIRED_SCOPE)) return { authorizationUrl: null, connected: true, planUsageEnabled: true };
    if (callbackServer?.listening) callbackServer.close();
    attempt = { state: token(32), nonce: token(32), verifier: token(48), clientId: record?.clientId || 'dynamic_agent_client', startedAt: Date.now() };
    const challenge = createHash('sha256').update(attempt.verifier).digest('base64url');
    callbackServer = createServer((req, res) => { void handleCallback(req, res); });
    await new Promise((resolve, reject) => { callbackServer.once('error', reject); callbackServer.listen(0, '127.0.0.1', resolve); });
    const port = callbackServer.address().port;
    attempt.redirectUri = `http://127.0.0.1:${port}/auth/callback`;
    const params = new URLSearchParams({
      client_id: attempt.clientId, response_type: 'code', redirect_uri: attempt.redirectUri,
      scope: 'openid profile email offline_access resource.invoke chatgpt.tokens.use.direct', resource: API,
      state: attempt.state, nonce: attempt.nonce, code_challenge_method: 'S256', code_challenge: challenge,
      ext_agent_host_id: hostId,
    });
    if (attempt.clientId === 'dynamic_agent_client') params.set('agent_name_hint', 'Mod Studio');
    else if (record?.idToken) params.set('id_token_hint', record.idToken);
    const authorizationUrl = `${AUTH}/api/accounts/authorize?${params}`;
    await openExternal(authorizationUrl);
    return { authorizationUrl, connected: false };
  }

  async function handleCallback(req, res) {
    const url = new URL(req.url || '/', 'http://127.0.0.1');
    const finish = (title, message) => {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
      res.end(`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width"><meta name="theme-color" content="#0c0d0e"><title>${title}</title><style>*{box-sizing:border-box}body{margin:0;background:#0c0d0e;color:#f4f5f6;font:14px "Geist Mono",Consolas,monospace;display:grid;place-items:center;min-height:100vh;padding:20px}.card{width:min(520px,100%);background:#111315;border:1px solid #303436;padding:28px}h1{font-size:20px;letter-spacing:-.06em}p{color:#a4aaac;line-height:1.75}.mark{width:18px;height:2px;background:#c6ff4a}</style><div class="card"><div class="mark"></div><h1>${title}</h1><p>${message}</p><p>Du kannst dieses Fenster schließen und zu Mod Studio zurückkehren.</p></div>`);
    };
    if (url.pathname !== '/auth/callback' || !attempt || Date.now() - attempt.startedAt > 10 * 60_000) { finish('Anmeldung abgelaufen', 'Starte die Anmeldung in Mod Studio erneut.'); return; }
    if (url.searchParams.get('state') !== attempt.state) { finish('Anmeldung abgelehnt', 'Die Rückgabe konnte nicht sicher der Anmeldung zugeordnet werden.'); closeCallback(); return; }
    if (url.searchParams.has('error')) { finish('Anmeldung nicht abgeschlossen', 'ChatGPT wurde nicht verbunden. Du kannst es später erneut versuchen.'); closeCallback(); return; }
    const code = url.searchParams.get('code'); const issuedClientId = url.searchParams.get('client_id') || attempt.clientId;
    if (!code || !issuedClientId || issuedClientId === 'dynamic_agent_client' || (attempt.clientId !== 'dynamic_agent_client' && issuedClientId !== attempt.clientId)) { finish('Anmeldung fehlgeschlagen', 'Die Rückgabe der Anmeldung ist unvollständig oder passt nicht zum ausgewählten Konto.'); closeCallback(); return; }
    try {
      const tokenResponse = await fetch(`${AUTH}/api/accounts/oauth/token`, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ grant_type: 'authorization_code', code, client_id: issuedClientId, code_verifier: attempt.verifier, redirect_uri: attempt.redirectUri, resource: API }) });
      const tokens = await tokenResponse.json();
      if (!tokenResponse.ok) throw new Error('Der ChatGPT-Tokenaustausch wurde abgelehnt.');
      const identity = await verifyIdToken(tokens.id_token, issuedClientId, attempt.nonce);
      const scopes = String(tokens.scope || '').split(/\s+/).filter(Boolean);
      record = { clientId: issuedClientId, subject: identity.sub, email: identity.email || '', idToken: tokens.id_token, accessToken: tokens.access_token || null, refreshToken: tokens.refresh_token || null, expiresAt: Date.now() + Number(tokens.expires_in || 3600) * 1000, scopes, savedAt: new Date().toISOString() };
      await save(); finish('ChatGPT verbunden', 'Deine Anmeldung ist bereit. Kehre zu Mod Studio zurück.');
    } catch (error) { finish('Anmeldung fehlgeschlagen', htmlSafe(error.message)); }
    finally { closeCallback(); }
  }

  async function verifyIdToken(idToken, clientId, nonce) {
    if (typeof idToken !== 'string') throw new Error('Es wurde kein gültiges ID-Token geliefert.');
    const parts = idToken.split('.'); if (parts.length !== 3) throw new Error('Ungültiges ID-Token.');
    const header = JSON.parse(Buffer.from(parts[0], 'base64url').toString()); const claims = JSON.parse(Buffer.from(parts[1], 'base64url').toString());
    if (header.alg !== 'RS256' || !header.kid) throw new Error('Nicht unterstützter Token-Signaturalgorithmus.');
    const jwksResponse = await fetch(`${AUTH}/.well-known/jwks.json`); if (!jwksResponse.ok) throw new Error('Die OpenAI-Signaturschlüssel konnten nicht geladen werden.');
    const jwks = await jwksResponse.json(); const key = jwks.keys?.find((candidate) => candidate.kid === header.kid && candidate.kty === 'RSA');
    if (!key) throw new Error('Der Token-Signaturschlüssel ist unbekannt.');
    const validSignature = verify('RSA-SHA256', Buffer.from(`${parts[0]}.${parts[1]}`), createPublicKey({ key, format: 'jwk' }), Buffer.from(parts[2], 'base64url'));
    const audience = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
    if (!validSignature || claims.iss !== AUTH || !audience.includes(clientId) || Number(claims.exp) <= Date.now() / 1000 || claims.nonce !== nonce || !claims.sub) throw new Error('Die Identität konnte nicht sicher verifiziert werden.');
    return claims;
  }

  async function accessToken() {
    await load(); if (!record?.subject) throw new Error('Verbinde zuerst dein ChatGPT-Konto.');
    if (!record.scopes?.includes(REQUIRED_SCOPE)) throw new Error('ChatGPT-Plan-Nutzung ist noch nicht freigegeben. Wähle „ChatGPT-Plan freigeben“, um die Berechtigung einmalig zu erteilen.');
    if (!record.accessToken) throw new Error('Die ChatGPT-Anmeldung ist abgelaufen. Bitte verbinde dein Konto erneut.');
    if (record.expiresAt > Date.now() + 60_000) return record.accessToken;
    const response = await fetch(`${AUTH}/api/accounts/oauth/token`, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ grant_type: 'refresh_token', client_id: record.clientId, refresh_token: record.refreshToken, resource: API }) });
    const renewed = await response.json(); if (!response.ok || !renewed.access_token) { record = null; await rm(credentialFile, { force: true }); throw new Error('ChatGPT-Anmeldung abgelaufen. Bitte erneut verbinden.'); }
    record.accessToken = renewed.access_token; record.refreshToken = renewed.refresh_token || record.refreshToken; record.expiresAt = Date.now() + Number(renewed.expires_in || 3600) * 1000; record.scopes = String(renewed.scope || record.scopes.join(' ')).split(/\s+/); await save(); return record.accessToken;
  }

  async function listModels() {
    const response = await fetch(`${API}/models`, { headers: { Authorization: `Bearer ${await accessToken()}` } }); const data = await response.json();
    if (!response.ok) throw new Error('Die verfügbaren ChatGPT-Modelle konnten nicht geladen werden.');
    const models = (data.models || []).filter((item) => item.visibility === 'list').map((item) => ({ id: item.slug, name: item.display_name || item.slug })).filter((item) => item.id);
    if (!models.some((item) => item.id === selectedModel)) {
      selectedModel = models[0]?.id || null;
      await saveSelectedModel();
    }
    return { models, selectedModel };
  }

  async function selectModel(modelId) {
    const catalog = await listModels();
    if (typeof modelId !== 'string' || !catalog.models.some((item) => item.id === modelId)) throw new Error('Dieses Modell ist für dein ChatGPT-Konto nicht verfügbar.');
    selectedModel = modelId;
    await saveSelectedModel();
    return selectedModel;
  }

  async function saveSelectedModel() {
    await mkdir(dataDir, { recursive: true });
    const temporary = `${modelFile}.${process.pid}.tmp`;
    await writeFile(temporary, selectedModel || '', { flag: 'w' });
    const { rename } = await import('node:fs/promises'); await rename(temporary, modelFile);
  }

  async function signOut() { record = null; selectedModel = null; await Promise.all([rm(credentialFile, { force: true }), rm(modelFile, { force: true })]); closeCallback(); return { connected: false }; }
  function closeCallback() { attempt = null; if (callbackServer?.listening) callbackServer.close(); callbackServer = null; }
  return { status, beginSignIn, signOut, listModels, selectModel, accessToken, getModel: async () => { if (!selectedModel) await listModels(); return selectedModel; } };
}

function token(bytes) { return randomBytes(bytes).toString('base64url'); }
function htmlSafe(value) { return String(value).replace(/[&<>"']/g, (character) => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[character])); }
