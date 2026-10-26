'use strict';
const fs = require('node:fs/promises');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { RUNTIMES, sha256 } = require('../mod-studio-runtime.cjs');

(async () => {
  if (!process.argv[2]) throw new Error('Usage: npm run studio:sync -- <path-to-minecraft-mod-studio>');
  const source = path.resolve(process.argv[2]);
  const root = path.resolve(__dirname, '..');
  const destination = path.join(root, 'integrations', 'mod-studio');
  const pkg = JSON.parse(await fs.readFile(path.join(source, 'package.json'), 'utf8'));
  if (pkg.name !== 'minecraft-ai-mod-creator') throw new Error('This is not the Mod Studio source checkout.');
  const files = [];
  async function copy(relative) {
    const from = path.join(source, relative), to = path.join(destination, relative);
    const stat = await fs.lstat(from);
    if (stat.isSymbolicLink()) throw new Error(`Symlink rejected: ${relative}`);
    if (stat.isDirectory()) {
      for (const name of await fs.readdir(from)) await copy(path.join(relative, name));
    } else if (stat.isFile()) {
      await fs.mkdir(path.dirname(to), { recursive: true });
      await fs.copyFile(from, to);
      files.push({ path: relative.replaceAll('\\', '/'), sha256: await sha256(to) });
    }
  }
  // Deliberate allowlist: never copy projects, credentials, build output or the static demo.
  for (const relative of ['server', 'public', 'licenses', 'package.json']) await copy(relative);
  const archiveDirectory = path.join(root, '.mod-studio-runtime');
  await fs.mkdir(archiveDirectory, { recursive: true });
  for (const runtime of RUNTIMES) {
    const from = path.join(source, '.runtime', 'downloads', runtime.archive);
    if (await sha256(from) !== runtime.sha256) throw new Error(`Runtime checksum mismatch: ${runtime.archive}`);
    await fs.copyFile(from, path.join(archiveDirectory, runtime.archive));
  }
  const revision = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: source, encoding: 'utf8', windowsHide: true }).trim();
  const manifest = { source: 'https://github.com/LvisXVI/minecraft-mod-studio', version: pkg.version, sourceRevision: revision, files: files.sort((a,b) => a.path.localeCompare(b.path)) };
  await fs.writeFile(path.join(destination, 'manifest.json'), JSON.stringify(manifest, null, 2)+'\n');
  console.log(`Synced real Mod Studio ${pkg.version}: ${files.length} files and verified JDK/Gradle archives.`);
})().catch(error => { console.error(error.message); process.exitCode = 1; });
