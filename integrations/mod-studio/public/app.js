import { api, jsonBody } from './api.js';
import { createPixelEditor, renderVoxelPreview } from './editor.js';
import { createBlockbenchProject, importBlockbenchProject } from './blockbench.js';

const $ = (selector) => document.querySelector(selector);
const projectList = $('#project-list');
const projectCount = $('#project-count');
const emptyState = $('#empty-state');
const workbench = $('#workbench');
const dialog = $('#new-project-dialog');
let project = null;
let selectedId = null;
let dirtyTimer;
let editor;
let previewRotation = 0;
let currentView = 'design';
let chatConnected = false;
let chatPlanEnabled = false;
let localModels = [];
let chatModels = [];
let selectedChatModel = null;
let currentSourcePath = null;
let timerActivityAt = Date.now();
let timerTickAt = null;
let timerSaveAt = Date.now();
let timerDirty = false;
let targetCatalog = null;

async function initialize() {
  wireShell();
  await refreshCapabilityLabel();
  await refreshProjects();
  const params = new URLSearchParams(location.search);
  const wanted = params.get('project');
  const projects = await api('/api/projects').catch(() => ({ projects: [] }));
  if (wanted && projects.projects.some((entry) => entry.id === wanted)) await selectProject(wanted);
  await refreshAuthStatus();
  setTimeout(() => checkForUpdates({ silent: true }), 1800);
}

function wireShell() {
  initializeBackgroundSettings();
  initializeSkin();
  $('#update-check-button').addEventListener('click', () => checkForUpdates());
  $('#close-update-dialog').addEventListener('click', () => $('#update-dialog').close());
  $('#close-update-button').addEventListener('click', () => $('#update-dialog').close());
  $('#install-update-button').addEventListener('click', installUpdate);
  $('#appearance-button').addEventListener('click', () => $('#appearance-dialog').showModal());
  document.querySelectorAll('input[name="background-style"]').forEach((input) => input.addEventListener('change', () => setBackgroundStyle(input.value)));
  $('#new-project-button').addEventListener('click', openNewProject);
  $('#empty-create-button').addEventListener('click', openNewProject);
  $('#add-first-element').addEventListener('click', () => addElement('item'));
  $('#add-element-button').addEventListener('click', () => addElement('item'));
  $('#add-block-button').addEventListener('click', () => addElement('block'));
  $('#delete-element-button').addEventListener('click', deleteSelectedElement);
  $('#new-project-form').addEventListener('submit', createProject);
  $('#cancel-dialog-button').addEventListener('click', () => dialog.close());
  $('#close-dialog-button').addEventListener('click', () => dialog.close());
  $('#export-button').addEventListener('click', exportProject);
  $('#blockbench-open-button').addEventListener('click', openBlockbench);
  $('#blockbench-import-button').addEventListener('click', () => $('#blockbench-file-input').click());
  $('#blockbench-file-input').addEventListener('change', importBlockbenchModel);
  $('#undo-button').addEventListener('click', () => editor?.undo());
  $('#redo-button').addEventListener('click', () => editor?.redo());
  $('#clear-canvas-button').addEventListener('click', () => editor?.clear());
  $('#rotate-preview-button').addEventListener('click', () => { previewRotation = (previewRotation + 1) % 4; drawPreview(); });
  $('#color-picker').addEventListener('input', (event) => { editor?.setColor(event.target.value); $('#color-swatch').style.background = event.target.value; });
  document.querySelectorAll('[data-tool]').forEach((button) => button.addEventListener('click', () => {
    document.querySelectorAll('[data-tool]').forEach((item) => item.classList.toggle('selected', item === button)); editor?.setTool(button.dataset.tool);
  }));
  document.querySelectorAll('.mode-tab').forEach((button) => button.addEventListener('click', () => showView(button.dataset.view)));
  $('#refresh-source-button').addEventListener('click', refreshSource);
  $('#code-output').addEventListener('input', () => {
    if (!project || !currentSourcePath?.endsWith('.java')) return;
    project.sourceOverrides[currentSourcePath] = $('#code-output').value;
    scheduleSave();
  });
  $('#loader-select').addEventListener('change', changeLoader);
  $('#version-select').addEventListener('change', changeTarget);
  $('#element-name').addEventListener('input', updateElementField);
  $('#element-identifier').addEventListener('input', updateElementField);
  $('#element-description').addEventListener('input', updateElementDescription);
  $('#account-button').addEventListener('click', connectChatGPT);
  $('#connect-chat-button').addEventListener('click', connectChatGPT);
  $('#send-chat-button').addEventListener('click', sendMessage);
  $('#ai-provider-select').addEventListener('change', refreshAiModelChoices);
  $('#ai-model-select').addEventListener('change', saveSelectedChatModel);
  $('#assistant-menu-button').addEventListener('click', openAiMemory);
  $('#close-memory-dialog').addEventListener('click', () => $('#ai-memory-dialog').close());
  $('#close-memory-dialog-footer').addEventListener('click', () => $('#ai-memory-dialog').close());
  $('#memory-form').addEventListener('submit', saveAiMemory);
  for (const eventName of ['pointerdown', 'keydown', 'input', 'wheel']) document.addEventListener(eventName, markTimerActivity, { passive: true });
  document.addEventListener('visibilitychange', handleTimerPause);
  window.addEventListener('blur', handleTimerPause);
  window.addEventListener('focus', () => { markTimerActivity(); refreshAuthStatus(); });
  setInterval(tickProjectTimer, 1000);
  $('#chat-input').addEventListener('keydown', (event) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); sendMessage(); } });
  document.querySelectorAll('[data-prompt]').forEach((button) => button.addEventListener('click', () => { $('#chat-input').value = button.dataset.prompt; $('#chat-input').focus(); }));
  $('#build-button').addEventListener('click', startBuild);
  document.addEventListener('keydown', (event) => {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') { event.preventDefault(); saveNow(); }
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); openNewProject(); }
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') { event.preventDefault(); editor?.undo(); }
  });
}

