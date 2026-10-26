const zlib = require('node:zlib');

// Primary format/API references (verified 2026-10-19):
// https://support.curseforge.com/support/solutions/articles/9000198500-exporting-a-modpack-for-curseforge-project-submission
// https://support.curseforge.com/support/solutions/articles/9000210425-curseforge-file-processor-rejections-and-how-to-solve-them
// https://docs.curseforge.com/rest-api/ (File, FileDependency, FileStatus, Get Mod Files).
const API = 'https://api.curseforge.com/v1';
const MAX_PROJECTS = 500, MAX_REQUESTS = 2500, MAX_PAGES = 50, MAX_FILES = 10000;
const REQUEST_TIMEOUT = 20000, TOTAL_TIMEOUT = 120000;
const LOADERS = { fabric: { key: 'fabric-loader', label: 'Fabric', type: 4 }, forge: { key: 'forge', label: 'Forge', type: 1 } };
function numericId(value, label = 'project ID') {
  if (typeof value !== 'string' || !/^[1-9]\d{0,15}$/.test(value) || !Number.isSafeInteger(Number(value))) throw new Error(`Invalid CurseForge ${label}. Select a positive numeric safe-integer ID.`);
  return value;
}
function apiId(value, label) {
  if (!Number.isSafeInteger(value) || value <= 0) throw new Error(`Invalid CurseForge ${label} in API metadata.`);
  return String(value);
}
function validateProject(project) {
  if (!project || !Array.isArray(project.mods) || !project.mods.length) throw new Error('Select at least one CurseForge mod before exporting; the selection is empty.');
  if (project.mods.length > MAX_PROJECTS) throw new Error(`CurseForge export limit: select at most ${MAX_PROJECTS} entries.`);
  if (!/^\d+(?:\.\d+){1,3}$/.test(project.minecraftVersion || '')) throw new Error('Select an exact supported Minecraft version for CurseForge export.');
  const loader = LOADERS[project.loader];
  if (!loader) throw new Error('Unsupported CurseForge export loader. Select Fabric or Forge; use project JSON for other loaders.');
  const pins = new Map(), roots = new Set();
  for (const entry of project.mods) {
    if (entry?.provider !== 'curseforge') throw new Error('CurseForge ZIP requires CurseForge-only entries. Mixed or unknown providers are unsupported; split the pack or export project JSON.');
    if (!['mod', 'visual'].includes(entry.kind)) throw new Error(`Unsupported CurseForge content kind ${entry.kind || 'unknown'}. Select mods only, or export project JSON.`);
    const id = numericId(entry.id); roots.add(id);
    if (entry.versionId !== undefined && entry.versionId !== null) {
      const pin = numericId(entry.versionId, 'file ID');
      if (pins.has(id) && pins.get(id) !== pin) throw new Error(`Conflicting exact CurseForge file pins for project ${id}. Select one version.`);
      pins.set(id, pin);
    }
  }
  return { loader, pins, roots };
}
function compatible(file, project, loader) {
  return Array.isArray(file?.gameVersions) && file.gameVersions.includes(project.minecraftVersion) && file.gameVersions.includes(loader.label);
}
function approved(file) { return file?.isAvailable === true && file.fileStatus === 4; }

