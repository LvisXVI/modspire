const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

(async () => {
  const root = path.resolve(__dirname, '..');
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1352, height: 760 } });
    await page.setContent(`<!doctype html><html><body class="ui-v4" data-theme="ender"><div class="app-shell"><aside class="sidebar">Navigation</aside><main class="main-content"><div class="topbar">Modspire · UI 04</div><div class="setup-strip">1.21.1 · Fabric</div><main class="workspace-grid single-view" data-view="chat"><section id="project-overview" class="panel" hidden>Overview</section><section class="panel chat-panel is-mod-creator" id="chat-panel"><header class="panel-heading">Pack assistant</header><aside class="creator-context-banner" id="creator-context-banner"><span class="creator-context-icon">✦</span><div><strong>AI Mod Creator</strong><p>Create a mod specification.</p></div><button class="creator-context-exit">Back to assistant</button></aside><aside class="creator-studio" id="creator-studio"><header>Workshop preview</header><div class="creator-artboard">Preview</div><div class="creator-visual-tabs">Sword · Axe · Bow · Staff</div><section class="creator-spec-card">Design notes</section></aside><div class="chat-messages" id="chat-messages"><div class="message assistant-message"><div class="avatar">✦</div><div class="message-content"><div class="bubble">Assistant reply</div></div></div><div class="assistant-followups"><span>How should we continue?</span><div class="suggestion-row"><button>Explore</button><button>Alternatives</button></div><details class="more-suggestions"><summary>20 more directions</summary></details></div></div><form class="chat-form" id="chat-form"><textarea id="chat-input"></textarea></form><div class="chat-footnote">Sent with ChatGPT</div></section><section id="mods-panel" class="panel" hidden></section></div></main></div></body></html>`);
    await page.addStyleTag({ content: ['styles.css', 'visual-fixes.css', 'modern-ui.css', 'v3-ui.css', 'v4-ui.css'].map(file => fs.readFileSync(path.join(root, file), 'utf8')).join('\n') });

    const layout = await page.evaluate(() => {
      const rect = selector => { const el = document.querySelector(selector), r = el.getBoundingClientRect(); return { top: r.top, bottom: r.bottom, left: r.left, right: r.right, width: r.width, height: r.height, display: getComputedStyle(el).display, hidden: el.hidden }; };
      return { elements:Object.fromEntries(['#project-overview','.topbar','.setup-strip','#chat-panel','.panel-heading','.creator-context-banner','.creator-studio','.chat-messages','#chat-form','.chat-footnote'].map(selector => [selector, rect(selector)])), grid:getComputedStyle(document.querySelector('#chat-panel')).gridTemplateRows, children:Object.fromEntries(['.creator-context-banner','.creator-studio','.chat-messages','#chat-form','.chat-footnote'].map(selector=>[selector,{row:getComputedStyle(document.querySelector(selector)).gridRow,column:getComputedStyle(document.querySelector(selector)).gridColumn}])) };
    });
    const boxes=layout.elements;
    assert.equal(boxes['#project-overview'].display, 'none', 'the overview is not visible over the creator chat');
    assert.ok(boxes['.panel-heading'].bottom <= boxes['.creator-context-banner'].top + 1, 'the creator banner starts after the chat heading');
    assert.ok(boxes['.creator-context-banner'].bottom <= boxes['.chat-messages'].top + 1, 'the creator banner does not cover chat messages');
    assert.equal(boxes['.creator-context-banner'].display, 'flex', 'the creator banner has its own UI 4 layout');
    assert.ok(boxes['.chat-messages'].right <= boxes['.creator-studio'].left + 1, 'chat and studio occupy separate columns');
    assert.ok(boxes['#chat-form'].right <= boxes['.creator-studio'].left + 1, 'the composer stays in the chat column');
    assert.ok(boxes['.chat-footnote'].top >= Math.max(boxes['#chat-form'].bottom, boxes['.creator-studio'].bottom) - 1, 'the footnote stays below the creator workspace');
    const buttonStyles = await page.locator('.creator-context-exit').evaluate(node => ({ background: getComputedStyle(node).backgroundColor, border: getComputedStyle(node).borderTopWidth, color: getComputedStyle(node).color }));
    assert.notEqual(buttonStyles.background, 'rgba(0, 0, 0, 0)', 'the return action is a themed button, not an unstyled browser control');
    assert.equal(buttonStyles.border, '1px', 'the return action has a visible border');
    await page.setViewportSize({ width: 900, height: 760 });
    const narrow = await page.evaluate(() => Object.fromEntries(['.chat-messages','.creator-studio','#chat-form','.chat-footnote'].map(selector => { const r=document.querySelector(selector).getBoundingClientRect(); return [selector,{top:r.top,bottom:r.bottom,left:r.left,right:r.right}]})));
    assert.ok(narrow['.chat-messages'].bottom <= narrow['.creator-studio'].top + 1, 'at narrow widths, messages stay above the studio');
    assert.ok(narrow['.creator-studio'].bottom <= narrow['#chat-form'].top + 1, 'at narrow widths, studio stays above the composer');
    assert.ok(narrow['#chat-form'].bottom <= narrow['.chat-footnote'].top + 1, 'at narrow widths, the footnote remains last');
    assert.deepEqual(await page.locator('body').evaluate(node => [...node.querySelectorAll(':focus-visible')].length), 0, 'responsive layout has no accidental keyboard focus');
    console.log('UI 4 creator layout is separated and themed at desktop and narrow window sizes.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
