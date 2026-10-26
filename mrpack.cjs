const zlib = require('node:zlib');

const MAX_INDEX_BYTES = 8 * 1024 * 1024;

function readIndex(archive) {
  const buffer = Buffer.isBuffer(archive) ? archive : Buffer.from(archive);
  const start = Math.max(0, buffer.length - 65_557);
  let eocd = -1;
  for (let offset = buffer.length - 22; offset >= start; offset--) {
    if (buffer.readUInt32LE(offset) === 0x06054b50 && offset + 22 + buffer.readUInt16LE(offset + 20) === buffer.length) { eocd = offset; break; }
  }
  if (eocd < 0 || eocd + 22 > buffer.length) throw new Error('Die Datei ist kein gültiges Modrinth-.mrpack-Archiv.');
  const entries = buffer.readUInt16LE(eocd + 10);
  let cursor = buffer.readUInt32LE(eocd + 16);
  for (let index = 0; index < entries; index++) {
    if (cursor + 46 > buffer.length || buffer.readUInt32LE(cursor) !== 0x02014b50) throw new Error('Das Modpack-Archiv ist beschädigt.');
    const method = buffer.readUInt16LE(cursor + 10);
    const flags = buffer.readUInt16LE(cursor + 8);
    const compressedSize = buffer.readUInt32LE(cursor + 20);
    const size = buffer.readUInt32LE(cursor + 24);
    const nameLength = buffer.readUInt16LE(cursor + 28);
    const extraLength = buffer.readUInt16LE(cursor + 30);
    const commentLength = buffer.readUInt16LE(cursor + 32);
    const localOffset = buffer.readUInt32LE(cursor + 42);
    const name = buffer.subarray(cursor + 46, cursor + 46 + nameLength).toString('utf8');
    if (name === 'modrinth.index.json') {
      if (size > MAX_INDEX_BYTES) throw new Error('Die Modpack-Metadaten sind ungewöhnlich groß.');
      if ((flags & 1) !== 0) throw new Error('Verschlüsselte Modpack-Archive können nicht importiert werden.');
      if (localOffset + 30 > buffer.length || buffer.readUInt32LE(localOffset) !== 0x04034b50) throw new Error('Der Modpack-Index ist beschädigt.');
      const localNameLength = buffer.readUInt16LE(localOffset + 26);
      const localExtraLength = buffer.readUInt16LE(localOffset + 28);
      const dataOffset = localOffset + 30 + localNameLength + localExtraLength;
      if (dataOffset + compressedSize > buffer.length) throw new Error('Der Modpack-Index ist unvollständig.');
      const data = buffer.subarray(dataOffset, dataOffset + compressedSize);
      const raw = method === 0 ? data : method === 8 ? zlib.inflateRawSync(data, { maxOutputLength: MAX_INDEX_BYTES }) : null;
      if (!raw) throw new Error(`Das Kompressionsformat ${method} wird nicht unterstützt.`);
      if (raw.length > MAX_INDEX_BYTES) throw new Error('Die Modpack-Metadaten sind ungewöhnlich groß.');
      const manifest = JSON.parse(raw.toString('utf8'));
      if (manifest.formatVersion !== 1 || manifest.game !== 'minecraft' || !Array.isArray(manifest.files)) throw new Error('Die Modrinth-Packdatei enthält keinen gültigen Minecraft-Index.');
      return manifest;
    }
    cursor += 46 + nameLength + extraLength + commentLength;
  }
  throw new Error('In der Datei fehlt modrinth.index.json. Bitte eine .mrpack-Datei verwenden.');
}

function modEntries(manifest, { includePackContent = false } = {}) {
  return manifest.files.filter(file => {
    const normalized = String(file?.path || '').replace(/\\/g, '/');
    return includePackContent
      ? /^(?:mods\/.+\.jar|(?:resourcepacks|shaderpacks)\/.+\.zip)$/i.test(normalized)
      : /^mods\/.+\.jar$/i.test(normalized) && file?.env?.client !== 'unsupported';
  }).map(file => {
    const filename = String(file.path).replace(/\\/g, '/').split('/').pop();
    const references = (Array.isArray(file.downloads) ? file.downloads : []).map(url => {
      try {
        const parsed = new URL(url);
        const match = parsed.pathname.match(/\/data\/([A-Za-z0-9_-]+)(?:\/versions\/([A-Za-z0-9_-]+))?/);
        return match ? { projectId: match[1], versionId: match[2] || '' } : null;
      } catch { return null; }
    }).filter(Boolean);
    return { filename, ...references[0], hashes: file.hashes, url: file.downloads?.[0] || '' };
  });
}

function loaderFromDependencies(dependencies = {}) {
  const key = Object.keys(dependencies).find(value => ['fabric-loader', 'forge', 'neoforge', 'quilt-loader'].includes(value));
  return ({ 'fabric-loader': 'fabric', forge: 'forge', neoforge: 'neoforge', 'quilt-loader': 'quilt' })[key] || 'fabric';
}

module.exports = { readIndex, modEntries, loaderFromDependencies };
