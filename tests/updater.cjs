const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const crypto = require('node:crypto');
const http = require('node:http');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { compareVersions, parseLatestRelease, downloadVerifiedAsset, buildPortableSwapScript, cleanupUpdateCache } = require('../updater.cjs');

(async () => {
  const cleanupRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'modspire-update-cache-test-'));
  const userData = path.join(cleanupRoot, 'Modpack-Werkstatt');
  const updateCache = path.join(userData, 'updates');
  await fs.mkdir(updateCache, { recursive: true });
  await fs.mkdir(path.join(userData, 'projects'), { recursive: true });
  await fs.writeFile(path.join(updateCache, 'Modspire-0.2.99-Portable.exe.verified'), 'old update');
  await fs.writeFile(path.join(updateCache, 'install-update.ps1'), 'old swap script');
  await fs.writeFile(path.join(userData, 'settings.json'), '{"keep":true}');
  await cleanupUpdateCache(updateCache, userData);
  await assert.rejects(fs.access(updateCache), { code: 'ENOENT' });
  assert.equal(await fs.readFile(path.join(userData, 'settings.json'), 'utf8'), '{"keep":true}');
  assert.equal(await fs.access(path.join(userData, 'projects')).then(() => true), true);
  await assert.rejects(cleanupUpdateCache(path.join(userData, 'projects'), userData), /nur.*Update-Cache/i);
  await fs.rm(cleanupRoot, { recursive: true, force: true });

  assert.equal(compareVersions('0.2.91', '0.2.90'), 1);
  assert.equal(compareVersions('0.2.90', '0.2.90'), 0);
  assert.equal(compareVersions('0.2.9', '0.2.10'), -1);
  const bytes = Buffer.from('signed release payload');
  const digest = `sha256:${crypto.createHash('sha256').update(bytes).digest('hex')}`;
  const release = parseLatestRelease({
    tag_name: 'v0.2.91',
    html_url: 'https://github.com/LvisXVI/modspire/releases/tag/v0.2.91',
    assets: [{ name: 'Modspire-0.2.91-Portable.exe', size: bytes.length, digest, browser_download_url: 'https://github.com/LvisXVI/modspire/releases/download/v0.2.91/Modspire-0.2.91-Portable.exe' }],
  });
  assert.equal(release.version, '0.2.91');
  assert.equal(release.asset.name, 'Modspire-0.2.91-Portable.exe');
  assert.throws(() => parseLatestRelease({ tag_name: 'v0.2.91', assets: [] }), /portable/i);
  assert.throws(() => parseLatestRelease({ tag_name: 'v0.2.91', assets: [{ ...release.asset, browser_download_url: 'http://bad.example/file.exe' }] }), /https|GitHub/i);

  const server = http.createServer((_request, response) => {
    response.writeHead(200, { 'content-length': bytes.length });
    response.end(bytes);
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'modspire-update-test-'));
  const destination = path.join(directory, 'update.exe');
  const url = `http://127.0.0.1:${server.address().port}/asset`;
  try {
    const progress = [];
    const result = await downloadVerifiedAsset({ url, destination, expectedDigest: digest, fetchImpl: fetch, onProgress: item => progress.push(item) });
    assert.equal(result.bytes, bytes.length);
    assert.deepEqual(await fs.readFile(destination), bytes);
    assert.ok(progress.length > 0);
    await assert.rejects(downloadVerifiedAsset({ url, destination, expectedDigest: `sha256:${'0'.repeat(64)}`, fetchImpl: fetch }), /SHA-256/i);
    await assert.rejects(fs.access(destination), { code: 'ENOENT' });
  } finally {
    server.close();
    await fs.rm(directory, { recursive: true, force: true });
  }

  const script = buildPortableSwapScript({ currentExe: 'C:\\Apps\\Modspire.exe', stagedExe: 'C:\\Apps\\.Modspire.exe.modspire-update', backupExe: 'C:\\Apps\\Modspire.exe.backup', updateDirectory: 'C:\\Users\\Alice\\AppData\\Roaming\\Modpack-Werkstatt\\updates', pid: 42 });
  assert.match(script, /Wait-Process -Id 42/);
  assert.match(script, /Modspire\.exe\.backup/);
  assert.match(script, /Start-Process -FilePath \$target.+-PassThru/);
  assert.match(script, /Remove-Item -LiteralPath \$backup -Force/);
  assert.match(script, /Start-Process -FilePath 'powershell\.exe'/);
  assert.match(script, /AppData\\Roaming\\Modpack-Werkstatt\\updates/);
  assert.throws(() => buildPortableSwapScript({ currentExe: 'C:\\Apps\\Modspire.exe', stagedExe: 'C:\\Apps\\.Modspire.exe.modspire-update', backupExe: 'C:\\Apps\\Modspire.exe.backup', updateDirectory: 'C:\\Apps\\updates', pid: 42 }), /getrennt|Update-Cache/i);
  if (process.platform === 'win32') {
    const inner = Buffer.from(script, 'utf16le').toString('base64');
    const parser = `$generated=[Text.Encoding]::Unicode.GetString([Convert]::FromBase64String('${inner}'));[void][scriptblock]::Create($generated)`;
    execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from(parser, 'utf16le').toString('base64')], { windowsHide: true });
  }
  assert.throws(() => buildPortableSwapScript({ currentExe: 'C:\\Apps\\..\\other.exe', stagedExe: 'C:\\temp\\update.exe', backupExe: 'x', pid: 1 }), /selben Verzeichnis/i);
  console.log('Updater version parsing, release validation, streamed integrity verification, cleanup, and portable swap safety passed.');
})().catch(error => { console.error(error); process.exitCode = 1; });
