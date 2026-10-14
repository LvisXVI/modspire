const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

(async () => {
  const root = path.resolve(__dirname, '..');
  const css = ['styles.css', 'visual-fixes.css', 'modern-ui.css', 'v3-ui.css', 'v4-ui.css']
    .map(file => fs.readFileSync(path.join(root, file), 'utf8')).join('\n');
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1500, height: 950 } });
    await page.setContent(`<html><body data-theme="blue"><main class="workspace-grid">
      <section id="project-overview" class="panel">Overview</section>
      <section id="chat-panel" class="panel"><header class="panel-heading">Chat</header><div class="chat-messages"><div class="message assistant-message"><div class="message-content"><div class="bubble">Assistant</div><section class="assistant-followups"><span class="assistant-followups-label">Continue</span><div class="suggestion-row"><button class="suggestion">Explore</button><button class="suggestion">More mods</button></div><details class="more-suggestions"><summary>More directions</summary><span class="more-suggestions-title">World &amp; adventure</span><div class="suggestion-row"><button class="suggestion">Caves</button></div></details></section></div></div><div class="message user-message"><div class="message-content"><div class="bubble">User</div></div></div></div><form id="chat-form"><textarea id="chat-input"></textarea></form></section>
      <section id="mods-panel" class="panel"><div class="panel-heading">Mods</div><div id="mod-results" class="mod-results"><article class="mod-card has-gallery"><div class="mod-card-main"><strong>Test Mod</strong><p class="mod-desc">Description</p><div class="mod-gallery-carousel"><button class="gallery-arrow">‹</button><div class="mod-preview-gallery"><button class="mod-preview-tile"><img src="data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=" /></button></div><button class="gallery-arrow">›</button></div></div></article></div></section>
      <section id="lab-panel" class="panel">Tools</section></main></body></html>`);
    await page.addStyleTag({ content: css });
    const result = {};
    for (const mode of ['classic', 'modern', 'v3', 'v4']) {
      await page.evaluate(mode => {
        document.body.className = mode === 'classic' ? '' : `ui-${mode === 'modern' ? 'modern' : mode}`;
        for (const id of ['project-overview', 'chat-panel', 'mods-panel', 'lab-panel']) document.getElementById(id).hidden = id !== 'mods-panel';
      }, mode);
      if (mode !== 'classic') {
        await page.locator('#mods-panel').evaluate(el => { el.hidden = false; });
      }
      result[mode] = await page.evaluate(() => {
        const chat = document.getElementById('chat-panel');
        chat.hidden = false;
        const metrics = {
          tracks: getComputedStyle(document.getElementById('mod-results')).gridTemplateColumns.split(' ').length,
          chatRadius: getComputedStyle(chat).borderRadius,
          composerDocked: (() => { const form = document.getElementById('chat-form').getBoundingClientRect(); const messages = document.querySelector('.chat-messages').getBoundingClientRect(); return form.left > messages.left + messages.width * 0.55; })(),
          chatFormColumn: getComputedStyle(document.getElementById('chat-form')).gridColumnStart,
          composerWidthRatio: (() => { const form = document.getElementById('chat-form').getBoundingClientRect(); const chat = document.getElementById('chat-panel').getBoundingClientRect(); return form.width / chat.width; })(),
          cardRadius: getComputedStyle(document.querySelector('.mod-card')).borderRadius,
          moreDirectionsBackground: getComputedStyle(document.querySelector('.more-suggestions > summary')).backgroundColor,
          moreDirectionsColor: getComputedStyle(document.querySelector('.more-suggestions > summary')).color,
          followupRowJustification: getComputedStyle(document.querySelector('.assistant-followups > .suggestion-row')).justifyContent,
          followupRowCentered: (() => { const row = document.querySelector('.assistant-followups > .suggestion-row').getBoundingClientRect(); const shell = document.querySelector('.assistant-followups').getBoundingClientRect(); return Math.abs((row.left + row.right) / 2 - (shell.left + shell.right) / 2) < 2; })(),
          followupLabelAlignment: getComputedStyle(document.querySelector('.assistant-followups-label')).textAlign,
          directionsAlignment: getComputedStyle(document.querySelector('.more-suggestions > summary')).textAlign,
          previewHeight: parseFloat(getComputedStyle(document.querySelector('.mod-preview-gallery')).height),
          resultOverflow: getComputedStyle(document.getElementById('mod-results')).overflowY,
        };
        chat.hidden = true;
        metrics.hiddenPanelDisplay = getComputedStyle(chat).display;
        metrics.hiddenPanelAttribute = chat.hidden;
        return metrics;
      });
    }
    assert.equal(result.modern.tracks, 3, 'UI 2 uses a compact three-column mod catalog on desktop');
    assert.equal(result.v3.tracks, 2, 'UI 3 keeps a cinematic two-column mod catalog');
    assert.equal(result.v4.tracks, 1, 'UI 4 uses a detailed single-column mod catalog');
    assert.equal(result.modern.composerDocked, false, 'UI 2 uses a centered messenger layout');
    assert.equal(result.v3.composerDocked, false, 'UI 3 uses a full-width cinematic conversation');
    assert.equal(result.v4.composerDocked, false, 'UI 4 keeps its composer below the conversation instead of isolating it in a side dock');
    assert.equal(result.v4.chatFormColumn, '1', 'UI 4 places its composer in the conversation column');
    assert.ok(result.v4.composerWidthRatio > 0.8, 'UI 4 gives the composer most of the available conversation width');
    assert.notEqual(result.modern.chatRadius, result.v3.chatRadius, 'UI 2 and UI 3 chat shells have distinct shapes');
    assert.notEqual(result.v3.chatRadius, result.v4.chatRadius, 'UI 3 and UI 4 chat shells have distinct shapes');
    assert.notEqual(result.modern.cardRadius, result.v3.cardRadius, 'UI 2 and UI 3 mod cards have distinct shapes');
    assert.notEqual(result.v3.cardRadius, result.v4.cardRadius, 'UI 3 and UI 4 mod cards have distinct shapes');
    assert.notEqual(result.v3.moreDirectionsBackground, 'rgb(255, 255, 255)', 'UI 3 directions panel follows the dark studio surface');
    assert.notEqual(result.v3.moreDirectionsColor, 'rgb(255, 255, 255)', 'UI 3 directions remain readable on the dark studio surface');
    assert.notEqual(result.v4.moreDirectionsBackground, 'rgb(255, 255, 255)', 'UI 4 directions panel follows the Deep Grove surface');
    for (const mode of ['classic', 'modern', 'v3', 'v4']) {
      assert.equal(result[mode].followupRowJustification, 'center', `${mode} centers the quick follow-up actions`);
      assert.equal(result[mode].followupRowCentered, true, `${mode} centers the action box within the assistant message`);
      assert.equal(result[mode].followupLabelAlignment, 'center', `${mode} centers the follow-up heading`);
      assert.equal(result[mode].directionsAlignment, 'center', `${mode} centers the additional-directions toggle`);
    }
    for (const mode of ['modern', 'v3', 'v4']) {
      assert.ok(result[mode].previewHeight >= 150, `${mode} previews keep a readable image frame`);
      assert.equal(result[mode].resultOverflow, 'auto', `${mode} catalog remains independently scrollable`);
      assert.equal(result[mode].hiddenPanelDisplay, 'none', `${mode} hides inactive workspace panels`);
    }
    console.log('Four UI modes use distinct chat and catalog styling; the UI 4 conversation and composer stay together, and hidden panels and preview frames render correctly.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