function createCurseForgeExportService({ fetchJson, resolveLoader } = {}) {
  if (typeof fetchJson !== 'function' || typeof resolveLoader !== 'function') throw new TypeError('fetchJson and a verified resolveLoader callback are required.');
  async function prepareExport(project) {
    const { loader, pins, roots } = validateProject(project);
    const deadline = Date.now() + TOTAL_TIMEOUT, cache = new Map(); let requests = 0;
    function budget() { if (Date.now() >= deadline) throw new Error('CurseForge export time limit exceeded. Split this pack into smaller selections and retry.'); }
    async function bounded(operation, label) {
      budget(); const controller = new AbortController(); let timer;
      const timeout = new Promise((_, reject) => { timer = setTimeout(() => { controller.abort(); reject(new Error(`${label} timed out. Retry the export.`)); }, Math.min(REQUEST_TIMEOUT, Math.max(1, deadline - Date.now()))); });
      try { return await Promise.race([Promise.resolve().then(() => operation(controller.signal)), timeout]); }
      finally { clearTimeout(timer); }
    }
    async function json(path) {
      budget(); const url = `${API}${path}`;
      if (!cache.has(url)) {
        if (++requests > MAX_REQUESTS) throw new Error('CurseForge metadata request limit exceeded. Split this pack into smaller selections.');
        cache.set(url, bounded(signal => fetchJson(url, { signal }), 'CurseForge metadata request').catch(error => {
          if ([401, 403].includes(Number(error.status || error.statusCode)) || /unauthorized|forbidden|API.key|authentication|\b40[13]\b/i.test(error.message || '')) throw new Error('CurseForge authentication/access failed. Add a valid CurseForge API key in Settings and check project distribution access.');
          throw new Error(`CurseForge metadata lookup failed: ${error.message || 'network unavailable'}. Check the API key and connection, then retry.`);
        }));
      }
      return cache.get(url);
    }
    // Callback is injected by main and already verifies this concrete loader against its upstream metadata.
    const dependencies = await bounded(() => resolveLoader(project), 'Loader verification');
    const concrete = dependencies?.[loader.key];
    if (dependencies?.minecraft !== project.minecraftVersion || typeof concrete !== 'string' || !/^\d+(?:\.\d+){1,4}(?:[-+][A-Za-z0-9.]+)?$/.test(concrete)) throw new Error('No verified concrete loader version for this Minecraft setup. Select a supported loader version and retry.');
    const otherLoaders = ['fabric-loader', 'forge', 'neoforge', 'quilt-loader'].filter(key => key !== loader.key && dependencies[key]);
    if (otherLoaders.length) throw new Error('Conflicting loader verification metadata. Select one supported loader.');
    const selected = new Map(), exclusions = new Map(), queue = [...roots];
    const queued = new Set(queue);
    async function metadata(id) {
      const data = (await json(`/mods/${id}`))?.data;
      if (apiId(data?.id, 'project ID') !== id) throw new Error(`CurseForge project ${id} resolved to the wrong project.`);
      if (data.gameId !== 432) throw new Error(`Project ${id} is not a Minecraft project.`);
      if (data.classId !== 6) throw new Error(`Unsupported CurseForge project kind for ${id}; only Minecraft mods can be exported.`);
      if (data.isAvailable !== true) throw new Error(`CurseForge project ${id} is unavailable. Remove or replace it.`);
      if (data.allowModDistribution === false) throw new Error(`CurseForge project ${id} blocks third-party distribution. Use the official CurseForge app or replace it; Modspire cannot export it.`);
      return data;
    }
    function verify(file, id, pin) {
      if (!file || apiId(file.id, 'file ID') !== (pin || String(file.id)) || apiId(file.modId, 'file project ID') !== id || file.gameId !== 432) throw new Error(`Exact CurseForge file ${pin || '?'} is missing or belongs to the wrong project/Minecraft game (${id}).`);
      if (!compatible(file, project, loader)) throw new Error(`CurseForge file ${file.id} lacks compatible Minecraft ${project.minecraftVersion} / ${loader.label} evidence. Select a compatible exact file.`);
      if (!approved(file)) throw new Error(`CurseForge file ${file.id} is unavailable or not approved. Select an available approved file.`);
      if (!Array.isArray(file.dependencies) || file.dependencies.length > MAX_PROJECTS) throw new Error(`Invalid or oversized CurseForge dependency metadata for file ${file.id}.`);
      return file;
    }
    async function latest(id) {
      const files = []; let index = 0;
      for (let page = 0; page < MAX_PAGES; page++) {
        const query = new URLSearchParams({ gameVersion: project.minecraftVersion, modLoaderType: String(loader.type), pageSize: '50', index: String(index) });
        const response = await json(`/mods/${id}/files?${query}`), values = response?.data, pagination = response?.pagination;
        if (!Array.isArray(values) || values.length > 50 || !pagination || pagination.index !== index || pagination.resultCount !== values.length || !Number.isSafeInteger(pagination.totalCount) || pagination.totalCount < index + values.length) throw new Error(`Invalid CurseForge file pagination for project ${id}. Retry the lookup.`);
        if (pagination.totalCount > MAX_FILES) throw new Error(`CurseForge file listing limit exceeded for ${id}. Pin one exact file to narrow the lookup.`);
        for (const value of values) {
          if (apiId(value?.modId, 'file project ID') !== id || value.gameId !== 432) throw new Error(`CurseForge file listing contains a wrong project/Minecraft game for ${id}.`);
          apiId(value.id, 'file ID');
          if (value.releaseType === 1 && approved(value) && compatible(value, project, loader) && Number.isFinite(Date.parse(value.fileDate))) files.push(value);
        }
        index += values.length;
        if (index >= pagination.totalCount) {
          files.sort((a, b) => Date.parse(b.fileDate) - Date.parse(a.fileDate) || b.id - a.id);
          if (!files.length) throw new Error(`No available approved stable CurseForge file compatible with Minecraft ${project.minecraftVersion} / ${loader.label} for project ${id}. Pin a supported file or replace it.`);
          return verify(files[0], id);
        }
        if (!values.length) throw new Error(`Incomplete CurseForge file listing for ${id}. Pin an exact file and retry.`);
      }
      throw new Error(`CurseForge pagination limit exceeded for ${id}. Pin an exact file to narrow the lookup.`);
    }
    // Iterative traversal avoids stack growth; roots/pins are collected before any dependency is chosen.
    for (let cursor = 0; cursor < queue.length; cursor++) {
      budget(); const id = queue[cursor]; await metadata(id);
      const pin = pins.get(id), file = pin ? verify((await json(`/mods/${id}/files/${pin}`))?.data, id, pin) : await latest(id);
      selected.set(id, file);
      for (const dependency of file.dependencies) {
        const target = apiId(dependency?.modId, 'dependency project ID');
        if (![1, 2, 3, 4, 5, 6].includes(dependency.relationType)) throw new Error(`Unknown CurseForge dependency relation for project ${id}.`);
        if (dependency.relationType === 5) {
          if (!exclusions.has(id)) exclusions.set(id, new Set());
          exclusions.get(id).add(target);
        }
        if (dependency.relationType === 3 && !queued.has(target)) {
          if (queued.size >= MAX_PROJECTS) throw new Error(`CurseForge dependency traversal limit (${MAX_PROJECTS}) exceeded. Split the pack.`);
          queued.add(target); queue.push(target);
        }
      }
    }
    for (const [source, targets] of exclusions) for (const target of targets) if (selected.has(target)) throw new Error(`Incompatible CurseForge projects ${source} and ${target}. Remove one conflicting mod and export again.`);
    const manifest = {
      minecraft: { version: project.minecraftVersion, modLoaders: [{ id: `${project.loader}-${concrete}`, primary: true }] },
      manifestType: 'minecraftModpack', manifestVersion: 1,
      name: String(project.name || 'Modspire pack').slice(0, 200), version: String(project.version || project.versionNumber || '1.0.0').slice(0, 100), author: 'LvisXVI',
      files: [...selected].sort(([a], [b]) => Number(a) - Number(b)).map(([id, file]) => ({ projectID: Number(id), fileID: file.id, required: true })), overrides: 'overrides'
    };
    return { buffer: zipManifest(Buffer.from(JSON.stringify(manifest, null, 2))), manifest };
  }
  return { prepareExport };
}

