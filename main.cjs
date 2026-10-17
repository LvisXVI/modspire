const { app, BrowserWindow, ipcMain, safeStorage, shell, clipboard, dialog, Menu } = require('electron');
const path = require('node:path');
const fs = require('node:fs/promises');
const crypto = require('node:crypto');
const zlib = require('node:zlib');
const { spawn } = require('node:child_process');
const { readIndex: readMrpackIndex, modEntries: getMrpackModEntries, loaderFromDependencies } = require('./mrpack.cjs');
const { buildModrinthSearch } = require('./catalog-search.cjs');
const { createDiagnostics } = require('./diagnostics.cjs');
const { createSetupDiscovery } = require('./setup-discovery.cjs');
const { readOllamaChatStream } = require('./ollama-stream.cjs');
const { createLocalWebServer } = require('./local-web.cjs');
const { fetchLatestRelease, downloadVerifiedAsset, buildPortableSwapScript } = require('./updater.cjs');
const { recordWeeklySnapshot, buildWeeklyFavoriteRanking, SNAPSHOT_INTERVAL_MS } = require('./weekly-favorites.cjs');
// Keep packaged upgrades on their original project and credential folder after the product rename.
if (app.isPackaged && typeof app.setPath === 'function') app.setPath('userData', path.join(app.getPath('appData'), 'Modpack-Werkstatt'));
const workshopHandlers = new Map();
let localWeb;
let nativeWebReturnPending=false,webReturnTimer;
const webLockedActions = new Set(['project:save','projects:create','projects:switch','chat:ask','settings:set-secret','settings:set-username','local-ai:save']);
function handleWorkshop(channel,handler) {
  workshopHandlers.set(channel,handler);
  ipcMain.handle(channel,(event,...args)=>{
    if(localWeb&&webLockedActions.has(channel))throw new Error('Die Web-Version ist aktiv. Wechsle zuerst zurück zur Desktop-App.');
    return handler(event,...args);
  });
}
const setupDiscovery = createSetupDiscovery(fetchModrinthJson);
let diagnostics;
function getDiagnostics() {
  return diagnostics ||= createDiagnostics(path.join(app.getPath('userData'), 'logs'), app.getVersion?.() || 'development');
}
process.on('uncaughtExceptionMonitor', error => getDiagnostics().record('main-crash', error.message, error.stack));
process.on('unhandledRejection', error => {
  getDiagnostics().record('main-rejection', error?.message || String(error), error?.stack);
  console.error('Unhandled rejection:', error);
});

const storePath = () => path.join(app.getPath('userData'), 'settings.json');
const projectPath = () => path.join(app.getPath('userData'), 'project.json');
const projectsPath = () => path.join(app.getPath('userData'), 'projects.json');
const weeklyFavoritesPath = () => path.join(app.getPath('userData'), 'modrinth-weekly-favorites.json');
Menu.setApplicationMenu(null);
let chatGPTClientPromise;
let selectedChatGPTModel;
let projectWriteQueue = Promise.resolve();
let mainWindow;
let checkedUpdate = null, stagedUpdate = null;
const voiceProcesses = new Map();

function stopVoiceProcess(webContentsId) {
  const voice = voiceProcesses.get(webContentsId);
  if (!voice) return false;
  voiceProcesses.delete(webContentsId);
  clearTimeout(voice.startupTimer);
  try { voice.child.kill(); } catch {}
  return true;
}

