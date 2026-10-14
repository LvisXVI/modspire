const $ = id => document.getElementById(id);
if(localStorage.getItem('mw-smart-setup')!=='1'){localStorage.setItem('mw-smart-setup','1');localStorage.setItem('mw-auto-setup','true');}
const state = { project: { id: null, name: 'Neues Abenteuer', minecraftVersion: '1.21.1', loader: 'fabric', provider: 'modrinth', mods: [], turns: [] }, projects: [], activeProjectId: null, settings: {}, chatgpt: { status: 'disconnected', sharing: false }, popularMods: null, localModels: [], packFilter:'', lastSearchQueries: [], searchKind:'mod', pendingVideo: null, sending: false, queuedAssistantPrompts: [], searchGeneration: 0, chatSearchGeneration: 0, dependencyGeneration: 0, batchSelection: new Set(), modPickerTurn:null, modPickerSelection:new Set(), modPickerView:localStorage.getItem('mw-mod-picker-view')==='inline'?'inline':'window', searchPages:null, saveTimer: null, compatibilityTimer: null, compatibilityGeneration: 0, compatibilityReport: null, autoSetup: localStorage.getItem('mw-auto-setup') !== 'false', applyingAutoSetup: false, creatorMode: false };
let chatFollowLatest = true;
let speechRecognition = null;
let voiceStarting = false;
let voiceGeneration = 0;
let voiceBaseText = '';
let voiceTranscript = '';
let voiceHypothesis = '';
let activeChatRequestId = '';
function renderVoiceTranscript(){
  const input=$('chat-input');if(!input)return;
  input.value=[voiceBaseText,voiceTranscript,voiceHypothesis].filter(Boolean).join(voiceBaseText?'\n':' ');
  input.dispatchEvent(new Event('input',{bubbles:true}));
}
function updateVoiceInput(recording,message=''){
  const english=(window.workshopI18n?.locale||'de').startsWith('en');
  const button=$('voice-input');button.classList.toggle('is-recording',recording);button.setAttribute('aria-pressed',String(recording));
  button.setAttribute('aria-label',recording?(english?'Stop voice input':'Spracheingabe beenden'):(english?'Start voice input':'Spracheingabe starten'));button.title=recording?(english?'Stop recording':'Aufnahme beenden'):(english?'Start voice input':'Spracheingabe starten');
  const status=$('voice-status');status.hidden=!message;status.textContent=message;
}
function voiceErrorMessage(code){
  const english=(window.workshopI18n?.locale||'de').startsWith('en');
  const messages=english?{SPEECH_LANGUAGE_UNAVAILABLE:'Windows has no offline speech model for this language. Install its speech pack in Windows language settings, or use Win + H.',SPEECH_MICROPHONE_UNAVAILABLE:'Windows could not open a microphone. Check microphone privacy settings and the selected input device.',SPEECH_START_FAILED:'Windows speech recognition could not start. Check that a speech pack and microphone are available.',SPEECH_START_TIMEOUT:'Windows speech recognition took too long to start. Try again.',SPEECH_STOPPED:'Speech recognition stopped unexpectedly.'}:{SPEECH_LANGUAGE_UNAVAILABLE:'Für diese Sprache ist kein Windows-Sprachpaket installiert. Installiere es in den Windows-Spracheinstellungen oder nutze Win + H.',SPEECH_MICROPHONE_UNAVAILABLE:'Windows konnte kein Mikrofon öffnen. Prüfe den Datenschutz-Zugriff und das ausgewählte Eingabegerät.',SPEECH_START_FAILED:'Die Windows-Spracherkennung konnte nicht starten. Prüfe Sprachpaket und Mikrofon.',SPEECH_START_TIMEOUT:'Der Start der Spracherkennung hat zu lange gedauert. Versuch es noch einmal.',SPEECH_STOPPED:'Die Spracherkennung wurde unerwartet beendet.'};
  return messages[code]||(english?'Voice input could not start. Try again or use Win + H.':'Spracheingabe konnte nicht starten. Versuch es erneut oder nutze Win + H.');
}
async function toggleVoiceInput(){
  const english=(window.workshopI18n?.locale||'de').startsWith('en');
  if(speechRecognition||voiceStarting){const pending=voiceStarting;voiceGeneration++;voiceStarting=false;speechRecognition=false;try{await window.workshop.stopVoiceInput()}catch{}if(voiceHypothesis&&!voiceTranscript){voiceTranscript=voiceHypothesis;voiceHypothesis='';renderVoiceTranscript()}const recognized=!!(voiceTranscript||$('chat-input').value.trim());updateVoiceInput(false,recognized?(english?'Speech recognized. Review the text and press Enter to send.':'Sprache erkannt. Prüfe den Text und sende ihn mit Enter.'):(pending?(english?'Speech recognition was stopped before it started. Try again.':'Die Spracherkennung wurde vor dem Start beendet. Versuch es noch einmal.'):(english?'No words recognized yet. Check your microphone and speak clearly.':'Noch keine Wörter erkannt. Prüfe dein Mikrofon und sprich deutlich.')));return}
  const generation=++voiceGeneration;voiceBaseText=$('chat-input').value.trimEnd();voiceTranscript='';voiceHypothesis='';voiceStarting=true;updateVoiceInput(true,english?'Starting Windows speech recognition …':'Windows-Spracherkennung startet …');
  try{const result=await window.workshop.startVoiceInput(english?'en-US':'de-DE');if(generation!==voiceGeneration){await window.workshop.stopVoiceInput();return}voiceStarting=false;speechRecognition=true;const fallback=result.culture&&result.culture!==result.requestedCulture;const languageName=result.culture?.startsWith('de')?'Deutsch':result.culture?.startsWith('en')?'English':result.culture;if(fallback)updateVoiceInput(true,english?`Listening offline in Windows using ${languageName} … Tap again to stop.`:`Windows nutzt das installierte Sprachpaket ${languageName} … Tippe erneut zum Beenden.`);else updateVoiceInput(true,english?'Listening offline in Windows … Tap again to stop.':'Windows hört offline zu … Tippe erneut zum Beenden.')}
  catch(error){if(generation===voiceGeneration){voiceStarting=false;speechRecognition=null;updateVoiceInput(false,voiceErrorMessage(error.message))}}
}
window.workshop.onVoiceInputEvent?.(detail=>{
  if(detail?.type==='partial'&&speechRecognition){voiceHypothesis=detail.text;renderVoiceTranscript()}
  else if(detail?.type==='result'&&speechRecognition){voiceTranscript=[voiceTranscript,detail.text].filter(Boolean).join(' ');voiceHypothesis='';renderVoiceTranscript()}
  else if(detail?.type==='error'){voiceStarting=false;speechRecognition=null;updateVoiceInput(false,voiceErrorMessage(detail.code))}
});
window.workshop.onChatProgress?.(detail=>{
  if(!detail||detail.requestId!==activeChatRequestId)return;
  const stream=$('typing-indicator')?.querySelector('.typing-stream');if(!stream)return;
  stream.textContent=String(detail.text||'').replace(/\[\[(?:SEARCH|CHOICES|EDITION):[\s\S]*$/i,'').trim();
  $('chat-messages')._scheduleLatestChatScroll?.();
});
const safe = value => String(value || '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const safeModPreview = value => { try { const url=new URL(String(value||''));return url.protocol==='https:'&&['cdn.modrinth.com','media.forgecdn.net'].includes(url.hostname)?url.href:''; } catch { return ''; } };
const formatDownloads = n => n >= 1e6 ? `${(n/1e6).toFixed(1)} Mio.` : n >= 1e3 ? `${(n/1e3).toFixed(1)} Tsd.` : String(n || 0);
const defaultThemeColors = { accent: '#398ce0', surface: '#f8faff', background: '#eaf0f8' };
let themeColors = { ...defaultThemeColors };
let currentTheme = 'blue';
let currentWallpaper = localStorage.getItem('mw-wallpaper') || (localStorage.getItem('mw-theme') === 'voxel' ? 'voxel' : 'none');
let themeSurfaceOpacity = Math.max(82, Math.min(100, Number(localStorage.getItem('mw-theme-opacity')) || 88));
let wallpaperMotionEnabled = localStorage.getItem('mw-wallpaper-motion') !== 'false';
let selectedUserAvatar = localStorage.getItem('mw-user-avatar') || '';
let skinUsername = localStorage.getItem('mw-skin-username') || '';
let selectedAssistantAvatar = localStorage.getItem('mw-assistant-avatar') || '';
function skinAvatarUrl(username){return `https://mc-heads.net/avatar/${encodeURIComponent(username.trim())}/100/nohelm.png`}
function setAvatarImage(node,source,label){const image=document.createElement('img');image.src=source;image.alt=label;image.draggable=false;image.onerror=()=>{image.replaceWith(document.createTextNode('✦'))};node.replaceChildren(image)}
function avatarContent(){return selectedUserAvatar.startsWith('skin:')?`<img src="${skinAvatarUrl(selectedUserAvatar.slice(5))}" alt="Minecraft-Skin" draggable="false">`:selectedUserAvatar||profileInitial(state.settings.username||(isDemoMode()?'Demo-Modder':'Modder'))}
function applyUserAvatar(){document.querySelectorAll('.user-message .avatar').forEach(node=>{node.classList.add('user-avatar');if(selectedUserAvatar.startsWith('skin:'))setAvatarImage(node,skinAvatarUrl(selectedUserAvatar.slice(5)),'Minecraft-Skin');else if(selectedUserAvatar.startsWith('data:image/'))setAvatarImage(node,selectedUserAvatar,'Eigenes Profilbild');else node.textContent=avatarContent()})}
function setAssistantAvatar(node){node.classList.add('assistant-avatar');if(selectedAssistantAvatar.startsWith('skin:')){setAvatarImage(node,skinAvatarUrl(selectedAssistantAvatar.slice(5)),'Minecraft-Skin des Pack-Assistenten');return}if(selectedAssistantAvatar.startsWith('data:image/')){setAvatarImage(node,selectedAssistantAvatar,'Eigenes Pack-Assistenten-Bild');return}if(selectedAssistantAvatar){node.textContent=selectedAssistantAvatar;return}node.innerHTML='<svg viewBox="0 0 32 32" aria-hidden="true"><path fill="#76502e" stroke="#111d32" stroke-width="2" d="M5 12 16 7l11 5v14H5z"/><path fill="#bd8242" stroke="#111d32" stroke-width="2" d="m5 12 11 5 11-5-11-5z"/><path fill="#e3b65e" d="m9 12 7 3 7-3-7-3z"/><path fill="#f1cc76" stroke="#111d32" stroke-width="1.5" d="M13 17h6v5h-6z"/><path fill="#3d83cb" d="M14 18h4v3h-4z"/><path fill="#8ee0ff" d="M15 18h2v2h-2z"/><path fill="#c5eaff" d="m23 5 1-2 1 2 2 1-2 1-1 2-1-2-2-1z"/></svg>'}
function applyAssistantAvatar(){document.querySelectorAll('.assistant-avatar').forEach(setAssistantAvatar);const header=$('assistant-panel-avatar');if(header){header.classList.add('assistant-avatar');setAssistantAvatar(header)}}
function applyWallpaper(wallpaper = currentWallpaper, persist = true) {
  currentWallpaper = ['none', 'voxel', 'crystal', 'aurora', 'grove', 'deep-forest', 'nether-forge'].includes(wallpaper) ? wallpaper : 'none';
  document.body.dataset.wallpaper = currentWallpaper;
  document.querySelectorAll('[data-wallpaper-choice]').forEach(button => button.classList.toggle('active', button.dataset.wallpaperChoice === currentWallpaper));
  if (persist) localStorage.setItem('mw-wallpaper', currentWallpaper);
}
function applyWallpaperMotion(enabled = wallpaperMotionEnabled, persist = true) {
  wallpaperMotionEnabled = Boolean(enabled);
  document.body.dataset.wallpaperMotion = wallpaperMotionEnabled ? 'on' : 'off';
  const control = $('wallpaper-motion');
  if (control) control.checked = wallpaperMotionEnabled;
  if (persist) localStorage.setItem('mw-wallpaper-motion', String(wallpaperMotionEnabled));
}
function applyTheme(theme = currentTheme, colors = themeColors, persist = true) {
  const previousTheme = currentTheme;
  currentTheme = ['fluid', 'clear', 'translucent', 'aurora', 'redstone', 'ender', 'emerald', 'nether'].includes(theme) ? theme : 'blue';
  const pairedWallpapers = { emerald: 'deep-forest', nether: 'nether-forge' };
  const previousPairedWallpaper = pairedWallpapers[previousTheme];
  const nextPairedWallpaper = pairedWallpapers[currentTheme];
  if (currentTheme !== previousTheme && nextPairedWallpaper) {
    if (previousPairedWallpaper && currentWallpaper === previousPairedWallpaper) {
      // Keep the original wallpaper saved while moving between paired themes.
    } else if (currentWallpaper !== nextPairedWallpaper) {
      localStorage.setItem('mw-wallpaper-before-paired-theme', currentWallpaper);
    } else if (!localStorage.getItem('mw-wallpaper-before-paired-theme')) {
      localStorage.setItem('mw-wallpaper-before-paired-theme', 'none');
    }
    currentWallpaper = nextPairedWallpaper;
  } else if (currentTheme !== previousTheme && previousPairedWallpaper && currentWallpaper === previousPairedWallpaper) {
    currentWallpaper = localStorage.getItem('mw-wallpaper-before-paired-theme') || 'none';
    localStorage.removeItem('mw-wallpaper-before-paired-theme');
  }
  themeColors = Object.fromEntries(Object.keys(defaultThemeColors).map(key => [key, /^#[\da-f]{6}$/i.test(colors?.[key] || '') ? colors[key] : defaultThemeColors[key]]));
  document.body.dataset.theme = currentTheme;
  document.body.style.setProperty('--custom-accent', themeColors.accent);
  document.body.style.setProperty('--custom-surface', themeColors.surface);
  document.body.style.setProperty('--custom-background', themeColors.background);
  document.body.style.setProperty('--theme-surface-opacity', `${themeSurfaceOpacity}%`);
  if ($('theme-opacity')) $('theme-opacity').value = String(themeSurfaceOpacity);
  if ($('theme-opacity-value')) $('theme-opacity-value').textContent = `${themeSurfaceOpacity}%`;
  applyWallpaper(currentWallpaper, persist);
  if (persist) { localStorage.setItem('mw-theme', currentTheme); localStorage.setItem('mw-theme-colors', JSON.stringify(themeColors)); }
  window.dispatchEvent(new CustomEvent('workshop-theme-changed',{detail:{theme:currentTheme,wallpaper:currentWallpaper,colors:{...themeColors},opacity:themeSurfaceOpacity}}));
  document.querySelectorAll('[data-theme-choice]').forEach(button => button.classList.toggle('active', button.dataset.themeChoice === currentTheme));
  if ($('theme-accent')) $('theme-accent').value = themeColors.accent;
  if ($('theme-surface')) $('theme-surface').value = themeColors.surface;
  if ($('theme-background')) $('theme-background').value = themeColors.background;
}
try { applyTheme(localStorage.getItem('mw-theme') || 'blue', { ...defaultThemeColors, ...JSON.parse(localStorage.getItem('mw-theme-colors') || '{}') }, false); } catch { applyTheme('blue', defaultThemeColors, false); }
applyWallpaperMotion(wallpaperMotionEnabled, false);

async function save() {
  $('save-status').textContent = 'Speichert …';
  try { await window.workshop.saveProject(state.project); state.projects=state.projects.map(project=>project.id===state.project.id?{...state.project}:project);renderProjectSwitcher();$('save-status').textContent = 'Gespeichert'; }
  catch { $('save-status').textContent = 'Speichern fehlgeschlagen'; }
}
function assertLocalWebHandoffReady(){
  const english=(window.workshopI18n?.locale||'de').startsWith('en');
  if(state.webHandoff||state.sending||state.queuedAssistantPrompts.length||state.pendingModSearches||state.pendingDependencies||state.pendingSetup||state.applyingAutoSetup)throw new Error(english?'Wait for the current reply, search or dependency check before switching.':'Warte bitte auf die aktuelle Antwort, Suche oder Abhängigkeitsprüfung, bevor du wechselst.');
}
async function performLocalWebHandoff(enterBrowser){
  if(state.webHandoff)assertLocalWebHandoffReady();
  state.webHandoff=true;document.body.inert=true;
  clearTimeout(state.saveTimer);
  try{
    if(!await window.WorkshopProjectReady)throw new Error('Das Projekt ist noch nicht bereit. Bitte erneut versuchen.');
    state.webHandoff=false;assertLocalWebHandoffReady();state.webHandoff=true;
    await window.workshop.stopVoiceInput();
    await window.workshop.saveProject(state.project);
    const preferences=Object.fromEntries(Object.keys(localStorage).filter(key=>key.startsWith('mw-')).map(key=>[key,localStorage.getItem(key)]));
    if(enterBrowser)return await window.workshop.openWebVersion(preferences);
    await window.workshop.saveWebPreferences(preferences);
    return await window.workshop.returnToDesktop();
  }finally{state.webHandoff=false;document.body.inert=false;}
}
window.WorkshopOpenLocalWeb=()=>performLocalWebHandoff(true);
window.WorkshopReturnLocalWeb=()=>performLocalWebHandoff(false);
function queueSave() { clearTimeout(state.saveTimer); $('save-status').textContent = 'Änderungen …'; state.saveTimer = setTimeout(save, 250); }
function setStatus(message) { $('status-text').textContent = message; }
function isDemoMode(){return localStorage.getItem('mw-demo-mode')==='true'||sessionStorage.getItem('mw-demo-session')==='true'}
function profileInitial(name){return Array.from(String(name||'Modder').trim())[0]?.toLocaleUpperCase('de-DE')||'M'}
function setProfileIdentity(name){const label=name||'Lokales Profil',initial=profileInitial(name);$('sidebar-username').textContent=label;$('brand-initial').textContent=initial;$('brand-initial').setAttribute('aria-label',`Profil ${label}`);$('profile-initial').textContent=initial;$('profile-file-icon').setAttribute('aria-label',`Datei-Icon für ${label}`);document.querySelectorAll('.startup-brand').forEach(mark=>mark.textContent=initial)}
function syncStartupGate(){document.body.classList.toggle('startup-gated',!$('startup-login-overlay').hidden||!$('username-setup-overlay').hidden||!$('local-model-notice-overlay').hidden)}
function maybeShowLocalModelNotice(){if(!$('startup-login-overlay').hidden||localStorage.getItem('mw-local-model-notice-seen')==='yes')return false;const english=(window.workshopI18n?.locale||'de').startsWith('en');$('local-model-notice-eyebrow').textContent=english?'LOCAL MODEL NOTICE':'HINWEIS ZU LOKALEN MODELLEN';$('local-model-notice-title').textContent=english?'Local model compatibility':'Kompatibilität lokaler Modelle';$('local-model-notice-copy').textContent=english?'The workshop has not been tested with every available local language model. Features, answer quality and speed can vary by model, so compatibility with every model cannot be guaranteed.':'Die Werkstatt wurde nicht mit allen verfügbaren lokalen Sprachmodellen getestet. Funktionen, Antwortqualität und Geschwindigkeit können je nach Modell abweichen; eine Kompatibilität mit jedem Modell ist daher nicht garantiert.';$('local-model-notice-ok').textContent=english?'Understood':'Verstanden';$('local-model-notice-footnote').textContent=english?'This acknowledgement is saved on this PC and will not appear at every startup.':'Diese Bestätigung wird auf diesem PC gespeichert und erscheint nicht bei jedem Start erneut.';$('local-model-notice-overlay').hidden=false;syncStartupGate();return true}
function enterDemo(){localStorage.setItem('mw-demo-mode','true');sessionStorage.setItem('mw-demo-session','true');$('username-setup-overlay').hidden=true;$('startup-login-overlay').hidden=true;syncStartupGate();setProfileIdentity('Demo-Modder');setStatus('Demo-Modus · KI-Funktionen erst nach Anmeldung');showView('project');maybeShowLocalModelNotice()}
function context() { const searchPreferences=Object.entries(state.project.searchLearning||{}).filter(([,score])=>score>0).sort((a,b)=>b[1]-a[1]).slice(0,8).map(([query])=>query);return { name: state.project.name, minecraftVersion: state.project.minecraftVersion, loader: state.project.loader, mods: state.project.mods.map(m => `${m.title} (${m.source})`), searchPreferences, creatorMode: state.creatorMode, language: window.workshopI18n?.locale || 'de' }; }
function fallbackSearchTermsForPrompt(prompt){const request=String(prompt||'');const intent=/(?:\bmods?\b|modpack|modrinth|curseforge|find|search|suggest|recommend|such|finde|vorschlag|empfehl|pack-basis|passende mod)/i.test(request);if(!intent)return[];if(/(?:\bshine\b|\bschein\b|\bshain\b)/i.test(request))return['shine'];const groups=[[/biom|biome|erkund|explor|world generation/i,['biomes','world generation','exploration']],[/dungeon|boss|kampf|combat|waff|weapon/i,['dungeons','bosses','combat overhaul']],[/magie|magic|zauber|spell|wizard/i,['magic','spells','fantasy']],[/technik|tech|automation|create/i,['technology','automation','create']],[/visual|visuell|atmosph|licht|light|shader/i,['dynamic lights','ambience','visual effects']],[/performance|leistung|fps|lag/i,['performance','optimization','fps']]];return groups.find(([pattern])=>pattern.test(request))?.[1]||[]}
function updateAutoSetupButton(){const button=$('auto-setup-toggle');button.textContent=state.autoSetup?'Auto-Auswahl an':'Manuelle Auswahl';button.classList.toggle('active',state.autoSetup);button.setAttribute('aria-pressed',String(state.autoSetup));}
async function chooseBestSetup(query){
  if(!state.autoSetup)return;
  state.pendingSetup=(state.pendingSetup||0)+1;
  const projectId=state.project.id;
  const selectionKey=JSON.stringify(state.project.mods.map(mod=>[mod.provider,mod.id]));
  try{
    setStatus('Vergleiche Minecraft-Versionen und Modloader für deine Themen …');
    const best=await window.workshop.findBestSetup({queries:Array.isArray(query)?query:[query],mods:state.project.mods,minecraftVersion:state.project.minecraftVersion,loader:state.project.loader});
    if(!best||!state.autoSetup||state.project.id!==projectId||JSON.stringify(state.project.mods.map(mod=>[mod.provider,mod.id]))!==selectionKey)return;
    if(best.unchanged){setStatus(best.reason);return;}
    const changed=state.project.minecraftVersion!==best.minecraftVersion||state.project.loader!==best.loader;
    if(!changed)return;
    state.applyingAutoSetup=true;state.project.minecraftVersion=best.minecraftVersion;state.project.loader=best.loader;
    state.project.mods=state.project.mods.map(mod=>({...mod,compatibility:`${best.minecraftVersion} · ${best.loader}`}));
    state.project.setupRecommendation={...best,queries:Array.isArray(query)?query:[query]};
    $('auto-setup-toggle').dataset.tooltipText=`Minecraft ${best.minecraftVersion} · ${best.loader}: ${best.coverage||1}/${best.queryCount||1} Themen und ${best.count} geprüfte Modtreffer. Bereits ausgewählte Mods werden beibehalten.`;
    selectMinecraftVersion(best.minecraftVersion);$('loader').value=best.loader;queueSave();renderSelected();loadPopularMods();
    setStatus(`Auto-Auswahl: Minecraft ${best.minecraftVersion} · ${best.loader} · ${best.coverage||1}/${best.queryCount||1} Themen · ${best.count} geprüfte Modtreffer`);
  }catch(error){setStatus('Auto-Auswahl derzeit nicht verfügbar · aktuelle Version bleibt erhalten');window.workshop.reportError?.({message:'Auto-Auswahl: '+error.message,stack:error.stack}).catch(()=>{});}
  finally{state.applyingAutoSetup=false;state.pendingSetup--;}
}

function selectMinecraftVersion(version){
  const select=$('minecraft-version');
  if(![...select.options].some(option=>option.value===version))select.add(new Option(version,version));
  select.value=version;
}
async function refreshGameVersions(){
  if(!window.workshop.getGameVersions)return;
  try{
    const data=await window.workshop.getGameVersions();
    const versions=[...new Set([...(data.versions||[]),...state.projects.map(project=>project.minecraftVersion),state.project.minecraftVersion].filter(Boolean))];
    $('minecraft-version').replaceChildren(...versions.map(version=>new Option(version,version)));
    selectMinecraftVersion(state.project.minecraftVersion);
  }catch(error){window.workshop.reportError?.({message:'Versionsliste konnte nicht aktualisiert werden: '+error.message}).catch(()=>{});}
}

async function load() {
  const [projectStore, settings] = await Promise.all([window.workshop.listProjects(), window.workshop.getSettings()]);
  state.projects=Array.isArray(projectStore?.projects)?projectStore.projects:[];
  state.activeProjectId=projectStore?.activeId||state.projects[0]?.id||null;
  const project=state.projects.find(item=>item.id===state.activeProjectId)||state.projects[0];
  if (project && typeof project === 'object') state.project = { ...state.project, ...project, mods: Array.isArray(project.mods) ? project.mods : [], turns: Array.isArray(project.turns) ? project.turns : [] };
  state.settings = settings;
  if (settings.appVersion) document.querySelectorAll('.version,.modern-footer-version,.v4-footer small').forEach(node => { node.textContent = `v${settings.appVersion}`; });
  setProfileIdentity(settings.username||'Lokales Profil');
  $('username-setup-overlay').hidden=!!settings.username||isDemoMode();syncStartupGate();
  if(!settings.username&&!isDemoMode())requestAnimationFrame(()=>$('username-input').focus());
  renderProjectSwitcher();
  $('pack-name').value = state.project.name;
  selectMinecraftVersion(state.project.minecraftVersion);
  $('loader').value = state.project.loader;
  updateAutoSetupButton();
  $('provider').value = state.project.provider;
  renderSelected(); renderChat(); updateSettingsState(); showView('chat');loadPopularMods();refreshGameVersions();reconcilePackDependencies();if(settings.username)$('startup-connect').focus();
  refreshChatGPTStatus().catch(error=>{ $('chatgpt-account-note').textContent=`ChatGPT-Verbindung konnte nicht geprüft werden: ${error.message}`; });
}
function renderProjectSwitcher(){
  const select=$('project-select');
  select.innerHTML=state.projects.map(project=>`<option value="${safe(project.id)}">${safe(project.name)}</option>`).join('')+'<option value="__create__">＋ Neues Modpack …</option>';
  select.value=state.activeProjectId||'';
}
async function switchProject(id){
  if(id===state.activeProjectId)return;
  clearTimeout(state.saveTimer);await save();
  try{
    const project=await window.workshop.switchProject(id);
    state.project={...state.project,...project,mods:Array.isArray(project.mods)?project.mods:[],turns:Array.isArray(project.turns)?project.turns:[]};state.activeProjectId=project.id;state.batchSelection.clear();state.packFilter='';
    state.lastSearchQueries=[];window.lastResults=[];$('mod-search').value='';$('mod-results').replaceChildren();$('results-hint').textContent='Suche nach einem Mod oder beschreibe im Chat, was du suchst.';
    $('pack-name').value=state.project.name;selectMinecraftVersion(state.project.minecraftVersion);$('loader').value=state.project.loader;$('provider').value=state.project.provider;
    renderProjectSwitcher();renderSelected();renderChat();showView('chat');loadPopularMods();reconcilePackDependencies();setStatus(`„${state.project.name}“ geöffnet`);
  }catch(error){setStatus(`Modpack konnte nicht geöffnet werden: ${error.message}`)}
}
function openNewPack(){ $('new-pack-overlay').hidden=false;$('new-pack-name').value='';requestAnimationFrame(()=>$('new-pack-name').focus()); }
async function createProjectFromForm(event){
  event.preventDefault();clearTimeout(state.saveTimer);await save();
  try{
    const store=await window.workshop.createProject($('new-pack-name').value);
    state.projects=store.projects;state.activeProjectId=store.activeId;state.project=state.projects.find(project=>project.id===store.activeId);state.batchSelection.clear();state.packFilter='';
    $('new-pack-overlay').hidden=true;$('pack-name').value=state.project.name;selectMinecraftVersion(state.project.minecraftVersion);$('loader').value=state.project.loader;$('provider').value=state.project.provider;
    state.lastSearchQueries=[];window.lastResults=[];$('mod-search').value='';$('mod-results').replaceChildren();renderProjectSwitcher();renderSelected();renderChat();showView('chat');loadPopularMods();setStatus(`„${state.project.name}“ erstellt`);
  }catch(error){setStatus(`Modpack konnte nicht erstellt werden: ${error.message}`);alert(error.message)}
}
function renderSelected() {
  const list = $('selected-list');
  const english=(window.workshopI18n?.locale||'de').startsWith('en');
  $('selected-count').textContent = state.project.mods.length ? english?`${state.project.mods.length} mods selected`:`${state.project.mods.length} Mods ausgewählt` : english?'No mods selected yet':'Noch keine Mods ausgewählt';
  $('clear-selection').hidden = !state.project.mods.length;
  $('overview-mod-count').textContent = state.project.mods.length ? english?`${state.project.mods.length} mods selected`:`${state.project.mods.length} Mods ausgewählt` : english?'No mods':'Noch keine Mods';
  $('overview-pack-version').textContent=`Minecraft ${state.project.minecraftVersion} · ${state.project.loader}`;
  $('selected-filter').value=state.packFilter;
  $('selected-filter-count').textContent=state.packFilter?`${state.project.mods.filter(mod=>`${mod.title} ${mod.source}`.toLowerCase().includes(state.packFilter.toLowerCase())).length}/${state.project.mods.length}`:'';
  if (!state.project.mods.length) { list.innerHTML = `<div class="empty-selected">${english?'Mods you add will appear here.':'Ausgewählte Mods erscheinen hier.'}</div>`; scheduleCompatibilityCheck(); renderLab(); window.WorkshopModernUI?.render(); return; }
  const filtered=state.project.mods.map((mod,index)=>({mod,index})).filter(({mod})=>!state.packFilter||`${mod.title} ${mod.source}`.toLowerCase().includes(state.packFilter.toLowerCase()));
  if(!filtered.length){list.innerHTML=`<div class="empty-selected">${english?'No mods match this filter.':'Keine Mods passen zu diesem Filter.'}</div>`;scheduleCompatibilityCheck();renderLab();window.WorkshopModernUI?.render();return}
  list.innerHTML = filtered.map(({mod:m,index:i}) => {const status=modStatus(m,english);return `<div class="selected-mod ${m.dependency?'is-dependency':''}">${m.icon ? `<img src="${safe(m.icon)}" alt="" loading="lazy">` : '<div class="mod-icon-placeholder">✦</div>'}<div class="selected-mod-copy"><strong>${safe(m.title)}</strong><span class="selected-mod-status ${status.warning?'warning':''}" title="${safe(status.title)}">${safe(status.label)}</span><small>${safe(m.source)}</small></div><button class="remove-mod" data-remove="${i}" aria-label="${safe(m.title)} ${english?'remove':'entfernen'}" title="${m.dependency?(english?'Required by another mod':'Wird automatisch von einer anderen Mod benötigt'):(english?'Remove mod':'Mod entfernen')}" ${m.dependency?'disabled':''}>${m.dependency?'⌁':'×'}</button></div>`}).join('');
  list.querySelectorAll('[data-remove]').forEach(b => b.onclick = () => { const mod=state.project.mods[Number(b.dataset.remove)];if(mod?.dependency)return;recordSearchFeedback(mod,-1);state.project.mods.splice(Number(b.dataset.remove), 1); queueSave(); renderSelected(); renderResults(window.lastResults || []); renderChat(); reconcilePackDependencies(); });
  scheduleCompatibilityCheck();renderLab();window.WorkshopModernUI?.render();
}
function modStatus(mod,english=(window.workshopI18n?.locale||'de').startsWith('en')){
  const key=`${mod.provider}:${mod.id}`,report=state.compatibilityReport;
  const issue=report?.issues?.find(item=>(item.mods||[]).includes(key));
  if(issue)return {label:english?'Warning':'Warnung',title:issue.message|| (english?'Compatibility notice':'Kompatibilitätshinweis'),warning:true};
  const expected=`${state.project.minecraftVersion} · ${state.project.loader}`;
  if(mod.compatibility===expected)return {label:english?'Version matches':'Version passt',title:english?'Catalog version and loader match this pack.':'Katalogversion und Modloader entsprechen diesem Pack.',warning:false};
  return {label:english?'Check version':'Version prüfen',title:english?'Version or loader differs from this pack.':'Version oder Modloader weicht von diesem Pack ab.',warning:true};
}
function recordSearchFeedback(mod,delta){
  const queries=[...(mod?.matchQueries||[]),mod?.matchQuery].filter(Boolean);
  if(!queries.length)return;
  const learning=state.project.searchLearning||(state.project.searchLearning={});
  for(const query of new Set(queries)){const key=String(query).trim().toLowerCase();if(key)learning[key]=Math.max(-5,Math.min(8,(Number(learning[key])||0)+delta))}
  const entries=Object.entries(learning);if(entries.length>80){entries.sort((a,b)=>Math.abs(b[1])-Math.abs(a[1]));state.project.searchLearning=Object.fromEntries(entries.slice(0,80))}
  queueSave();
}
function addPackMods(mods,{quiet=false}={}){
  const additions=[],existing=new Set(state.project.mods.map(item=>`${item.provider}:${item.id}`));
  for(const mod of mods){const key=`${mod.provider}:${mod.id}`;if(!existing.has(key)){existing.add(key);additions.push(mod)}}
  if(!additions.length)return;
  const projectId=state.project.id;state.project.mods.push(...additions);for(const mod of additions)recordSearchFeedback(mod,1);queueSave();renderSelected();renderResults(window.lastResults||[]);renderChat();
  if(!quiet)setStatus(`${additions.length} Mods zum Pack hinzugefügt`);
  reconcilePackDependencies({projectId});
}
async function reconcilePackDependencies({projectId=state.project.id}={}){
  const generation=++state.dependencyGeneration;
  const roots=state.project.mods.filter(mod=>!mod.dependency&&(!mod.kind||mod.kind==='mod'));
  if(!window.workshop.resolveRequiredDependencies)return;
  if(!roots.length){const clean=state.project.mods.filter(mod=>!mod.dependency);if(clean.length!==state.project.mods.length){state.project.mods=clean;queueSave();renderSelected();renderResults(window.lastResults||[]);renderChat()}return}
  state.pendingDependencies=(state.pendingDependencies||0)+1;
  try{
    const result=await window.workshop.resolveRequiredDependencies({mods:roots,minecraftVersion:state.project.minecraftVersion,loader:state.project.loader});
    if(state.project.id!==projectId||generation!==state.dependencyGeneration)return;
    const rootKeys=new Set(state.project.mods.filter(mod=>!mod.dependency).map(mod=>`${mod.provider}:${mod.id}`));
    const required=(result.dependencies||[]).filter(mod=>!rootKeys.has(`${mod.provider}:${mod.id}`));
    const unique=[...new Map(required.map(mod=>[`${mod.provider}:${mod.id}`,mod])).values()];
    const next=[...state.project.mods.filter(mod=>!mod.dependency),...unique];
    const before=state.project.mods.map(mod=>`${mod.provider}:${mod.id}:${mod.versionId||''}`).join('|'),after=next.map(mod=>`${mod.provider}:${mod.id}:${mod.versionId||''}`).join('|');
    if(before!==after){state.project.mods=next;queueSave();renderSelected();renderResults(window.lastResults||[]);renderChat()}
    if(unique.length||result.unresolved?.length){const parts=[];if(unique.length)parts.push(`${unique.length} Pflicht-Abhängigkeit${unique.length===1?'':'en'} automatisch ergänzt`);if(result.unresolved?.length)parts.push(`${result.unresolved.length} Abhängigkeit${result.unresolved.length===1?'':'en'} ohne passende Version geprüft`);setStatus(parts.join(' · '))}
  }catch(error){if(state.project.id===projectId&&generation===state.dependencyGeneration)setStatus(`Abhängigkeiten konnten nicht geprüft werden: ${error.message}`)}
  finally{state.pendingDependencies--;}
}
function addSelectedMod(mod) {
  const key=`${mod.provider}:${mod.id}`;
  if(state.project.mods.some(item=>`${item.provider}:${item.id}`===key)){setStatus(`${mod.title} ist bereits ausgewählt`);return}
  addPackMods([mod]);
}

const labRoles=[
  {name:'Erkundung',color:'#38a9e6',test:/biome|world|dimension|explor|structure|terrain|travel|village|cave/i},
  {name:'Kampf',color:'#e9687d',test:/boss|combat|battle|weapon|armor|dungeon|enemy|mob|fight/i},
  {name:'Technik',color:'#d49a35',test:/tech|create|machine|automation|energy|factory|storage|pipe|redstone/i},
  {name:'Magie',color:'#9a77e8',test:/magic|spell|wizard|arcane|alchemy|mana|mystic/i},
  {name:'Komfort',color:'#2db697',test:/quality|comfort|inventory|recipe|map|waystone|hud|food|sleep|utility/i}
];
function roleForMod(mod){const value=[mod.title,mod.description,(mod.categories||[]).join(' ')].join(' ');return labRoles.find(role=>role.test.test(value))?.name||'Vielfalt'}
function renderLab(){
  if(!$('lab-panel'))return;
  const mods=state.project.mods||[];$('lab-mod-count').textContent=mods.length+' '+(mods.length===1?'Mod':'Mods');
  const counts=Object.fromEntries(labRoles.map(role=>[role.name,0]));counts.Vielfalt=0;mods.forEach(mod=>counts[roleForMod(mod)]++);
  const graph=$('dna-graph');graph.replaceChildren();const ns='http://www.w3.org/2000/svg';const svg=(tag,attrs)=>{const el=document.createElementNS(ns,tag);Object.keys(attrs).forEach(key=>el.setAttribute(key,attrs[key]));return el};
  graph.append(svg('circle',{cx:140,cy:94,r:32,fill:'rgba(58,142,212,.12)',stroke:'#6eafe2','stroke-width':2}));
  const core=svg('text',{x:140,y:98,'text-anchor':'middle',fill:'#347eb9','font-size':10,'font-weight':700});core.textContent=mods.length?'DEIN PACK':'MODPACK';graph.append(core);
  const active=labRoles.filter(role=>counts[role.name]>0);active.forEach((role,index)=>{const angle=-Math.PI/2+index/Math.max(active.length,1)*Math.PI*2;const x=140+90*Math.cos(angle),y=94+62*Math.sin(angle);graph.append(svg('line',{x1:140,y1:94,x2:x,y2:y,stroke:role.color,'stroke-width':2,opacity:.55}));graph.append(svg('circle',{cx:x,cy:y,r:24,fill:role.color+'24',stroke:role.color,'stroke-width':1.5}));const label=svg('text',{x:x,y:y+4,'text-anchor':'middle',fill:role.color,'font-size':12,'font-weight':700});label.textContent=counts[role.name];graph.append(label)});
  const legend=$('dna-legend');legend.replaceChildren();active.forEach(role=>{const item=document.createElement('span');item.className='dna-legend-item';item.innerHTML='<i style="--role-color:'+role.color+'"></i>'+safe(role.name)+' <b>'+counts[role.name]+'</b>';legend.append(item)});
  if(!active.length){const empty=document.createElement('p');empty.className='lab-empty';empty.textContent='Füge Mods hinzu, damit deine Pack-DNA sichtbar wird.';legend.append(empty)}
  const report=state.compatibilityReport,expected=state.project.minecraftVersion+' · '+state.project.loader,mismatch=mods.filter(mod=>mod.compatibility!==expected).length,errors=report?.issues?.filter(issue=>issue.severity==='error').length||0,score=mods.length?Math.max(0,Math.min(100,100-mismatch*12-errors*22+(!report?.available?-8:0))):0;
  $('compass-meter-fill').style.width=score+'%';$('compass-summary').textContent=!mods.length?'Warte auf deine Mod-Auswahl':report?.available?(errors||mismatch?(errors+mismatch)+' mögliche Hinweise · KI-Bericht verfügbar':'Keine Konflikte gemeldet'):mismatch+' Versionsabweichungen · KI nicht verbunden';$('compass-confidence').textContent=report?.available?'Zuletzt geprüfte Auswahl und Versionsdaten':'Heuristischer Richtwert, keine Garantie; KI-Prüfung erst nach Anmeldung.';
  const stats=$('compass-stats');stats.replaceChildren();[['Mods',mods.length],['Version',mismatch],['KI-Hinweise',errors]].forEach(pair=>{const item=document.createElement('span');item.innerHTML='<b>'+pair[1]+'</b>'+pair[0];stats.append(item)});
  const worldMods=mods.filter(mod=>/biome|world|dimension|structure|terrain|generation|terra|region/i.test((mod.title||'')+' '+(mod.description||''))),world=$('worldgen-check');world.replaceChildren();const note=document.createElement('p');note.className='lab-note '+(worldMods.length>1?'warn':'good');note.textContent=!worldMods.length?'Keine Weltgenerator-Mod anhand der Namen erkannt.':worldMods.length===1?worldMods[0].title+' verändert vermutlich die Welt. Neue Chunks oder eine frische Welt können nötig sein.':worldMods.length+' mögliche Weltgeneratoren: '+worldMods.map(mod=>mod.title).join(', ')+'. Überschneidungen sind nicht bestätigt; vor dem Weltwechsel Backup erstellen.';world.append(note);
  const bars=$('soundcheck-bars');bars.replaceChildren();const max=Math.max(1,...Object.values(counts));labRoles.forEach(role=>{const row=document.createElement('div');row.className='sound-row';row.innerHTML='<span>'+safe(role.name)+'</span><div><i style="width:'+Math.round(counts[role.name]/max*100)+'%;--role-color:'+role.color+'"></i></div><b>'+counts[role.name]+'</b>';bars.append(row)});
  renderMoodboard();renderSnapshots();
}
function renderMoodboard(){
  const target=$('mood-chips');if(!target)return;target.replaceChildren();const notes=Array.isArray(state.project.moodboard)?state.project.moodboard:[];
  const suggested=[...new Set((state.project.turns||[]).filter(turn=>turn.role==='assistant').flatMap(turn=>turn.searchTerms||[]))].slice(0,8);
  const chip=(label,fromChat)=>{const button=document.createElement('button');button.type='button';button.className='mood-chip'+(fromChat?' suggested':'');button.textContent=label;button.title=fromChat?'Aus dem Chat abgeleitet · klicken zum Merken':'Klicken zum Entfernen';button.onclick=()=>{state.project.moodboard=Array.isArray(state.project.moodboard)?state.project.moodboard:[];if(fromChat)state.project.moodboard.push(label);else state.project.moodboard=state.project.moodboard.filter(item=>item!==label);queueSave();renderMoodboard()};target.append(button)};
  notes.forEach(label=>chip(label,false));suggested.filter(term=>!notes.includes(term)).forEach(label=>chip(label,true));if(!target.children.length){const empty=document.createElement('span');empty.className='lab-empty';empty.textContent='Noch keine Ideen notiert.';target.append(empty)}
}
function saveSnapshot(name){
  const data={};['id','name','minecraftVersion','loader','provider','mods','moodboard'].forEach(key=>{data[key]=JSON.parse(JSON.stringify(state.project[key]??(['mods','moodboard'].includes(key)?[]:null)))});
  const all=Array.isArray(state.project.snapshots)?state.project.snapshots:[],snapshot={id:crypto.randomUUID(),name:name||'Stand '+(all.length+1),createdAt:new Date().toISOString(),mods:state.project.mods.length,data};state.project.snapshots=[...all,snapshot].slice(-12);queueSave();renderSnapshots();setStatus('Pack-Stand „'+snapshot.name+'“ gesichert');
}
function renderSnapshots(){
  const target=$('snapshot-list');if(!target)return;target.replaceChildren();const all=Array.isArray(state.project.snapshots)?state.project.snapshots:[];
  if(!all.length){const empty=document.createElement('p');empty.className='lab-empty';empty.textContent='Noch keine Pack-Stände gespeichert.';target.append(empty);return}
  all.slice().reverse().forEach(snapshot=>{const row=document.createElement('div');row.className='snapshot-row';const label=document.createElement('span');label.textContent=snapshot.name+' · '+new Date(snapshot.createdAt).toLocaleString('de-DE')+' · '+snapshot.mods+' Mods';const button=document.createElement('button');button.type='button';button.className='text-button';button.textContent='Wiederherstellen';button.onclick=()=>{if(!confirm('Pack auf „'+snapshot.name+'“ zurücksetzen? Der aktuelle Stand bleibt als Sicherung erhalten.'))return;saveSnapshot('Vor Wiederherstellung');const copies=state.project.snapshots;state.project={...state.project,...snapshot.data,snapshots:copies};$('pack-name').value=state.project.name;selectMinecraftVersion(state.project.minecraftVersion);$('loader').value=state.project.loader;$('provider').value=state.project.provider;queueSave();renderSelected();renderChat();setStatus('„'+snapshot.name+'“ wiederhergestellt')};row.append(label,button);target.append(row)})
}
function diagnoseCrash(text,name){
  const patterns=[[/OutOfMemoryError|Could not reserve enough space/i,'Speicherproblem','RAM-Zuweisung und große Content-/Shader-Mods prüfen.'],[/MixinApplyError|MixinTransformerError|InjectionError/i,'Mixin-/Mod-Konflikt','Betroffene Mod oder einen Versionskonflikt im Stacktrace untersuchen.'],[/ModResolutionException|missing mandatory dependencies|requires .* but/i,'Fehlende Abhängigkeit','Die genannte Bibliothek in passender Loader-Version ergänzen.'],[/UnsupportedClassVersionError|class file version/i,'Java-Version passt nicht','Java-Version passend zu Minecraft auswählen.'],[/NoSuchMethodError|NoClassDefFoundError|ClassNotFoundException/i,'Versions-/Klassenkonflikt','Mods und Bibliotheken auf dieselbe Minecraft-/Loader-Version bringen.'],[/Failed to load|Failed to parse|Invalid .* json|JsonParseException/i,'Konfigurationsfehler','Die zuletzt geänderte Konfiguration oder Datapacks prüfen.']];
  const lines=String(text).split(/\r?\n/),findings=patterns.map(pattern=>({label:pattern[1],fix:pattern[2],line:lines.find(line=>pattern[0].test(line))})).filter(item=>item.line),relevant=state.project.mods.filter(mod=>mod.title&&String(text).toLowerCase().includes(mod.title.toLowerCase())).map(mod=>mod.title);
  return {name:name,findings:findings,relevant:relevant,excerpt:(findings[0]?.line||lines.find(line=>/exception|error|fatal/i.test(line))||'Kein typischer Crash-Marker erkannt.').slice(0,500)};
}

function scheduleCompatibilityCheck(delay = 900) {
  clearTimeout(state.compatibilityTimer);
  if (!state.project.mods.length) {
    state.compatibilityReport = null;
    $('compatibility-copy').textContent = 'Füge Mods hinzu, damit die KI sie automatisch prüfen kann.';
    $('compat-status').innerHTML = '<span>●</span> Noch keine Mods';
    $('compatibility-panel').classList.remove('has-issues', 'checking');
    return;
  }
  $('compatibility-copy').textContent = 'Prüfung läuft nach deiner letzten Änderung …';
  $('compat-status').innerHTML = '<span>◌</span> KI prüft …';
  $('compatibility-panel').classList.add('checking');
  state.compatibilityTimer = setTimeout(() => runCompatibilityCheck(), delay);
}

async function runCompatibilityCheck({ showTest = false } = {}) {
  clearTimeout(state.compatibilityTimer);
  const generation = ++state.compatibilityGeneration;
  if (showTest) {
    $('test-overlay').hidden = false;
    $('test-title').textContent = 'KI prüft dein Pack';
    $('test-detail').textContent = `${state.project.name} · Minecraft ${state.project.minecraftVersion} · ${state.project.loader} · ${state.project.mods.length} Mods`;
    $('test-spinner').textContent = '◌'; $('test-issues').hidden = true; $('test-issues').replaceChildren(); $('auto-fix').hidden = true; $('copy-test-report').hidden = true;
    $('step-compat').classList.add('current'); $('step-compat').classList.remove('done');
    $('step-launch').classList.remove('current', 'done'); $('step-world').classList.remove('current', 'done');
  }
  const expected = `${state.project.minecraftVersion} · ${state.project.loader}`;
  const mismatches = state.project.mods.filter(mod => mod.compatibility !== expected);
  try {
    const report = await window.workshop.checkCompatibility({ ...state.project, language: window.workshopI18n?.locale || 'de' });
    if (generation !== state.compatibilityGeneration) return;
    report.localMismatches = mismatches.map(mod => ({ key: `${mod.provider}:${mod.id}`, title: mod.title }));
    state.compatibilityReport = report;
    const errors = report.issues.filter(issue => issue.severity === 'error').length + mismatches.length;
    $('compatibility-copy').textContent = report.available ? (errors ? `${errors} mögliche Konflikte gefunden. Öffne „Testlauf“ für Details und Behebung.` : report.summary) : `KI nicht verbunden · ${mismatches.length ? `${mismatches.length} Versionsabweichung(en)` : 'Versions- und Loaderangaben geprüft'}`;
    $('compat-status').innerHTML = `<span>${errors ? '!' : report.available ? '✓' : '●'}</span> ${errors ? `${errors} Hinweis(e)` : report.available ? 'KI-Prüfung fertig' : 'Basisprüfung fertig'}`;
    $('compatibility-panel').classList.toggle('has-issues', errors > 0); $('compatibility-panel').classList.remove('checking');
    renderSelected();renderLab();if (showTest) showCompatibilityTest(report, mismatches);
  } catch (error) {
    if (generation !== state.compatibilityGeneration) return;
    const report = { available: false, summary: `KI-Prüfung fehlgeschlagen: ${error.message}`, issues: [], safeRemovals: [], localMismatches: mismatches.map(mod => ({ key: `${mod.provider}:${mod.id}`, title: mod.title })) };
    state.compatibilityReport = report;
    $('compatibility-copy').textContent = report.summary; $('compat-status').innerHTML = '<span>!</span> KI-Prüfung fehlgeschlagen';
    $('compatibility-panel').classList.add('has-issues'); $('compatibility-panel').classList.remove('checking');
    renderSelected();renderLab();if (showTest) showCompatibilityTest(report, mismatches);
  }
}

function showCompatibilityTest(report, mismatches) {
  const issues = $('test-issues'); issues.replaceChildren(); issues.hidden = false;
  const rows = [...report.issues, ...mismatches.map(mod => ({ severity: 'error', mods: [`${mod.provider}:${mod.id}`], message: `${mod.title} passt nicht zu ${state.project.minecraftVersion} · ${state.project.loader}.`, evidence: 'Die Mod wurde für eine andere Auswahl geladen. Suche sie mit den aktuellen Spieleinstellungen erneut.', fix: 'Durch einen passenden Vorschlag ersetzen.' }))];
  if (report.available && !rows.length) {
    const item = document.createElement('p'); item.className = 'test-issue ok'; item.textContent = report.summary || 'Keine bekannten Konflikte gefunden.'; issues.append(item);
  } else if (!report.available) {
    const item = document.createElement('p'); item.className = 'test-issue warning'; item.textContent = `${report.summary} ${rows.length ? `Zusätzlich: ${rows.length} Versionsabweichung(en).` : ''}`; issues.append(item);
  }
  for (const issue of rows) {
    const item = document.createElement('article'); item.className = `test-issue ${issue.severity}`;
    const names = issue.mods.map(key => state.project.mods.find(mod => `${mod.provider}:${mod.id}` === key)?.title).filter(Boolean);
    item.innerHTML = `<strong>${safe(issue.message)}</strong><span>${safe(names.join(', ') || issue.severity.toUpperCase())}</span><p>${safe(issue.evidence)}</p>${issue.fix ? `<small>Vorschlag: ${safe(issue.fix)}</small>` : ''}`; issues.append(item);
  }
  const hasError = rows.some(issue => issue.severity === 'error');
  $('step-compat').classList.toggle('done', !hasError && report.available); $('step-compat').classList.toggle('current', hasError);
  $('step-launch').classList.remove('current', 'done'); $('step-world').classList.remove('current', 'done');
  $('test-title').textContent = hasError ? 'Konflikte gefunden' : report.available ? 'Prüfung abgeschlossen' : 'Prüfbericht bereit';
  $('test-detail').textContent = `${report.summary}${!report.available ? ' · KI-Zugang verbinden für eine vollständige KI-Prüfung.' : ''} Der Launcher- und Weltstart sind noch nicht angebunden.`;
  $('test-spinner').textContent = hasError ? '!' : report.available ? '✓' : 'i';
  $('auto-fix').hidden = !report.safeRemovals?.length;
  $('auto-fix').title = report.safeRemovals?.length ? `${report.safeRemovals.length} eindeutig betroffene Mod(s) entfernen` : 'Keine sichere automatische Entfernung verfügbar';
  $('copy-test-report').hidden = false;
  $('copy-test-report').onclick = async () => {
    const lines = [`Modpack: ${state.project.name}`, `Minecraft: ${state.project.minecraftVersion}`, `Loader: ${state.project.loader}`, `Mods: ${state.project.mods.map(mod => mod.title).join(', ') || 'keine'}`, `Ergebnis: ${report.summary || 'Keine Zusammenfassung verfügbar.'}`, ...rows.map(issue => `- [${issue.severity}] ${issue.message}${issue.evidence ? ` — ${issue.evidence}` : ''}`)];
    try { await window.workshop.writeClipboard(lines.join('\n')); setStatus('Fehlerbericht in die Zwischenablage kopiert'); }
    catch (error) { setStatus(`Fehlerbericht konnte nicht kopiert werden: ${error.message}`); }
  };
}

function applyCompatibilityFixes() {
  const keys = new Set(state.compatibilityReport?.safeRemovals || []);
  if (!keys.size) return;
  const removed = state.project.mods.filter(mod => keys.has(`${mod.provider}:${mod.id}`));
  state.project.mods = state.project.mods.filter(mod => !keys.has(`${mod.provider}:${mod.id}`));
  queueSave(); renderSelected(); renderResults(window.lastResults || []);
  $('test-detail').textContent = `${removed.length} eindeutig betroffene Mod(s) entfernt. Die Prüfung startet erneut; füge Ersatz-Mods anschließend selbst hinzu.`;
  $('auto-fix').hidden = true;
  runCompatibilityCheck({ showTest: true });
}
async function loadPopularMods() {
  state.popularMods=null;if(!state.project.turns.length)renderChat();
  try{state.popularMods=await window.workshop.getPopularMods({minecraftVersion:state.project.minecraftVersion,loader:state.project.loader,provider:state.project.provider})}
  catch(error){state.popularMods=[];setStatus(`Beliebte Mods konnten nicht geladen werden: ${error.message}`)}
  if(!state.project.turns.length)renderChat();
}
function renderResults(items) {
  window.lastResults = items;
  $('result-count').textContent = String(items.length);
  const existing=new Set(state.project.mods.map(mod=>`${mod.provider}:${mod.id}`));
  const available=items.filter(mod=>!existing.has(`${mod.provider}:${mod.id}`)).length;
  const batchIds=new Set(state.batchSelection);
  const queued=items.filter(mod=>batchIds.has(`${mod.provider}:${mod.id}`)&&!existing.has(`${mod.provider}:${mod.id}`)).length;
  $('add-all-results').hidden=!available;
  $('add-ai-results').hidden=!available;
  const english=(window.workshopI18n?.locale||'de').startsWith('en');
  $('add-ai-results').textContent=english?'✨ Add with AI · up to 12':'✨ Mit KI ergänzen · bis zu 12';
  $('add-ai-results').title=english?'Automatically adds up to 12 highly relevant new mods.':'Fügt automatisch bis zu 12 besonders passende neue Mods hinzu.';
  $('add-all-results').textContent=queued?(english?`Add ${queued} selected mods to pack`:`${queued} ausgewählte Mods zum Pack hinzufügen`):(english?`Add pack foundation · ${available} mods`:`Passende Pack-Basis hinzufügen · ${available} Mods`);
  $('add-all-results').title=queued?(english?'Adds every checked suggestion to your pack.':'Fügt alle angehakten Vorschläge zum Pack hinzu.'):(english?'Adds all new matching suggestions at once.':'Fügt alle neuen, passend gefilterten Vorschläge auf einmal hinzu.');
  const area = $('mod-results');
  if (!items.length) { area.innerHTML = ''; return; }
  renderModCards(area,items);
}
function scoreModQueryRelevance(mod,query){
    const tokens=String(query||'').toLowerCase().match(/[\p{L}\p{N}]{3,}/gu)||[];
    const words=[...new Set(tokens.filter(word=>!['the','and','for','with','mod','minecraft','mods','pack'].includes(word)))];
    if(!words.length)return Number(mod.relevance)||0;
    const title=String(mod.title||'').toLowerCase(),summary=String(mod.summary||'').toLowerCase(),categories=(mod.categories||[]).join(' ').toLowerCase();
    const titleMatches=words.filter(word=>title.includes(word)).length,categoryMatches=words.filter(word=>categories.includes(word)).length,descriptionMatches=words.filter(word=>summary.includes(word)).length;
    return (Number(mod.relevance)||0)*3+(titleMatches/words.length)*12+(categoryMatches/words.length)*6+(descriptionMatches/words.length)*3;
}
function mergeRankedModResults(batches,queries,excluded=new Set()){
  const resultMap=new Map();
  batches.forEach((batch,batchIndex)=>{
    const query=queries[batchIndex]||'';
    for(const mod of batch){
      const key=`${mod.provider}:${mod.id}`;if(excluded.has(key))continue;
      const learned=Number(state.project.searchLearning?.[String(query).trim().toLowerCase()]||0);
      const queryScore=scoreModQueryRelevance(mod,query)+learned*2,prior=resultMap.get(key);
      if(prior){prior.matchQueries=[...new Set([...prior.matchQueries,query].filter(Boolean))];prior.matchQuery=prior.matchQueries.join(' · ');prior.relevance+=queryScore;prior.matchedFacets=prior.matchQueries.length}
      else resultMap.set(key,{...mod,matchQuery:query,matchQueries:query?[query]:[],relevance:queryScore,matchedFacets:query?1:0});
    }
  });
  return [...resultMap.values()].sort((a,b)=>(b.matchedFacets-a.matchedFacets)||(b.relevance-a.relevance)||(b.downloads||0)-(a.downloads||0));
}
function normalizeExactModName(value){return String(value||'').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^\p{L}\p{N}]+/gu,'')}
function matchExactRequestedMods(items,names){
  const matches=[];
  for(const name of names||[]){const target=normalizeExactModName(name);if(!target)continue;const exact=(items||[]).filter(mod=>normalizeExactModName(mod.title)===target||normalizeExactModName(mod.id)===target);if(exact.length){exact.sort((a,b)=>(Number(b.downloads)||0)-(Number(a.downloads)||0));const chosen=exact[0];if(!matches.some(mod=>`${mod.provider}:${mod.id}`===`${chosen.provider}:${chosen.id}`))matches.push(chosen)}}
  return matches;
}
function broaderModQueries(queries,prompt=''){
  const source=[...(queries||[]),String(prompt||'')].join(' ').toLowerCase();
  const groups=[
    [/(dungeon|boss|combat|fight|weapon|kampf|waff)/,['adventure structures','boss fights','dungeon structures','combat overhaul','weapon moves']],
    [/(biome|world generation|explor|dimension|erkund|welt)/,['world generation','new dimensions','exploration structures','terrain generation','adventure structures']],
    [/(magic|spell|wizard|zauber|magie)/,['spellcasting','magic systems','fantasy progression','enchanting']],
    [/(performance|fps|optimization|lag|leistung)/,['performance optimization','memory optimization','rendering performance','server performance']],
    [/(visual|ambience|atmosphere|light|punchy|visuals)/,['visual effects','dynamic lights','ambience','environmental effects']],
    [/(tech|automation|machine|create|technik)/,['automation','technology','machines','factory building']],
    [/(building|decoration|furniture|bau|deko)/,['building decoration','furniture','building blocks','farming']],
  ];
  const additions=groups.filter(([pattern])=>pattern.test(source)).flatMap(([,terms])=>terms);
  return [...new Set(additions.map(term=>term.trim()).filter(term=>term&&!queries.some(query=>query.toLowerCase()===term.toLowerCase())))].slice(0,6);
}
function modCardMarkup(mod,index,selection=null,{compact=false}={}){
  const english=(window.workshopI18n?.locale||'de').startsWith('en');
  const key=`${mod.provider}:${mod.id}`,inPack=state.project.mods.some(item=>`${item.provider}:${item.id}`===key),selected=selection?selection.has(key):inPack;
  const previews=compact?[]:[...new Set((Array.isArray(mod.gallery)?mod.gallery:[]).map(safeModPreview).filter(Boolean))];
  const previewMarkup=previews.length?`<div class="mod-gallery-carousel ${previews.length>1?'has-navigation':'single-preview'}"><button class="gallery-arrow" type="button" data-gallery-prev aria-label="${english?'Previous preview':'Vorheriges Bild'}" title="${english?'Previous image':'Vorheriges Bild'}" ${previews.length<2?'hidden disabled':''}>‹</button><div class="mod-preview-gallery" role="region" tabindex="0" aria-label="${english?'Mod preview images':'Mod-Vorschaubilder'}">${previews.map((url,i)=>`<button class="mod-preview-tile" type="button" data-preview-image="${safe(url)}" data-preview-title="${safe(mod.title)}" aria-label="${english?'Open image':'Bild öffnen'} ${i+1} ${english?'for':'von'} ${safe(mod.title)}"><img src="${safe(url)}" alt="${safe(mod.title)} ${english?'preview':'Vorschau'} ${i+1}" loading="${i===0?'eager':'lazy'}" decoding="async"><span>${i+1} / ${previews.length}</span></button>`).join('')}</div><button class="gallery-arrow" type="button" data-gallery-next aria-label="${english?'Next preview':'Nächstes Bild'}" title="${english?'Next image':'Nächstes Bild'}" ${previews.length<2?'hidden disabled':''}>›</button></div>`:'';
  const description=String(mod.summary|| (english?'No description provided.':'Keine Beschreibung angegeben.')).replace(/^\s*[-–—•]+\s*/,'').replace(/\s+[—–]\s+/g,', ');
  const addTitle=selected?(english?'Remove from pack':'Aus Pack entfernen'):(english?'Add to pack':'Zum Pack hinzufügen');
  const detailsTitle=english?'Read the full description':'Vollständige Beschreibung lesen';
  return `<article class="mod-card ${compact?'compact-mod-card':''} ${selected?'in-pack':''} ${previews.length?'has-gallery':''}" data-mod-details="${index}" tabindex="0" title="${selection?(english?'Click to add or remove this mod':'Klicken, um diese Mod hinzuzufügen oder zu entfernen'):(english?'Click to read the full mod description':'Klicken, um die vollständige Mod-Beschreibung zu lesen')}"><div class="mod-card-icon-wrap">${mod.icon?`<img class="mod-icon" src="${safe(mod.icon)}" alt="" loading="lazy">`:'<div class="mod-icon mod-icon-placeholder">✦</div>'}</div><div class="mod-card-main"><div class="mod-name"><strong>${safe(mod.title)}</strong><span class="source-tag">${safe(mod.source)}</span><button class="mod-details-open" type="button" data-open-mod-details="${index}" aria-label="${detailsTitle}" title="${detailsTitle}">ⓘ</button></div>${mod.matchQuery?`<div class="match-tag">${english?'Matches:':'Passend für:'} ${safe(mod.matchQuery)}</div>`:''}<div class="mod-purpose"><span>${english?'What it does':'Was die Mod macht'}</span><p class="mod-desc">${safe(description)}</p></div>${previewMarkup}<div class="mod-meta"><span>${safe(mod.author)}</span><span>↓ ${formatDownloads(mod.downloads)}</span><span>${safe(mod.compatibility)}</span></div></div><button class="add-mod ${selected?'added':''}" data-add="${index}" aria-pressed="${selected}" title="${addTitle}">${selected?'−':'+'}</button></article>`;
}
function renderModCards(area,items,{selection=null,onToggle=null,compact=false}={}){
  area.innerHTML=items.map((mod,index)=>modCardMarkup(mod,index,selection,{compact})).join('');
  area.querySelectorAll('[data-mod-details]').forEach(card=>{
    const open=event=>{if(event.target.closest('button,a,input,select,textarea,[data-preview-image]'))return;if(selection){toggleSelection(items,Number(card.dataset.modDetails),selection,onToggle);return}openModDetails(items[Number(card.dataset.modDetails)])};
    card.addEventListener('click',open);
    card.addEventListener('keydown',event=>{if((event.key==='Enter'||event.key===' ')&&event.target===card){event.preventDefault();if(selection)toggleSelection(items,Number(card.dataset.modDetails),selection,onToggle);else openModDetails(items[Number(card.dataset.modDetails)])}});
  });
  area.querySelectorAll('.mod-preview-tile img').forEach(image=>image.addEventListener('error',()=>{image.closest('.mod-preview-tile')?.remove();const gallery=image.closest('.mod-preview-gallery');if(gallery&&!gallery.querySelector('.mod-preview-tile')){gallery.closest('.mod-gallery-carousel')?.remove();gallery.closest('.mod-card')?.classList.remove('has-gallery')}},{once:true}));
  area.querySelectorAll('[data-open-mod-details]').forEach(button=>button.onclick=()=>openModDetails(items[Number(button.dataset.openModDetails)]));
  area.querySelectorAll('[data-preview-image]').forEach(button=>button.onclick=()=>openModPreview(button.dataset.previewImage,button.dataset.previewTitle));
  area.querySelectorAll('.mod-gallery-carousel').forEach(carousel=>{
    const gallery=carousel.querySelector('.mod-preview-gallery'),previous=carousel.querySelector('[data-gallery-prev]'),next=carousel.querySelector('[data-gallery-next]');
    const sync=()=>{const max=Math.max(0,gallery.scrollWidth-gallery.clientWidth);previous.disabled=gallery.scrollLeft<=2;next.disabled=gallery.scrollLeft>=max-2};
    previous.onclick=()=>gallery.scrollBy({left:-Math.max(1,gallery.clientWidth),behavior:'smooth'});
    next.onclick=()=>gallery.scrollBy({left:Math.max(1,gallery.clientWidth),behavior:'smooth'});
    gallery.addEventListener('scroll',sync,{passive:true});gallery.addEventListener('keydown',event=>{if(event.key==='ArrowLeft'){event.preventDefault();previous.click()}else if(event.key==='ArrowRight'){event.preventDefault();next.click()}});
    gallery.querySelectorAll('img').forEach(image=>image.addEventListener('load',sync,{once:true}));requestAnimationFrame(sync);
  });
  area.querySelectorAll('[data-add]').forEach(button=>button.onclick=()=>{const index=Number(button.dataset.add);if(!selection){togglePackMod(items,index);return}toggleSelection(items,index,selection,onToggle)});
}
function toggleSelection(items,index,selection,onToggle){
  const mod=items[index];if(!mod)return;
  const key=`${mod.provider}:${mod.id}`;
  const alreadyInPack=state.project.mods.some(item=>`${item.provider}:${item.id}`===key),selected=selection.has(key);
  if(alreadyInPack&&!selected){onToggle?.(mod,selection);return}
  if(selected)selection.delete(key);else selection.add(key);
  onToggle?.(mod,selection);
}
function syncSuggestedModsWithPack(turn){
  const inPack=new Set((state.project.mods||[]).map(mod=>`${mod.provider}:${mod.id}`));
  const seen=new Set(),selected=[];
  for(const mod of turn?.modResults||[]){const key=`${mod.provider}:${mod.id}`;if(inPack.has(key)&&!seen.has(key)){seen.add(key);selected.push(key)}}
  if(turn)turn.selectedSuggestedMods=selected;
  return new Set(selected);
}
function openModPreview(src,title='Mod-Vorschau'){
  const overlay=$('mod-preview-overlay');if(!overlay)return;
  $('mod-preview-image').src=src;$('mod-preview-title').textContent=title;overlay.hidden=false;
}
function closeModPreview(){const overlay=$('mod-preview-overlay');if(overlay)overlay.hidden=true;$('mod-preview-image').removeAttribute('src')}
function openModDetails(mod){
  if(!mod)return;
  const english=(window.workshopI18n?.locale||'de').startsWith('en'),overlay=$('mod-details-overlay');if(!overlay)return;
  overlay.dataset.projectId=`${mod.provider}:${mod.id}`;
  $('mod-details-title').textContent=mod.title|| (english?'Mod details':'Mod-Details');
  $('mod-details-source').textContent=mod.source||'Modrinth';
  $('mod-details-author').textContent=mod.author|| (english?'Unknown author':'Unbekannter Autor');
  $('mod-details-compatibility').textContent=mod.compatibility||'';
  $('mod-details-downloads').textContent=`↓ ${formatDownloads(mod.downloads||0)}`;
  $('mod-details-description').textContent=String(mod.summary|| (english?'Loading full description …':'Vollständige Beschreibung wird geladen …')).replace(/^\s*[-–—•]+\s*/,'').replace(/\s+[—–]\s+/g,', ');
  $('mod-details-description-status').textContent=english?'Loading full description …':'Vollständige Beschreibung wird geladen …';
  $('mod-details-description-heading').textContent=english?'Description':'Beschreibung';
  const icon=$('mod-details-icon'),iconUrl=safeModPreview(mod.icon);if(iconUrl){icon.src=iconUrl;icon.hidden=false}else{icon.removeAttribute('src');icon.hidden=true}
  const link=$('mod-details-link');link.href='#';link.hidden=true;
  const add=$('mod-details-add'),isSelected=state.project.mods.some(item=>item.provider===mod.provider&&item.id===mod.id);
  add.textContent=isSelected?(english?'Remove from pack':'Aus Pack entfernen'):(english?'Add to pack':'Zum Pack hinzufügen');
  add.onclick=()=>{togglePackMod([mod],0);overlay.hidden=true};
  overlay.hidden=false;
  if(window.workshop.getModDetails){
    window.workshop.getModDetails({provider:mod.provider,id:mod.id}).then(details=>{
      if(overlay.hidden||overlay.dataset.projectId!==`${mod.provider}:${mod.id}`)return;
      const text=String(details.description||mod.summary|| (english?'No description provided.':'Keine Beschreibung angegeben.')).replace(/^\s*[-–—•]+\s*/,'').replace(/\s+[—–]\s+/g,', ');
      $('mod-details-description').textContent=text;
      $('mod-details-description-status').textContent=text?(english?'Full description loaded':'Vollständige Beschreibung geladen'):(english?'The publisher has not provided a description.':'Der Anbieter hat keine Beschreibung hinterlegt.');
      if(details.url&&/^https:\/\/(?:modrinth\.com|www\.curseforge\.com)\//i.test(details.url)){$('mod-details-link').href=details.url;$('mod-details-link').hidden=false}
    }).catch(error=>{
      if(overlay.hidden||overlay.dataset.projectId!==`${mod.provider}:${mod.id}`) return;
      $('mod-details-description').textContent=String(mod.summary|| (english?'No description provided.':'Keine Beschreibung angegeben.')).replace(/^\s*[-–—•]+\s*/,'').replace(/\s+[—–]\s+/g,', ');
      $('mod-details-description-status').textContent=english?`Could not load the full description: ${error.message}`:`Vollständige Beschreibung konnte nicht geladen werden: ${error.message}`;
    });
  }
}
function closeModDetails(){const overlay=$('mod-details-overlay');if(overlay)overlay.hidden=true}
function togglePackMod(items,index){
  const mod=items[index],key=`${mod.provider}:${mod.id}`;
  const selectedIndex=state.project.mods.findIndex(item=>`${item.provider}:${item.id}`===key);
  const english=(window.workshopI18n?.locale||'de').startsWith('en');
  if(selectedIndex>=0){recordSearchFeedback(mod,-1);state.project.mods.splice(selectedIndex,1);state.batchSelection.delete(key);setStatus(english?`${mod.title} removed from the pack`:`${mod.title} aus dem Pack entfernt`)}
  else{state.batchSelection.delete(key);addPackMods([mod],{quiet:true});setStatus(english?`${mod.title} added to the pack`:`${mod.title} zum Pack hinzugefügt`);return}
  queueSave();renderSelected();renderResults(window.lastResults||[]);renderChat();reconcilePackDependencies();
}
function addModBatch(items){
  const selected=new Set(state.project.mods.map(mod=>`${mod.provider}:${mod.id}`));
  const queued=new Set(state.batchSelection);const useQueue=queued.size>0;
  const additions=items.filter(mod=>!selected.has(`${mod.provider}:${mod.id}`)&&(!useQueue||queued.has(`${mod.provider}:${mod.id}`)));
  if(!additions.length)return;
  state.batchSelection.clear();addPackMods(additions,{quiet:true});
  setStatus(`${additions.length} Mods gemeinsam zum Modpack hinzugefügt`);
}
function addAiRecommendations(items){
  const existing=new Set(state.project.mods.map(mod=>`${mod.provider}:${mod.id}`));
  const recommendations=items.map((mod,index)=>({mod,index,matchCount:String(mod.matchQuery||'').split(' · ').filter(Boolean).length,score:Number(mod.relevance)||0})).filter(item=>!existing.has(`${item.mod.provider}:${item.mod.id}`));
  recommendations.sort(compareSuggestionRelevance);
  const chosen=uniqueAutoAddCandidates(recommendations,state.project.mods,12).map(item=>item.mod);
  if(!chosen.length){setStatus('Es gibt keine neuen passenden Vorschläge zum Ergänzen.');return}
  state.batchSelection.clear();addPackMods(chosen,{quiet:true});
  setStatus(`KI-Auswahl: ${chosen.length} passende Mods automatisch zum Pack hinzugefügt`);
}
function compareSuggestionRelevance(a,b){
  const aMod=a.mod||a,bMod=b.mod||b;
  const aMatches=Number(a.matchCount??aMod.matchedFacets)||String(aMod.matchQuery||'').split(' · ').filter(Boolean).length;
  const bMatches=Number(b.matchCount??bMod.matchedFacets)||String(bMod.matchQuery||'').split(' · ').filter(Boolean).length;
  if(aMatches!==bMatches)return bMatches-aMatches;
  const aScore=Number(a.score??a.relevance??aMod.relevance)||0,bScore=Number(b.score??b.relevance??bMod.relevance)||0;
  const closeEnough=Math.abs(aScore-bScore)<=Math.max(1.5,Math.max(Math.abs(aScore),Math.abs(bScore))*.08);
  if(closeEnough){const popular=Number(bMod.downloads||0)-Number(aMod.downloads||0);if(popular)return popular}
  return (bScore-aScore)||((Number(bMod.downloads)||0)-(Number(aMod.downloads)||0))||((Number(a.index)||0)-(Number(b.index)||0));
}
function modFeatureFamily(mod){
  const text=`${mod?.title||''} ${mod?.summary||''} ${mod?.description||''} ${(mod?.categories||[]).join(' ')}`.toLowerCase();
  const families=[
    ['dynamic-lighting',/dynamic\s*lights?|dynamic\s*lighting|lambdynamiclights/],
    ['recipe-viewer',/just enough items|\bjei\b|roughly enough items|\brei\b|\bemi\b/],
    ['render-performance',/\bsodium\b|\bembeddium\b|\brubidium\b/],
    ['minimap',/minimap|mini-map|xaero.?s minimap|journeymap/],
    ['world-map',/world map|worldmap|xaero.?s world map|journey.?map/]
  ];
  return families.find(([,pattern])=>pattern.test(text))?.[0]||'';
}
function uniqueAutoAddCandidates(ranked,existingMods=[],limit=12){
  const existingIds=new Set((existingMods||[]).map(mod=>`${mod.provider}:${mod.id}`));
  const families=new Set((existingMods||[]).map(modFeatureFamily).filter(Boolean)),titles=new Set();
  const chosen=[],ordered=[...(ranked||[])].map((candidate,index)=>({candidate,index,mod:candidate.mod||candidate}));
  ordered.sort((a,b)=>compareSuggestionRelevance({ ...a.candidate,mod:a.mod,index:a.index },{ ...b.candidate,mod:b.mod,index:b.index }));
  for(const {candidate,mod} of ordered){
    const key=`${mod.provider}:${mod.id}`;if(existingIds.has(key))continue;
    const family=modFeatureFamily(mod);if(family&&families.has(family))continue;
    const title=String(mod.title||'').toLowerCase().replace(/\b(?:mod|minecraft|fabric|forge|neoforge|quilt|edition|compatibility|compat)\b/g,' ').replace(/[^a-z0-9]+/g,' ').trim();
    if(title&&titles.has(title))continue;
    if(family)families.add(family);if(title)titles.add(title);existingIds.add(key);chosen.push(candidate);
    if(chosen.length>=limit)break;
  }
  return chosen;
}
function renderChatModPicker(turn){
  const english=(window.workshopI18n?.locale||'de').startsWith('en'),items=sortChatModResults(turn);
  const selectedIds=syncSuggestedModsWithPack(turn);
  const section=document.createElement('section');section.className='chat-mod-compact';
  const heading=document.createElement('div');heading.className='chat-mod-compact-heading';
  const title=document.createElement('strong');title.textContent=english?'Mod suggestions':'Mod-Vorschläge';
  const selectedCount=selectedIds.size;
  const status=document.createElement('span');status.textContent=turn.modSearchStatus==='loading'?(english?'Searching matching versions and loaders …':'Suche passende Versionen und Loader …'):turn.modSearchStatus==='error'?(turn.modSearchError|| (english?'Search failed.':'Suche fehlgeschlagen.')):selectedCount?`${selectedCount} ${english?'selected':'ausgewählt'} · ${english?'added instantly':'direkt hinzugefügt'}`:`${items.length} ${english?'suggestions · choose your mods':'Vorschläge · wähle deine Mods'}`;
  heading.append(title,status);section.append(heading);
  if(turn.selectionNotice){const notice=document.createElement('div');notice.className='chat-mod-selection-notice';notice.textContent=turn.selectionNotice;section.append(notice)}
  if(turn.modSearchStatus==='loading'){
    const loading=document.createElement('div');loading.className='chat-mod-loading chat-mod-status';loading.textContent=english?'Loading Modrinth results …':'Lade Modrinth-Vorschläge …';section.append(loading);
  }else if(turn.modSearchStatus==='error'){
    const error=document.createElement('div');error.className='chat-mod-loading chat-mod-error chat-mod-status';error.textContent=turn.modSearchError|| (english?'Search failed.':'Suche fehlgeschlagen.');section.append(error);
  }else if(items.length){
    if(turn.selectionInline&&!turn.selectionComplete){renderInlineModPicker(section,turn,items,english);return section}
    const selected=items.filter(mod=>selectedIds.has(`${mod.provider}:${mod.id}`));
    const strip=document.createElement('div');strip.className='chat-mod-compact-icons';
    for(const mod of selected.slice(0,10)){const chip=document.createElement('span');chip.className='chat-mod-compact-chip';chip.title=mod.title||'';if(mod.icon){const icon=document.createElement('img');icon.src=safeModPreview(mod.icon);icon.alt='';chip.append(icon)}else{const icon=document.createElement('span');icon.className='chat-mod-compact-placeholder';icon.textContent='✦';chip.append(icon)}const label=document.createElement('span');label.textContent=mod.title||'';chip.append(label);strip.append(chip)}
    if(selected.length>10){const more=document.createElement('span');more.className='chat-mod-compact-more';more.textContent=`+${selected.length-10}`;strip.append(more)}
    if(selected.length)section.append(strip);
    const open=document.createElement('button');open.type='button';open.className='button button-quiet chat-mod-open-picker';open.textContent=turn.selectionComplete?(english?'Change selection':'Auswahl ändern'):turn.selectionDismissed?(english?'Open mod selection':'Mod-Auswahl öffnen'):(english?'Choose mods':'Mods auswählen');open.onclick=()=>openModSelection(turn,{forceWindow:true});section.append(open);
  }
  return section;
}
function sortChatModResults(turn){
  const items=[...(turn?.modResults||[])],order=turn?.modSortOrder||'relevance';
  const matchCount=mod=>Number(mod.matchedFacets)||String(mod.matchQuery||'').split(' · ').filter(Boolean).length;
  return items.sort((a,b)=>order==='downloads'?((Number(b.downloads)||0)-(Number(a.downloads)||0))||((Number(b.relevance)||0)-(Number(a.relevance)||0)):compareSuggestionRelevance({mod:a,matchCount:matchCount(a),score:Number(a.relevance)||0},{mod:b,matchCount:matchCount(b),score:Number(b.relevance)||0}));
}
function makeChatModSortControl(turn,english){
  const label=document.createElement('label');label.className='mod-picker-sort';
  const caption=document.createElement('span');caption.textContent=english?'Sort':'Sortieren';
  const select=document.createElement('select');select.setAttribute('aria-label',english?'Sort mod suggestions':'Modvorschläge sortieren');
  select.innerHTML=`<option value="relevance">${english?'Most relevant':'Relevanteste'}</option><option value="downloads">${english?'Most downloads':'Meiste Downloads'}</option>`;select.value=turn.modSortOrder||'relevance';
  select.addEventListener('change',()=>{const activeTurn=state.modPickerTurn||turn;activeTurn.modSortOrder=select.value;if(activeTurn.selectionInline&&!activeTurn.selectionComplete)renderChat();else renderModSelectionDialog()});label.append(caption,select);return label;
}
function renderInlineModPicker(section,turn,items,english){
  section.classList.add('has-inline-picker');
  const picker=document.createElement('div');picker.className='chat-mod-inline-picker';
  const toolbar=document.createElement('div');toolbar.className='chat-mod-inline-toolbar';
  const label=document.createElement('strong');label.textContent=english?'Choose suggestions':'Vorschläge auswählen';
  toolbar.append(makeChatModSortControl(turn,english));
  const mode=document.createElement('button');mode.type='button';mode.className='button button-quiet';mode.textContent=english?'Open large picker':'Großes Auswahlfenster';mode.onclick=()=>setModPickerView('window');toolbar.append(label,mode);
  const cards=document.createElement('div');cards.className='mod-results mod-picker-results chat-mod-inline-results';
  state.modPickerTurn=turn;state.modPickerSelection=syncSuggestedModsWithPack(turn);
  renderModCards(cards,items,{selection:state.modPickerSelection,compact:true,onToggle:(mod,selection)=>applyModPickerToggle(turn,mod,selection,picker,items,english)});
  const actions=document.createElement('div');actions.className='chat-mod-inline-actions';
  const count=document.createElement('span');count.className='chat-mod-inline-count';
  const ai=document.createElement('button');ai.type='button';ai.className='button button-quiet';ai.textContent=english?'✨ Add with AI · up to 12':'✨ Mit KI ergänzen · bis zu 12';ai.onclick=()=>confirmModSelection({ai:true});
  const confirm=document.createElement('button');confirm.type='button';confirm.className='button button-primary';confirm.textContent=english?'Done · back to chat':'Fertig · zurück zum Chat';confirm.onclick=()=>closeInlineModSelection(turn);
  actions.append(count,ai,confirm);picker.append(toolbar,cards,actions);section.append(picker);syncInlinePickerActions(picker,turn,items,english);
}
function syncInlinePickerActions(picker,turn,items,english){
  const selected=state.modPickerSelection;const count=picker.querySelector('.chat-mod-inline-count');if(count)count.textContent=`${selected.size} ${english?'selected':'ausgewählt'}`;
  const confirm=picker.querySelector('.chat-mod-inline-actions .button-primary');if(confirm){confirm.textContent=selected.size?(english?'Done · back to chat':'Fertig · zurück zum Chat'):(english?'Later · back to chat':'Später · zurück zum Chat');confirm.disabled=false}
  const existing=new Set(state.project.mods.map(mod=>`${mod.provider}:${mod.id}`));const ai=picker.querySelector('.chat-mod-inline-actions .button-quiet');if(ai)ai.disabled=!items.some(mod=>!existing.has(`${mod.provider}:${mod.id}`));
}
function applyModPickerToggle(turn,mod,selection,picker,items,english){
  const key=`${mod.provider}:${mod.id}`,shouldBeInPack=selection.has(key),isInPack=state.project.mods.some(item=>`${item.provider}:${item.id}`===key);
  turn.selectedSuggestedMods=[...selection];turn.selectionComplete=false;turn.selectionDismissed=false;turn.selectionNotice=english?`${mod.title} ${shouldBeInPack?'added to':'removed from'} your pack.`:`${mod.title} ${shouldBeInPack?'zum Pack hinzugefügt':'aus dem Pack entfernt'}.`;queueSave();
  if(shouldBeInPack!==isInPack)togglePackMod([mod],0);
  if(picker?.isConnected)syncInlinePickerActions(picker,turn,items,english);
  if(state.modPickerTurn===turn&&$('mod-selection-overlay')&&!$('mod-selection-overlay').hidden)renderModSelectionDialog();
}
function closeInlineModSelection(turn){
  if(!turn)return;
  turn.selectionComplete=(turn.selectedSuggestedMods||[]).length>0;turn.selectionDismissed=!turn.selectionComplete;turn.selectionInline=false;turn.selectionOpened=false;queueSave();state.modPickerTurn=null;state.modPickerSelection=new Set();renderChat();
}
function ensureModPickerViewSwitch(){
  const header=$('mod-selection-title')?.closest('.mod-selection-header');if(!header)return;
  let switcher=header.querySelector('.mod-picker-view-switch');if(!switcher){
    switcher=document.createElement('div');switcher.className='mod-picker-view-switch';switcher.setAttribute('role','group');
    for(const view of ['window','inline']){const button=document.createElement('button');button.type='button';button.dataset.modPickerView=view;button.className='mod-picker-view-button';button.onclick=()=>setModPickerView(view);switcher.append(button)}
    const closeButton=$('mod-selection-close');
    header.insertBefore(makeChatModSortControl(state.modPickerTurn,(window.workshopI18n?.locale||'de').startsWith('en')),closeButton);
    header.insertBefore(switcher,closeButton);
  }
  const english=(window.workshopI18n?.locale||'de').startsWith('en');
  const sort=header.querySelector('.mod-picker-sort select');if(sort)sort.value=state.modPickerTurn?.modSortOrder||'relevance';
  for(const button of switcher.querySelectorAll('[data-mod-picker-view]')){const active=button.dataset.modPickerView===state.modPickerView;button.textContent=button.dataset.modPickerView==='window'?(english?'Large window':'Großes Fenster'):(english?'In chat':'Im Chat');button.classList.toggle('active',active);button.setAttribute('aria-pressed',String(active))}
}
function setModPickerView(view){
  if(!['window','inline'].includes(view))return;
  state.modPickerView=view;localStorage.setItem('mw-mod-picker-view',view);
  const turn=state.modPickerTurn;
  if(view==='inline'&&turn){turn.selectionInline=true;turn.selectionOpened=true;turn.selectionDismissed=false;turn.selectedSuggestedMods=[...state.modPickerSelection];queueSave();$('mod-selection-overlay').hidden=true;state.modPickerTurn=null;state.modPickerSelection=new Set();renderChat();return}
  if(view==='window'&&turn){openModSelection(turn,{forceWindow:true});return}
  ensureModPickerViewSwitch();
}
function openModSelection(turn,{forceWindow=false}={}){
  if(!turn||turn.modSearchStatus!=='done'||!turn.modResults?.length)return;
  if(state.modPickerView==='inline'&&!forceWindow){turn.selectionInline=true;turn.selectionOpened=true;state.modPickerTurn=turn;state.modPickerSelection=syncSuggestedModsWithPack(turn);queueSave();renderChat();return}
  turn.selectionInline=false;turn.modSortOrder=turn.modSortOrder||'relevance';
  state.modPickerTurn=turn;state.modPickerSelection=syncSuggestedModsWithPack(turn);
  const english=(window.workshopI18n?.locale||'de').startsWith('en');
  $('mod-selection-title').textContent=english?'Choose mods for your pack':'Mods für dein Pack auswählen';
  $('mod-selection-subtitle').textContent=`${turn.modResults.length} ${english?'suggestions · click a card or + to add, − to remove':'Vorschläge · Karte oder + fügt hinzu, − entfernt'}`;
  $('mod-selection-overlay').hidden=false;ensureModPickerViewSwitch();renderModSelectionDialog();
}
function renderModSelectionDialog(){
  const turn=state.modPickerTurn;if(!turn)return;
  ensureModPickerViewSwitch();
  const english=(window.workshopI18n?.locale||'de').startsWith('en'),items=sortChatModResults(turn),selected=state.modPickerSelection;
  const area=$('mod-selection-results'),previousScrollTop=area.scrollTop;
  renderModCards(area,items,{selection:selected,onToggle:(mod,selection)=>applyModPickerToggle(turn,mod,selection,area,items,english)});
  const pager=turn.modSearchPages;
  if(pager){
    let status=area.querySelector('.mod-picker-page-status');
    if(!status){status=document.createElement('div');status.className='mod-picker-page-status';status.setAttribute('role','status');status.setAttribute('aria-live','polite');area.append(status)}
    status.textContent=pager.loading?(pager.aiExpanding?(english?`Finding more strong matches · ${turn.modResults?.length||0} loaded`:`Ich sammle weitere passende Mods · ${turn.modResults?.length||0} geladen`):(english?'Loading more suggestions…':'Lade weitere Modvorschläge …')):(pager.exhausted.every(Boolean)?(english?'All available results are loaded.':'Alle verfügbaren Treffer sind geladen.'):(english?'Scroll down for more suggestions.':'Scrolle weiter nach unten für mehr Vorschläge.'));
    area.onscroll=()=>{if(area.scrollTop+area.clientHeight>=area.scrollHeight-240)loadMoreChatModResults(turn)};
  }else area.onscroll=null;
  requestAnimationFrame(()=>{if(area.isConnected)area.scrollTop=previousScrollTop});
  $('mod-selection-count').textContent=`${selected.size} ${english?'selected':'ausgewählt'}`;
  $('mod-selection-continue').disabled=selected.size===0;
  $('mod-selection-ai-add').textContent=english?'✨ Add with AI · up to 12':'✨ Mit KI ergänzen · bis zu 12';
  $('mod-selection-ai-add').disabled=!(turn.modResults||[]).some(mod=>!state.project.mods.some(item=>item.provider===mod.provider&&item.id===mod.id));
  $('mod-selection-cancel').textContent=english?'Later':'Später';
  $('mod-selection-summary-title').textContent=english?'Your selection':'Deine Auswahl';
  $('mod-selection-continue').textContent=english?'Done · back to chat':'Fertig · zurück zum Chat';
  renderModSelectionSummary();
}
async function loadMoreChatModResults(turn){
  const pager=turn?.modSearchPages;if(!pager||pager.loading||pager.exhausted.every(Boolean)||state.modPickerTurn!==turn)return;
  pager.loading=true;renderModSelectionDialog();
  const pageSize=24,active=pager.queries.map((query,index)=>({query,index})).filter(item=>!pager.exhausted[item.index]);
  try{
    const batches=await Promise.all(active.map(({query,index})=>window.workshop.searchMods({query,kind:pager.kind,categories:pager.categories,minecraftVersion:state.project.minecraftVersion,loader:state.project.loader,provider:pager.provider,offset:pager.offsets[index],limit:pageSize})));
    if(state.modPickerTurn!==turn)return;
    const existing=new Set(state.project.mods.map(mod=>`${mod.provider}:${mod.id}`)),resultMap=new Map((turn.modResults||[]).filter(mod=>!existing.has(`${mod.provider}:${mod.id}`)).map(mod=>[`${mod.provider}:${mod.id}`,mod]));
    batches.forEach((batch,pageIndex)=>{
      const {query,index}=active[pageIndex];
      pager.offsets[index]+=batch.length;
      if(batch.length<pageSize)pager.exhausted[index]=true;
      for(const mod of batch){const key=`${mod.provider}:${mod.id}`;if(existing.has(key))continue;const prior=resultMap.get(key);if(prior){prior.matchQueries=[...new Set([...(prior.matchQueries||String(prior.matchQuery||'').split(' · ')),query].filter(Boolean))];prior.matchQuery=prior.matchQueries.join(' · ');prior.relevance=(Number(prior.relevance)||0)+scoreModQueryRelevance(mod,query);prior.matchedFacets=prior.matchQueries.length}else resultMap.set(key,{...mod,matchQuery:query,matchQueries:query?[query]:[],relevance:scoreModQueryRelevance(mod,query),matchedFacets:query?1:0})}
    });
    turn.modResults=[...resultMap.values()].sort((a,b)=>(b.matchedFacets-a.matchedFacets)||(b.relevance-a.relevance)||(b.downloads||0)-(a.downloads||0));
  }catch(error){pager.error=error.message}
  finally{pager.loading=false;renderModSelectionDialog();if(pager.error){const status=$('mod-selection-results').querySelector('.mod-picker-page-status');if(status)status.textContent=pager.error;pager.error=''}}
}
function renderModSelectionSummary(){
  const turn=state.modPickerTurn;if(!turn)return;
  const english=(window.workshopI18n?.locale||'de').startsWith('en'),items=turn.modResults||[],selected=state.modPickerSelection;
  const tray=$('mod-selection-selected');tray.replaceChildren();
  for(const mod of items.filter(item=>selected.has(`${item.provider}:${item.id}`))){
    const chip=document.createElement('span');chip.className='mod-selection-chip';chip.title=mod.title||'';
    if(mod.icon){const image=document.createElement('img');image.src=safeModPreview(mod.icon);image.alt='';chip.append(image)}else{const placeholder=document.createElement('span');placeholder.className='mod-selection-chip-placeholder';placeholder.textContent='✦';chip.append(placeholder)}
    const label=document.createElement('span');label.textContent=mod.title||'';chip.append(label);tray.append(chip);
  }
  $('mod-selection-count').textContent=`${selected.size} ${english?'selected':'ausgewählt'}`;
  $('mod-selection-continue').disabled=selected.size===0;
}
function closeModSelection({dismiss=true}={}){
  const turn=state.modPickerTurn;if(turn&&dismiss){turn.selectedSuggestedMods=[...state.modPickerSelection];turn.selectionComplete=turn.selectedSuggestedMods.length>0;turn.selectionDismissed=!turn.selectionComplete;turn.selectionInline=false;turn.selectionOpened=false;queueSave()}
  $('mod-selection-overlay').hidden=true;state.modPickerTurn=null;state.modPickerSelection=new Set();renderChat();
}
async function confirmModSelection({ai=false}={}){
  const turn=state.modPickerTurn;if(!turn)return;
  if(ai){const button=$('mod-selection-ai-add');button.disabled=true;const pager=turn.modSearchPages;const available=()=>uniqueAutoAddCandidates(sortChatModResults(turn).map((mod,index)=>({mod,index,matchCount:String(mod.matchQuery||'').split(' · ').filter(Boolean).length,score:Number(mod.relevance)||0})),state.project.mods,12).length;while(available()<12&&pager&&!pager.exhausted.every(Boolean)){pager.aiExpanding=true;renderModSelectionDialog();const before=turn.modResults?.length||0;await loadMoreChatModResults(turn);if((turn.modResults?.length||0)===before)break}if(pager)pager.aiExpanding=false;const ranked=[...(turn.modResults||[])].map((mod,index)=>({mod,index,matchCount:Number(mod.matchedFacets)||String(mod.matchQuery||'').split(' · ').filter(Boolean).length,score:Number(mod.relevance)||0}));ranked.sort(turn.modSortOrder==='downloads'?(a,b)=>(Number(b.mod.downloads)||0)-(Number(a.mod.downloads)||0)||compareSuggestionRelevance(a,b):compareSuggestionRelevance);state.modPickerSelection=new Set(uniqueAutoAddCandidates(ranked,state.project.mods,12).map(item=>`${item.mod.provider}:${item.mod.id}`));button.disabled=false}
  const selectedIds=[...state.modPickerSelection],mods=(turn.modResults||[]).filter(mod=>selectedIds.includes(`${mod.provider}:${mod.id}`));if(!mods.length)return;
  const already=new Set(state.project.mods.map(mod=>`${mod.provider}:${mod.id}`)),newMods=mods.filter(mod=>!already.has(`${mod.provider}:${mod.id}`));
  turn.selectedSuggestedMods=selectedIds;turn.selectionComplete=true;turn.selectionDismissed=false;turn.selectionInline=false;turn.selectionOpened=false;
  state.modPickerTurn=null;state.modPickerSelection=new Set();$('mod-selection-overlay').hidden=true;
  if(newMods.length)addPackMods(newMods,{quiet:true});const english=(window.workshopI18n?.locale||'de').startsWith('en');turn.selectionNotice=ai?(english?`AI automatically added ${newMods.length} matching mods.`:`KI hat ${newMods.length} passende Mods automatisch hinzugefügt.`):(english?`${selectedIds.length} mods are in your pack.`:`${selectedIds.length} Mods sind in deinem Pack.`);queueSave();renderChat();
  setStatus(english?`${newMods.length} mods added to your pack.`:`${newMods.length} Mods zum Pack hinzugefügt.`);
}
async function runCatalogSearch(append=false){
  const english=(window.workshopI18n?.locale||'de').startsWith('en');
  let session=state.catalogSearch;
  if(append&&(!session||session.loading||session.exhausted))return;
  if(!append){
    state.searchPages=null;session={generation:++state.searchGeneration,projectId:state.project.id,items:[],offset:0,loading:false,exhausted:false,input:{query:$('catalog-query').value.trim(),category:$('catalog-category').value,environment:$('catalog-environment').value,sort:$('catalog-sort').value,openSource:$('catalog-open-source').checked,minecraftVersion:state.project.minecraftVersion,loader:state.project.loader,provider:'modrinth',kind:'mod',catalogSearch:true,limit:48}};
    state.catalogSearch=session;state.batchSelection.clear();$('refinement-row').hidden=true;renderResults([]);
  }
  const current=()=>state.catalogSearch===session&&session.generation===state.searchGeneration&&session.projectId===state.project.id&&session.input.minecraftVersion===state.project.minecraftVersion&&session.input.loader===state.project.loader;
  session.loading=true;$('catalog-submit').disabled=true;$('catalog-more').disabled=true;
  $('results-hint').textContent=english?'Searching Modrinth catalogue …':'Modrinth-Katalog wird durchsucht …';
  try{
    const batch=await window.workshop.searchMods({...session.input,offset:session.offset});
    if(!current())return;
    session.offset+=batch.length;session.exhausted=batch.length<session.input.limit;
    const seen=new Set(session.items.map(mod=>`${mod.provider}:${mod.id}`));
    for(const mod of batch){const key=`${mod.provider}:${mod.id}`;if(!seen.has(key)){seen.add(key);session.items.push(mod)}}
    renderResults(session.items);$('catalog-more').hidden=session.exhausted;
    $('results-hint').textContent=english?`${session.items.length} catalogue results · selected filters applied`:`${session.items.length} Katalogtreffer · gewählte Filter angewendet`;
    setStatus(english?'Modrinth catalogue updated':'Modrinth-Katalog aktualisiert');
  }catch(error){if(current()){$('results-hint').textContent=error.message;$('catalog-more').hidden=!append;setStatus(error.message)}}
  finally{session.loading=false;if(state.catalogSearch===session){$('catalog-submit').disabled=false;$('catalog-more').disabled=false}}
}
async function loadMoreModResults(){
  const pager=state.searchPages;if(!pager||pager.loading||pager.exhausted.every(Boolean)||state.catalogSearch)return;
  pager.loading=true;const english=(window.workshopI18n?.locale||'de').startsWith('en');$('catalog-more').disabled=true;$('catalog-more').textContent=english?'Loading more…':'Lade weitere Treffer …';
  const current=()=>state.searchPages===pager&&pager.generation===state.searchGeneration&&pager.projectId===state.project.id;
  try{
    const active=pager.queries.map((query,index)=>({query,index})).filter(item=>!pager.exhausted[item.index]);
    const batches=await Promise.all(active.map(({query,index})=>window.workshop.searchMods({query,kind:pager.kind,categories:pager.categories,minecraftVersion:pager.minecraftVersion,loader:pager.loader,provider:pager.provider,offset:pager.offsets[index],limit:pager.limit})));
    if(!current())return;
    const byId=new Map((window.lastResults||[]).map(mod=>[`${mod.provider}:${mod.id}`,mod]));
    batches.forEach((batch,pageIndex)=>{const {query,index}=active[pageIndex];pager.offsets[index]+=batch.length;if(batch.length<pager.limit)pager.exhausted[index]=true;for(const mod of batch){const key=`${mod.provider}:${mod.id}`;if(state.project.mods.some(item=>`${item.provider}:${item.id}`===key))continue;const existing=byId.get(key);if(existing){existing.matchQueries=[...new Set([...(existing.matchQueries||[]),query])];existing.relevance=(Number(existing.relevance)||0)+scoreModQueryRelevance(mod,query)}else byId.set(key,{...mod,matchQueries:[query],relevance:scoreModQueryRelevance(mod,query)})}});
    const items=[...byId.values()].sort((a,b)=>(b.relevance||0)-(a.relevance||0)||(b.downloads||0)-(a.downloads||0));renderResults(items);$('catalog-more').hidden=pager.exhausted.every(Boolean);$('results-hint').textContent=english?`${items.length} results loaded · scroll for more`:`${items.length} Treffer geladen · weiter scrollen für mehr`;
  }catch(error){if(current())$('results-hint').textContent=error.message}
  finally{pager.loading=false;if(state.searchPages===pager){$('catalog-more').disabled=false;$('catalog-more').textContent=english?'Load more results':'Weitere Treffer laden'}}
}
async function searchMods(query, fromChat = false, options = {}) {
  state.pendingModSearches=(state.pendingModSearches||0)+1;
  try {
  state.catalogSearch=null;
  state.searchPages=null;
  if($('catalog-more'))$('catalog-more').hidden=true;
  if($('catalog-submit'))$('catalog-submit').disabled=false;
  const kind=options.kind||'mod';state.searchKind=kind;
  const modeQueries={visual:['dynamic lights','visual effects','ambience','particle effects','environmental sounds','falling leaves'],shader:['minecraft shader','shaders'],resourcepack:['resource pack','texture pack','punchy resource pack']};
  const modeCategories={visual:['decoration','utility','game-mechanics']};
  const exactNames=(fromChat&&kind==='mod'?(options.exactModNames||options.chatTurn?.exactModNames||[]):[]).slice(0,4);
  const requested=modeQueries[kind]|| (Array.isArray(query)?query:[query]);
  const queries = [...new Set([...exactNames,...requested].map(value=>String(value||'').trim()).filter(Boolean))].slice(0,6); if (!queries.length) return;
  const categories=kind==='mod'&&!exactNames.length?(modeCategories[kind]||[]):(modeCategories[kind]||[]);
  if(fromChat&&state.autoSetup)await chooseBestSetup(queries);
  const text=queries.join(' · ');
  state.lastSearchQueries=queries;
  const chatTurn=fromChat?options.chatTurn:null;
  const generation=chatTurn?++state.chatSearchGeneration:++state.searchGeneration;
  if(chatTurn)chatTurn.searchGeneration=generation;
  const isStale=()=>chatTurn?chatTurn.searchGeneration!==generation:generation!==state.searchGeneration;
  if(chatTurn){chatTurn.modSearchStatus='loading';chatTurn.modResults=[];renderChat()}
  $('mod-search').value = modeQueries[kind]?({visual:'Visuelle Mod-Verbesserungen',shader:'Shader-Packs',resourcepack:'Resource-Packs'}[kind]):text;
  document.querySelectorAll('[data-search-mode]').forEach(button=>button.classList.toggle('active',button.dataset.searchMode===kind));
  $('results-hint').textContent = queries.length>1?`Suche in ${queries.length} passenden Kategorien …`:'Suche nach passenden Mods …';
  $('mod-results').innerHTML = '<div class="results-hint">Lade Modvorschläge …</div>';
  try {
    const provider=kind==='mod'?state.project.provider:'modrinth';
    const pageSize=48;
    let searchQueries=queries;
    let batches=await Promise.all(searchQueries.map(term=>window.workshop.searchMods({query:term,kind,categories,minecraftVersion:state.project.minecraftVersion,loader:state.project.loader,provider,offset:0,limit:pageSize})));
    if (isStale()) return;
    const exactRequested=new Set(exactNames.map(normalizeExactModName));
    const existing=new Set(state.project.mods.filter(mod=>!exactRequested.has(normalizeExactModName(mod.title))&&!exactRequested.has(normalizeExactModName(mod.id))).map(mod=>`${mod.provider}:${mod.id}`));
    let results=mergeRankedModResults(batches,searchQueries,existing);
    const initialExact=matchExactRequestedMods(results,exactNames);
    if(kind==='mod'&&results.length<5&&(!exactNames.length||initialExact.length<exactNames.length)){
      const turnIndex=chatTurn?state.project.turns.indexOf(chatTurn):-1,previousPrompt=turnIndex>=0?state.project.turns.slice(0,turnIndex).reverse().find(turn=>turn.role==='user')?.content||'':'';
      const alternatives=broaderModQueries(queries,previousPrompt).filter(term=>!searchQueries.some(query=>query.toLowerCase()===term.toLowerCase()));
      if(alternatives.length){const alternativeBatches=await Promise.all(alternatives.map(term=>window.workshop.searchMods({query:term,kind,categories,minecraftVersion:state.project.minecraftVersion,loader:state.project.loader,provider,offset:0,limit:pageSize,sort:'downloads'})));if(isStale())return;searchQueries=[...searchQueries,...alternatives];batches=[...batches,...alternativeBatches];results=mergeRankedModResults(batches,searchQueries,existing)}
    }
    const providerFallback=state.project.provider==='curseforge'&&results.some(mod=>mod.provider==='modrinth');
    renderResults(results); $('results-hint').textContent = results.length ? `${providerFallback?'Kein CurseForge-Schlüssel · Suche automatisch über Modrinth · ':''}${results.length} thematisch sortierte Vorschläge · Version und Loader gefiltert · Auswahl bleibt bei dir` : batches.some(batch=>batch.length)?'Alle passenden Treffer sind bereits in deinem Pack. Probiere eine weitere Richtung.':'Keine passenden Treffer. Probiere einen kürzeren Suchbegriff.';
    $('refinement-row').hidden=!results.length;
    if(chatTurn){
      chatTurn.modSearchStatus='done';chatTurn.modSearchError='';chatTurn.modSearchPages={queries:searchQueries,kind,categories,provider,offsets:batches.map(batch=>batch.length),exhausted:batches.map(batch=>batch.length<pageSize),loading:false};
      const exactMatches=matchExactRequestedMods(results,exactNames);
      if(exactMatches.length){
        addPackMods(exactMatches,{quiet:true});
        chatTurn.selectedSuggestedMods=exactMatches.map(mod=>`${mod.provider}:${mod.id}`);
        const allFound=exactMatches.length===exactNames.length;
        const alreadySelected=exactMatches.filter(mod=>state.project.mods.some(item=>item.provider===mod.provider&&item.id===mod.id)).length;
        chatTurn.selectionComplete=allFound;
        chatTurn.selectionDismissed=allFound;
        const english=(window.workshopI18n?.locale||'de').startsWith('en');
        chatTurn.selectionNotice=allFound
          ? (english?(alreadySelected===exactMatches.length?'The exact requested mod is already in your active pack.':`Added the exact requested ${exactMatches.length===1?'mod':'mods'} directly to your active pack.`):(alreadySelected===exactMatches.length?'Die gewünschte Mod ist bereits in deinem Pack.':`Die ausdrücklich gewünschte${exactMatches.length===1?' Mod':'n Mods'} wurde${exactMatches.length===1?'':'n'} direkt zum aktiven Pack hinzugefügt.`))
          : (english?`Added ${exactMatches.length} exact match${exactMatches.length===1?'':'es'}. I couldn’t find every requested name, so the remaining results are alternatives.`:`${exactMatches.length} exakte${exactMatches.length===1?'r Treffer wurde':' Treffer wurden'} hinzugefügt. Für die übrigen Namen zeige ich passende Alternativen.`);
        const exactKeys=new Set(exactMatches.map(mod=>`${mod.provider}:${mod.id}`));
        chatTurn.modResults=allFound?exactMatches:results.filter(mod=>!exactKeys.has(`${mod.provider}:${mod.id}`));
      }else chatTurn.modResults=results;
      renderChat();
    }else{
      state.searchPages={generation,projectId:state.project.id,queries:searchQueries,kind,categories,provider,minecraftVersion:state.project.minecraftVersion,loader:state.project.loader,offsets:batches.map(batch=>batch.length),exhausted:batches.map(batch=>batch.length<pageSize),limit:pageSize,loading:false};
      $('catalog-more').hidden=state.searchPages.exhausted.every(Boolean);$('catalog-more').textContent=(window.workshopI18n?.locale||'de').startsWith('en')?'Load more results':'Weitere Treffer laden';
    }
    setStatus(results.length ? providerFallback?`${results.length} Vorschläge über Modrinth gefunden`:`${results.length} Modvorschläge gefunden` : 'Keine Treffer gefunden');
  } catch (error) {
    if (isStale()) return;
    $('mod-results').innerHTML = ''; $('results-hint').textContent = error.message;$('refinement-row').hidden=true;
    if(chatTurn){chatTurn.modSearchStatus='error';chatTurn.modSearchError=error.message;chatTurn.modResults=[];renderChat()}
    setStatus(error.message);
  }
  } finally { state.pendingModSearches--; }
}
function turnTopics(turn) {
  if (turn.searchTerms?.length) {
    const categories=[
      {test:/shader/i,label:'Shader'},
      {test:/resource.?pack|texture.?pack/i,label:'Resource-Packs'},
      {test:/visual|dynamic light|ambien|lighting|atmosphere|punchy/i,label:'Visual-Mods'},
      {test:/combat|boss|fight|battle|weapon|dungeon mob/i,label:'Kampf'},
      {test:/dungeon|structure|ruin|temple|stronghold/i,label:'Dungeons'},
      {test:/explor|adventure|world|travel/i,label:'Erkundung'},
      {test:/biome|terrain|worldgen/i,label:'Biome'},
      {test:/create|tech|automation|machine|engineering/i,label:'Technik'},
      {test:/magic|spell|wizard|enchant/i,label:'Magie'},
      {test:/performance|optimization|fps|smooth/i,label:'Leistung'},
      {test:/build|decoration|furniture/i,label:'Bauen & Deko'},
      {test:/quest|progression/i,label:'Quests'}
    ];
    const mapped=[...new Set(turn.searchTerms.map(term=>categories.find(item=>item.test.test(String(term)))?.label).filter(Boolean))];
    if(mapped.length)return mapped.slice(0,2);
  }
  const index=state.project.turns.indexOf(turn);
  const previousUser=state.project.turns.slice(0,index).reverse().find(item=>item.role==='user');
  const contextText=`${previousUser?.content||''} ${turn.content||''}`;
  const known=['Dungeons','Bosskämpfe','Erkundung','Biome','Technik','Create','Magie','Performance','Bauen','Quests','Dekoration','Atmosphäre','Shader','Resource-Packs','Visual-Mods'];
  return known.filter(topic=>new RegExp(topic,'i').test(contextText)).slice(0,4);
}
function renderAssistantFollowups(turn) {
  if(state.sending)return null;
  if(turn.edition==='bedrock'&&!turn.alternativesAccepted&&!turn.alternativesDeclined)return null;
  const topics=turnTopics(turn),topicLabel=topics.length?topics.join(' & '):'deiner bisherigen Idee';
  const firstTopic=topics[0]||'in diese Richtung';
  const english=(window.workshopI18n?.locale||'de').startsWith('en');
  const prompts=[
    {label:english?`✨ More ${firstTopic}`:`✨ Mehr ${firstTopic}`,prompt:english?`Find more suitable mods for ${topicLabel}. Use my idea and selected mods as context, avoid mods already selected, and find Modrinth versions for my current setup.`:`Finde weitere passende Mods für ${topicLabel}. Nutze meine bisherige Idee und Mod-Auswahl als Kontext, vermeide bereits ausgewählte Mods und suche passende Modrinth-Versionen für mein aktuelles Setup.`},
    {label:english?'🔀 Alternatives':'🔀 Alternativen',prompt:english?`Show suitable alternatives for ${topicLabel}. Briefly explain how they differ, avoid already selected mods, and consider my current setup.`:`Zeige mir passende Alternativen für ${topicLabel}. Erkläre kurz, worin sie sich unterscheiden, vermeide bereits ausgewählte Mods und berücksichtige mein aktuelles Setup.`},
    {label:english?'🧩 Complete the pack':'🧩 Pack ergänzen',prompt:english?`Find mods that complement my pack. Keep ${topicLabel} as the focus, avoid duplicate features and mods already selected.`:`Finde Mods, die mein bisheriges Pack sinnvoll ergänzen. Behalte ${topicLabel} als Schwerpunkt, vermeide doppelte Funktionen und bereits ausgewählte Mods.`},
    {label:english?'⚡ Optimize performance':'⚡ Leistung optimieren',prompt:english?`Optimize my pack for good performance. Keep ${topicLabel} as the focus and find mods suitable for my current Minecraft setup.`:`Optimiere mein bisheriges Pack auf gute Leistung. Behalte ${topicLabel} als Schwerpunkt und suche passende Mods für mein aktuelles Minecraft-Setup.`},
    {label:'✨ Visual-Mods',kind:'visual'}, {label:'🌅 Shader-Packs',kind:'shader'}, {label:'🖼 Resource-Packs',kind:'resourcepack'},
    {label:english?'🧭 More exploration':'🧭 Mehr Erkundung',prompt:english?'Find exploration, biome, structure and dimension mods for my current setup.':'Finde Erkundungs-, Biom-, Struktur- und Dimensionsmods für mein aktuelles Setup.'},
    {label:english?'⚔ More combat':'⚔ Mehr Kampf',prompt:english?'Find combat, boss, dungeon and weapon mods for my current setup.':'Finde Kampf-, Boss-, Dungeon- und Waffenmods für mein aktuelles Setup.'},
    {label:english?'🔮 More magic':'🔮 Mehr Magie',prompt:english?'Find magic, spell, alchemy and fantasy mods for my current setup.':'Finde Magie-, Zauber-, Alchemie- und Fantasy-Mods für mein aktuelles Setup.'},
    {label:english?'🔧 More technology':'🔧 Mehr Technik',prompt:english?'Find technology, automation and Create-style mods for my current setup.':'Finde Technik-, Automatisierungs- und Create-Mods für mein aktuelles Setup.'}
  ];
  const moreGroups = [
    { title: english?'Play style':'Spielstil', items: [
      ['🌱 Vanilla+','Finde Mods für ein Vanilla+-Pack: vertrautes Minecraft, aber mit sinnvollen neuen Funktionen.'],
      ['☠️ Hardcore','Finde ein anspruchsvolles Hardcore-Survival-Setup mit fairer Progression und passenden Gefahren.'],
      ['🕊️ Friedlich','Finde ein entspanntes, friedliches Pack mit wenig Kampf und Fokus auf Entdecken und Bauen.'],
      ['🤝 Koop & Server','Finde Mods, die sich besonders gut für gemeinsames Spielen und einen Server eignen.'],
      ['📜 Quests & Fortschritt','Finde Quest-, Aufgaben- und Fortschrittssysteme, die mein Pack sinnvoll strukturieren.']
    ]},
    { title: english?'World & adventure':'Welt & Abenteuer', items: [
      ['🌌 Neue Dimensionen','Finde passende neue Dimensionen und prüfe, ob sie mit meiner bisherigen Auswahl zusammenspielen.'],
      ['🧱 Strukturen & Ruinen','Finde spannende Strukturen, Ruinen und Sehenswürdigkeiten für die Welt.'],
      ['🕳️ Höhlen & Untergrund','Finde Höhlen-, Bergbau- und Untergrund-Erweiterungen, die zur Pack-Richtung passen.'],
      ['🔥 Nether & End','Finde Erweiterungen für Nether und End mit neuen Orten, Gegnern und Belohnungen.'],
      ['🐉 Boss-Progression','Finde eine gut abgestimmte Boss-Reihenfolge mit passender Ausrüstung und steigender Schwierigkeit.']
    ]},
    { title: english?'Building & life':'Bauen & Alltag', items: [
      ['🏡 Bauen & Dekoration','Finde Bau-, Möbel- und Dekorationsmods, die zum Stil meines Packs passen.'],
      ['🌾 Landwirtschaft & Essen','Finde Landwirtschafts-, Koch- und Ernährungsmods mit passenden Pflanzen und Gerichten.'],
      ['🐾 Tiere & Begleiter','Finde Tier-, Haustier- und Begleiter-Mods für meine Minecraft-Version.'],
      ['🧭 Karten & Orientierung','Finde hilfreiche Karten-, Wegpunkt- und Navigationsmods, die meine Version unterstützen.']
    ]},
    { title: english?'Tuning & polish':'Technik & Feinschliff', items: [
      ['🧰 Quality of Life','Finde praktische Quality-of-Life-Mods, ohne mein Pack mit unnötigen Extras zu überladen.'],
      ['🪶 Schwacher PC','Optimiere die Vorschläge für einen eher schwachen PC und vermeide unnötig schwere Mods.'],
      ['🖥️ Serverfreundlich','Prüfe, welche Vorschläge serverseitig, clientseitig oder auf beiden Seiten gebraucht werden.'],
      ['🧩 Abhängigkeiten prüfen','Prüfe meine Auswahl auf notwendige Abhängigkeiten, doppelte Funktionen und bekannte Konflikte.'],
      ['🔄 Andere Mod-Loader','Vergleiche Fabric, Forge und NeoForge für meine Themen und nenne den Loader mit der besten Mod-Auswahl.'],
      ['🧹 Auswahl aufräumen','Finde doppelte Funktionen in meinem Pack und schlage konkrete, kompatible Alternativen vor.']
    ]}
  ];
  const englishLabels={
    '🌱 Vanilla+':'🌱 Vanilla+', '☠️ Hardcore':'☠️ Hardcore', '🕊️ Friedlich':'🕊️ Peaceful', '🤝 Koop & Server':'🤝 Co-op & server', '📜 Quests & Fortschritt':'📜 Quests & progression',
    '🌌 Neue Dimensionen':'🌌 New dimensions', '🧱 Strukturen & Ruinen':'🧱 Structures & ruins', '🕳️ Höhlen & Untergrund':'🕳️ Caves & underground', '🔥 Nether & End':'🔥 Nether & End', '🐉 Boss-Progression':'🐉 Boss progression',
    '🏡 Bauen & Dekoration':'🏡 Building & decoration', '🌾 Landwirtschaft & Essen':'🌾 Farming & food', '🐾 Tiere & Begleiter':'🐾 Animals & companions', '🧭 Karten & Orientierung':'🧭 Maps & navigation',
    '🧰 Quality of Life':'🧰 Quality of life', '🪶 Schwacher PC':'🪶 Low-end PC', '🖥️ Serverfreundlich':'🖥️ Server-friendly', '🧩 Abhängigkeiten prüfen':'🧩 Check dependencies', '🔄 Andere Mod-Loader':'🔄 Compare mod loaders', '🧹 Auswahl aufräumen':'🧹 Clean up my selection'
  };
  const englishPrompts={
    '🌱 Vanilla+':'Find mods for a Vanilla+ pack: keep Minecraft familiar while adding useful features.', '☠️ Hardcore':'Build a challenging hardcore survival setup with fair progression and fitting threats.', '🕊️ Friedlich':'Find a relaxed, peaceful pack focused on discovery and building, with little combat.', '🤝 Koop & Server':'Find mods that work especially well for co-op play and a shared server.', '📜 Quests & Fortschritt':'Find quest and progression systems that give my pack a clear structure.',
    '🌌 Neue Dimensionen':'Find fitting new dimensions and check how they work with my current selection.', '🧱 Strukturen & Ruinen':'Find interesting structures, ruins, and landmarks for the world.', '🕳️ Höhlen & Untergrund':'Find cave, mining, and underground expansions that fit the pack.', '🔥 Nether & End':'Find Nether and End expansions with new places, enemies, and rewards.', '🐉 Boss-Progression':'Build a balanced boss progression with suitable gear and steadily increasing difficulty.',
    '🏡 Bauen & Dekoration':'Find building, furniture, and decoration mods that fit my pack style.', '🌾 Landwirtschaft & Essen':'Find farming, cooking, and food mods with fitting crops and meals.', '🐾 Tiere & Begleiter':'Find animal, pet, and companion mods for my Minecraft version.', '🧭 Karten & Orientierung':'Find useful map, waypoint, and navigation mods that support my version.',
    '🧰 Quality of Life':'Find practical quality-of-life mods without adding unnecessary bloat.', '🪶 Schwacher PC':'Tune suggestions for a lower-end PC and avoid unnecessarily demanding mods.', '🖥️ Serverfreundlich':'Check which suggestions are needed on the server, client, or both.', '🧩 Abhängigkeiten prüfen':'Check my selection for required dependencies, duplicate features, and known conflicts.', '🔄 Andere Mod-Loader':'Compare Fabric, Forge, and NeoForge and recommend the loader with the best mod coverage for my topics.', '🧹 Auswahl aufräumen':'Find duplicate features in my pack and suggest specific compatible alternatives.'
  };
  const morePrompts=moreGroups.flatMap(group=>group.items.map(([label,prompt])=>({label:english?(englishLabels[label]||label):label,prompt:english?(englishPrompts[label]||prompt):prompt,group:group.title})));
  const actions=document.createElement('div');actions.className='assistant-followups';
  const label=document.createElement('span');label.className='assistant-followups-label';label.textContent=english?'Continue with one click':'Wie möchtest du weitermachen?';actions.append(label);
  const buttons=document.createElement('div');buttons.className='suggestion-row';
  buttons.innerHTML=prompts.map((item,index)=>`<button class="suggestion" data-prompt="${safe(item.prompt||'')}" data-search-kind="${item.kind||''}">${safe(item.label)}</button>`).join('');
  buttons.querySelectorAll('[data-prompt]').forEach(button=>button.onclick=()=>button.dataset.searchKind?searchInChatMode(button.dataset.searchKind):submitAssistantPrompt(button,button.dataset.prompt));
  actions.append(buttons);
  const more=document.createElement('details');more.className='more-suggestions';
  const summary=document.createElement('summary');summary.textContent=english?`${morePrompts.length} more directions`:`${morePrompts.length} weitere Richtungen`;more.append(summary);
  for(const group of moreGroups){const groupTitle=document.createElement('span');groupTitle.className='more-suggestions-title';groupTitle.textContent=english?({
    'Spielstil':'Play style','Welt & Abenteuer':'World & adventure','Bauen & Alltag':'Building & life','Technik & Feinschliff':'Tuning & polish'
  }[group.title]||group.title):group.title;more.append(groupTitle);const row=document.createElement('div');row.className='suggestion-row';
    for(const [label,prompt] of group.items){const item=morePrompts.find(candidate=>candidate.group===group.title&&candidate.label===(english?(englishLabels[label]||label):label));const button=document.createElement('button');button.type='button';button.className='suggestion';button.textContent=item?.label||label;button.title=item?.prompt||prompt;button.onclick=()=>submitAssistantPrompt(button,item?.prompt||prompt);row.append(button)}
    more.append(row)
  }
  actions.append(more);return actions;
}
function submitAssistantPrompt(button,prompt){
  if(state.sending){
    const english=(window.workshopI18n?.locale||'de').startsWith('en');
    if(state.queuedAssistantPrompts.length>=4){setStatus(english?'The follow-up queue is full. Please wait for the current reply.':'Die Warteschlange ist voll. Warte bitte die aktuelle Antwort ab.');return}
    state.queuedAssistantPrompts.push(String(prompt||''));
    setStatus(english?'Follow-up queued. It will be sent as soon as the current reply finishes.':'Vorschlag vorgemerkt. Er wird gesendet, sobald die aktuelle Antwort fertig ist.');return
  }
  button.disabled=true;return sendChat(prompt).finally(()=>{if(button.isConnected)button.disabled=false});
}
function searchInChatMode(kind){
  const english=(window.workshopI18n?.locale||'de').startsWith('en'),copy=english?{visual:'I’m looking for visual mods for lighting, ambience, and effects.',shader:'I’m looking for matching shader packs.',resourcepack:'I’m looking for matching resource packs and textures.'}:{visual:'Ich suche passende visuelle Mods für Licht, Atmosphäre und Effekte.',shader:'Ich suche passende Shader-Packs.',resourcepack:'Ich suche passende Resource-Packs und Texturen.'};
  const chatTurn={role:'assistant',content:copy[kind]||'Ich suche passende Vorschläge.',searchTerms:[],modSearchStatus:'loading',modResults:[]};state.project.turns.push(chatTurn);queueSave();renderChat();searchMods('',true,{chatTurn,kind});
}
function appendChatFormattedText(target,text){
  const parts=String(text||'').split(/(\[[^\]]+\]\(https?:\/\/[^\s)]+\)|https?:\/\/[^\s<>()]+|\*\*[^*]+\*\*|`[^`]+`)/g);
  for(const part of parts){
    if(part.startsWith('**')&&part.endsWith('**')){const strong=document.createElement('strong');strong.textContent=part.slice(2,-2);target.append(strong)}
    else if(part.startsWith('`')&&part.endsWith('`')){const code=document.createElement('code');code.textContent=part.slice(1,-1);target.append(code)}
    else if(part.startsWith('[')&&part.includes('](')){
      const match=part.match(/^\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)$/);if(!match){target.append(document.createTextNode(part));continue}
      appendChatLink(target,match[1],match[2]);
    }
    else if(/^https?:\/\//i.test(part))appendChatLink(target,part,part);
    else target.append(document.createTextNode(part));
  }
}
function appendChatLink(target,label,href){
  let url;try{url=new URL(href)}catch{return target.append(document.createTextNode(label))}
  if(url.protocol!=='https:'&&url.protocol!=='http:')return target.append(document.createTextNode(label));
  const link=document.createElement('button');link.type='button';link.className='chat-link-pill';
  const host=url.hostname.replace(/^www\./,'').toLowerCase();
  const compact=host.includes('modrinth')?'Modrinth':host.includes('curseforge')?'CurseForge':host.includes('minecraft')?'Minecraft':String(label).trim()||host;
  const download=/download/i.test(label)||/\/download/i.test(url.pathname);
  link.textContent=download?`⬇ ${compact} · ${window.workshopI18n?.locale==='en'?'Download':'Download'}`:`↗ ${compact}`;
  link.title=`${label} · ${url.hostname}`;link.onclick=()=>window.workshop.openExternal(url.href).catch(error=>setStatus(error.message));target.append(link);
}
function renderTurn(turn) {
  const row=document.createElement('div');row.className=`message ${turn.role==='user'?'user-message':'assistant-message'}${turn.error?' message-error':''}`;
  row.dataset.chatTurnIndex=String(state.project.turns.indexOf(turn));
  const av=document.createElement('div');av.className='avatar';if(turn.role==='user'){av.classList.add('user-avatar');if(selectedUserAvatar.startsWith('skin:'))setAvatarImage(av,skinAvatarUrl(selectedUserAvatar.slice(5)),'Minecraft-Skin');else if(selectedUserAvatar.startsWith('data:image/'))setAvatarImage(av,selectedUserAvatar,'Eigenes Profilbild');else av.textContent=avatarContent()}else setAssistantAvatar(av);
  const content=document.createElement('div');content.className='message-content';
  const bubble=document.createElement('div');bubble.className='bubble';
  for(const line of String(turn.content).split(/\n+/).map(value=>value.replace(/^\s*(?:[-*•]|\d+[.)])\s+/, '').trim()).filter(Boolean)){const p=document.createElement('p');appendChatFormattedText(p,line);bubble.append(p)}
  if(turn.role==='assistant'&&turn.edition==='bedrock'&&!turn.alternativesAccepted&&!turn.alternativesDeclined){const gate=document.createElement('div');gate.className='bedrock-gate';const note=document.createElement('span');note.textContent='Erst nach deinem Okay suche ich passende Java-Mods.';const button=document.createElement('button');button.className='button button-primary';button.type='button';button.textContent='Ja, Java-Alternativen suchen';button.onclick=()=>sendChat('Ja, bitte suche Java-Alternativen zu den gezeigten Bedrock-Add-ons.',{confirmJavaAlternatives:true});gate.append(note,button);bubble.append(gate)}
  content.append(bubble);
  if(turn.role==='assistant'&&!state.sending&&Array.isArray(turn.choices)&&turn.choices.length){
    const picker=document.createElement('section');picker.className='assistant-choice-picker';
    const label=document.createElement('span');label.className='assistant-followups-label';label.textContent=(window.workshopI18n?.locale||'de').startsWith('en')?'Choose any options that fit':'Wähle alle Optionen, die passen';picker.append(label);
    const options=document.createElement('div');options.className='assistant-choice-options';const picked=new Set(Array.isArray(turn.selectedChoices)?turn.selectedChoices:[]);
    for(const choice of turn.choices){const button=document.createElement('button');button.type='button';button.className=`assistant-choice${picked.has(choice)?' selected':''}`;button.textContent=choice;button.setAttribute('aria-pressed',String(picked.has(choice)));button.onclick=()=>{if(picked.has(choice))picked.delete(choice);else picked.add(choice);turn.selectedChoices=[...picked];button.classList.toggle('selected',picked.has(choice));button.setAttribute('aria-pressed',String(picked.has(choice)));submit.disabled=!picked.size};options.append(button)}
    const submit=document.createElement('button');submit.type='button';submit.className='button button-primary assistant-choice-submit';submit.disabled=!picked.size;submit.textContent=(window.workshopI18n?.locale||'de').startsWith('en')?'Continue with selected options':'Mit ausgewählten Mods weitermachen';
    submit.onclick=()=>{const selected=[...picked];if(!selected.length)return;const english=(window.workshopI18n?.locale||'de').startsWith('en');submitAssistantPrompt(submit,english?`I choose these options: ${selected.join(', ')}. Please search matching Java mods for all of them together and explain any conflicts.`:`Ich wähle diese Optionen: ${selected.join(', ')}. Suche bitte passende Java-Mods für alle gemeinsam und weise auf mögliche Konflikte hin.`)};
    picker.append(options,submit);content.append(picker);
  }
  if(turn.role==='assistant'&&turn.modSearchStatus)content.append(renderChatModPicker(turn));
  if(turn.role==='assistant'){const followups=renderAssistantFollowups(turn);if(followups)content.append(followups)}
  row.append(av,content);return row;
}
function captureChatScrollPosition(area){
  const scrollTop=area.scrollTop;
  const nearBottom=area.scrollHeight-area.clientHeight-scrollTop<=2;
  if(nearBottom)return{scrollTop,nearBottom:true};
  const viewportTop=area.getBoundingClientRect().top,rows=area.querySelectorAll(':scope > .message');
  let low=0,high=rows.length;
  while(low<high){const middle=(low+high)>>>1;if(rows[middle].getBoundingClientRect().bottom>viewportTop+4)high=middle;else low=middle+1}
  const anchor=rows[low]||null;
  return{scrollTop,nearBottom,anchorIndex:anchor?.dataset.chatTurnIndex,anchorOffset:anchor?anchor.getBoundingClientRect().top-viewportTop:0};
}
function bindChatFollowLatest(area){
  if(area.dataset.followLatestBound==='true')return;
  area.dataset.followLatestBound='true';
  const insideNestedScroller=target=>{
    for(let node=target instanceof Element?target:target?.parentElement;node&&node!==area;node=node.parentElement){
      if(/^(auto|scroll|overlay)$/.test(getComputedStyle(node).overflowY)&&node.scrollHeight>node.clientHeight+1)return true;
    }
    return false;
  };
  area.addEventListener('wheel',event=>{
    if(!event.ctrlKey&&event.deltaY<0&&!insideNestedScroller(event.target))chatFollowLatest=false;
  },{passive:true});
  area.addEventListener('scroll',()=>{
    const distance=area.scrollHeight-area.clientHeight-area.scrollTop;
    chatFollowLatest=distance<=2;
  },{passive:true});
  area.addEventListener('keydown',event=>{
    if(event.target.closest?.('input,textarea,select,[contenteditable="true"]')||insideNestedScroller(event.target))return;
    if(['Home','PageUp','ArrowUp'].includes(event.key))chatFollowLatest=false;
    else if(event.key==='End'){chatFollowLatest=true;area._scheduleLatestChatScroll?.()}
  });
  area.addEventListener('touchstart',event=>{if(!insideNestedScroller(event.target))chatFollowLatest=false},{passive:true});
}
function restoreChatScrollPosition(area,snapshot){
  if(snapshot.nearBottom){area.scrollTop=area.scrollHeight;chatFollowLatest=true;return}
  if(snapshot.anchorIndex!==undefined){const anchor=area.querySelector(`.message[data-chat-turn-index="${snapshot.anchorIndex}"]`);if(anchor){area.scrollTop+=anchor.getBoundingClientRect().top-area.getBoundingClientRect().top-snapshot.anchorOffset;chatFollowLatest=false;return}}
  area.scrollTop=snapshot.scrollTop;chatFollowLatest=false;
}
function renderCreatorStudio(){
  const studio=$('creator-studio'),panel=$('chat-panel');if(!studio||!panel)return;
  const active=Boolean(state.creatorMode);studio.hidden=!active;if(!active)return;
  const english=(window.workshopI18n?.locale||'de').startsWith('en');
  studio.querySelectorAll('[data-creator-de][data-creator-en]').forEach(node=>node.textContent=english?node.dataset.creatorEn:node.dataset.creatorDe);
  const turns=state.project.turns||[],latest=[...turns].reverse().find(turn=>turn.role==='assistant'&&turn.content)?.content||[...turns].reverse().find(turn=>turn.role==='user'&&turn.content)?.content||'';
  const latestUser=[...turns].reverse().find(turn=>turn.role==='user'&&turn.content)?.content||'';
  const source=String(latest||latestUser).replace(/https?:\/\/\S+/g,'').replace(/\s+/g,' ').trim();
  const userText=String(latestUser).replace(/\s+/g,' ').trim();
  const quoted=source.match(/[„“"]([^”"]{2,48})[”"]/);
  const named=source.match(/(?:modname|name|modtitel|name der mod)\s*[:\-]\s*([^.!?]{2,56})/i);
  let fallback=english?'Untitled concept':'Unbenannter Entwurf';
  if(/sword|schwert|klinge/i.test(userText))fallback=english?'Crystal Edge':'Kristallklinge';
  else if(/axe|axt/i.test(userText))fallback=english?'Ancient Grove Axe':'Uraltaxt';
  else if(/bow|bogen/i.test(userText))fallback=english?'Wildwood Bow':'Wildholzbogen';
  else if(/staff|stab/i.test(userText))fallback=english?'Verdant Focus':'Smaragdfokus';
  const previewName=(quoted?.[1]||named?.[1]||fallback).trim();
  $('creator-preview-title').textContent=previewName;
  $('creator-preview-name').textContent=previewName;
  $('creator-preview-subtitle').textContent=source?(english?'Live concept from the latest conversation':'Live-Konzept aus dem aktuellen Gespräch'):(english?'Your visual concept appears as you describe it.':'Dein visuelles Konzept wächst mit deiner Beschreibung.');
  const topics=[['biome','Biome'],['dimension',english?'Dimension':'Dimension'],['magic',english?'Magic':'Magie'],['combat',english?'Combat':'Kampf'],['explor',english?'Exploration':'Erkundung'],['tech',english?'Technology':'Technik'],['shadow',english?'Shadow':'Schatten'],['crystal',english?'Crystal':'Kristall']];
  const matched=topics.find(([key])=>new RegExp(key,'i').test(source));
  $('creator-spec-theme').textContent=matched?matched[1]:(english?'Open concept':'Noch offen');
  const abilityMatch=source.match(/(?:ability|fähigkeit|effect|effekt|passive|active|aktiv)\s*[:\-]?\s*([^.!?\n]{3,65})/i);
  $('creator-spec-ability').textContent=abilityMatch?.[1]?.trim()||(english?'Define it in chat':'Wird gemeinsam entworfen');
  $('creator-spec-style').textContent=english?'Minecraft Java · '+String(state.project.loader||'Fabric'):'Minecraft Java · '+String(state.project.loader||'Fabric');
  $('creator-spec-summary').textContent=source?source.slice(0,260)+(source.length>260?'…':''):(english?'Describe the mod idea in chat. The concept card will follow along.':'Beschreibe deine Mod-Idee im Chat. Die Konzeptkarte aktualisiert sich dazu.');
  const item=localStorage.getItem('mw-creator-preview-item')||'sword';
  const artboard=$('creator-artboard');artboard.dataset.item=item;
  document.querySelectorAll('[data-creator-item]').forEach(button=>{const active=button.dataset.creatorItem===item;button.setAttribute('aria-pressed',String(active));button.onclick=()=>{localStorage.setItem('mw-creator-preview-item',button.dataset.creatorItem);renderCreatorStudio()}});
  const labels={sword:english?'WEAPON · CONCEPT':'WAFFE · KONZEPT',axe:english?'TOOL · CONCEPT':'WERKZEUG · KONZEPT',bow:english?'RANGED · CONCEPT':'FERNKAMPF · KONZEPT',staff:english?'FOCUS · CONCEPT':'FOKUS · KONZEPT'};
  $('creator-item-type-label').textContent=labels[item]||labels.sword;
  $('creator-preview-effect').textContent=source&&/(spark|funken|light|licht|glow|glühen)/i.test(source)?(english?'Arcane sparks · luminous trail':'Arkane Funken · leuchtende Spur'):(english?'Core crystal · visual trail · impact':'Kristallkern · Lichtspur · Rückstoß');
}
function renderChatTurnCached(area,turn,index,context){
  const cache=area._chatTurnRenderCache||(area._chatTurnRenderCache=new WeakMap());
  const signature=JSON.stringify(turn),previous=cache.get(turn);
  let node;
  if(previous&&previous.signature===signature&&context.every((value,i)=>value===previous.context[i]))node=previous.node;
  else{node=renderTurn(turn);cache.set(turn,{node,signature:JSON.stringify(turn),context})}
  if(node.dataset.chatTurnIndex!==String(index))node.dataset.chatTurnIndex=String(index);
  return node;
}
function reconcileChatChildren(area,nodes){
  const retained=new Set(nodes);
  for(const child of [...area.childNodes])if(!retained.has(child))child.remove();
  for(let index=0;index<nodes.length;index++)if(area.childNodes[index]!==nodes[index])area.insertBefore(nodes[index],area.childNodes[index]||null);
}
function renderChat() {
  const area = $('chat-messages');
  const creatorBanner=$('creator-context-banner');
  const creatorMode=Boolean(state.creatorMode);
  $('chat-panel')?.classList.toggle('is-mod-creator',creatorMode);
  if(creatorBanner){creatorBanner.hidden=!creatorMode;const english=(window.workshopI18n?.locale||'de')==='en';$('creator-context-title').textContent=english?'AI Mod Creator':'KI-Mod-Creator';$('creator-context-copy').textContent=english?'Shape a new mod idea into a clear specification and starter code. Your active modpack stays unchanged.':'Entwickle eine neue Mod-Idee mit Spezifikation und Code-Grundgerüst. Dein aktives Modpack bleibt dabei unverändert.';$('creator-context-exit').textContent=english?'Back to Pack Assistant':'Zurück zum Pack-Assistenten'}
  renderCreatorStudio();
  bindChatFollowLatest(area);
  const initialChatRender=area.dataset.chatInitialized!=='true';area.dataset.chatInitialized='true';
  const scrollSnapshot=captureChatScrollPosition(area);if(initialChatRender||area._chatTurnsSource!==state.project.turns)scrollSnapshot.nearBottom=true;
  // Prevent the chat's mutation observer from mistaking the brief empty render
  // for a user scroll to the top while this view is being rebuilt.
  chatFollowLatest=false;
  const suggestions = document.createElement('div');suggestions.className='chat-suggestions';
  const starterPrompts = [
    { label: '🌿 Erkundung & Biome', prompt: 'Ich möchte ein entspanntes Survival-Pack mit mehr Biomen und Erkundung.' },
    { label: '⚙ Technik & Create', prompt: 'Ich möchte ein Technik-Pack rund um Automatisierung und Create.' },
    { label: '🏰 Dungeons & Bosse', prompt: 'Ich möchte mehr Dungeons und Bosskämpfe.' },
    { label: '🔮 Magie', prompt: 'Finde Magie-, Zauber- und Fantasy-Mods für mein aktuelles Setup.' },
    { label: '⚔ Kampf', prompt: 'Finde passende Kampf-, Boss- und Waffenmods für mein Setup.' },
    { label: '⚡ Performance', prompt: 'Finde kompatible Mods, die Leistung und FPS verbessern.' },
    { label: '✨ Visual-Mods', kind:'visual' },
    { label: '🌅 Shader-Packs', kind:'shader' },
    { label: '🖼 Resource-Packs', kind:'resourcepack' }
  ];
  suggestions.innerHTML=`<div class="suggestion-row">${starterPrompts.map(item=>`<button class="suggestion" data-prompt="${safe(item.prompt||'')}" data-search-kind="${item.kind||''}">${safe(item.label)}</button>`).join('')}</div>`;
  const initial=document.createElement('div');initial.className='message assistant-message';initial.innerHTML='<div class="avatar assistant-avatar" aria-label="Pack-Assistent"><svg viewBox="0 0 32 32" aria-hidden="true"><path fill="#76502e" stroke="#111d32" stroke-width="2" d="M5 12 16 7l11 5v14H5z"/><path fill="#bd8242" stroke="#111d32" stroke-width="2" d="m5 12 11 5 11-5-11-5z"/><path fill="#e3b65e" d="m9 12 7 3 7-3-7-3z"/><path fill="#f1cc76" stroke="#111d32" stroke-width="1.5" d="M13 17h6v5h-6z"/><path fill="#3d83cb" d="M14 18h4v3h-4z"/><path fill="#8ee0ff" d="M15 18h2v2h-2z"/><path fill="#c5eaff" d="m23 5 1-2 1 2 2 1-2 1-1 2-1-2-2-1z"/></svg></div><div class="bubble"><p>Hey! Was für ein Modpack schwebt dir vor?</p><p>Nenne Mods oder Modpacks als Beispiel, beschreibe die Richtung oder wähle ein Video aus. Bei Bedrock-Add-ons frage ich dich erst, bevor ich Java-Alternativen suche.</p></div>';
  const popular=document.createElement('section');popular.className='popular-section';const fallback=state.project.provider==='curseforge'&&!state.settings.hasCurseForgeKey;popular.innerHTML=`<div class="popular-heading"><div><strong>Beliebt für dein Setup</strong><span>${fallback?'CurseForge-Schlüssel fehlt · Vorschläge automatisch von Modrinth · ':''}Minecraft ${safe(state.project.minecraftVersion)} · ${safe(state.project.loader)}</span></div><button class="text-button" data-open-mods>Alle Mods ansehen →</button></div>`;
  const cards=document.createElement('div');cards.className='popular-grid';
  if(state.popularMods===null)cards.innerHTML='<div class="popular-loading">Lade passende Modvorschläge …</div>';
  else if(!state.popularMods.length)cards.innerHTML='<div class="popular-loading">Aktuell konnten keine beliebten Mods geladen werden. Öffne „Mod-Auswahl“ für eine Suche.</div>';
  else cards.innerHTML=state.popularMods.slice(0,8).map((mod,index)=>{const selected=state.project.mods.some(item=>item.provider===mod.provider&&item.id===mod.id);return `<article class="popular-card">${mod.icon?`<img src="${safe(mod.icon)}" alt="" loading="lazy">`:'<div class="popular-icon">✦</div>'}<div class="popular-copy"><strong>${safe(mod.title)}</strong><span>${safe(mod.source)} · ↓ ${formatDownloads(mod.downloads)}</span></div><button class="popular-add ${selected?'added':''}" data-popular-add="${index}" title="${selected?'Bereits ausgewählt':'Zur Packauswahl hinzufügen'}">${selected?'✓':'+'}</button></article>`}).join('');
  popular.append(cards);
  const pendingSelection=state.project.turns.find(turn=>turn.role==='assistant'&&turn.modSearchStatus==='done'&&turn.modResults?.length&&!turn.selectionComplete&&!turn.selectionDismissed&&!turn.selectionOpened);
  if(pendingSelection&&state.modPickerView==='inline'){pendingSelection.selectionOpened=true;pendingSelection.selectionInline=true;state.modPickerTurn=pendingSelection;state.modPickerSelection=new Set(pendingSelection.selectedSuggestedMods||[]);queueSave()}
  if(area._chatTurnsSource!==state.project.turns){area._chatTurnRenderCache=new WeakMap();area._chatTurnsSource=state.project.turns}
  const packSelection=new Set(state.project.mods.map(mod=>`${mod.provider}:${mod.id}`));
  const locale=window.workshopI18n?.locale||'de';
  let previousUserContent='';
  const turns=state.project.turns.map((turn,index)=>{
    const assistant=turn.role==='assistant';
    const selectedSuggestions=turn.modSearchStatus?JSON.stringify((turn.modResults||[]).map(mod=>`${mod.provider}:${mod.id}`).filter(key=>packSelection.has(key))):'';
    const context=[locale,assistant&&Boolean(state.sending),assistant?selectedAssistantAvatar:selectedUserAvatar,assistant?'':state.settings.username||'',assistant?previousUserContent:'',selectedSuggestions];
    const node=renderChatTurnCached(area,turn,index,context);
    if(turn.role==='user')previousUserContent=String(turn.content||'');
    return node;
  });
  reconcileChatChildren(area,[initial,...turns,...(state.project.turns.length?[]:[suggestions,popular])]);
  if(pendingSelection&&state.modPickerView==='window'){pendingSelection.selectionOpened=true;queueSave();requestAnimationFrame(()=>openModSelection(pendingSelection,{forceWindow:true}))}
  if(!state.project.turns.length)area.querySelectorAll('.suggestion[data-prompt]').forEach(button=>button.onclick=()=>button.dataset.searchKind?searchInChatMode(button.dataset.searchKind):submitAssistantPrompt(button,button.dataset.prompt));
  requestAnimationFrame(()=>{
    restoreChatScrollPosition(area,scrollSnapshot);
    if(initialChatRender)scheduleInitialChatScroll(area)
  });
  area.querySelector('[data-open-mods]')?.addEventListener('click',()=>showView('mods'));
  area.querySelectorAll('[data-popular-add]').forEach(button=>button.onclick=()=>addSelectedMod(state.popularMods[Number(button.dataset.popularAdd)]));
  syncChatHeaderActions();
}
function scheduleInitialChatScroll(area){
  if(area.dataset.initialLatestScheduled==='true')return;
  area.dataset.initialLatestScheduled='true';let framePending=false;
  const moveToLatest=()=>{if(area.isConnected&&chatFollowLatest)area.scrollTop=area.scrollHeight};
  const schedule=()=>{if(framePending||!chatFollowLatest)return;framePending=true;requestAnimationFrame(()=>{framePending=false;moveToLatest()})};
  area._scheduleLatestChatScroll=schedule;
  const resizeObserver=typeof ResizeObserver==='function'?new ResizeObserver(schedule):null;
  const observedMessages=new Set();
  const observeMessages=()=>{
    const current=new Set([...area.children].filter(node=>node.matches('.message')));
    for(const message of observedMessages)if(!current.has(message)){resizeObserver?.unobserve(message);observedMessages.delete(message)}
    for(const message of current)if(!observedMessages.has(message)){resizeObserver?.observe(message);observedMessages.add(message)}
  };
  observeMessages();
  const mutationObserver=new MutationObserver(records=>{if(records.some(record=>record.type==='childList'&&record.target===area))observeMessages();schedule()});mutationObserver.observe(area,{childList:true,subtree:true,characterData:true});
  area._latestChatResizeObserver=resizeObserver;area._latestChatMutationObserver=mutationObserver;
  area.addEventListener('load',schedule,true);window.addEventListener('resize',schedule,{passive:true});
  document.fonts?.ready?.then(schedule).catch(()=>{});
  requestAnimationFrame(()=>{schedule();requestAnimationFrame(schedule)});
}
function syncChatHeaderActions(){
  const english=(window.workshopI18n?.locale||'de').startsWith('en');
  const fresh=$('new-chat-button'),history=$('open-chat-history');
  if(fresh){fresh.textContent=english?'＋ New chat':'＋ Neuer Chat';fresh.title=english?'Save this conversation and start a new chat':'Diesen Chat sichern und eine neue Unterhaltung starten'}
  if(history){history.textContent=english?'History':'Verlauf';history.title=english?'Open saved chats':'Gespeicherte Chats öffnen';history.setAttribute('aria-label',history.title)}
}
function archiveCurrentChat(){
  const turns=state.project.turns||[];if(!turns.length)return null;
  const first=turns.find(turn=>turn.role==='user')?.content||'';
  const entry={id:`chat-${Date.now()}-${Math.random().toString(36).slice(2,7)}`,title:String(first).replace(/\s+/g,' ').trim().slice(0,64)||'Unterhaltung',createdAt:new Date().toISOString(),turns:JSON.parse(JSON.stringify(turns))};
  state.project.chatArchive=Array.isArray(state.project.chatArchive)?state.project.chatArchive:[];state.project.chatArchive.unshift(entry);state.project.chatArchive=state.project.chatArchive.slice(0,30);return entry;
}
function renderChatHistory(){
  const list=$('chat-history-list'),english=(window.workshopI18n?.locale||'de').startsWith('en'),archive=Array.isArray(state.project.chatArchive)?state.project.chatArchive:[];
  list.replaceChildren();
  if(!archive.length){const empty=document.createElement('p');empty.className='chat-history-empty';empty.textContent=english?'No saved chats for this pack yet.':'Für dieses Pack gibt es noch keine gespeicherten Chats.';list.append(empty);return}
  archive.forEach(entry=>{const button=document.createElement('button');button.type='button';button.className='chat-history-entry';const title=document.createElement('strong');title.textContent=entry.title|| (english?'Conversation':'Unterhaltung');const meta=document.createElement('span');meta.textContent=new Date(entry.createdAt||Date.now()).toLocaleString(english?'en-US':'de-DE');button.append(title,meta);button.onclick=()=>restoreArchivedChat(entry.id);list.append(button)});
}
function restoreArchivedChat(id){
  const archive=Array.isArray(state.project.chatArchive)?state.project.chatArchive:[],entry=archive.find(chat=>chat.id===id);if(!entry)return;
  const current=state.project.turns||[],remaining=archive.filter(chat=>chat.id!==id);
  if(current.length){const first=current.find(turn=>turn.role==='user')?.content||'';remaining.unshift({id:`chat-${Date.now()}-${Math.random().toString(36).slice(2,7)}`,title:String(first).replace(/\s+/g,' ').trim().slice(0,64)||'Unterhaltung',createdAt:new Date().toISOString(),turns:JSON.parse(JSON.stringify(current))})}
  state.project.chatArchive=remaining.slice(0,30);state.project.turns=entry.turns||[];$('chat-history-overlay').hidden=true;queueSave();renderChat();showView('chat');
}
function startNewChat(){
  if(state.sending)return;
  archiveCurrentChat();state.project.turns=[];state.creatorMode=false;$('chat-history-overlay').hidden=true;queueSave();renderChat();showView('chat');
  setStatus((window.workshopI18n?.locale||'de').startsWith('en')?'New chat started. Your previous conversation is saved in History.':'Neuer Chat gestartet. Die vorherige Unterhaltung liegt im Verlauf.');
}
async function captureVideoFrames(file) {
  if(!file) return [];
  if(file.size>200*1024*1024)throw new Error('Das Video ist größer als 200 MB. Bitte wähle eine kleinere Datei.');
  const url=URL.createObjectURL(file), video=document.createElement('video');video.preload='auto';video.muted=true;video.playsInline=true;video.src=url;
  try {
    await new Promise((resolve,reject)=>{video.onloadedmetadata=resolve;video.onerror=()=>reject(new Error('Dieses Videoformat kann hier nicht gelesen werden. Probiere MP4 oder WebM.'));setTimeout(()=>reject(new Error('Das Video konnte nicht rechtzeitig geöffnet werden.')),15000)});
    if(!Number.isFinite(video.duration)||video.duration<=0||video.duration>1800)throw new Error('Videos müssen kürzer als 30 Minuten sein.');
    const canvas=document.createElement('canvas'),ctx=canvas.getContext('2d',{willReadFrequently:false});if(!ctx)throw new Error('Videobilder konnten nicht verarbeitet werden.');
    const frameCount=Math.min(6,Math.max(1,Math.ceil(video.duration/20))),frames=[];
    for(let i=0;i<frameCount;i++){
      const time=frameCount===1?Math.min(video.duration/2,0.5):Math.min(video.duration-0.08,(video.duration*(i+0.5)/frameCount));
      await new Promise((resolve,reject)=>{video.onseeked=resolve;video.onerror=()=>reject(new Error('Ein Videobild konnte nicht gelesen werden.'));video.currentTime=Math.max(0,time);setTimeout(()=>reject(new Error('Das Video hat beim Lesen eines Bildes nicht reagiert.')),10000)});
      const scale=Math.min(1,960/video.videoWidth,960/video.videoHeight);canvas.width=Math.max(1,Math.round(video.videoWidth*scale));canvas.height=Math.max(1,Math.round(video.videoHeight*scale));ctx.drawImage(video,0,0,canvas.width,canvas.height);frames.push(canvas.toDataURL('image/jpeg',0.58));
    }
    return frames;
  } finally { URL.revokeObjectURL(url);video.removeAttribute('src');video.load(); }
}
function finishChatSend(){
  state.sending=false;$('chat-input').disabled=false;$('attach-video').disabled=false;$('voice-input').disabled=false;queueSave();renderChat();
  const queued=state.queuedAssistantPrompts.shift();if(queued)setTimeout(()=>sendChat(queued),0);
}
function extractRecommendedModSearchTerms(text){
  const names=[];
  const patterns=[
    /^\s*(?:[-*•]\s*)?\*\*([^*\n]{2,80})\*\*\s*(?:[-–—:])\s*\S.+$/gm,
    /^\s*(?:[-*•]\s*|\d+[.)]\s*)([\p{L}\p{N}][\p{L}\p{N} _'’+()./-]{1,78}?)\s*(?:[-–—:])\s*\S.+$/gmu
  ];
  for(const pattern of patterns)for(const match of String(text||'').matchAll(pattern)){
    const name=match[1].replace(/\s+/g,' ').trim();
    if(name&&!names.some(item=>item.toLocaleLowerCase()===name.toLocaleLowerCase()))names.push(name);
    if(names.length>=12)return names;
  }
  return names;
}
async function sendChat(raw, options={}) {
  if(state.sending){setStatus((window.workshopI18n?.locale||'de').startsWith('en')?'This follow-up is queued until the current AI reply finishes.':'Der Vorschlag wird nach der aktuellen KI-Antwort gesendet.');return false}
  const typed=String(raw||'').trim();const file=state.pendingVideo;const content=typed||(file?'Analysiere das ausgewählte Video und finde die gezeigten Mods.':'');if(!content)return false;
  const selectedProvider=state.settings.aiProvider||'auto';const hasAI=selectedProvider==='auto'?(state.chatgpt.status==='connected'&&state.chatgpt.sharing||state.settings.hasOmniRouteKey||!!state.settings.localAi?.model):selectedProvider==='chatgpt'?state.chatgpt.status==='connected'&&state.chatgpt.sharing:selectedProvider==='omniroute'?state.settings.hasOmniRouteKey:selectedProvider==='local'?!!state.settings.localAi?.model:selectedProvider==='openai'?state.settings.hasOpenAIKey:selectedProvider==='claude'?state.settings.hasClaudeKey:false;
  if(!hasAI&&file){setStatus('Verbinde zuerst dein ChatGPT-Konto in den Einstellungen, um Videos analysieren zu lassen.');openSettings();return false;}
  if(speechRecognition){speechRecognition=false;try{await window.workshop.stopVoiceInput()}catch{}}
  updateVoiceInput(false,'');
  state.sending=true;chatFollowLatest=true;$('chat-input').disabled=true;$('attach-video').disabled=true;$('voice-input').disabled=true;
  let frames=[];
  if(file){$('video-name').textContent='Lese Videobilder …';try{frames=await captureVideoFrames(file)}catch(error){$('video-name').textContent=file.name;setStatus(error.message);finishChatSend();return false}}
  const priorBedrock=state.project.turns.at(-1)?.role==='assistant'&&state.project.turns.at(-1)?.edition==='bedrock';
  const answerGate=!!options.confirmJavaAlternatives||!!(priorBedrock&&/^(ja\b|gerne\b|bitte\b|such\b|suche\b|mach\b)/i.test(typed));
  const answerDecline=!!(priorBedrock&&!answerGate&&/^(nein\b|ne\b|lieber nicht\b|nicht suchen\b|abbrechen\b)/i.test(typed));
  if(priorBedrock&&(answerGate||answerDecline))state.project.turns[state.project.turns.length-1][answerGate?'alternativesAccepted':'alternativesDeclined']=true;
  const userTurn={role:'user',content:file?`${content}\n[Video: ${file.name} — ${frames.length} Einzelbilder ausgewertet]`:content,...(answerGate?{confirmJavaAlternatives:true}:{}),...(answerDecline?{declinedJavaAlternatives:true}:{})};
  state.project.turns.push(userTurn);$('chat-input').value='';$('chat-input').dispatchEvent(new Event('input',{bubbles:true}));state.pendingVideo=null;$('video-input').value='';$('video-name').textContent='Bis zu 6 ausgewählte Bilder werden analysiert.';$('clear-video').hidden=true;queueSave();renderChat();
  const english=(window.workshopI18n?.locale||'de').startsWith('en'),fallbackTerms=!file?fallbackSearchTermsForPrompt(typed):[];
  if(!hasAI){
    const reply=fallbackTerms.length?(english?'AI is not connected right now, so I’m searching matching Modrinth projects directly.':'Die KI ist gerade nicht verbunden. Ich suche passende Modrinth-Projekte direkt für dich.'):(english?'Connect ChatGPT, an API key, or a local model in Settings to use AI chat.':'Richte in den Einstellungen ChatGPT, einen API-Schlüssel oder ein lokales Modell ein, um den KI-Chat zu nutzen.');
    const assistantTurn={role:'assistant',content:reply,...(fallbackTerms.length?{searchTerms:fallbackTerms,modSearchStatus:'loading',modResults:[]}:{})};state.project.turns.push(assistantTurn);queueSave();renderChat();
    if(fallbackTerms.length)setTimeout(()=>searchMods(fallbackTerms,true,{chatTurn:assistantTurn}),0);
    finishChatSend();return true;
  }
  const localModel=selectedProvider==='local'||(selectedProvider==='auto'&&!(state.chatgpt.status==='connected'&&state.chatgpt.sharing)&&!state.settings.hasOmniRouteKey&&!!state.settings.localAi?.model),requestId=`chat-${Date.now()}-${Math.random().toString(36).slice(2,8)}`;activeChatRequestId=requestId;
  const loading=document.createElement('div');loading.className='message assistant-message';loading.id='typing-indicator';loading.innerHTML=`<div class="avatar assistant-avatar"></div><div class="bubble typing"><strong class="typing-label"></strong><span class="typing-copy"></span><span class="typing-elapsed"></span><span class="typing-dots" aria-hidden="true">•••</span><span class="typing-stream" aria-live="polite"></span></div>`;setAssistantAvatar(loading.querySelector('.avatar'));$('chat-messages').append(loading);$('chat-messages').scrollTop=$('chat-messages').scrollHeight;
  const title=$('typing-indicator')?.querySelector('.typing-label');if(title)title.textContent=english?'Working on your request':'Ich bearbeite deine Anfrage';
  const waitStarted=Date.now(),waitMessages=file?(english?['Reviewing the selected video frames','Identifying Minecraft edition and visible mods','Preparing focused search terms']:['Ich prüfe die ausgewählten Videobilder','Ich erkenne Edition und sichtbare Mods','Ich bereite konkrete Suchbegriffe vor']):localModel?(english?['Your local model is starting its reply','Matching your idea with the selected pack','Preparing a concise answer']:['Dein lokales Modell formuliert eine Antwort','Ich gleiche deine Idee mit dem Pack ab','Ich bereite eine knappe Antwort vor']):(english?['Thinking through your pack idea','Matching the answer to your selected mods','Preparing a concise reply']:['Ich ordne deine Pack-Idee','Ich gleiche sie mit deinen Mods ab','Ich bereite eine knappe Antwort vor']);
  const updateWait=()=>{const copy=$('typing-indicator')?.querySelector('.typing-copy'),elapsed=$('typing-indicator')?.querySelector('.typing-elapsed');if(copy)copy.textContent=waitMessages[Math.floor((Date.now()-waitStarted)/3500)%waitMessages.length]+(localModel&&state.settings.localAi?.model?` · ${state.settings.localAi.model}`:'');if(elapsed){const seconds=Math.floor((Date.now()-waitStarted)/1000);elapsed.textContent=seconds>=5?(english?` · ${seconds}s`:` · ${seconds} s`):''}};updateWait();const waitTimer=setInterval(updateWait,700);
  try{
    const answer=await window.workshop.askAI(state.project.turns.map(({role,content,confirmJavaAlternatives,declinedJavaAlternatives,edition,alternativesAccepted,alternativesDeclined})=>({role,content,confirmJavaAlternatives,declinedJavaAlternatives,edition,alternativesAccepted,alternativesDeclined})),context(),frames,requestId);
    const recommendedNames=extractRecommendedModSearchTerms(answer.text);
    const searchTerms=answer.searchTerms?.length?answer.searchTerms:recommendedNames.length?recommendedNames:fallbackTerms;
    const assistantTurn={role:'assistant',content:answer.text,edition:answer.edition,searchTerms,exactModNames:answer.exactModNames||[],choices:answer.choices};
    const shouldSearch=!!searchTerms.length&&answer.edition!=='bedrock'&&answer.edition!=='unknown';
    if(shouldSearch)assistantTurn.modSearchStatus='loading';
    state.project.turns.push(assistantTurn);queueSave();renderChat();
    if(shouldSearch)setTimeout(()=>searchMods(searchTerms,true,{chatTurn:assistantTurn,exactModNames:assistantTurn.exactModNames}),0);
  }catch(error){
    if(fallbackTerms.length&&!file){const assistantTurn={role:'assistant',content:english?`AI did not respond (${error.message}). I’m searching matching Modrinth projects as a fallback.`:`Die KI hat gerade nicht geantwortet (${error.message}). Ich suche passende Modrinth-Projekte als Fallback.`,error:true,searchTerms:fallbackTerms,modSearchStatus:'loading',modResults:[]};state.project.turns.push(assistantTurn);queueSave();renderChat();setTimeout(()=>searchMods(fallbackTerms,true,{chatTurn:assistantTurn}),0)}
    else{state.project.turns.push({role:'assistant',content:error.message,error:true});queueSave();renderChat()}
    window.workshop.reportError?.({message:error.message,stack:error.stack}).catch(()=>{});
  }finally{
    clearInterval(waitTimer);if(activeChatRequestId===requestId)activeChatRequestId='';finishChatSend();
  }
  return true;
}
function showView(view) {
  const previousView=state.currentView;state.currentView=view;$('workspace-grid').dataset.view=view;$('workspace-grid').classList.toggle('single-view',view!=='project');
  $('project-overview').hidden=view!=='project';$('chat-panel').hidden=view!=='chat';$('mods-panel').hidden=view!=='mods';$('lab-panel').hidden=view!=='lab';if(view==='lab')renderLab();
  if(previousView!==view){const target=view==='project'?$('project-overview'):view==='chat'?$('chat-panel'):view==='mods'?$('mods-panel'):$('lab-panel');target.classList.remove('view-entering');void target.offsetWidth;target.classList.add('view-entering');clearTimeout(target._viewTransitionTimer);target._viewTransitionTimer=setTimeout(()=>target.classList.remove('view-entering'),320)}
  document.querySelectorAll('.nav-item[data-view]').forEach(button=>button.classList.toggle('active',button.dataset.view===view));
  window.WorkshopModernUI?.render();
  if(view==='chat'){chatFollowLatest=true;const area=$('chat-messages');requestAnimationFrame(()=>{area._scheduleLatestChatScroll?.();area.scrollTop=area.scrollHeight;if(!$('username-setup-overlay').hidden)$('username-input').focus();else if(!$('startup-login-overlay').hidden)$('startup-connect').focus();else $('chat-input').focus()})}
}
function openSettings() { $('settings-overlay').hidden=false;document.querySelectorAll('.nav-item').forEach(button=>button.classList.toggle('active',button.id==='nav-settings'));refreshChatGPTStatus().catch(()=>{});refreshLocalModels().catch(()=>{}); }
function closeSettings() { $('settings-overlay').hidden=true;document.querySelectorAll('.nav-item').forEach(button=>button.classList.toggle('active',button.dataset.view===state.currentView)); }
function updateSettingsState() {
  $('openai-state').textContent=state.settings.hasOpenAIKey?'Eingerichtet · geschützt':'Nicht eingerichtet';$('claude-state').textContent=state.settings.hasClaudeKey?'Eingerichtet · geschützt':'Nicht eingerichtet';$('omniroute-state').textContent=state.settings.hasOmniRouteKey?'Schlüssel gespeichert · Verbindung ungetestet':'Nicht eingerichtet';$('curseforge-state').textContent=state.settings.hasCurseForgeKey?'Eingerichtet · geschützt':'Nicht eingerichtet';
  $('openai-state').classList.toggle('configured',!!state.settings.hasOpenAIKey);$('claude-state').classList.toggle('configured',!!state.settings.hasClaudeKey);$('omniroute-state').classList.toggle('configured',!!state.settings.hasOmniRouteKey);$('curseforge-state').classList.toggle('configured',!!state.settings.hasCurseForgeKey);
  const connected=state.chatgpt.status==='connected'&&state.chatgpt.sharing;const connecting=state.chatgpt.status==='connecting';
  $('chatgpt-state').textContent=connecting?'Anmeldung läuft …':connected?`Verbunden${state.chatgpt.identity?.email?` · ${state.chatgpt.identity.email}`:''}`:state.chatgpt.status==='connected'?'Konto verbunden · Plan nicht freigegeben':state.chatgpt.status==='reauth_required'?'Erneute Anmeldung nötig':'Nicht verbunden';
  $('chatgpt-state').classList.toggle('configured',connected);
  $('connect-chatgpt').hidden=connecting;$('connect-chatgpt').textContent=state.chatgpt.status==='connected'&&!connected?'Plan-Nutzung freigeben':'Mit ChatGPT anmelden';$('cancel-chatgpt').hidden=!connecting;$('disconnect-chatgpt').hidden=state.chatgpt.status!=='connected'&&state.chatgpt.status!=='reauth_required';$('open-usage').hidden=!connected;
  $('chatgpt-account-note').textContent=connected?'Dein ChatGPT-Kontingent ist für den Werkstatt-Chat freigegeben. Einzelbilder aus Videos werden erst nach dem Senden ausgewertet.':connecting?'Der Browser öffnet die offizielle ChatGPT-Anmeldung. Prüfe dort dein Konto und die Freigabe der Plan-Nutzung.':state.chatgpt.status==='connected'?'Du bist angemeldet, aber die Plan-Nutzung wurde nicht freigegeben. Wähle „Plan-Nutzung freigeben“, um die Zustimmung erneut zu prüfen.':'Melde dich im Browser an und erlaube der Werkstatt ausdrücklich, dein ChatGPT-Kontingent zu nutzen. Die Verbindung wird lokal geschützt gespeichert.';
  $('ai-badge').textContent=connected?'PLUS':'KI';$('ai-badge').title=connected?'ChatGPT-Plan verbunden':'ChatGPT-Plan nicht verbunden';
  const localReady=!!state.settings.localAi?.model,anyAi=connected||localReady||state.settings.hasOpenAIKey||state.settings.hasClaudeKey||state.settings.hasOmniRouteKey;
  $('local-ai-model').value=state.settings.localAi?.model||'';$('ai-provider').value=state.settings.aiProvider||'auto';$('omniroute-url').value=state.settings.omniroute?.baseUrl?`${state.settings.omniroute.baseUrl}/v1`:'http://127.0.0.1:20128/v1';$('omniroute-model').value=state.settings.omniroute?.model||'auto';
  syncChatModelPicker();
  $('local-ai-state').textContent=localReady?`Bereit · ${state.settings.localAi.model}`:'Noch nicht eingerichtet';
  $('startup-login-overlay').hidden=anyAi||!state.settings.username||isDemoMode();
  syncStartupGate();
  $('startup-login-state').textContent=connecting?'Die Anmeldung läuft im Browser. Kehre nach der Freigabe hierher zurück.':connected?'ChatGPT ist verbunden.':state.chatgpt.status==='connected'?'Konto erkannt, aber die Plan-Nutzung ist noch nicht freigegeben. Bitte erneut verbinden.':state.chatgpt.error?`Anmeldung fehlgeschlagen: ${state.chatgpt.error}`:'Melde dich an, um die App zu verwenden.';
  $('startup-connect').disabled=connecting;
  $('startup-connect').textContent=connecting?'Anmeldung läuft …':'Mit ChatGPT anmelden';
  if(maybeShowLocalModelNotice())return;
  if(connected&&state.settings.username&&!state.settings.hasCurseForgeKey&&localStorage.getItem('mw-curseforge-notice-seen')!=='yes')openCurseforgeNotice();
}
function openCurseforgeNotice(){ $('curseforge-notice-overlay').hidden=false; }
async function refreshChatGPTStatus(){state.chatgpt=await window.workshop.getChatGPTStatus();updateSettingsState();scheduleCompatibilityCheck(250);}
async function refreshLocalModels(preferred=''){
  const select=$('local-ai-model'),status=$('local-ai-status');status.textContent='Suche Ollama-Modelle auf diesem PC …';
  try{
    const models=await window.workshop.getLocalModels(state.settings.localAi?.baseUrl);
    state.localModels=models;
    select.replaceChildren(...(models.length?models.map(model=>new Option(model.name,model.name)):[new Option('Kein Modell gefunden','')]));
    const chosen=preferred||state.settings.localAi?.model||'';if(models.some(model=>model.name===chosen))select.value=chosen;
    state.settings.localAi={...(state.settings.localAi||{}),model:select.value};
    $('local-ai-state').textContent=models.length?`${models.length} Modell${models.length===1?'':'e'} bereit`:'Noch nicht eingerichtet';
    status.textContent=models.length?'Ollama ist erreichbar. Das ausgewählte Modell bleibt lokal auf diesem PC.':'Ollama ist erreichbar, aber es sind noch keine Modelle eingerichtet.';
    syncChatModelPicker();
    return models;
  }catch(error){state.localModels=[];select.replaceChildren(new Option(state.settings.localAi?.model||'Kein Modell gefunden',state.settings.localAi?.model||''));status.textContent=error.message;$('local-ai-state').textContent='Nicht erreichbar';syncChatModelPicker();return []}
}
function syncChatModelPicker(){
  const wrap=$('chat-model-wrap'),select=$('chat-model-select'),current=state.settings.localAi?.model||'';
  const models=[...new Set([...state.localModels.map(model=>model.name),...(current?[current]:[])])].filter(Boolean);
  const provider=$('ai-provider')?.value||state.settings.aiProvider||'auto';
  const chatgptActive=state.chatgpt.status==='connected'&&state.chatgpt.sharing;
  const english=(window.workshopI18n?.locale||'de').startsWith('en');
  const options=[new Option(english?'Automatic · connected account first':'Automatisch · verbundenes Konto zuerst','provider:auto')];
  options.push(new Option(chatgptActive?'ChatGPT · Plus':english?'ChatGPT · Connect account':'ChatGPT · Konto verbinden','provider:chatgpt'));
  if(state.settings.hasClaudeKey)options.push(new Option(english?'Claude Sonnet · API':'Claude Sonnet · API','provider:claude'));
  if(state.settings.hasOpenAIKey)options.push(new Option(english?'OpenAI · API':'OpenAI · API','provider:openai'));
  if(state.settings.hasOmniRouteKey)options.push(new Option(english?'☁ OmniRoute · automatic best model':'☁ OmniRoute · automatisch bestes Modell','provider:omniroute'));
  for(const name of models)options.push(new Option(`${name} · ${english?'Local':'Lokal'}`,`local:${name}`));
  select.replaceChildren(...(options.length?options:[new Option(english?'No model available':'Kein Modell verfügbar','')]));
  const selected=provider==='auto'?'provider:auto':provider==='chatgpt'?'provider:chatgpt':provider==='claude'&&state.settings.hasClaudeKey?'provider:claude':provider==='openai'&&state.settings.hasOpenAIKey?'provider:openai':provider==='omniroute'&&state.settings.hasOmniRouteKey?'provider:omniroute':provider==='local'&&current?`local:${current}`:'';
  if(selected&&options.some(option=>option.value===selected))select.value=selected;
  wrap.hidden=false;
  select.disabled=false;
  select.setAttribute('aria-label',english?'Choose automatic, ChatGPT, cloud, API, or local model':'Automatisch, ChatGPT, Cloud, API oder lokales Modell auswählen');
  select.title=english?'Automatic uses your connected ChatGPT account first, then configured cloud or local models.':'Automatisch nutzt zuerst dein verbundenes ChatGPT-Konto, dann eingerichtete Cloud- oder lokale Modelle.';
}
async function saveAiProvider(){
  try{const saved=await window.workshop.saveLocalAi({baseUrl:state.settings.localAi?.baseUrl||'http://127.0.0.1:11434',model:$('local-ai-model').value,aiProvider:$('ai-provider').value});state.settings={...state.settings,...saved};updateSettingsState();scheduleCompatibilityCheck(150);$('local-ai-status').textContent='KI-Auswahl gespeichert.'}
  catch(error){$('local-ai-status').textContent=error.message}
}
async function storeSecret(name) {
  const field=$(`${name}-key`);
  try { state.settings={...state.settings,...await window.workshop.setSecret(name,field.value.trim())}; field.value=''; updateSettingsState(); setStatus(name==='curseforge'?'CurseForge-Schlüssel sicher gespeichert':name==='claude'?'Claude-Schlüssel sicher gespeichert':name==='omnirouteKey'?'OmniRoute-Schlüssel sicher gespeichert':'OpenAI-Schlüssel sicher gespeichert');scheduleCompatibilityCheck(150); }
  catch(error) { setStatus(error.message); alert(error.message); }
}
function startTest() { runCompatibilityCheck({ showTest: true }); }
async function saveOmniRouteSettings(){try{const saved=await window.workshop.saveOmniRoute({baseUrl:$('omniroute-url').value,model:$('omniroute-model').value});state.settings={...state.settings,...saved};$('omniroute-url').value=`${saved.omniroute.baseUrl}/v1`;$('omniroute-model').value=saved.omniroute.model;$('omniroute-status').textContent='OmniRoute-Adresse und Routing gespeichert.';updateSettingsState()}catch(error){$('omniroute-status').textContent=error.message}}
async function testOmniRoute(){const button=$('test-omniroute');button.disabled=true;$('omniroute-status').textContent='Prüfe lokalen OmniRoute-Endpunkt …';try{await saveOmniRouteSettings();const result=await window.workshop.testOmniRoute();$('omniroute-status').textContent=`Verbunden · ${result.model} · ${result.modelCount} Modelle im Endpoint-Katalog`}catch(error){$('omniroute-status').textContent=error.message}finally{button.disabled=false}}

$('username-setup-form').addEventListener('submit',async event=>{
  event.preventDefault();
  const button=$('save-username');button.disabled=true;
  try{
    const profile=await window.workshop.setUsername($('username-input').value);
    state.settings={...state.settings,...profile};setProfileIdentity(profile.username);$('username-setup-overlay').hidden=true;syncStartupGate();updateSettingsState();renderChat();
    if(profile.desktopShortcut)setStatus(`Desktop-Verknüpfung „${profile.username} – Modspire“ mit ${profileInitial(profile.username)}-Icon erstellt`);
    if(state.chatgpt.status==='connected'&&state.chatgpt.sharing)refreshChatGPTStatus().catch(()=>{});else $('startup-connect').focus();
  }catch(error){$('username-input').setCustomValidity(error.message);$('username-input').reportValidity();}
  finally{button.disabled=false;}
});
$('username-input').addEventListener('input',event=>event.target.setCustomValidity(''));

$('pack-name').addEventListener('input', e=>{state.project.name=e.target.value;queueSave()});
$('sidebar-export').onclick=async()=>{try{const result=await window.workshop.exportProject(state.project);if(!result.canceled)setStatus('Projektdatei wurde exportiert.')}catch(error){setStatus(`Export fehlgeschlagen: ${error.message}`);alert(`Export fehlgeschlagen: ${error.message}`)}};
$('sidebar-new-pack').onclick=openNewPack;
$('sidebar-import').onclick=$('open-modrinth-import').onclick=()=>{$('modrinth-import-overlay').hidden=false;$('modrinth-profile-code').value='';$('mrpack-file-status').textContent='Noch keine Datei gewählt';requestAnimationFrame(()=>$('modrinth-profile-code').focus())};
$('close-modrinth-import').onclick=()=>$('modrinth-import-overlay').hidden=true;
$('modrinth-import-overlay').addEventListener('click',event=>{if(event.target===$('modrinth-import-overlay'))$('modrinth-import-overlay').hidden=true});
async function applyImportedProfile(imported){
  if(!imported||imported.canceled)return;
  clearTimeout(state.saveTimer);await save();
  const store=await window.workshop.createProject(imported.name||'Importiertes Modrinth-Profil');
  const created=store.projects.find(project=>project.id===store.activeId);
  state.projects=store.projects;state.activeProjectId=store.activeId;
  state.project={...created,...imported,id:created.id,mods:Array.isArray(imported.mods)?imported.mods:[],turns:[{role:'assistant',content:`Modrinth-Profil „${imported.name}“ importiert. ${imported.mods?.length||0} Modnamen wurden übernommen. Du kannst sie jetzt bearbeiten; die automatische Kompatibilitätsprüfung läuft im Hintergrund.`}]};
  await window.workshop.saveProject(state.project);
  $('modrinth-import-overlay').hidden=true;$('pack-name').value=state.project.name;selectMinecraftVersion(state.project.minecraftVersion);$('loader').value=state.project.loader;$('provider').value='modrinth';
  state.lastSearchQueries=[];window.lastResults=[];$('mod-search').value='';$('mod-results').replaceChildren();
  renderProjectSwitcher();renderSelected();renderChat();showView('mods');loadPopularMods();reconcilePackDependencies();setStatus(`${state.project.mods.length} Mods aus „${state.project.name}“ importiert`);
}
async function runProfileImport(fromFile=false){
  const submit=$('import-profile-submit');submit.disabled=true;submit.textContent='Import läuft …';
  try{const imported=fromFile?await window.workshop.importModrinthFile():await window.workshop.importModrinthProfile($('modrinth-profile-code').value.trim());await applyImportedProfile(imported)}
  catch(error){setStatus(`Modrinth-Import fehlgeschlagen: ${error.message}`);alert(`Modrinth-Import fehlgeschlagen: ${error.message}`)}
  finally{submit.disabled=false;submit.textContent='Profil importieren'}
}
$('modrinth-import-form').addEventListener('submit',event=>{event.preventDefault();runProfileImport(false)});
$('choose-mrpack').onclick=async()=>{try{const imported=await window.workshop.importModrinthFile();if(imported?.canceled)return;$('mrpack-file-status').textContent=`${imported.name} · ${imported.mods.length} Mods`;await applyImportedProfile(imported)}catch(error){setStatus(`Modrinth-Import fehlgeschlagen: ${error.message}`);alert(`Modrinth-Import fehlgeschlagen: ${error.message}`)}};
$('nav-mod-creator').onclick=()=>{state.creatorMode=true;showView('chat');renderChat();$('chat-input').value=(window.workshopI18n?.locale||'de')==='en'?'I want to create a new Minecraft Java mod. Help me shape a clear, actionable specification and starter code for the best loader and Minecraft version. Ask for missing details first and do not add anything to my modpack.':'Ich möchte eine neue Minecraft-Java-Mod erstellen. Hilf mir, daraus eine klare, umsetzbare Mod-Spezifikation und ein passendes Code-Grundgerüst für den besten Modloader und die passende Minecraft-Version zu entwickeln. Frag zuerst nach den fehlenden Details und füge nichts zu meinem Modpack hinzu.';$('chat-input').focus();setStatus((window.workshopI18n?.locale||'de')==='en'?'AI Mod Creator · describe your idea and send':'KI-Mod-Creator · Idee beschreiben und absenden');};
$('creator-context-exit').onclick=()=>{state.creatorMode=false;renderChat();$('chat-input').focus()};
$('cancel-new-pack').onclick=$('cancel-new-pack-secondary').onclick=()=>$('new-pack-overlay').hidden=true;
$('new-pack-overlay').addEventListener('click',event=>{if(event.target===$('new-pack-overlay'))$('new-pack-overlay').hidden=true});
$('new-pack-form').addEventListener('submit',createProjectFromForm);
$('sidebar-design').onclick=$('open-design').onclick=()=>{$('design-overlay').hidden=false;applyTheme(currentTheme,themeColors,false)};
$('close-design').onclick=$('done-design').onclick=()=>$('design-overlay').hidden=true;
$('design-overlay').addEventListener('click',event=>{if(event.target===$('design-overlay'))$('design-overlay').hidden=true});
document.querySelectorAll('[data-theme-choice]').forEach(button=>button.addEventListener('click',()=>{const theme=button.dataset.themeChoice;applyTheme(theme,themeColors);if(theme!=='blue')$('color-config').hidden=true}));
document.querySelectorAll('[data-wallpaper-choice]').forEach(button=>button.addEventListener('click',()=>applyWallpaper(button.dataset.wallpaperChoice)));
$('toggle-color-config').onclick=()=>{$('color-config').hidden=!$('color-config').hidden};
function setThemeSurfaceOpacity(value){themeSurfaceOpacity=Math.max(82,Math.min(100,Number(value)||88));document.body.style.setProperty('--theme-surface-opacity',`${themeSurfaceOpacity}%`);$('theme-opacity-value').textContent=`${themeSurfaceOpacity}%`;$('theme-opacity').value=String(themeSurfaceOpacity);localStorage.setItem('mw-theme-opacity',String(themeSurfaceOpacity))}
$('theme-opacity').addEventListener('input',event=>setThemeSurfaceOpacity(event.target.value));
$('wallpaper-motion').addEventListener('change',event=>applyWallpaperMotion(event.target.checked));
function readThemeColors(){return{accent:$('theme-accent').value,surface:$('theme-surface').value,background:$('theme-background').value}}
['theme-accent','theme-surface','theme-background'].forEach(id=>$(id).addEventListener('input',()=>applyTheme('blue',readThemeColors())));
$('reset-theme-colors').onclick=()=>applyTheme(currentTheme,defaultThemeColors);
$('minecraft-version').addEventListener('change', e=>{if(!state.applyingAutoSetup){state.autoSetup=false;localStorage.setItem('mw-auto-setup','false');updateAutoSetupButton()}state.batchSelection.clear();state.project.minecraftVersion=e.target.value;queueSave();setStatus('Minecraft-Version geändert · Abhängigkeiten und Modauswahl werden erneut geprüft');renderSelected();reconcilePackDependencies();loadPopularMods();if(state.lastSearchQueries.length)searchMods(state.lastSearchQueries,false,{kind:state.searchKind})});
$('project-select').addEventListener('change',event=>{if(event.target.value==='__create__'){event.target.value=state.activeProjectId||'';openNewPack();return}switchProject(event.target.value)});
$('loader').addEventListener('change', e=>{if(!state.applyingAutoSetup){state.autoSetup=false;localStorage.setItem('mw-auto-setup','false');updateAutoSetupButton()}state.batchSelection.clear();state.project.loader=e.target.value;queueSave();setStatus('Modloader geändert · Abhängigkeiten und Modauswahl werden erneut geprüft');renderSelected();reconcilePackDependencies();loadPopularMods();if(state.lastSearchQueries.length)searchMods(state.lastSearchQueries,false,{kind:state.searchKind})});
$('auto-setup-toggle').onclick=()=>{state.autoSetup=!state.autoSetup;localStorage.setItem('mw-auto-setup',String(state.autoSetup));updateAutoSetupButton();setStatus(state.autoSetup?'Auto-Auswahl für Modloader und Version aktiviert':'Manuelle Auswahl aktiviert')};
$('add-all-results').onclick=()=>addModBatch(window.lastResults||[]);$('add-ai-results').onclick=()=>addAiRecommendations(window.lastResults||[]);
$('provider').addEventListener('change', e=>{if(e.target.value==='curseforge'&&!state.settings.hasCurseForgeKey){state.project.provider='modrinth';e.target.value='modrinth';state.batchSelection.clear();queueSave();openCurseforgeNotice();loadPopularMods();return}state.batchSelection.clear();state.project.provider=e.target.value;queueSave();loadPopularMods();if($('mod-search').value)searchMods($('mod-search').value)});
$('search-button').onclick=()=>searchMods($('mod-search').value,false,{kind:state.searchKind});$('mod-search').addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();searchMods(e.target.value,false,{kind:state.searchKind})}});
$('catalog-search-form').onsubmit=event=>{event.preventDefault();runCatalogSearch()};
$('catalog-more').onclick=()=>state.catalogSearch?runCatalogSearch(true):loadMoreModResults();
for(const id of ['project-select','minecraft-version','loader'])$(id).addEventListener('change',()=>{state.catalogSearch=null;$('catalog-more').hidden=true;$('catalog-submit').disabled=false});
for(const id of ['catalog-query','catalog-category','catalog-environment','catalog-sort','catalog-open-source'])$(id).addEventListener('change',()=>{state.catalogSearch=null;$('catalog-more').hidden=true;$('catalog-submit').disabled=false});
$('mod-results').addEventListener('scroll',()=>{const area=$('mod-results');if(state.currentView==='mods'&&area.scrollHeight>area.clientHeight&&area.scrollHeight-area.scrollTop-area.clientHeight<320){if(state.catalogSearch)runCatalogSearch(true);else loadMoreModResults()}},{passive:true});
$('mod-search-modes').querySelectorAll('[data-search-mode]').forEach(button=>button.addEventListener('click',()=>{const kind=button.dataset.searchMode;if(kind==='mods'){state.searchKind='mod';document.querySelectorAll('[data-search-mode]').forEach(item=>item.classList.toggle('active',item===button));$('results-hint').textContent='Normale Gameplay-, Technik-, Kampf- und Erkundungsmods suchen.';return}searchMods('',false,{kind})}));
$('mod-search').addEventListener('focus',e=>{if(e.target.value.includes(' · '))e.target.value=''});
$('chat-form').addEventListener('submit',e=>{e.preventDefault();sendChat($('chat-input').value)});
$('close-mod-preview').onclick=closeModPreview;
$('close-mod-details').onclick=closeModDetails;
$('mod-details-overlay').addEventListener('click',event=>{if(event.target.id==='mod-details-overlay')closeModDetails()});
$('mod-selection-close').onclick=$('mod-selection-cancel').onclick=()=>closeModSelection();
$('mod-selection-continue').onclick=()=>confirmModSelection();
$('mod-selection-ai-add').onclick=()=>confirmModSelection({ai:true});
$('mod-selection-overlay').addEventListener('click',event=>{if(event.target.id==='mod-selection-overlay')closeModSelection()});
$('new-chat-button').onclick=startNewChat;
$('open-chat-history').onclick=()=>{renderChatHistory();$('chat-history-overlay').hidden=false};
$('close-chat-history').onclick=()=>$('chat-history-overlay').hidden=true;
$('chat-history-overlay').addEventListener('click',event=>{if(event.target.id==='chat-history-overlay')event.currentTarget.hidden=true});
$('mod-preview-overlay').addEventListener('click',event=>{if(event.target.id==='mod-preview-overlay')closeModPreview()});
document.addEventListener('keydown',event=>{if(event.key==='Escape'&&!$('mod-preview-overlay').hidden)closeModPreview()});
document.addEventListener('keydown',event=>{if(event.key==='Escape'&&!$('mod-details-overlay').hidden)closeModDetails()});
document.addEventListener('keydown',event=>{if(event.key==='Escape'&&!$('mod-selection-overlay').hidden)closeModSelection()});
$('voice-input').addEventListener('click',toggleVoiceInput);
$('chat-input').addEventListener('input',event=>{const field=event.currentTarget;field.style.height='44px';field.style.height=Math.min(116,Math.max(44,field.scrollHeight))+'px'});
$('chat-input').addEventListener('keydown',event=>{if(event.key==='Enter'&&!event.shiftKey){event.preventDefault();if(!state.sending)sendChat($('chat-input').value)}});
$('open-avatar-picker').onclick=()=>{$('skin-username').value=skinUsername;$('assistant-skin-username').value=selectedAssistantAvatar.startsWith('skin:')?selectedAssistantAvatar.slice(5):'';$('avatar-picker-overlay').hidden=false;$('avatar-choice-grid').querySelectorAll('[data-avatar]').forEach(button=>button.classList.toggle('active',!selectedUserAvatar||selectedUserAvatar===button.dataset.avatar));$('assistant-avatar-choice-grid').querySelectorAll('[data-assistant-avatar]').forEach(button=>button.classList.toggle('active',selectedAssistantAvatar===button.dataset.assistantAvatar||(!selectedAssistantAvatar&&button.dataset.assistantAvatar==='✳')));if(skinUsername){$('skin-preview').src=skinAvatarUrl(skinUsername);$('skin-preview').hidden=false}};
$('close-avatar-picker').onclick=$('done-avatar-picker').onclick=()=>{$('avatar-picker-overlay').hidden=true};
$('avatar-picker-overlay').addEventListener('click',event=>{if(event.target.id==='avatar-picker-overlay')event.currentTarget.hidden=true});
$('avatar-choice-grid').querySelectorAll('[data-avatar]').forEach(button=>button.onclick=()=>{selectedUserAvatar=button.dataset.avatar;skinUsername='';$('skin-username').value='';$('skin-preview').hidden=true;localStorage.setItem('mw-user-avatar',selectedUserAvatar);localStorage.removeItem('mw-skin-username');$('avatar-choice-grid').querySelectorAll('[data-avatar]').forEach(item=>item.classList.toggle('active',item===button));applyUserAvatar()});
function loadMinecraftSkin(inputId,previewId,statusId,onLoaded){const name=$(inputId).value.trim(),status=$(statusId),preview=$(previewId),english=(window.workshopI18n?.locale||'de').startsWith('en');if(!/^[A-Za-z0-9_]{1,16}$/.test(name)){preview.hidden=true;status.textContent=english?'Enter a Java username with 1–16 letters, numbers, or underscores.':'Bitte einen Java-Namen mit 1 bis 16 Buchstaben, Zahlen oder _ eingeben.';return}status.textContent=english?`Loading ${name}'s skin …`:`Skin für ${name} wird geladen …`;preview.hidden=false;preview.onload=()=>{if(!preview.naturalWidth){preview.onerror();return}status.textContent=english?`Skin for ${name} loaded.`:`Skin von ${name} geladen.`;onLoaded(name)};preview.onerror=()=>{preview.hidden=true;status.textContent=english?`No skin image found for “${name}”. Check the Java username and your internet connection.`:`Für „${name}“ wurde kein Skin-Bild gefunden. Prüfe den Java-Namen und die Internetverbindung.`};preview.src=skinAvatarUrl(name)+`?v=${Date.now()}`}
$('load-user-skin').onclick=()=>loadMinecraftSkin('skin-username','skin-preview','skin-preview-note',name=>{skinUsername=name;selectedUserAvatar=`skin:${name}`;localStorage.setItem('mw-skin-username',name);localStorage.setItem('mw-user-avatar',selectedUserAvatar);$('avatar-choice-grid').querySelectorAll('[data-avatar]').forEach(button=>button.classList.remove('active'));applyUserAvatar()});
$('skin-username').addEventListener('keydown',event=>{if(event.key==='Enter'){event.preventDefault();$('load-user-skin').click()}});
$('assistant-avatar-choice-grid').querySelectorAll('[data-assistant-avatar]').forEach(button=>button.onclick=()=>{selectedAssistantAvatar=button.dataset.assistantAvatar==='✳'?'':button.dataset.assistantAvatar;localStorage.setItem('mw-assistant-avatar',selectedAssistantAvatar);$('assistant-skin-username').value='';$('assistant-skin-preview').hidden=true;$('assistant-skin-status').textContent='Assistentenbild gespeichert.';$('assistant-avatar-choice-grid').querySelectorAll('[data-assistant-avatar]').forEach(item=>item.classList.toggle('active',item===button));applyAssistantAvatar()});
$('load-assistant-skin').onclick=()=>loadMinecraftSkin('assistant-skin-username','assistant-skin-preview','assistant-skin-status',name=>{selectedAssistantAvatar=`skin:${name}`;localStorage.setItem('mw-assistant-avatar',selectedAssistantAvatar);$('assistant-avatar-choice-grid').querySelectorAll('[data-assistant-avatar]').forEach(item=>item.classList.remove('active'));applyAssistantAvatar()});
$('assistant-skin-username').addEventListener('keydown',event=>{if(event.key==='Enter'){event.preventDefault();$('load-assistant-skin').click()}});
function readAvatarFile(inputId,callback,statusId){const file=$(inputId).files?.[0],english=(window.workshopI18n?.locale||'de').startsWith('en');if(!file)return;if(!/^image\/(png|jpeg|webp)$/.test(file.type)||file.size>1500000){$(statusId).textContent=english?'Choose a PNG, JPG, or WebP image up to 1.5 MB.':'Bitte PNG, JPG oder WebP bis 1,5 MB auswählen.';return}const reader=new FileReader();reader.onload=()=>callback(String(reader.result));reader.onerror=()=>$(statusId).textContent=english?'The image could not be read.':'Das Bild konnte nicht gelesen werden.';reader.readAsDataURL(file)}
$('user-avatar-file').addEventListener('change',()=>readAvatarFile('user-avatar-file',data=>{selectedUserAvatar=data;skinUsername='';localStorage.setItem('mw-user-avatar',data);localStorage.removeItem('mw-skin-username');$('skin-username').value='';$('skin-preview').hidden=true;$('skin-preview-note').textContent='Eigenes Profilbild gespeichert.';applyUserAvatar()},'skin-preview-note'));
$('assistant-avatar-file').addEventListener('change',()=>readAvatarFile('assistant-avatar-file',data=>{selectedAssistantAvatar=data;localStorage.setItem('mw-assistant-avatar',data);$('assistant-skin-status').textContent='Eigenes Assistentenbild gespeichert.';applyAssistantAvatar()},'assistant-skin-status'));
$('configure-ai').textContent='Einstellungen';$('configure-ai').onclick=openSettings;$('settings-link').onclick=openSettings;$('nav-settings').onclick=openSettings;
document.querySelectorAll('.nav-item[data-view], [data-go-view]').forEach(button=>button.onclick=()=>{if(button.id==='nav-chat'){state.creatorMode=false;renderChat()}showView(button.dataset.view||button.dataset.goView)});
document.querySelectorAll('[data-refine]').forEach(button=>button.onclick=()=>{showView('chat');sendChat(button.dataset.refine)});
$('attach-video').onclick=()=>$('video-input').click();
$('video-input').addEventListener('change',event=>{state.pendingVideo=event.target.files?.[0]||null;$('video-name').textContent=state.pendingVideo?`${state.pendingVideo.name} · bereit zur Analyse`:'Bis zu 6 ausgewählte Bilder werden analysiert.';$('clear-video').hidden=!state.pendingVideo});
$('clear-video').onclick=()=>{state.pendingVideo=null;$('video-input').value='';$('video-name').textContent='Bis zu 6 ausgewählte Bilder werden analysiert.';$('clear-video').hidden=true};
$('connect-chatgpt').onclick=async()=>{state.chatgpt={...state.chatgpt,status:'connecting'};updateSettingsState();try{state.chatgpt=await window.workshop.connectChatGPT();}catch(error){state.chatgpt={status:'disconnected',sharing:false,error:error.message};$('chatgpt-account-note').textContent=`Anmeldung fehlgeschlagen: ${error.message}`}updateSettingsState()};
$('startup-connect').onclick=()=>$('connect-chatgpt').click();
$('startup-demo').onclick=enterDemo;$('profile-demo').onclick=enterDemo;
$('sidebar-snapshot').onclick=()=>{saveSnapshot();showView('lab')};
$('sidebar-crash').onclick=()=>{showView('lab');requestAnimationFrame(()=>$('crash-log-input').click())};
$('save-snapshot').onclick=()=>saveSnapshot();
$('compare-snapshots').onclick=()=>{const all=state.project.snapshots||[];if(all.length<2){setStatus('Zum Vergleichen brauchst du mindestens zwei gespeicherte Stände');return}const a=all[all.length-2],b=all[all.length-1],ids=snapshot=>new Set(snapshot.data.mods.map(mod=>mod.provider+':'+mod.id)),left=ids(a),right=ids(b),added=b.data.mods.filter(mod=>!left.has(mod.provider+':'+mod.id)),removed=a.data.mods.filter(mod=>!right.has(mod.provider+':'+mod.id));alert(a.name+' → '+b.name+'\n\n+'+(added.map(mod=>mod.title).join(', ')||'keine Mods')+'\n−'+(removed.map(mod=>mod.title).join(', ')||'keine Mods'))};
$('mood-add').onclick=()=>{const value=$('mood-input').value.trim();if(!value)return;state.project.moodboard=Array.isArray(state.project.moodboard)?state.project.moodboard:[];if(!state.project.moodboard.includes(value))state.project.moodboard.push(value);$('mood-input').value='';queueSave();renderMoodboard()};
$('mood-input').addEventListener('keydown',event=>{if(event.key==='Enter'){event.preventDefault();$('mood-add').click()}});
$('crash-log-input').addEventListener('change',async event=>{const file=event.target.files?.[0];if(!file)return;const target=$('crash-output');if(file.size>5*1024*1024){target.textContent='Die Logdatei ist größer als 5 MB. Bitte eine kleinere crash-*.txt oder latest.log wählen.';$('send-crash-to-chat').disabled=true;return}try{const report=diagnoseCrash(await file.text(),file.name);state.crashReport=report;target.replaceChildren();const title=document.createElement('strong');title.textContent=report.findings.length?report.findings.map(item=>item.label).join(' · '):'Kein bekanntes Muster gefunden';target.append(title);const excerpt=document.createElement('p');excerpt.textContent=report.excerpt;target.append(excerpt);report.findings.slice(0,4).forEach(item=>{const row=document.createElement('p');row.textContent='Hinweis: '+item.fix;target.append(row)});if(report.relevant.length){const row=document.createElement('p');row.textContent='Erwähnte Pack-Mods: '+report.relevant.join(', ');target.append(row)}$('send-crash-to-chat').disabled=false;setStatus('Crash-Log lokal untersucht · '+report.findings.length+' Muster')}catch(error){target.textContent='Logdatei konnte nicht gelesen werden: '+error.message;$('send-crash-to-chat').disabled=true}});
$('send-crash-to-chat').onclick=()=>{const report=state.crashReport;if(!report)return;showView('chat');sendChat('Analysiere diesen Minecraft-Absturz anhand des Logs und meiner Pack-Auswahl. Erkläre die Belege und schlage kleine, rückgängig machbare Fixes vor.\nDatei: '+report.name+'\nErkannte Muster: '+report.findings.map(item=>item.label+': '+item.fix).join('; ')+'\nBetroffene Mods: '+report.relevant.join(', ')+'\nLogauszug:\n'+report.excerpt)};
$('make-night-plan').onclick=()=>{const english=(window.workshopI18n?.locale||'de').startsWith('en'),players=Math.max(1,Math.min(32,Number($('night-players').value)||1)),duration=Math.max(30,Math.min(600,Number($('night-duration').value)||120)),groups={};state.project.mods.forEach(mod=>{const role=roleForMod(mod);groups[role]=groups[role]||[];groups[role].push(mod.title)});const phases=english?[['Gear up',Math.round(duration*.15)],['Explore',Math.round(duration*.3)],['Dungeon or boss',Math.round(duration*.35)],['Rewards & next goal',duration-Math.round(duration*.8)]]:[['Ankommen & Ausrüstung',Math.round(duration*.15)],['Erkundung',Math.round(duration*.3)],['Dungeon oder Boss',Math.round(duration*.35)],['Belohnungen & nächstes Ziel',duration-Math.round(duration*.8)]];const lines=phases.map((phase,index)=>{const role=index===1?'Erkundung':index===2?'Kampf':index===0?'Komfort':'Technik';const ideas=(groups[role]||[]).slice(0,3);return `${index+1}. ${phase[0]} · ${english?'about':'ca.'} ${phase[1]} ${english?'min':'Min.'}${ideas.length?(english?' · Mods: ':' · Mods: ')+ideas.join(', '):(english?' · Choose a goal that fits your pack':' · Ziel passend zu eurem Pack wählen')}`});$('night-plan').textContent=english?`${players} players · ${duration} minutes\n${lines.join('\n')}\n\nA rough, editable idea — it does not create quest files.`:`${players} Spieler · ${duration} Minuten\n${lines.join('\n')}\n\nVorschlag, keine automatisch erzeugten Questdateien.`};
$('cancel-chatgpt').onclick=async()=>{try{await window.workshop.cancelChatGPTSignIn()}catch(error){setStatus(error.message)}state.chatgpt=await window.workshop.getChatGPTStatus();updateSettingsState()};
$('disconnect-chatgpt').onclick=async()=>{try{state.chatgpt=await window.workshop.disconnectChatGPT();updateSettingsState()}catch(error){setStatus(error.message)}};
$('open-usage').onclick=()=>window.workshop.openChatGPTUsage();
function syncFullscreenButton(fullscreen){const english=(window.workshopI18n?.locale||'de').startsWith('en');$('toggle-fullscreen').querySelector('span').textContent=fullscreen?(english?'Windowed':'Fenster'):(english?'Fullscreen':'Vollbild');$('toggle-fullscreen').setAttribute('aria-pressed',String(fullscreen))}
window.workshop.onFullscreenChanged(syncFullscreenButton);
$('toggle-fullscreen').onclick=async()=>{const button=$('toggle-fullscreen');if(button.dataset.busy==='yes')return;button.dataset.busy='yes';try{syncFullscreenButton(await window.workshop.toggleFullscreen())}catch(error){setStatus(`Vollbild konnte nicht geändert werden: ${error.message}`)}finally{delete button.dataset.busy}};
window.workshop.isFullscreen?.().then(syncFullscreenButton).catch(()=>{});
let windowMaximized=false;
function syncWindowMaximize(maximized){const english=(window.workshopI18n?.locale||'de').startsWith('en');windowMaximized=!!maximized;$('window-maximize').textContent=windowMaximized?'❐':'□';$('window-maximize').title=windowMaximized?(english?'Restore':'Wiederherstellen'):(english?'Maximize':'Maximieren');$('window-maximize').setAttribute('aria-label',$('window-maximize').title)}
window.workshop.isWindowMaximized?.().then(syncWindowMaximize).catch(()=>{});window.workshop.onMaximizedChanged?.(syncWindowMaximize);
$('window-minimize').onclick=()=>window.workshop.minimizeWindow();$('window-maximize').onclick=async()=>syncWindowMaximize(await window.workshop.toggleMaximized());$('window-close').onclick=()=>window.workshop.closeWindow();
$('import-local-gguf').onclick=async()=>{const english=(window.workshopI18n?.locale||'de').startsWith('en'),button=$('import-local-gguf');button.disabled=true;button.textContent=english?'Setting up model …':'Modell wird eingerichtet …';$('local-ai-progress').hidden=false;$('local-ai-progress-bar').removeAttribute('value');$('local-ai-progress-label').textContent=english?'Waiting for model selection …':'Warte auf die Modellauswahl …';$('local-ai-status').textContent=english?'The model is being registered locally. Setup progress will appear here.':'Das Modell wird lokal eingerichtet. Der Fortschritt wird hier angezeigt.';try{const result=await window.workshop.importLocalGguf();if(result.canceled){$('local-ai-progress').hidden=true;$('local-ai-status').textContent=english?'Selection cancelled.':'Auswahl abgebrochen.';return}state.settings={...state.settings,...result};await refreshLocalModels(result.model);$('ai-provider').value='local';await saveAiProvider();$('local-ai-progress-label').textContent=english?'Model is ready for chat.':'Modell ist bereit für den Chat.';$('local-ai-progress-bar').value=100;$('local-ai-status').textContent=english?`${result.model} is installed locally and selected for chat.`:`${result.model} ist lokal eingerichtet und für den Chat ausgewählt.`;setTimeout(()=>$('local-ai-progress').hidden=true,1800)}catch(error){$('local-ai-progress').hidden=true;$('local-ai-status').textContent=error.message}finally{button.disabled=false;button.textContent=english?'Set up GGUF file':'GGUF-Datei einrichten'}};
window.workshop.onLocalAiProgress?.(({stage,percent}={})=>{const english=(window.workshopI18n?.locale||'de').startsWith('en'),labels=english?{checking:'Checking the local model service …',registering:'Registering model with Ollama …',saving:'Saving your model choice …',ready:'Model ready.'}:{checking:'Prüfe den lokalen KI-Dienst …',registering:'Richte das Modell in Ollama ein …',saving:'Speichere die Modellauswahl …',ready:'Modell ist bereit.'};$('local-ai-progress').hidden=false;$('local-ai-progress-label').textContent=labels[stage]||labels.registering;if(Number.isFinite(percent))$('local-ai-progress-bar').value=percent;else $('local-ai-progress-bar').removeAttribute('value')});
$('refresh-local-models').onclick=()=>refreshLocalModels();$('save-omniroute-settings').onclick=saveOmniRouteSettings;$('test-omniroute').onclick=testOmniRoute;$('local-ai-model').onchange=()=>{state.settings.localAi={...(state.settings.localAi||{}),model:$('local-ai-model').value};saveAiProvider()};$('ai-provider').onchange=saveAiProvider;
$('ollama-download').onclick=()=>window.workshop.openExternal('https://ollama.com/download/windows');
$('open-claude-console').onclick=()=>window.workshop.openExternal('https://console.anthropic.com/settings/keys');

document.querySelectorAll('.save-key').forEach(b=>b.onclick=()=>storeSecret(b.dataset.secret));
document.querySelectorAll('.paste-key').forEach(b=>b.onclick=async()=>{
  const field=$(`${b.dataset.paste}-key`);
  try {
    const text=await window.workshop.readClipboard();
    if(!text.trim()){b.textContent='Zwischenablage leer';setTimeout(()=>b.textContent='Einfügen',1400);return;}
    field.value=text.trim();field.focus();b.textContent='Eingefügt';setTimeout(()=>b.textContent='Einfügen',1400);
  } catch(error) { setStatus(`Einfügen fehlgeschlagen: ${error.message}`); }
});
$('close-settings').onclick=$('done-settings').onclick=closeSettings;
$('open-cf-docs').onclick=()=>window.workshop.openExternal('https://support.curseforge.com/support/solutions/articles/9000208346-about-the-curseforge-api-and-how-to-apply-for-a-key');
$('curseforge-notice-ok').onclick=()=>{$('curseforge-notice-overlay').hidden=true;localStorage.setItem('mw-curseforge-notice-seen','yes')};
$('local-model-notice-ok').onclick=()=>{$('local-model-notice-overlay').hidden=true;localStorage.setItem('mw-local-model-notice-seen','yes');syncStartupGate();if(state.chatgpt.status==='connected'&&state.chatgpt.sharing&&state.settings.username&&!state.settings.hasCurseForgeKey&&localStorage.getItem('mw-curseforge-notice-seen')!=='yes')openCurseforgeNotice()};
$('curseforge-notice-settings').onclick=()=>{$('curseforge-notice-overlay').hidden=true;localStorage.setItem('mw-curseforge-notice-seen','yes');openSettings()};
$('open-openai-docs').onclick=()=>window.workshop.openExternal('https://platform.openai.com/api-keys');

const hoverDescriptions = {
  'nav-project': 'Öffnet die Übersicht mit Packname, Version und deinen Bereichen.',
  'nav-chat': 'Öffnet den KI-Chat für Modpack-Ideen, Modsuche und Videoanalyse.',
  'nav-mods': 'Öffnet die Modsuche und deine ausgewählten Pack-Mods.',
  'nav-settings': 'Öffnet ChatGPT- und API-Verbindungen sowie Schlüssel-Einstellungen.',
  'sidebar-export': 'Speichert deine Pack-Idee, Version, Mod-Auswahl und den Chat als Projektdatei.',
  'sidebar-new-pack': 'Legt ein separates Modpack mit eigener Auswahl, Konfiguration und Chatverlauf an.',
  'sidebar-design': 'Wählt ein App-Design oder passt die Farben des Weiß-Blau-Stils an.',
  'sidebar-import': 'Importiert ein Modrinth-Profil oder .mrpack als bearbeitbares Modpack.',
  'nav-lab': 'Öffnet Pack-Labor mit Modpack-DNA, Kompatibilitäts-Kompass, Weltgenerator-Check, Moodboard, Pack-Ständen, Crash-Detektiv und Spielabend-Planer.',
  'sidebar-snapshot': 'Sichert deinen aktuellen Pack-Stand lokal. Du kannst Stände später vergleichen oder wiederherstellen.',
  'sidebar-crash': 'Analysiert eine Minecraft-Crash- oder latest.log-Datei lokal und erklärt erkannte Fehlerursachen.',
  'sidebar-diagnostics': 'Zeigt lokale Fehlerprotokolle der Werkstatt und bietet Speichern, Kopieren und Öffnen des Log-Ordners.',
  'open-modrinth-import': 'Importiert ein Modrinth-Profil, Pack-Link oder eine .mrpack-Datei.',
  'open-design': 'Öffnet alle Designs und den Farbeditor.',
  'nav-mod-creator': 'Öffnet den KI-Mod-Creator für eine Mod-Idee, Spezifikation und ein Code-Grundgerüst.',
  'toggle-fullscreen': 'Wechselt zwischen Fenster- und Vollbildmodus. F11 schaltet ebenfalls um.',
  'auto-setup-toggle': 'Sucht für deine Modpack-Idee die Version und den Modloader mit den meisten passenden Modrinth-Treffern. Manuell gewählte Einstellungen schalten die Automatik aus.',
  'add-all-results': 'Fügt alle noch nicht ausgewählten Treffer auf einmal zu diesem Modpack hinzu.',
  'test-pack': 'Prüft dein Modpack automatisch mit KI. Bei eindeutigen Konflikten kannst du die betroffenen Mods anschließend automatisch entfernen lassen.',
  'open-launcher': 'Öffnet den installierten Minecraft Launcher oder den Minecraft-Ordner.',
  'send-button': 'Sendet deine Nachricht an den KI-Assistenten.',
  'attach-video': 'Wählt ein Video aus. Daraus werden lokal bis zu sechs Standbilder für die Analyse erstellt.',
  'search-button': 'Sucht Mods passend zu Version und Modloader.',
  'clear-selection': 'Entfernt alle Mods aus deiner aktuellen Pack-Auswahl.',
};
const hoverDescriptionsEn={
  'nav-project':'Opens your pack overview, game version, and work areas.',
  'nav-chat':'Opens the AI chat for pack ideas, mod searches, and video analysis.',
  'nav-mods':'Opens mod search and the mods selected for this pack.',
  'nav-settings':'Opens ChatGPT, local AI, and API connection settings.',
  'sidebar-export':'Saves your pack, game setup, mod selection, and chat as a project file.',
  'sidebar-new-pack':'Creates a separate modpack with its own selection, setup, and chat history.',
  'sidebar-design':'Choose an app theme or adjust the blue theme colors.',
  'sidebar-import':'Imports a Modrinth profile or .mrpack as an editable pack.',
  'nav-lab':'Opens pack insights, compatibility notes, snapshots, crash analysis, and the game night planner.',
  'sidebar-snapshot':'Saves a local snapshot of your current pack so you can compare or restore it later.',
  'sidebar-crash':'Reads a Minecraft crash or latest.log locally and explains recognized error patterns.',
  'sidebar-diagnostics':'Shows local app error logs and lets you save, copy, or open the log folder.',
  'open-modrinth-import':'Imports a Modrinth profile, pack link, or .mrpack file.',
  'open-design':'Opens all app themes and the color editor.',
  'nav-mod-creator':'Opens the AI mod creator to develop a mod idea and starter specification.',
  'toggle-fullscreen':'Switches between windowed and fullscreen mode. F11 also toggles it.',
  'auto-setup-toggle':'Finds the Minecraft version and loader with the most matching Modrinth results.',
  'add-all-results':'Adds every remaining search result to this modpack.',
  'test-pack':'Checks the pack with AI. Clear conflicts can then be removed automatically.',
  'open-launcher':'Opens the installed Minecraft Launcher or Minecraft folder.',
  'send-button':'Send your message to the pack assistant.',
  'attach-video':'Choose a video. Up to six frames are extracted locally for analysis.',
  'search-button':'Searches for mods matching the selected game version and loader.',
  'clear-selection':'Removes all mods from the current pack.'
};
function tooltipFor(target){
  const english=(window.workshopI18n?.locale||'de').startsWith('en');
  if(target.dataset.prompt)return english?`Start a chat search for: ${target.dataset.prompt}`:`Startet eine Modsuche im Chat: ${target.dataset.prompt}`;
  if(target.dataset.refine)return english?`Find more matching mods: ${window.workshopI18n?.translate(target.dataset.refine,'en')||target.dataset.refine}`:`Sucht weitere passende Mods: ${target.dataset.refine}`;
  const source=hoverDescriptions[target.id]||target.dataset.tooltipSource||target.title||target.getAttribute('aria-label')||'';
  return english?(hoverDescriptionsEn[target.id]||window.workshopI18n?.translate(source,'en')||source):source;
}
  document.querySelectorAll('button,select').forEach(element=>{
  if(element.id&&hoverDescriptions[element.id])element.title=hoverDescriptions[element.id];
  else if(element.dataset.prompt)element.title=`Startet den Chat mit dieser Richtung: ${element.dataset.prompt}`;
  else if(element.dataset.refine)element.title=`Sucht weitere passende Mods: ${element.dataset.refine}`;
  else if(!element.title)element.title=element.getAttribute('aria-label')||element.textContent.trim().replace(/\s+/g,' ').slice(0,150);
});
const hoverTooltip=document.createElement('div');hoverTooltip.className='hover-tooltip';hoverTooltip.setAttribute('role','tooltip');document.body.append(hoverTooltip);
document.addEventListener('pointerover',event=>{
  const target=event.target.closest('button,select,[title]');
  if(!target)return;
  const source=hoverDescriptions[target.id]||target.dataset.tooltipSource||target.title||target.getAttribute('aria-label')||'';
  const description=tooltipFor(target);
  if(!description)return;
  target.dataset.tooltipSource=source;target.dataset.tooltipText=description;
  target.removeAttribute('title');
  hoverTooltip.textContent=description;
  hoverTooltip.classList.add('visible');
  const rect=target.getBoundingClientRect();
  const isSidebarTarget=!!target.closest('.sidebar');
  if(isSidebarTarget){
    const sidebarRight=document.querySelector('.sidebar')?.getBoundingClientRect().right??rect.right;
    const left=Math.min(sidebarRight+12,Math.max(12,window.innerWidth-180));
    hoverTooltip.style.maxWidth=`min(320px, ${Math.max(160,window.innerWidth-left-16)}px)`;
    const tooltipHeight=hoverTooltip.offsetHeight;
    const top=rect.top-tooltipHeight-10>=12?rect.top-10:Math.min(window.innerHeight-12,rect.bottom+10);
    hoverTooltip.style.left=`${left}px`;
    hoverTooltip.style.top=`${top}px`;
    hoverTooltip.style.transform=top<rect.top?'translateY(-100%)':'translateY(0)';
    hoverTooltip.style.textAlign='left';
    return;
  }
  hoverTooltip.style.maxWidth=`min(320px, ${Math.max(180,window.innerWidth-28)}px)`;
  hoverTooltip.style.textAlign='center';
  const left=Math.min(window.innerWidth-16,Math.max(16,rect.left+rect.width/2));
  const above=rect.top>70;
  hoverTooltip.style.left=`${left}px`;
  hoverTooltip.style.top=`${above?rect.top-9:rect.bottom+9}px`;
  hoverTooltip.style.transform=above?'translate(-50%,-100%)':'translate(-50%,0)';
});
document.addEventListener('pointerout',event=>{const from=event.target.closest('button,select,[data-tooltip-text]');const to=event.relatedTarget?.closest?.('button,select,[data-tooltip-text]');if(from&&from!==to)hoverTooltip.classList.remove('visible')});
document.addEventListener('focusin',event=>{const target=event.target.closest('button,select,[title]');if(!target)return;const source=hoverDescriptions[target.id]||target.dataset.tooltipSource||target.title||target.getAttribute('aria-label')||'',description=tooltipFor(target);if(!description)return;target.dataset.tooltipSource=source;target.dataset.tooltipText=description;target.removeAttribute('title');hoverTooltip.textContent=description;hoverTooltip.classList.add('visible');const rect=target.getBoundingClientRect();if(target.closest('.sidebar')){const left=Math.min((document.querySelector('.sidebar')?.getBoundingClientRect().right??rect.right)+12,Math.max(12,window.innerWidth-180));hoverTooltip.style.maxWidth=`min(320px, ${Math.max(160,window.innerWidth-left-16)}px)`;const tooltipHeight=hoverTooltip.offsetHeight;const top=rect.top-tooltipHeight-10>=12?rect.top-10:Math.min(window.innerHeight-12,rect.bottom+10);hoverTooltip.style.left=`${left}px`;hoverTooltip.style.top=`${top}px`;hoverTooltip.style.transform=top<rect.top?'translateY(-100%)':'translateY(0)';hoverTooltip.style.textAlign='left'}});
document.addEventListener('focusout',event=>{if(event.target.closest('button,select,[title]'))hoverTooltip.classList.remove('visible')});
document.addEventListener('click',()=>hoverTooltip.classList.remove('visible'),true);
document.addEventListener('scroll',()=>hoverTooltip.classList.remove('visible'),true);
$('selected-filter').addEventListener('input',event=>{state.packFilter=event.target.value.trim();renderSelected()});
$('copy-mod-list').onclick=async()=>{const english=(window.workshopI18n?.locale||'de').startsWith('en');const lines=state.project.mods.map(mod=>`• ${mod.title}${mod.dependency?(english?' (dependency)':' (Abhängigkeit)'):''}`);const text=`${state.project.name} · Minecraft ${state.project.minecraftVersion} · ${state.project.loader}\n${lines.join('\n')}`;try{await window.workshop.writeClipboard(text);setStatus(english?'Mod list copied':'Modliste kopiert')}catch(error){setStatus(error.message)}};
$('export-pack-json').onclick=async()=>{try{const result=await window.workshop.exportProject(state.project);if(!result.canceled)setStatus((window.workshopI18n?.locale||'de').startsWith('en')?'Pack exported':'Modpack exportiert')}catch(error){setStatus(error.message)}};
$('clear-selection').onclick=()=>{state.project.mods=[];queueSave();renderSelected();renderResults(window.lastResults||[]);renderChat()};
$('chat-model-select').addEventListener('change',async()=>{const choice=$('chat-model-select').value;if(!choice)return;if(choice==='provider:auto'){$('ai-provider').value='auto';await saveAiProvider();return}if(choice==='provider:chatgpt'){$('ai-provider').value='chatgpt';await saveAiProvider();if(state.chatgpt.status!=='connected'||!state.chatgpt.sharing)openSettings();return}if(choice==='provider:claude'){$('ai-provider').value='claude';await saveAiProvider();return}if(choice==='provider:openai'){$('ai-provider').value='openai';await saveAiProvider();return}if(choice==='provider:omniroute'){$('ai-provider').value='omniroute';await saveAiProvider();return}const model=choice.slice('local:'.length);if(!model)return;state.settings.localAi={...(state.settings.localAi||{}),model};$('local-ai-model').value=model;$('ai-provider').value='local';await saveAiProvider()});
window.addEventListener('workshop-language-changed',()=>{hoverTooltip.classList.remove('visible');renderSelected();renderResults(window.lastResults||[]);renderChat();syncChatModelPicker();syncFullscreenButton($('toggle-fullscreen').getAttribute('aria-pressed')==='true');if(state.currentView==='lab')renderLab()});
$('test-pack').onclick=startTest;$('auto-fix').onclick=applyCompatibilityFixes;$('close-test').onclick=$('test-done').onclick=()=>$('test-overlay').hidden=true;
$('open-launcher').onclick=async()=>{try{const result=await window.workshop.openLauncher();setStatus(result.found?'Minecraft-Ordner geöffnet':'Minecraft-Launcher wird geöffnet');}catch(error){setStatus(error.message)}};
applyAssistantAvatar();
window.WorkshopModernUI?.init({
  getProject:()=>state.project,getProjects:()=>state.projects,
  getUsername:()=>state.settings.username||(isDemoMode()?'Demo-Modder':'Modder'),currentView:()=>state.currentView,navigate:view=>{if(view==='chat'&&state.creatorMode){state.creatorMode=false;renderChat()}showView(view)},
  switchProject:id=>id==='__create__'?openNewPack():switchProject(id),createProject:openNewPack,
  openSettings,openDesign:()=>{$('design-overlay').hidden=false;applyTheme(currentTheme,themeColors,false)},
  openProfile:()=>$('open-avatar-picker').click(),snapshot:()=>{saveSnapshot();window.WorkshopModernUI?.render()},
  exportProject:()=>$('sidebar-export').click(),openMod:mod=>openModDetails(mod),
  syncClassicView:()=>{$('project-overview').hidden=state.currentView!=='project'||window.WorkshopModernUI?.mode!=='classic';$('chat-panel').hidden=state.currentView!=='chat';$('mods-panel').hidden=state.currentView!=='mods';$('lab-panel').hidden=state.currentView!=='lab'}
});
window.WorkshopProjectReady=load().then(()=>{state.projectLoaded=true;return true}).catch(error=>{setStatus(`Projekt konnte nicht geladen werden: ${error.message}`);window.workshop.reportError?.({message:error.message,stack:error.stack}).catch(()=>{});return false;});
window.addEventListener('pagehide',()=>{if(window.workshop.isWebVersion&&state.projectLoaded&&!state.webHandoff&&document.body.dataset.webReturning!=='true')window.workshop.saveProjectOnUnload?.(state.project);});
