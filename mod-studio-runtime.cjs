'use strict';
const fs = require('node:fs/promises');
const { createReadStream } = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const run = promisify(execFile);
const RUNTIMES = Object.freeze([
  { key: 'jdk', archive: 'temurin-jdk-25-windows-x64.zip', directory: 'jdk-25.0.4.1+1', executable: 'bin/javac.exe', sha256: '00c847d804f4a78e9f04f2683faf14fed898535b177b7fc704486cb0284e9283' },
  { key: 'gradle', archive: 'gradle-9.8.2-bin.zip', directory: 'gradle-9.8.2', executable: 'bin/gradle.bat', sha256: '21bd5da2de49b642904077f38c0efdc7778e92b3ed0889392dca61b97e389607' }
]);

async function sha256(file) {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(file)) hash.update(chunk);
  return hash.digest('hex');
}

async function prepareRuntimes(archivesDir, cacheDir) {
  const root = path.resolve(cacheDir);
  await fs.mkdir(root, { recursive: true });
  const result = {};
  for (const runtime of RUNTIMES) {
    const destination = path.join(root, `${runtime.key}-${runtime.sha256.slice(0, 16)}`);
    const toolRoot = path.join(destination, runtime.directory);
    const ready = async () => {
      try {
        return (await fs.readFile(path.join(destination, '.verified'), 'utf8')) === runtime.sha256 && (await fs.stat(path.join(toolRoot, runtime.executable))).isFile();
      } catch { return false; }
    };
    if (!await ready()) {
      const archive = path.resolve(archivesDir, runtime.archive);
      if (await sha256(archive) !== runtime.sha256) throw new Error(`Die mitgelieferte ${runtime.key}-Laufzeit ist beschädigt. Installiere Modspire erneut.`);
      const temporary = await fs.mkdtemp(path.join(root, `${runtime.key}-extract-`));
      try {
        const quote = value => `'${value.replace(/'/g, "''")}'`;
        const script = `$ErrorActionPreference='Stop'; [void][Reflection.Assembly]::LoadWithPartialName('System.IO.Compression.FileSystem'); [IO.Compression.ZipFile]::ExtractToDirectory(${quote(archive)},${quote(temporary)})`;
        try {
          await run('powershell.exe', ['-NoLogo', '-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from(script, 'utf16le').toString('base64')], { windowsHide: true, timeout: 180000, maxBuffer: 1024 * 1024 });
        } catch {
          throw new Error(`${runtime.key} konnte nicht entpackt werden. Prüfe freien Speicherplatz und die Schreibrechte im Mod-Studio-Datenordner.`);
        }
        await fs.access(path.join(temporary, runtime.directory, runtime.executable));
        await fs.writeFile(path.join(temporary, '.verified'), runtime.sha256);
        // Repair a previously interrupted extraction only inside this component's cache.
        const relative = path.relative(root, destination);
        if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) throw new Error('Ungültiger Laufzeitpfad.');
        if (!await ready()) {
          await fs.rm(destination, { recursive: true, force: true });
          await fs.rename(temporary, destination);
        }
      } finally {
        const relative = path.relative(root, temporary);
        if (relative && !relative.startsWith('..') && !path.isAbsolute(relative)) await fs.rm(temporary, { recursive: true, force: true });
      }
    }
    result[runtime.key] = toolRoot;
  }
  return result;
}

module.exports = { RUNTIMES, prepareRuntimes, sha256 };
