const assert = require('node:assert/strict');
const { createSelectionHistory, formatModList } = require('../pack-tools.js');

const mod = id => ({ id, provider: 'modrinth', title: id, categories: ['utility'] });
const project = { id: 'one', name: 'Friends', minecraftVersion: '1.21.1', loader: 'fabric', mods: [] };
const history = createSelectionHistory(3);
assert.deepEqual(history.observe(project), { undo: false, redo: false });
project.mods = [mod('A'), mod('B')];
assert.deepEqual(history.observe(project), { undo: true, redo: false });
project.mods.push({ ...mod('API'), dependency: true });
history.observe(project);
project.mods = [];
history.observe(project);
project.mods = history.step(project, 'undo');
assert.deepEqual(project.mods.map(m => m.id), ['A', 'B'], 'undo clear restores the whole batch, with dependencies recalculated separately');
const restored = project.mods;
project.mods = history.step(project, 'undo');
assert.deepEqual(project.mods, [], 'dependency refresh must not create its own undo step');
restored[0].categories.push('changed');
project.mods = history.step(project, 'redo');
assert.deepEqual(project.mods[0].categories, ['utility'], 'history must own deep copies');
project.mods = [mod('C')]; history.observe(project);
assert.equal(history.step(project, 'redo'), null, 'a new edit discards the redo branch');
project.id = 'two';
assert.deepEqual(history.observe(project), { undo: false, redo: false }, 'another pack must not inherit undo history');
project.mods = []; history.observe(project); project.loader = 'neoforge';
assert.equal(history.step(project, 'undo'), null, 'setup changes invalidate history from the previous loader');
for (let i = 0; i < 6; i++) { project.mods = [mod(String(i))]; history.observe(project); }
for (let i = 0; i < 3; i++) { project.mods = history.step(project, 'undo'); assert.ok(project.mods); }
assert.equal(history.step(project, 'undo'), null, 'history stays bounded');

project.name = 'Friends\nPack'; project.mods = [
  { ...mod('Sodium'), url: 'https://modrinth.com/mod/sodium' },
  { ...mod('API'), dependency: true, url: 'javascript:alert(1)' },
  { ...mod('Other'), url: 'https://modrinth.com.evil.example/mod/other' },
];
const text = formatModList(project, 'en');
assert.ok(text.startsWith('Friends Pack · Minecraft 1.21.1 · neoforge\n'));
assert.ok(text.includes('• Sodium — https://modrinth.com/mod/sodium'));
assert.ok(text.includes('• API (dependency)'));
assert.ok(!text.includes('javascript:') && !text.includes('evil.example'), 'share text must exclude unsafe project links');
assert.ok(formatModList(project, 'de').includes('(Abhängigkeit)'));
console.log('Pack history: atomic batches, dependencies, deep copies, redo branches, project/setup boundaries and limits; shareable lists passed.');