async function checkForUpdates({ silent = false } = {}) {
  const button = $('#update-check-button');
  const original = button.innerHTML;
  button.disabled = true;
  button.innerHTML = '<span aria-hidden="true">↻</span> Prüfe …';
  try {
    const result = await api('/api/updates');
    if (!result.updateAvailable) {
      if (!silent) toast(result.message || `Mod Studio ist aktuell (${result.currentVersion}).`);
      return;
    }
    $('#update-version').textContent = result.latestVersion;
    $('#update-notes').textContent = result.releaseNotes.trim() || 'Fehlerkorrekturen und Verbesserungen.';
    $('#update-dialog').showModal();
  } catch (error) {
    if (!silent) toast(error.message);
  } finally {
    button.disabled = false;
    button.innerHTML = original;
  }
}

async function installUpdate() {
  const button = $('#install-update-button');
  const original = button.innerHTML;
  button.disabled = true;
  button.textContent = 'Update wird geladen und geprüft …';
  try {
    const result = await api('/api/updates/install', { method: 'POST' });
    $('#update-dialog').close();
    toast(`Setup für ${result.version} wurde geprüft und gestartet. Folge den Installationsschritten.`);
  } catch (error) {
    toast(error.message);
  } finally {
    button.disabled = false;
    button.innerHTML = original;
  }
}

function initializeBackgroundSettings() {
  const prefersReducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
  let selected = prefersReducedMotion ? 'off' : 'orbs';
  let hasSavedPreference = false;
  try {
    const saved = localStorage.getItem('modstudio.background');
    if (saved) { selected = saved; hasSavedPreference = true; }
  } catch {}
  setBackgroundStyle(selected, false, hasSavedPreference);
}

function initializeSkin() {
  let skin = 'glass';
  try { skin = localStorage.getItem('modstudio.skin') || 'glass'; } catch {}
  // One-click switch in the top bar; the appearance dialog keeps the same choice.
  const actions = document.querySelector('.topbar-actions');
  if (actions && !document.getElementById('skin-toggle')) {
    const toggle = document.createElement('button');
    toggle.id = 'skin-toggle'; toggle.type = 'button'; toggle.className = 'icon-button skin-toggle';
    toggle.innerHTML = '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M10 2.5a7.5 7.5 0 1 0 0 15 7.5 7.5 0 0 0 0-15Z"/><path d="M10 2.5v15" /><path d="M10 6.5h5.8M10 10h7.5M10 13.5h5.8"/></svg>';
    toggle.addEventListener('click', () => setSkin(document.documentElement.dataset.skin === 'glass' ? 'workshop' : 'glass'));
    actions.prepend(toggle);
  }
  setSkin(skin, false);
  document.querySelectorAll('input[name="skin-style"]').forEach((input) => input.addEventListener('change', () => setSkin(input.value)));
}

function setSkin(skin, persist = true) {
  const selected = skin === 'glass' ? 'glass' : 'workshop';
  const apply = () => { document.documentElement.dataset.skin = selected; };
  if (persist && document.startViewTransition && !window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) document.startViewTransition(apply); else apply();
  document.querySelectorAll('input[name="skin-style"]').forEach((input) => { input.checked = input.value === selected; });
  const toggle = document.getElementById('skin-toggle');
  if (toggle) { const label = selected === 'glass' ? 'Zur Werkstatt-Oberfläche wechseln' : 'Zur Liquid-Glass-Oberfläche wechseln'; toggle.title = label; toggle.setAttribute('aria-label', label); toggle.setAttribute('aria-pressed', String(selected === 'glass')); }
  if (persist) { try { localStorage.setItem('modstudio.skin', selected); } catch { toast('Die Oberfläche konnte nicht lokal gespeichert werden.'); } }
}

function setBackgroundStyle(style, persist = true, allowReducedMotion = persist) {
  const supported = ['orbs', 'aurora', 'grid', 'crystal', 'flow', 'circuit', 'off'];
  const selected = supported.includes(style) ? style : 'orbs';
  document.documentElement.dataset.background = selected;
  document.documentElement.dataset.motionOverride = allowReducedMotion && selected !== 'off' ? 'true' : 'false';
  document.querySelectorAll('input[name="background-style"]').forEach((input) => { input.checked = input.value === selected; });
  if (persist) {
    try { localStorage.setItem('modstudio.background', selected); } catch { toast('Die Hintergrundeinstellung konnte nicht lokal gespeichert werden.'); }
  }
}

function openNewProject() { $('#project-name-input').value = 'Neues Mod-Projekt'; $('#project-description-input').value = ''; dialog.showModal(); $('#project-name-input').select(); }

async function createProject(event) {
  event.preventDefault();
  const name = $('#project-name-input').value.trim() || 'Neues Mod-Projekt';
  try {
    const result = await api('/api/projects', { method: 'POST', body: jsonBody({ name, description: $('#project-description-input').value.trim(), target: { loader: 'fabric', minecraftVersion: '26.2' } }) });
    dialog.close(); await refreshProjects(); await selectProject(result.project.id);
  } catch (error) { toast(error.message); }
}

async function refreshProjects() {
  const { projects } = await api('/api/projects');
  projectCount.textContent = String(projects.length);
  if (!projects.length) { projectList.innerHTML = '<p class="sidebar-empty">Deine Mods erscheinen hier.</p>'; return; }
  projectList.replaceChildren(...projects.map((item) => {
    const button = document.createElement('button'); button.type = 'button'; button.className = `project-link${item.id === selectedId ? ' active' : ''}`;
    button.innerHTML = `<span class="project-glyph">${escapeHtml(item.name.slice(0, 1).toUpperCase())}</span><span class="project-link-copy"><strong></strong><small></small></span><span class="project-link-count"></span>`;
    button.querySelector('strong').textContent = item.name; button.querySelector('small').textContent = `${formatDuration(item.timeSpentMs)} · ${item.target.loader} · ${item.target.minecraftVersion || 'Version wählen'}`; button.querySelector('.project-link-count').textContent = item.elementCount;
    button.addEventListener('click', () => selectProject(item.id)); return button;
  }));
}

