const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

(async () => {
  const root = path.resolve(__dirname, '..');
  const source = fs.readFileSync(path.join(root, 'renderer.js'), 'utf8');
  const matching = source.slice(source.indexOf('function scoreModQueryRelevance('), source.indexOf('\nfunction modCardMarkup(', source.indexOf('function scoreModQueryRelevance(')));
  const search = source.slice(source.indexOf('async function searchMods('), source.indexOf('\nfunction turnTopics(', source.indexOf('async function searchMods(')));
  assert.ok(matching.includes('function matchExactRequestedMods('));
  assert.ok(search.includes('addPackMods(exactMatches'));
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    const page = await browser.newPage();
    await page.setContent('<input id="mod-search"><div id="results-hint"></div><div id="mod-results"></div><div id="refinement-row"></div>');
    await page.evaluate(({ matching, search }) => {
      window.state = { project: { id: 'p', mods: [], provider: 'modrinth', minecraftVersion: '1.21.1', loader: 'fabric', turns: [] }, autoSetup: false, searchGeneration: 0, chatSearchGeneration: 0 };
      window.$ = id => document.getElementById(id);
      window.renderResults = () => {};
      window.queueSave = () => {};
      window.renderChat = () => {};
      window.setStatus = message => { window.lastStatus = message; };
      window.addPackMods = mods => { for (const mod of mods) if (!state.project.mods.some(item => item.id === mod.id)) state.project.mods.push(mod); };
      window.searchCalls = [];
      window.workshop = { searchMods: async input => { searchCalls.push(input); if (input.query.toLowerCase() === 'better combat') return [{ id: 'bc', provider: 'modrinth', title: 'Better Combat', downloads: 1200, summary: '', categories: [] }]; if (input.query === 'boss fights') return [{ id: 'boss-one', provider: 'modrinth', title: 'Boss Arena', downloads: 900, summary: 'Boss fights', categories: [] }]; if (input.query === 'adventure structures') return [{ id: 'dungeon-one', provider: 'modrinth', title: 'Adventure Ruins', downloads: 850, summary: 'Dungeon structures', categories: [] }]; return []; } };
      Object.assign(window, new Function(`${matching};${search};return { normalizeExactModName, matchExactRequestedMods, broaderModQueries, mergeRankedModResults, searchMods }`)());
    }, { matching, search });

    await page.evaluate(async () => {
      const user = { role: 'user', content: 'Ich möchte die Mod Better Combat bitte installieren' };
      const turn = { role: 'assistant', content: 'Ich suche Better Combat.', searchTerms: ['Better Combat'], exactModNames: ['Better Combat'], modSearchStatus: 'loading', modResults: [] };
      state.project.turns = [user, turn];
      await searchMods(['Better Combat'], true, { chatTurn: turn, exactModNames: turn.exactModNames });
    });
    assert.equal(await page.evaluate(() => state.project.mods.length), 1, 'the exact requested project should be added without a choice flow');
    assert.equal(await page.evaluate(() => state.project.mods[0].title), 'Better Combat');
    assert.equal(await page.evaluate(() => state.project.turns.at(-1).selectionComplete), true);

    await page.evaluate(async () => {
      state.project.mods = [];
      const user = { role: 'user', content: 'Ich möchte die Mod Unknown Bossfight installieren' };
      const turn = { role: 'assistant', content: 'Exakter Treffer fehlt, ich suche Alternativen.', searchTerms: ['Unknown Bossfight'], exactModNames: ['Unknown Bossfight'], modSearchStatus: 'loading', modResults: [] };
      state.project.turns = [user, turn];
      await searchMods(['Unknown Bossfight'], true, { chatTurn: turn, exactModNames: turn.exactModNames });
    });
    const fallback = await page.evaluate(() => ({ calls: searchCalls.map(input => input.query), titles: state.project.turns.at(-1).modResults.map(mod => mod.title), added: state.project.mods.length }));
    assert.ok(fallback.calls.some(query => query === 'boss fights'), 'a missing exact result should trigger related category queries');
    assert.ok(fallback.titles.includes('Boss Arena') && fallback.titles.includes('Adventure Ruins'), 'the fallback should include alternatives from related facets');
    assert.equal(fallback.added, 0, 'alternatives must remain choices rather than being silently added');
    console.log('Exact mod requests auto-add only a definitive match; missing projects expand into related, ranked alternatives.');
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
