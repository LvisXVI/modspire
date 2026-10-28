// Embedded Blockbench: the bundled, unmodified web build (public/blockbench, GPL-3.0) runs in a
// same-origin frame. Mod Studio drives it through Blockbench's own globals: loadModelFile() to open
// the selected element, Modes to switch between the guided steps, Codecs.project.compile() to take
// the edited model back. Every Blockbench menu and tool stays available inside the frame.

const READY_TIMEOUT_MS = 30000;
const TIPS_KEY = 'modstudio.bbTips';
const ACCENTS = { emerald: '#c6ff4a', aurora: '#5ee7d9', cherry: '#ff9cc2', nether: '#ff8a4c' };
const STEPS = [
  { mode: 'edit', label: 'Form bauen', hint: 'Würfel mit „＋ Würfel“ oder im Outliner rechts hinzufügen. Pfeile verschieben, Kanten ziehen skaliert.', action: ['＋ Würfel', 'add_cube'] },
  { mode: 'paint', label: 'Textur malen', hint: 'Pinsel wählen und direkt auf das Modell malen – nur die Fläche unter dem Pinsel wird bemalt. Links liegt die 16 × 16-Textur.', action: ['Pinsel', 'brush_tool'] },
  { mode: 'display', label: 'Im Spiel ansehen', hint: 'Lege fest, wie das Element in der Hand, im Inventar oder auf dem Boden aussieht.' },
];
let layer = null;

function frameApi(frame) {
  const w = frame.contentWindow;
  return w && typeof w.loadModelFile === 'function' && w.Codecs?.project && w.Blockbench && w.Modes ? w : null;
}

function waitForBlockbench(frame) {
  return new Promise((resolve, reject) => {
    const started = Date.now();
    const poll = () => {
      let api = null;
      try { api = frameApi(frame); } catch { /* frame still navigating */ }
      if (api) return resolve(api);
      if (Date.now() - started > READY_TIMEOUT_MS) return reject(new Error('Blockbench konnte nicht gestartet werden.'));
      setTimeout(poll, 150);
    };
    poll();
  });
}

function themeFrame(api) {
  const doc = api.document;
  const link = doc.createElement('link');
  link.rel = 'stylesheet'; link.href = '../blockbench-theme.css';
  doc.head.append(link);
  doc.body.style.setProperty('--ms-accent', designAccent());
}

function designAccent() {
  const scene = document.documentElement.dataset.skin === 'glass' ? document.documentElement.dataset.scene : '';
  return ACCENTS[scene] || ACCENTS.emerald;
}

function tipsSeen() { try { return localStorage.getItem(TIPS_KEY) === '1'; } catch { return false; } }
function rememberTips() { try { localStorage.setItem(TIPS_KEY, '1'); } catch { /* tips just show again */ } }

/**
 * Open Blockbench over the editor with the given project file.
 * @param {{ title: string, fileName: string, project: object, onApply: (bbmodel: object) => Promise<void> | void }} options
 */