function startWindowsVoiceRecognizer(webContents, locale) {
  if (process.platform !== 'win32') throw new Error('WINDOWS_SPEECH_UNAVAILABLE');
  stopVoiceProcess(webContents.id);
  const culture = locale === 'en-US' ? 'en-US' : 'de-DE';
  const script = `$ErrorActionPreference='Stop'
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding $false
try {
  Add-Type -AssemblyName System.Speech
  $culture = [Globalization.CultureInfo]::GetCultureInfo('${culture}')
  $recognizers = @([System.Speech.Recognition.SpeechRecognitionEngine]::InstalledRecognizers())
  $info = $recognizers | Where-Object { $_.Culture.Name -eq $culture.Name } | Select-Object -First 1
  if (-not $info) { $info = $recognizers | Where-Object { $_.Culture.TwoLetterISOLanguageName -eq $culture.TwoLetterISOLanguageName } | Select-Object -First 1 }
  if (-not $info) { $info = $recognizers | Select-Object -First 1 }
  if (-not $info) { [Console]::WriteLine('MW_ERROR:language-unavailable'); exit 21 }
  $engine = [System.Speech.Recognition.SpeechRecognitionEngine]::new($info)
  $grammar = New-Object System.Speech.Recognition.DictationGrammar
  $engine.LoadGrammar($grammar)
  $engine.SetInputToDefaultAudioDevice()
  $engine.add_SpeechRecognized({ param($sender,$eventArgs)
    $encoded = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($eventArgs.Result.Text))
    [Console]::WriteLine('MW_RESULT:' + $encoded)
  })
  $engine.add_SpeechHypothesized({ param($sender,$eventArgs)
    $encoded = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($eventArgs.Result.Text))
    [Console]::WriteLine('MW_HYPOTHESIS:' + $encoded)
  })
  $engine.RecognizeAsync([System.Speech.Recognition.RecognizeMode]::Multiple)
  [Console]::WriteLine('MW_READY:' + $info.Culture.Name)
  while ($true) { Start-Sleep -Milliseconds 250 }
} catch {
  $encoded = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($_.Exception.Message))
  [Console]::WriteLine('MW_ERROR64:' + $encoded)
  exit 22
}`;
  const executable = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
  const child = spawn(executable, ['-NoLogo', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', Buffer.from(script, 'utf16le').toString('base64')], { windowsHide: true, stdio: ['ignore', 'pipe', 'ignore'] });
  const voice = { child, buffer: '', ready: false, resolveReady: null, rejectReady: null, startupTimer: null };
  voiceProcesses.set(webContents.id, voice);
  const ready = new Promise((resolve, reject) => { voice.resolveReady = resolve; voice.rejectReady = reject; });
  const fail = error => {
    if (!voice.ready) voice.rejectReady(error);
    else if (!webContents.isDestroyed()) webContents.send('voice:event', { type: 'error', code: error.message });
  };
  const handleLine = line => {
    if (line.startsWith('MW_READY')) { const actualCulture = line.split(':')[1] || culture; voice.ready = true; clearTimeout(voice.startupTimer); voice.resolveReady({ started: true, culture: actualCulture, requestedCulture: culture }); return; }
    if (line === 'MW_ERROR:language-unavailable') { fail(new Error('SPEECH_LANGUAGE_UNAVAILABLE')); return; }
    if (line.startsWith('MW_ERROR64:')) {
      let detail = ''; try { detail = Buffer.from(line.slice(11), 'base64').toString('utf8'); } catch {}
      fail(new Error(/audio|microphone|mikrofon|device|gerät/i.test(detail) ? 'SPEECH_MICROPHONE_UNAVAILABLE' : 'SPEECH_START_FAILED'));
      return;
    }
    if (line.startsWith('MW_RESULT:') && voice.ready && !webContents.isDestroyed()) {
      try { const text = Buffer.from(line.slice(10), 'base64').toString('utf8').trim(); if (text) webContents.send('voice:event', { type: 'result', text }); } catch {}
    }
    if (line.startsWith('MW_HYPOTHESIS:') && voice.ready && !webContents.isDestroyed()) {
      try { const text = Buffer.from(line.slice(14), 'base64').toString('utf8').trim(); if (text) webContents.send('voice:event', { type: 'partial', text }); } catch {}
    }
  };
  child.stdout.setEncoding('utf8');
  child.stdout.on('data', chunk => {
    voice.buffer += chunk;
    const lines = voice.buffer.split(/\r?\n/); voice.buffer = lines.pop() || '';
    for (const line of lines) handleLine(line.trim());
  });
  child.once('error', error => fail(new Error(error.code === 'ENOENT' ? 'SPEECH_START_FAILED' : 'SPEECH_MICROPHONE_UNAVAILABLE')));
  child.once('exit', code => {
    if (voiceProcesses.get(webContents.id) !== voice) return;
    voiceProcesses.delete(webContents.id); clearTimeout(voice.startupTimer);
    if (!voice.ready) fail(new Error(code === 21 ? 'SPEECH_LANGUAGE_UNAVAILABLE' : 'SPEECH_START_FAILED'));
    else if (code && !webContents.isDestroyed()) webContents.send('voice:event', { type: 'error', code: 'SPEECH_STOPPED' });
  });
  webContents.once('destroyed', () => stopVoiceProcess(webContents.id));
  voice.startupTimer = setTimeout(() => { stopVoiceProcess(webContents.id); voice.rejectReady(new Error('SPEECH_START_TIMEOUT')); }, 10000);
  return ready;
}

function createDefaultProject(name = 'Neues Abenteuer') {
  return { id: crypto.randomUUID(), name, minecraftVersion: '1.21.1', loader: 'fabric', provider: 'modrinth', mods: [], turns: [] };
}
function saveProjectStore(store) {
  projectWriteQueue = projectWriteQueue.catch(() => {}).then(async () => {
    const target = projectsPath();
    const temporary = `${target}.${process.pid}.tmp`;
    await fs.writeFile(temporary, JSON.stringify(store, null, 2), 'utf8');
    await fs.rename(temporary, target);
  });
  return projectWriteQueue;
}
async function readProjectStore() {
  try {
    const stored = JSON.parse(await fs.readFile(projectsPath(), 'utf8'));
    if (Array.isArray(stored.projects) && stored.projects.length) {
      stored.projects = stored.projects.map(project => ({ ...createDefaultProject(), ...project, id: String(project.id || crypto.randomUUID()), mods: Array.isArray(project.mods) ? project.mods : [], turns: Array.isArray(project.turns) ? project.turns : [] }));
      if (!stored.projects.some(project => project.id === stored.activeId)) stored.activeId = stored.projects[0].id;
      return stored;
    }
  } catch {}
  let legacy = null;
  try { legacy = JSON.parse(await fs.readFile(projectPath(), 'utf8')); } catch {}
  const first = legacy && typeof legacy === 'object' ? { ...createDefaultProject(), ...legacy, id: crypto.randomUUID(), mods: Array.isArray(legacy.mods) ? legacy.mods : [], turns: Array.isArray(legacy.turns) ? legacy.turns : [] } : createDefaultProject();
  const migrated = { activeId: first.id, projects: [first] };
  await saveProjectStore(migrated);
  return migrated;
}

async function getChatGPTClient() {
  if (!chatGPTClientPromise) {
    chatGPTClientPromise = Promise.resolve().then(() => {
      let createChatGPT;
      try { ({ createChatGPT } = require(path.join(__dirname, 'vendor', 'siwc-runtime.cjs'))); }
      catch { throw new Error('Die ChatGPT-Kontoanmeldung ist in diesem Open-Source-Build nicht enthalten. Verbinde stattdessen einen OpenAI-API-Schlüssel in den Einstellungen.'); }
      return createChatGPT({
      appName: 'Modspire',
      appId: 'modpack-werkstatt',
      redirectPort: 0,
      storageDir: path.join(app.getPath('userData'), 'chatgpt'),
      sendHostId: true,
      credentialEncryption: {
        id: 'electron-safe-storage-v1',
        isAvailable: () => app.isReady() && safeStorage.isEncryptionAvailable(),
        encrypt: value => safeStorage.encryptString(value),
        decrypt: value => safeStorage.decryptString(Buffer.from(value)),
      },
      openBrowser: async url => {
        const target = new URL(url);
        if (target.origin !== 'https://auth.openai.com') throw new Error('Unerwartetes Anmeldeziel.');
        await shell.openExternal(target.href);
      },
      });
    });
  }
  return chatGPTClientPromise;
}

async function chatGPTStatus() {
  let client;
  try { client = await getChatGPTClient(); }
  catch (error) { return { status: 'unavailable', sharing: false, models: [], modelError: error.message }; }
  const session = await client.getSession();
  let models = [];
  let modelError = '';
  if (session.status === 'connected' && session.sharing) {
    try {
      models = await client.listModels();
      selectedChatGPTModel = models.find(model => model.slug === selectedChatGPTModel)?.slug || models[0]?.slug || '';
    } catch (error) { modelError = error.message; }
  }
  return { ...session, models, modelError };
}

async function readSettings() {
  try {
    const settings = JSON.parse(await fs.readFile(storePath(), 'utf8'));
    // Earlier builds saved ChatGPT/API as a fixed provider. Move that legacy choice
    // to account-first auto once, so expired credentials can fall back safely.
    // After migration, explicit provider choices made by the user are preserved.
    if (!settings.accountFirstProviderMigration) {
      if (settings.aiProvider === 'openai' || settings.aiProvider === 'chatgpt') settings.aiProvider = 'auto';
      settings.accountFirstProviderMigration = true;
      await writeSettings(settings);
    }
    if (!settings.omniRouteProviderMigration) {
      if (settings.aiProvider === 'openrouter') settings.aiProvider = 'auto';
      settings.omniRouteProviderMigration = true;
      await writeSettings(settings);
    }
    return settings;
  }
  catch { return {}; }
}
async function writeSettings(settings) { await fs.writeFile(storePath(), JSON.stringify(settings, null, 2), { mode: 0o600 }); }
function profileInitial(name) { return Array.from(String(name || 'M').trim())[0]?.toLocaleUpperCase('de-DE') || 'M'; }
function safeFilePart(value) { return String(value || '').replace(/[<>:"/\\|?*\x00-\x1f]/g, '').replace(/[. ]+$/g, '').trim().slice(0, 48) || 'Modder'; }
function makePngIco(png, size = 64) {
  const header = Buffer.alloc(22);
  header.writeUInt16LE(0, 0); header.writeUInt16LE(1, 2); header.writeUInt16LE(1, 4);
  header.writeUInt8(size === 256 ? 0 : size, 6); header.writeUInt8(size === 256 ? 0 : size, 7); header.writeUInt8(0, 8); header.writeUInt8(0, 9);
  header.writeUInt16LE(1, 10); header.writeUInt16LE(32, 12); header.writeUInt32LE(png.length, 14); header.writeUInt32LE(22, 18);
  return Buffer.concat([header, png]);
}
function createProfileIconPng(initial) {
  const size = 64;
  const rows = Array.from({ length: size }, () => Buffer.alloc(1 + size * 4));
  const glyphs = {
    A:['01110','10001','10001','11111','10001','10001','10001'],B:['11110','10001','10001','11110','10001','10001','11110'],C:['01111','10000','10000','10000','10000','10000','01111'],D:['11110','10001','10001','10001','10001','10001','11110'],E:['11111','10000','10000','11110','10000','10000','11111'],F:['11111','10000','10000','11110','10000','10000','10000'],G:['01111','10000','10000','10111','10001','10001','01111'],H:['10001','10001','10001','11111','10001','10001','10001'],I:['11111','00100','00100','00100','00100','00100','11111'],J:['00111','00010','00010','00010','10010','10010','01100'],K:['10001','10010','10100','11000','10100','10010','10001'],L:['10000','10000','10000','10000','10000','10000','11111'],M:['10001','11011','10101','10101','10001','10001','10001'],N:['10001','11001','10101','10011','10001','10001','10001'],O:['01110','10001','10001','10001','10001','10001','01110'],P:['11110','10001','10001','11110','10000','10000','10000'],Q:['01110','10001','10001','10001','10101','10010','01101'],R:['11110','10001','10001','11110','10100','10010','10001'],S:['01111','10000','10000','01110','00001','00001','11110'],T:['11111','00100','00100','00100','00100','00100','00100'],U:['10001','10001','10001','10001','10001','10001','01110'],V:['10001','10001','10001','10001','10001','01010','00100'],W:['10001','10001','10001','10101','10101','10101','01010'],X:['10001','10001','01010','00100','01010','10001','10001'],Y:['10001','10001','01010','00100','00100','00100','00100'],Z:['11111','00001','00010','00100','01000','10000','11111'],
    '0':['01110','10001','10011','10101','11001','10001','01110'],'1':['00100','01100','00100','00100','00100','00100','01110'],'2':['01110','10001','00001','00010','00100','01000','11111'],'3':['11110','00001','00001','01110','00001','00001','11110'],'4':['00010','00110','01010','10010','11111','00010','00010'],'5':['11111','10000','10000','11110','00001','00001','11110'],'6':['01110','10000','10000','11110','10001','10001','01110'],'7':['11111','00001','00010','00100','01000','01000','01000'],'8':['01110','10001','10001','01110','10001','10001','01110'],'9':['01110','10001','10001','01111','00001','00001','01110']
  };
  const set = (x,y,color) => { if(x<0||y<0||x>=size||y>=size)return; const row=rows[y], i=1+x*4; row[i]=color[0];row[i+1]=color[1];row[i+2]=color[2];row[i+3]=color[3]??255; };
  const insideRoundRect=(x,y,left,top,right,bottom,r)=>{const cx=x<left+r?left+r:x>right-r?right-r:x,cy=y<top+r?top+r:y>bottom-r?bottom-r:y;return (cx-x)**2+(cy-y)**2<=r*r};
  for(let y=0;y<size;y++)for(let x=0;x<size;x++){
    if(!insideRoundRect(x,y,2,2,62,62,15))continue;
    set(x,y,[16,27,44,255]);
    const page=x>=13&&x<=51&&y>=8&&y<=55&&!(x<17&&y>51);
    if(page){const t=Math.max(0,Math.min(1,(x+y-21)/76));set(x,y,[Math.round(113*(1-t)+40*t),Math.round(195*(1-t)+102*t),Math.round(255*(1-t)+199*t),255]);}
    if(x>=39&&x<=51&&y>=8&&y<=20&&x+y<=59)set(x,y,[199,234,255,255]);
  }
  const char=String(initial||'M').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase();
  const glyph=glyphs[char]||['01110','10001','10001','10001','10001','10001','01110'];
  const scale=5, left=Math.floor((size-5*scale)/2), top=22;
  for(let gy=0;gy<7;gy++)for(let gx=0;gx<5;gx++)if(glyph[gy][gx]==='1')for(let dy=0;dy<scale;dy++)for(let dx=0;dx<scale;dx++)set(left+gx*scale+dx,top+gy*scale+dy,[255,255,255,255]);
  const table=Array.from({length:256},(_,n)=>{let c=n;for(let k=0;k<8;k++)c=(c&1)?0xedb88320^(c>>>1):c>>>1;return c>>>0});
  const crc32=buffer=>{let c=0xffffffff;for(const byte of buffer)c=table[(c^byte)&255]^(c>>>8);return(c^0xffffffff)>>>0};
  const chunk=(type,data)=>{const name=Buffer.from(type),body=Buffer.concat([name,data]),out=Buffer.alloc(data.length+12);out.writeUInt32BE(data.length,0);name.copy(out,4);data.copy(out,8);out.writeUInt32BE(crc32(body),8+data.length);return out};
  const raw=Buffer.concat(rows);
  return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',Buffer.from([0,0,0,size,0,0,0,size,8,6,0,0,0])),chunk('IDAT',zlib.deflateSync(raw)),chunk('IEND',Buffer.alloc(0))]);
}
async function createProfileDesktopShortcut(username, settings = {}) {
  if (process.platform !== 'win32' || !app.isPackaged) return false;
  const desktop = app.getPath('desktop');
  const initial = profileInitial(username);
  const iconDirectory = path.join(app.getPath('userData'), 'profile-icons');
  await fs.mkdir(iconDirectory, { recursive: true });
  const iconVersion = 'profile-icon-v3';
  const iconPath = path.join(iconDirectory, `${crypto.createHash('sha256').update(`${iconVersion}:${username}`).digest('hex').slice(0, 16)}.ico`);
  const png = createProfileIconPng(initial);
  await fs.writeFile(iconPath, makePngIco(png));

  const baseName = `${safeFilePart(username)} – Modspire`;
  let shortcutPath = path.join(desktop, `${baseName}.lnk`);
  for (let suffix = 2; await fs.access(shortcutPath).then(() => true, () => false); suffix++) {
    if (settings.desktopShortcutPath && path.resolve(settings.desktopShortcutPath) === path.resolve(shortcutPath)) break;
    shortcutPath = path.join(desktop, `${baseName} (${suffix}).lnk`);
  }
  const ps = `$ErrorActionPreference='Stop';$w=New-Object -ComObject WScript.Shell;$s=$w.CreateShortcut(${psQuote(shortcutPath)});$s.TargetPath=${psQuote(process.execPath)};$s.WorkingDirectory=${psQuote(path.dirname(process.execPath))};$s.IconLocation=${psQuote(iconPath)};$s.Description=${psQuote(`Modspire – lokales Profil ${username}`)};$s.Save()`;
  await new Promise((resolve, reject) => {
    const child = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', Buffer.from(ps, 'utf16le').toString('base64')], { windowsHide: true, stdio: 'ignore' });
    child.once('error', reject); child.once('exit', code => code === 0 ? resolve() : reject(new Error(`Desktop-Verknüpfung konnte nicht erstellt werden (PowerShell ${code}).`)));
  });
  if (settings.desktopShortcutPath && path.resolve(settings.desktopShortcutPath) !== path.resolve(shortcutPath) && path.dirname(path.resolve(settings.desktopShortcutPath)) === path.resolve(desktop)) {
    await fs.rm(settings.desktopShortcutPath, { force: true }).catch(() => {});
  }
  return { path: shortcutPath };
}
function psQuote(value) { return `'${String(value).replace(/'/g, "''")}'`; }
async function secret(key) {
  const settings = await readSettings();
  if (!settings[key] || !safeStorage.isEncryptionAvailable()) return '';
  try { return safeStorage.decryptString(Buffer.from(settings[key], 'base64')); } catch { return ''; }
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1420, height: 920, minWidth: 1024, minHeight: 680, center: true,
    backgroundColor: '#00000000', transparent: true, title: 'Modspire', frame: false,
    webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true }
  });
  mainWindow = win;
  if(win.webContents?.send){
    const desktopSend = win.webContents.send.bind(win.webContents);
    win.webContents.send = (channel, ...args) => { localWeb?.broadcast(channel,args[0]); return desktopSend(channel,...args); };
  }
  win.on?.('unresponsive', () => getDiagnostics().record('window-unresponsive', 'Das App-Fenster reagiert nicht.'));
  const notifyFullscreen = () => win.webContents?.send('window:fullscreen-changed', fullscreenModes.get(win) ?? win.isFullScreen());
  win.on?.('enter-full-screen', notifyFullscreen);
  win.on?.('leave-full-screen', notifyFullscreen);
  win.on?.('maximize', () => win.webContents?.send('window:maximized-changed', true));
  win.on?.('unmaximize', () => win.webContents?.send('window:maximized-changed', false));
  win.on?.('responsive', () => getDiagnostics().record('window-responsive', 'Das App-Fenster reagiert wieder.'));
  win.webContents?.on('render-process-gone', (_event, details) => getDiagnostics().record('renderer-crash', `${details.reason} (exit ${details.exitCode})`));
  win.webContents?.on('did-fail-load', (_event, code, description, _url, isMainFrame) => {
    if (isMainFrame && code !== -3) getDiagnostics().record('load-error', `${description} (${code})`);
  });
  win.webContents?.on('before-input-event', (event, input) => {
    if (input.type !== 'keyDown') return;
    if (input.key === 'F11') {
      event.preventDefault();
      setFullscreen(win, !(fullscreenModes.get(win) ?? win.isFullScreen()));
    } else if (input.key === 'Escape' && (fullscreenModes.get(win) ?? win.isFullScreen())) {
      event.preventDefault();
      setFullscreen(win, false);
    }
  });
  win.loadFile('index.html');
}

const fullscreenRestoreState = new WeakMap();
const fullscreenModes = new WeakMap();
function setFullscreen(win, enabled) {
  return new Promise(resolve => {
    if (!win || win.isDestroyed()) return resolve(false);
    const desired = !!enabled;
    const eventName = desired ? 'enter-full-screen' : 'leave-full-screen';
    const isActive = () => fullscreenModes.get(win) ?? win.isFullScreen();
    if (isActive() === desired) return resolve(desired);
    let timer;
    let settled = false;
    const finish = () => {
      if (settled || win.isDestroyed()) return;
      settled = true;
      win.removeListener(eventName, finish);
      clearTimeout(timer);
      if (desired) fullscreenModes.set(win, true);
      else {
        const restore = fullscreenRestoreState.get(win);
        if (restore) {
          if (win.isMaximized()) win.unmaximize();
          win.setBounds(restore.bounds);
          if (restore.maximized) win.maximize();
          fullscreenRestoreState.delete(win);
        }
        fullscreenModes.set(win, false);
      }
      const actual = !win.isDestroyed() && isActive();
      if (!win.isDestroyed()) win.webContents?.send('window:fullscreen-changed', actual);
      resolve(actual);
    };
    if (desired && !fullscreenRestoreState.has(win)) {
      const maximized = win.isMaximized();
      const bounds = maximized && typeof win.getNormalBounds === 'function' ? win.getNormalBounds() : win.getBounds();
      fullscreenRestoreState.set(win, { bounds, maximized });
    }
    win.once(eventName, finish);
    if (desired) {
      win.setFullScreen(true);
      timer = setTimeout(() => {
        if (!win.isDestroyed() && !win.isFullScreen() && !win.isMaximized()) win.maximize();
        finish();
      }, 900);
    } else {
      if (win.isFullScreen()) win.setFullScreen(false);
      else if (win.isMaximized()) win.unmaximize();
      timer = setTimeout(finish, 900);
    }
  });
}
handleWorkshop('diagnostics:get', () => getDiagnostics().snapshot());
handleWorkshop('diagnostics:report', (_event, report) => getDiagnostics().record(
  'renderer-error', typeof report?.message === 'string' ? report.message : 'Unbekannter Oberflächenfehler',
  typeof report?.stack === 'string' ? report.stack : ''
));
handleWorkshop('diagnostics:open-folder', async () => {
  const logs = getDiagnostics();
  await fs.mkdir(logs.directory, { recursive: true });
  const error = await shell.openPath(logs.directory);
  if (error) throw new Error(error);
  return true;
});
handleWorkshop('diagnostics:export', async () => {
  const report = getDiagnostics().snapshot();
  const result = await dialog.showSaveDialog(mainWindow, {
    title: 'App-Diagnose speichern', defaultPath: `Modspire-Diagnose-${new Date().toISOString().slice(0, 10)}.json`,
    filters: [{ name: 'Diagnosebericht', extensions: ['json'] }],
  });
  if (result.canceled || !result.filePath) return { canceled: true };
  await fs.writeFile(result.filePath, JSON.stringify({ version: report.version, entries: report.entries }, null, 2), 'utf8');
  return { canceled: false };
});

handleWorkshop('window:toggle-fullscreen', async event => {
  const win = BrowserWindow.fromWebContents(event.sender) || mainWindow;
  if (!win) return false;
  return setFullscreen(win, !(fullscreenModes.get(win) ?? win.isFullScreen()));
});
handleWorkshop('window:is-fullscreen', event => {
  const win = BrowserWindow.fromWebContents(event.sender) || mainWindow;
  return !!win && !win.isDestroyed() && (fullscreenModes.get(win) ?? win.isFullScreen());
});
handleWorkshop('window:toggle-maximized', event => {
  const win = BrowserWindow.fromWebContents(event.sender) || mainWindow;
  if (!win) return false;
  if (win.isMaximized()) win.unmaximize(); else win.maximize();
  return win.isMaximized();
});
handleWorkshop('window:minimize', event => { (BrowserWindow.fromWebContents(event.sender) || mainWindow)?.minimize(); return true; });
handleWorkshop('window:close', event => { (BrowserWindow.fromWebContents(event.sender) || mainWindow)?.close(); return true; });
handleWorkshop('window:is-maximized', event => (BrowserWindow.fromWebContents(event.sender) || mainWindow)?.isMaximized() || false);
handleWorkshop('voice:start', async (event, locale) => {
  if (!event.fromLocalWeb && !event.senderFrame?.url?.startsWith('file://')) throw new Error('Spracheingabe ist nur in der lokalen App verfügbar.');
  return startWindowsVoiceRecognizer(event.sender, locale === 'en-US' ? 'en-US' : 'de-DE');
});
handleWorkshop('voice:stop', event => stopVoiceProcess(event.sender.id));
app.on('before-quit', () => { for (const id of voiceProcesses.keys()) stopVoiceProcess(id); });

handleWorkshop('settings:get', async () => {
  const settings = await readSettings();
  let desktopShortcut = false;
  if (settings.username) {
    try {
      const shortcut = await createProfileDesktopShortcut(settings.username, settings);
      desktopShortcut = !!shortcut;
      if (shortcut) { settings.desktopShortcutPath = shortcut.path; await writeSettings(settings); }
    }
    catch (error) { console.warn('Personalisierte Desktop-Verknüpfung konnte nicht erstellt werden:', error.message); }
  }
  return { appVersion: app.getVersion(), username: typeof settings.username === 'string' ? settings.username : '', desktopShortcut, omniroute: omniRouteConfig(settings), hasOpenAIKey: !!settings.openai, hasClaudeKey: !!settings.claude, hasOmniRouteKey: !!settings.omnirouteKey, hasCurseForgeKey: !!settings.curseforge, encryptionAvailable: safeStorage.isEncryptionAvailable(), localAi: { baseUrl: settings.localAi?.baseUrl || 'http://127.0.0.1:11434', model: settings.localAi?.model || '', connected: false }, aiProvider: settings.aiProvider || 'auto' };
});
function normalizeLocalAiUrl(value) {
  let parsed;
  try { parsed = new URL(String(value || 'http://127.0.0.1:11434').trim()); } catch { throw new Error('Bitte gib eine gültige Ollama-Adresse ein.'); }
  const host = parsed.hostname.replace(/^\[|\]$/g, '').toLowerCase();
  if (!['http:', 'https:'].includes(parsed.protocol) || !['localhost', '127.0.0.1', '::1'].includes(host) || parsed.username || parsed.password) throw new Error('Ollama muss aus Datenschutzgründen auf diesem PC laufen (localhost).');
  return parsed.origin.replace(/\/$/, '');
}
async function ollamaRequest(baseUrl, endpoint, options = {}) {
  const url = `${normalizeLocalAiUrl(baseUrl)}${endpoint}`;
  let response;
  try { response = await fetch(url, { ...options, signal: options.signal || AbortSignal.timeout(8000) }); }
  catch (error) { throw new Error(`Ollama ist unter ${normalizeLocalAiUrl(baseUrl)} nicht erreichbar. Starte Ollama und prüfe die Adresse. (${error.message})`); }
  if (!response.ok) { const body = await response.json().catch(() => ({})); throw new Error(body.error || `Ollama antwortet mit HTTP ${response.status}.`); }
  return response.json();
}
let ollamaServerStart;
async function ensureOllama(baseUrl) {
  try { return await ollamaRequest(baseUrl, '/api/tags'); } catch (firstError) {
    const executable = findOllamaExecutable();
    if (!executable) throw new Error('Ollama ist noch nicht installiert. Installiere es einmal; danach kann die Werkstatt lokale Modelle automatisch starten und einrichten.');
    if (!ollamaServerStart) {
      const child = spawn(executable, ['serve'], { windowsHide: true, detached: true, stdio: 'ignore' });
      child.unref();
      ollamaServerStart = new Promise(resolve => setTimeout(resolve, 700)).finally(() => { ollamaServerStart = null; });
    }
    await ollamaServerStart;
    const deadline = Date.now() + 20000;
    while (Date.now() < deadline) {
      try { return await ollamaRequest(baseUrl, '/api/tags', { signal: AbortSignal.timeout(2500) }); } catch { await new Promise(resolve => setTimeout(resolve, 650)); }
    }
    throw firstError;
  }
}
handleWorkshop('local-ai:models', async (_event, baseUrl) => {
  const settings = await readSettings();
  const url = normalizeLocalAiUrl(baseUrl || settings.localAi?.baseUrl);
  const data = await ensureOllama(url);
  return (Array.isArray(data.models) ? data.models : []).map(model => ({ name: String(model.name || model.model || '') })).filter(model => model.name);
});
handleWorkshop('local-ai:save', async (_event, value = {}) => {
  const settings = await readSettings();
  settings.localAi = { baseUrl: normalizeLocalAiUrl(value.baseUrl), model: String(value.model || '').trim().slice(0, 120) };
  settings.aiProvider = ['auto', 'local', 'chatgpt', 'openai', 'claude', 'omniroute'].includes(value.aiProvider) ? value.aiProvider : 'auto';
  await writeSettings(settings);
  return { localAi: { ...settings.localAi, connected: false }, aiProvider: settings.aiProvider };
});
function findOllamaExecutable() {
  const candidates = [
    process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA, 'Programs', 'Ollama', 'ollama.exe'),
    process.env.ProgramFiles && path.join(process.env.ProgramFiles, 'Ollama', 'ollama.exe'),
    process.env['ProgramFiles(x86)'] && path.join(process.env['ProgramFiles(x86)'], 'Ollama', 'ollama.exe'),
    ...String(process.env.PATH || '').split(path.delimiter).map(dir => path.join(dir, process.platform === 'win32' ? 'ollama.exe' : 'ollama')),
  ].filter(Boolean);
  return candidates.find(candidate => { try { return require('node:fs').statSync(candidate).isFile(); } catch { return false; } }) || '';
}
handleWorkshop('local-ai:import-gguf', async event => {
  const owner = BrowserWindow.fromWebContents(event.sender) || mainWindow;
  const picked = await dialog.showOpenDialog(owner, { title: 'Lokales GGUF-Modell auswählen', properties: ['openFile'], filters: [{ name: 'GGUF-Modell', extensions: ['gguf'] }] });
  if (picked.canceled || !picked.filePaths[0]) return { canceled: true };
  const progress = (stage, percent) => { if (!owner.isDestroyed()) owner.webContents.send('local-ai:progress', { stage, ...(Number.isFinite(percent) ? { percent } : {}) }); };
  const modelPath = picked.filePaths[0];
  const executable = findOllamaExecutable();
  if (!executable) throw new Error('Ollama wurde nicht gefunden. Installiere zuerst Ollama von ollama.com; danach kannst du diese GGUF-Datei hier mit einem Klick einrichten. Host und Port musst du nicht konfigurieren.');
  progress('checking');
  const settings = await readSettings();
  const rawName = path.basename(modelPath, path.extname(modelPath)).toLowerCase().replace(/[^a-z0-9_.-]+/g, '-').replace(/^[^a-z0-9]+|[^a-z0-9]+$/g, '').slice(0, 48) || 'lokales-modell';
  let modelName = `werkstatt-${rawName}`;
  const localUrl = settings.localAi?.baseUrl || 'http://127.0.0.1:11434';
  const existing = new Set((await ensureOllama(localUrl)).models?.map(model => String(model.name || '').split(':')[0]) || []);
  for (let suffix = 2; existing.has(modelName); suffix++) modelName = `werkstatt-${rawName}-${suffix}`;
  const modelfilePath = path.join(app.getPath('userData'), 'Modelfile.local');
  await fs.writeFile(modelfilePath, `FROM "${modelPath.replace(/\\/g, '/').replace(/"/g, '\\"')}"\nPARAMETER num_ctx 8192\nPARAMETER temperature 0.35\n`, 'utf8');
  progress('registering', 4);
  await new Promise((resolve, reject) => {
    const child = spawn(executable, ['create', modelName, '-f', modelfilePath], { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    let stderr = '';
    const reportOutput = chunk => {
      const text = chunk.toString();stderr = (stderr + text).slice(-2500);
      const percentages = [...text.matchAll(/(?:^|\s)(\d{1,3})%/g)].map(match => Math.min(99, Number(match[1])));
      if (percentages.length) progress('registering', Math.max(...percentages));
      else if (/pulling|writing|verifying|creating/i.test(text)) progress('registering');
    };
    child.stdout.on('data', reportOutput);child.stderr.on('data', reportOutput);
    child.once('error', error => reject(new Error(`Ollama konnte nicht gestartet werden: ${error.message}`)));
    child.once('exit', code => code === 0 ? resolve() : reject(new Error(`Ollama konnte das Modell nicht einrichten. ${stderr.trim() || `Beendet mit Fehler ${code}.`}`)));
  });
  progress('saving', 96);
  settings.localAi = { baseUrl: normalizeLocalAiUrl(settings.localAi?.baseUrl), model: modelName };
  settings.aiProvider = 'local';
  await writeSettings(settings);
  progress('ready', 100);
  return { canceled: false, model: modelName, localAi: settings.localAi, aiProvider: 'local' };
});
async function callLocalAi(settings, instructions, input, { json = false, onProgress } = {}) {
  const config = settings.localAi || {};
  const model = String(config.model || '').trim();
  if (!model) throw new Error('Wähle in Einstellungen zuerst eine GGUF-Datei aus und richte sie für Ollama ein.');
  const messages = [{ role: 'system', content: instructions }, ...input.map(turn => {
    const parts = Array.isArray(turn.content) ? turn.content : [{ type: 'input_text', text: turn.content }];
    const text = parts.filter(part => part.type === 'input_text' || part.type === 'text').map(part => String(part.text || '')).join('\n');
    const images = parts.filter(part => part.type === 'input_image' && typeof part.image_url === 'string').map(part => part.image_url.replace(/^data:image\/[^;]+;base64,/, ''));
    return { role: turn.role, content: text, ...(images.length ? { images } : {}) };
  })];
  await ensureOllama(config.baseUrl);
  const response = await fetch(`${normalizeLocalAiUrl(config.baseUrl)}/api/chat`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, messages, stream: true, ...(json ? { format: 'json' } : {}), options: { num_predict: json ? 1100 : 420, temperature: json ? 0.15 : 0.35 }, keep_alive: '10m' }),
    signal: AbortSignal.timeout(180000),
  }).catch(error => { throw new Error(`Ollama ist unter ${normalizeLocalAiUrl(config.baseUrl)} nicht erreichbar. (${error.message})`); });
  if (!response.ok) { const body = await response.json().catch(() => ({})); throw new Error(body.error || `Ollama antwortet mit HTTP ${response.status}.`); }
  return readOllamaChatStream(response,onProgress);
}
async function callClaudeApi(key, instructions, input, { json = false } = {}) {
  const messages = input.filter(turn => turn.role !== 'system').map(turn => {
    if (!Array.isArray(turn.content)) return { role: turn.role === 'assistant' ? 'assistant' : 'user', content: String(turn.content || '') };
    const content = turn.content.flatMap(part => {
      if (part.type === 'input_text' || part.type === 'text') return [{ type: 'text', text: String(part.text || '') }];
      if (part.type !== 'input_image' || typeof part.image_url !== 'string') return [];
      const match = part.image_url.match(/^data:(image\/(?:jpeg|png|gif|webp));base64,([A-Za-z0-9+/=]+)$/);
      return match ? [{ type: 'image', source: { type: 'base64', media_type: match[1], data: match[2] } }] : [];
    });
    return { role: turn.role === 'assistant' ? 'assistant' : 'user', content };
  }).filter(turn => typeof turn.content === 'string' ? turn.content.trim() : turn.content.length);
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({ model: 'claude-sonnet-5', max_tokens: json ? 1400 : 900, system: instructions, messages }),
    signal: AbortSignal.timeout(60000),
  });
  if (!response.ok) {
    const detail = await response.json().catch(() => ({}));
    throw new Error(detail.error?.message || `Claude antwortet mit HTTP ${response.status}. Prüfe deinen Anthropic-API-Schlüssel und die Abrechnung im Anthropic Console-Konto.`);
  }
  const body = await response.json();
  const text = (Array.isArray(body.content) ? body.content : []).filter(block => block.type === 'text').map(block => block.text || '').join('\n').trim();
  if (!text) throw new Error('Claude hat keine Textantwort geliefert.');
  return text;
}
async function callOmniRouteApi(key, settings, instructions, input, { json = false, onProgress } = {}) {
  const config = omniRouteConfig(settings);
  const messages = [{ role: 'system', content: instructions }, ...input.map(turn => {
    if (!Array.isArray(turn.content)) return { role: turn.role === 'assistant' ? 'assistant' : 'user', content: String(turn.content || '') };
    const content = turn.content.flatMap(part => {
      if (part.type === 'input_text' || part.type === 'text') return [{ type: 'text', text: String(part.text || '') }];
      if (part.type === 'input_image' && typeof part.image_url === 'string') return [{ type: 'image_url', image_url: { url: part.image_url, detail: part.detail || 'low' } }];
      return [];
    });
    return { role: turn.role === 'assistant' ? 'assistant' : 'user', content };
  })];
  let response;
  try {
    response = await fetch(`${config.baseUrl}/v1/chat/completions`, {
      method: 'POST', headers: { ...(key ? { Authorization: `Bearer ${key}` } : {}), 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: config.model, messages, stream: true, max_tokens: json ? 2200 : 3200, ...(json ? { response_format: { type: 'json_object' } } : {}) }),
      signal: AbortSignal.timeout(120000),
    });
  } catch (error) { throw new Error(`OmniRoute ist nicht erreichbar (${error.message}). Prüfe, ob der lokale Dienst läuft.`); }
  if (!response.ok) {
    const detail = await response.json().catch(() => ({}));
    const message = detail.error?.message || detail.message || `OmniRoute antwortet mit HTTP ${response.status}.`;
    throw new Error(response.status === 401 ? 'Der OmniRoute-Endpoint-Schlüssel fehlt oder ist ungültig. Prüfe ihn in den Einstellungen.' : response.status === 429 ? 'OmniRoute meldet gerade ein Kontingent- oder Ratenlimit. Sein automatischer Fallback kann andere verbundene Modelle nutzen.' : message);
  }
  if (!response.body) throw new Error('OmniRoute hat keinen Antwortstrom geliefert.');
  const reader = response.body.getReader(), decoder = new TextDecoder();
  let buffer = '', text = '', finishReason = '';
  try {
    while (true) {
      const { value, done } = await reader.read();
      buffer += decoder.decode(value || new Uint8Array(), { stream: !done });
      const lines = buffer.split(/\r?\n/); buffer = lines.pop() || '';
      if (done && buffer.trim()) lines.push(buffer);
      for (const line of lines) {
        if (!line.startsWith('data:')) continue;
        const data = line.slice(5).trim(); if (!data || data === '[DONE]') continue;
        let event; try { event = JSON.parse(data); } catch { continue; }
        if (event.error) throw new Error(event.error.message || 'OmniRoute konnte keine Antwort erzeugen.');
        const choice = event.choices?.[0];
        if (choice?.finish_reason) finishReason = choice.finish_reason;
        const delta = choice?.delta?.content;
        const piece = typeof delta === 'string' ? delta : Array.isArray(delta) ? delta.map(part => part.text || '').join('') : '';
        if (piece) { text += piece; onProgress?.(text); }
      }
      if (done) break;
    }
  } catch (error) {
    try { await reader.cancel(error); } catch {}
    throw error;
  } finally {
    reader.releaseLock();
  }
  if (!text.trim()) throw new Error('OmniRoute hat keine Textantwort geliefert. Prüfe im OmniRoute-Dashboard verbundene Anbieter und verfügbare Modelle.');
  return text.trim() + (!json && finishReason === 'length' ? '\n\n[Die Antwort wurde vom ausgewählten Modell am Ausgabelimit beendet. Du kannst „Weiter“ schreiben.]' : '');
}

