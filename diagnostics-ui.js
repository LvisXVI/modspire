(() => {
  function report(error, fallback) {
    window.workshop?.reportError?.({ message: error?.message || fallback, stack: error?.stack || '' }).catch(() => {});
  }
  window.addEventListener('error', event => report(event.error, event.message || 'Eine App-Ressource konnte nicht geladen werden.'));
  window.addEventListener('unhandledrejection', event => report(event.reason, String(event.reason || 'Unbehandelter Oberflächenfehler')));
  document.addEventListener('DOMContentLoaded', () => {
    const get = id => document.getElementById(id);
    const overlay = get('diagnostics-overlay');
    let lastReport = '';
    const t = text => window.workshopI18n?.t(text) || text;
    async function refresh() {
      get('refresh-diagnostics').disabled = true;
      try {
        const data = await window.workshop.getDiagnostics();
        const incidents = data.entries.filter(entry => /error|crash|rejection|unresponsive/.test(entry.kind));
        get('diagnostics-summary').textContent = incidents.length ? `${incidents.length} ${t('Fehlerhinweise im lokalen Bericht')}` : t('Keine App-Fehler protokolliert');
        get('diagnostics-path').textContent = data.directory;
        lastReport = JSON.stringify({ version: data.version, entries: data.entries }, null, 2);
        get('diagnostics-log').textContent = data.entries.map(entry => `${entry.time} · ${entry.kind}\n${entry.message}${entry.stack ? '\n' + entry.stack : ''}`).join('\n\n') || t('Noch keine Einträge vorhanden.');
      } catch (error) { get('diagnostics-log').textContent = error.message; }
      finally { get('refresh-diagnostics').disabled = false; }
    }
    function close() { overlay.hidden = true; get('sidebar-diagnostics').focus(); }
    get('sidebar-diagnostics').onclick = () => { overlay.hidden = false; refresh(); get('close-diagnostics').focus(); };
    get('close-diagnostics').onclick = close;
    overlay.addEventListener('click', event => { if (event.target === overlay) close(); });
    document.addEventListener('keydown', event => { if (event.key === 'Escape' && !overlay.hidden) close(); });
    get('refresh-diagnostics').onclick = refresh;
    get('copy-diagnostics').onclick = async () => {
      try { await window.workshop.writeClipboard(lastReport); get('diagnostics-action-status').textContent = t('Bericht kopiert'); }
      catch (error) { get('diagnostics-action-status').textContent = error.message; }
    };
    get('open-diagnostics-folder').onclick = async () => {
      try { await window.workshop.openDiagnosticsFolder(); }
      catch (error) { get('diagnostics-action-status').textContent = error.message; }
    };
    get('export-diagnostics').onclick = async () => {
      try { const result = await window.workshop.exportDiagnostics(); if (!result.canceled) get('diagnostics-action-status').textContent = t('Bericht gespeichert'); }
      catch (error) { get('diagnostics-action-status').textContent = error.message; }
    };
  });
})();
