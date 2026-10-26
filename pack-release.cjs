const crypto = require('node:crypto');
const zlib = require('node:zlib');

// Sources: https://support.modrinth.com/en/articles/8802351-modrinth-modpack-format-mrpack
// https://docs.modrinth.com/api/operations/getprojectversions/
// https://github.com/FabricMC/fabric-meta/blob/master/README.md
const API = 'https://api.modrinth.com/v2';
const DOWNLOAD_HOSTS = new Set(['cdn.modrinth.com', 'github.com', 'raw.githubusercontent.com', 'gitlab.com']);
const MAX_PROJECTS = 500;
const MAX_REQUESTS = 2500;
const MAX_CHOICES = 50;
const MAX_STEPS = 2500;
const REQUEST_TIMEOUT_MS = 20000;
const idPattern = /^[a-zA-Z0-9_-]{1,128}$/;
const loaderPattern = /^\d+(?:\.\d+){1,4}(?:[-+][A-Za-z0-9.]+)?$/;

class ResolutionError extends Error {}
class UnsupportedShaderError extends Error {}
function id(value, label = 'project ID') {
  if (typeof value !== 'string' || !idPattern.test(value)) throw new Error(`Invalid ${label}. Select a valid Modrinth project/version.`);
  return value;
}
function configuration(project) {
  if (!project || !Array.isArray(project.mods)) throw new Error('Invalid pack project: a mod selection is required.');
  if (project.mods.length > MAX_PROJECTS) throw new Error(`Pack limit: at most ${MAX_PROJECTS} selected entries can be resolved.`);
  const minecraftVersion = String(project.minecraftVersion || '');
  const loader = String(project.loader || '').toLowerCase();
  if (!/^[A-Za-z0-9][A-Za-z0-9._+-]{0,79}$/.test(minecraftVersion)) throw new Error('Select an exact Minecraft version before exporting or checking updates.');
  if (!['fabric', 'forge', 'neoforge', 'quilt'].includes(loader)) throw new Error(`Unsupported loader ${loader}. Select Fabric, Forge, NeoForge or Quilt.`);
  return { minecraftVersion, loader };
}
function supported(mod) {
  if (mod?.provider !== 'modrinth') throw new Error(`${mod?.title || mod?.id || 'Entry'}: ${mod?.provider === 'curseforge' ? 'CurseForge' : mod?.provider || 'unknown provider'} is unsupported for release/export. Replace this entry with a Modrinth release or export the project JSON.`);
  id(mod.id);
  if (mod.versionId) id(mod.versionId, 'version ID');
  if (mod.kind && !['mod', 'visual', 'shader', 'resourcepack'].includes(mod.kind)) throw new Error(`Unsupported selected content type ${mod.kind} for ${mod.title || mod.id}.`);
}
function kindOf(project) {
  if (!['mod', 'resourcepack', 'shader'].includes(project?.project_type)) throw new Error(`Unsupported Modrinth content type ${project?.project_type || 'unknown'} for ${project?.title || project?.id || 'project'}.`);
  return project.project_type;
}
function compatible(version, project, config) {
  if (!Array.isArray(version?.game_versions) || !version.game_versions.includes(config.minecraftVersion)) return false;
  if (!Array.isArray(version.loaders)) return false;
  const kind = kindOf(project);
  return kind === 'resourcepack' ? version.loaders.includes('minecraft') : kind === 'shader' ? config.irisVerified === true && ['fabric', 'neoforge'].includes(config.loader) && version.loaders.includes('iris') : version.loaders.includes(config.loader);
}
function published(version) { return Date.parse(version?.date_published); }
function ordered(versions) {
  return [...versions].sort((a, b) => published(b) - published(a) || String(b.id).localeCompare(String(a.id)));
}
function releaseCandidates(versions, project, config) {
  return ordered(versions.filter(version => version?.project_id === project.id && version.version_type === 'release' && ['listed', 'archived', undefined].includes(version.status) && Number.isFinite(published(version)) && compatible(version, project, config)));
}
function concreteMod(mod, project, version, config) {
  return { ...mod, id: project.id, provider: 'modrinth', kind: kindOf(project), title: mod.title || project.title, summary: mod.summary || project.description || '', url: mod.url || `https://modrinth.com/${kindOf(project)}/${project.slug || project.id}`, clientSide: project.client_side, serverSide: project.server_side, environment: version.environment || project.environment, compatibility: `${config.minecraftVersion} · ${config.loader}`, versionId: version.id, versionNumber: version.version_number };
}

