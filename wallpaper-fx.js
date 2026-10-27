'use strict';
// Animated Minecraft backgrounds: a fixed layer between the wallpaper (body::before) and the app.
// Drifting block clouds on the sky wallpapers plus one effect per scene (aurora shimmer, cherry
// petals, crystal sparkles, fireflies, nether embers). Follows the existing "move backgrounds"
// switch (body[data-wallpaper-motion]) and the system reduced-motion setting; CSS does the motion.
const startWallpaperFx = () => {
  const SCENES = {
    voxel: { clouds: true },
    crystal: { clouds: true, particles: ['sparkle', 26] },
    aurora: { clouds: true, aurora: true, particles: ['sparkle', 14] },
    grove: { clouds: true, particles: ['petal', 30] },
    'deep-forest': { clouds: true, particles: ['firefly', 24] },
    'nether-forge': { particles: ['ember', 34], haze: true },
  };
  const layer = document.createElement('div');
  layer.className = 'wallpaper-fx';
  layer.setAttribute('aria-hidden', 'true');
  document.body.prepend(layer);
  let current = '';

  const particle = (kind, index, total) => {
    const node = document.createElement('i');
    node.className = `wfx-${kind}`;
    const random = (min, max) => min + Math.random() * (max - min);
    // spread evenly with jitter, so particles never bunch up on one side
    node.style.setProperty('--x', `${((index + random(.1, .9)) / total) * 100}%`);
    node.style.setProperty('--y', `${random(8, 92)}%`);
    node.style.setProperty('--s', random(.6, 1.4).toFixed(2));
    node.style.setProperty('--d', `${random(9, 22).toFixed(1)}s`);
    node.style.setProperty('--delay', `${(-random(0, 22)).toFixed(1)}s`);
    node.style.setProperty('--drift', `${random(-60, 60).toFixed(0)}px`);
    return node;
  };

  const render = () => {
    const wallpaper = document.body.dataset.wallpaper || 'none';
    const scene = SCENES[wallpaper];
    if (wallpaper === current) return;
    current = wallpaper;
    layer.replaceChildren();
    layer.dataset.scene = wallpaper;
    if (!scene) return;
    if (scene.clouds) {
      for (const depth of ['far', 'near']) { const clouds = document.createElement('div'); clouds.className = `wfx-clouds wfx-clouds-${depth}`; layer.append(clouds); }
    }
    if (scene.aurora) { const aurora = document.createElement('div'); aurora.className = 'wfx-aurora'; layer.append(aurora); }
    if (scene.haze) { const haze = document.createElement('div'); haze.className = 'wfx-haze'; layer.append(haze); }
    if (scene.particles) {
      const [kind, count] = scene.particles;
      const total = innerWidth < 900 ? Math.round(count * .6) : count;
      for (let index = 0; index < total; index++) layer.append(particle(kind, index, total));
    }
  };

  render();
  new MutationObserver(render).observe(document.body, { attributes: true, attributeFilter: ['data-wallpaper'] });
};
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', startWallpaperFx, { once: true }); else startWallpaperFx();
