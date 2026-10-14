const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

(async () => {
  const root = path.resolve(__dirname, '..');
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8')
    .replace(/<meta http-equiv="Content-Security-Policy"[^>]*>/i, '')
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '');
  const css = ['styles.css', 'visual-fixes.css', 'modern-ui.css', 'v3-ui.css']
    .map(file => fs.readFileSync(path.join(root, file), 'utf8')).join('\n');
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.setContent(html);
    await page.addStyleTag({ content: css });
    const previews = path.join(root, 'work', 'workspace-design');
    fs.mkdirSync(previews, { recursive: true });
    const distinctMetrics = {};

    for (const mode of ['modern', 'v3']) {
      for (const view of ['chat', 'mods', 'creator']) {
        await page.evaluate(({ mode, view }) => {
          document.body.className = `ui-${mode}`;
          document.body.dataset.theme = 'blue';
          document.body.dataset.ui = mode;
          document.getElementById('workspace-grid').dataset.view = view === 'creator' ? 'chat' : view;
          document.getElementById('workspace-grid').classList.add('single-view');
          document.getElementById('project-overview').hidden = true;
          document.getElementById('modern-dashboard').hidden = true;
          document.getElementById('v3-dashboard').hidden = true;
          document.getElementById('chat-panel').hidden = view !== 'chat' && view !== 'creator';
          document.getElementById('mods-panel').hidden = view !== 'mods';
          document.getElementById('lab-panel').hidden = true;
          const banner = document.getElementById('creator-context-banner');
          banner.hidden = view !== 'creator';
          document.getElementById('chat-panel').classList.toggle('is-mod-creator', view === 'creator');
          for (const id of ['username-setup-overlay', 'startup-login-overlay', 'curseforge-notice-overlay']) {
            const overlay = document.getElementById(id);
            if (overlay) overlay.hidden = true;
          }
          if (view === 'mods') {
            const results = document.getElementById('mod-results');
            results.replaceChildren();
            for (const title of ['Terrralith', 'Tectonic', 'Farmer’s Delight', 'Handcrafted']) {
              const card = document.createElement('article'); card.className = 'mod-card';
              card.innerHTML = `<div class="mod-icon">✦</div><div class="mod-card-main"><div class="mod-name"><strong>${title}</strong></div><p class="mod-desc">Adds a focused set of new content for your current pack.</p><small class="mod-meta">1.21.1 · fabric · Modrinth</small></div><button class="add-mod" aria-label="Mod hinzufügen">＋</button>`;
              results.append(card);
            }
            const selected = document.getElementById('selected-list');
            selected.replaceChildren();
            for (let index = 0; index < 36; index++) {
              const row = document.createElement('div'); row.className = 'selected-mod';
              row.innerHTML = `<span class="mod-icon-placeholder">✦</span><div class="selected-mod-copy"><strong>Selected example mod ${index + 1}</strong><span class="selected-mod-status">Installed</span><small>Modrinth</small></div><button class="remove-mod" type="button" aria-label="Remove mod">×</button>`;
              selected.append(row);
            }
            const emptyState = document.createElement('div'); emptyState.className = 'empty-selected'; emptyState.hidden = true; emptyState.textContent = 'Ausgewählte Mods erscheinen hier.'; selected.append(emptyState);
          }
        }, { mode, view });
        const navSizing = await page.locator('#nav-mod-creator').evaluate(node => ({ width: node.getBoundingClientRect().width, sidebar: node.closest('.sidebar').getBoundingClientRect().width, whiteSpace: getComputedStyle(node).whiteSpace }));
        assert.ok(navSizing.width >= navSizing.sidebar - 24, `${mode} sidebar highlight uses its available row width instead of collapsing around the icon: ${JSON.stringify(navSizing)}`);
        if (mode === 'v3') assert.equal(navSizing.whiteSpace, 'nowrap', 'V3 navigation labels stay on one readable line whenever the text fits');
        await page.waitForTimeout(180);
        const panel = view === 'mods' ? page.locator('#mods-panel') : page.locator('#chat-panel');
        assert.ok(await panel.isVisible(), `${mode} ${view} workspace is visible`);
        const panelBox = await panel.boundingBox();
        const shellBox = await page.locator('#workspace-grid').boundingBox();
        const mainBox = await page.locator('.main-content').boundingBox();
        const sizing = await page.locator('#workspace-grid').evaluate(node => ({ display: getComputedStyle(node).display, rows: getComputedStyle(node).gridTemplateRows, height: getComputedStyle(node).height, children: Array.from(node.children).map(child => [child.id, child.hidden, getComputedStyle(child).display, Math.round(child.getBoundingClientRect().height)]) }));
        assert.ok(panelBox.width > 1100 && panelBox.height > 650, `${mode} ${view} dimensions: ${JSON.stringify({ panelBox, shellBox, sizing })}`);
        assert.ok(mainBox.x >= 180, `${mode} content clears the full-width sidebar: ${JSON.stringify(mainBox)}`);
        if (mode === 'modern') {
          const colors = await page.locator('.panel-heading h2').first().evaluate(node => ({ text: getComputedStyle(node).color, surface: getComputedStyle(node.closest('.panel-heading')).backgroundColor }));
          assert.equal(colors.text, 'rgb(23, 25, 37)', `${mode} heading remains readable on glass/light themes: ${JSON.stringify(colors)}`);
        }
        const palette = await page.evaluate(() => {
          const selectors = ['.pack-title', '#chat-panel .panel-heading h2', '#chat-panel .panel-heading p', '#chat-messages .bubble', '#chat-panel .suggestion', '#chat-panel .chat-header-action', '#attach-video', '#chat-input', '#minecraft-version', '#loader', '.setup-strip label', '#compat-status', '.composer-hint', '#mod-search', '#selected-filter', '.empty-selected', '#compatibility-panel'];
          const values = Object.fromEntries(selectors.map(selector => {
            const node = document.querySelector(selector);
            if (!node) return [selector, null];
            const style = getComputedStyle(node);
            return [selector, { color: style.color, background: style.backgroundColor }];
          }));
          const body = getComputedStyle(document.body);
          const ink = body.getPropertyValue(document.body.classList.contains('ui-modern') ? '--modern-ink' : '--v3-ink').trim();
          const muted = body.getPropertyValue(document.body.classList.contains('ui-modern') ? '--modern-muted' : '--v3-muted').trim();
          const card = body.getPropertyValue(document.body.classList.contains('ui-modern') ? '--modern-card' : '--v3-card').trim();
          const inset = body.getPropertyValue(document.body.classList.contains('ui-modern') ? '--modern-inset' : '--v3-inset').trim();
          const rgb = value => {
            const hex = value.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
            if (hex) return hex[1].length === 3 ? [...hex[1]].map(char => parseInt(char + char, 16)) : [0, 2, 4].map(index => parseInt(hex[1].slice(index, index + 2), 16));
            return value.match(/[\d.]+/g)?.slice(0, 3).map(Number) ?? null;
          };
          const luminance = color => {
            const parts = rgb(color);
            if (!parts) return null;
            const linear = parts.map(channel => { const c = channel / 255; return c <= .04045 ? c / 12.92 : ((c + .055) / 1.055) ** 2.4; });
            return .2126 * linear[0] + .7152 * linear[1] + .0722 * linear[2];
          };
          const contrast = (foreground, background) => {
            const a = luminance(foreground), b = luminance(background);
            return a === null || b === null ? null : (Math.max(a, b) + .05) / (Math.min(a, b) + .05);
          };
          const backgroundFor = selector => selector === '.pack-title' ? (document.body.classList.contains('ui-modern') ? card : '#0d1822') : (['#minecraft-version', '#loader', '#mod-search', '#selected-filter'].includes(selector) ? inset : (['.empty-selected', '#compatibility-panel'].includes(selector) ? card : (['#chat-panel .suggestion', '#chat-panel .chat-header-action', '#attach-video', '.setup-strip label', '#compat-status', '.composer-hint'].includes(selector) ? inset : (selector.endsWith('.panel-heading p') ? card : (selector === '#chat-input' ? card : inset)))));
          return { values, ratios: Object.fromEntries(Object.entries(values).map(([selector, pair]) => [selector, pair && contrast(pair.color, backgroundFor(selector))])), ink, muted, card, inset };
        });
        for (const selector of ['.pack-title', '#chat-panel .panel-heading h2', '#chat-panel .panel-heading p', '#chat-messages .bubble', '#chat-panel .suggestion', '#chat-panel .chat-header-action', '#attach-video', '#chat-input', '#minecraft-version', '#loader', '.setup-strip label', '#compat-status', '.composer-hint', '#mod-search', '#selected-filter', '.empty-selected', '#compatibility-panel']) {
          const pair = palette.values[selector];
          const ratio = palette.ratios[selector];
          assert.ok(pair && ratio !== null, `${mode} ${selector} has measurable foreground/background colors: ${JSON.stringify({ pair, palette })}`);
          assert.ok(ratio >= (selector.endsWith('.panel-heading h2') ? 3 : 4.5), `${mode} ${selector} contrast ${ratio?.toFixed(2)}:1 against its design surface: ${JSON.stringify({ pair, palette })}`);
        }
        if (view === 'mods') {
          const area = page.locator('#mod-results');
          const values = await area.evaluate(node => ({ height: node.clientHeight, overflow: getComputedStyle(node).overflowY, columns: getComputedStyle(node).gridTemplateColumns }));
          const workspace = page.locator('#workspace-grid');
          const wholeView = await workspace.evaluate(node => ({ height: node.clientHeight, scrollHeight: node.scrollHeight, overflow: getComputedStyle(node).overflowY }));
          assert.equal(wholeView.overflow, 'auto', `${mode} mod workspace itself is the continuous scroll area`);
          assert.ok(wholeView.scrollHeight > wholeView.height, `${mode} the complete mod selection extends beyond the viewport and scrolls: ${JSON.stringify(wholeView)}`);
          assert.equal(values.overflow, 'visible', `${mode} results do not trap scrolling in a separate box`);
          assert.equal(await area.locator('.mod-card').count(), 4);
          const selectedList = page.locator('#mods-panel #selected-list');
          const packFlow = await selectedList.evaluate(node => ({ height: node.clientHeight, scrollHeight: node.scrollHeight, overflow: getComputedStyle(node).overflowY }));
          assert.ok(['visible', 'clip'].includes(packFlow.overflow), `${mode} selected mods participate in the same page scroll without a nested scroll box`);
          assert.ok(packFlow.height >= 400, `${mode} selected mods remain in the continuous pack list: ${JSON.stringify(packFlow)}`);
          const catalog = page.locator('#catalog-search-panel');
          await catalog.evaluate(node => { node.open = true; });
          await workspace.evaluate(node => { node.scrollTop = node.scrollHeight; });
          const lastSelected = await selectedList.locator('.selected-mod').last().boundingBox();
          assert.ok(lastSelected.y + lastSelected.height <= (await workspace.boundingBox()).y + wholeView.height, `${mode} scrolling the workspace reaches the end of Dein Pack`);
          await workspace.evaluate(node => { node.scrollTop = 0; });
          assert.ok(await page.locator('#catalog-query').isVisible(), `${mode} the expanded classic Modrinth search is reachable in this same window`);
          if (mode === 'v3') {
            const classicSearchStyle = await page.locator('#catalog-query').evaluate(node => ({
              background: getComputedStyle(node).backgroundColor,
              color: getComputedStyle(node).color,
              placeholder: getComputedStyle(node, '::placeholder').color
            }));
            assert.notEqual(classicSearchStyle.background, 'rgb(255, 255, 255)', `V3 classic search fields stay dark: ${JSON.stringify(classicSearchStyle)}`);
            assert.equal(classicSearchStyle.color, 'rgb(239, 247, 251)', `V3 classic search text uses the readable light palette: ${JSON.stringify(classicSearchStyle)}`);
          }
          const motion = await page.locator('#mods-panel').evaluate(node => getComputedStyle(node).animationName);
          assert.equal(motion, 'workspace-view-arrive', `${mode} workspace changes use the short transition animation`);
          distinctMetrics[mode] = await page.evaluate(() => ({
            bubbleRadius: getComputedStyle(document.querySelector('#chat-panel .message:not(.user-message) .bubble')).borderRadius,
            modCardRadius: getComputedStyle(document.querySelector('#mods-panel .mod-card')).borderRadius,
            modCardBackground: getComputedStyle(document.querySelector('#mods-panel .mod-card')).backgroundImage,
            selectedBackground: getComputedStyle(document.querySelector('#mods-panel .selected-section')).backgroundImage
          }));
          const firstCard = area.locator('.mod-card').first();
          const initialCardBox = await firstCard.boundingBox();
          await firstCard.hover();
          const hoveredCardBox = await firstCard.boundingBox();
          assert.equal(hoveredCardBox.width, initialCardBox.width, `${mode} hover keeps mod-card width stable`);
          assert.equal(hoveredCardBox.height, initialCardBox.height, `${mode} hover keeps mod-card height stable`);
          const addButton = firstCard.locator('.add-mod');
          const initialAddBox = await addButton.boundingBox();
          await addButton.evaluate(button => { button.classList.add('added'); button.setAttribute('aria-pressed', 'true'); });
          const selectedAddBox = await addButton.boundingBox();
          assert.equal(selectedAddBox.width, initialAddBox.width, `${mode} selected state keeps add-control width stable`);
          assert.equal(selectedAddBox.height, initialAddBox.height, `${mode} selected state keeps add-control height stable`);
        } else {
          const composer = await page.locator('#chat-form').boundingBox();
          const input = await page.locator('#chat-input').boundingBox();
          assert.ok(composer.width > 1000, `${mode} composer spans the workspace`);
          const message = await page.locator('.chat-messages .message').first().boundingBox();
          const bubble = await page.locator('.chat-messages .bubble').first().boundingBox();
          assert.ok(message.width > panelBox.width * .88, `${mode} message row spans the chat column: ${JSON.stringify({panelBox,message})}`);
          assert.ok(bubble.width > message.width * .88, `${mode} conversation bubble uses the full message width: ${JSON.stringify({ message, bubble })}`);
          const action = page.locator('.chat-header-action').first();
          const beforeHover = await action.boundingBox();
          await action.hover();
          const afterHover = await action.boundingBox();
          assert.equal(afterHover.width, beforeHover.width, `${mode} hover state keeps button width stable`);
          assert.equal(afterHover.height, beforeHover.height, `${mode} hover state keeps button height stable`);
          const visual = await page.locator('.suggestion').first().evaluate(node => ({ text: getComputedStyle(node).color, surface: getComputedStyle(node).backgroundColor }));
          assert.notEqual(visual.surface, 'rgb(0, 0, 0)', `${mode} suggestion surface is theme-colored: ${JSON.stringify(visual)}`);
          const inputStyle = await page.locator('#chat-input').evaluate(node => ({ minHeight: getComputedStyle(node).minHeight, height: getComputedStyle(node).height, display: getComputedStyle(node).display, body: document.body.className, theme: document.body.dataset.theme }));
          assert.ok(input.height >= 66 && input.height <= 110, `${mode} composer input dimensions: ${JSON.stringify({ input, inputStyle })}`);
          assert.equal(await page.locator('#creator-context-banner').isVisible(), view === 'creator');
        }
        await page.screenshot({ path: path.join(previews, `${mode}-${view}.png`) });
      }
    }
    assert.notEqual(distinctMetrics.modern.bubbleRadius, distinctMetrics.v3.bubbleRadius, `Modern and V3 chat surfaces have visibly different geometry: ${JSON.stringify(distinctMetrics)}`);
    assert.notEqual(distinctMetrics.modern.modCardRadius, distinctMetrics.v3.modCardRadius, `Modern and V3 catalog cards have visibly different geometry: ${JSON.stringify(distinctMetrics)}`);
    assert.notEqual(distinctMetrics.modern.selectedBackground, distinctMetrics.v3.selectedBackground, `Modern and V3 selected-pack panels have distinct surfaces: ${JSON.stringify(distinctMetrics)}`);
    await page.setContent('<!doctype html><html><body data-theme="fluid" data-wallpaper="crystal" data-wallpaper-motion="on"><main class="app-shell">Preview</main></body></html>');
    await page.addStyleTag({ content: css });
    await page.addStyleTag({ content: fs.readFileSync(path.join(root, 'v4-ui.css'), 'utf8') });
    const fluidWallpaper = await page.locator('body').evaluate(node => ({
      wallpaper: getComputedStyle(node, '::before').backgroundImage,
      light: getComputedStyle(node, '::after').backgroundImage,
      motion: getComputedStyle(node, '::before').animationName
    }));
    assert.match(fluidWallpaper.wallpaper, /shader-crystal-valley\.png/, `Fluid Glass retains the selected wallpaper: ${JSON.stringify(fluidWallpaper)}`);
    assert.match(fluidWallpaper.light, /radial-gradient/, `Fluid Glass lighting uses a separate overlay: ${JSON.stringify(fluidWallpaper)}`);
    assert.equal(fluidWallpaper.motion, 'minecraft-wallpaper-pan', 'Minecraft wallpaper motion is enabled by default');
    await page.locator('body').evaluate(node => { node.dataset.wallpaperMotion = 'off'; });
    assert.equal(await page.locator('body').evaluate(node => getComputedStyle(node, '::before').animationName), 'none', 'Minecraft wallpaper motion can be switched off');
    await page.locator('body').evaluate(node => { node.dataset.wallpaperMotion = 'on'; });
    await page.locator('body').evaluate(node => { node.dataset.theme = 'blue'; });
    assert.match(await page.locator('body').evaluate(node => getComputedStyle(node, '::before').backgroundImage), /shader-crystal-valley\.png/, 'switching away from Fluid Glass preserves the chosen wallpaper');
    await page.setContent(`<section class="ui-mode-overlay"><div class="ui-mode-card"><header><div><h2>Wähle deine Oberfläche</h2><p>Pack, Chat, Einstellungen und Werkzeuge bleiben in allen drei Oberflächen verbunden.</p></div></header><div class="ui-mode-options"><button class="ui-mode-option"><span class="ui-mode-preview"></span><strong>Klassische Werkstatt</strong><small>Die bisherige Werkstatt-Ansicht mit Modpack-Auswahl, Chat, Einstellungen und allen Werkzeugen.</small></button><button class="ui-mode-option"><span class="ui-mode-preview"></span><strong>Moderne Übersicht</strong><small>Ein helles, großzügiges Pack-Dashboard mit übersichtlicher Navigation und denselben Funktionen.</small></button><button class="ui-mode-option" id="ui-mode-v3"><span class="ui-mode-preview"></span><strong>UI Version 3 · Modpack Studio</strong><small>Eigenständige Studio-Ansicht, Schnellstart und Minecraft-Welten mit allen vorhandenen Funktionen.</small></button></div><section id="v3-appearance"></section></div></section>`);
    await page.addStyleTag({ content: css });
    for (const mode of ['modern', 'v3']) {
      await page.evaluate(mode => { document.body.className = `ui-${mode}`; }, mode);
      const dialog = await page.locator('.ui-mode-card').boundingBox();
      const option = await page.locator('.ui-mode-option').first().evaluate(node => {
        const text = node.querySelector('small');
        const style = getComputedStyle(text);
        return { width: node.getBoundingClientRect().width, fontSize: parseFloat(style.fontSize), lineHeight: parseFloat(style.lineHeight), whiteSpace: style.whiteSpace, text: text.textContent };
      });
      assert.ok(dialog.width > 1000, `${mode} design chooser gives copy a wide text area: ${JSON.stringify(dialog)}`);
      assert.ok(option.width > 300, `${mode} design choices have enough width: ${JSON.stringify(option)}`);
      assert.ok(option.fontSize >= 11, `${mode} choice descriptions stay readable instead of being compressed: ${JSON.stringify(option)}`);
      assert.equal(option.whiteSpace, 'normal', `${mode} descriptions wrap naturally without truncation`);
    }
    assert.deepEqual(errors, []);
    console.log('Modern and V3 chat, mod catalog, creator workspaces and expanded design chooser render at readable sizes; composer and catalog scroll region remain usable.');
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
