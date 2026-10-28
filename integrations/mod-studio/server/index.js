import { homedir } from 'node:os';
import { execFile } from 'node:child_process';
import { join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { promisify } from 'node:util';
import packageJson from '../package.json' with { type: 'json' };
import { createServer } from './http.js';
import { createProjectStore } from './projects.js';
import { createServices } from './services.js';
import { createUpdateService } from './updates.js';
import { createWindowsVault } from './secure-store.js';
import { createLifecycle } from './lifecycle.js';

const execFileAsync = promisify(execFile);
const applicationRoot = resolve(fileURLToPath(new URL('..', import.meta.url)));

export function createApp({ rootDir = applicationRoot, dataDir = defaultDataDirectory(), runtimeDir = defaultRuntimeDirectory(rootDir), vault = createWindowsVault(), openExternal = openInSystemBrowser, updates = createUpdateService({ currentVersion: packageJson.version }) } = {}) {
  const lifecycle = createLifecycle({ enabled: process.env.MOD_STUDIO_EXIT_WHEN_CLOSED === '1', onIdle: () => process.emit('mod-studio:idle') });
  const projectStore = createProjectStore(join(dataDir, 'projects'));
  const services = createServices({ projectStore, dataDir, runtimeDir, vault, openExternal });
  const server = createServer({ publicDir: join(rootDir, 'public'), projectStore, services, updates, lifecycle, version: packageJson.version });
  server.once('close', () => services.ai.close());
  return server;
}

function defaultDataDirectory() {
  const base = process.env.LOCALAPPDATA || process.env.APPDATA || join(homedir(), '.local', 'share');
  return join(base, 'ModStudio');
}

function defaultRuntimeDirectory(rootDir) {
  const base = process.env.MOD_STUDIO_RUNTIME_DIR || join(rootDir, '.runtime');
  return {
    node: join(base, 'node', 'node-v24.21.0-win-x64'),
    jdk: join(base, 'jdk', 'jdk-25.0.4.1+1'),
    gradle: join(base, 'gradle', 'gradle-9.8.2'),
  };
}

async function openInSystemBrowser(url) {
  const parsed = new URL(url);
  if (parsed.protocol !== 'https:' && !(parsed.protocol === 'http:' && parsed.hostname === '127.0.0.1')) throw new Error('Nur die lokale App und freigegebene HTTPS-Seiten können geöffnet werden.');
  if (parsed.protocol === 'https:' && parsed.hostname !== 'auth.openai.com') throw new Error('Diese externe Adresse ist nicht freigegeben.');
  if (process.platform === 'win32') return execFileAsync('powershell.exe', ['-NoProfile', '-WindowStyle', 'Hidden', '-Command', `Start-Process -FilePath '${url}'`]);
  if (process.platform === 'darwin') return execFileAsync('open', [url]);
  return execFileAsync('xdg-open', [url]);
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  const host = '127.0.0.1'; const requestedPort = Number(process.env.PORT || 0); const server = createApp();
  server.listen(requestedPort, host, () => {
    const address = server.address(); const url = `http://${host}:${address.port}`;
    process.stdout.write(`Mod Studio läuft unter ${url}\nProjekte bleiben lokal. Dieses Fenster schließen, um Mod Studio zu beenden.\n`);
    if (process.env.MOD_STUDIO_NO_BROWSER !== '1') openInSystemBrowser(url).catch(() => {});
  });
  const shutdown = () => { server.closeAllConnections?.(); server.close(() => process.exit(0)); setTimeout(() => process.exit(0), 3000).unref(); };
  process.on('SIGINT', shutdown); process.on('SIGTERM', shutdown);
  // the last browser tab was closed: leave quietly (exit code 0 tells the launcher this was intended)
  process.on('mod-studio:idle', shutdown);
}