handleWorkshop('settings:set-username', async (_event, value) => {
  const username = String(value || '').normalize('NFC').trim().replace(/\s+/g, ' ').slice(0, 32);
  if (!username || !/^[\p{L}\p{N} _.-]+$/u.test(username)) throw new Error('Der Name darf Buchstaben, Zahlen, Leerzeichen, Punkt, Bindestrich und Unterstrich enthalten.');
  const settings = await readSettings();
  settings.username = username;
  await writeSettings(settings);
  let desktopShortcut = false;
  try {
    const shortcut = await createProfileDesktopShortcut(username, settings);
    desktopShortcut = !!shortcut;
    if (shortcut) { settings.desktopShortcutPath = shortcut.path; await writeSettings(settings); }
  }
  catch (error) { console.warn('Personalisierte Desktop-Verknüpfung konnte nicht erstellt werden:', error.message); }
  return { username, desktopShortcut };
});
handleWorkshop('chatgpt:status', () => chatGPTStatus());
handleWorkshop('chatgpt:connect', async () => {
  const client = await getChatGPTClient();
  await client.signIn();
  return chatGPTStatus();
});
handleWorkshop('chatgpt:disconnect', async () => {
  const client = await getChatGPTClient();
  await client.disconnect();
  selectedChatGPTModel = undefined;
  return chatGPTStatus();
});
handleWorkshop('chatgpt:cancel-sign-in', async () => { (await getChatGPTClient()).cancelSignIn(); return true; });
handleWorkshop('chatgpt:open-usage', async () => { await shell.openExternal('https://chatgpt.com/settings/usage'); return true; });
function normalizeOmniRouteUrl(value) {
  let parsed;
  try { parsed = new URL(String(value || 'http://127.0.0.1:20128/v1').trim()); } catch { throw new Error('Bitte gib eine gültige OmniRoute-Adresse ein.'); }
  const host = parsed.hostname.replace(/^\[|\]$/g, '').toLowerCase();
  if (!['http:', 'https:'].includes(parsed.protocol) || !['localhost', '127.0.0.1', '::1'].includes(host) || parsed.username || parsed.password || parsed.search || parsed.hash) throw new Error('OmniRoute muss aus Datenschutzgründen lokal auf diesem PC laufen.');
  return parsed.origin + parsed.pathname.replace(/\/+$/, '').replace(/\/v1$/i, '');
}
function omniRouteConfig(settings) {
  return { baseUrl: normalizeOmniRouteUrl(settings.omniroute?.baseUrl || 'http://127.0.0.1:20128'), model: ['auto','auto/smart','auto/fast'].includes(settings.omniroute?.model) ? settings.omniroute.model : 'auto' };
}
handleWorkshop('omniroute:save', async (_event, value = {}) => {
  const settings = await readSettings();
  settings.omniroute = { baseUrl: normalizeOmniRouteUrl(value.baseUrl), model: ['auto','auto/smart','auto/fast'].includes(value.model) ? value.model : 'auto' };
  await writeSettings(settings);
  return { omniroute: omniRouteConfig(settings), hasOmniRouteKey: !!settings.omnirouteKey };
});
handleWorkshop('omniroute:test', async () => {
  const settings = await readSettings(), config = omniRouteConfig(settings), key = await secret('omnirouteKey');
  let response;
  try { response = await fetch(`${config.baseUrl}/v1/models`, { headers: key ? { Authorization: `Bearer ${key}` } : {}, signal: AbortSignal.timeout(7000) }); }
  catch (error) { throw new Error(`OmniRoute ist unter ${config.baseUrl} nicht erreichbar. Starte OmniRoute und prüfe den lokalen Port 20128. (${error.message})`); }
  if (!response.ok) throw new Error(response.status === 401 ? 'OmniRoute antwortet, aber der gespeicherte Endpoint-Schlüssel ist ungültig.' : `OmniRoute antwortet mit HTTP ${response.status}.`);
  const body = await response.json().catch(() => ({}));
  return { ok: true, modelCount: Array.isArray(body.data) ? body.data.length : 0, model: config.model, baseUrl: config.baseUrl };
});
handleWorkshop('settings:set-secret', async (_event, name, value) => {
  if (!['openai', 'claude', 'omnirouteKey', 'curseforge'].includes(name)) throw new Error('Unbekannte Einstellung.');
  if (!safeStorage.isEncryptionAvailable()) throw new Error('Windows kann den Schlüssel auf diesem Gerät gerade nicht sicher speichern.');
  const settings = await readSettings();
  if (value) settings[name] = safeStorage.encryptString(value).toString('base64'); else delete settings[name];
  await writeSettings(settings);
  return { hasOpenAIKey: !!settings.openai, hasClaudeKey: !!settings.claude, hasOmniRouteKey: !!settings.omnirouteKey, hasCurseForgeKey: !!settings.curseforge, encryptionAvailable: true };
});
handleWorkshop('clipboard:read', () => clipboard.readText());
handleWorkshop('clipboard:write', (_event, value) => {
  const text = String(value ?? '').slice(0, 24000);
  clipboard.writeText(text);
  return true;
});

