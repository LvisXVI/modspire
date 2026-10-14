'use strict';
(() => {
  const copy = {
    de: { title:'Deine Welt, in die Tiefe geplant.', workspace:'WERKSTATT', overview:'Übersicht', assistant:'Pack-Assistent', browse:'Mod-Katalog', creator:'Mod-Designer', lab:'Pack-Labor', design:'Design', settings:'Einstellungen', activePack:'AKTIVES MODPACK', heroCopy:'Alle Werkzeuge für dein Pack, verbunden in einer ruhigen, klaren Werkstatt.', switchPack:'Modpack wechseln', selectedMods:'AUSGEWÄHLTE MODS', manageMods:'Mods verwalten', minecraftVersion:'MINECRAFT-VERSION', versionCaption:'Aktive Spielversion', loader:'MOD-LOADER', loaderCaption:'Für Suche und Kompatibilität', packHealth:'PACK-CHECK', ready:'Bereit zur Prüfung', checkPack:'Pack prüfen', selection:'DEINE AUSWAHL', recentlyAdded:'Zuletzt hinzugefügt', allMods:'Alle Mods', emptyPack:'Hier erscheinen deine ausgewählten Mods.', discoverFirst:'Erste Mods entdecken', mix:'PACK-MIX', categories:'Themen in deinem Pack', live:'LIVE', localHistory:'LOKALE SICHERUNGEN', packHistory:'Pack-Verlauf', findMore:'Weitere passende Mods finden', exportPack:'Pack exportieren', footer:'Deine Auswahl und Einstellungen bleiben in deinem Projekt.', changeLook:'Darstellung anpassen', noMods:'Noch keine Mods im Pack', noHistory:'Dein Pack-Verlauf erscheint nach der ersten Sicherung.', gameplay:'Gameplay', visual:'Optik', exploration:'Erkundung', technology:'Technik', combat:'Kampf', other:'Weitere', mods:'Mods', snapshots:'Sicherungen' },
    en: { title:'Plan your next world in depth.', workspace:'WORKSHOP', overview:'Overview', assistant:'Pack assistant', browse:'Mod catalog', creator:'Mod designer', lab:'Pack lab', design:'Appearance', settings:'Settings', activePack:'ACTIVE MODPACK', heroCopy:'Every pack tool, connected in one calm and focused workspace.', switchPack:'Switch modpack', selectedMods:'SELECTED MODS', manageMods:'Manage mods', minecraftVersion:'MINECRAFT VERSION', versionCaption:'Active game version', loader:'MOD LOADER', loaderCaption:'For search and compatibility', packHealth:'PACK CHECK', ready:'Ready to test', checkPack:'Check pack', selection:'YOUR SELECTION', recentlyAdded:'Recently added', allMods:'All mods', emptyPack:'Your selected mods will appear here.', discoverFirst:'Discover your first mods', mix:'PACK MIX', categories:'Pack categories', live:'LIVE', localHistory:'LOCAL SAVES', packHistory:'Pack history', findMore:'Find more matching mods', exportPack:'Export pack', footer:'Your selection and settings stay with your project.', changeLook:'Customize appearance', noMods:'No mods in this pack yet', noHistory:'Your pack history appears after the first snapshot.', gameplay:'Gameplay', visual:'Visuals', exploration:'Exploration', technology:'Technology', combat:'Combat', other:'Other', mods:'mods', snapshots:'snapshots' }
  };
  const $ = id => document.getElementById(id);
  let bridge = {};
  const english = () => (window.workshopI18n?.locale || document.documentElement.lang || 'de').toLowerCase().startsWith('en');
  const t = key => (english() ? copy.en : copy.de)[key] || key;
  const safe = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  const nav = action => {
    const actions = { project:'project', chat:'chat', mods:'mods', lab:'lab' };
    if (action === 'chat') (bridge.navigateChat || (() => bridge.navigate?.('chat')))();
    else if (actions[action]) bridge.navigate?.(actions[action]);
    else if (action === 'creator') $('nav-mod-creator')?.click();
    else if (action === 'design') bridge.openDesign?.();
    else if (action === 'settings') bridge.openSettings?.();
    else if (action === 'snapshot') bridge.snapshot?.();
    else if (action === 'export') bridge.exportProject?.();
  };
  function syncTheme(detail = {}) {
    const root = document.documentElement;
    const read = (key, fallback) => getComputedStyle(root).getPropertyValue(key).trim() || fallback;
    const colors = detail.colors || {};
    const vars = {
      '--v4-ink': read('--modern-ink', '#171925'),
      '--v4-muted': read('--modern-muted', '#626a83'),
      '--v4-canvas': read('--modern-canvas', read('--modern-bg', colors.background || '#eef1fb')),
      '--v4-surface': read('--modern-card', colors.surface || '#f9faff'),
      '--v4-surface-raised': read('--modern-inset', '#e9ecfa'),
      '--v4-line': read('--modern-line', '#d7dafa'),
      '--v4-accent': read('--modern-accent', colors.accent || '#4050ff'),
      '--v4-accent-2': read('--modern-accent', colors.accent || '#4050ff'),
      '--v4-gold': read('--modern-green', '#169b56')
    };
    for (const [name, value] of Object.entries(vars)) root.style.setProperty(name, value);
  }
  function render() {
    const project = bridge.getProject?.();
    if (!project) return;
    const mods = Array.isArray(project.mods) ? project.mods : [];
    $('v4-project-name').textContent = project.name || t('activePack');
    $('v4-mod-count').textContent = String(mods.length);
    $('v4-version').textContent = project.minecraftVersion || '—';
    $('v4-loader').textContent = String(project.loader || '—').replace(/^./, c => c.toUpperCase());
    $('v4-setup').textContent = `${project.minecraftVersion || '—'} · ${String(project.loader || '—').replace(/^./, c => c.toUpperCase())}`;
    const select = $('v4-project-select');
    if (select && bridge.getProjects) {
      const projects = bridge.getProjects() || [];
      select.innerHTML = projects.map(item => `<option value="${safe(item.id)}">${safe(item.name)}</option>`).join('') + `<option value="__create__">${english() ? '＋ New modpack …' : '＋ Neues Modpack …'}</option>`;
      select.value = projects.some(item => item.id === project.id) ? project.id : (projects[0]?.id || '');
    }
    const list = $('v4-mod-list');
    const latest = mods.slice(-5).reverse();
    list.replaceChildren(...latest.map(mod => {
      const item = document.createElement('button'); item.type = 'button'; item.className = 'v4-mod-row'; item.setAttribute('aria-label', `${mod.title}, ${english() ? 'open details' : 'Details öffnen'}`);
      const icon = mod.icon ? `<img src="${safe(mod.icon)}" alt="" loading="lazy">` : '<span class="v4-mod-fallback" aria-hidden="true">✦</span>';
      item.innerHTML = `${icon}<span class="v4-mod-copy"><strong>${safe(mod.title)}</strong><small>${safe(mod.source || 'Modrinth')} · ${safe(mod.compatibility || project.minecraftVersion || '—')}</small></span><span class="v4-mod-arrow" aria-hidden="true">↗</span>`;
      item.addEventListener('click', () => bridge.openMod?.(mod)); return item;
    }));
    $('v4-empty').hidden = mods.length > 0;
    if (!mods.length) list.innerHTML = `<p class="v4-empty-note">${safe(t('noMods'))}</p>`;
    const categories = [
      {key:'exploration', re:/explor|biome|worldgen|dimension|structure|adventure/i, icon:'⌖'},
      {key:'technology', re:/tech|automat|machine|energy|create|storage/i, icon:'⌘'},
      {key:'combat', re:/combat|weapon|boss|battle|armor|damage/i, icon:'⚔'},
      {key:'visual', re:/visual|shader|light|ambien|texture|resource|effect/i, icon:'✧'},
      {key:'other', re:/.*/i, icon:'⬡'}
    ];
    const counts = categories.map(() => 0);
    mods.forEach(mod => { const text = `${mod.title} ${mod.description || ''} ${(mod.categories || []).join(' ')}`; let i = categories.findIndex((category, index) => index < categories.length - 1 && category.re.test(text)); counts[i < 0 ? counts.length - 1 : i]++; });
    const max = Math.max(1, ...counts);
    $('v4-category-list').replaceChildren(...categories.map((category, index) => {
      const row = document.createElement('button'); row.type='button'; row.className='v4-category-row'; row.addEventListener('click', () => nav('mods'));
      row.innerHTML = `<span class="v4-category-glyph" aria-hidden="true">${category.icon}</span><span class="v4-category-name">${safe(t(category.key))}</span><span class="v4-category-track"><i style="--fill:${Math.max(5, counts[index] / max * 100)}%"></i></span><b>${counts[index]}</b>`; return row;
    }));
    const events = (project.snapshots || []).slice(-3).reverse();
    $('v4-activity-list').replaceChildren(...(events.length ? events.map((entry, index) => {
      const row = document.createElement('div'); row.className='v4-activity-row';
      const date = new Date(entry.createdAt || Date.now()).toLocaleDateString(english() ? 'en-US' : 'de-DE', {month:'short',day:'numeric'});
      row.innerHTML = `<span class="v4-activity-icon" aria-hidden="true">${index ? '◷' : '✦'}</span><span><strong>${safe(entry.name || t('packHistory'))}</strong><small>${safe(date)} · ${Number(entry.mods) || 0} ${safe(t('mods'))}</small></span>`; return row;
    }) : [Object.assign(document.createElement('p'), {className:'v4-empty-note',textContent:t('noHistory')})]));
    document.querySelectorAll('[data-v4]').forEach(node => { node.textContent = t(node.dataset.v4); });
    document.querySelectorAll('[data-v4-action]').forEach(button => { const active = button.dataset.v4Action === (bridge.currentView?.() || 'project'); button.classList.toggle('is-active', active); if(active) button.setAttribute('aria-current','page'); else button.removeAttribute('aria-current'); });
  }
  function init(options = {}) {
    bridge = options;
    document.querySelectorAll('[data-v4-action]').forEach(button => button.addEventListener('click', () => nav(button.dataset.v4Action)));
    $('v4-project-select')?.addEventListener('change', event => event.target.value === '__create__' ? bridge.createProject?.() : bridge.switchProject?.(event.target.value));
    window.addEventListener('workshop-language-changed', render);
    window.addEventListener('workshop-ui-mode-changed', render);
    window.addEventListener('workshop-theme-changed', event => syncTheme(event.detail || {}));
    syncTheme({});
    render();
  }
  window.WorkshopV4UI = { init, render, syncTheme };
})();