export async function openEmbeddedBlockbench({ title, fileName, project, onApply }) {
  closeEmbeddedBlockbench();
  layer = document.createElement('div');
  layer.className = 'bb-layer';
  layer.setAttribute('role', 'dialog');
  layer.setAttribute('aria-modal', 'true');
  layer.setAttribute('aria-label', `Blockbench · ${title}`);
  layer.innerHTML = `
    <div class="bb-window">
      <header class="bb-bar">
        <div class="bb-title"><span class="bb-mark" aria-hidden="true"></span><div><strong></strong><small>in Blockbench</small></div></div>
        <nav class="bb-steps" aria-label="Arbeitsschritte">${STEPS.map((step, index) => `<button type="button" class="bb-step" data-mode="${step.mode}" disabled><b>${index + 1}</b>${step.label}</button>`).join('')}</nav>
        <div class="bb-actions">
          <button class="bb-icon" type="button" data-bb="undo" title="Rückgängig (Strg+Z)" aria-label="Rückgängig" disabled>↶</button>
          <button class="bb-icon" type="button" data-bb="redo" title="Wiederholen (Strg+Y)" aria-label="Wiederholen" disabled>↷</button>
          <button class="bb-icon" type="button" data-bb="tips" title="Kurzanleitung" aria-label="Kurzanleitung" aria-expanded="false">?</button>
          <button class="button button-outline bb-close" type="button">Schließen</button>
          <button class="button button-primary bb-apply" type="button" disabled title="Übernimmt Modell und Textur in dein Projekt (Strg+S)">Übernehmen</button>
        </div>
      </header>
      <div class="bb-hintbar"><span class="bb-status" role="status">Blockbench wird gestartet …</span><button class="bb-quick" type="button" hidden></button><a class="bb-license" href="https://github.com/JannisX11/blockbench" target="_blank" rel="noopener noreferrer" title="Blockbench ist Open Source (GPL-3.0) und unverändert eingebunden">Blockbench · GPL-3.0 ↗</a></div>
      <div class="bb-stage">
        <div class="bb-loading"><span class="bb-spinner" aria-hidden="true"></span>Blockbench wird geladen …</div>
        <iframe class="bb-frame" title="Blockbench-Editor" src="./blockbench/index.html"></iframe>
        <aside class="bb-tips" hidden>
          <strong>So funktioniert's</strong>
          <ol>
            <li><b>Form bauen</b> – Würfel hinzufügen, verschieben und skalieren.</li>
            <li><b>Textur malen</b> – mit dem Pinsel direkt aufs Modell oder auf die Textur links.</li>
            <li><b>Ansehen</b> – prüfen, wie es im Spiel gehalten und angezeigt wird.</li>
            <li><b>Übernehmen</b> – speichert alles in dein Mod-Studio-Projekt.</li>
          </ol>
          <p>Ansicht: <kbd>Linke Maustaste</kbd> drehen · <kbd>Rechte Maustaste</kbd> verschieben · <kbd>Mausrad</kbd> zoomen. Alle weiteren Blockbench-Funktionen findest du oben in den Menüs.</p>
          <button class="button button-primary bb-tips-ok" type="button">Verstanden</button>
        </aside>
      </div>
    </div>`;
  layer.querySelector('.bb-title strong').textContent = title;
  layer.style.setProperty('--bb-accent', designAccent());
  document.body.append(layer);
  requestAnimationFrame(() => layer?.classList.add('open'));
  const current = layer;
  const frame = layer.querySelector('.bb-frame');
  const status = layer.querySelector('.bb-status');
  const apply = layer.querySelector('.bb-apply');
  const close = layer.querySelector('.bb-close');
  const quick = layer.querySelector('.bb-quick');
  const tips = layer.querySelector('.bb-tips');
  const tipsButton = layer.querySelector('[data-bb="tips"]');
  const showTips = (visible) => { tips.hidden = !visible; tipsButton.setAttribute('aria-expanded', String(visible)); if (!visible) rememberTips(); };
  tipsButton.addEventListener('click', () => showTips(tips.hidden));
  layer.querySelector('.bb-tips-ok').addEventListener('click', () => showTips(false));

  let api = null;
  let confirmTimer = 0;
  const dirty = () => api && api.Project && api.Project.saved === false;
  close.addEventListener('click', () => {
    if (dirty() && !close.classList.contains('confirm')) {
      close.classList.add('confirm'); close.textContent = 'Änderungen verwerfen?';
      clearTimeout(confirmTimer);
      confirmTimer = setTimeout(() => { close.classList.remove('confirm'); close.textContent = 'Schließen'; }, 3500);
      return;
    }
    closeEmbeddedBlockbench();
  });
  const onEscape = (event) => { if (event.key === 'Escape') close.click(); };
  document.addEventListener('keydown', onEscape);
  layer.addEventListener('remove-escape', () => document.removeEventListener('keydown', onEscape));

  try {
    api = await waitForBlockbench(frame);
    if (layer !== current) return;
    themeFrame(api);
    try { frame.contentWindow.addEventListener('keydown', onEscape); } catch { /* cross-origin frame: Escape works from the page */ }
    api.loadModelFile({ content: JSON.stringify(project), path: fileName, name: fileName });
    layer.querySelector('.bb-loading')?.remove();
    if (!tipsSeen()) showTips(true);

    const syncMode = () => {
      const mode = api.Modes.selected?.id;
      const step = STEPS.find((entry) => entry.mode === mode);
      current.querySelectorAll('.bb-step').forEach((button) => button.setAttribute('aria-current', String(button.dataset.mode === mode)));
      status.style.animation = 'none'; void status.offsetWidth; status.style.animation = '';
      status.textContent = step ? step.hint : 'Erweiterte Blockbench-Ansicht. Über die Schritte oben kommst du zurück.';
      quick.hidden = !step?.action;
      if (step?.action) { quick.textContent = step.action[0]; quick.dataset.item = step.action[1]; }
    };
    const syncHistory = () => {
      current.querySelector('[data-bb="undo"]').disabled = !api.Undo?.index;
      current.querySelector('[data-bb="redo"]').disabled = !api.Undo || api.Undo.index >= api.Undo.history.length;
    };
    current.querySelectorAll('.bb-step').forEach((button) => {
      button.disabled = false;
      button.addEventListener('click', () => api.Modes.options[button.dataset.mode]?.select());
    });
    quick.addEventListener('click', () => {
      const item = api.BarItems[quick.dataset.item];
      if (item?.select && item.type === 'tool') item.select(); else item?.trigger?.();
    });
    current.querySelector('[data-bb="undo"]').addEventListener('click', () => { api.Undo.undo(); syncHistory(); });
    current.querySelector('[data-bb="redo"]').addEventListener('click', () => { api.Undo.redo(); syncHistory(); });
    api.Blockbench.on('select_mode', () => setTimeout(syncMode));
    for (const name of ['finished_edit', 'undo', 'redo']) api.Blockbench.on(name, () => setTimeout(syncHistory));
    syncMode(); syncHistory();

    const takeOver = async () => {
      if (apply.disabled) return;
      apply.disabled = true; status.textContent = 'Wird übernommen …';
      try {
        const compiled = api.Codecs.project.compile({ raw: true });
        await onApply(JSON.parse(JSON.stringify(compiled)));
        closeEmbeddedBlockbench();
      } catch (error) {
        status.textContent = error.message || 'Das Modell konnte nicht übernommen werden.';
        apply.disabled = false;
      }
    };
    apply.disabled = false;
    apply.addEventListener('click', takeOver);
    // Ctrl+S inside Blockbench would download a file; here it hands the model to Mod Studio instead.
    api.document.addEventListener('keydown', (event) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') { event.preventDefault(); event.stopImmediatePropagation(); takeOver(); }
    }, true);
  } catch (error) {
    status.textContent = error.message;
    layer?.querySelector('.bb-loading')?.replaceChildren(error.message);
  }
}

export function closeEmbeddedBlockbench() {
  if (!layer) return;
  const closing = layer; layer = null;
  closing.dispatchEvent(new Event('remove-escape'));
  closing.classList.remove('open');
  closing.classList.add('closing');
  setTimeout(() => closing.remove(), 280);
}
