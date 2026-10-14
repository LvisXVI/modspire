const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

const root = path.resolve(__dirname, '..');
const outputDirectory = path.join(root, 'assets', 'brand');
const screenshotDirectory = path.join(root, 'docs', 'screenshots');
const version = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).version;

function imageData(file) {
  const extension = path.extname(file).toLowerCase();
  const mime = extension === '.jpg' || extension === '.jpeg' ? 'image/jpeg' : 'image/png';
  return `data:${mime};base64,${fs.readFileSync(path.join(root, file)).toString('base64')}`;
}

const images = {
  aurora: imageData('assets/shader-aurora-lake.png'),
  chat: imageData('docs/screenshots/ai-pack-assistant.jpg'),
  search: imageData('docs/screenshots/modrinth-search-and-selection.jpg'),
  designs: imageData('docs/screenshots/designs-and-minecraft-backgrounds.jpg'),
};

const shared = `
  * { box-sizing: border-box; }
  html, body { margin: 0; width: 1600px; height: 900px; overflow: hidden; }
  body { color: #f5f8ff; font-family: Inter, Aptos, "Segoe UI", sans-serif; background: #08121d; }
  .scene { position: relative; width: 1600px; height: 900px; overflow: hidden; isolation: isolate; }
  .wallpaper { position: absolute; inset: 0; z-index: -2; width: 100%; height: 100%; object-fit: cover; }
  .shade { position: absolute; inset: 0; z-index: -1; background: linear-gradient(105deg, rgba(5,13,25,.96) 0%, rgba(7,16,31,.89) 43%, rgba(11,18,38,.69) 100%); }
  .shade:after { content: ""; position: absolute; inset: 0; background: radial-gradient(ellipse at 80% 24%, rgba(124,90,246,.24), transparent 42%), radial-gradient(ellipse at 28% 84%, rgba(48,192,206,.16), transparent 44%); }
  .topline { position: absolute; top: 50px; left: 72px; right: 72px; display: flex; align-items: center; justify-content: space-between; }
  .brand { display: flex; align-items: center; gap: 16px; }
  .sigil { width: 54px; height: 54px; border-radius: 17px; display: grid; place-items: center; background: linear-gradient(140deg,#72e5de,#8a7cff); color: #071322; font-size: 29px; font-weight: 900; box-shadow: 0 0 28px rgba(91,203,227,.28); }
  .wordmark { font-weight: 900; font-size: 35px; letter-spacing: .14em; }
  .tagline { margin-top: 4px; color: #b3c8de; font-size: 15px; letter-spacing: .15em; text-transform: uppercase; }
  .version { border: 1px solid rgba(171,197,233,.4); background: rgba(16,31,52,.72); border-radius: 999px; padding: 10px 16px; color: #e5efff; font-size: 15px; font-weight: 700; }
  .frame { border: 1px solid rgba(203,223,255,.46); border-radius: 24px; overflow: hidden; background: rgba(12,24,41,.88); box-shadow: 0 26px 72px rgba(0,0,0,.48), 0 0 34px rgba(81,165,215,.12); }
  .frame img { display: block; width: 100%; height: 100%; object-fit: cover; }
  .caption { color: #95b4cf; text-transform: uppercase; font-size: 12px; font-weight: 800; letter-spacing: .15em; }
`;

const hero = `<!doctype html><html><head><meta charset="utf-8"><style>${shared}
  .hero-copy { position:absolute; left:76px; top:246px; width:440px; }
  h1 { margin:16px 0 18px; max-width:460px; font-size:55px; line-height:1.04; letter-spacing:-.04em; }
  .description { max-width:410px; color:#c5d5e8; font-size:20px; line-height:1.55; }
  .chips { display:flex; flex-wrap:wrap; gap:10px; margin-top:30px; }
  .chip { border:1px solid rgba(154,196,222,.34); border-radius:999px; padding:10px 13px; background:rgba(18,39,59,.76); color:#e3effb; font-size:13px; font-weight:700; }
  .main-shot { position:absolute; left:560px; top:194px; width:910px; height:512px; transform:rotate(-2deg); }
  .side-shot { position:absolute; right:66px; bottom:72px; width:470px; height:264px; transform:rotate(3deg); }
  .shot-label { position:absolute; left:26px; bottom:22px; padding:10px 13px; border:1px solid rgba(180,214,238,.28); border-radius:12px; background:rgba(7,17,30,.9); color:#e9f4ff; font-size:13px; font-weight:700; }
  .footer { position:absolute; left:76px; bottom:64px; color:#91a9c3; font-size:13px; letter-spacing:.08em; }
  .footer strong { color:#dceaff; }
  </style></head><body><main class="scene"><img class="wallpaper" src="${images.aurora}"><div class="shade"></div>
  <header class="topline"><div class="brand"><div class="sigil">✦</div><div><div class="wordmark">MODSPIRE</div><div class="tagline">Minecraft Modpack Studio</div></div></div><div class="version">v${version}</div></header>
  <section class="hero-copy"><div class="caption">Plan · Discover · Refine</div><h1>Build a world that feels like yours.</h1><p class="description">Shape a Minecraft pack around the way you want to play, then explore real mod listings and keep your setup in view.</p><div class="chips"><span class="chip">AI-assisted planning</span><span class="chip">Modrinth search</span><span class="chip">4 interface styles</span></div></section>
  <figure class="frame main-shot"><img src="${images.chat}" alt="Real Modspire pack assistant screen"><figcaption class="shot-label">The Pack Assistant · real app screen</figcaption></figure>
  <figure class="frame side-shot"><img src="${images.designs}" alt="Real Modspire design manager screen"><figcaption class="shot-label">World themes and appearance controls</figcaption></figure>
  <footer class="footer"><strong>Windows desktop app</strong>　·　English and German　·　Local pack projects</footer>
  </main></body></html>`;

