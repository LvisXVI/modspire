const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

(async () => {
  const root = path.resolve(__dirname, '..');
  const appHtml = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  const renderer = fs.readFileSync(path.join(root, 'renderer.js'), 'utf8');
  const appCssFiles = ['styles.css', 'desktop-polish.css', 'modern-ui.css', 'v3-ui.css', 'v4-ui.css'];
  const appCss = appCssFiles.map(file => fs.readFileSync(path.join(root, file), 'utf8')).join('\n');
  const site = fs.readFileSync(path.join(root, 'docs', 'demo', 'index.html'), 'utf8');

  assert.match(appHtml, /id="launch-intro"[^>]*aria-hidden="true"/);
  assert.match(renderer, /intro\.classList\.add\('is-ready'\)/);
  assert.match(renderer, /intro\.remove\(\)/);
  assert.doesNotMatch(appCss, /prefers-reduced-motion/);
  assert.doesNotMatch(site, /prefers-reduced-motion|motionPreference/);
  assert.match(site, /opening-type/);
  assert.match(site, /demo-row-arrive/);
  assert.match(renderer, /function animateViewTransition\(target\)/, 'section changes use one shared transition helper');
  assert.match(renderer, /if\(previousView!==view\)\{[^}]*animateViewTransition\(target\)/, 'the transition runs only when switching to another app section');

  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    const page = await browser.newPage();
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.setContent('<!doctype html><html><body><div class="launch-intro is-ready"><span class="launch-intro-mark">✦</span><div class="launch-intro-track"><span></span></div></div><section id="view" class="view-entering">Studio</section></body></html>');
    await page.addStyleTag({ content: appCss });
    const helper = renderer.match(/function animateViewTransition\(target\)\s*\{[\s\S]*?\n\}/)?.[0];
    assert.ok(helper, 'shared view transition helper is defined');
    await page.evaluate(helperText => { (new Function(`${helperText}; return animateViewTransition`))()(document.querySelector('#view')); }, helper);
    assert.equal(await page.locator('#view').evaluate(node => node.classList.contains('view-entering')), true, 'switching views applies the entrance animation');
    assert.equal(await page.locator('.launch-intro-mark').evaluate(node => getComputedStyle(node).animationName), 'intro-mark-bloom', 'the splash animation stays enabled in reduced-motion OS mode');
    assert.equal(await page.locator('#view').evaluate(node => getComputedStyle(node).animationName), 'mw-view-arrive', 'desktop view transitions stay enabled in reduced-motion OS mode');
    assert.ok(parseFloat(await page.locator('#view').evaluate(node => getComputedStyle(node).animationDuration)) <= 0.32, 'the transition stays brief and responsive');
    assert.equal(await page.locator('.launch-intro').evaluate(node => getComputedStyle(node).pointerEvents), 'none', 'the intro never blocks controls');
    assert.equal(await page.locator('.launch-intro').evaluate(node => getComputedStyle(node).zIndex), '1000');
  } finally { await browser.close(); }
  console.log('Desktop startup/view motion and GitHub Pages motion remain active independently of OS motion preference.');
})().catch(error => { console.error(error); process.exitCode = 1; });