async function selectProject(id) {
  try {
    if (project?.id === id) return;
    if (project && project.id !== id) { tickProjectTimer(); await saveNow(); }
    const result = await api(`/api/projects/${id}`); project = result.project; selectedId = id;
    timerTickAt = null; timerActivityAt = Date.now(); timerSaveAt = Date.now(); timerDirty = false; renderProjectTime();
    emptyState.hidden = true; workbench.hidden = false; $('#target-controls').hidden = false; $('#project-title').textContent = project.name;
    $('#loader-select').value = project.target.loader; renderVersionChoices(project.target.loader, project.target.minecraftVersion || targetCatalog?.defaultVersion || '26.2');
    $('#namespace-prefix').textContent = `${project.namespace}:`;
    renderChat(); renderElements(); await refreshProjects(); await refreshAiMemoryCount();
    if (editor) editor.destroy();
    editor = createPixelEditor($('#pixel-canvas'), project.elements.find((item) => item.id === project.activeElementId)?.texture || { size: 16, pixels: Array(256).fill(null) }, onTextureChange);
    renderPalette(); updateSelection();
    history.replaceState(null, '', `/?project=${encodeURIComponent(id)}`);
    setSaveStatus('Gespeichert');
  } catch (error) { toast(error.message); }
}

function selectedElement() { return project?.elements.find((item) => item.id === project.activeElementId) || null; }

async function addElement(kind) {
  if (!project) return;
  const count = project.elements.filter((item) => item.kind === kind).length;
  const element = { id: crypto.randomUUID(), kind, name: `${kind === 'block' ? 'Neuer Block' : 'Neues Item'}${count ? ` ${count + 1}` : ''}`, identifier: `${kind === 'block' ? 'new_block' : 'new_item'}${count ? `_${count + 1}` : ''}`, description: '', properties: kind === 'block' ? { hardness: 2, resistance: 3, requiresTool: false, luminance: 0 } : { maxStackSize: 64, fireResistant: false }, texture: { size: 16, pixels: Array(256).fill(null) }, recipes: [] };
  project.elements.push(element); project.activeElementId = element.id; renderElements(); updateSelection(); await saveNow();
  document.querySelector('.add-first-element').hidden = true;
}

function renderElements() {
  const tabs = $('#element-tabs'); const assets = $('#asset-list');
  tabs.replaceChildren(); assets.replaceChildren();
  for (const element of project.elements) {
    const tab = document.createElement('button'); tab.className = `element-tab${element.id === project.activeElementId ? ' active' : ''}`; tab.type = 'button'; tab.setAttribute('role', 'tab'); tab.textContent = `${element.kind === 'block' ? '▦' : '◇'} ${element.name}`;
    tab.addEventListener('click', async () => { project.activeElementId = element.id; editor.setTexture(element.texture); renderElements(); updateSelection(); await saveNow(); }); tabs.append(tab);
    const item = document.createElement('button'); item.type = 'button'; item.className = `asset-item${element.id === project.activeElementId ? ' active' : ''}`; item.innerHTML = '<canvas width="32" height="32"></canvas><span><strong></strong><small></small></span>';
    item.querySelector('strong').textContent = element.name; item.querySelector('small').textContent = `${element.kind} · ${element.identifier}`; paintThumbnail(item.querySelector('canvas'), element.texture.pixels); item.addEventListener('click', () => tab.click()); assets.append(item);
  }
  $('#asset-count').textContent = `${project.elements.length} ${project.elements.length === 1 ? 'Element' : 'Elemente'}`;
  $('#add-first-element').hidden = project.elements.length > 0;
}

async function deleteSelectedElement() {
  const element = selectedElement();
  if (!element || !window.confirm(`„${element.name}“ aus diesem Mod-Projekt entfernen?`)) return;
  project.elements = project.elements.filter((item) => item.id !== element.id);
  project.activeElementId = project.elements[0]?.id || null;
  renderElements();
  updateSelection();
  editor?.setTexture(selectedElement()?.texture || { size: 16, pixels: Array(256).fill(null) });
  await saveNow();
}

function updateSelection() {
  const element = selectedElement();
  $('#blockbench-actions').hidden = !element;
  $('#delete-element-button').hidden = !element;
  $('#selected-element-label').textContent = element ? `${element.kind === 'block' ? 'BLOCK' : 'ITEM'} / ${element.identifier}` : 'Noch kein Element';
  $('#element-inspector').hidden = !element; $('#element-name').value = element?.name || ''; $('#element-identifier').value = element?.identifier || ''; $('#element-description').value = element?.description || '';
  $('#item-properties').replaceChildren();
  if (element?.kind === 'item') {
    const label = document.createElement('label'); label.className = 'property-toggle'; label.innerHTML = '<span><strong>Stapelgröße</strong><small>Anzahl pro Inventar-Slot</small></span><input type="number" min="1" max="99" value="64">';
    label.querySelector('input').value = element.properties.maxStackSize; label.querySelector('input').addEventListener('change', (event) => { element.properties.maxStackSize = Math.max(1, Math.min(99, Number(event.target.value) || 64)); scheduleSave(); }); $('#item-properties').append(label);
    const fire = document.createElement('label'); fire.className = 'property-toggle'; fire.innerHTML = '<span><strong>Feuerfest</strong><small>Verbrennt nicht in Lava oder Feuer</small></span><input type="checkbox">';
    fire.querySelector('input').checked = Boolean(element.properties.fireResistant); fire.querySelector('input').addEventListener('change', (event) => { element.properties.fireResistant = event.target.checked; scheduleSave(); }); $('#item-properties').append(fire);
  } else if (element?.kind === 'block') {
    for (const [key, labelText, min, max] of [['hardness','Härte',0,100],['resistance','Sprengfestigkeit',0,1000],['luminance','Lichtstärke',0,15]]) {
      const label = document.createElement('label'); label.className = 'field-label compact'; label.textContent = labelText; const input = document.createElement('input'); input.type='number'; input.min=min; input.max=max; input.value=element.properties[key]; input.addEventListener('change',()=>{element.properties[key]=Math.max(min,Math.min(max,Number(input.value)||0));scheduleSave();}); label.append(input); $('#item-properties').append(label);
    }
  }
  drawPreview();
}

