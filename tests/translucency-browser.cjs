const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

(async () => {
  const root = path.resolve(__dirname, '..');
  const css = ['styles.css', 'visual-fixes.css', 'modern-ui.css', 'v3-ui.css', 'v4-ui.css']
    .map(file => fs.readFileSync(path.join(root, file), 'utf8')).join('\n');
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  const renderer = fs.readFileSync(path.join(root, 'renderer.js'), 'utf8');
  assert.match(html, /id="theme-opacity"[^>]*min="30"[^>]*value="88"/);
  assert.match(html, /data-theme-choice="clear"[^>]*>[\s\S]*?Kristallglas[\s\S]*?kräftiger Hintergrund-Blur/);
  assert.match(html, /data-theme-choice="translucent"[^>]*>[\s\S]*?Milchglas-Türkis[\s\S]*?einstellbarer Deckkraft/);
  assert.match(renderer, /themeSurfaceOpacity\s*=\s*Math\.max\(30,[^;]+\)/);
  assert.match(renderer, /themeSurfaceOpacity=Math\.max\(30,/);
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    const page = await browser.newPage();
    await page.setContent('<body><aside class="sidebar">Navigation</aside><header class="topbar">Top</header><article class="panel" id="mods-panel">Classic</article><article class="modern-card">UI 2</article><article class="v3-panel">UI 3</article><article class="v4-panel">UI 4</article><article class="mod-card">Mod</article><article class="creator-studio">Creator</article></body>');
    await page.addStyleTag({ content: css });
    for (const mode of ['classic', 'modern', 'v3', 'v4']) {
      await page.evaluate(mode => {
        document.body.className = mode === 'classic' ? '' : `ui-${mode}`;
        document.body.dataset.theme = 'translucent';
        document.body.dataset.wallpaper = 'crystal';
        document.body.dataset.wallpaperMotion = 'on';
        document.body.style.setProperty('--theme-surface-opacity', '88%');
        document.body.dataset.v3Style = 'pro';
      }, mode);
      const selector = mode === 'classic' ? '#mods-panel' : mode === 'modern' ? '.modern-card' : mode === 'v3' ? '.v3-panel' : '.v4-panel';
      for (const theme of ['clear', 'translucent']) {
        await page.evaluate(theme => { document.body.dataset.theme = theme; }, theme);
        const surface = await page.locator(selector).evaluate(node => ({
        background: getComputedStyle(node).backgroundColor,
        filter: getComputedStyle(node).backdropFilter
        }));
        const alpha = surface.background.startsWith('rgba(')
          ? Number(surface.background.match(/,\s*([\d.]+)\)$/)?.[1] ?? 1)
          : Number(surface.background.match(/\/\s*([\d.]+)\s*\)/)?.[1] ?? 1);
        assert.ok(alpha >= 0.82, `${mode} ${theme} surfaces remain sufficiently opaque: ${JSON.stringify(surface)}`);
        assert.match(surface.filter, /^blur\(/, `${mode} ${theme} surfaces blur the wallpaper: ${JSON.stringify(surface)}`);
      }
      await page.evaluate(() => document.body.style.setProperty('--theme-surface-opacity', '100%'));
      const high = await page.locator(selector).evaluate(node => getComputedStyle(node).backgroundColor);
      await page.evaluate(() => document.body.style.setProperty('--theme-surface-opacity', '82%'));
      const low = await page.locator(selector).evaluate(node => getComputedStyle(node).backgroundColor);
      assert.notEqual(low, high, `${mode} panel responds to the shared opacity slider`);
      const wallpaper = await page.locator('body').evaluate(node => ({
        image: getComputedStyle(node, '::before').backgroundImage,
        animation: getComputedStyle(node, '::before').animationName
      }));
      assert.match(wallpaper.image, /shader-crystal-valley.webp/, `${mode} shows the selected Minecraft wallpaper: ${JSON.stringify(wallpaper)}`);
      assert.equal(wallpaper.animation, 'minecraft-wallpaper-pan', `${mode} animates the selected Minecraft wallpaper when enabled`);
      await page.evaluate(() => { document.body.dataset.wallpaperMotion = 'off'; });
      assert.equal(await page.locator('body').evaluate(node => getComputedStyle(node, '::before').animationName), 'none', `${mode} stops wallpaper movement when switched off`);
      const allSurfaces = await page.evaluate(() => ['.sidebar','.topbar','#mods-panel','.mod-card'].map(s => [s,getComputedStyle(document.querySelector(s)).backdropFilter]));
      assert.ok(allSurfaces.every(([,filter]) => /^blur\(/.test(filter)), `${mode} glass surfaces blur the wallpaper: ${JSON.stringify(allSurfaces)}`);
    }
    await page.evaluate(() => { document.body.dataset.theme = 'clear'; document.body.style.setProperty('--theme-surface-opacity', '82%'); });
    const crystalBlur = await page.locator('#mods-panel').evaluate(node => getComputedStyle(node).backdropFilter);
    await page.evaluate(() => { document.body.dataset.theme = 'translucent'; });
    const tealBlur = await page.locator('#mods-panel').evaluate(node => getComputedStyle(node).backdropFilter);
    assert.notEqual(crystalBlur, tealBlur, 'Crystal Glass and Frosted Teal have distinct blur strengths');
    assert.match(crystalBlur, /blur\(24px\)/, `Crystal Glass has a stronger crystalline frost: ${crystalBlur}`);
    assert.match(tealBlur, /blur\(16px\)/, `Frosted Teal has a softer background blur: ${tealBlur}`);
    const translucentAlpha = await page.locator('#mods-panel').evaluate(node => getComputedStyle(node).backgroundColor);
    assert.match(translucentAlpha, /0\.82\)$/, `The opacity control reaches its labeled safe minimum: ${translucentAlpha}`);
    await page.evaluate(() => { document.body.dataset.theme = 'aurora'; });
    const auroraOpacity = Number(await page.locator('body').evaluate(node => getComputedStyle(node, '::after').opacity));
    assert.ok(auroraOpacity <= 0.5, `Polarlicht glow remains restrained instead of washing out the UI: ${auroraOpacity}`);
    await page.evaluate(() => { document.body.dataset.theme = 'translucent'; delete document.body.dataset.wallpaper; });
    const noWallpaperSurfaces = await page.evaluate(() => ['.sidebar','.topbar','#mods-panel','.modern-card','.v3-panel','.v4-panel','.mod-card','.creator-studio'].map(selector => {
      const style = getComputedStyle(document.querySelector(selector));
      return { selector, background: style.backgroundColor, blur: style.backdropFilter };
    }));
    for (const surface of noWallpaperSurfaces) {
      const alpha = surface.background.startsWith('rgba(') ? Number(surface.background.match(/,\s*([\d.]+)\)$/)?.[1] ?? 1) : 1;
      assert.ok(alpha >= .9, `Glass stays tinted and opaque with no wallpaper: ${JSON.stringify(surface)}`);
      assert.match(surface.blur, /^blur\(/, `Glass blur remains enabled with no wallpaper: ${JSON.stringify(surface)}`);
    }
    console.log('Glass surfaces stay readable and blurred across all UI modes; wallpapers, motion, and restrained Polarlicht glow pass.');
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
