import { createReadStream } from 'node:fs';
import { access, stat } from 'node:fs/promises';
import { createServer as createHttpServer } from 'node:http';
import { extname, resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp', '.ico': 'image/x-icon', '.json': 'application/json; charset=utf-8',
  '.woff2': 'font/woff2', '.woff': 'font/woff', '.ttf': 'font/ttf', '.webmanifest': 'application/manifest+json', '.gif': 'image/gif', '.jpg': 'image/jpeg',
  '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.wav': 'audio/wav', '.md': 'text/markdown; charset=utf-8', '.txt': 'text/plain; charset=utf-8', '.bbmodel': 'application/json; charset=utf-8',
};
const MAX_BODY_BYTES = 2_000_000;

export function createServer({ publicDir, projectStore, services, updates, version = '1.0.0' }) {
  const root = resolve(publicDir);
  return createHttpServer(async (req, res) => {
    try {
      const url = new URL(req.url || '/', 'http://127.0.0.1');
      addSecurityHeaders(res, url.pathname);
      if (req.method === 'GET' && url.pathname === '/api/health') return json(res, 200, { ok: true, version });
      if (url.pathname.startsWith('/api/')) return await routeApi(req, res, url, projectStore, services, updates);
      if (req.method !== 'GET' && req.method !== 'HEAD') return json(res, 405, { error: 'Diese Anfrage ist nicht verfügbar.' });
      return await serveStatic(req, res, root, url.pathname);
    } catch (error) {
      const status = error.status || 400;
      if (!res.headersSent) json(res, status, { error: safeErrorMessage(error) });
      else res.end(`event: error\ndata: ${JSON.stringify({ message: safeErrorMessage(error) })}\n\n`);
    }
  });
}

async function routeApi(req, res, url, store, services, updates) {
  const pathname = decodeURIComponent(url.pathname);
  if (req.method === 'GET' && pathname === '/api/projects') return json(res, 200, { projects: await store.list() });
  if (req.method === 'POST' && pathname === '/api/projects') return json(res, 201, { project: await store.create(await readJson(req)) });
  if (req.method === 'GET' && pathname === '/api/capabilities') return json(res, 200, await services.capabilities());
  if (req.method === 'GET' && pathname === '/api/updates') return json(res, 200, await updates.check());
  if (req.method === 'POST' && pathname === '/api/updates/install') {
    const result = await updates.install();
    return json(res, 202, { version: result.version, releaseUrl: result.releaseUrl });
  }
  if (req.method === 'GET' && pathname === '/api/ai/providers') return json(res, 200, await services.ai.providers());
  if (req.method === 'GET' && pathname === '/api/ai/memory') return json(res, 200, { rules: await services.aiMemory.list(url.searchParams.get('project') || null) });
  if (req.method === 'POST' && pathname === '/api/ai/memory') {
    const body = await readJson(req);
    return json(res, 200, { rules: await services.aiMemory.add(body.text, body.projectId || null) });
  }
  if (req.method === 'DELETE' && pathname === '/api/ai/memory') {
    const id = url.searchParams.get('id') || '';
    return json(res, 200, { rules: await services.aiMemory.remove(id, url.searchParams.get('project') || null) });
  }
  if (req.method === 'GET' && pathname === '/api/auth/status') return json(res, 200, await services.auth.status());
  if (req.method === 'POST' && pathname === '/api/auth/start') return json(res, 200, await services.auth.beginSignIn());
  if (req.method === 'POST' && pathname === '/api/auth/signout') return json(res, 200, await services.auth.signOut());
  if (req.method === 'GET' && pathname === '/api/auth/models') return json(res, 200, await services.auth.listModels());
  if (req.method === 'PUT' && pathname === '/api/auth/model') return json(res, 200, { selectedModel: await services.auth.selectModel((await readJson(req)).model) });
  const projectMatch = pathname.match(/^\/api\/projects\/([0-9a-f-]{36})(?:\/(source|files|build|artifact|ai))?$/i);
  if (!projectMatch) return json(res, 404, { error: 'API-Adresse nicht gefunden.' });
  const [, id, action] = projectMatch;
  if (!action && req.method === 'GET') return json(res, 200, { project: await store.read(id) });
  if (!action && req.method === 'PUT') return json(res, 200, { project: await store.write(id, await readJson(req)) });
  if (action === 'ai' && req.method === 'PUT') return json(res, 200, { project: await services.ai.apply(id, (await readJson(req)).project) });
  if (action === 'files' && req.method === 'GET') return json(res, 200, { files: await services.generator.generate(await store.read(id)) });
  if (action === 'source' && req.method === 'GET') {
    const archive = await services.generator.sourceArchive(await store.read(id));
    res.writeHead(200, { 'Content-Type': 'application/zip', 'Content-Disposition': `attachment; filename="${safeFilename((await store.read(id)).namespace)}-source.zip"`, 'Content-Length': archive.length });
    return res.end(archive);
  }
  if (action === 'artifact' && req.method === 'GET') {
    const project = await store.read(id);
    const artifact = await services.generator.findBuiltArtifact(project);
    if (!artifact) return json(res, 404, { error: 'Für dieses Projekt liegt noch kein erfolgreich gebautes Mod-JAR vor.' });
    const artifactStat = await stat(artifact);
    res.writeHead(200, { 'Content-Type': 'application/java-archive', 'Content-Disposition': `attachment; filename="${safeFilename(project.namespace)}.jar"`, 'Content-Length': artifactStat.size, 'Cache-Control': 'no-store' });
    return createReadStream(artifact).pipe(res);
  }
  if (action === 'build' && req.method === 'GET') return json(res, 200, await services.build.check(await store.read(id)));
  if (action === 'build' && req.method === 'POST') return await services.build.start(req, res, await store.read(id));
  if (action === 'ai' && req.method === 'POST') return await services.ai.stream(req, res, await store.read(id), await readJson(req));
  return json(res, 405, { error: 'Diese Anfrage ist nicht verfügbar.' });
}

