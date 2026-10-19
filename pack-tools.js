(function (root) {
  const clone = value => JSON.parse(JSON.stringify(value));
  const roots = project => (project.mods || []).filter(mod => !mod.dependency);

  function createSelectionHistory(limit = 30) {
    let identity, current = [], past = [], future = [];
    function observe(project) {
      const nextIdentity = JSON.stringify([project.id, project.minecraftVersion, project.loader]);
      const next = roots(project);
      if (identity !== nextIdentity) {
        identity = nextIdentity;
        current = clone(next); past = []; future = [];
      } else if (JSON.stringify(current) !== JSON.stringify(next)) {
        past.push(current); past = past.slice(-limit);
        current = clone(next); future = [];
      }
      return { undo: past.length > 0, redo: future.length > 0 };
    }
    function step(project, direction) {
      observe(project);
      const from = direction === 'undo' ? past : direction === 'redo' ? future : [];
      const to = direction === 'undo' ? future : past;
      if (!from.length) return null;
      to.push(current); current = from.pop();
      return clone(current);
    }
    return { observe, step };
  }

  function formatModList(project, locale = 'de') {
    const clean = value => String(value || '').replace(/\s+/g, ' ').trim();
    const dependency = locale.startsWith('en') ? 'dependency' : 'Abhängigkeit';
    const lines = (project.mods || []).map(mod => {
      let link = '';
      try {
        const url = new URL(mod.url);
        if (url.protocol === 'https:' && !url.username && !url.password && ['modrinth.com', 'www.curseforge.com', 'curseforge.com'].includes(url.hostname)) link = url.href;
      } catch {}
      return `• ${clean(mod.title)}${mod.dependency ? ` (${dependency})` : ''}${link ? ` — ${link}` : ''}`;
    });
    return `${clean(project.name)} · Minecraft ${clean(project.minecraftVersion)} · ${clean(project.loader)}\n${lines.join('\n')}`;
  }

  const api = { createSelectionHistory, formatModList, history: createSelectionHistory() };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.WorkshopPackTools = api;
})(globalThis);