handleWorkshop('mods:search', async (_event, input) => {
  const query = String(input.query || '').trim();
  if (!query && !input.catalogSearch) return [];
  const version = String(input.minecraftVersion || '1.21.1');
  const loader = String(input.loader || 'fabric').toLowerCase();
  let provider = input.provider === 'curseforge' ? 'curseforge' : 'modrinth';
  const apiKey = provider === 'curseforge' ? await secret('curseforge') : '';
  if (provider === 'curseforge' && !apiKey) provider = 'modrinth';
  const offset = Math.max(0, Math.floor(Number(input.offset) || 0));
  const limit = Math.min(50, Math.max(1, Math.floor(Number(input.limit) || 12)));
  if (provider === 'modrinth') {
    const requestedKind = ['mod', 'visual', 'shader', 'resourcepack'].includes(input.kind) ? input.kind : 'mod';
    const projectType = requestedKind === 'shader' ? 'shader' : requestedKind === 'resourcepack' ? 'resourcepack' : 'mod';
    const url = buildModrinthSearch({ ...input, query, minecraftVersion: version, loader, limit, offset });
    const response = await fetch(url, { headers: { 'User-Agent': 'ModpackWerkstatt/0.2.3 (desktop app)' }, signal: AbortSignal.timeout(15000) });
    if (!response.ok) throw new Error(`Modrinth antwortet mit HTTP ${response.status}.`);
    const body = await response.json();
    const route = projectType === 'mod' ? 'mod' : projectType;
    return body.hits.map(m => ({ id: m.project_id, provider, kind: projectType, title: m.title, summary: m.description, author: m.author, downloads: m.downloads, relevance: Number(m.relevance_score)||0, icon: m.icon_url, gallery: Array.isArray(m.gallery) ? m.gallery.slice(0, 5) : [], url: `https://modrinth.com/${route}/${m.slug}`, categories: m.display_categories || [], compatibility: ['shader','resourcepack'].includes(projectType) ? version : `${version} · ${loader}`, source: requestedKind === 'shader' ? 'Modrinth · Shader' : requestedKind === 'resourcepack' ? 'Modrinth · Resource-Pack' : 'Modrinth' }));
  }
  const gameVersion = encodeURIComponent(version);
  const url = `https://api.curseforge.com/v1/mods/search?gameId=432&classId=6&searchFilter=${encodeURIComponent(query)}&gameVersion=${gameVersion}&modLoaderType=${loaderId(loader)}&index=${offset}&pageSize=${limit}&sortField=2&sortOrder=desc`;
  const response = await fetch(url, { headers: { 'x-api-key': apiKey, Accept: 'application/json' }, signal: AbortSignal.timeout(15000) });
  if (!response.ok) throw new Error(`CurseForge antwortet mit HTTP ${response.status}.`);
  const body = await response.json();
  return (body.data || []).map(m => ({ id: String(m.id), provider, title: m.name, summary: m.summary || '', author: m.authors?.[0]?.name || 'Unbekannt', downloads: m.downloadCount || 0, icon: m.logo?.thumbnailUrl || '', url: m.links?.websiteUrl || `https://www.curseforge.com/minecraft/mc-mods/${m.slug}`, categories: (m.categories || []).map(c => c.name), compatibility: `${version} · ${loader}`, source: 'CurseForge' }));
});

async function fetchModrinthJson(url) {
  const response = await fetch(url, { headers: { 'User-Agent': 'ModpackWerkstatt/0.2.14 (desktop app)' }, signal: AbortSignal.timeout(20000) });
  if (!response.ok) throw new Error(`Modrinth antwortet mit HTTP ${response.status}.`);
  return response.json();
}

handleWorkshop('mods:details', async (_event, input = {}) => {
  const provider = input.provider === 'curseforge' ? 'curseforge' : 'modrinth';
  const id = String(input.id || '').trim();
  if (!id || id.length > 120 || !/^[a-zA-Z0-9_-]+$/.test(id)) throw new Error('Ungültige Mod-ID.');
  if (provider === 'modrinth') {
    const project = await fetchModrinthJson(`https://api.modrinth.com/v2/project/${encodeURIComponent(id)}`);
    const gallery = (Array.isArray(project.gallery) ? project.gallery.map(image => image.url) : []).filter(value => { try { const url = new URL(String(value)); return url.protocol === 'https:' && url.hostname === 'cdn.modrinth.com'; } catch { return false; } }).slice(0, 8);
    return { description: project.description || '', gallery, url: `https://modrinth.com/${project.project_type === 'mod' ? 'mod' : project.project_type}/${project.slug}` };
  }
  const apiKey = await secret('curseforge');
  if (!apiKey) throw new Error('Für vollständige CurseForge-Beschreibungen wird ein API-Schlüssel benötigt.');
  const response = await fetch(`https://api.curseforge.com/v1/mods/${encodeURIComponent(id)}`, { headers: { 'x-api-key': apiKey, Accept: 'application/json' }, signal: AbortSignal.timeout(20000) });
  if (!response.ok) throw new Error(`CurseForge antwortet mit HTTP ${response.status}.`);
  const body = await response.json(), mod = body.data || {};
  const gallery = (Array.isArray(mod.screenshots) ? mod.screenshots.map(image => image.url || image.thumbnailUrl) : []).filter(value => { try { const url = new URL(String(value)); return url.protocol === 'https:' && url.hostname === 'media.forgecdn.net'; } catch { return false; } }).slice(0, 8);
  return { description: mod.description || mod.summary || '', gallery, url: mod.links?.websiteUrl || '' };
});