async function serveStatic(req, res, root, pathname) {
  const decoded = decodeURIComponent(pathname);
  const relative = decoded === '/' ? 'index.html' : decoded.replace(/^\/+/, '');
  const file = resolve(root, relative);
  if (file !== root && !file.startsWith(root + sep)) return json(res, 403, { error: 'Dateipfad nicht verfügbar.' });
  try {
    await access(file);
    const fileStat = await stat(file);
    if (!fileStat.isFile()) return json(res, 404, { error: 'Seite nicht gefunden.' });
    // the vendored Blockbench build only changes with an app update; let the frame reuse it
    const cache = relative.startsWith('blockbench/') ? 'private, max-age=86400' : 'no-store';
    res.writeHead(200, { 'Content-Type': MIME_TYPES[extname(file).toLowerCase()] || 'application/octet-stream', 'Content-Length': fileStat.size, 'Cache-Control': cache });
    if (req.method === 'HEAD') return res.end();
    createReadStream(file).pipe(res);
  } catch {
    return json(res, 404, { error: 'Seite nicht gefunden.' });
  }
}

async function readJson(req) {
  let size = 0;
  const chunks = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) {
      const error = new Error('Anfrage überschreitet die zulässige Größe.');
      error.status = 413;
      throw error;
    }
    chunks.push(chunk);
  }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); }
  catch { throw new Error('Ungültiges JSON-Format.'); }
}

function json(res, status, value) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(value));
}

function addSecurityHeaders(res, pathname = '/') {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  if (pathname.startsWith('/blockbench/')) {
    // The bundled Blockbench web app runs in a same-origin frame. Its UI compiles Vue templates
    // and uses inline styles and blob workers; connect-src stays local, so its telemetry and
    // online plugin store are never reached.
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');
    res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self' 'unsafe-eval' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; media-src 'self' data: blob:; connect-src 'self' data: blob:; worker-src 'self' blob:; object-src 'none'; base-uri 'self'; frame-ancestors 'self'");
    return;
  }
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data: blob:; connect-src 'self'; frame-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'");
}

function safeErrorMessage(error) {
  if (error?.code === 'ENOENT') return 'Das Projekt oder die Datei wurde nicht gefunden.';
  return typeof error?.message === 'string' ? error.message.slice(0, 400) : 'Die Anfrage konnte nicht verarbeitet werden.';
}

function safeFilename(value) { return String(value).replace(/[^a-z0-9_-]/gi, '-').slice(0, 48) || 'mod'; }

export function isEntrypoint(importMetaUrl) { return process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === importMetaUrl; }
