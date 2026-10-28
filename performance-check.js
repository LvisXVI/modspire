'use strict';
// Pack lab card "Performance check": measures this computer (a short CPU and graphics test plus memory) and estimates
// how the current modpack will run on it. The estimate itself lives in performance-estimate.js.
(() => {
  const english = () => (window.workshopI18n?.locale || document.documentElement.lang || 'de').startsWith('en');
  const t = (de, en) => (english() ? en : de);
  const CPU_REF = 36000;   // single-thread benchmark result (loop iterations per ms) that counts as score 100
  let hardware = null;

  function cpuBench(ms = 600) {
    const end = performance.now() + ms, floats = new Float64Array(4096), ints = new Int32Array(4096);
    let ops = 0, x = 1.0001;
    const start = performance.now();
    while (performance.now() < end) {
      for (let k = 0; k < 4096; k++) { x = x * 1.0000001 + Math.sqrt(k + x) % 3; floats[k] = x; ints[k] = (ints[(k + 7) & 4095] * 31 + k) | 0; }
      ops += 4096;
    }
    return ops / (performance.now() - start);
  }

  function gpuBench(ms = 600) {
    try {
      const canvas = document.createElement('canvas'); canvas.width = canvas.height = 512;
      const gl = canvas.getContext('webgl'); if (!gl) return { name: '', fps: 0 };
      const info = gl.getExtension('WEBGL_debug_renderer_info');
      const name = info ? String(gl.getParameter(info.UNMASKED_RENDERER_WEBGL)) : '';
      const compile = (type, source) => { const shader = gl.createShader(type); gl.shaderSource(shader, source); gl.compileShader(shader); return shader; };
      const program = gl.createProgram();
      gl.attachShader(program, compile(gl.VERTEX_SHADER, 'attribute vec2 p;varying vec2 v;void main(){v=p;gl_Position=vec4(p,0.,1.);}'));
      gl.attachShader(program, compile(gl.FRAGMENT_SHADER, 'precision mediump float;varying vec2 v;void main(){float a=0.;for(int i=0;i<24;i++){a+=sin(v.x*float(i)+a)*cos(v.y*float(i)-a);}gl_FragColor=vec4(a,v,1.);}'));
      gl.linkProgram(program); gl.useProgram(program);
      const buffer = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
      const triangles = new Float32Array(6 * 600);
      for (let i = 0; i < triangles.length; i += 6) { const cx = Math.random() * 2 - 1, cy = Math.random() * 2 - 1; triangles.set([cx, cy, cx + .6, cy, cx, cy + .6], i); }
      gl.bufferData(gl.ARRAY_BUFFER, triangles, gl.STATIC_DRAW);
      const location = gl.getAttribLocation(program, 'p'); gl.enableVertexAttribArray(location); gl.vertexAttribPointer(location, 2, gl.FLOAT, false, 0, 0);
      let frames = 0; const start = performance.now();
      while (performance.now() - start < ms) { gl.drawArrays(gl.TRIANGLES, 0, 1800); gl.finish(); frames++; }
      return { name, fps: frames / ((performance.now() - start) / 1000) };
    } catch { return { name: '', fps: 0 }; }
  }

  async function measure() {
    const system = (await window.workshop?.getHardware?.().catch(() => null)) || {};
    const threads = system.threads || navigator.hardwareConcurrency || 4;
    await new Promise(resolve => setTimeout(resolve, 50));
    const cpu = cpuBench();
    const gpu = gpuBench();
    hardware = {
      cpuModel: system.cpuModel || '', threads, cores: system.cores || Math.max(1, Math.round(threads / 2)),
      ramMB: system.ramMB || Math.round((navigator.deviceMemory || 8) * 1024),
      cpuScore: Math.round(cpu / CPU_REF * 100), gpuName: gpu.name, gpuScore: Math.round(Math.min(400, gpu.fps / 60 * 80))
    };
    return hardware;
  }

  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const gb = mb => (mb / 1024).toFixed(mb % 1024 ? 1 : 0) + ' GB';

  function gpuLabel(raw) {
    const text = String(raw || '');
    const angle = /^ANGLE \([^,]+, (.+?)(?: \(0x[0-9A-Fa-f]+\))?(?: Direct3D[^,]*)?(?:, [^,]*)?\)$/.exec(text);
    return (angle ? angle[1] : text).replace(/\s+/g, ' ').trim();
  }

  function ensureCard() {
    let card = document.getElementById('perf-card');
    if (card) return card;
    const host = document.querySelector('#lab-panel .lab-content');
    if (!host || typeof PerformanceEstimate === 'undefined') return null;
    card = document.createElement('article'); card.className = 'lab-card perf-card'; card.id = 'perf-card';
    const anchor = host.querySelector('.compass-card');
    if (anchor?.nextSibling) host.insertBefore(card, anchor.nextSibling); else host.append(card);
    return card;
  }

  function meter(label, load, capacity, hint) {
    const ratio = Math.max(0, Math.min(1, load / Math.max(1, capacity)));
    const level = ratio > .85 ? 'hot' : ratio > .55 ? 'warm' : 'cool';
    return `<div class="perf-meter"><span>${esc(label)}</span><div class="perf-bar" role="img" aria-label="${esc(label)} ${Math.round(ratio * 100)} %"><i class="${level}" style="width:${Math.round(ratio * 100)}%"></i></div><small>${esc(hint)}</small></div>`;
  }

  function render() {
    const card = ensureCard(); if (!card) return;
    const text = PerformanceEstimate.TEXT[english() ? 'en' : 'de'];
    const mods = (typeof state !== 'undefined' ? state : window.state)?.project?.mods || [];
    let body = '';
    if (!hardware) {
      body = `<p class="perf-hint">${esc(t('Ein kurzer Test (ca. 2 Sekunden) misst Prozessor, Grafikkarte und Arbeitsspeicher dieses PCs. Nichts wird hochgeladen.', 'A short test (about 2 seconds) measures this PC\'s processor, graphics card and memory. Nothing is uploaded.'))}</p>`;
    } else {
      const result = PerformanceEstimate.estimate(mods, hardware);
      const cpuShare = result.load.cpu / (result.capacity.cpu / 100 * 60);
      const gpuShare = result.load.gpu / (result.capacity.gpu / 100 * 60);
      body = `<div class="perf-hw">${esc(hardware.cpuModel || t('Prozessor', 'Processor'))} · ${hardware.threads} ${esc(t('Threads', 'threads'))} · ${esc(gb(hardware.ramMB))} · ${esc(gpuLabel(hardware.gpuName) || t('Grafik unbekannt', 'graphics unknown'))}</div>
        <div class="perf-result perf-${result.tier}"><strong>${esc(text.tier[result.tier])}</strong><span>${mods.length ? `≈ ${result.fpsLow}–${result.fpsHigh} FPS` : esc(t('ohne Mods (Vanilla-Wert)', 'without mods (vanilla value)'))}</span></div>
        ${meter('CPU', cpuShare * 100, 100, mods.length && result.bottleneck === 'cpu' ? text.bottleneck.cpu : '')}${meter(t('Grafik', 'GPU'), gpuShare * 100, 100, mods.length && result.bottleneck === 'gpu' ? text.bottleneck.gpu : '')}
        ${meter('RAM', result.ram.needMB, result.ram.totalMB - 3072 > 0 ? result.ram.totalMB - 3072 : result.ram.totalMB, `${t('Empfohlen für Minecraft', 'Recommended for Minecraft')}: ${gb(result.ram.allocateMB)}`)}
        <p class="perf-line">${esc(t('Empfohlene Sichtweite', 'Recommended render distance'))}: <b>${result.viewDistance}</b> · ${esc(t('Engpass', 'Bottleneck'))}: <b>${result.bottleneck === 'cpu' ? 'CPU' : esc(t('Grafik', 'GPU'))}</b></p>
        ${result.tips.length ? `<ul class="perf-tips">${result.tips.map(tip => `<li>${esc(text.tips[tip])}</li>`).join('')}</ul>` : `<p class="perf-line">${esc(t('Keine Auffälligkeiten.', 'Nothing stands out.'))}</p>`}
        <p class="perf-hint">${esc(t('Schätzung aus Mod-Namen, Beschreibungen und einem Kurztest, keine Garantie.', 'An estimate from mod names, descriptions and a short test, not a guarantee.'))}</p>`;
    }
    card.innerHTML = `<div class="lab-card-head"><span class="lab-icon">⚡</span><div><h3>${esc(t('Performance-Check', 'Performance check'))}</h3><p>${esc(t('Wie läuft dieses Pack auf deinem PC?', 'How will this pack run on your PC?'))}</p></div></div>
      <div class="perf-body">${body}</div><button class="button" id="perf-run" type="button">${esc(hardware ? t('Erneut messen', 'Measure again') : t('Messen & schätzen', 'Measure & estimate'))}</button>`;
    card.querySelector('#perf-run').onclick = async event => {
      const button = event.currentTarget; button.disabled = true; button.textContent = t('Misst …', 'Measuring …');
      try { await measure(); } finally { render(); }
    };
  }

  function start() {
    render();
    const count = document.getElementById('lab-mod-count');
    if (count) new MutationObserver(() => { if (hardware) render(); }).observe(count, { childList: true, characterData: true, subtree: true });
    document.addEventListener('click', event => { if (event.target.closest('[data-view=lab], #language-toggle')) setTimeout(render, 120); }, true);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => setTimeout(start, 400), { once: true }); else setTimeout(start, 400);
  window.PerformanceCheck = { measure, render, getHardware: () => hardware, setHardware: value => { hardware = value; render(); } };
})();
