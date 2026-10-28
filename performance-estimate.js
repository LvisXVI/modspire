'use strict';
// Performance estimate for a modpack on the measured hardware. Pure functions (no DOM), so they run in the app and in tests.
// Scores: 100 is a mid-range gaming PC (6 cores around 3.5 GHz, GTX 1660 class). The result is an honest estimate,
// not a promise: it combines what the mods are (names, descriptions, categories) with what the computer can do.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(); else root.PerformanceEstimate = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  const GROUPS = [
    { key: 'performance', re: /sodium|lithium|ferrite ?core|starlight|krypton|immediate ?fast|modern ?fix|entity ?culling|c2me|noisium|more ?culling|rubidium|embeddium|saturn|memoryleak|dynamic ?fps/i },
    { key: 'shader', re: /\bshaders?\b|\biris\b|oculus|complementary|\bbsl\b|photon|euphoria|ray ?trac|path ?trac/i, cpu: .4, gpu: 22, ram: 500 },
    { key: 'worldgen', re: /biome|terrain|world ?gen|dimension|structure|tectonic|terralith|nullscape|incendium|dungeons?|stronghold|village|cave/i, cpu: 2.6, gpu: .3, ram: 60 },
    { key: 'tech', re: /\bcreate\b|mekanism|automation|factory|machine|pipe|energy|applied energistics|refined storage|thermal|immersive engineering|conveyor|logistics|reactor/i, cpu: 3.4, gpu: .5, ram: 80 },
    { key: 'mobs', re: /\bmobs?\b|creature|entities|entity|animals?|boss(es)?|monster|aether|friends and foes|mowzie|iron'?s spells|ice and fire|dragon|villagers?/i, cpu: 1.9, gpu: 1.2, ram: 50 },
    { key: 'visual', re: /visual|particles?|animations?|textures?|models?|\b3d\b|fresh animations|lighting|ambient|weather|shadows?|reflections?|cinematic|dynamic lights?/i, cpu: .5, gpu: 2.8, ram: 30 },
    { key: 'content', re: /weapons?|armou?r|tools?|furniture|decoration|food|farming|magic|spells?|adventure|quests?|items?/i, cpu: .5, gpu: .3, ram: 35 }
  ];
  const BASE = { cpu: .6, gpu: .15, ram: 32 };
  const ROUND = 512;

  function profile(mods) {
    const counts = {}; let cpu = 8, gpu = 8, ram = 1800, performance = 0;
    for (const mod of mods || []) {
      const text = [mod.title, mod.name, mod.description, mod.summary, ...(mod.categories || []), ...(mod.tags || [])].filter(Boolean).join(' ');
      cpu += BASE.cpu; gpu += BASE.gpu; ram += BASE.ram;
      let matched = false;
      for (const group of GROUPS) {
        if (!group.re.test(text)) continue;
        matched = true; counts[group.key] = (counts[group.key] || 0) + 1;
        if (group.key === 'performance') { performance++; continue; }
        cpu += group.cpu || 0; gpu += group.gpu || 0; ram += group.ram || 0;
        if (group.key !== 'shader') break; // one content group per mod; a shader pack always adds its own cost
      }
      if (!matched) counts.other = (counts.other || 0) + 1;
    }
    // optimisation mods cut the load of everything else; the effect saturates
    const factor = 1 - Math.min(.38, performance * .09);
    return { counts, performance, cpuLoad: cpu * factor, gpuLoad: gpu * factor, ramNeedMB: Math.round(ram * (1 - Math.min(.12, performance * .03))), factor, modCount: (mods || []).length };
  }

  function gpuTier(name) {
    const value = String(name || '');
    const table = [
      [/RTX ?(40|50)\d\d|RX ?(79|78|77)\d\d|RTX ?3090|RTX ?3080|RX ?69\d\d/i, 420, 'high'],
      [/RTX ?30\d\d|RX ?6[5-8]\d\d|RTX ?20[78]\d|RX ?5[67]\d\d\b/i, 260, 'high'],
      [/RTX ?20\d\d|GTX ?16\d\d|GTX ?10[78]\d|RX ?5[0-5]\d\d|RX ?6[0-4]\d\d|Arc ?A[5-7]/i, 140, 'mid'],
      [/GTX ?(9\d\d|10[56]\d)|RX ?(4\d\d|5[0-4]\d)\b|R9|GTX ?7\d\d|GT ?10\d\d/i, 85, 'low'],
      [/Apple ?M[2-9]|Apple ?M1 (Pro|Max|Ultra)/i, 230, 'high'],
      [/Apple ?M1/i, 150, 'mid'],
      [/Iris.{0,6}Xe|Arc ?(Graphics|A3)|Radeon\(TM\) ?(780M|760M|680M|660M)/i, 62, 'integrated'],
      [/UHD|HD Graphics|Intel\(R\)|Vega \d+ Graphics|Radeon\(TM\) Graphics|Radeon Graphics|Mali|Adreno|llvmpipe|SwiftShader|Microsoft Basic/i, 38, 'integrated']
    ];
    for (const [re, score, kind] of table) if (re.test(value)) return { score, kind };
    return null;
  }

  function capacity(hardware) {
    const h = hardware || {};
    const threads = Math.max(1, h.threads || h.cores || 4), cores = Math.max(1, h.cores || Math.round(threads / 2));
    const single = h.cpuScore > 0 ? h.cpuScore : 100;                      // normalised single-thread benchmark
    const cpu = single * (.8 + .2 * Math.min(threads, 12) / 6) * (cores >= 4 ? 1 : .85);
    const tier = gpuTier(h.gpuName);
    const gpu = tier ? tier.score : (h.gpuScore > 0 ? h.gpuScore : 70);
    return { cpu, gpu, gpuKind: tier ? tier.kind : 'unknown' };
  }

  function tierFor(fps) {
    if (fps >= 130) return 'excellent';
    if (fps >= 75) return 'smooth';
    if (fps >= 45) return 'playable';
    if (fps >= 28) return 'choppy';
    return 'heavy';
  }

  function estimate(mods, hardware) {
    const p = profile(mods), c = capacity(hardware), h = hardware || {};
    const fpsCpu = 240 * (c.cpu / 100) * Math.pow(14 / (p.cpuLoad + 6), .8);
    const fpsGpu = 260 * (c.gpu / 100) * Math.pow(14 / (p.gpuLoad + 6), .9);
    const fps = Math.max(8, Math.min(fpsCpu, fpsGpu, 360));
    const bottleneck = fpsCpu <= fpsGpu ? 'cpu' : 'gpu';
    const totalMB = h.ramMB || 8192, usable = Math.max(2048, totalMB - 3072);
    const wanted = Math.max(2048, Math.ceil(p.ramNeedMB / ROUND) * ROUND);
    const allocateMB = Math.min(wanted, Math.floor(usable / ROUND) * ROUND || 2048);
    const ramTight = wanted > usable;
    const viewDistance = Math.max(6, Math.min(16, Math.round(16 * Math.min(1, fps / 90))));
    const tips = [];
    if (!p.performance && p.cpuLoad > 40) tips.push('performance-mods');
    if (ramTight) tips.push('ram-tight');
    if (p.counts.shader && c.gpuKind === 'integrated') tips.push('shader-integrated');
    else if (p.counts.shader && fpsGpu < 60) tips.push('shader-heavy');
    if (bottleneck === 'cpu' && (p.counts.tech || 0) > 3 && fps < 75) tips.push('tech-cpu');
    if (fps < 45) tips.push('lower-view-distance');
    if (p.modCount > 220) tips.push('big-pack');
    return {
      fps: Math.round(fps), fpsLow: Math.round(fps * .75), fpsHigh: Math.round(Math.min(360, fps * 1.25)), tier: tierFor(fps), bottleneck,
      load: { cpu: p.cpuLoad, gpu: p.gpuLoad, ramMB: p.ramNeedMB }, capacity: c,
      ram: { needMB: p.ramNeedMB, allocateMB, totalMB, tight: ramTight },
      viewDistance, tips, profile: p
    };
  }

  const TEXT = {
    en: {
      tier: { excellent: 'Very smooth', smooth: 'Smooth', playable: 'Playable', choppy: 'Choppy', heavy: 'Too heavy' },
      bottleneck: { cpu: 'The processor is the limit', gpu: 'The graphics card is the limit' },
      tips: {
        'performance-mods': 'Add optimisation mods such as Sodium, Lithium and FerriteCore (Fabric) or Embeddium and ModernFix (Forge).',
        'ram-tight': 'This pack wants more memory than your PC can spare. Close other programs or remove heavy mods.',
        'shader-integrated': 'Shaders will struggle on integrated graphics. Play without shaders or pick a very light shader pack.',
        'shader-heavy': 'Your graphics card will struggle with shaders at high settings. Lower the shader quality or the render resolution.',
        'tech-cpu': 'Many technology mods load the processor. Keep machines in few, chunk-loaded areas.',
        'lower-view-distance': 'Lower the render distance to the recommended value to get a steadier frame rate.',
        'big-pack': 'A pack this large needs a long first start; give it time to load.'
      }
    },
    de: {
      tier: { excellent: 'Sehr flüssig', smooth: 'Flüssig', playable: 'Spielbar', choppy: 'Ruckelig', heavy: 'Zu schwer' },
      bottleneck: { cpu: 'Der Prozessor ist die Grenze', gpu: 'Die Grafikkarte ist die Grenze' },
      tips: {
        'performance-mods': 'Füge Optimierungs-Mods hinzu, zum Beispiel Sodium, Lithium und FerriteCore (Fabric) oder Embeddium und ModernFix (Forge).',
        'ram-tight': 'Dieses Pack braucht mehr Arbeitsspeicher, als dein PC entbehren kann. Schließe andere Programme oder entferne schwere Mods.',
        'shader-integrated': 'Shader laufen auf einer integrierten Grafik schlecht. Spiele ohne Shader oder nimm ein sehr leichtes Shader-Pack.',
        'shader-heavy': 'Deine Grafikkarte wird mit Shadern auf hohen Einstellungen Mühe haben. Senke die Shader-Qualität oder die Renderauflösung.',
        'tech-cpu': 'Viele Technik-Mods belasten den Prozessor. Halte Maschinen in wenigen, geladenen Bereichen.',
        'lower-view-distance': 'Senke die Sichtweite auf den empfohlenen Wert für eine gleichmäßigere Bildrate.',
        'big-pack': 'Ein so großes Pack braucht einen langen ersten Start; gib ihm Zeit zum Laden.'
      }
    }
  };

  return { estimate, profile, capacity, gpuTier, tierFor, TEXT };
});