function updateElementField() {
  const element = selectedElement(); if (!element) return;
  element.name = $('#element-name').value.slice(0, 72);
  element.identifier = $('#element-identifier').value.toLowerCase().replace(/[^a-z0-9_.-]/g, '_').slice(0, 48);
  renderElements(); updateSelection(); scheduleSave();
}

function updateElementDescription() {
  const element = selectedElement();
  if (!element) return;
  element.description = $('#element-description').value.slice(0, 500);
  scheduleSave();
}

function onTextureChange(texture) { const element = selectedElement(); if (!element) return; element.texture = texture; drawPreview(); renderElements(); scheduleSave(); }
function drawPreview() { const element = selectedElement(); renderVoxelPreview($('#voxel-canvas'), element?.texture?.pixels || Array(256).fill(null), element, previewRotation); $('#preview-empty').hidden = Boolean(element && element.texture.pixels.some(Boolean)); $('#model-preview-caption').textContent = element?.javaModel?.elements?.length ? `Blockbench-Geometrie · ${element.javaModel.elements.length} Cubes` : 'Modellvorschau aus deiner Textur'; }
function renderPalette() {
  const palette = $('#palette'); palette.replaceChildren();
  for (const color of editor.getPalette()) { const button = document.createElement('button'); button.type='button'; button.className='palette-swatch'; button.style.background=color; button.setAttribute('aria-label',`Farbe ${color}`); button.addEventListener('click',()=>{editor.setColor(color);$('#color-picker').value=color;$('#color-swatch').style.background=color;}); palette.append(button); }
}
function paintThumbnail(canvas, pixels) { const ctx=canvas.getContext('2d'); const image=ctx.createImageData(16,16); pixels.forEach((color,index)=>{if(!color)return;const n=parseInt(color.slice(1,7),16),at=index*4;image.data[at]=(n>>16)&255;image.data[at+1]=(n>>8)&255;image.data[at+2]=n&255;image.data[at+3]=color.length===9?parseInt(color.slice(7,9),16):255;});ctx.putImageData(image,0,0); }

// Bumped on every local edit so a save response never overwrites edits made while it was in flight.
let editRevision=0;
function scheduleSave() { editRevision++; setSaveStatus('Änderungen …'); $('#download-jar-button').hidden=true; clearTimeout(dirtyTimer); dirtyTimer=setTimeout(saveNow,500); }
async function saveNow() {
  if (!project) return;
  clearTimeout(dirtyTimer);
  const projectId=project.id;const savedTime=project.timeSpentMs||0;const revision=editRevision;
  try { const saved=await api(`/api/projects/${projectId}`,{method:'PUT',body:jsonBody(project)});if(editRevision!==revision){setSaveStatus('Änderungen …');return;}if(project?.id===projectId){const elapsedDuringSave=Math.max(0,(project.timeSpentMs||0)-savedTime);project=saved.project;project.timeSpentMs+=elapsedDuringSave;timerDirty=elapsedDuringSave>0;renderProjectTime();}setSaveStatus('Gespeichert'); await refreshProjects(); }
  catch(error){setSaveStatus('Speichern fehlgeschlagen');toast(error.message);}
}
function setSaveStatus(value){$('#save-status').lastChild.textContent=value;}

function markTimerActivity(){timerActivityAt=Date.now();}
function handleTimerPause(){tickProjectTimer();timerTickAt=null;if(project&&timerDirty)void saveNow();}
function tickProjectTimer(){
  const now=Date.now();
  const active=Boolean(project&&document.visibilityState==='visible'&&document.hasFocus()&&now-timerActivityAt<5*60_000);
  if(active){
    if(timerTickAt){const elapsed=Math.max(0,Math.min(now-timerTickAt,2500));if(elapsed){project.timeSpentMs=(project.timeSpentMs||0)+elapsed;timerDirty=true;}}
    timerTickAt=now;
  }else timerTickAt=null;
  if($('#time-tracker'))$('#time-tracker').classList.toggle('is-running',active);
  renderProjectTime();
  if(timerDirty&&now-timerSaveAt>=60_000){timerSaveAt=now;void saveNow();}
}
function renderProjectTime(){const tracker=$('#time-tracker');if(!tracker)return;tracker.hidden=!project;$('#project-time').textContent=formatDuration(project?.timeSpentMs||0);}
function formatDuration(milliseconds){const minutes=Math.floor(Math.max(0,Number(milliseconds)||0)/60_000);if(minutes<60)return `${minutes} min`;const hours=Math.floor(minutes/60);const remainder=minutes%60;return `${hours}h ${String(remainder).padStart(2,'0')}m`;}