async function resolveModrinthRequiredDependencies({ mods = [], minecraftVersion = '1.21.1', loader = 'fabric' } = {}) {
  const roots = mods.filter(mod => (!mod.kind || mod.kind === 'mod') && !mod.dependency);
  const modrinthRoots = roots.filter(mod => mod.provider === 'modrinth');
  const curseForgeRoots = roots.filter(mod => mod.provider === 'curseforge');
  const seen = new Set(modrinthRoots.map(mod => String(mod.id)));
  const pending = modrinthRoots.map(mod => ({ id: String(mod.id), depth: 0 }));
  const dependencies = [];
  const unresolved = [];
  const compatibleVersions = new Map();
  const params = new URLSearchParams({ game_versions: JSON.stringify([String(minecraftVersion)]), loaders: JSON.stringify([String(loader).toLowerCase()]) });
  const compatibleVersionFor = id => {
    const key = String(id);
    if (!compatibleVersions.has(key)) compatibleVersions.set(key, fetchModrinthJson(`https://api.modrinth.com/v2/project/${encodeURIComponent(key)}/version?${params}`)
      .then(versions => versions.find(item => item.version_type === 'release') || versions[0] || null));
    return compatibleVersions.get(key);
  };
  const mapConcurrent = async (items, limit, worker) => {
    const results = new Array(items.length);
    let next = 0;
    await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) { const index = next++; results[index] = await worker(items[index], index); }
    }));
    return results;
  };
  while (pending.length && dependencies.length < 40) {
    const wave = pending.splice(0, 3);
    const compatibleRoots = await mapConcurrent(wave, 3, async current => {
      if (current.depth >= 5) return null;
      try { return { current, compatible: await compatibleVersionFor(current.id) }; }
      catch { if (current.depth) unresolved.push(current.id); return null; }
    });
    const required = compatibleRoots.filter(item => item?.compatible).flatMap(({ current, compatible }) =>
      (compatible.dependencies || []).filter(dependency => dependency.dependency_type === 'required').map(dependency => ({ current, dependency })));
    const discovered = await mapConcurrent(required, 4, async ({ current, dependency }) => {
      let dependencyVersion = null;
      if (dependency.version_id) {
        try { dependencyVersion = await fetchModrinthJson(`https://api.modrinth.com/v2/version/${encodeURIComponent(dependency.version_id)}`); }
        catch { /* Resolve the best compatible version by project below. */ }
      }
      const projectId = String(dependency.project_id || dependencyVersion?.project_id || '');
      return projectId ? { projectId, dependencyVersion, depth: current.depth + 1 } : null;
    });
    const unique = [];
    for (const candidate of discovered) {
      if (!candidate || seen.has(candidate.projectId)) continue;
      seen.add(candidate.projectId);
      unique.push(candidate);
    }
    const resolved = await mapConcurrent(unique, 4, async candidate => {
      try {
        const project = await fetchModrinthJson(`https://api.modrinth.com/v2/project/${encodeURIComponent(candidate.projectId)}`);
        if (project.project_type !== 'mod') return { project, candidate, selectedVersion: null };
        const fixedVersion = candidate.dependencyVersion;
        const compatibleFixedVersion = fixedVersion && fixedVersion.game_versions?.includes(String(minecraftVersion)) && fixedVersion.loaders?.includes(String(loader).toLowerCase());
        const selectedVersion = compatibleFixedVersion ? fixedVersion : await compatibleVersionFor(candidate.projectId);
        return { project, candidate, selectedVersion };
      } catch { unresolved.push(candidate.projectId); return null; }
    });
    for (const item of resolved) {
      if (!item) continue;
      const { project, candidate, selectedVersion } = item;
      if (project.project_type !== 'mod') continue;
      if (!selectedVersion) { unresolved.push(candidate.projectId); continue; }
      dependencies.push({ id: project.id, provider: 'modrinth', kind: 'mod', title: project.title, summary: project.description || 'Erforderliche Mod-Abhängigkeit.', author: project.author || '', downloads: project.downloads || 0, icon: project.icon_url || '', gallery: [], url: `https://modrinth.com/mod/${project.slug}`, categories: project.categories || [], compatibility: `${minecraftVersion} · ${loader}`, source: 'Modrinth · Pflicht-Abhängigkeit', dependency: true, versionId: selectedVersion.id, versionNumber: selectedVersion.version_number });
      if (dependencies.length >= 40) break;
      pending.push({ id: candidate.projectId, depth: candidate.depth });
    }
  }
  if (curseForgeRoots.length) {
    const apiKey = await secret('curseforge');
    if (!apiKey) unresolved.push('CurseForge-Abhängigkeiten benötigen einen API-Schlüssel.');
    else {
      const cfSeen = new Set(curseForgeRoots.map(mod => String(mod.id)));
      const cfPending = curseForgeRoots.map(mod => ({ id: String(mod.id), depth: 0 }));
      const fetchCf = async endpoint => {
        const response = await fetch(`https://api.curseforge.com/v1${endpoint}`, { headers: { 'x-api-key': apiKey, Accept: 'application/json' }, signal: AbortSignal.timeout(15000) });
        if (!response.ok) throw new Error(`CurseForge antwortet mit HTTP ${response.status}.`);
        return response.json();
      };
      const selectCompatibleFile = files => files.find(file => file.releaseType === 1) || files[0] || null;
      while (cfPending.length && dependencies.length < 40) {
        const current = cfPending.shift();
        if (current.depth >= 5) continue;
        try {
          const params = new URLSearchParams({ gameVersion: String(minecraftVersion), modLoaderType: String(loaderId(loader)), pageSize: '20', index: '0' });
          const files = (await fetchCf(`/mods/${encodeURIComponent(current.id)}/files?${params}`)).data || [];
          const file = selectCompatibleFile(files);
          if (!file) { if (current.depth) unresolved.push(`CurseForge:${current.id}`); continue; }
          for (const relation of file.dependencies || []) {
            if (Number(relation.relationType) !== 3) continue;
            const dependencyId = String(relation.modId || '');
            if (!dependencyId || cfSeen.has(dependencyId)) continue;
            cfSeen.add(dependencyId);
            try {
              const [modResult, dependencyFiles] = await Promise.all([
                fetchCf(`/mods/${encodeURIComponent(dependencyId)}`),
                fetchCf(`/mods/${encodeURIComponent(dependencyId)}/files?${params}`),
              ]);
              const dependencyMod = modResult.data || {};
              const dependencyFile = selectCompatibleFile(dependencyFiles.data || []);
              if (!dependencyFile) { unresolved.push(`CurseForge:${dependencyId}`); continue; }
              dependencies.push({ id: dependencyId, provider: 'curseforge', kind: 'mod', title: dependencyMod.name || dependencyFile.displayName || `Mod ${dependencyId}`, summary: dependencyMod.summary || 'Erforderliche Mod-Abhängigkeit.', author: dependencyMod.authors?.[0]?.name || '', downloads: dependencyMod.downloadCount || 0, icon: dependencyMod.logo?.thumbnailUrl || '', gallery: [], url: dependencyMod.links?.websiteUrl || '', categories: (dependencyMod.categories || []).map(category => category.name), compatibility: `${minecraftVersion} · ${loader}`, source: 'CurseForge · Pflicht-Abhängigkeit', dependency: true, versionId: String(dependencyFile.id), versionNumber: dependencyFile.displayName || dependencyFile.fileName });
              cfPending.push({ id: dependencyId, depth: current.depth + 1 });
              if (dependencies.length >= 40) break;
            } catch { unresolved.push(`CurseForge:${dependencyId}`); }
          }
        } catch { unresolved.push(`CurseForge:${current.id}`); }
      }
    }
  }
  return { dependencies, unresolved: [...new Set(unresolved)] };
}

handleWorkshop('mods:required-dependencies', (_event, input) => resolveModrinthRequiredDependencies(input));

async function makeImportedProfile(name, minecraftVersion, loader, references, summary = '') {
  const projectIds = [...new Set(references.map(entry => entry.projectId).filter(Boolean))].slice(0, 250);
  const projects = [];
  for (let index = 0; index < projectIds.length; index += 50) {
    const ids = encodeURIComponent(JSON.stringify(projectIds.slice(index, index + 50)));
    projects.push(...await fetchModrinthJson(`https://api.modrinth.com/v2/projects?ids=${ids}`));
  }
  const byId = new Map(projects.map(project => [project.id, project]));
  const seen = new Set();
  const mods = references.map(entry => {
    const project = byId.get(entry.projectId);
    const title = project?.title || String(entry.filename || 'Unbekannte Mod').replace(/\.jar$/i, '').replace(/[-_]+/g, ' ');
    const id = project?.id || entry.projectId || `mrpack:${String(entry.filename).toLowerCase()}`;
    if (seen.has(id)) return null;
    seen.add(id);
    return { id, provider: 'modrinth', title, summary: project?.description || `Aus dem Modrinth-Profil importiert (${entry.filename}).`, author: project?.author || '', downloads: project?.downloads || 0, icon: project?.icon_url || '', url: project?.slug ? `https://modrinth.com/mod/${project.slug}` : entry.url || '', categories: project?.categories || [], compatibility: `${minecraftVersion} · ${loader}`, source: project ? 'Modrinth' : 'Modrinth-Profil' };
  }).filter(Boolean);
  return { name: String(name || 'Importiertes Modrinth-Profil').slice(0, 48), minecraftVersion: String(minecraftVersion || '1.21.1'), loader: ['fabric','forge','neoforge','quilt'].includes(loader) ? loader : 'fabric', provider: 'modrinth', mods, turns: [], importSummary: summary };
}

async function importMrpackBuffer(buffer) {
  const manifest = readMrpackIndex(buffer);
  const dependencies = manifest.dependencies || {};
  const minecraftVersion = dependencies.minecraft || '1.21.1';
  const loader = loaderFromDependencies(dependencies);
  const references = getMrpackModEntries(manifest);
  return makeImportedProfile(manifest.name || 'Importiertes Modrinth-Profil', minecraftVersion, loader, references, manifest.summary || 'Modrinth-.mrpack importiert.');
}

async function importSharedInvite(inviteId) {
  const invite = await fetchModrinthJson(`https://shared-instances.modrinth.com/v1/invites/${encodeURIComponent(inviteId)}`).catch(error => { throw new Error(`Der Modrinth-Profilcode ist ungültig oder abgelaufen: ${error.message}`); });
  let shared;
  try { shared = await fetchModrinthJson(`https://shared-instances.modrinth.com/v1/instances/${encodeURIComponent(invite.instance_id)}/versions`); }
  catch { throw new Error(`„${invite.instance_name || 'Dieses Profil'}“ benötigt eine Modrinth-Kontoanmeldung zum Lesen der geteilten Modliste. Nutze alternativ „Modpack exportieren“ im Modrinth-Launcher und importiere die .mrpack-Datei.`); }
  const references = (shared.modrinth_ids || []).map(projectId => ({ projectId, filename: projectId }));
  return makeImportedProfile(invite.instance_name, invite.game_version || shared.game_version, shared.loader || 'fabric', references, 'Geteiltes Modrinth-Profil importiert.');
}

async function importModrinthProfile(input) {
  if (!input) {
    const owner = mainWindow;
    const result = await dialog.showOpenDialog(owner, { title: 'Modrinth-Modpack importieren', properties: ['openFile'], filters: [{ name: 'Modrinth-Modpack', extensions: ['mrpack'] }] });
    if (result.canceled || !result.filePaths?.[0]) return { canceled: true };
    const stats = await fs.stat(result.filePaths[0]);
    if (stats.size > 256 * 1024 * 1024) throw new Error('Die .mrpack-Datei ist größer als 256 MB.');
    return { canceled: false, ...(await importMrpackBuffer(await fs.readFile(result.filePaths[0]))) };
  }
  const value = String(input).trim();
  let slug = value;
  let versionId = '';
  let inviteId = '';
  if (/^https?:\/\//i.test(value)) {
    let parsed;
    try { parsed = new URL(value); } catch { throw new Error('Bitte einen gültigen Modrinth-Pack-Link oder Profilcode eingeben.'); }
    if (!['modrinth.com','www.modrinth.com'].includes(parsed.hostname.toLowerCase())) throw new Error('Der Link muss von modrinth.com stammen.');
    const parts = parsed.pathname.split('/').filter(Boolean);
    if (parts[0] === 'share' && parts[1]) inviteId = parts[1];
    else if (['modpack','project'].includes(parts[0]) && parts[1]) { slug = parts[1]; if (parts[2] === 'version' && parts[3]) versionId = parts[3]; }
    else throw new Error('Der Link muss ein Modrinth-Modpack oder ein geteiltes Profil öffnen.');
  }
  if (inviteId) return { canceled: false, ...(await importSharedInvite(inviteId)) };
  if (!/^[A-Za-z0-9_-]{1,100}$/.test(slug)) throw new Error('Bitte einen Modrinth-Profilcode, Pack-Link oder .mrpack-Datei wählen.');
  let project;
  try { project = await fetchModrinthJson(`https://api.modrinth.com/v2/project/${encodeURIComponent(slug)}`); }
  catch { return { canceled: false, ...(await importSharedInvite(slug)) }; }
  if (project.project_type !== 'modpack') throw new Error('Der Modrinth-Link verweist auf kein Modpack. Öffne die Modrinth-Packseite oder exportiere das Profil als .mrpack.');
  const versions = versionId ? [await fetchModrinthJson(`https://api.modrinth.com/v2/version/${encodeURIComponent(versionId)}`)] : await fetchModrinthJson(`https://api.modrinth.com/v2/project/${encodeURIComponent(project.id)}/version`);
  const version = versions.find(item => item.game_versions?.length && item.files?.some(file => file.filename?.toLowerCase().endsWith('.mrpack')));
  const file = version?.files?.find(item => item.filename?.toLowerCase().endsWith('.mrpack'));
  if (!file?.url) throw new Error('Für dieses Modrinth-Pack wurde keine importierbare .mrpack-Datei gefunden.');
  const fileUrl = new URL(file.url);
  if (fileUrl.protocol !== 'https:' || fileUrl.hostname !== 'cdn.modrinth.com') throw new Error('Die Download-Datei liegt nicht auf dem offiziellen Modrinth-CDN.');
  const response = await fetch(fileUrl, { signal: AbortSignal.timeout(30000) });
  if (!response.ok) throw new Error(`Die Modpack-Datei konnte nicht geladen werden (HTTP ${response.status}).`);
  const declaredSize = Number(response.headers.get('content-length') || file.size || 0);
  if (declaredSize > 256 * 1024 * 1024) throw new Error('Die .mrpack-Datei ist größer als 256 MB.');
  const archive = Buffer.from(await response.arrayBuffer());
  if (archive.length > 256 * 1024 * 1024) throw new Error('Die .mrpack-Datei ist größer als 256 MB.');
  const imported = await importMrpackBuffer(archive);
  return { canceled: false, ...imported, name: project.title || imported.name };
}

handleWorkshop('modrinth:import-profile', async (_event, input) => importModrinthProfile(String(input || '').trim()));
handleWorkshop('modrinth:import-file', async () => importModrinthProfile(''));

handleWorkshop('mods:versions', () => setupDiscovery.catalog());
handleWorkshop('mods:best-setup', (_event, input) => setupDiscovery.choose(input));
handleWorkshop('mods:popular', async (_event, input) => {
  const version=String(input.minecraftVersion||'1.21.1');const loader=String(input.loader||'fabric').toLowerCase();
  let provider=input.provider==='curseforge'?'curseforge':'modrinth';const apiKey=provider==='curseforge'?await secret('curseforge'):'';
  if(provider==='curseforge'&&!apiKey)provider='modrinth';
  if(provider==='modrinth'){
    const url=new URL('https://api.modrinth.com/v2/search');url.searchParams.set('facets',JSON.stringify([['project_type:mod'],[`versions:${version}`],[`categories:${loader}`]]));url.searchParams.set('limit','8');url.searchParams.set('index','downloads');
    const response=await fetch(url,{headers:{'User-Agent':'ModpackWerkstatt/0.2.3 (desktop app)'},signal:AbortSignal.timeout(15000)});if(!response.ok)throw new Error(`Modrinth antwortet mit HTTP ${response.status}.`);const body=await response.json();
    return body.hits.map(m=>({id:m.project_id,provider,title:m.title,summary:m.description,author:m.author,downloads:m.downloads,icon:m.icon_url,gallery:Array.isArray(m.gallery)?m.gallery.slice(0,5):[],url:`https://modrinth.com/mod/${m.slug}`,categories:m.display_categories||[],compatibility:`${version} · ${loader}`,source:'Modrinth'}));
  }
  const url=`https://api.curseforge.com/v1/mods/search?gameId=432&classId=6&gameVersion=${encodeURIComponent(version)}&modLoaderType=${loaderId(loader)}&pageSize=8&sortField=2&sortOrder=desc`;
  const response=await fetch(url,{headers:{'x-api-key':apiKey,Accept:'application/json'},signal:AbortSignal.timeout(15000)});if(!response.ok)throw new Error(`CurseForge antwortet mit HTTP ${response.status}.`);const body=await response.json();
  return (body.data||[]).map(m=>({id:String(m.id),provider,title:m.name,summary:m.summary||'',author:m.authors?.[0]?.name||'Unbekannt',downloads:m.downloadCount||0,icon:m.logo?.thumbnailUrl||'',gallery:Array.isArray(m.screenshots)?m.screenshots.map(image=>image.url||image.thumbnailUrl).filter(Boolean).slice(0,8):[],url:m.links?.websiteUrl||'',categories:(m.categories||[]).map(c=>c.name),compatibility:`${version} · ${loader}`,source:'CurseForge'}));
});
handleWorkshop('mods:weekly-favorites', async (_event, input = {}) => {
  const version=String(input.minecraftVersion||'1.21.1'),loader=String(input.loader||'fabric').toLowerCase();
  const queryKey=version+':'+loader;
  let cache={};
  try{cache=JSON.parse(await fs.readFile(weeklyFavoritesPath(),'utf8'))}catch{}
  if(cache.queryKey!==queryKey)cache={};
  const now=Date.now();
  if(cache.queryKey!==queryKey||!Number(cache.fetchedAt)||now-Number(cache.fetchedAt)>=SNAPSHOT_INTERVAL_MS){
    const url=new URL('https://api.modrinth.com/v2/search');
    url.searchParams.set('facets',JSON.stringify([['project_type:mod'],['versions:'+version],['categories:'+loader]]));
    url.searchParams.set('limit','100');url.searchParams.set('index','follows');
    const body=await fetchModrinthJson(url);
    const projects=(body.hits||[]).map(item=>({id:item.project_id,provider:'modrinth',kind:'mod',title:item.title,slug:item.slug,summary:item.description,author:item.author,downloads:item.downloads,follows:item.follows||0,icon:item.icon_url,gallery:Array.isArray(item.gallery)?item.gallery.slice(0,5):[],url:'https://modrinth.com/mod/'+item.slug,categories:item.display_categories||[],compatibility:version+' · '+loader,source:'Modrinth'}));
    cache=recordWeeklySnapshot(cache,projects,now);cache.queryKey=queryKey;
    const temporary=weeklyFavoritesPath()+'.tmp';
    await fs.writeFile(temporary,JSON.stringify(cache),{mode:0o600});await fs.rename(temporary,weeklyFavoritesPath());
  }
  return buildWeeklyFavoriteRanking(cache,now,24);
});
function loaderId(loader) { return ({ forge: 1, fabric: 4, quilt: 5, neoforge: 6 })[loader] || 0; }

