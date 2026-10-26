import { randomUUID } from 'node:crypto';
import { validateJavaBlockModel } from './blockbench.js';

export const PROJECT_SCHEMA_VERSION = 1;
export const MAX_PROJECT_ELEMENTS = 80;
export const TEXTURE_SIZE = 16;
const idPattern = /^[a-z0-9][a-z0-9_.-]{1,47}$/;
const elementKinds = new Set(['item', 'block']);

export function makeProject(input = {}) {
  const now = new Date().toISOString();
  const name = cleanText(input.name, 72) || 'Neues Mod-Projekt';
  const namespace = normalizeNamespace(input.namespace || name);
  return validateProject({
    schemaVersion: PROJECT_SCHEMA_VERSION,
    id: randomUUID(),
    name,
    namespace,
    description: cleanText(input.description, 1000),
    target: {
      edition: 'java',
      loader: input.target?.loader || 'fabric',
      minecraftVersion: cleanText(input.target?.minecraftVersion, 32),
    },
    elements: [],
    activeElementId: null,
    sourceOverrides: {},
    conversation: [],
    timeSpentMs: 0,
    createdAt: now,
    updatedAt: now,
  });
}

export function makeElement(kind = 'item', count = 0) {
  const normalizedKind = elementKinds.has(kind) ? kind : 'item';
  const label = normalizedKind === 'block' ? 'Neuer Block' : 'Neues Item';
  const slug = normalizedKind === 'block' ? 'new_block' : 'new_item';
  return {
    id: randomUUID(),
    kind: normalizedKind,
    name: `${label}${count ? ` ${count + 1}` : ''}`,
    identifier: `${slug}${count ? `_${count + 1}` : ''}`,
    description: '',
    properties: normalizedKind === 'block'
      ? { hardness: 2, resistance: 3, requiresTool: false, luminance: 0 }
      : { maxStackSize: 64, fireResistant: false },
    texture: { size: TEXTURE_SIZE, pixels: Array(TEXTURE_SIZE * TEXTURE_SIZE).fill(null) },
    recipes: [],
  };
}

export function validateProject(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Ungültiges Projektformat.');
  if (typeof value.id !== 'string' || !isUuid(value.id)) throw new Error('Ungültige Projekt-ID.');
  const name = cleanText(value.name, 72);
  if (!name) throw new Error('Das Projekt braucht einen Namen.');
  const namespace = normalizeNamespace(value.namespace || name);
  const target = value.target || {};
  if (target.edition !== undefined && target.edition !== 'java') throw new Error('Nur Minecraft Java wird unterstützt.');
  const loader = String(target.loader || 'fabric');
  if (!['fabric', 'quilt', 'forge', 'neoforge'].includes(loader)) throw new Error('Unbekannter Mod-Loader.');
  const minecraftVersion = cleanText(target.minecraftVersion, 32);
  if (value.elements !== undefined && (!Array.isArray(value.elements) || value.elements.length > MAX_PROJECT_ELEMENTS)) throw new Error('Ungültige Elementliste.');
  const elements = (value.elements || []).map(validateElement);
  const ids = new Set();
  const identifiers = new Set();
  for (const item of elements) {
    if (ids.has(item.id)) throw new Error('Element-IDs müssen eindeutig sein.');
    if (identifiers.has(item.identifier)) throw new Error('Element-Kennungen müssen eindeutig sein.');
    ids.add(item.id);
    identifiers.add(item.identifier);
  }
  const conversation = Array.isArray(value.conversation)
    ? value.conversation.slice(-100).map((message) => ({
      role: ['user', 'assistant'].includes(message?.role) ? message.role : 'assistant',
      content: cleanText(message?.content, 12000),
      createdAt: cleanText(message?.createdAt, 40) || new Date().toISOString(),
    })).filter((message) => message.content)
    : [];
  const requestedActiveId = typeof value.activeElementId === 'string' ? value.activeElementId : null;
  const sourceOverrides = {};
  if (value.sourceOverrides && typeof value.sourceOverrides === 'object' && !Array.isArray(value.sourceOverrides)) {
    for (const [path, content] of Object.entries(value.sourceOverrides).slice(0, 80)) {
      if (!/^src\/main\/java\/[a-zA-Z0-9_./-]+\.java$/.test(path) || path.split('/').includes('..') || typeof content !== 'string' || content.length > 200_000) continue;
      sourceOverrides[path] = content;
    }
  }
  return {
    schemaVersion: PROJECT_SCHEMA_VERSION,
    id: value.id,
    name,
    namespace,
    description: cleanText(value.description, 1000),
    target: { edition: 'java', loader, minecraftVersion },
    elements,
    activeElementId: elements.some((item) => item.id === requestedActiveId) ? requestedActiveId : (elements[0]?.id || null),
    sourceOverrides,
    conversation,
    timeSpentMs: Math.floor(finiteNumber(value.timeSpentMs, 0, 315_360_000_000, 0)),
    createdAt: cleanText(value.createdAt, 40) || new Date().toISOString(),
    updatedAt: cleanText(value.updatedAt, 40) || new Date().toISOString(),
  };
}