async function refreshCapabilityLabel(){try{targetCatalog=await api('/api/capabilities');const loader=$('#loader-select');const selected=project?.target.loader||targetCatalog.defaultLoader;loader.replaceChildren(...targetCatalog.loaders.map((item)=>{const option=document.createElement('option');option.value=item.id;option.textContent=`${item.label} · ${item.versions.length} Versionen`;option.disabled=item.versions.length===0;return option;}));loader.value=selected;if(project)renderVersionChoices(selected,project.target.minecraftVersion||targetCatalog.defaultVersion);updateTargetStatus();}catch{$('#target-status').textContent='VERSIONEN OFFLINE';$('#target-status').title='Die Versionsliste konnte nicht geladen werden. Bereits gespeicherte Projekte bleiben verfügbar.';}}
function renderVersionChoices(loaderId, preferredVersion){const loader=targetCatalog?.loaders.find((item)=>item.id===loaderId);const supported=[...(loader?.versions||[])].sort((a,b)=>b.localeCompare(a,undefined,{numeric:true}));const options=supported.map((value)=>{const option=document.createElement('option');option.value=value;option.textContent=value;return option;});if(preferredVersion&&!supported.includes(preferredVersion)){const saved=document.createElement('option');saved.value=preferredVersion;saved.textContent=`${preferredVersion} · für diesen Loader nicht gelistet`;saved.selected=true;options.unshift(saved);}$('#version-select').replaceChildren(...options);if(preferredVersion&&supported.includes(preferredVersion))$('#version-select').value=preferredVersion;else if(!preferredVersion&&supported.length)$('#version-select').value=supported[0];updateTargetStatus();}
async function changeLoader(){if(!project)return;const loader=$('#loader-select').value;const previousVersion=$('#version-select').value;const info=targetCatalog?.loaders.find((item)=>item.id===loader);const version=info?.versions.includes(previousVersion)?previousVersion:info?.versions[0];renderVersionChoices(loader,version);project.target.loader=loader;project.target.minecraftVersion=version||previousVersion;updateTargetStatus();await saveNow();}
async function changeTarget(){if(!project)return;project.target.loader=$('#loader-select').value;project.target.minecraftVersion=$('#version-select').value;updateTargetStatus();await saveNow();}
function updateTargetStatus(){const status=$('#target-status');if(!status||!targetCatalog)return;const loader=targetCatalog.loaders.find((item)=>item.id===$('#loader-select').value);const version=$('#version-select').value;const buildSupported=Boolean(loader?.buildVersions?.includes(version));const runtimeReady=Boolean(targetCatalog.runtime.ready);status.textContent=buildSupported?(runtimeReady?'BUILD BEREIT':'TOOLCHAIN FEHLT'):'BUILD-ADAPTER FEHLT';status.classList.toggle('ready',buildSupported&&runtimeReady);status.title=buildSupported?`Build-Unterstützung für ${loader.label} ${version}${runtimeReady?' ist bereit.':' ist vorhanden, die eingebettete Laufzeit fehlt.'}`:`${loader?.label||'Dieser Loader'} ${version||''} ist in der Versionsauswahl verfügbar. Der Generator baut aktuell nur Fabric 26.2; Quellprojekt und Skizzen bleiben trotzdem editierbar.`;}
function showView(view){currentView=view;document.querySelectorAll('.mode-tab').forEach((button)=>{button.classList.toggle('active',button.dataset.view===view);button.setAttribute('aria-selected',String(button.dataset.view===view));});$('#design-view').hidden=view!=='design';$('#code-view').hidden=view!=='code';$('#build-view').hidden=view!=='build';if(view==='code')refreshSource();if(view==='build')refreshBuildStatus();}

