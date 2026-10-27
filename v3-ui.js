'use strict';

(function () {
  const STORAGE = Object.freeze({ style: 'mw-ui-v3-style', scene: 'mw-ui-v3-scene' });
  const SCENES = Object.freeze([
    { id: 'deep-dark', name: 'Ancient City', en: 'Ancient City', note: 'Sculk · Tiefenblau', noteEn: 'Sculk · deep blue', image: 'assets/shader-aurora-lake.webp', accent: '#58dfd6' },
    { id: 'lush-caves', name: 'Lush Caves', en: 'Lush Caves', note: 'Sporen · Mooslicht', noteEn: 'Spores · moss light', image: 'assets/biome-deep-forest.svg', accent: '#9adc8c' },
    { id: 'nether', name: 'Nether Fortress', en: 'Nether Fortress', note: 'Basalt · Glutrot', noteEn: 'Basalt · ember red', image: 'assets/biome-nether-forge.svg', accent: '#ff8564' },
    { id: 'cherry', name: 'Kirschblütenhain', en: 'Cherry Grove', note: 'Abendrosa · Nebel', noteEn: 'Dusk pink · mist', image: 'assets/shader-cherry-grove.webp', accent: '#f39cc1' },
    { id: 'end', name: 'End Void', en: 'End Void', note: 'Amethyst · Leere', noteEn: 'Amethyst · the void', image: 'assets/shader-crystal-valley.webp', accent: '#ae91ff' },
    { id: 'aurora', name: 'Aurora-See', en: 'Aurora Lake', note: 'Sternenlicht · Cyan', noteEn: 'Starlight · cyan', image: 'assets/shader-aurora-lake.webp', accent: '#55c9f3' }
  ]);
  const PALETTES = Object.freeze({
    pro: { accent: '#69dce9', accentSoft: 'rgba(105,220,233,.13)', bg: '#09121b', rail: '#0c1721', canvas: '#0d1822', card: '#14212c', inset: '#101c27', line: '#2b3d4b', ink: '#eff7fb', muted: '#a3b6c3', green: '#71d5aa', red: '#ff8f95' },
    'deep-dark': { accent: '#58dfd6', accentSoft: 'rgba(88,223,214,.15)', bg: '#07141c', rail: 'rgba(7,18,27,.92)', canvas: 'rgba(10,23,33,.89)', card: 'rgba(17,33,43,.88)', inset: 'rgba(13,28,39,.88)', line: 'rgba(103,217,220,.34)', ink: '#f0ffff', muted: '#afc9cf', green: '#8de5b7', red: '#ff9c9e' },
    'lush-caves': { accent: '#9adc8c', accentSoft: 'rgba(154,220,140,.15)', bg: '#0b1715', rail: 'rgba(12,26,22,.91)', canvas: 'rgba(12,27,23,.89)', card: 'rgba(20,39,32,.88)', inset: 'rgba(16,33,28,.88)', line: 'rgba(159,220,150,.33)', ink: '#f0fff1', muted: '#b6cbbb', green: '#a3e5a2', red: '#ff9e9a' },
    nether: { accent: '#ff8564', accentSoft: 'rgba(255,133,100,.16)', bg: '#1a0e16', rail: 'rgba(30,15,21,.93)', canvas: 'rgba(31,18,24,.91)', card: 'rgba(44,26,32,.88)', inset: 'rgba(36,21,28,.89)', line: 'rgba(255,142,103,.32)', ink: '#fff5f0', muted: '#d5b6b1', green: '#8be0a8', red: '#ff967c' },
    cherry: { accent: '#f39cc1', accentSoft: 'rgba(243,156,193,.15)', bg: '#17121d', rail: 'rgba(28,20,31,.91)', canvas: 'rgba(30,21,34,.9)', card: 'rgba(43,30,47,.87)', inset: 'rgba(35,25,40,.88)', line: 'rgba(245,171,210,.32)', ink: '#fff4fa', muted: '#d1bdca', green: '#8eddb5', red: '#ff94a8' },
    end: { accent: '#ae91ff', accentSoft: 'rgba(174,145,255,.16)', bg: '#100e1d', rail: 'rgba(20,17,34,.93)', canvas: 'rgba(20,17,35,.9)', card: 'rgba(34,28,54,.88)', inset: 'rgba(27,23,45,.89)', line: 'rgba(182,156,255,.34)', ink: '#f7f3ff', muted: '#c1b7d8', green: '#7ce2bd', red: '#ff91a9' },
    aurora: { accent: '#55c9f3', accentSoft: 'rgba(85,201,243,.15)', bg: '#0b1421', rail: 'rgba(11,21,34,.92)', canvas: 'rgba(12,23,37,.9)', card: 'rgba(19,34,51,.88)', inset: 'rgba(15,29,46,.89)', line: 'rgba(111,204,240,.33)', ink: '#f2f9ff', muted: '#b3c5d6', green: '#79ddac', red: '#ff919f' }
  });
  const $ = (selector, root = document) => root.querySelector(selector);
  const all = (selector, root = document) => [...root.querySelectorAll(selector)];
  const english = () => (window.workshopI18n?.locale || 'de').startsWith('en');
  const safe = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  let bridge = {};

  const COPY = {
    de: { eyebrow:'MODPACK STUDIO · UI 03', title:'Deine nächste Welt beginnt hier.', subtitle:'Plane dein Pack, entdecke passende Mods und behalte Version und Auswahl im Blick.', chat:'Pack-Assistent', mods:'Mods entdecken', pack:'AKTIVES MODPACK', composition:'Deine Pack-Zusammenstellung', browse:'Katalog öffnen →', modsInstalled:'Mods ausgewählt', minecraftVersion:'Minecraft-Version', modLoader:'Mod-Loader', categoryLegend:'Mods nach Themenbereich', readiness:'PACK-CHECK', packCheck:'Alles im Blick', readinessCopy:'Dein Projekt bleibt lokal und lässt sich jederzeit weiterbearbeiten.', checkSelected:'Ausgewählte Mods', checkLoader:'Spielversion & Loader', checkDependencies:'Abhängigkeiten', whenTesting:'Beim Testlauf', tools:'Pack-Labor öffnen', recentSelection:'AUS DEINER AUSWAHL', selectedMods:'Zuletzt hinzugefügt', emptyTitle:'Dein Pack ist startklar', emptyCopy:'Entdecke Mods oder lass den Pack-Assistenten eine Basis zusammenstellen.', findFirst:'Erste Mods finden →', localHistory:'LOKALE SICHERUNGEN', snapshots:'Pack-Stände', export:'Projekt exportieren', quick:'SCHNELLSTART', appearance:'Design', noSnapshots:'Noch keine Sicherungen. Lege einen Stand an, bevor du größere Änderungen machst.', noMods:'Noch keine Mods ausgewählt.' },
    en: { eyebrow:'MODPACK STUDIO · UI 03', title:'Your next world starts here.', subtitle:'Plan your pack, discover matching mods, and keep its version and selection in view.', chat:'Pack assistant', mods:'Discover mods', pack:'ACTIVE MODPACK', composition:'Your pack composition', browse:'Open catalog →', modsInstalled:'Mods selected', minecraftVersion:'Minecraft version', modLoader:'Mod loader', categoryLegend:'Mods by category', readiness:'PACK CHECK', packCheck:'Everything in view', readinessCopy:'Your project stays local and is ready to edit whenever you are.', checkSelected:'Selected mods', checkLoader:'Game version & loader', checkDependencies:'Dependencies', whenTesting:'When testing', tools:'Open pack lab', recentSelection:'FROM YOUR SELECTION', selectedMods:'Recently added', emptyTitle:'Your pack is ready', emptyCopy:'Discover mods or ask the Pack Assistant to build a foundation.', findFirst:'Find your first mods →', localHistory:'LOCAL SNAPSHOTS', snapshots:'Pack snapshots', export:'Export project', quick:'QUICK START', appearance:'Appearance', noSnapshots:'No snapshots yet. Save one before making larger changes.', noMods:'No mods selected yet.' }
  };
  const copy = key => COPY[english() ? 'en' : 'de'][key] || '';

  function bindDashboard() {
    const dashboard = $('#v3-dashboard');
    if (!dashboard || dashboard.dataset.bound) return;
    dashboard.dataset.bound = 'true';
    dashboard.addEventListener('click', event => {
      const action = event.target.closest('[data-v3-action]')?.dataset.v3Action;
      if (action === 'chat' || action === 'mods' || action === 'lab') bridge.navigate?.(action);
      else if (action === 'design') bridge.openDesign?.();
      else if (action === 'snapshot') { bridge.snapshot?.(); renderDashboard(); }
      else if (action === 'export') bridge.exportProject?.();
    });
  }

  function renderDashboard() {
    bindDashboard();
    const dashboard = $('#v3-dashboard');
    if (!dashboard) return;
    dashboard.querySelectorAll('[data-v3-copy]').forEach(node => node.textContent = copy(node.dataset.v3Copy));
    const project = bridge.getProject?.();
    if (!project) return;
    const mods = Array.isArray(project.mods) ? project.mods : [];
    const buckets = [
      { label: english() ? 'Explore' : 'Erkundung', match:/explor|biome|worldgen|dimension|structure|world|adventure/i, count:0 },
      { label: english() ? 'Combat' : 'Kampf', match:/combat|weapon|boss|battle|armor|damage/i, count:0 },
      { label: english() ? 'Technology' : 'Technik', match:/tech|automat|machine|energy|create|storage/i, count:0 },
      { label: english() ? 'Visuals' : 'Optik', match:/visual|shader|light|ambient|texture|resource|effect/i, count:0 },
      { label: english() ? 'Other' : 'Sonstiges', match:/.*/i, count:0 }
    ];
    mods.forEach(mod => { const text = (mod.title || '') + ' ' + (mod.categories || []).join(' ') + ' ' + (mod.description || ''); const found = buckets.find((item,index) => index < buckets.length - 1 && item.match.test(text)); (found || buckets[buckets.length - 1]).count++; });
    $('#v3-mod-count').textContent = String(mods.length);
    $('#v3-check-mods').textContent = String(mods.length);
    $('#v3-selected-count').textContent = String(mods.length);
    $('#v3-version-value').textContent = project.minecraftVersion || '—';
    $('#v3-loader-value').textContent = String(project.loader || '—').replace(/^./, value => value.toUpperCase());
    $('#v3-check-loader').textContent = (project.minecraftVersion || '—') + ' · ' + String(project.loader || '—').replace(/^./, value => value.toUpperCase());
    $('#v3-chart-total').textContent = mods.length + ' ' + (english() ? 'mods' : 'Mods');
    const max = Math.max(1, ...buckets.map(item => item.count));
    $('#v3-category-chart').replaceChildren(...buckets.map(bucket => {
      const column = document.createElement('button'); column.type = 'button'; column.className = 'v3-chart-column';
      column.title = bucket.label + ': ' + bucket.count; column.setAttribute('aria-label', column.title);
      column.innerHTML = '<span class="v3-chart-bar ' + (bucket.count ? 'has-value' : '') + '" style="--v3-bar:' + Math.max(7, bucket.count / max * 100) + '%"></span><strong>' + bucket.count + '</strong><small>' + safe(bucket.label) + '</small>';
      column.addEventListener('click', () => bridge.navigate?.('mods')); return column;
    }));
    const recent = mods.slice(-5).reverse();
    const modList = $('#v3-mod-list');
    modList.replaceChildren(...recent.map(mod => {
      const row = document.createElement('button'); row.type = 'button'; row.className = 'v3-mod-row';
      const icon = mod.icon ? '<img src="' + safe(mod.icon) + '" alt="" loading="lazy">' : '<span class="v3-mod-fallback" aria-hidden="true">⬡</span>';
      row.innerHTML = icon + '<span class="v3-mod-copy"><strong>' + safe(mod.title || (english() ? 'Unnamed mod' : 'Unbenannte Mod')) + '</strong><small>' + safe(mod.source || 'Modrinth') + ' · ' + safe(mod.dependency ? (english() ? 'Dependency' : 'Abhängigkeit') : (english() ? 'In your pack' : 'Im Pack')) + '</small></span><span class="v3-mod-chevron" aria-hidden="true">›</span>';
      row.addEventListener('click', () => bridge.openMod?.(mod)); return row;
    }));
    modList.hidden = mods.length === 0; $('#v3-mod-empty').hidden = mods.length > 0;
    const snapshots = (project.snapshots || []).slice(-3).reverse();
    const snapshotList = $('#v3-snapshot-list');
    if (snapshots.length) snapshotList.replaceChildren(...snapshots.map((item,index) => {
      const row = document.createElement('div'); row.className = 'v3-snapshot-row';
      const stamp = new Date(item.createdAt || Date.now()).toLocaleString(english() ? 'en-US' : 'de-DE', { month:'short', day:'numeric', hour:'2-digit', minute:'2-digit' });
      row.innerHTML = '<span class="v3-timeline-dot ' + (index === 0 ? 'current' : '') + '"></span><span><strong>' + safe(item.name || copy('snapshots')) + '</strong><small>' + safe(stamp) + ' · ' + (Number(item.mods) || 0) + ' ' + (english() ? 'mods' : 'Mods') + '</small></span>'; return row;
    }));
    else snapshotList.innerHTML = '<p class="v3-no-snapshots">' + safe(copy('noSnapshots')) + '</p>';
  }

  function setPalette(style, scene) {
    const key = style === 'pro' ? 'pro' : (SCENES.some(item => item.id === scene) ? scene : 'deep-dark');
    const palette = PALETTES[key];
    for (const [name, value] of Object.entries(palette)) {
      document.documentElement.style.setProperty(`--v3-${name}`, value);
      if (bridge.getMode?.() === 'v3' && ['accent', 'accentSoft', 'bg', 'rail', 'canvas', 'card', 'inset', 'line', 'ink', 'muted', 'green', 'red'].includes(name)) {
        document.documentElement.style.setProperty(`--modern-${name}`, value);
      }
    }
    const selected = SCENES.find(item => item.id === scene) || SCENES[0];
    document.documentElement.style.setProperty('--v3-scene-image', style === 'world' ? `url("${selected.image}")` : 'none');
    document.documentElement.style.setProperty('--v3-scene-accent', style === 'world' ? selected.accent : PALETTES.pro.accent);
  }

  function render() {
    const style = localStorage.getItem(STORAGE.style) === 'world' ? 'world' : 'pro';
    const scene = SCENES.some(item => item.id === localStorage.getItem(STORAGE.scene)) ? localStorage.getItem(STORAGE.scene) : 'deep-dark';
    document.body.dataset.v3Style = style;
    document.body.dataset.v3Scene = scene;
    setPalette(style, scene);
    const controlPanel = $('#v3-appearance');
    if (controlPanel) controlPanel.hidden = bridge.getMode?.() !== 'v3';
    all('[data-v3-style-choice]').forEach(button => {
      const active = button.dataset.v3StyleChoice === style;
      button.classList.toggle('active', active);
      button.setAttribute('aria-pressed', String(active));
    });
    const scenePanel = $('#v3-scene-options');
    if (scenePanel && !scenePanel.dataset.ready) {
      scenePanel.dataset.ready = 'true';
      for (const item of SCENES) {
        const button = document.createElement('button');
        button.type = 'button'; button.className = 'v3-scene-card'; button.dataset.v3SceneChoice = item.id;
        button.setAttribute('aria-label', `${english() ? item.en : item.name}: ${english() ? item.noteEn : item.note}`);
        const image = document.createElement('img'); image.src = item.image; image.alt = ''; image.loading = 'lazy';
        const caption = document.createElement('span'); caption.innerHTML = `<strong>${english() ? item.en : item.name}</strong><small>${english() ? item.noteEn : item.note}</small>`;
        const check = document.createElement('i'); check.textContent = '✓'; check.setAttribute('aria-hidden', 'true');
        button.append(image, caption, check);
        button.addEventListener('click', () => { localStorage.setItem(STORAGE.scene, item.id); render(); });
        scenePanel.append(button);
      }
    }
    all('[data-v3-scene-choice]').forEach(button => {
      const active = button.dataset.v3SceneChoice === scene;
      button.classList.toggle('active', active); button.setAttribute('aria-pressed', String(active));
      const item = SCENES.find(candidate => candidate.id === button.dataset.v3SceneChoice);
      if (item) {
        button.setAttribute('aria-label', `${english() ? item.en : item.name}: ${english() ? item.noteEn : item.note}`);
        const caption = $('strong', button); if (caption) caption.textContent = english() ? item.en : item.name;
        const note = $('small', button); if (note) note.textContent = english() ? item.noteEn : item.note;
      }
    });
  }

  function init(options) {
    bridge = options || {};
    if (!localStorage.getItem(STORAGE.style)) localStorage.setItem(STORAGE.style, 'pro');
    if (!SCENES.some(item => item.id === localStorage.getItem(STORAGE.scene))) localStorage.setItem(STORAGE.scene, 'deep-dark');
    all('[data-v3-style-choice]').forEach(button => button.addEventListener('click', () => {
      localStorage.setItem(STORAGE.style, button.dataset.v3StyleChoice === 'world' ? 'world' : 'pro'); render();
    }));
    window.addEventListener('workshop-ui-mode-changed', render);
    window.addEventListener('workshop-language-changed', render);
    render();
    renderDashboard();
    window.addEventListener('workshop-project-updated', renderDashboard);
  }

  window.WorkshopV3UI = { init, render, renderDashboard, scenes: SCENES, palettes: PALETTES };
})();
