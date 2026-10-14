const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const path = require('node:path');
const { Readable } = require('node:stream');
const { pipeline } = require('node:stream/promises');

const REPOSITORY = 'LvisXVI/modspire';
const RELEASE_API = `https://api.github.com/repos/${REPOSITORY}/releases/latest`;
const RELEASE_ASSET_HOSTS = new Set(['github.com', 'release-assets.githubusercontent.com', 'objects.githubusercontent.com']);

function compareVersions(left, right) {
  const parse = value => String(value).replace(/^v/i, '').split(/[+-]/, 1)[0].split('.').map(part => Number(part));
  const a = parse(left), b = parse(right);
  for (let index = 0; index < Math.max(a.length, b.length, 3); index++) {
    const difference = (a[index] || 0) - (b[index] || 0);
    if (difference) return Math.sign(difference);
  }
  return 0;
}

function parseLatestRelease(release) {
  if (!release || typeof release !== 'object' || release.draft || release.prerelease) throw new Error('GitHub hat kein stabiles Modspire-Release zurückgegeben.');
  const version = String(release.tag_name || '').replace(/^v/, '');
  if (!/^\d+\.\d+\.\d+$/.test(version)) throw new Error('Die Release-Version ist ungültig.');
  const assetName = `Modspire-${version}-Portable.exe`;
  const asset = Array.isArray(release.assets) ? release.assets.find(item => item.name === assetName) : null;
  if (!asset || !Number.isSafeInteger(asset.size) || asset.size <= 0) throw new Error('Im aktuellen Release fehlt die portable Windows-Datei.');
  if (!/^sha256:[a-f0-9]{64}$/i.test(asset.digest || '')) throw new Error('GitHub stellt für diese EXE keinen überprüfbaren SHA-256-Prüfwert bereit.');
  const url = new URL(asset.browser_download_url);
  if (url.protocol !== 'https:' || url.hostname !== 'github.com' || !url.pathname.includes(`/LvisXVI/modspire/releases/download/v${version}/`) || !url.pathname.endsWith(`/${assetName}`)) throw new Error('Die Download-Adresse gehört nicht zum erwarteten GitHub-Release.');
  return { version, name: String(release.name || `Modspire ${version}`), url: release.html_url, asset: { name: assetName, size: asset.size, digest: asset.digest.toLowerCase(), url: url.href } };
}

async function fetchLatestRelease({ fetchImpl = fetch, currentVersion }) {
  const response = await fetchImpl(RELEASE_API, { headers: { accept: 'application/vnd.github+json', 'user-agent': 'Modspire-Updater' }, signal: AbortSignal.timeout(20000) });
  if (!response.ok) throw new Error(`GitHub-Updateprüfung fehlgeschlagen (HTTP ${response.status}).`);
  const release = parseLatestRelease(await response.json());
  return { ...release, currentVersion, updateAvailable: compareVersions(release.version, currentVersion) > 0 };
}

function allowedResponseUrl(value) {
  const url = new URL(value);
  if (url.protocol === 'http:' && ['127.0.0.1', 'localhost', '::1'].includes(url.hostname)) return true;
  return url.protocol === 'https:' && RELEASE_ASSET_HOSTS.has(url.hostname);
}

async function downloadVerifiedAsset({ url, destination, expectedDigest, expectedSize, fetchImpl = fetch, onProgress = () => {} }) {
  if (!/^sha256:[a-f0-9]{64}$/i.test(expectedDigest || '')) throw new Error('Der SHA-256-Prüfwert des Downloads ist ungültig.');
  const source = new URL(url);
  if (!allowedResponseUrl(source.href)) throw new Error('Der Download muss von GitHub oder einer lokalen Testadresse kommen.');
  await fs.mkdir(path.dirname(destination), { recursive: true });
  await fs.rm(destination, { force: true });
  try {
    const response = await fetchImpl(source.href, { headers: { 'user-agent': 'Modspire-Updater' }, signal: AbortSignal.timeout(10 * 60 * 1000), redirect: 'follow' });
    if (!response.ok || !response.body) throw new Error(`Download fehlgeschlagen (HTTP ${response.status}).`);
    if (!allowedResponseUrl(response.url || source.href)) throw new Error('GitHub hat auf einen nicht erlaubten Download-Host umgeleitet.');
    const hash = crypto.createHash('sha256');
    let bytes = 0;
    const readable = Readable.fromWeb(response.body);
    const monitor = async function* () {
      for await (const chunk of readable) {
        bytes += chunk.length;
        if (expectedSize && bytes > expectedSize) throw new Error('Der Download ist größer als im Release angegeben.');
        hash.update(chunk);
        onProgress({ bytes, total: expectedSize || Number(response.headers.get('content-length')) || 0, percent: expectedSize ? Math.min(99, Math.floor(bytes / expectedSize * 100)) : null });
        yield chunk;
      }
    };
    await pipeline(Readable.from(monitor()), require('node:fs').createWriteStream(destination, { flags: 'wx' }));
    const actual = `sha256:${hash.digest('hex')}`;
    if (actual !== expectedDigest.toLowerCase()) throw new Error('SHA-256-Prüfung fehlgeschlagen. Die Datei wurde verworfen.');
    if (expectedSize && bytes !== expectedSize) throw new Error('Die heruntergeladene Datei ist unvollständig.');
    onProgress({ bytes, total: expectedSize || bytes, percent: 100 });
    return { path: destination, bytes, digest: actual };
  } catch (error) {
    await fs.rm(destination, { force: true }).catch(() => {});
    throw error;
  }
}

function psQuote(value) { return `'${String(value).replace(/'/g, "''")}'`; }
function buildPortableSwapScript({ currentExe, stagedExe, backupExe, pid }) {
  const win = path.win32;
  const current = win.resolve(currentExe), staged = win.resolve(stagedExe), backup = win.resolve(backupExe);
  if (win.dirname(current).toLowerCase() !== win.dirname(staged).toLowerCase() || win.dirname(current).toLowerCase() !== win.dirname(backup).toLowerCase()) throw new Error('EXE, geprüfte Aktualisierung und Sicherung müssen im selben Verzeichnis liegen.');
  if (win.basename(current).toLowerCase() === win.basename(staged).toLowerCase() || win.basename(current).toLowerCase() === win.basename(backup).toLowerCase()) throw new Error('Update- und Sicherungsdatei müssen eigene Namen haben.');
  if (!Number.isSafeInteger(pid) || pid <= 0) throw new Error('Die Prozess-ID ist ungültig.');
  return `$ErrorActionPreference='Stop';$target=${psQuote(current)};$stage=${psQuote(staged)};$backup=${psQuote(backup)};Wait-Process -Id ${pid} -ErrorAction SilentlyContinue;try{if(Test-Path -LiteralPath $backup){Remove-Item -LiteralPath $backup -Force};Move-Item -LiteralPath $target -Destination $backup -Force;Move-Item -LiteralPath $stage -Destination $target -Force;Start-Process -FilePath $target -WorkingDirectory ${psQuote(win.dirname(current))}}catch{if((Test-Path -LiteralPath $backup) -and !(Test-Path -LiteralPath $target)){Move-Item -LiteralPath $backup -Destination $target -Force};throw}`;
}

module.exports = { compareVersions, parseLatestRelease, fetchLatestRelease, downloadVerifiedAsset, buildPortableSwapScript };
