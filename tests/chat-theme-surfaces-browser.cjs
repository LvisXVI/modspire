const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    const root = path.resolve(__dirname, '..');
    await page.setContent('<section class="assistant-choice-picker"><span class="assistant-followups-label">Choose any options that fit</span><button class="assistant-choice">Terrralith</button></section><section class="chat-mod-window"><header class="chat-mod-header"><h3>Choose suggestions</h3></header><div class="chat-mod-results"></div></section>');
    await page.addStyleTag({ path: path.join(root, 'styles.css') });
    await page.addStyleTag({ path: path.join(root, 'visual-fixes.css') });
    const source=fs.readFileSync(path.join(root,'renderer.js'),'utf8');
    const sync=source.slice(source.indexOf('function syncSuggestedModsWithPack('),source.indexOf('\nfunction openModPreview(',source.indexOf('function syncSuggestedModsWithPack(')));
    const picker=source.slice(source.indexOf('function renderChatModPicker('),source.indexOf('\nfunction renderInlineModPicker('));
    await page.evaluate(({sync,picker})=>{window.state={project:{mods:[]}};const render=new Function(`${sync}; ${picker}; return renderChatModPicker;`)();document.body.append(render({role:'assistant',modSearchStatus:'done',modResults:[]}));const viewer=document.createElement('div');viewer.className='mod-preview-dialog';viewer.innerHTML='<h2>Preview</h2>';document.body.append(viewer)}, {sync,picker});
    const themes = ['blue', 'fluid', 'clear', 'translucent', 'aurora', 'redstone', 'ender', 'emerald', 'nether'];
    for (const theme of themes) {
      const result = await page.evaluate(theme => {
        document.body.dataset.theme = theme;
        const read = selector => {
          const element = document.querySelector(selector), style = getComputedStyle(element);
          return { background: style.backgroundColor, color: style.color, border: style.borderColor };
        };
        const tokens = getComputedStyle(document.body);
        const expectedSurface = document.createElement('div'); expectedSurface.style.backgroundColor = tokens.getPropertyValue('--dialog-surface').trim();
        const expectedInk = document.createElement('div'); expectedInk.style.color = tokens.getPropertyValue('--dialog-ink').trim();
        document.body.append(expectedSurface, expectedInk);
        const expected = getComputedStyle(expectedSurface).backgroundColor;
        const ink = getComputedStyle(expectedInk).color;
        expectedSurface.remove(); expectedInk.remove();
        return {
          expected,
          ink,
          choices: read('.assistant-choice-picker'),
          options: read('.assistant-choice'),
          results: read('.chat-mod-window'),
          compact: read('.chat-mod-compact'),
          preview: read('.mod-preview-dialog'),
        };
      }, theme);
      assert.ok(result.expected, `${theme}: dialog surface token exists`);
      for (const [name, surface] of Object.entries({ choices: result.choices, results: result.results, compact:result.compact, preview:result.preview })) {
        assert.equal(surface.background, result.expected, `${theme}: ${name} uses its theme surface`);
        assert.notEqual(surface.background, 'rgb(255, 255, 255)', `${theme}: ${name} must not be white`);
        assert.notEqual(surface.border, 'rgb(255, 255, 255)', `${theme}: ${name} border must follow its palette`);
      }
      assert.notEqual(result.options.background, 'rgb(255, 255, 255)', `${theme}: option pills must not use a white fill`);
    }
    console.log(`Chat choice and inline suggestion surfaces follow all ${themes.length} theme palettes.`);
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
