/* Minecraft Creator-Safe playlist, loaded only after a visitor opens the player. */
(() => {
  'use strict';
  const playlist = '5T4KWhz9Q8r98skQBimtlH';
  const root = document.createElement('aside');
  root.className = 'music-player';
  root.innerHTML = `
    <button class="music-player__toggle" type="button" aria-expanded="false" aria-label="Minecraft Musik abspielen oder Player öffnen" aria-controls="minecraft-music-panel">
      <span class="music-player__icon" aria-hidden="true">♫</span>
      <span class="music-player__label"><strong>Minecraft Musik</strong><small>Creator-Safe Playlist</small></span>
      <span class="music-player__chevron" aria-hidden="true">⌃</span>
    </button>
    <div class="music-player__panel" id="minecraft-music-panel" hidden>
      <iframe title="Minecraft Creator-Safe Playlist auf Spotify" loading="lazy" allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture" referrerpolicy="strict-origin-when-cross-origin"></iframe>
      <div class="music-player__meta"><span>Auf Play tippen – die Playlist läuft Song für Song.</span><a href="https://open.spotify.com/playlist/${playlist}" target="_blank" rel="noopener noreferrer">Auf Spotify öffnen ↗</a></div>
    </div>`;
  const button = root.querySelector('button');
  const panel = root.querySelector('.music-player__panel');
  const frame = root.querySelector('iframe');
  button.addEventListener('click', () => {
    const open = button.getAttribute('aria-expanded') !== 'true';
    button.setAttribute('aria-expanded', String(open));
    panel.hidden = !open;
    root.classList.toggle('is-open', open);
    if (open && !frame.dataset.loaded) {
      frame.dataset.loaded = 'true';
      frame.src = `https://open.spotify.com/embed/playlist/${playlist}?utm_source=generator&theme=0&autoplay=1`;
    }
  });
  root.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && button.getAttribute('aria-expanded') === 'true') {
      button.click();
      button.focus();
    }
  });
  document.body.append(root);
})();
