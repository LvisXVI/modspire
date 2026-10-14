const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { _electron } = require('playwright');

(async () => {
  if (process.platform !== 'win32') {
    console.log('Windows speech integration test skipped on this platform.');
    return;
  }
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'mw-voice-test-'));
  const runner = path.join(path.resolve(__dirname, '..'), `.voice-test-${path.basename(profile)}.cjs`);
  fs.writeFileSync(runner, `const { app } = require('electron'); app.setPath('userData', ${JSON.stringify(profile)}); require(${JSON.stringify(path.resolve(__dirname, '..', 'main.cjs'))});`);
  let app;
  try {
    app = await _electron.launch({ args: [runner], timeout: 20000 });
    const page = await app.firstWindow();
    await page.waitForLoadState('domcontentloaded');
    await page.waitForSelector('#voice-input', { state: 'attached' });
    await page.waitForFunction(() => typeof window.workshop?.startVoiceInput === 'function');
    await page.evaluate(() => {
      window.workshop.startVoiceInput = async locale => ({ started:true,culture:locale,requestedCulture:locale });
      window.workshop.stopVoiceInput = async () => true;
    });
    await page.evaluate(() => document.querySelector('#voice-input').click());
    await page.waitForFunction(() => document.querySelector('#voice-input')?.getAttribute('aria-pressed') === 'true');
    await page.waitForFunction(() => /offline|installierte Sprachpaket|using Deutsch/i.test(document.querySelector('#voice-status')?.textContent || ''));
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].webContents.send('voice:event', { type: 'partial', text: 'Testmod' }));
    await page.waitForFunction(() => document.querySelector('#chat-input')?.value.includes('Testmod'));
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].webContents.send('voice:event', { type: 'result', text: 'Testmod erkannt' }));
    await page.waitForFunction(() => document.querySelector('#chat-input')?.value.includes('Testmod erkannt'));
    await page.evaluate(() => document.querySelector('#voice-input').click());
    await page.waitForFunction(() => document.querySelector('#voice-input')?.getAttribute('aria-pressed') === 'false');
    console.log('Speech UI accepts partial and final Windows-recognition events and stops cleanly (microphone input mocked).');
  } finally {
    if (app) await app.close();
    fs.unlinkSync(runner);
    if (path.dirname(path.resolve(profile)) !== path.resolve(os.tmpdir())) throw new Error('Unexpected test profile cleanup path');
    fs.rmSync(profile, { recursive: true, force: true });
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
