(() => {
  const search = document.getElementById('mod-search');
  const clear = document.getElementById('mod-search-clear');
  const submit = document.getElementById('search-button');
  if (!search || !clear || !submit) return;

  const updateClearButton = () => { clear.hidden = search.value.length === 0; };
  const placeFocus = () => {
    search.focus({ preventScroll: true });
    search.select();
  };
  const focusSearch = () => {
    const panel = document.getElementById('mods-panel');
    if (panel?.hidden) {
      document.getElementById('nav-mods')?.click();
      placeFocus();
      return;
    }
    placeFocus();
  };

  search.addEventListener('input', updateClearButton);
  clear.addEventListener('click', () => {
    search.value = '';
    search.dispatchEvent(new Event('input', { bubbles: true }));
    submit.click();
    focusSearch();
  });

  document.addEventListener('keydown', event => {
    const target = event.target;
    const typing = target instanceof Element && target.closest('input,textarea,select,[contenteditable="true"]');
    const dialogOpen = document.querySelector('.settings-overlay:not([hidden]),.test-overlay:not([hidden]),.design-overlay:not([hidden]),.mod-selection-overlay:not([hidden]),.mod-details-overlay:not([hidden]),.mod-preview-overlay:not([hidden])');
    if (dialogOpen || event.altKey) return;

    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
      event.preventDefault();
      focusSearch();
    } else if (!typing && !event.ctrlKey && !event.metaKey && event.key === '/') {
      event.preventDefault();
      focusSearch();
    }
  });

  updateClearButton();
})();