const features = `<!doctype html><html><head><meta charset="utf-8"><style>${shared}
  .heading { position:absolute; left:72px; top:54px; }
  h1 { margin:10px 0 0; font-size:45px; letter-spacing:-.035em; }
  .intro { position:absolute; right:72px; top:83px; color:#bdcce0; font-size:17px; }
  .grid { position:absolute; left:72px; right:72px; top:172px; bottom:68px; display:grid; grid-template-columns:repeat(3,1fr); grid-template-rows:1fr 1fr; gap:22px; }
  .card { position:relative; display:flex; flex-direction:column; border:1px solid rgba(186,213,245,.34); border-radius:22px; background:linear-gradient(145deg,rgba(19,37,57,.95),rgba(12,24,41,.91)); overflow:hidden; box-shadow:0 18px 45px rgba(0,0,0,.24); }
  .preview { height:186px; overflow:hidden; border-bottom:1px solid rgba(158,192,225,.18); }
  .preview img { width:100%; height:100%; object-fit:cover; object-position:top center; }
  .copy { padding:17px 20px 18px; }
  .copy h2 { margin:7px 0 7px; font-size:22px; }
  .copy p { margin:0; color:#b8cade; font-size:15px; line-height:1.45; }
  .wide { grid-column:span 2; display:grid; grid-template-columns:1.2fr 1fr; }
  .wide .preview { height:auto; border:0; border-right:1px solid rgba(158,192,225,.18); }
  .wide .copy { align-self:center; padding:28px; }
  .pill { position:absolute; right:16px; top:15px; padding:7px 10px; border-radius:999px; background:rgba(7,16,30,.82); color:#d9eaff; font-size:11px; font-weight:800; letter-spacing:.08em; }
  .foot { position:absolute; right:72px; bottom:29px; color:#92abc7; font-size:12px; letter-spacing:.08em; }
  </style></head><body><main class="scene"><img class="wallpaper" src="${images.aurora}"><div class="shade"></div>
  <header class="heading"><div class="caption">MODSPIRE · v${version}</div><h1>One studio for every step.</h1></header><div class="intro">Real screens from the Windows app · no generated interface mockups</div>
  <section class="grid">
    <article class="card"><div class="preview"><img src="${images.chat}" alt="Pack Assistant interface"></div><div class="copy"><div class="caption">IDEA TO PACK</div><h2>Plan with the Pack Assistant</h2><p>Describe the world you want and review suggestions before adding mods.</p></div><span class="pill">AI OPTIONAL</span></article>
    <article class="card"><div class="preview"><img src="${images.search}" alt="Modrinth catalog interface"></div><div class="copy"><div class="caption">REAL CATALOG</div><h2>Search and select mods</h2><p>Browse Modrinth with your Minecraft version and loader in context.</p></div><span class="pill">MODRINTH</span></article>
    <article class="card"><div class="preview"><img src="${images.designs}" alt="Design Manager interface"></div><div class="copy"><div class="caption">MAKE IT YOURS</div><h2>Choose a look</h2><p>Switch between four layouts, themed surfaces, and Minecraft backgrounds.</p></div><span class="pill">4 UI STYLES</span></article>
    <article class="card wide"><div class="preview"><img src="${images.chat}" alt="The app chat workspace"></div><div class="copy"><div class="caption">BUILT FOR YOUR WORKFLOW</div><h2>Keep each pack organized</h2><p>Separate projects, saved chat history, local snapshots, compatibility notes, imports, and exports stay close at hand.</p></div><span class="pill">LOCAL PROJECTS</span></article>
    <article class="card"><div class="preview"><img src="${images.search}" alt="Mod choices in the catalog"></div><div class="copy"><div class="caption">YOUR CHOICE</div><h2>Review before you add</h2><p>Compare candidates and control the selection in your own pack.</p></div><span class="pill">DESKTOP</span></article>
  </section><footer class="foot">Independent community test project · Minecraft is a trademark of Microsoft</footer>
  </main></body></html>`;

