const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

(async () => {
  const root = path.resolve(__dirname, '..');
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 760 } });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.setContent(`<!doctype html><html><body class="ui-v4" data-theme="blue" style="--modern-ink:#171925;--modern-muted:#6e748b;--modern-bg:#e8eaf6;--modern-card:#fbfbff;--modern-inset:#eaecf8;--modern-line:#d3d7ef;--modern-accent:#4050ff;--modern-green:#169b56"><section id="v4-dashboard" class="v4-dashboard"><header class="v4-header">Overview</header><div class="v4-layout"><aside class="v4-rail"></aside><main class="v4-main"><section class="v4-hero"><h2 id="v4-project-name">Pack overview</h2><span id="v4-setup"></span><select id="v4-project-select"></select></section><div class="v4-stats"><article><strong id="v4-mod-count"></strong><strong id="v4-version"></strong><strong id="v4-loader"></strong></article></div><div class="v4-content-grid">${'<section class="v4-panel">Panel</section>'.repeat(3)}</div><div id="v4-mod-list"></div><div id="v4-empty" hidden></div><div id="v4-category-list"></div><div id="v4-activity-list"></div></main></div></section><main id="chat-panel"><header class="panel-heading">Assistant</header><div class="chat-messages"><article class="message"><span class="avatar">✦</span><div class="message-content"><div class="bubble">Assistant reply</div></div></article></div><form id="chat-form"><textarea id="chat-input"></textarea></form><aside id="creator-context-banner" hidden><button>Back to assistant</button></aside></main></body></html>`);
    await page.addStyleTag({ content: ['styles.css', 'visual-fixes.css', 'modern-ui.css', 'v3-ui.css', 'v4-ui.css'].map(file => fs.readFileSync(path.join(root, file), 'utf8')).join('\n') });
    await page.addScriptTag({ content: fs.readFileSync(path.join(root, 'v4-ui.js'), 'utf8') });
    await page.evaluate(() => WorkshopV4UI.init({ getProject: () => ({ id: 'one', name: 'Test Pack', minecraftVersion: '1.21.1', loader: 'fabric', mods: [], snapshots: [] }), currentView: () => 'project' }));

    assert.equal(await page.locator('#v4-dashboard').evaluate(node => getComputedStyle(node).overflowY), 'auto', 'UI 4 overview has its own vertical scroll area');
    assert.ok(await page.locator('#v4-dashboard').evaluate(node => node.scrollHeight > node.clientHeight), 'long UI 4 overview content can be scrolled');
    fs.mkdirSync(path.join(root, 'work'), { recursive: true });
    await page.screenshot({ path: path.join(root, 'work', 'ui-v4-theme-review.png') });
    const before = await page.locator('.v4-hero').evaluate(node => getComputedStyle(node).backgroundImage);
    await page.evaluate(() => {
      for (const [key, value] of Object.entries({ '--modern-ink':'#f7f3ff', '--modern-muted':'#c1b7d8', '--modern-bg':'#242036', '--modern-card':'#29243d', '--modern-inset':'#332d4a', '--modern-line':'#49405e', '--modern-accent':'#af7bff', '--modern-green':'#5bd3a4' })) document.documentElement.style.setProperty(key, value);
      document.body.dataset.theme = 'ender';
      window.dispatchEvent(new CustomEvent('workshop-theme-changed', { detail: { theme: 'ender' } }));
    });
    assert.equal(await page.locator('html').evaluate(node => getComputedStyle(node).getPropertyValue('--v4-accent').trim()), '#af7bff', 'UI 4 follows the selected design accent');
    assert.notEqual(await page.locator('.v4-hero').evaluate(node => getComputedStyle(node).backgroundImage), before, 'UI 4 surfaces change with the active design');
    const v4Chat = await page.locator('#chat-panel').evaluate(node => ({ radius: getComputedStyle(node).borderRadius, background: getComputedStyle(node).backgroundImage }));
    await page.evaluate(() => document.body.classList.replace('ui-v4', 'ui-modern'));
    const modernChat = await page.locator('#chat-panel').evaluate(node => ({ radius: getComputedStyle(node).borderRadius, background: getComputedStyle(node).backgroundImage }));
    assert.notEqual(v4Chat.radius, modernChat.radius, 'UI 4 chat has its own layout signature');
    assert.notEqual(v4Chat.background, modernChat.background, 'UI 4 chat has its own surface treatment');
    assert.equal(await page.locator('#creator-context-banner').isHidden(), true, 'the creator-only return action remains hidden in normal chat');
    assert.deepEqual(errors, [], 'UI 4 theme and layout changes do not throw');
    await page.evaluate(() => {
      document.documentElement.style.setProperty('--modern-bg', '#bfdced');
      document.documentElement.style.setProperty('--modern-canvas', 'rgba(7,25,46,.50)');
      window.dispatchEvent(new CustomEvent('workshop-theme-changed'));
    });
    assert.equal(await page.locator('html').evaluate(node => getComputedStyle(node).getPropertyValue('--v4-canvas').trim()), 'rgba(7,25,46,.50)', 'glass UI 4 uses its dark canvas, not the pale wallpaper fallback behind light text');
    console.log('UI 4 palette synchronization, independently scrollable overview, distinct chat styling, and normal-chat actions passed.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
