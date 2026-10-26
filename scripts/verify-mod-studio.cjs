'use strict';
const fs = require('node:fs/promises');
const path = require('node:path');
const { RUNTIMES, sha256 } = require('../mod-studio-runtime.cjs');
(async () => {
  const root = path.resolve(__dirname, '..');
  const studio = path.join(root, 'integrations', 'mod-studio');
  const manifest = JSON.parse(await fs.readFile(path.join(studio, 'manifest.json'), 'utf8'));
  for (const file of manifest.files) {
    const target = path.resolve(studio, file.path);
    const relative = path.relative(studio, target);
    if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) throw new Error('Invalid integration manifest path.');
    if (await sha256(target) !== file.sha256) throw new Error(`Studio source drift: ${file.path}. Sync the approved Studio checkout again.`);
  }
  for (const runtime of RUNTIMES) {
    const archive = path.join(root, '.mod-studio-runtime', runtime.archive);
    if (await sha256(archive) !== runtime.sha256) throw new Error(`Missing or invalid ${runtime.archive}. Run npm run studio:sync -- <Mod-Studio-checkout> first.`);
  }
  console.log(`Real Mod Studio ${manifest.version}: source and build runtime checksums verified.`);
})().catch(error => { console.error(error.message); process.exitCode = 1; });
