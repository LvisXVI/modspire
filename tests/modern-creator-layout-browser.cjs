const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

(async () => {
  const root = path.resolve(__dirname, '..');
  fs.mkdirSync(path.join(root, 'work'), { recursive: true });
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8')
    .replace(/<meta http-equiv="Content-Security-Policy"[^>]*>/i, '')
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '');
  const css = ['styles.css', 'visual-fixes.css', 'modern-ui.css', 'v3-ui.css', 'v4-ui.css']
    .map(file => fs.readFileSync(path.join(root, file), 'utf8')).join('\n');
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1232, height: 750 } });
    await page.setContent(html);
    await page.addStyleTag({ content: css });
    for (const mode of ['ui-modern', 'ui-v3', 'ui-v4']) {
      await page.evaluate(mode => {
        document.body.className = mode;
        document.body.dataset.theme = 'blue';
        document.getElementById('workspace-grid').classList.add('single-view');
        document.getElementById('workspace-grid').dataset.view = 'chat';
        for (const id of ['project-overview', 'modern-dashboard', 'v3-dashboard', 'v4-dashboard', 'mods-panel', 'lab-panel']) document.getElementById(id).hidden = true;
        const panel = document.getElementById('chat-panel');
        panel.hidden = false;
        panel.classList.add('is-mod-creator');
        document.getElementById('creator-context-banner').hidden = false;
        document.getElementById('creator-studio').hidden = false;
        document.getElementById('chat-messages').innerHTML = Array.from({ length: 12 }, (_, i) => `<div class="message assistant-message"><div class="avatar">✦</div><div class="message-content"><div class="bubble">Antwort ${i + 1}: Ich möchte eine neue Minecraft-Mod erstellen. Hier wächst mein Konzept mit einer ausführlichen Beschreibung, damit der Chatbereich sicher scrollbar ist.</div></div></div>`).join('');
        for (const id of ['username-setup-overlay', 'startup-login-overlay', 'curseforge-notice-overlay']) { const node = document.getElementById(id); if (node) node.hidden = true; }
      }, mode);
      const layout = await page.evaluate(() => {
        const rect = selector => { const node = document.querySelector(selector), box = node.getBoundingClientRect(), style = getComputedStyle(node); return { top: box.top, bottom: box.bottom, left: box.left, right: box.right, width: box.width, height: box.height, cssWidth: style.width, position: style.position, display: style.display, gridColumn: style.gridColumn, gridRow: style.gridRow, overflowY: style.overflowY, scrollHeight: node.scrollHeight, clientHeight: node.clientHeight }; };
        const exit = document.querySelector('#creator-context-exit');
        return { panel: rect('#chat-panel'), workspace: rect('#workspace-grid'), main: rect('.main-content'), heading: rect('#chat-panel>.panel-heading'), banner: rect('#creator-context-banner'), messages: rect('#chat-messages'), studio: rect('#creator-studio'), composer: rect('#chat-form'), footnote: rect('#chat-panel>.chat-footnote'), exit: { background: getComputedStyle(exit).backgroundColor, color: getComputedStyle(exit).color, border: getComputedStyle(exit).borderTopColor } };
      });
      assert.equal(layout.panel.display, 'grid', `${mode} creator uses grid layout: ${JSON.stringify(layout)}`);
      assert.ok(layout.panel.left >= 0 && layout.panel.right <= 1233, `${mode}: creator stays within the window width: ${JSON.stringify(layout)}`);
      assert.ok(layout.heading.width > layout.panel.width * .9, `${mode}: assistant header spans the full creator workspace: ${JSON.stringify(layout)}`);
      assert.ok(layout.banner.top >= layout.heading.bottom - 1 && layout.banner.width > layout.panel.width * .9, `${mode}: creator banner follows and spans the header: ${JSON.stringify(layout)}`);
      assert.ok(layout.messages.right <= layout.studio.left + 1, `${mode}: conversation and preview occupy separate columns: ${JSON.stringify(layout)}`);
      assert.ok(layout.composer.right <= layout.studio.left + 1, `${mode}: composer stays in the conversation column: ${JSON.stringify(layout)}`);
      assert.ok(layout.footnote.top >= Math.max(layout.composer.bottom, layout.studio.bottom) - 1, `${mode}: footnote follows both work areas: ${JSON.stringify(layout)}`);
      assert.ok(layout.messages.scrollHeight > layout.messages.clientHeight && ['auto', 'scroll'].includes(layout.messages.overflowY), `${mode}: long conversations are vertically scrollable: ${JSON.stringify(layout.messages)}`);
      assert.ok(layout.studio.scrollHeight > layout.studio.clientHeight && ['auto', 'scroll'].includes(layout.studio.overflowY), `${mode}: the creator preview and notes are vertically scrollable: ${JSON.stringify(layout.studio)}`);
      assert.notEqual(layout.exit.background, 'rgba(0, 0, 0, 0)', `${mode}: return action has a designed surface`);
      assert.equal(layout.exit.color, 'rgb(255, 255, 255)', `${mode}: return action text contrasts with its dark themed surface`);
      if (mode === 'ui-modern') await page.screenshot({ path: path.join(root, 'work', 'creator-layout-ui2.png') });
      if (mode === 'ui-v3') await page.screenshot({ path: path.join(root, 'work', 'creator-layout-ui3.png') });
      if (mode === 'ui-v4') await page.screenshot({ path: path.join(root, 'work', 'creator-layout-ui4.png') });
    }
    await page.setViewportSize({ width: 900, height: 750 });
    const narrow = await page.evaluate(() => {
      const box = selector => { const node = document.querySelector(selector), rect = node.getBoundingClientRect(); return { top: rect.top, bottom: rect.bottom }; };
      const panel = document.querySelector('#chat-panel');
      return { messages: box('#chat-messages'), studio: box('#creator-studio'), composer: box('#chat-form'), panelScrollHeight: panel.scrollHeight, panelClientHeight: panel.clientHeight, overflowY: getComputedStyle(panel).overflowY };
    });
    assert.ok(narrow.messages.bottom <= narrow.studio.top + 1, `narrow layout stacks messages above the studio: ${JSON.stringify(narrow)}`);
    assert.ok(narrow.studio.bottom <= narrow.composer.top + 1, `narrow layout keeps the composer after the studio: ${JSON.stringify(narrow)}`);
    assert.ok(narrow.panelScrollHeight > narrow.panelClientHeight && ['auto', 'scroll'].includes(narrow.overflowY), `narrow layout can scroll to all creator controls: ${JSON.stringify(narrow)}`);
    console.log('AI Mod Creator layout, independent chat/studio scrolling, themed return button and narrow-window scrolling passed in UI 2, 3 and 4.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