function createPackReleaseService({ fetchJson, fetchBuffer } = {}) {
  if (typeof fetchJson !== 'function') throw new TypeError('fetchJson is required.');
  // A fresh context per operation avoids stale cached metadata surviving later checks.
  function context(config) {
    let requests = 0;
    const cache = new Map();
    async function json(url) {
      if (cache.has(url)) return cache.get(url);
      if (++requests > MAX_REQUESTS) throw new Error(`Metadata request limit (${MAX_REQUESTS}) exceeded. Split this pack into smaller selections.`);
      const pending = (async () => {
        const controller = new AbortController();
        let timer;
        const timeout = new Promise((_, reject) => { timer = setTimeout(() => { controller.abort(); reject(new Error('Metadata request timed out. Please retry.')); }, REQUEST_TIMEOUT_MS); });
        try { return await Promise.race([Promise.resolve().then(() => fetchJson(url, { signal: controller.signal })), timeout]); }
        finally { clearTimeout(timer); }
      })();
      cache.set(url, pending);
      return pending;
    }
    const projects = new Map();
    async function project(projectId) {
      id(projectId);
      if (!projects.has(projectId)) projects.set(projectId, (async () => {
        const metadata = await json(`${API}/project/${encodeURIComponent(projectId)}`);
        id(metadata?.id);
        kindOf(metadata);
        // API accepts slugs as well as IDs. Every internal requirement uses the canonical ID.
        projects.set(metadata.id, Promise.resolve(metadata));
        return metadata;
      })());
      return projects.get(projectId);
    }
    async function exact(versionId) {
      id(versionId, 'version ID');
      const version = await json(`${API}/version/${encodeURIComponent(versionId)}`);
      if (version?.id !== versionId) throw new Error(`Version ${versionId} could not be resolved exactly.`);
      id(version.project_id);
      if (!version.version_number || typeof version.version_number !== 'string') throw new Error(`Version ${versionId} has no concrete version number.`);
      return version;
    }
    async function versions(metadata) {
      const query = new URLSearchParams({ game_versions: JSON.stringify([config.minecraftVersion]), include_changelog: 'false' });
      if (kindOf(metadata) === 'mod') query.set('loaders', JSON.stringify([config.loader]));
      const values = await json(`${API}/project/${encodeURIComponent(metadata.id)}/version?${query}`);
      if (!Array.isArray(values) || values.length > 10000) throw new Error(`Invalid or oversized version listing for ${metadata.title || metadata.id}.`);
      const candidates = releaseCandidates(values, metadata, config);
      if (kindOf(metadata) === 'shader' && !candidates.length) throw new UnsupportedShaderError(`No verified Iris-compatible shader release for ${metadata.title || metadata.id} on ${config.minecraftVersion} / ${config.loader}. Select an Iris-compatible shader release and its supported engine.`);
      return candidates;
    }
    return { json, project, exact, versions };
  }

  async function verifyShaderRuntime(project, config, ctx) {
    if (!ctx.shaderRuntime) ctx.shaderRuntime = (async () => {
      // Iris publishes Fabric/NeoForge support, and explicitly excludes Forge:
      // https://www.irisshaders.dev/ (FAQ). Other engines are not inferred from names.
      if (!['fabric', 'neoforge'].includes(config.loader)) throw new UnsupportedShaderError(`Shader engine verification is unsupported for ${config.loader}. Select Fabric or NeoForge with the official Iris engine, or remove the shader.`);
      // Resolve the official project identity; a selected mod merely named "Iris" is not evidence.
      const engine = await ctx.project('iris');
      const selected = project.mods.filter(mod => mod?.provider === 'modrinth' && [engine.id, engine.slug].includes(mod.id));
      if (!selected.length) throw new UnsupportedShaderError(`Shader support requires the official Iris engine in this pack. Add Iris from Modrinth for Minecraft ${config.minecraftVersion} / ${config.loader}, or remove the shader.`);
      const pins = [...new Set(selected.map(mod => mod.versionId).filter(Boolean))];
      if (pins.length > 1) throw new UnsupportedShaderError('Conflicting Iris engine version pins. Select one compatible exact Iris version.');
      const version = pins.length ? await ctx.exact(pins[0]) : (await ctx.versions(engine))[0];
      if (kindOf(engine) !== 'mod' || !version || version.project_id !== engine.id || !compatible(version, engine, config)) throw new UnsupportedShaderError(`The selected Iris engine has no verified compatible version for ${config.minecraftVersion} / ${config.loader}. Select a compatible Iris version or remove the shader.`);
      fileEntries(version, engine);
      config.irisVerified = true;
      return engine.id;
    })();
    return ctx.shaderRuntime;
  }

  async function checkUpdates(project) {
    const config = configuration(project), ctx = context(config), entries = [];
    for (const mod of project.mods.filter(entry => !entry?.dependency)) {
      const entry = { key: `${mod?.provider || 'unknown'}:${mod?.id || ''}`, mod: structuredClone(mod), status: 'unavailable', candidate: null, message: '' };
      try { supported(mod); } catch (error) { entry.status = mod?.provider !== 'modrinth' ? 'unsupported' : 'unavailable'; entry.message = error.message; entries.push(entry); continue; }
      try {
        const metadata = await ctx.project(mod.id);
        if (kindOf(metadata) === 'shader') await verifyShaderRuntime(project, config, ctx);
        let baseline;
        if (mod.versionId) {
          baseline = await ctx.exact(mod.versionId);
          if (baseline.project_id !== metadata.id || !compatible(baseline, metadata, config) || !Number.isFinite(published(baseline))) throw new Error('The pinned baseline is unavailable or incompatible with this setup. Select a compatible exact version.');
        }
        const versions = await ctx.versions(metadata);
        const candidate = versions.find(value => !baseline || (value.id !== baseline.id && published(value) > published(baseline)));
        if (candidate) {
          id(candidate.id, 'version ID');
          if (typeof candidate.version_number !== 'string' || !candidate.version_number) throw new Error('Release candidate has no exact version number. Retry the metadata lookup.');
          fileEntries(candidate, metadata);
        }
        if (!baseline) {
          entry.status = 'unpinned'; entry.message = candidate ? 'No current version is pinned. This compatible release can be pinned.' : 'No current version is pinned and no compatible release is available.';
        } else if (candidate) { entry.status = 'update'; entry.message = 'A newer compatible release is available.'; }
        else { entry.status = 'current'; entry.message = 'No newer compatible release was found.'; }
        if (candidate) entry.candidate = concreteMod(mod, metadata, candidate, config);
      } catch (error) { if (error instanceof UnsupportedShaderError) entry.status = 'unsupported'; entry.message = `${mod.title || mod.id}: ${error.message}`; }
      entries.push(entry);
    }
    return entries;
  }

  async function resolveSelection(project, ctx, config) {
    const requirements = new Map();
    function requireProject(map, metadata, pin, rootMod) {
      const previous = map.get(metadata.id);
      if (previous?.pin && pin && previous.pin !== pin) throw new ResolutionError(`Conflicting version pins for ${metadata.title || metadata.id}: ${previous.pin} and ${pin}. Choose matching parent/root versions.`);
      map.set(metadata.id, { metadata, pin: pin || previous?.pin || '', mod: rootMod || previous?.mod || { id: metadata.id, provider: 'modrinth', kind: kindOf(metadata), title: metadata.title, dependency: true } });
      if (map.size > MAX_PROJECTS) throw new Error(`Required dependency limit (${MAX_PROJECTS}) exceeded. Reduce the pack selection.`);
    }
    for (const mod of project.mods) {
      supported(mod);
      const metadata = await ctx.project(mod.id);
      const requestedKind = mod.kind === 'visual' ? 'mod' : mod.kind;
      if (requestedKind && requestedKind !== kindOf(metadata)) throw new Error(`Content type mismatch for ${mod.title || mod.id}. Remove and add the correct Modrinth entry.`);
      requireProject(requirements, metadata, mod.versionId || '', mod);
    }
    let steps = 0;
    async function solve(required, selected, forbidden) {
      if (++steps > MAX_STEPS) throw new Error(`Dependency resolution limit (${MAX_STEPS}) exceeded. Pin the required versions or reduce the pack selection.`);
      for (const [projectId, requirement] of required) {
        if (selected.has(projectId) && requirement.pin && selected.get(projectId).version.id !== requirement.pin) throw new ResolutionError(`Conflicting pin for ${requirement.metadata.title || projectId}: requires ${requirement.pin}, selected ${selected.get(projectId).version.id}.`);
      }
      for (const rule of forbidden) {
        const member = selected.get(rule.projectId);
        if (member && (!rule.pin || member.version.id === rule.pin)) throw new ResolutionError(`Incompatible dependency: ${rule.parent} cannot be installed with ${rule.projectId}${rule.pin ? ` (${rule.pin})` : ''}.`);
      }
      const remaining = [...required].filter(([projectId]) => !selected.has(projectId));
      if (!remaining.length) return selected;
      // Process explicit pins first. This also prevents a derived dependency from replacing a root pin.
      remaining.sort((a, b) => Number(Boolean(b[1].pin)) - Number(Boolean(a[1].pin)));
      const [projectId, requirement] = remaining[0];
      const { metadata, pin } = requirement;
      if (kindOf(metadata) === 'shader') await verifyShaderRuntime(project, config, ctx);
      const candidates = pin ? [await ctx.exact(pin)] : await ctx.versions(metadata);
      if (!candidates.length) throw new ResolutionError(`No compatible release for required project ${metadata.title || projectId}. Pin a compatible version or remove the requiring mod.`);
      let lastFailure;
      for (const version of candidates.slice(0, MAX_CHOICES)) {
        try {
          if (kindOf(metadata) === 'shader' && !version.loaders?.includes('iris')) throw new UnsupportedShaderError(`The pinned shader ${metadata.title || projectId} does not declare Iris engine support. Select an Iris-compatible release or remove the shader.`);
          if (version.project_id !== projectId || !compatible(version, metadata, config)) throw new ResolutionError(`Pinned version ${version.id} for ${metadata.title || projectId} is incompatible with ${config.minecraftVersion} / ${config.loader}.`);
          if (!version.version_number || !idPattern.test(version.id)) throw new Error(`Missing exact version metadata for ${metadata.title || projectId}.`);
          // Validate the actual downloadable file before accepting this version into the closure.
          fileEntries(version, metadata);
          if (!Array.isArray(version.dependencies)) throw new Error(`Unresolved dependency metadata for ${metadata.title || projectId}.`);
          const nextRequired = new Map(required), nextSelected = new Map(selected), nextForbidden = [...forbidden];
          nextSelected.set(projectId, { metadata, version, mod: requirement.mod });
          for (const dependency of version.dependencies) {
            if (!['required', 'incompatible', 'optional', 'embedded'].includes(dependency.dependency_type)) throw new Error(`Unresolved dependency type for ${metadata.title || projectId}.`);
            if (!['required', 'incompatible'].includes(dependency.dependency_type)) continue;
            let dependencyId = dependency.project_id;
            const dependencyPin = dependency.version_id;
            if (dependencyPin) {
              const fixed = await ctx.exact(dependencyPin);
              if (dependencyId && fixed.project_id !== dependencyId) throw new ResolutionError(`Conflicting dependency project/version reference in ${metadata.title || projectId}.`);
              dependencyId = fixed.project_id;
            }
            if (!dependencyId) throw new Error(`Unresolved required dependency ${dependency.file_name || '(no project/version ID)'} of ${metadata.title || projectId}. Add a resolvable release.`);
            if (dependency.dependency_type === 'incompatible') {
              id(dependencyId); nextForbidden.push({ projectId: dependencyId, pin: dependencyPin || '', parent: metadata.title || projectId });
            } else {
              const dependencyProject = await ctx.project(dependencyId);
              requireProject(nextRequired, dependencyProject, dependencyPin || '');
            }
          }
          return await solve(nextRequired, nextSelected, nextForbidden);
        } catch (error) {
          if (!(error instanceof ResolutionError)) throw error;
          lastFailure = error;
        }
      }
      if (candidates.length > MAX_CHOICES) throw new Error(`Dependency selection limit (${MAX_CHOICES} versions for ${metadata.title || projectId}). Pin a compatible version. Last conflict: ${lastFailure?.message || ''}`);
      throw lastFailure || new ResolutionError(`Required dependency could not be resolved for ${metadata.title || projectId}.`);
    }
    return solve(requirements, new Map(), []);
  }

  async function prepareExport(project) {
    const config = configuration(project);
    // Fail unsupported selections before contacting any provider, even if another member is valid.
    for (const mod of project.mods) supported(mod);
    const ctx = context(config);
    const selected = await resolveSelection(project, ctx, config);
    const loader = await resolveLoader(project, config, ctx);
    const files = [], paths = new Set();
    for (const value of selected.values()) {
      for (const entry of fileEntries(value.version, value.metadata)) {
        const key = entry.path.normalize('NFC').toLowerCase();
        if (paths.has(key)) throw new Error(`File path collision: ${entry.path}. Choose mod versions with distinct filenames.`);
        paths.add(key); files.push(entry);
      }
    }
    const manifest = { formatVersion: 1, game: 'minecraft', versionId: crypto.randomUUID(), name: String(project.name || 'Modspire Pack').slice(0, 256), files, dependencies: { minecraft: config.minecraftVersion, [loader.key]: loader.version } };
    if (project.summary) manifest.summary = String(project.summary).slice(0, 2048);
    const content = Buffer.from(JSON.stringify(manifest, null, 2), 'utf8');
    if (content.length > 8 * 1024 * 1024) throw new Error('Pack metadata exceeds the supported file size limit.');
    return { buffer: zipIndex(content), manifest };
  }
  return { checkUpdates, prepareExport };
}