function zipManifest(content) {
  const locals = [], centrals = []; let offset = 0;
  for (const [path, bytes] of [['manifest.json', content], ['overrides/', Buffer.alloc(0)]]) {
    const name = Buffer.from(path), compressed = zlib.deflateRawSync(bytes); let crc = 0xffffffff;
    for (const byte of bytes) { crc ^= byte; for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0); }
    crc = (crc ^ 0xffffffff) >>> 0;
    const local = Buffer.alloc(30), central = Buffer.alloc(46);
    local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(20, 4); local.writeUInt16LE(0x800, 6); local.writeUInt16LE(8, 8); local.writeUInt16LE(33, 12);
    local.writeUInt32LE(crc, 14); local.writeUInt32LE(compressed.length, 18); local.writeUInt32LE(bytes.length, 22); local.writeUInt16LE(name.length, 26);
    central.writeUInt32LE(0x02014b50, 0); central.writeUInt16LE(20, 4); central.writeUInt16LE(20, 6); central.writeUInt16LE(0x800, 8); central.writeUInt16LE(8, 10); central.writeUInt16LE(33, 14);
    central.writeUInt32LE(crc, 16); central.writeUInt32LE(compressed.length, 20); central.writeUInt32LE(bytes.length, 24); central.writeUInt16LE(name.length, 28); central.writeUInt32LE(offset, 42);
    if (path.endsWith('/')) central.writeUInt32LE(0x10, 38);
    const entry = Buffer.concat([local, name, compressed]); locals.push(entry); centrals.push(central, name); offset += entry.length;
  }
  const directory = Buffer.concat(centrals), end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(2, 8); end.writeUInt16LE(2, 10); end.writeUInt32LE(directory.length, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, directory, end]);
}
module.exports = { createCurseForgeExportService };
