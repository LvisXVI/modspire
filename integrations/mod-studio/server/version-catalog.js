const MINIMUM_VERSION = '1.12.2';
const MOJANG_MANIFEST = 'https://piston-meta.mojang.com/mc/game/version_manifest_v2.json';
const LOADER_SOURCES = {
  fabric: 'https://meta.fabricmc.net/v2/versions/game',
  quilt: 'https://meta.quiltmc.org/v3/versions/game',
  forge: 'https://maven.minecraftforge.net/net/minecraftforge/forge/maven-metadata.xml',
  neoforge: 'https://maven.neoforged.net/releases/net/neoforged/neoforge/maven-metadata.xml',
};

const FALLBACK_RELEASES = [
  '1.12.2','1.13','1.13.1','1.13.2','1.14','1.14.1','1.14.2','1.14.3','1.14.4',
  '1.15','1.15.1','1.15.2','1.16','1.16.1','1.16.2','1.16.3','1.16.4','1.16.5',
  '1.17','1.17.1','1.18','1.18.1','1.18.2','1.19','1.19.1','1.19.2','1.19.3','1.19.4',
  '1.20','1.20.1','1.20.2','1.20.3','1.20.4','1.20.5','1.20.6','1.21','1.21.1',
  '1.21.2','1.21.3','1.21.4','1.21.5','1.21.6','1.21.7','1.21.8','1.21.9','1.21.10','1.21.11',
  '26.1','26.1.1','26.1.2','26.2','26.3',
];
const LOADER_LABELS = { fabric: 'Fabric', quilt: 'Quilt', forge: 'Forge', neoforge: 'NeoForge' };
const BUILD_TARGETS = { fabric: ['26.2'] };
const FALLBACK_LOADER_VERSIONS = JSON.parse(readFileSync(new URL('./loader-version-fallback.json', import.meta.url), 'utf8'));

export function filterMinecraftReleases(versions) {
  if (!Array.isArray(versions)) return [];
  const releases = versions.filter((version) => version?.type === 'release' && typeof version.id === 'string').map((version) => version.id);
  const minimumIndex = releases.indexOf(MINIMUM_VERSION);
  return minimumIndex < 0 ? [] : releases.slice(0, minimumIndex + 1).reverse();
}

export function extractMavenVersions(xml) {
  if (typeof xml !== 'string') return [];
  return [...xml.matchAll(/<version>\s*([^<]+?)\s*<\/version>/g)].map((match) => match[1]);
}

export function mapNeoForgeMinecraftVersion(loaderVersion, releases) {
  if (typeof loaderVersion !== 'string') return null;
  for (const release of releases) {
    const modern = release.match(/^(\d+)\.(\d+)(?:\.(\d+))?$/);
    if (!modern) continue;
    const neoMajor = modern[1] === '1' ? modern[2] : modern[1];
    const neoMinor = modern[1] === '1' ? (modern[3] || '0') : (modern[2] || '0');
    if (loaderVersion.startsWith(`${neoMajor}.${neoMinor}.`)) return release;
  }
  return null;
}

export function createVersionCatalog({ fetchImpl = fetch, now = () => Date.now() } = {}) {
  let cache;
  let cachedAt = 0;
  return async function getVersionCatalog() {
    if (cache && now() - cachedAt < 30 * 60 * 1000) return cache;
    const releases = await fetchReleases(fetchImpl).catch(() => FALLBACK_RELEASES);
    const releaseSet = new Set(releases);
    const loaderVersions = await Promise.all(Object.entries(LOADER_SOURCES).map(async ([id, url]) => {
      const values = await fetchText(fetchImpl, url).catch(() => null);
      if (values === null) return { id, versions: FALLBACK_LOADER_VERSIONS[id] || [] };
      let available;
      try {
        available = id === 'fabric' || id === 'quilt'
          ? supportedGameVersions(JSON.parse(values))
          : id === 'forge'
            ? forgeGameVersions(extractMavenVersions(values))
            : neoForgeGameVersions(extractMavenVersions(values), releases);
      } catch { available = FALLBACK_LOADER_VERSIONS[id] || []; }
      return { id, versions: [...new Set(available)].filter((version) => releaseSet.has(version)).sort(compareVersionsNewestFirst) };
    }));
    const loaders = loaderVersions.map(({ id, versions }) => ({
      id,
      label: LOADER_LABELS[id],
      status: BUILD_TARGETS[id] ? 'supported' : 'planned',
      versions,
      buildVersions: BUILD_TARGETS[id] || [],
    }));
    cache = { defaultLoader: 'fabric', defaultVersion: '26.2', minimumVersion: MINIMUM_VERSION, latestVersion: releases.at(-1) || '26.3', versions: releases, loaders };
    cachedAt = now();
    return cache;
  };
}

async function fetchReleases(fetchImpl) {
  const response = await fetchImpl(MOJANG_MANIFEST, { signal: AbortSignal.timeout(5000), headers: { 'User-Agent': 'ModStudio/0.1 (+Minecraft Java version selector)' } });
  if (!response.ok) throw new Error(`Minecraft version catalog returned ${response.status}`);
  const data = await response.json();
  const releases = filterMinecraftReleases(data.versions);
  if (!releases.length) throw new Error('The official manifest does not include Minecraft 1.12.2.');
  return releases;
}

async function fetchText(fetchImpl, url) {
  const response = await fetchImpl(url, { signal: AbortSignal.timeout(5000), headers: { 'User-Agent': 'ModStudio/0.1 (+Minecraft loader compatibility catalog)' } });
  if (!response.ok) throw new Error(`Loader catalog returned ${response.status}`);
  return response.text();
}

function supportedGameVersions(data) {
  return Array.isArray(data) ? data.filter((entry) => entry?.stable === true && typeof entry.version === 'string').map((entry) => entry.version) : [];
}

function forgeGameVersions(versions) {
  return versions.map((version) => version.split('-')[0]).filter((version) => /^\d+\.\d+(?:\.\d+)?$/.test(version));
}

function neoForgeGameVersions(versions, releases) {
  const supported = new Set();
  for (const version of versions) {
    const gameVersion = mapNeoForgeMinecraftVersion(version, releases);
    if (gameVersion) supported.add(gameVersion);
  }
  return [...supported];
}

function compareVersionsNewestFirst(left, right) {
  const parts = (value) => value.split(/[.-]/).map((part) => /^\d+$/.test(part) ? Number(part) : part);
  const a = parts(left), b = parts(right);
  for (let i = 0; i < Math.max(a.length, b.length); i += 1) {
    if (a[i] === undefined) return 1;
    if (b[i] === undefined) return -1;
    if (a[i] === b[i]) continue;
    if (typeof a[i] === 'number' && typeof b[i] === 'number') return b[i] - a[i];
    return String(b[i]).localeCompare(String(a[i]), undefined, { numeric: true });
  }
  return 0;
}
import { readFileSync } from 'node:fs';