function validateElement(value) {
  if (!value || typeof value !== 'object' || !isUuid(value.id)) throw new Error('Ungültiges Mod-Element.');
  const kind = elementKinds.has(value.kind) ? value.kind : null;
  if (!kind) throw new Error('Dieser Elementtyp ist noch nicht verfügbar.');
  const name = cleanText(value.name, 72);
  if (!name) throw new Error('Jedes Element braucht einen Namen.');
  const identifier = String(value.identifier || '').trim().toLowerCase();
  if (!idPattern.test(identifier)) throw new Error('Die Kennung darf nur Kleinbuchstaben, Ziffern, Punkte, Unterstriche und Bindestriche enthalten.');
  const sourcePixels = value.texture?.pixels;
  if (!Array.isArray(sourcePixels) || sourcePixels.length !== TEXTURE_SIZE * TEXTURE_SIZE) throw new Error('Texturen müssen 16×16 Pixel groß sein.');
  const pixels = sourcePixels.map((pixel) => {
    if (pixel === null || pixel === '') return null;
    if (typeof pixel !== 'string' || !/^#[\da-fA-F]{6}(?:[\da-fA-F]{2})?$/.test(pixel)) throw new Error('Ungültige Texturfarbe.');
    return pixel.toUpperCase();
  });
  const properties = kind === 'block'
    ? {
      hardness: finiteNumber(value.properties?.hardness, 0, 100, 2),
      resistance: finiteNumber(value.properties?.resistance, 0, 1000, 3),
      requiresTool: Boolean(value.properties?.requiresTool),
      luminance: Math.round(finiteNumber(value.properties?.luminance, 0, 15, 0)),
    }
    : {
      maxStackSize: Math.round(finiteNumber(value.properties?.maxStackSize, 1, 99, 64)),
      fireResistant: Boolean(value.properties?.fireResistant),
    };
  return {
    id: value.id,
    kind,
    name,
    identifier,
    description: cleanText(value.description, 500),
    properties,
    texture: { size: TEXTURE_SIZE, pixels },
    ...(value.javaModel ? { javaModel: validateJavaBlockModel(value.javaModel) } : {}),
    recipes: Array.isArray(value.recipes) ? value.recipes.slice(0, 8).map(validateRecipe) : [],
  };
}

function validateRecipe(recipe) {
  const pattern = Array.isArray(recipe?.pattern) ? recipe.pattern.slice(0, 3).map((row) => String(row).slice(0, 3)) : [];
  while (pattern.length < 3) pattern.push('   ');
  return {
    type: recipe?.type === 'smelting' ? 'smelting' : 'crafting',
    pattern,
    key: recipe?.key && typeof recipe.key === 'object' ? recipe.key : {},
    resultCount: Math.round(finiteNumber(recipe?.resultCount, 1, 64, 1)),
  };
}

export function normalizeNamespace(value) {
  const normalized = String(value || '').normalize('NFKD').toLowerCase()
    .replace(/[^a-z0-9_.-]+/g, '_').replace(/^[^a-z0-9]+/, '').slice(0, 48);
  return normalized || 'new_mod';
}

function cleanText(value, limit) {
  return typeof value === 'string' ? value.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').trim().slice(0, limit) : '';
}

function finiteNumber(value, min, max, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.min(max, Math.max(min, number)) : fallback;
}

function isUuid(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}
