(function (root) {
  'use strict';
  const keyOf = mod => mod && mod.id != null ? `${mod.provider || 'modrinth'}:${mod.id}` : '';
  const dataOf = snapshot => snapshot?.data || snapshot || {};
  const versionOf = mod => String(mod?.versionId || mod?.versionNumber || '');

  function compareSnapshots(a, b) {
    const left = dataOf(a), right = dataOf(b);
    const before = new Map((Array.isArray(left.mods) ? left.mods : []).filter(keyOf).map(mod => [keyOf(mod), mod]));
    const after = new Map((Array.isArray(right.mods) ? right.mods : []).filter(keyOf).map(mod => [keyOf(mod), mod]));
    return {
      added: [...after].filter(([key]) => !before.has(key)).map(([, mod]) => mod),
      removed: [...before].filter(([key]) => !after.has(key)).map(([, mod]) => mod),
      changed: [...after].filter(([key, mod]) => before.has(key) && versionOf(before.get(key)) !== versionOf(mod)).map(([key, mod]) => ({ key, before: before.get(key), after: mod })),
      setup: ['minecraftVersion', 'loader', 'loaderVersion'].filter(field => String(left[field] || '') !== String(right[field] || '')).map(field => ({ field, before: left[field] || '', after: right[field] || '' }))
    };
  }

  const translations = {
    en: {
      library: 'Personal mod library', description: 'Saved across all packs. Keep notes and add a mod to the current pack.',
      empty: 'No saved mods yet. Use the star on a mod to save it here.', note: 'Note for ', save: 'Save note', remove: 'Remove bookmark',
      add: 'Add to current pack', inPack: 'Already in pack', saveMod: 'Save mod: ', removeMod: 'Remove bookmark: ',
      context: 'Saved compatibility: ', unknown: 'Unknown', warning: 'Check compatibility with the current pack before using this mod.',
      saved: 'Bookmark saved', removed: 'Bookmark removed', noteSaved: 'Note saved', added: 'Mod added to the current pack',
      failed: 'Could not save the library change. Please try again.', loadFailed: 'Could not load your library. Please try again.', retry: 'Try again',
      compare: 'Compare pack snapshots', compareHelp: 'Choose any two saved states. Changes run from A to B.',
      needTwo: 'Save at least two pack snapshots to compare them.', a: 'Snapshot A', b: 'Snapshot B',
      addedMods: 'Added', removedMods: 'Removed', changedMods: 'Versions changed', setup: 'Setup changes', none: 'None', unpinned: 'Unpinned', loader: 'Loader'
    },
    de: {
      library: 'Persönliche Mod-Bibliothek', description: 'Für alle Packs gespeichert. Halte Notizen fest und füge Mods zum aktuellen Pack hinzu.',
      empty: 'Noch keine Mods gemerkt. Speichere eine Mod über den Stern.', note: 'Notiz für ', save: 'Notiz speichern', remove: 'Lesezeichen entfernen',
      add: 'Zum aktuellen Pack hinzufügen', inPack: 'Bereits im Pack', saveMod: 'Mod merken: ', removeMod: 'Lesezeichen entfernen: ',
      context: 'Gespeicherte Kompatibilität: ', unknown: 'Unbekannt', warning: 'Prüfe vor der Verwendung die Kompatibilität mit dem aktuellen Pack.',
      saved: 'Lesezeichen gespeichert', removed: 'Lesezeichen entfernt', noteSaved: 'Notiz gespeichert', added: 'Mod zum aktuellen Pack hinzugefügt',
      failed: 'Die Änderung konnte nicht gespeichert werden. Bitte erneut versuchen.', loadFailed: 'Die Bibliothek konnte nicht geladen werden. Bitte erneut versuchen.', retry: 'Erneut versuchen',
      compare: 'Pack-Stände vergleichen', compareHelp: 'Wähle zwei beliebige gespeicherte Stände. Änderungen werden von A nach B angezeigt.',
      needTwo: 'Speichere mindestens zwei Pack-Stände, um sie zu vergleichen.', a: 'Pack-Stand A', b: 'Pack-Stand B',
      addedMods: 'Hinzugefügt', removedMods: 'Entfernt', changedMods: 'Versionen geändert', setup: 'Setup geändert', none: 'Keine', unpinned: 'Nicht festgelegt', loader: 'Loader'
    }
  };
  let bridge, records = [], generation = 0, comparisonProject, selectedA, selectedB, loaded = false, loading;
  const stars = new Set(), pending = new Set(), drafts = new Map();
  const text = () => translations[String(bridge?.getLocale?.() || 'de').startsWith('en') ? 'en' : 'de'];
  const project = () => bridge?.getProject?.() || {};
  const host = id => root.document?.getElementById(id);
  function node(tag, value, className) {
    const element = root.document.createElement(tag);
    if (value != null) element.textContent = String(value);
    if (className) element.className = className;
    return element;
  }
  function button(label, action) {
    const element = node('button', label, 'button button-quiet'); element.type = 'button'; element.onclick = action; return element;
  }
  const saved = key => records.find(entry => entry.key === key || keyOf(entry.mod) === key);
  const report = value => bridge?.status?.(value);
  function refreshStars() {
    const t = text();
    for (const star of stars) {
      if (!star.isConnected) { stars.delete(star); continue; }
      const mod = star._libraryMod, key = keyOf(mod), active = Boolean(saved(key));
      const label = (active ? t.removeMod : t.saveMod) + (mod.title || mod.id);
      star.textContent = active ? '★' : '☆';
      star.setAttribute('aria-pressed', String(active)); star.setAttribute('aria-label', label); star.title = label;
      star.disabled = pending.has(key);
    }
  }
  async function change(key, action, message, onSuccess) {
    if (pending.has(key)) return;
    pending.add(key); refreshStars();
    const area = host('pack-library-panel');
    area?.querySelectorAll('[data-library-key]').forEach(row => {
      if (row.dataset.libraryKey === key) row.querySelectorAll('button').forEach(control => { control.disabled = true; });
    });
    try {
      await action();
      onSuccess?.();
      pending.delete(key);
      await render({ refresh: true }); report(message);
    } catch {
      pending.delete(key); refreshStars(); renderLibrary();
      report(text().failed);
      const error = node('p', text().failed, 'pack-library-error'); error.setAttribute('role', 'alert'); area?.append(error);
    }
  }
  function decorate(container, mods) {
    if (!bridge || !container) return;
    const attach = (card, mod, target) => {
      if (!mod || !keyOf(mod)) return;
      let star = card.querySelector('[data-bookmark-toggle]');
      if (!star) {
        star = button('', event => {
          event.stopPropagation(); event.preventDefault();
          const candidate = star._libraryMod, key = keyOf(candidate), entry = saved(key), t = text();
          void change(key, () => entry ? bridge.deleteBookmark(entry.key) : bridge.saveBookmark({ mod: candidate, note: '' }), entry ? t.removed : t.saved, () => { if (entry) drafts.delete(key); });
        });
        star.classList.add('pack-bookmark-star'); star.dataset.bookmarkToggle = '';
        star.addEventListener('keydown', event => event.stopPropagation());
        star.addEventListener('keyup', event => event.stopPropagation());
        (target || card).append(star);
      }
      star._libraryMod = mod; stars.add(star);
    };
    container.querySelectorAll('[data-mod-details]').forEach(card => attach(card, mods?.[Number(card.dataset.modDetails)], card.querySelector('.mod-name')));
    container.querySelectorAll('.selected-mod [data-remove]').forEach(remove => attach(remove.closest('.selected-mod'), mods?.[Number(remove.dataset.remove)]));
    refreshStars();
  }
  function renderLibrary(error = false) {
    const area = host('pack-library-panel'); if (!area) return;
    const t = text(); area.classList.add('pack-library', 'lab-card'); area.replaceChildren();
    area.append(node('h3', t.library), node('p', t.description, 'lab-footnote'));
    if (error) {
      const message = node('p', t.loadFailed, 'pack-library-error'); message.setAttribute('role', 'alert');
      area.append(message, button(t.retry, () => void render({ refresh: true }))); return;
    }
    if (!records.length) { area.append(node('p', t.empty, 'lab-empty')); return; }
    const list = node('div', null, 'pack-library-list');
    for (const entry of records) {
      const mod = entry.mod; if (!keyOf(mod)) continue;
      const row = node('article', null, 'pack-library-entry'); row.dataset.libraryKey = keyOf(mod);
      row.append(node('strong', mod.title || mod.id));
      const context = mod.compatibility || [mod.minecraftVersion, mod.loader].filter(Boolean).join(' · ') || t.unknown;
      row.append(node('p', t.context + context, 'lab-footnote'));
      const current = project();
      const mismatch = !mod.minecraftVersion || !mod.loader || mod.minecraftVersion !== current.minecraftVersion || String(mod.loader).toLowerCase() !== String(current.loader).toLowerCase();
      if (mismatch) row.append(node('p', t.warning, 'pack-library-warning'));
      const label = node('label', t.note + (mod.title || mod.id), 'pack-library-note');
      const key = keyOf(mod);
      const input = node('textarea'); input.value = drafts.has(key) ? drafts.get(key) : String(entry.note || ''); input.maxLength = 1000; input.rows = 2;
      input.oninput = () => drafts.set(key, input.value);
      label.append(input); row.append(label);
      const actions = node('div', null, 'pack-library-actions');
      actions.append(button(t.save, () => {
        const note = input.value;
        void change(key, () => bridge.saveBookmark({ mod, note }), t.noteSaved, () => { if (drafts.get(key) === note) drafts.delete(key); });
      }));
      const inPack = (current.mods || []).some(item => keyOf(item) === keyOf(mod));
      const add = button(inPack ? t.inPack : t.add, () => {
        const { dependency, requiredBy, ...rootMod } = mod;
        void change(keyOf(mod), () => bridge.addMod(rootMod), t.added);
      }); add.disabled = inPack; actions.append(add);
      actions.append(button(t.remove, () => void change(key, () => bridge.deleteBookmark(entry.key), t.removed, () => drafts.delete(key))));
      if (pending.has(keyOf(mod))) actions.querySelectorAll('button').forEach(control => { control.disabled = true; });
      row.append(actions); list.append(row);
    }
    area.append(list);
  }
  function renderComparison() {
    const area = host('snapshot-comparison'); if (!area) return;
    const t = text(), current = project(), all = Array.isArray(current.snapshots) ? current.snapshots : [];
    area.classList.add('pack-snapshot-comparison', 'lab-card'); area.replaceChildren();
    area.append(node('h3', t.compare), node('p', t.compareHelp, 'lab-footnote'));
    if (all.length < 2) { area.append(node('p', t.needTwo, 'lab-empty')); return; }
    if (comparisonProject !== current.id) { selectedA = undefined; selectedB = undefined; comparisonProject = current.id; }
    const id = (snapshot, index) => String(snapshot.id ?? index);
    if (!all.some((item, index) => id(item, index) === selectedA)) selectedA = id(all[all.length - 2], all.length - 2);
    if (!all.some((item, index) => id(item, index) === selectedB)) selectedB = id(all[all.length - 1], all.length - 1);
    const controls = node('div', null, 'pack-comparison-controls');
    const select = (label, selected, onChange) => {
      const wrapper = node('label', label); const field = node('select'); field.setAttribute('aria-label', label);
      all.forEach((snapshot, index) => { const option = node('option', snapshot.name || `${label} ${index + 1}`); option.value = id(snapshot, index); field.append(option); });
      field.value = selected; field.onchange = () => { onChange(field.value); draw(); }; wrapper.append(field); controls.append(wrapper); return field;
    };
    const left = select(t.a, selectedA, value => { selectedA = value; });
    const right = select(t.b, selectedB, value => { selectedB = value; });
    const results = node('div', null, 'pack-comparison-results'); results.dataset.snapshotResults = ''; results.setAttribute('aria-live', 'polite'); results.setAttribute('aria-atomic', 'true');
    function draw() {
      const a = all.find((item, index) => id(item, index) === left.value), b = all.find((item, index) => id(item, index) === right.value);
      const difference = compareSnapshots(a, b); results.replaceChildren();
      results.append(node('p', `${a.name || t.a} → ${b.name || t.b}`, 'pack-comparison-direction'));
      const version = mod => versionOf(mod) || t.unpinned;
      const group = (title, entries, format) => {
        const section = node('section', null, 'pack-comparison-group'); section.append(node('h4', `${title} (${entries.length})`));
        if (!entries.length) section.append(node('p', t.none, 'lab-footnote'));
        else { const list = node('ul'); entries.forEach(entry => list.append(node('li', format(entry)))); section.append(list); }
        results.append(section);
      };
      const describeMod = mod => `${mod.title || mod.id} · ${mod.provider || 'modrinth'} · ${version(mod)}`;
      group(t.addedMods, difference.added, describeMod); group(t.removedMods, difference.removed, describeMod);
      group(t.changedMods, difference.changed, entry => `${entry.after.title || entry.after.id} · ${entry.after.provider || 'modrinth'} · ${version(entry.before)} → ${version(entry.after)}`);
      group(t.setup, difference.setup, entry => `${entry.field === 'minecraftVersion' ? 'Minecraft' : entry.field === 'loaderVersion' ? t.loader + (String(bridge?.getLocale?.() || 'de').startsWith('en') ? ' version' : '-Version') : t.loader}: ${entry.before || t.unknown} → ${entry.after || t.unknown}`);
    }
    area.append(controls, results); draw();
  }
  async function render({ refresh = false } = {}) {
    if (!bridge) return;
    renderComparison();
    if (loaded && !refresh) { renderLibrary(); refreshStars(); return; }
    if (loading && !refresh) return loading;
    const ticket = ++generation;
    loading = (async () => {
      try {
        const response = await bridge.listBookmarks(); if (ticket !== generation) return;
        records = Array.isArray(response) ? response : Array.isArray(response?.bookmarks) ? response.bookmarks : [];
        records = records.filter(entry => entry && entry.mod && keyOf(entry.mod)); loaded = true;
        renderLibrary(); refreshStars();
      } catch { if (ticket === generation) renderLibrary(true); }
      finally { if (ticket === generation) loading = undefined; }
    })();
    return loading;
  }
  function init(nextBridge) { bridge = nextBridge; records = []; loaded = false; loading = undefined; generation++; return render(); }
  function openComparison() {
    renderComparison(); const area = host('snapshot-comparison');
    area?.scrollIntoView?.({ behavior: 'smooth', block: 'nearest' });
    area?.querySelector('select')?.focus();
  }
  const api = { init, render, decorate, compareSnapshots, openComparison };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.WorkshopPackLibrary = api;
})(globalThis);
