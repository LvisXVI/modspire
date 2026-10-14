const assert = require('node:assert/strict');
const path = require('node:path');
const { chromium } = require('playwright');

const themes = ['blue', 'fluid', 'clear', 'translucent', 'aurora', 'redstone', 'ender', 'emerald', 'nether'];
const modes = ['classic', 'modern', 'v3', 'v4'];
function parseColor(value) {
  const match = value.match(/rgba?\((\d+(?:\.\d+)?),\s*(\d+(?:\.\d+)?),\s*(\d+(?:\.\d+)?)(?:,\s*([\d.]+))?\)/);
  assert.ok(match, `Expected a computed RGB color, got ${value}`);
  return [Number(match[1]), Number(match[2]), Number(match[3]), match[4] === undefined ? 1 : Number(match[4])];
}
function composite(foreground, background) {
  const a = foreground[3];
  return [0, 1, 2].map(i => foreground[i] * a + background[i] * (1 - a)).concat(1);
}
function luminance(color) {
  const channels = color.slice(0, 3).map(channel => {
    const value = channel / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  return .2126 * channels[0] + .7152 * channels[1] + .0722 * channels[2];
}
function contrast(foreground, background) {
  const [lighter, darker] = [luminance(foreground), luminance(background)].sort((a, b) => b - a);
  return (lighter + .05) / (darker + .05);
}

(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 850 } });
    const root = path.resolve(__dirname, '..');
    await page.setContent(`<body><main class="main-content"><section class="panel" id="chat-panel">
      <header class="panel-heading"><h2>Pack Assistant</h2><p>Conversation</p></header>
      <div class="chat-messages">
        <article class="message assistant-message"><div class="message-content"><div class="bubble"><p class="sample-copy">Assistant response</p></div></div></article>
        <article class="message user-message"><div class="message-content"><div class="bubble"><p class="user-copy">User message</p></div></div></article>
      </div>
      <form class="chat-form" id="chat-form"><div class="attach-row">Attach</div><textarea id="chat-input" placeholder="Write a message">Sample text</textarea><div class="composer-footer"><span class="composer-hint">Enter sends</span><button type="button" class="voice-button">Voice</button></div></form>
      <p class="chat-footnote">Video images are sent with your message.</p>
    </section></main></body>`);
    for (const file of ['styles.css', 'visual-fixes.css', 'modern-ui.css', 'v3-ui.css', 'v4-ui.css', 'local-web.css']) {
      await page.addStyleTag({ path: path.join(root, file) });
    }
    await page.addStyleTag({ content: '*,*::before,*::after{transition:none!important;animation:none!important}' });

    const allAssistantSurfaces = new Set();
    for (const mode of modes) {
      for (const theme of themes) {
        const result = await page.evaluate(({ mode, theme }) => {
          document.body.className = mode === 'classic' ? '' : `ui-${mode}`;
          document.body.dataset.theme = theme;
          const read = selector => {
            const node = document.querySelector(selector);
            const style = getComputedStyle(node);
            return { background: style.backgroundColor, color: style.color, backdrop: style.backdropFilter };
          };
          return {
            theme, mode,
            panel: read('#chat-panel'),
            stage: read('.chat-messages'),
            assistant: read('.assistant-message .bubble'),
            assistantCopy: read('.assistant-message .sample-copy'),
            user: read('.user-message .bubble'),
            userCopy: read('.user-message .user-copy'),
            composer: read('#chat-form'),
            input: read('#chat-input'),
            bodyCopy: read('.sample-copy'),
            hint: read('.composer-hint'),
            placeholder: getComputedStyle(document.querySelector('#chat-input'), '::placeholder').color,
          };
        }, { mode, theme });

        for (const [name, surface] of Object.entries({ panel: result.panel, stage: result.stage, assistant: result.assistant, user: result.user, composer: result.composer, input: result.input })) {
          assert.notEqual(surface.background, 'rgb(255, 255, 255)', `${mode}/${theme}: ${name} must not inherit a white chat surface`);
          assert.notEqual(surface.background, 'rgba(0, 0, 0, 0)', `${mode}/${theme}: ${name} must have a deliberate themed surface`);
        }
        allAssistantSurfaces.add(result.assistant.background);
        const stageColor = parseColor(result.stage.background);
        for (const role of ['assistant', 'user']) {
          const bubbleColor = composite(parseColor(result[role].background), stageColor);
          const textColor = parseColor(role === 'assistant' ? result.assistantCopy.color : result.userCopy.color);
          assert.ok(contrast(textColor, bubbleColor) >= 4.5, `${mode}/${theme}: ${role} message text must meet 4.5:1 contrast (got ${contrast(textColor, bubbleColor).toFixed(2)}:1)`);
        }
        const inputBackground = composite(parseColor(result.input.background), stageColor);
        assert.ok(contrast(parseColor(result.placeholder), inputBackground) >= 4.5, `${mode}/${theme}: input placeholder must meet 4.5:1 contrast`);
        assert.ok(contrast(parseColor(result.hint.color), parseColor(result.composer.background)) >= 4.5, `${mode}/${theme}: composer hint must meet 4.5:1 contrast`);
        if (theme === 'clear' || theme === 'translucent') {
          for (const [name, surface] of Object.entries({ panel: result.panel, stage: result.stage, assistant: result.assistant, user: result.user, composer: result.composer, input: result.input })) {
            assert.match(surface.backdrop, /blur\(/, `${mode}/${theme}: ${name} must blur the wallpaper behind its tinted surface`);
          }
        }
      }
    }
    assert.ok(allAssistantSurfaces.size >= themes.length, `Conversation cards must reflect the selected palette, got ${allAssistantSurfaces.size} distinct surfaces for ${themes.length} themes`);
    console.log(`Chat panel, assistant/user copy, composer, WCAG AA text contrast and glass blur passed for ${modes.length} UIs × ${themes.length} themes.`);
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
