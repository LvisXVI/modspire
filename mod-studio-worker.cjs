'use strict';
const path = require('node:path');
const fs = require('node:fs/promises');
const { pathToFileURL } = require('node:url');
const { prepareRuntimes } = require('./mod-studio-runtime.cjs');
let server;
let starting = false;
const send = message => process.parentPort.postMessage(message);

function localRequestsOnly(req, res, listener) {
  const origin = `http://127.0.0.1:${req.socket.localPort}`;
  const blocked = req.headers.host !== new URL(origin).host
    || !['127.0.0.1', '::ffff:127.0.0.1'].includes(req.socket.remoteAddress)
    || (req.headers.origin && req.headers.origin !== origin)
    || req.headers['sec-fetch-site'] === 'cross-site'
    || (!['GET', 'HEAD'].includes(req.method) && req.headers.origin !== origin);
  if (blocked) {
    res.writeHead(403, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify({ error: 'Mod Studio ist nur aus seinem lokalen Browserfenster erreichbar.' }));
  } else listener(req, res);
}

async function start(config) {
  const runtimeDir = await prepareRuntimes(config.archivesDir, config.runtimeCache);
  const { version } = JSON.parse(await fs.readFile(path.join(config.rootDir, 'package.json'), 'utf8'));
  const { createApp } = await import(pathToFileURL(path.join(config.rootDir, 'server/index.js')).href);
  const message = 'Dieses Mod Studio ist in Modspire integriert. Updates installierst du über Modspire.';
  const updates = {
    check: async () => ({ currentVersion: version, latestVersion: version, updateAvailable: false, managedBy: 'Modspire', message }),
    install: async () => { throw new Error(message); }
  };
  server = createApp({ rootDir: config.rootDir, dataDir: config.dataDir, runtimeDir, updates });
  const [handler] = server.listeners('request');
  server.removeAllListeners('request');
  server.on('request', (req, res) => localRequestsOnly(req, res, handler));
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => { server.removeListener('error', reject); resolve(); });
  });
  server.on('error', error => send({ type: 'error', message: error.message }));
  send({ type: 'ready', origin: `http://127.0.0.1:${server.address().port}`, version });
}

process.parentPort.on('message', ({ data }) => {
  if (data?.type === 'stop') {
    if (!server) return process.exit(0);
    server.close(() => process.exit(0));
    server.closeAllConnections();
  } else if (data?.type === 'start' && !starting) {
    starting = true;
    start(data).catch(error => send({ type: 'error', message: `Mod Studio konnte nicht starten: ${error.message}` }));
  }
});
