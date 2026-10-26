const MODEL_SIZE_LIMIT = 512 * 1024;
const MAX_MODEL_ELEMENTS = 128;
const FACE_NAMES = new Set(['north', 'south', 'east', 'west', 'up', 'down']);
const CULL_FACES = FACE_NAMES;

export function validateJavaBlockModel(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Das Blockbench-Modell muss ein Java-Block/Item-JSON-Objekt sein.');
  let serialized;
  try { serialized = JSON.stringify(value); } catch { throw new Error('Das Blockbench-Modell enthält ungültige Daten.'); }
  if (Buffer.byteLength(serialized, 'utf8') > MODEL_SIZE_LIMIT) throw new Error('Das Blockbench-Modell ist größer als 512 KB.');
  const model = parseSafeJson(serialized);
  if (model.elements !== undefined && (!Array.isArray(model.elements) || model.elements.length > MAX_MODEL_ELEMENTS)) {
    throw new Error('Blockbench-Modelle dürfen höchstens 128 Cubes enthalten.');
  }
  if (!model.elements?.length && typeof model.parent !== 'string') throw new Error('Das JSON enthält weder Modell-Cubes noch ein Minecraft-Modell als Parent.');
  if (model.parent !== undefined && !validResourceLocation(model.parent)) throw new Error('Ungültiger Minecraft-Modell-Parent.');
  if (model.textures !== undefined) {
    if (!model.textures || typeof model.textures !== 'object' || Array.isArray(model.textures)) throw new Error('Ungültige Blockbench-Texturen.');
    for (const [key, path] of Object.entries(model.textures)) {
      if (!/^[a-z0-9_.-]{1,64}$/.test(key) || typeof path !== 'string' || (!path.startsWith('#') && !validResourceLocation(path))) throw new Error('Ungültige Blockbench-Texturkennung.');
    }
  }
  for (const element of model.elements || []) validateCube(element);
  const textureKeys = new Set(Object.keys(model.textures || {}));
  for (const element of model.elements || []) for (const face of Object.values(element.faces)) {
    if (face.texture.startsWith('#') && !textureKeys.has(face.texture.slice(1))) throw new Error('Eine Blockbench-Seite verweist auf eine nicht vorhandene Textur.');
  }
  return model;
}

export function preserveBlockbenchModels(candidate, current) {
  if (!Array.isArray(candidate?.elements) || !Array.isArray(current?.elements)) return candidate;
  const existing = new Map(current.elements.filter((element) => element.javaModel).map((element) => [element.id, element.javaModel]));
  candidate.elements = candidate.elements.map((element) => element && !Object.hasOwn(element, 'javaModel') && existing.has(element.id)
    ? { ...element, javaModel: existing.get(element.id) }
    : element);
  return candidate;
}

export function rewriteJavaModelTextures(value, texturePath) {
  const model = structuredClone(validateJavaBlockModel(value));
  const textures = model.textures || {};
  const textureKeys = Object.keys(textures);
  if (!textureKeys.length) textures.all = texturePath;
  else for (const key of textureKeys) {
    if (!textures[key].startsWith('#')) textures[key] = texturePath;
  }
  model.textures = textures;
  for (const element of model.elements || []) {
    for (const face of Object.values(element.faces || {})) {
      if (typeof face.texture === 'string' && !face.texture.startsWith('#')) face.texture = texturePath;
    }
  }
  return model;
}

function validateCube(element) {
  if (!element || typeof element !== 'object' || Array.isArray(element)) throw new Error('Ungültiger Cube im Blockbench-Modell.');
  validateVector(element.from, 'Cube-Start');
  validateVector(element.to, 'Cube-Ende');
  if (element.from.some((value, index) => value >= element.to[index])) throw new Error('Jeder Blockbench-Cube muss ein Volumen größer als null haben.');
  if (!element.faces || typeof element.faces !== 'object' || Array.isArray(element.faces)) throw new Error('Blockbench-Cube ohne Seitenflächen.');
  const faces = Object.entries(element.faces);
  if (!faces.length || faces.length > 6) throw new Error('Ungültige Seitenflächen im Blockbench-Cube.');
  for (const [name, face] of faces) {
    if (!FACE_NAMES.has(name) || !face || typeof face !== 'object' || Array.isArray(face)) throw new Error('Ungültige Seite im Blockbench-Cube.');
    if (typeof face.texture !== 'string' || (!face.texture.startsWith('#') && !validResourceLocation(face.texture))) throw new Error('Blockbench-Seiten müssen auf eine Textur verweisen.');
    if (face.uv !== undefined && (!Array.isArray(face.uv) || face.uv.length !== 4 || face.uv.some((number) => !Number.isFinite(number) || Math.abs(number) > 4096))) throw new Error('Ungültige UV-Koordinaten im Blockbench-Cube.');
    if (face.rotation !== undefined && ![0, 90, 180, 270].includes(face.rotation)) throw new Error('Ungültige UV-Drehung im Blockbench-Cube.');
    if (face.cullface !== undefined && !CULL_FACES.has(face.cullface)) throw new Error('Ungültige Cull-Seite im Blockbench-Cube.');
  }
  if (element.rotation !== undefined) {
    const { origin, axis, angle } = element.rotation || {};
    validateVector(origin, 'Rotationsursprung');
    if (!['x', 'y', 'z'].includes(axis) || !Number.isFinite(angle) || Math.abs(angle) > 45 || Math.round(angle * 10) % 225 !== 0) throw new Error('Die Cube-Rotation ist für Minecraft Java nicht gültig.');
  }
}

function validateVector(value, label) {
  if (!Array.isArray(value) || value.length !== 3 || value.some((number) => !Number.isFinite(number) || number < -64 || number > 64)) throw new Error(`${label} muss aus drei Zahlen zwischen −64 und 64 bestehen.`);
}

function validResourceLocation(value) {
  return typeof value === 'string' && /^(?:[a-z0-9_.-]+:)?[a-z0-9_./-]{1,256}$/.test(value);
}

function parseSafeJson(serialized) {
  const model = JSON.parse(serialized);
  const visit = (value, depth = 0) => {
    if (depth > 24) throw new Error('Das Blockbench-Modell ist zu tief verschachtelt.');
    if (Array.isArray(value)) {
      if (value.length > 4096) throw new Error('Das Blockbench-Modell enthält zu große Listen.');
      value.forEach((item) => visit(item, depth + 1));
    } else if (value && typeof value === 'object') {
      for (const [key, item] of Object.entries(value)) {
        if (['__proto__', 'prototype', 'constructor'].includes(key)) throw new Error('Das Blockbench-Modell enthält ein ungültiges Feld.');
        visit(item, depth + 1);
      }
    }
  };
  visit(model);
  return model;
}