function parseChatAnswer(raw, hasVideo) {
  let text = String(raw || 'Ich konnte keine Textantwort erzeugen.');
  const edition = hasVideo ? (text.match(/\[\[EDITION:(BEDROCK|JAVA|UNKNOWN)\]\]/i)?.[1] || 'UNKNOWN').toLowerCase() : '';
  const rawSearchTerms = [...text.matchAll(/\[\[SEARCH:([\s\S]{1,400}?)\]\]/ig)]
    .flatMap(match => match[1].split(/[;|]/))
    .map(term => term.replace(/\[[^\]]*\]\(https?:\/\/[^)]+\)/gi,' ').replace(/https?:\/\/\S+/gi,' ').replace(/\b(?:www\.)?[\w-]+\.(?:com|net|org|gg|io|de|uk|ru|eu)\b/gi,' ').replace(/[<>"`]/g,' ').replace(/\s+/g,' ').trim())
    .filter(term => term && /[\p{L}\p{N}]{2}/u.test(term) && !/^\W*$/u.test(term)).slice(0, 4);
  const searchTerms = [...new Set(rawSearchTerms)];
  const exactModNames = [...new Set([...text.matchAll(/\[\[EXACT:([\s\S]{1,300}?)\]\]/ig)]
    .flatMap(match => match[1].split(/[;|]/))
    .map(name => name.replace(/https?:\/\/\S+/gi, ' ').replace(/\s+/g, ' ').trim())
    .filter(name => name && name.length <= 80 && /[\p{L}\p{N}]{2}/u.test(name)))].slice(0, 4);
  const choices = [...text.matchAll(/\[\[CHOICES:([\s\S]{1,600}?)\]\]/ig)]
    .flatMap(match => match[1].split(/[;|]/))
    .map(choice => choice.trim().replace(/^\[([^\]]+)\]\(https?:\/\/[^)]+\)$/,'$1').replace(/https?:\/\/\S+/gi,' ').replace(/\b(?:www\.)?[\w-]+\.(?:com|net|org|gg|io|de|uk|ru|eu)\b/gi,' ').replace(/\s+/g,' ').trim())
    .filter(choice => choice && !/^\W*$/u.test(choice)).slice(0, 5);
  text = text.replace(/\[\[EDITION:(?:BEDROCK|JAVA|UNKNOWN)\]\]/ig, '').replace(/\[\[(?:SEARCH|EXACT):[\s\S]*?\]\]/ig, '').replace(/\[\[CHOICES:[\s\S]*?\]\]/ig, '').trim();
  return { text: text || 'Ich konnte keine Textantwort erzeugen.', edition, searchTerms: edition === 'bedrock' || edition === 'unknown' ? [] : searchTerms, exactModNames: edition === 'bedrock' || edition === 'unknown' ? [] : exactModNames, choices };
}