async function refreshSource(){if(!project)return;try{const result=await api(`/api/projects/${project.id}/files`);$('#file-list').replaceChildren();const pre=$('#code-output');for(const file of result.files){const button=document.createElement('button');button.className='file-button';button.textContent=file.path;button.addEventListener('click',()=>showSourceFile(file));$('#file-list').append(button);}if(result.files.length){const source=result.files.find((file)=>file.path.endsWith('ModEntry.java'))||result.files[0];showSourceFile(source);}}catch(error){toast(error.message);}}
function showSourceFile(file){const pre=$('#code-output');currentSourcePath=file.path;$('#open-file-label').textContent=file.path;const editable=file.path.endsWith('.java');pre.readOnly=!editable;pre.placeholder=editable?'Java-Quellcode wird hier gespeichert.':'Diese Datei wird vom Projektmodell erzeugt.';pre.value=editable?(project.sourceOverrides?.[file.path]??file.content??''):(file.content||'[Binärdatei: Textur]');}
async function exportProject(){if(!project)return;try{const response=await fetch(`/api/projects/${project.id}/source`);if(!response.ok)throw new Error('Das Quellprojekt konnte nicht exportiert werden.');const blob=await response.blob();const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=`${project.namespace}-source.zip`;a.click();URL.revokeObjectURL(url);toast('Quellprojekt exportiert.');}catch(error){toast(error.message);}}
function openBlockbench() {
  const element = selectedElement();
  if (!element) return toast('Wähle zuerst ein Item oder einen Block aus.');
  const projectFile = createBlockbenchProject(element, textureDataUrl(element.texture.pixels));
  downloadText(`${element.identifier}.bbmodel`, JSON.stringify(projectFile, null, 2), 'application/json');
  window.open('https://web.blockbench.net/', '_blank', 'noopener,noreferrer');
  toast('Blockbench-Projekt gespeichert. Ziehe die .bbmodel-Datei in den Blockbench-Tab.');
}
async function importBlockbenchModel(event) {
  const file = event.target.files?.[0];
  event.target.value = '';
  if (!file || !project || !selectedElement()) return;
  try {
    if (file.size > 1024 * 1024) throw new Error('Die Blockbench-Datei ist größer als 1 MB.');
    let imported = JSON.parse(await file.text());
    let texturePixels = null;
    if (/\.bbmodel$/i.test(file.name) || imported.meta?.model_format) {
      const result = importBlockbenchProject(imported);
      imported = result.javaModel;
      if (result.textureSource) texturePixels = await textureFromDataUrl(result.textureSource);
    }
    const nextProject = structuredClone(project);
    const element = nextProject.elements.find((entry) => entry.id === nextProject.activeElementId);
    element.javaModel = imported;
    if (texturePixels) element.texture = { size: 16, pixels: texturePixels };
    const saved = await api(`/api/projects/${project.id}`, { method: 'PUT', body: jsonBody(nextProject) });
    project = saved.project;
    renderElements();
    updateSelection();
    await refreshProjects();
    setSaveStatus('Gespeichert');
    toast(`Blockbench-Modell übernommen: ${element.javaModel.elements?.length || 0} Cubes. Es wird beim nächsten Build verwendet.`);
  } catch (error) {
    toast(error.message || 'Das Blockbench-Modell konnte nicht importiert werden.');
  }
}
function textureDataUrl(pixels) {
  const canvas = document.createElement('canvas');
  canvas.width = 16; canvas.height = 16;
  const context = canvas.getContext('2d');
  const image = context.createImageData(16, 16);
  pixels.forEach((color, index) => {
    if (!color) return;
    const rgb = Number.parseInt(color.slice(1, 7), 16); const at = index * 4;
    image.data[at] = (rgb >> 16) & 255; image.data[at + 1] = (rgb >> 8) & 255; image.data[at + 2] = rgb & 255; image.data[at + 3] = color.length === 9 ? Number.parseInt(color.slice(7, 9), 16) : 255;
  });
  context.putImageData(image, 0, 0);
  return canvas.toDataURL('image/png');
}
async function textureFromDataUrl(source) {
  if (typeof source !== 'string' || !source.startsWith('data:image/')) throw new Error('Die eingebettete Blockbench-Textur kann nicht gelesen werden.');
  const image = new Image();
  image.src = source;
  await image.decode();
  if (image.naturalWidth !== 16 || image.naturalHeight !== 16) throw new Error('Die Blockbench-Textur muss 16 × 16 Pixel groß sein.');
  const canvas = document.createElement('canvas'); canvas.width = 16; canvas.height = 16;
  const context = canvas.getContext('2d', { willReadFrequently: true }); context.drawImage(image, 0, 0);
  const rgba = context.getImageData(0, 0, 16, 16).data;
  const pixels = Array.from({ length: 256 }, (_, index) => {
    const offset = index * 4; const red = rgba[offset], green = rgba[offset + 1], blue = rgba[offset + 2], alpha = rgba[offset + 3];
    if (alpha === 0) return null;
    return `#${[red, green, blue].map((value) => value.toString(16).padStart(2, '0')).join('')}${alpha === 255 ? '' : alpha.toString(16).padStart(2, '0')}`.toUpperCase();
  });
  return pixels;
}
function downloadText(name, content, type) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const link = document.createElement('a');
  link.href = url; link.download = name; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
async function refreshBuildStatus(){if(!project)return;try{const status=await api(`/api/projects/${project.id}/build`);$('#build-requirements').textContent=status.message;$('#build-button').disabled=!status.ready;const download=$('#download-jar-button');download.hidden=!status.artifactAvailable;if(status.artifactAvailable){download.href=`/api/projects/${project.id}/artifact`;download.download=status.artifactName;}}catch(error){$('#build-requirements').textContent=error.message;}}
async function startBuild(){await refreshBuildStatus();if($('#build-button').disabled){toast('Dieses Ziel ist noch nicht als vollständig baubar freigeschaltet.');return;}const button=$('#build-button'),log=$('#build-log'),download=$('#download-jar-button');button.disabled=true;download.hidden=true;log.replaceChildren();log.textContent='Build startet …\n';try{const response=await fetch(`/api/projects/${project.id}/build`,{method:'POST'});if(!response.ok){const error=await response.json().catch(()=>({}));throw new Error(error.error||'Build fehlgeschlagen.');}const reader=response.body.getReader();const decoder=new TextDecoder();let buffer='';while(true){const {value,done}=await reader.read();if(done)break;buffer+=decoder.decode(value,{stream:true});const events=buffer.split('\n\n');buffer=events.pop()||'';for(const raw of events){const event=raw.match(/^event: (.+)$/m)?.[1];const data=raw.split('\n').find(line=>line.startsWith('data: '))?.slice(6);if(!event||!data)continue;const payload=JSON.parse(data);if(event==='log'){log.append(document.createTextNode(payload.text));log.scrollTop=log.scrollHeight;}if(event==='complete'){log.append(document.createTextNode(payload.ok?'\nBUILD ERFOLGREICH':'\nBUILD FEHLGESCHLAGEN'));if(payload.ok&&payload.artifact){download.href=`/api/projects/${project.id}/artifact`;download.download=payload.filename;download.hidden=false;}toast(payload.ok?'Mod erfolgreich gebaut.':'Der Build ist fehlgeschlagen. Sieh dir die Ausgabe an.');}}}}catch(error){log.append(document.createTextNode(`\n${error.message}`));toast(error.message);}finally{button.disabled=false;await refreshBuildStatus();}}

