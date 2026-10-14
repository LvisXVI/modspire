'use strict';

const STORAGE_KEY = 'mw-ui-mode';
const UI_MODES = Object.freeze({ classic: 'classic', modern: 'modern', v3: 'v3', v4: 'v4' });

function normalizeMode(value) {
  return Object.values(UI_MODES).includes(value) ? value : UI_MODES.classic;
}

function createDesignManager(storage, root = null) {
  let mode = normalizeMode(storage?.getItem(STORAGE_KEY));
  const listeners = new Set();
  function setMode(nextMode, { persist = true } = {}) {
    mode = normalizeMode(nextMode);
    if (persist) storage?.setItem(STORAGE_KEY, mode);
    if (root?.dataset) root.dataset.ui = mode;
    const detail = Object.freeze({ mode, availableModes: Object.values(UI_MODES) });
    for (const listener of listeners) listener(detail);
    return detail;
  }
  function subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); }
  if (root?.dataset) root.dataset.ui = mode;
  return Object.freeze({ get mode() { return mode; }, setMode, subscribe });
}

if (typeof module !== 'undefined' && module.exports) module.exports = { STORAGE_KEY, UI_MODES, normalizeMode, createDesignManager };
if (typeof window !== 'undefined') window.WorkshopDesignManager = { STORAGE_KEY, UI_MODES, normalizeMode, createDesignManager };