function fallbackExplicitModNames(prompt) {
  const text = String(prompt || '').replace(/\n\[Video:[\s\S]*$/, '').trim();
  if (!/(?:\bmod\b|modrinth|curseforge|installier|install|hinzuf|add\b|pack)/i.test(text)) return [];
  const quoted = [...text.matchAll(/["“]([^"”]{2,80})["”]/g)].map(match => match[1]);
  const patterns = [
    /(?:ich\s+(?:möchte|moechte|will|hätte\s+gern|haette\s+gern)|bitte\s+(?:installier|hinzufüg|hinzufueg)|installier(?:e|en)?|füge\s+(?:bitte\s+)?(?:die\s+)?(?:mod\s+)?|add\s+(?:the\s+)?(?:mod\s+)?|install\s+(?:the\s+)?(?:mod\s+)?|i\s+(?:want|need)\s+(?:the\s+)?(?:mod\s+)?)([^.!?\n,]{2,80})/ig,
    /\b(?:die|den|das)\s+mod\s+([\p{L}\p{N}_'’ -]{2,70})/giu,
  ];
  const candidates = [...quoted];
  for (const pattern of patterns) for (const match of text.matchAll(pattern)) candidates.push(match[1]);
  const stop = /\b(?:bitte|in\s+mein(?:en)?\s+pack|zum\s+pack|ins\s+pack|hinzufügen|hinzufuegen|installieren|install|please|into\s+my\s+pack|to\s+my\s+pack|add\s+it)\b[\s\S]*$/i;
  const generic = /^(?:mehr|passende?|ein(?:e|en)?|irgendwelche?|mods?|dungeons?|bosskämpfe?|erkundung|biome|technik|magie|performance|visuals?|shader|resource packs?)$/i;
  return [...new Set(candidates.map(name => {
    const words=name.replace(stop,'').replace(/\s+(?:mod|modifikation)$/i,'').replace(/["“”']/g,'').split(/\s+/).filter(Boolean);
    while(words.length&&/^(?:die|den|das|der|ein|eine|einen|einem|einer|mod)$/i.test(words[0]))words.shift();
    return words.join(' ').trim();
  }).filter(name => name.length >= 3 && name.length <= 80 && !generic.test(name) && !/^(?:mit|für|fur|aus|im|zum|pack\b)/i.test(name)))].slice(0, 5);
}

function applyExactModIntent(answer, prompt) {
  const explicit = fallbackExplicitModNames(prompt);
  answer.exactModNames = [...new Set([...(answer.exactModNames || []), ...explicit])].slice(0, 4);
  if (answer.exactModNames.length) {
    const broad = fallbackModSearchTerms(prompt).filter(term => !answer.exactModNames.some(name => name.toLowerCase() === term.toLowerCase()));
    answer.searchTerms = [...new Set([...answer.exactModNames, ...(answer.searchTerms || []), ...broad])].slice(0, 4);
  }
  return answer;
}

function fallbackModSearchTerms(prompt) {
  const request = String(prompt || '').replace(/https?:\/\/\S+/gi, ' ').replace(/\b(?:www\.)?[\w-]+\.(?:com|net|org|gg|io|de|uk|ru|eu)\b/gi, ' ').replace(/\s+/g, ' ').trim();
  if (!request) return [];
  const facets = [];
  if (/(?:\bshine\b|\bschein\b|\bshain\b)/i.test(request) && /(?:\bmod\b|modpack|modrinth|curseforge|such|find|search|vorschlag|kompatib|erset|alternative)/i.test(request)) return ['shine'];
  const groups = [
    [/(?:biom|biome|erkund|explor|survival|welt|world|dimension)/i, ['biomes', 'world generation', 'exploration']],
    [/(?:dungeon|boss|kampf|combat|waff|weapon)/i, ['dungeons', 'bosses', 'combat overhaul']],
    [/(?:magie|magic|zauber|spell|wizard|fantasy)/i, ['magic', 'spells', 'fantasy']],
    [/(?:technik|tech|automatis|automation|create)/i, ['technology', 'automation', 'create']],
    [/(?:leistung|performance|fps|lag|optimization|optimier)/i, ['performance', 'optimization', 'fps']],
    [/(?:visual|visuell|atmosph|licht|light|shader)/i, ['dynamic lights', 'ambience', 'visual effects']],
    [/(?:bau|building|dekor|decoration|farming|landwirtschaft)/i, ['building', 'decoration', 'farming']],
  ];
  for (const [pattern, terms] of groups) if (pattern.test(request)) facets.push(...terms);
  if (facets.length) return [...new Set(facets)].slice(0, 4);
  if (!/(?:\bmods?\b|modpack|modrinth|curseforge|modded|mod-vorschl|modsuche|modifikationen)/i.test(request)) return [];
  const cleaned = request.replace(/\b(?:please|find|search|recommend|suggest|passende|suche|such|finde|mir|für|fur|mein|meine|mein|modpack|modpacks|mods?|modrinth|curseforge|java|minecraft|bitte|nur|vorschläge|vorschlage)\b/gi, ' ').replace(/\s+/g, ' ').trim();
  return cleaned ? [cleaned.slice(0, 100)] : [];
}

function resolveSpokenModAlias(searchTerms, prompt, recentTurns = [], context = {}) {
  const text = [prompt, ...(Array.isArray(recentTurns) ? recentTurns.slice(-6).map(turn => turn?.content) : [])]
    .filter(Boolean).join(' ');
  const hasShineAlias = /(?:\bshine\b|\bschein\b|\bshain\b)/i.test(text);
  const modContext = /(?:\bmod\b|modpack|modrinth|curseforge|mods? suchen|find.{0,20}mod|such.{0,20}mod|pack)/i.test(text)
    || (Array.isArray(context?.mods) && context.mods.some(name => /\bshine\b/i.test(String(name))));
  if (!hasShineAlias || !modContext) return searchTerms;
  return ['shine'];
}

handleWorkshop('chat:ask', async (event, turns, context, attachments = [], requestId = '') => {
  const frames = Array.isArray(attachments) ? attachments.slice(0, 6) : [];
  if (Array.isArray(attachments) && attachments.length > 6) throw new Error('Es können höchstens sechs Videobilder ausgewertet werden.');
  for (const frame of frames) if (typeof frame !== 'string' || frame.length > 1_800_000 || !/^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/.test(frame)) throw new Error('Ein Videobild ist ungültig oder zu groß. Wähle ein kürzeres Video.');
  const hasVideo = frames.length > 0;
  const latest = (turns || []).at(-1);
  const allowAlternatives = latest?.confirmJavaAlternatives === true;
  const bedrockPending = (turns || []).some(turn => turn.role === 'assistant' && turn.edition === 'bedrock' && !turn.alternativesAccepted && !turn.alternativesDeclined);
  const requireBedrockConsent = bedrockPending && !allowAlternatives;
  const imagesInstruction = hasVideo
    ? context?.language === 'en'
      ? 'Analyze the evenly sampled frames attached from the video. Identify visible mod names, features, and clues about the Minecraft edition. If a Bedrock add-on or Bedrock Edition is likely, start with [[EDITION:BEDROCK]], briefly explain the evidence, and ask whether Java alternatives should be searched. Do not suggest Java mods or search yet. If Java mods are recognizable, start with [[EDITION:JAVA]]. If unclear, start with [[EDITION:UNKNOWN]], explain the uncertainty, and ask for more information without a search signal. Only for recognized Java mods or after explicit approval for Java alternatives, add a concise search signal in the format [[SEARCH:mod name, keywords]]; use concrete names and relevant terms without unsupported claims.'
      : 'Analysiere die angehängten, gleichmäßig aus dem Video gewählten Einzelbilder. Erkenne sichtbare Modnamen, Funktionen und Hinweise auf die Minecraft-Edition. Wenn ein Bedrock-Addon oder die Bedrock Edition wahrscheinlich ist, beginne mit [[EDITION:BEDROCK]], erkläre kurz den Beleg und frage, ob Java-Alternativen gesucht werden sollen. Schlage in diesem Fall noch keine Java-Mods vor und gib keine Suche vor. Wenn Java-Mods erkennbar sind, beginne mit [[EDITION:JAVA]]. Wenn es unklar bleibt, beginne mit [[EDITION:UNKNOWN]], benenne die Unsicherheit und bitte um mehr Informationen; gib dann noch kein Suchsignal aus. Nur für erkannte Java-Mods oder nach ausdrücklich bestätigter Bitte um Java-Alternativen füge eine knappe Suchanweisung im Format [[SEARCH:Modname, Schlüsselbegriffe]] ein; nur konkrete Modnamen und passende Suchbegriffe, keine ungesicherten Behauptungen.'
    : '';
  const consentInstruction = requireBedrockConsent
    ? context?.language === 'en' ? 'The conversation contains a recognized Bedrock add-on. The user has not approved Java alternatives: confirm the edition, ask once for consent, do not search for or name Java alternatives, and emit no search signal. Accept a no without searching.' : 'Der Verlauf enthält ein erkanntes Bedrock-Addon. Der Nutzer hat Java-Alternativen noch nicht bestätigt: bestätige die Edition, frage höchstens einmal nach Zustimmung, suche und nenne keine Java-Alternativen und gib kein Suchsignal aus. Ein Nein akzeptierst du knapp und ohne Suche.'
    : allowAlternatives && bedrockPending
      ? context?.language === 'en' ? 'The user explicitly approved Java alternatives. Search for matching Java mods now and emit concrete mod names in [[SEARCH:...]].' : 'Der Nutzer hat Java-Alternativen ausdrücklich bestätigt. Suche jetzt nach passenden Java-Mods und gib konkrete Modnamen in [[SEARCH:...]] aus.'
      : '';
  const language = context?.language === 'en' ? 'English' : 'German';
  const searchPlanningInstruction = language === 'en'
    ? 'When the user describes a modpack theme, gives an example, or asks for mods, derive concrete matching categories and search terms. IMPORTANT: if the user explicitly names one or more mods and asks to get/add/install them, do not open a broad choice flow for those named mods. Emit [[EXACT:Official Mod Name; Another Official Name]] using only names the user actually requested; the app will find and add exact catalog matches to the active pack. Still emit [[SEARCH:...]] with exact names first plus relevant category/alternative queries, so alternatives can be offered only when an exact project is unavailable. Never mark your own recommendations as EXACT. If no exact match exists, say so and offer a broader, well-ranked choice list. For vague themes, suggest rather than auto-add. Use any searchPreferences in the pack context as a local signal about query wording the user has chosen before; keep testing the user’s new wording and improve ranking from add/remove feedback. Resolve speech-recognition spellings from Minecraft context: “Schein” or “Shain” in a mod-search request means the Modrinth project “Shine”. If a name remains genuinely ambiguous, ask one short clarification. Explain mods in short, easy-to-scan paragraphs with natural line breaks and no hyphen-led bullets. Use common English Modrinth terms, avoid generic “mods”, never put URLs/domains in search signals, and account for selected mods. Search several facets, not the whole prompt verbatim. When asking for a choice, explain that several options can be selected and emit [[CHOICES:Option one|Option two]]. For general chat, emit no search signal.'
    : 'Wenn der Nutzer ein Thema oder Beispiel nennt, leite konkrete Kategorien und Suchbegriffe ab. WICHTIG: Nennt der Nutzer ausdrücklich eine oder mehrere Mods und bittet darum, sie zu bekommen/hinzuzufügen/installieren, öffne für diese Namen keine große Auswahl. Gib [[EXACT:Offizieller Modname; Weiterer offizieller Name]] ausschließlich mit den tatsächlich vom Nutzer gewünschten Namen aus; die App sucht eindeutige Katalogtreffer und fügt sie direkt dem aktiven Pack hinzu. Gib zusätzlich [[SEARCH:...]] mit den exakten Namen zuerst und passenden Kategorie-/Alternativbegriffen aus. Alternativen werden nur angeboten, wenn ein exaktes Projekt nicht verfügbar ist. Erkläre dann klar, dass kein eindeutiger Treffer gefunden wurde. Markiere eigene Empfehlungen niemals als EXACT. Bei allgemeinen Themen schlägst du Mods vor, fügst sie aber nicht automatisch hinzu. Nutze searchPreferences im Pack-Kontext als lokales Signal für Suchbegriffe, die der Nutzer zuvor ausgewählt hat; prüfe auch die neue Formulierung und verbessere die Rangfolge anhand von Hinzufügen/Entfernen. Löse Schreibweisen der Spracheingabe anhand des Minecraft-Kontexts auf: „Schein“ oder „Shain“ bedeutet bei einer Modsuche das Modrinth-Projekt „Shine“. Wenn ein Name wirklich mehrdeutig bleibt, stelle eine kurze Rückfrage. Erkläre Mods in kurzen, gut lesbaren Absätzen mit natürlichen Zeilenumbrüchen, ohne Bindestrich-Aufzählungen. Nutze übliche englische Modrinth-Suchbegriffe, vermeide pauschales „mods“, gib niemals URLs oder Domains in Suchsignalen aus und berücksichtige bereits ausgewählte Mods. Suche nach mehreren Facetten statt den ganzen Satz zu wiederholen. Bei einer Auswahl sag, dass mehrere Mods gewählt werden können, und gib [[CHOICES:Option eins|Option zwei]] aus. Bei reinem Gespräch ohne Modpack-Wunsch gib kein Suchsignal aus.';
  const creatorInstruction = context?.creatorMode
    ? language === 'en'
      ? 'You are in the AI Mod Creator. Develop a new Minecraft Java mod with the user: clarify the idea, recommend a loader and Minecraft version based on Modrinth availability, then outline a concrete project structure and example files step by step. Mark code as a draft, name needed tests, and do not add anything to the modpack. Search Modrinth projects only when the user explicitly asks for existing mods.'
      : 'Du bist im KI-Mod-Creator. Entwickle mit dem Nutzer eine neue Minecraft-Java-Mod: kläre die Idee, empfehle anhand der Modrinth-Verfügbarkeit einen passenden Loader und eine Minecraft-Version, skizziere danach eine konkrete Projektstruktur und schrittweise Beispiel-Dateien. Kennzeichne Code als Entwurf, nenne nötige Tests und füge nichts zum Modpack hinzu. Suche nur dann Modrinth-Projekte, wenn der Nutzer ausdrücklich nach vorhandenen Mods fragt.'
    : searchPlanningInstruction;
  const instructions = `${language === 'en' ? 'You are the English-language assistant for Modspire. Help the user plan and explain. Never claim a mod compatibility check was performed unless it is supported by evidence. Present mods as choices and never add them without asking.' : 'Du bist der deutsche Assistent von Modspire. Hilf beim Planen und Erklären. Behaupte nie, eine Modkompatibilität geprüft zu haben, wenn sie nicht belegt ist. Schlage Mods als Auswahl vor und füge nichts ungefragt hinzu.'} ${creatorInstruction} ${imagesInstruction} ${consentInstruction} Pack-Kontext: ${JSON.stringify(context).slice(0, 8000)}`;
  const input = (turns || []).slice(-6).map(t => ({ role: t.role === 'assistant' ? 'assistant' : 'user', content: String(t.content).slice(0, 1800) }));
  if (hasVideo) {
    if (!input.length || input[input.length - 1].role !== 'user') throw new Error('Die Videoanalyse braucht eine aktuelle Nutzernachricht.');
    input[input.length - 1].content = [{ type: 'input_text', text: input[input.length - 1].content }, ...frames.map(image_url => ({ type: 'input_image', image_url, detail: 'low' }))];
  }
  const settings = await readSettings();
  const provider = ['auto', 'local', 'chatgpt', 'openai', 'claude', 'omniroute'].includes(settings.aiProvider) ? settings.aiProvider : 'auto';
  let client = null, session = { status: 'disconnected', sharing: false };
  let raw, accountError = null;
  if (provider === 'chatgpt' || provider === 'auto') {
    try { client = await getChatGPTClient(); session = await client.getSession(); }
    catch (error) { if (provider === 'chatgpt') throw error; accountError = error; }
  }
  if (provider === 'chatgpt' && session.status !== 'connected') throw new Error('Verbinde dein ChatGPT-Konto in den Einstellungen oder wähle dort „Automatisch“ bzw. „Lokales Modell“.');
  if (provider === 'chatgpt' && session.status === 'connected' && !session.sharing) throw new Error('Du bist angemeldet, hast die Nutzung deines ChatGPT-Plans für diese App aber nicht freigegeben. Verbinde dein Konto erneut und aktiviere die Plan-Nutzung.');
  if (provider === 'chatgpt' && session.status === 'reauth_required') throw new Error('Deine ChatGPT-Verbindung muss erneuert werden. Öffne die Einstellungen und verbinde dein Konto erneut.');
  if ((provider === 'chatgpt' || provider === 'auto') && session.status === 'connected' && session.sharing) {
    try {
      const models = await client.listModels();
      selectedChatGPTModel = models.find(model => model.slug === selectedChatGPTModel)?.slug || models[0]?.slug;
      if (!selectedChatGPTModel) throw new Error('Für dein ChatGPT-Konto ist gerade kein Modell verfügbar.');
      const result = await client.streamResponse({ model: selectedChatGPTModel, input, instructions, signal: AbortSignal.timeout(60000) });
      const answer = applyExactModIntent(parseChatAnswer(result.text, hasVideo), !hasVideo && latest?.role === 'user' ? latest.content : '');
      if(!answer.searchTerms.length&&/\[\[SEARCH:/i.test(result.text)&&latest?.role==='user')answer.searchTerms=[String(latest.content||'').replace(/\n\[Video:[\s\S]*$/,'').replace(/\s+/g,' ').slice(0,120).trim()].filter(Boolean);
      if (requireBedrockConsent) answer.searchTerms = [];
      return answer;
    } catch (error) { if (provider !== 'auto') throw error; accountError = error; }
  }
  const reportProgress = text => { if (!event.sender?.isDestroyed?.() && requestId) event.sender.send('chat:progress', { requestId, text }); };
  const omniRouteKey = provider === 'omniroute' || provider === 'auto' ? await secret('omnirouteKey') : '';
  if (provider === 'omniroute' && !omniRouteKey && !settings.omniroute?.allowNoKey) throw new Error('Speichere zuerst den OmniRoute-Endpoint-Schlüssel in den Einstellungen.');
  const openAiKey = provider === 'openai' ? await secret('openai') : '';
  const claudeKey = provider === 'claude' ? await secret('claude') : '';
  if (provider === 'claude' && !claudeKey) throw new Error('Speichere zuerst deinen Anthropic-API-Schlüssel in den Einstellungen oder wähle dort einen anderen KI-Dienst.');
  if (!raw && omniRouteKey) {
    if (provider === 'auto' && accountError) reportProgress('Dein ChatGPT-Konto ist gerade nicht verfügbar. Ich prüfe OmniRoute mit automatischer Modellauswahl …');
    try { raw = await callOmniRouteApi(omniRouteKey, settings, instructions, input, { onProgress: reportProgress }); }
    catch (error) { if (provider !== 'auto' || !settings.localAi?.model) throw error; accountError = error; }
  }
  if (!raw && openAiKey) {
    input.unshift({ role: 'system', content: instructions });
    const response = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST', headers: { Authorization: `Bearer ${openAiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'gpt-5-mini', input, max_output_tokens: 700 }), signal: AbortSignal.timeout(60000)
    });
    if (!response.ok) { const detail = await response.json().catch(() => ({})); throw new Error(detail.error?.message || `KI-Dienst antwortet mit HTTP ${response.status}.`); }
    const body = await response.json();
    raw = body.output_text || body.output?.flatMap(x => x.content || []).map(x => x.text || '').join('\n');
  } else if (!raw && claudeKey) {
    raw = await callClaudeApi(claudeKey, instructions, input);
  } else if (!raw && (provider === 'local' || (provider === 'auto' && settings.localAi?.model))) {
    if (provider === 'auto' && accountError) reportProgress('Dein Cloud-Konto ist gerade nicht verfügbar. Ich wechsle zu deinem lokalen Modell …');
    raw = await callLocalAi(settings, instructions, input, { onProgress: text => {
      reportProgress(text);
    } });
  } else if (!raw) {
    if (provider === 'auto' && accountError) throw new Error(`Dein verbundener ChatGPT-Zugang ist gerade nicht verfügbar. ${accountError.message}`);
    throw new Error('Noch kein KI-Dienst eingerichtet. Verbinde dein ChatGPT-Konto, richte ein Cloud-Modell ein oder wähle ein lokales Modell aus.');
  }
  const answer = applyExactModIntent(parseChatAnswer(raw, hasVideo), !hasVideo && latest?.role === 'user' ? latest.content : '');
  if (!hasVideo && latest?.role === 'user') answer.searchTerms = resolveSpokenModAlias(answer.searchTerms, latest.content, (turns || []).slice(0, -1), context);
  if(!answer.searchTerms.length&&/\[\[SEARCH:/i.test(raw)&&latest?.role==='user')answer.searchTerms=[String(latest.content||'').replace(/\n\[Video:[\s\S]*$/,'').replace(/\s+/g,' ').slice(0,120).trim()].filter(Boolean);
  if (!answer.searchTerms.length && !hasVideo && latest?.role === 'user' && (provider === 'local' || (provider === 'auto' && !omniRouteKey && !!settings.localAi?.model))) {
    answer.searchTerms = fallbackModSearchTerms(latest.content);
    if (answer.searchTerms.length) answer.text = answer.text.replace(/\[([^\]]+)\]\(https?:\/\/[^)]+\)/gi, '$1').replace(/https?:\/\/\S+/gi, '').replace(/\s{2,}/g, ' ').trim();
  }
  if (requireBedrockConsent) answer.searchTerms = [];
  return answer;
});

function parseCompatibilityReport(raw, inventory) {
  const text = String(raw || '').replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end <= start) throw new Error('Die KI hat keinen auswertbaren Prüfbericht geliefert.');
  const parsed = JSON.parse(text.slice(start, end + 1));
  const known = new Set(inventory.map(mod => `${mod.provider}:${mod.id}`));
  const issues = (Array.isArray(parsed.issues) ? parsed.issues : []).slice(0, 20).map(issue => ({
    severity: ['error', 'warning', 'info'].includes(issue.severity) ? issue.severity : 'info',
    mods: (Array.isArray(issue.mods) ? issue.mods : []).filter(id => known.has(id)).slice(0, 8),
    message: String(issue.message || 'Möglicher Kompatibilitätshinweis').slice(0, 500),
    evidence: String(issue.evidence || 'Keine verlässliche Quelle angegeben.').slice(0, 700),
    fix: String(issue.fix || '').slice(0, 500),
  }));
  const safeRemovals = [...new Set((Array.isArray(parsed.safeRemovals) ? parsed.safeRemovals : []).filter(id => known.has(id)))];
  return {
    available: true,
    summary: String(parsed.summary || 'Prüfung abgeschlossen.').slice(0, 500),
    issues,
    safeRemovals,
    checkedAt: new Date().toISOString(),
  };
}

handleWorkshop('compatibility:check', async (_event, project) => {
  const version = String(project?.minecraftVersion || '1.21.1').slice(0, 20);
  const loader = String(project?.loader || 'fabric').slice(0, 20);
  const inventory = (Array.isArray(project?.mods) ? project.mods : []).slice(0, 40).map(mod => ({
    provider: mod.provider === 'curseforge' ? 'curseforge' : 'modrinth',
    id: String(mod.id || '').slice(0, 120),
    key: `${mod.provider === 'curseforge' ? 'curseforge' : 'modrinth'}:${String(mod.id || '').slice(0, 120)}`,
    title: String(mod.title || '').slice(0, 160),
    summary: String(mod.summary || '').slice(0, 700),
    compatibility: String(mod.compatibility || '').slice(0, 80),
    url: String(mod.url || '').slice(0, 300),
  }));
  if (!inventory.length) return { available: true, summary: project?.language === 'en' ? 'Add mods so I can check them.' : 'Füge Mods hinzu, damit ich sie prüfen kann.', issues: [], safeRemovals: [], checkedAt: new Date().toISOString() };

  const instructions = project?.language === 'en'
    ? 'Check this Minecraft Java modpack for compatibility. Evaluate Minecraft version, loader, explicitly known incompatibilities, risky feature overlap, and required dependencies. Use only reliable information from names, summaries, and links. Do not invent conflicts. If something cannot be verified, put it in summary or as an info/warning and label the uncertainty. Return only JSON with {"summary":"...","issues":[{"severity":"error|warning|info","mods":["provider:id"],"message":"...","evidence":"...","fix":"..."}],"safeRemovals":["provider:id"]}. safeRemovals may contain only IDs from the supplied inventory and only clearly conflict-causing mods whose removal fixes a supported issue. Do not add mods automatically.'
    : 'Du prüfst Minecraft-Java-Modpacks auf Kompatibilität. Beurteile Minecraft-Version, Loader, ausdrücklich bekannte gegenseitige Ausschlüsse, doppelte Funktionen mit Konfliktrisiko und zwingende Abhängigkeiten. Nutze nur belastbares Wissen aus den Namen, Kurzbeschreibungen und Links. Erfinde keine Konflikte. Wenn etwas nicht sicher verifizierbar ist, schreibe es in summary oder als info/warning und kennzeichne die Unsicherheit. Liefere ausschließlich JSON mit {"summary":"...","issues":[{"severity":"error|warning|info","mods":["provider:id"],"message":"...","evidence":"...","fix":"..."}],"safeRemovals":["provider:id"]}. safeRemovals darf nur IDs aus dem übermittelten Bestand enthalten und nur eindeutig konfliktverursachende Mods umfassen, deren Entfernung einen belegten Fehler behebt. Keine Mods automatisch ergänzen.';
  const input = [{ role: 'user', content: JSON.stringify({ minecraftVersion: version, loader, mods: inventory }) }];
  let raw;
  const settings = await readSettings();
  const provider = ['auto', 'local', 'chatgpt', 'openai', 'claude', 'omniroute'].includes(settings.aiProvider) ? settings.aiProvider : 'auto';
  let client = null, session = { status: 'disconnected', sharing: false }, accountError = null;
  if (provider === 'chatgpt' || provider === 'auto') {
    try { client = await getChatGPTClient(); session = await client.getSession(); }
    catch (error) { if (provider === 'chatgpt') throw error; accountError = error; }
  }
  if ((provider === 'chatgpt' || provider === 'auto') && session.status === 'connected' && session.sharing) {
    try {
      const models = await client.listModels();
      selectedChatGPTModel = models.find(model => model.slug === selectedChatGPTModel)?.slug || models[0]?.slug;
      if (!selectedChatGPTModel) throw new Error('Für dein ChatGPT-Konto ist gerade kein Modell verfügbar.');
      const result = await client.streamResponse({ model: selectedChatGPTModel, input, instructions, signal: AbortSignal.timeout(60000) });
      raw = result.text;
    } catch (error) { if (provider !== 'auto') throw error; accountError = error; }
  }
  if (provider === 'chatgpt' && !raw) throw new Error(session.status === 'reauth_required' ? 'Deine ChatGPT-Verbindung muss erneuert werden.' : 'Verbinde dein ChatGPT-Konto und gib die Plan-Nutzung frei.');
  if (!raw) {
    const omniRouteKey = provider === 'omniroute' || provider === 'auto' ? await secret('omnirouteKey') : '';
    if (provider === 'omniroute' && !omniRouteKey) throw new Error('Speichere zuerst den OmniRoute-Endpoint-Schlüssel in den Einstellungen.');
    const openAiKey = provider === 'openai' ? await secret('openai') : '';
    const claudeKey = provider === 'claude' ? await secret('claude') : '';
    if (provider === 'claude' && !claudeKey) throw new Error('Speichere zuerst deinen Anthropic-API-Schlüssel in den Einstellungen.');
    if (omniRouteKey) {
      try { raw = await callOmniRouteApi(omniRouteKey, settings, instructions, input, { json: true }); }
      catch (error) { if (provider !== 'auto' || !settings.localAi?.model) throw error; accountError = error; }
    }
    if (!raw && claudeKey) raw = await callClaudeApi(claudeKey, instructions, input, { json: true });
    if (!raw && openAiKey) {
    const response = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST', headers: { Authorization: `Bearer ${openAiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'gpt-5-mini', input: [{ role: 'system', content: instructions }, ...input] }), signal: AbortSignal.timeout(60000),
    });
    if (!response.ok) { const detail = await response.json().catch(() => ({})); throw new Error(detail.error?.message || `KI-Dienst antwortet mit HTTP ${response.status}.`); }
    const body = await response.json();
    raw = body.output_text || body.output?.flatMap(item => item.content || []).map(item => item.text || '').join('\n');
    }
    if (!raw && (provider === 'local' || (provider === 'auto' && settings.localAi?.model))) raw = await callLocalAi(settings, instructions, input, { json: true });
    if (!raw && provider === 'auto' && accountError) return { available: false, summary: `Dein ChatGPT-Zugang ist gerade nicht verfügbar. ${accountError.message} Versions- und Loaderangaben wurden lokal geprüft.`, issues: [], safeRemovals: [], checkedAt: new Date().toISOString() };
    if (!raw) return { available: false, summary: 'Keine KI verbunden. Versions- und Loaderangaben werden lokal geprüft.', issues: [], safeRemovals: [], checkedAt: new Date().toISOString() };
  }
  return parseCompatibilityReport(raw, inventory);
});

handleWorkshop('projects:list', async () => readProjectStore());
handleWorkshop('projects:create', async (_event, name) => {
  const store = await readProjectStore();
  const cleanName = String(name || '').trim().slice(0, 48) || `Neues Modpack ${store.projects.length + 1}`;
  const project = createDefaultProject(cleanName);
  store.projects.push(project); store.activeId = project.id;
  await saveProjectStore(store);
  return store;
});
handleWorkshop('projects:switch', async (_event, id) => {
  const store = await readProjectStore();
  const project = store.projects.find(item => item.id === id);
  if (!project) throw new Error('Dieses Modpack wurde nicht gefunden.');
  store.activeId = project.id;
  await saveProjectStore(store);
  return project;
});
handleWorkshop('project:load', async () => {
  const store = await readProjectStore();
  return store.projects.find(project => project.id === store.activeId) || store.projects[0];
});
handleWorkshop('project:save', async (_event, project) => {
  if (!project || typeof project !== 'object' || !Array.isArray(project.mods)) throw new Error('Das Modpack-Projekt ist ungültig.');
  const store = await readProjectStore();
  let target = store.projects.find(item => item.id === project.id) || store.projects.find(item => item.id === store.activeId);
  if (!target) { target = createDefaultProject(); store.projects.push(target); }
  Object.assign(target, project, { id: target.id, name: String(project.name || target.name).slice(0, 48), mods: project.mods, turns: Array.isArray(project.turns) ? project.turns : [] });
  store.activeId = target.id;
  await saveProjectStore(store); return true;
});
handleWorkshop('project:export', async (event, project) => {
  if (!project || typeof project !== 'object' || !Array.isArray(project.mods)) throw new Error('Das Projekt kann nicht exportiert werden.');
  const owner = BrowserWindow.fromWebContents(event.sender);
  const { canceled, filePath } = await dialog.showSaveDialog(owner, {
    title: 'Modpack-Projekt exportieren',
    defaultPath: `${String(project.name || 'Modpack-Projekt').replace(/[<>:"/\\|?*]/g, '-').slice(0, 48)}.json`,
    filters: [{ name: 'Modpack-Projekt', extensions: ['json'] }],
  });
  if (canceled || !filePath) return { canceled: true };
  const exportData = { format: 'modpack-werkstatt-project', version: 1, exportedAt: new Date().toISOString(), project };
  await fs.writeFile(filePath, JSON.stringify(exportData, null, 2), 'utf8');
  return { canceled: false, filePath };
});
handleWorkshop('launcher:open', async () => {
  const candidates = [path.join(process.env.APPDATA || '', '.minecraft'), path.join(process.env.LOCALAPPDATA || '', 'Packages')];
  const mc = candidates[0];
  const profiles = path.join(mc, 'launcher_profiles.json');
  try { await fs.access(profiles); await shell.openPath(mc); return { found: true, path: mc }; }
  catch { await shell.openExternal('minecraft://'); return { found: false }; }
});
handleWorkshop('app:open-external', async (_event, url) => {
  const parsed = new URL(url);
  if (parsed.protocol !== 'https:') throw new Error('Nur HTTPS-Links dürfen geöffnet werden.');
  await shell.openExternal(parsed.href);
});

function requirePackagedWindowsUpdater(event) {
  if (!app.isPackaged || process.platform !== 'win32' || event.fromLocalWeb || !event.senderFrame?.url?.startsWith('file://')) throw new Error('Der automatische Updater ist nur in der portablen Windows-App verfügbar.');
}
handleWorkshop('updates:check', async event => {
  requirePackagedWindowsUpdater(event);
  checkedUpdate = await fetchLatestRelease({ currentVersion: app.getVersion() });
  return checkedUpdate;
});
handleWorkshop('updates:download', async (event) => {
  requirePackagedWindowsUpdater(event);
  if (!checkedUpdate?.updateAvailable) throw new Error('Prüfe zuerst, ob ein neues Release verfügbar ist.');
  const updateDirectory = path.join(app.getPath('userData'), 'updates');
  const downloaded = path.join(updateDirectory, `${checkedUpdate.asset.name}.verified`);
  const currentExe = path.resolve(process.execPath);
  const stagedExe = path.join(path.dirname(currentExe), `.${path.basename(currentExe)}.modspire-update`);
  const backupExe = path.join(path.dirname(currentExe), `.${path.basename(currentExe)}.previous`);
  await fs.mkdir(updateDirectory, { recursive: true });
  await downloadVerifiedAsset({ url: checkedUpdate.asset.url, destination: downloaded, expectedDigest: checkedUpdate.asset.digest, expectedSize: checkedUpdate.asset.size, onProgress: progress => { if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('updates:progress', progress); } });
  await fs.rm(stagedExe, { force: true });
  await fs.copyFile(downloaded, stagedExe, require('node:fs').constants.COPYFILE_EXCL);
  stagedUpdate = { currentExe, stagedExe, backupExe, release: checkedUpdate };
  return { version: checkedUpdate.version, bytes: checkedUpdate.asset.size, ready: true };
});
handleWorkshop('updates:install', async event => {
  requirePackagedWindowsUpdater(event);
  if (!stagedUpdate) throw new Error('Es liegt kein geprüftes Update zur Installation bereit.');
  const scriptPath = path.join(app.getPath('userData'), 'updates', 'install-update.ps1');
  await fs.writeFile(scriptPath, buildPortableSwapScript({ ...stagedUpdate, pid: process.pid }), { encoding: 'utf8', mode: 0o600 });
  const child = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-WindowStyle', 'Hidden', '-File', scriptPath], { detached: true, windowsHide: true, stdio: 'ignore' });
  await new Promise((resolve, reject) => { child.once('spawn', resolve); child.once('error', reject); });
  child.unref();
  setTimeout(() => app.quit(), 350);
  return { restarting: true };
});

function finishLocalWebReturn(server){
  nativeWebReturnPending=false;clearTimeout(webReturnTimer);
  const preferences=server?.preferences();
  if(mainWindow)stopVoiceProcess(mainWindow.webContents.id);
  setTimeout(async()=>{
    if(server){await server.close();if(localWeb===server)localWeb=null;}
    if(mainWindow&&!mainWindow.isDestroyed()){mainWindow.show();mainWindow.focus();mainWindow.webContents.send('web:active',{active:false,preferences});}
  },150);
  return true;
}
function scheduleClosedBrowserReturn(){
  clearTimeout(webReturnTimer);
  const server=localWeb;
  if(!nativeWebReturnPending||!server)return;
  webReturnTimer=setTimeout(()=>{
    if(!nativeWebReturnPending||localWeb!==server||server.connectionCount())return;
    if(server.hasEditor())scheduleClosedBrowserReturn();else finishLocalWebReturn(server);
  },300);
}
handleWorkshop('web:open', async (_event, preferences = {}) => {
  await projectWriteQueue;
  if(mainWindow)stopVoiceProcess(mainWindow.webContents.id);
  if(!localWeb) localWeb = await createLocalWebServer({root:__dirname,preferences,onEditorDisconnected:scheduleClosedBrowserReturn,invoke:(channel,args)=>{
    const handler=workshopHandlers.get(channel);
    if(!handler||!mainWindow||mainWindow.isDestroyed())throw new Error('Die Desktop-App ist nicht mehr verfügbar.');
    return handler({sender:mainWindow.webContents,senderFrame:mainWindow.webContents.mainFrame,fromLocalWeb:true},...args);
  }});
  try {
    await shell.openExternal(localWeb.launchUrl());
    mainWindow.webContents.send('web:active',{active:true});
    return {origin:localWeb.origin};
  }catch(error){await localWeb.close();localWeb=null;throw error;}
});
handleWorkshop('web:return-error', (_event,message) => {nativeWebReturnPending=false;clearTimeout(webReturnTimer);mainWindow?.webContents.send('web:active',{active:true,error:String(message||'').slice(0,500)});return true;});
handleWorkshop('web:stop', event => {
  const server=localWeb;
  if(server?.hasEditor()&&!event.fromLocalWeb){nativeWebReturnPending=true;server.requestReturn();scheduleClosedBrowserReturn();return {pending:true};}
  return finishLocalWebReturn(server);
});
app.on('before-quit',()=>{localWeb?.close();});
app.whenReady().then(() => { getDiagnostics().record('session-start', 'Werkstatt gestartet.'); createWindow(); app.on('activate', () => { if (!BrowserWindow.getAllWindows().length) createWindow(); }); });
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });

module.exports = { createProfileIconPng, makePngIco, parseChatAnswer, fallbackModSearchTerms, fallbackExplicitModNames, applyExactModIntent, resolveSpokenModAlias };