function safeFileName(filename) {
  if (typeof filename !== 'string' || !filename || Buffer.byteLength(filename, 'utf8') > 240 || /[<>:"/\\|?*\x00-\x1f\x7f]/.test(filename) || filename === '.' || filename.includes('..') || /[. ]$/.test(filename) || /^(?:CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(?:\.|$)/i.test(filename)) throw new Error(`Unsafe file path/filename: ${String(filename).slice(0, 100)}.`);
  return filename;
}
function downloadUrl(value) {
  let url;
  try { url = new URL(value); } catch { throw new Error('Invalid download URL for release file.'); }
  if (typeof value !== 'string' || /[^A-Za-z0-9\-._~:/?#\[\]@!$&'()*+,;=%]/.test(value) || /%(?![a-fA-F0-9]{2})/.test(value) || url.protocol !== 'https:' || !DOWNLOAD_HOSTS.has(url.hostname) || url.username || url.password || url.port || url.hash) throw new Error(`Unsafe or unapproved HTTPS download URL for release file: ${url.hostname}.`);
  return url.href;
}
function environment(version, project) {
  const mapping = {
    client_and_server: ['required', 'required'], client_only: ['required', 'unsupported'], client_only_server_optional: ['required', 'optional'], singleplayer_only: ['required', 'unsupported'],
    // mrpack sides are physical: server_only can also run in a client's singleplayer server.
    server_only: ['optional', 'required'], server_only_client_optional: ['optional', 'required'], dedicated_server_only: ['unsupported', 'required'], client_or_server: ['optional', 'optional'], client_or_server_prefers_both: ['optional', 'optional'],
  };
  if (typeof version.environment === 'string' && mapping[version.environment]) {
    const [client, server] = mapping[version.environment]; return { client, server };
  }
  const values = new Set(['required', 'optional', 'unsupported']);
  if (!values.has(project.client_side) || !values.has(project.server_side) || (project.client_side === 'unsupported' && project.server_side === 'unsupported')) throw new Error(`Unknown client/server environment for ${project.title || project.id}. Cannot safely export this file.`);
  return { client: project.client_side, server: project.server_side };
}
function fileEntries(version, project) {
  const kind = kindOf(project), extension = kind === 'mod' ? /\.jar$/i : /\.zip$/i;
  if (!Array.isArray(version.files) || !version.files.length) throw new Error(`Missing release files for ${project.title || project.id}.`);
  const installable = version.files.filter(file => !file.file_type || file.file_type === 'unknown');
  const main = installable.find(file => file.primary) || installable.find(file => extension.test(file.filename));
  if (!main || !extension.test(main.filename)) throw new Error(`Missing installable ${kind} file for ${project.title || project.id}.`);
  const assets = [main, ...version.files.filter(file => file !== main && file.file_type === 'required-resource-pack')];
  return assets.map(file => {
    const filename = safeFileName(file.filename);
    const directory = file.file_type === 'required-resource-pack' || kind === 'resourcepack' ? 'resourcepacks' : kind === 'shader' ? 'shaderpacks' : 'mods';
    if (directory === 'resourcepacks' && !/\.zip$/i.test(filename)) throw new Error(`Invalid required resource pack file: ${filename}.`);
    if (!/^[a-fA-F0-9]{40}$/.test(file.hashes?.sha1 || '') || !/^[a-fA-F0-9]{128}$/.test(file.hashes?.sha512 || '')) throw new Error(`Missing or invalid SHA1/SHA512 file hashes for ${filename}.`);
    if (!Number.isSafeInteger(file.size) || file.size <= 0) throw new Error(`Invalid release file size for ${filename}.`);
    return { path: `${directory}/${filename}`, hashes: { sha1: file.hashes.sha1.toLowerCase(), sha512: file.hashes.sha512.toLowerCase() }, env: file.file_type === 'required-resource-pack' ? { client: 'required', server: 'unsupported' } : environment(version, project), downloads: [downloadUrl(file.url)], fileSize: file.size };
  });
}

async function resolveLoader(project, config, ctx) {
  const override = project.loaderVersion === '' ? undefined : project.loaderVersion;
  if (override != null && (typeof override !== 'string' || !loaderPattern.test(override))) throw new Error('Invalid exact loaderVersion. Enter a published loader version number.');
  let versions = [], automatic, key = config.loader;
  if (['fabric', 'quilt'].includes(config.loader)) {
    key = `${config.loader}-loader`;
    const host = config.loader === 'fabric' ? 'https://meta.fabricmc.net/v2' : 'https://meta.quiltmc.org/v3';
    const values = await ctx.json(`${host}/versions/loader/${encodeURIComponent(config.minecraftVersion)}`);
    if (!Array.isArray(values)) throw new Error('Invalid loader metadata. Retry or choose another loader.');
    versions = values.map(entry => entry.loader?.version).filter(value => typeof value === 'string' && loaderPattern.test(value));
    automatic = values.filter(entry => entry.loader?.stable !== false && loaderPattern.test(entry.loader?.version || '') && !/-/.test(entry.loader.version)).map(entry => entry.loader.version).sort(numericVersionOrder)[0];
  } else if (config.loader === 'forge') {
    const metadata = await ctx.json('https://files.minecraftforge.net/net/minecraftforge/forge/maven-metadata.json');
    const prefix = `${config.minecraftVersion}-`;
    versions = (Array.isArray(metadata?.[config.minecraftVersion]) ? metadata[config.minecraftVersion] : []).filter(value => typeof value === 'string' && value.startsWith(prefix)).map(value => value.slice(prefix.length)).filter(value => loaderPattern.test(value));
    if (!override) {
      const promotions = await ctx.json('https://files.minecraftforge.net/net/minecraftforge/forge/promotions_slim.json');
      const promoted = promotions?.promos?.[`${config.minecraftVersion}-recommended`] || promotions?.promos?.[`${config.minecraftVersion}-latest`];
      automatic = versions.includes(promoted) ? promoted : [...versions].sort(numericVersionOrder)[0];
    }
  } else if (config.loader === 'neoforge') {
    // NeoForge 20.2+ versions encode the Minecraft minor/patch (1.21.1 -> 21.1.*).
    // Pre-20.2 used the legacy Forge artifact; never guess a modern loader for those games.
    const match = /^1\.(\d+)(?:\.(\d+))?$/.exec(config.minecraftVersion);
    const patch = Number(match?.[2] || 0);
    if (!match || Number(match[1]) < 20 || (Number(match[1]) === 20 && patch < 2)) throw new Error(`Automatic NeoForge loader resolution does not support Minecraft ${config.minecraftVersion}. Select Minecraft 1.20.2 or newer in the 1.x version series.`);
    const metadata = await ctx.json('https://maven.neoforged.net/api/maven/versions/releases/net/neoforged/neoforge');
    const prefix = `${Number(match[1])}.${patch}.`;
    versions = (Array.isArray(metadata?.versions) ? metadata.versions : []).filter(value => typeof value === 'string' && value.startsWith(prefix) && loaderPattern.test(value));
    automatic = versions.filter(value => !/-/.test(value)).sort(numericVersionOrder)[0];
  }
  const version = override || automatic;
  if (!version || !versions.includes(version)) throw new Error(`No verified ${config.loader} loader ${override || 'release'} is available for Minecraft ${config.minecraftVersion}. Check loaderVersion or select another setup.`);
  return { key, version };
}
function numericVersionOrder(a, b) {
  const left = a.split(/[.+-]/), right = b.split(/[.+-]/);
  for (let index = 0; index < Math.max(left.length, right.length); index++) { const delta = Number(right[index] || 0) - Number(left[index] || 0); if (delta) return delta; }
  return b.localeCompare(a);
}
function zipIndex(content) {
  const name = Buffer.from('modrinth.index.json'), compressed = zlib.deflateRawSync(content);
  let crc = 0xffffffff;
  for (const byte of content) { crc ^= byte; for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0); }
  crc = (crc ^ 0xffffffff) >>> 0;
  const local = Buffer.alloc(30), central = Buffer.alloc(46), end = Buffer.alloc(22);
  local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(20, 4); local.writeUInt16LE(0x800, 6); local.writeUInt16LE(8, 8); local.writeUInt16LE(33, 12);
  local.writeUInt32LE(crc, 14); local.writeUInt32LE(compressed.length, 18); local.writeUInt32LE(content.length, 22); local.writeUInt16LE(name.length, 26);
  central.writeUInt32LE(0x02014b50, 0); central.writeUInt16LE(20, 4); central.writeUInt16LE(20, 6); central.writeUInt16LE(0x800, 8); central.writeUInt16LE(8, 10); central.writeUInt16LE(33, 14);
  central.writeUInt32LE(crc, 16); central.writeUInt32LE(compressed.length, 20); central.writeUInt32LE(content.length, 24); central.writeUInt16LE(name.length, 28);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(1, 8); end.writeUInt16LE(1, 10); end.writeUInt32LE(central.length + name.length, 12); end.writeUInt32LE(local.length + name.length + compressed.length, 16);
  return Buffer.concat([local, name, compressed, central, name, end]);
}

module.exports = { createPackReleaseService };
