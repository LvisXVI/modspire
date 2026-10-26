import { createHash } from 'node:crypto';
import { createWriteStream } from 'node:fs';
import { mkdir, readdir, rename, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const RELEASES_API = 'https://api.github.com/repos/LvisXVI/minecraft-mod-studio/releases?per_page=30';
const INSTALLER_NAME = 'Mod-Studio-Setup.exe';
const CHECKSUMS_NAME = 'SHA256SUMS.txt';
const MAX_INSTALLER_BYTES = 1_000_000_000;
const UPDATE_ARTIFACT = /^Mod-Studio-Setup-\d+\.\d+\.\d+(?:-[A-Za-z0-9.-]+)?\.(?:exe|partial)$/i;

export async function cleanupUpdateArtifacts(directory) {
  const root = resolve(directory);
  let entries;
  try { entries = await readdir(root, { withFileTypes: true }); }
  catch (error) { if (error?.code === 'ENOENT') return 0; throw error; }
  const artifacts = entries.filter((entry) => entry.isFile() && UPDATE_ARTIFACT.test(entry.name));
  await Promise.all(artifacts.map((entry) => rm(join(root, entry.name), { force: true })));
  return artifacts.length;
}

export function buildInstallerCleanupScript(directory) {
  const root = resolve(directory);
  if (basename(root).toLowerCase() !== 'updates' || basename(dirname(root)).toLowerCase() !== 'modstudio') {
    throw new Error('Der Mod-Studio-Update-Cache muss im eigenen updates-Ordner liegen.');
  }
  const quotedRoot = quotePowerShell(root).replace(/'/g, "''");
  return `param([int]$SetupPid);$ErrorActionPreference='SilentlyContinue';Wait-Process -Id $SetupPid -ErrorAction SilentlyContinue;$cleanup='Wait-Process -Id '+$PID+' -ErrorAction SilentlyContinue; if(Test-Path -LiteralPath ${quotedRoot}){Remove-Item -LiteralPath ${quotedRoot} -Recurse -Force}';$encoded=[Convert]::ToBase64String([Text.Encoding]::Unicode.GetBytes($cleanup));Start-Process -FilePath 'powershell.exe' -WindowStyle Hidden -ArgumentList @('-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-EncodedCommand',$encoded)`;
}

export function createUpdateService({ currentVersion, fetchImpl = fetch, downloadDir = join(tmpdir(), 'ModStudio', 'updates'), launchInstaller = launchWindowsInstaller } = {}) {
  if (!isVersion(currentVersion)) throw new TypeError('Die installierte App-Version ist ungültig.');

  async function findRelease() {
    const response = await fetchImpl(RELEASES_API, { headers: { Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' } });
    if (!response.ok) throw new Error('GitHub-Releases sind gerade nicht erreichbar.');
    const releases = await response.json();
    if (!Array.isArray(releases)) throw new Error('Die Update-Antwort von GitHub ist ungültig.');
    const candidates = releases
      .filter((release) => !release.draft && isVersion(normalizeVersion(release.tag_name)))
      .sort((a, b) => compareVersions(normalizeVersion(b.tag_name), normalizeVersion(a.tag_name)));
    const release = candidates[0];
    if (!release) throw new Error('Es wurde noch keine gültige Mod-Studio-Version veröffentlicht.');
    if (!/^https:\/\/github\.com\/LvisXVI\/minecraft-mod-studio\/releases\/tag\/[A-Za-z0-9._-]+$/.test(release.html_url || '')) {
      throw new Error('Der Release-Link ist ungültig.');
    }
    const assets = Array.isArray(release.assets) ? release.assets : [];
    const installer = assets.find((asset) => asset.name === INSTALLER_NAME);
    const checksums = assets.find((asset) => asset.name === CHECKSUMS_NAME);
    if (!installer || !checksums) throw new Error('Das Release enthält kein vollständiges Windows-Update.');
    for (const asset of [installer, checksums]) {
      const address = new URL(asset.browser_download_url || '');
      if (address.protocol !== 'https:' || address.hostname !== 'github.com') throw new Error('GitHub hat einen ungültigen Download-Link geliefert.');
    }
    if (Number(installer.size) > MAX_INSTALLER_BYTES) throw new Error('Das Update überschreitet die erlaubte Paketgröße.');
    return { release, version: normalizeVersion(release.tag_name), installer, checksums };
  }

  async function check() {
    const { release, version } = await findRelease();
    return {
      currentVersion,
      latestVersion: version,
      updateAvailable: compareVersions(version, currentVersion) > 0,
      releaseUrl: release.html_url,
      releaseNotes: typeof release.body === 'string' ? release.body.slice(0, 12_000) : '',
    };
  }

  async function install() {
    if (process.platform !== 'win32' && launchInstaller === launchWindowsInstaller) throw new Error('Der automatische Installer ist nur unter Windows verfügbar.');
    const { release, version, installer, checksums } = await findRelease();
    if (compareVersions(version, currentVersion) <= 0) throw new Error('Mod Studio ist bereits auf dem neuesten Stand.');
    await mkdir(downloadDir, { recursive: true });
    await cleanupUpdateArtifacts(downloadDir);

    const suffix = `${version}-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
    const partialPath = join(downloadDir, `Mod-Studio-Setup-${suffix}.partial`);
    const installerPath = join(downloadDir, `Mod-Studio-Setup-${version}.exe`);
    try {
      const [sumsResponse, setupResponse] = await Promise.all([fetchImpl(checksums.browser_download_url), fetchImpl(installer.browser_download_url)]);
      if (!sumsResponse.ok || !setupResponse.ok || !setupResponse.body) throw new Error('Das Update konnte nicht vollständig heruntergeladen werden.');
      const sumText = await sumsResponse.text();
      const expected = findSha256(sumText, INSTALLER_NAME);
      const declaredSize = Number(installer.size);
      const receivedSize = Number(setupResponse.headers.get('content-length'));
      if (Number.isFinite(declaredSize) && declaredSize > 0 && Number.isFinite(receivedSize) && receivedSize !== declaredSize) throw new Error('Die heruntergeladene Setup-Datei ist unvollständig.');
      let bytes = 0;
      const hash = createHash('sha256');
      const body = Readable.fromWeb(setupResponse.body);
      body.on('data', (chunk) => { bytes += chunk.length; hash.update(chunk); if (bytes > MAX_INSTALLER_BYTES) body.destroy(new Error('Das Update überschreitet die erlaubte Paketgröße.')); });
      await pipeline(body, createWriteStream(partialPath, { flags: 'wx' }));
      if (declaredSize > 0 && bytes !== declaredSize) throw new Error('Die heruntergeladene Setup-Datei ist unvollständig.');
      if (hash.digest('hex') !== expected) throw new Error('Die SHA-256-Prüfsumme des Updates stimmt nicht überein.');
      await rm(installerPath, { force: true });
      await rename(partialPath, installerPath);
      await launchInstaller(installerPath, downloadDir);
      return { version, installerPath, releaseUrl: release.html_url };
    } catch (error) {
      await rm(partialPath, { force: true }).catch(() => {});
      if (error?.message?.includes('Prüfsumme')) throw error;
      throw error;
    }
  }

  return { check, install };
}

function findSha256(text, filename) {
  const line = String(text).split(/\r?\n/).find((entry) => entry.trim().endsWith(`  ${filename}`) || entry.trim().endsWith(` *${filename}`));
  const match = line?.trim().match(/^([a-f\d]{64})\s+\*?Mod-Studio-Setup\.exe$/i);
  if (!match) throw new Error('Die SHA-256-Prüfsumme für das Update fehlt.');
  return match[1].toLowerCase();
}

function normalizeVersion(tag) { return typeof tag === 'string' ? tag.replace(/^v/, '') : ''; }
function isVersion(value) { return /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(value); }
function compareVersions(left, right) {
  const parse = (value) => {
    const [base, prerelease] = value.split('-', 2);
    return { core: base.split('.').map(Number), prerelease: prerelease?.split('.') ?? null };
  };
  const a = parse(left); const b = parse(right);
  for (let index = 0; index < 3; index++) if (a.core[index] !== b.core[index]) return a.core[index] > b.core[index] ? 1 : -1;
  if (!a.prerelease || !b.prerelease) return a.prerelease ? -1 : b.prerelease ? 1 : 0;
  for (let index = 0; index < Math.max(a.prerelease.length, b.prerelease.length); index++) {
    if (a.prerelease[index] === undefined) return -1;
    if (b.prerelease[index] === undefined) return 1;
    const aNumber = /^\d+$/.test(a.prerelease[index]) ? Number(a.prerelease[index]) : null;
    const bNumber = /^\d+$/.test(b.prerelease[index]) ? Number(b.prerelease[index]) : null;
    if (aNumber !== null && bNumber !== null && aNumber !== bNumber) return aNumber > bNumber ? 1 : -1;
    if (aNumber !== null && bNumber === null) return -1;
    if (aNumber === null && bNumber !== null) return 1;
    if (aNumber === null && a.prerelease[index] !== b.prerelease[index]) return a.prerelease[index] > b.prerelease[index] ? 1 : -1;
  }
  return 0;
}

async function launchWindowsInstaller(path) {
  const escaped = quotePowerShell(path);
  const cleanupPath = join(dirname(path), 'cleanup-update.ps1');
  await writeFile(cleanupPath, buildInstallerCleanupScript(dirname(path)), { encoding: 'utf8', mode: 0o600 });
  const cleanup = quotePowerShell(cleanupPath);
  const command = `$setup=Start-Process -FilePath ${escaped} -PassThru;Start-Process -FilePath 'powershell.exe' -WindowStyle Hidden -ArgumentList @('-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',${cleanup},'-SetupPid',[string]$setup.Id)`;
  await execFileAsync('powershell.exe', ['-NoProfile', '-WindowStyle', 'Hidden', '-Command', command], { windowsHide: true });
}

function quotePowerShell(value) { return `'${String(value).replace(/'/g, "''")}'`; }