async function connectChatGPT(){try{const result=await api('/api/auth/start',{method:'POST',body:'{}'});if(result.authorizationUrl){$('#assistant-state').textContent='Freigabe im Browser';}else{await refreshAuthStatus();toast('ChatGPT ist bereits verbunden.');}}catch(error){toast(error.message);}}
async function refreshAuthStatus(){try{const [status,providers]=await Promise.all([api('/api/auth/status'),api('/api/ai/providers')]);chatConnected=Boolean(status.connected);chatPlanEnabled=Boolean(status.planUsageEnabled);localModels=providers.ollama?.models||[];$('#account-label').textContent=status.label;$('#account-detail').textContent=localModels.length?`${localModels.length} lokale Ollama-Modelle verfügbar`:status.detail;const provider=$('#ai-provider-select');provider.querySelector('[value="chatgpt"]').disabled=!chatPlanEnabled;provider.querySelector('[value="ollama"]').disabled=!localModels.length;if(!provider.value||(!chatPlanEnabled&&!localModels.length)){provider.value='chatgpt';}else if(provider.value==='chatgpt'&&!chatPlanEnabled&&localModels.length){provider.value='ollama';}const nudge=$('#auth-nudge');nudge.querySelector('p').textContent=chatConnected&&!chatPlanEnabled?'Konto erkannt. Gib die ChatGPT-Plan-Nutzung einmal frei, um Modelle zu laden und auszuwählen.':'Verbinde ChatGPT oder nutze Ollama mit einem lokal installierten Modell.';nudge.querySelector('button').textContent=chatConnected&&!chatPlanEnabled?'ChatGPT-Plan freigeben':'ChatGPT verbinden';$('#manage-chatgpt-usage').hidden=!chatPlanEnabled;await refreshAiModelChoices();}catch{}}
async function refreshAiModelChoices(){const provider=$('#ai-provider-select').value;const modelSelect=$('#ai-model-select');let models=[];if(provider==='ollama')models=localModels;else if(chatPlanEnabled){try{const result=await api('/api/auth/models');chatModels=result.models||[];selectedChatModel=result.selectedModel||null;models=chatModels;}catch{models=chatModels;}}modelSelect.replaceChildren(...models.map((model)=>{const option=document.createElement('option');option.value=provider==='ollama'?(model.name||model.id):model.id;const size=model.size?` · ${(model.size/1_000_000_000).toFixed(1)} GB`:'';option.textContent=`${model.name||model.id}${size}`;return option;}));if(!models.length){const option=document.createElement('option');option.value='';option.textContent=provider==='ollama'?'Kein lokales Modell verfügbar':chatConnected?'ChatGPT-Plan freigeben, um Modelle zu laden':'Modelle nach der Verbindung verfügbar';modelSelect.append(option);}if(provider==='chatgpt'&&selectedChatModel)modelSelect.value=selectedChatModel;modelSelect.disabled=!models.length;const ready=provider==='ollama'?localModels.length>0:chatPlanEnabled;$('#assistant-state').textContent=ready?(provider==='ollama'?`Ollama lokal · ${modelSelect.value||'Modell bereit'}`:'ChatGPT-Plan aktiv · Modell wählbar'):'lokale Vorschau';$('#assistant-dot').style.background=ready?'#c6ff4a':'#747b7d';$('#auth-nudge').hidden=ready;$('#chat-input').disabled=!ready;$('#send-chat-button').disabled=!ready;}
async function saveSelectedChatModel(){if($('#ai-provider-select').value!=='chatgpt'||!chatPlanEnabled)return;const model=$('#ai-model-select').value;if(!model)return;try{const result=await api('/api/auth/model',{method:'PUT',body:JSON.stringify({model})});selectedChatModel=result.selectedModel;toast('ChatGPT-Modell gespeichert.');}catch(error){await refreshAiModelChoices();toast(error.message);}}
async function sendMessage(){
  const input=$('#chat-input');const content=input.value.trim();if(!project||!content)return;const provider=$('#ai-provider-select').value;const model=$('#ai-model-select').value;if(provider==='chatgpt'&&!chatConnected||provider==='ollama'&&!localModels.length){toast('Wähle einen verfügbaren KI-Anbieter aus.');return;}input.value='';$('#send-chat-button').disabled=true;addChatMessage('user',content);project.conversation.push({role:'user',content,createdAt:new Date().toISOString()});await saveNow();const pending=addChatMessage('assistant',provider==='ollama'?'Lokales Modell arbeitet …':'Mod-Vorschlag wird erstellt …');pending.classList.add('streaming');try{const response=await fetch(`/api/projects/${project.id}/ai`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({message:content,provider,model})});if(!response.ok){const error=await response.json().catch(()=>({}));throw new Error(error.error||'KI-Anfrage fehlgeschlagen.');}const reader=response.body.getReader();const decoder=new TextDecoder();let buffer='';let candidate=null;while(true){const {value,done}=await reader.read();if(done)break;buffer+=decoder.decode(value,{stream:true});const events=buffer.split('\n\n');buffer=events.pop()||'';for(const raw of events){const eventName=raw.match(/^event: (.+)$/m)?.[1];const data=raw.split('\n').find(line=>line.startsWith('data: '))?.slice(6);if(!data)continue;const payload=JSON.parse(data);if(eventName==='candidate')candidate=payload;if(eventName==='learned'){const count=payload.rules?.length||0;toast(count===1?'Eine dauerhafte Arbeitsregel wurde lokal gespeichert.':`${count} dauerhafte Arbeitsregeln wurden lokal gespeichert.`);refreshAiMemoryCount();}if(eventName==='error')throw new Error(payload.message||'KI-Anfrage fehlgeschlagen.');}}pending.classList.remove('streaming');if(candidate){pending.querySelector('p').textContent=candidate.message;const changed=projectDesignChanged(candidate.project,project);if(!changed){project.conversation=candidate.project.conversation;await saveNow();}showCandidate(pending,candidate.project,changed);}else throw new Error('Die Antwort wurde vor dem Abschluss unterbrochen.');}catch(error){pending.classList.remove('streaming');pending.querySelector('p').textContent=error.message;toast(error.message);}finally{$('#send-chat-button').disabled=$('#chat-input').disabled;}
}
function projectDesignChanged(candidate,current){
  return ['name','namespace','description','target','elements','sourceOverrides'].some(key=>JSON.stringify(candidate?.[key]??null)!==JSON.stringify(current?.[key]??null));
}
function showCandidate(messageNode,candidate,hasChanges=projectDesignChanged(candidate,project)){
  if(!hasChanges){
    if(/[?？]/u.test(messageNode.querySelector('p')?.textContent||''))showQuestionAnswer(messageNode);
    return;
  }
  const details=document.createElement('div');details.className='candidate-actions';
  const changedCount=candidate.elements.filter(element=>{const previous=project.elements.find(item=>item.id===element.id);return !previous||JSON.stringify(previous)!==JSON.stringify(element)}).length+project.elements.filter(element=>!candidate.elements.some(item=>item.id===element.id)).length;
  const summary=document.createElement('span');summary.textContent=`Vorschlag: ${changedCount} ${changedCount===1?'Mod-Element':'Mod-Elemente'} geändert`;
  const apply=document.createElement('button');apply.type='button';apply.className='candidate-apply';apply.textContent='Übernehmen';
  const discard=document.createElement('button');discard.type='button';discard.className='candidate-discard';discard.textContent='Verwerfen';
  apply.addEventListener('click',async()=>{try{const saved=await api(`/api/projects/${project.id}/ai`,{method:'PUT',body:JSON.stringify({project:candidate})});project=saved.project;editor?.destroy();renderElements();editor=createPixelEditor($('#pixel-canvas'),selectedElement()?.texture||{size:16,pixels:Array(256).fill(null)},onTextureChange);renderPalette();updateSelection();renderChat();await saveNow();toast('KI-Vorschlag übernommen.');}catch(error){toast(error.message);}});
  discard.addEventListener('click',()=>{details.replaceChildren(summary,document.createTextNode(' · Vorschlag verworfen'));});
  details.append(summary,apply,discard);messageNode.append(details);
}
function showQuestionAnswer(messageNode){
  const form=document.createElement('form');form.className='candidate-question';
  const label=document.createElement('label');label.textContent='Antwort auf die Rückfrage';
  const input=document.createElement('input');input.type='text';input.name='answer';input.autocomplete='off';input.maxLength=1000;input.placeholder='Deine Antwort …';input.setAttribute('aria-label','Antwort auf die Rückfrage');
  const submit=document.createElement('button');submit.type='submit';submit.textContent='Antwort senden';
  form.addEventListener('submit',event=>{event.preventDefault();const answer=input.value.trim();if(!answer)return;if($('#send-chat-button').disabled){toast('Verbinde zuerst einen KI-Anbieter.');return;}form.remove();$('#chat-input').value=answer;void sendMessage();});
  form.append(label,input,submit);messageNode.append(form);input.focus({preventScroll:true});
}function addChatMessage(role,content){const list=$('#chat-messages');const node=document.createElement('div');node.className=`chat-message ${role}`;const label=role==='user'?'DU':'MOD-ASSISTENT';node.innerHTML=`<span class="message-role">${label}</span><p></p>`;node.querySelector('p').textContent=content;if(role==='user'){const remember=document.createElement('button');remember.type='button';remember.className='remember-message';remember.textContent='Als Regel merken';remember.addEventListener('click',()=>{openAiMemory();$('#memory-input').value=content;$('#memory-scope').value='project';$('#memory-input').focus();});node.append(remember);}list.append(node);list.scrollTop=list.scrollHeight;return node;}
function renderChat(){const list=$('#chat-messages');list.querySelectorAll('.chat-message').forEach((item)=>item.remove());for(const message of project.conversation||[])addChatMessage(message.role,message.content);}
async function openAiMemory(){if(!project){toast('Öffne zuerst ein Mod-Projekt.');return;}$('#memory-scope').value='global';$('#ai-memory-dialog').showModal();await refreshAiMemory();}
async function refreshAiMemory(){if(!project)return;try{const result=await api(`/api/ai/memory?project=${encodeURIComponent(project.id)}`);const list=$('#memory-list');list.replaceChildren();const rules=result.rules||[];$('#memory-count').textContent=String(rules.length);$('#memory-list-count').textContent=String(rules.length);if(!rules.length){const empty=document.createElement('p');empty.className='memory-empty';empty.textContent='Noch keine Regeln gespeichert. Der Assistent merkt sich klare dauerhafte Vorlieben automatisch; du kannst Regeln hier hinzufügen.';list.append(empty);return;}for(const rule of rules){const row=document.createElement('div');row.className='memory-row';const copy=document.createElement('div');copy.className='memory-copy';const text=document.createElement('p');text.textContent=rule.text;const scope=document.createElement('small');scope.textContent=rule.scope==='global'?'Alle Mod-Projekte':'Dieses Projekt';copy.append(text,scope);const remove=document.createElement('button');remove.type='button';remove.className='memory-remove';remove.textContent='Löschen';remove.addEventListener('click',async()=>{try{await api(`/api/ai/memory?id=${encodeURIComponent(rule.id)}&project=${encodeURIComponent(project.id)}`,{method:'DELETE'});await refreshAiMemory();}catch(error){toast(error.message);}});row.append(copy,remove);list.append(row);}}catch(error){toast(`Gedächtnis konnte nicht geladen werden: ${error.message}`);}}
async function refreshAiMemoryCount(){if(!project)return;try{const result=await api(`/api/ai/memory?project=${encodeURIComponent(project.id)}`);$('#memory-count').textContent=String(result.rules?.length||0);}catch{}}
async function saveAiMemory(event){event.preventDefault();if(!project)return;const text=$('#memory-input').value.trim();const projectId=$('#memory-scope').value==='project'?project.id:null;if(!text){toast('Schreibe zuerst eine kurze Regel.');return;}try{await api('/api/ai/memory',{method:'POST',body:JSON.stringify({text,projectId})});$('#memory-input').value='';await refreshAiMemory();toast('Arbeitsregel lokal gespeichert.');}catch(error){toast(error.message);}}
function toast(message){const region=$('#toast-region');const item=document.createElement('div');item.className='toast';item.textContent=message;region.append(item);setTimeout(()=>item.remove(),3800);}
function escapeHtml(text){const div=document.createElement('div');div.textContent=text;return div.innerHTML;}

initialize().catch((error)=>toast(error.message));
