const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

(async () => {
  const root=path.resolve(__dirname,'..'),browser=await chromium.launch({channel:'chrome',headless:true});
  try {
    const page=await browser.newPage({viewport:{width:1440,height:920}}),errors=[];
    page.on('pageerror',error=>errors.push(error.message));
    await page.setContent(`<!doctype html><html><body data-theme="blue"><main id="chat-panel"><header class="panel-heading"><h2>Pack-Assistent</h2></header><div class="chat-messages"><article class="message"><span class="avatar">✦</span><div class="message-content"><div class="bubble">A distinct assistant response</div><div class="suggestion-row"><button class="suggestion">More visual mods</button></div><section class="chat-mod-inline-picker"><div class="chat-mod-inline-toolbar"><strong>Choose suggestions</strong><button>Large picker</button></div><div class="chat-mod-inline-results"><article class="mod-card compact-mod-card"><span class="mod-card-icon-wrap">✦</span><div class="mod-card-main"><strong>Example mod</strong></div><button class="add-mod">−</button></article></div><footer class="chat-mod-inline-actions"><button class="button-primary">Done</button></footer></section></div></article></div><form class="chat-form"><textarea id="chat-input"></textarea><button class="send-button">Send</button></form></main></body></html>`);
    const css=['styles.css','visual-fixes.css','modern-ui.css','v3-ui.css'].map(name=>fs.readFileSync(path.join(root,name),'utf8')).join('\n');
    await page.addStyleTag({content:css});
    const metrics={};
    for(const mode of ['modern','v3']){
      await page.evaluate(mode=>{document.body.className=`ui-${mode}`},mode);
      metrics[mode]=await page.evaluate(()=>({
        grid:getComputedStyle(document.querySelector('.chat-mod-inline-results')).gridTemplateColumns,
        bubbleRadius:getComputedStyle(document.querySelector('.bubble')).borderRadius,
        messageDisplay:getComputedStyle(document.querySelector('.message')).display,
        pickerBackground:getComputedStyle(document.querySelector('.chat-mod-inline-picker')).backgroundImage,
        controls:[...document.querySelectorAll('.suggestion,.add-mod,.chat-form textarea,.send-button')].every(node=>!!node.getBoundingClientRect().width)
      }));
    }
    assert.notEqual(metrics.modern.grid,metrics.v3.grid,'Modern uses a two-column picker while V3 uses a focused single-column mod deck');
    assert.notEqual(metrics.modern.bubbleRadius,metrics.v3.bubbleRadius,'chat bubbles should visibly follow their selected layout');
    assert.equal(metrics.modern.messageDisplay,'flex','Modern keeps a conversational message flow');
    assert.equal(metrics.v3.messageDisplay,'grid','V3 uses a distinct session-log layout');
    assert.ok(metrics.modern.controls&&metrics.v3.controls,'both layouts preserve the prompt, action chips, add/remove controls and send button');
    assert.deepEqual(errors,[],'layout switching must not throw');
    console.log('UI 2 and UI 3 chat layouts: distinct conversation flow and mod picker, with all actions retained.');
  } finally {await browser.close()}
})().catch(error=>{console.error(error);process.exitCode=1});
