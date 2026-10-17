const assert = require('node:assert/strict');
const { recordWeeklySnapshot, buildWeeklyFavoriteRanking, WEEK_MS } = require('../weekly-favorites.cjs');

const start = Date.UTC(2026, 0, 1);
const firstProjects = [
  { id: 'mod-a', title: 'Mod A', follows: 100 },
  { id: 'mod-b', title: 'Mod B', follows: 500 }
];
let cache = recordWeeklySnapshot({}, firstProjects, start);
assert.equal(cache.history['mod-a'].length, 1);
const skipped = recordWeeklySnapshot(cache, [{ id: 'mod-a', follows: 120 }], start + 2 * 60 * 60 * 1000);
assert.equal(skipped, cache, 'do not create duplicate samples more than once per day');

const earlyRanking = buildWeeklyFavoriteRanking(cache, start + 3 * 24 * 60 * 60 * 1000, 8);
assert.equal(earlyRanking.ranking, 'all-time', 'show a clear all-time fallback until a week is tracked');
assert.equal(earlyRanking.mods[0].title, 'Mod B');

cache = recordWeeklySnapshot(cache, [
  { id: 'mod-a', title: 'Mod A', follows: 175 },
  { id: 'mod-b', title: 'Mod B', follows: 510 }
], start + WEEK_MS);
const weekly = buildWeeklyFavoriteRanking(cache, start + WEEK_MS, 8);
assert.equal(weekly.ranking, 'weekly');
assert.equal(weekly.mods[0].title, 'Mod A');
assert.equal(weekly.mods[0].weeklyFollows, 75);
assert.equal(weekly.mods[1].weeklyFollows, 10);
assert.equal(weekly.daysTracked, 7);
assert.equal(weekly.allTimeMods[0].title, 'Mod B');

const bounded = buildWeeklyFavoriteRanking(cache, start + WEEK_MS, 1000);
assert.ok(bounded.mods.length <= 24, 'cap returned lists to avoid unbounded UI and memory work');
console.log('Weekly Modrinth favorites: daily snapshots, weekly growth, fallback, and bounded results passed.');