async function render(page, html, output) {
  await page.setViewportSize({ width: 1600, height: 900 });
  await page.setContent(html, { waitUntil: 'load' });
  await page.screenshot({ path: output, type: 'png' });
}

async function roundScreenshot(page, source, destination) {
  const data = imageData(source);
  await page.setContent(`<!doctype html><html><head><style>*{box-sizing:border-box}html,body{margin:0;background:transparent;overflow:hidden}img{display:block;border-radius:22px;overflow:hidden}</style></head><body><img id="screen" src="${data}"></body></html>`, { waitUntil: 'load' });
  const size = await page.locator('#screen').evaluate(image => ({ width: image.naturalWidth, height: image.naturalHeight }));
  await page.setViewportSize(size);
  await page.screenshot({ path: destination, type: 'png', omitBackground: true });
}

async function renderIcon(page) {
  await page.setViewportSize({ width: 256, height: 256 });
  await page.setContent(`<!doctype html><html><head><style>
    *{box-sizing:border-box}html,body{margin:0;width:256px;height:256px;background:transparent;overflow:hidden}
    main{width:232px;height:232px;margin:12px;border-radius:66px;display:grid;place-items:center;background:linear-gradient(140deg,#74e5db 0%,#5db9e8 48%,#8e75fa 100%);box-shadow:0 12px 30px rgba(15,18,57,.32)}
    svg{width:120px;height:120px;filter:drop-shadow(0 6px 8px rgba(10,20,38,.22))}
  </style></head><body><main><svg viewBox="0 0 120 120" aria-hidden="true"><path fill="#0c1c30" d="M60 4 72 43 112 60 72 76 60 116 45 76 7 60 45 43z"/><circle cx="96" cy="24" r="7" fill="#e9fcff"/></svg></main></body></html>`, { waitUntil: 'load' });
  const pngPath = path.join(root, 'assets', 'modspire-icon.png');
  const icoPath = path.join(root, 'assets', 'modspire.ico');
  await page.screenshot({ path: pngPath, type: 'png', omitBackground: true });
  const png = fs.readFileSync(pngPath);
  const header = Buffer.alloc(22);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(1, 4);
  header.writeUInt8(0, 6);
  header.writeUInt8(0, 7);
  header.writeUInt8(0, 8);
  header.writeUInt8(0, 9);
  header.writeUInt16LE(1, 10);
  header.writeUInt16LE(32, 12);
  header.writeUInt32LE(png.length, 14);
  header.writeUInt32LE(22, 18);
  fs.writeFileSync(icoPath, Buffer.concat([header, png]));
}

async function main() {
  fs.mkdirSync(outputDirectory, { recursive: true });
  const roundedDirectory = path.join(screenshotDirectory, 'rounded');
  fs.mkdirSync(roundedDirectory, { recursive: true });
  const installedChrome = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
  const browser = await chromium.launch({
    headless: true,
    ...(fs.existsSync(installedChrome) ? { executablePath: installedChrome } : {}),
  });
  try {
    const page = await browser.newPage({ deviceScaleFactor: 1 });
    await renderIcon(page);
    await render(page, hero, path.join(outputDirectory, 'modspire-hero.png'));
    await render(page, features, path.join(outputDirectory, 'modspire-features.png'));
    for (const [source, target] of [
      ['Screenshot 2026-10-14 144418.png', 'pack-lab.png'],
      ['Screenshot 2026-10-14 144817.png', 'local-web.png'],
      ['docs/screenshots/ai-pack-assistant.jpg', 'ai-pack-assistant.png'],
      ['docs/screenshots/modrinth-search-and-selection.jpg', 'modrinth-search-and-selection.png'],
      ['docs/screenshots/designs-and-minecraft-backgrounds.jpg', 'designs-and-minecraft-backgrounds.png'],
    ]) await roundScreenshot(page, source, path.join(roundedDirectory, target));
  } finally {
    await browser.close();
  }
  console.log('README artwork rendered from the app screenshots.');
}

main().catch(error => { console.error(error); process.exitCode = 1; });
