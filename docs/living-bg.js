/* Living backgrounds: the still scene is animated on the GPU (WebGL). Masks mark the lake, the aurora,
   glowing elements, waterfalls and mist, so only those parts move. A second canvas adds falling blossoms
   or rising sparks. Without WebGL or with reduced motion, the still picture stays visible. */
(() => {
  'use strict';
  const scenes = document.querySelectorAll('[data-living]');
  if (!scenes.length) return;
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const ANCHOR_Y = 0.42; // matches object-position: center 42%
  const MAX_DPR = 1.5;

  const VERTEX = 'attribute vec2 aPos; void main() { gl_Position = vec4(aPos, 0.0, 1.0); }';
  const FRAGMENT = `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
uniform sampler2D uImg;
uniform sampler2D uMaskA;
uniform sampler2D uMaskB;
uniform vec2 uCanvas;
uniform vec2 uImage;
uniform float uScale;
uniform vec2 uOffset;
uniform float uTime;

float hash(vec2 cell) { return fract(sin(dot(cell, vec2(12.9898, 78.233))) * 43758.5453); }

void main() {
  vec2 pix = vec2(gl_FragCoord.x, uCanvas.y - gl_FragCoord.y);
  vec2 p = (pix - uOffset) / uScale;
  vec2 uv = clamp(p / uImage, 0.0, 1.0);
  vec3 ma = texture2D(uMaskA, uv).rgb; // R aurora, G lake water, B glowing elements
  vec3 mb = texture2D(uMaskB, uv).rgb; // R stars, G mist, B waterfalls

  // lake: ripples travel across the water and shift the reflections
  float ripple = sin(p.y * 0.11 + uTime * 1.3 + sin(p.x * 0.02 + uTime * 0.6) * 1.5)
               + 0.5 * sin(p.x * 0.045 - uTime * 0.9 + p.y * 0.08);
  vec2 wave = vec2(4.5 * ripple, 1.5 * sin(p.x * 0.05 + uTime * 1.1)) * ma.g;

  // aurora: the curtains sway sideways
  vec2 sway = vec2(12.0 * sin(p.y * 0.012 + uTime * 0.9) * ma.r, 0.0);
  vec2 q = clamp((p + wave + sway) / uImage, 0.0, 1.0);
  vec3 col = texture2D(uImg, q).rgb;

  // aurora: light bands run through the curtains, with fine vertical rays
  float curtain = 0.5 + 0.5 * sin(p.x * 0.036 - uTime * 1.2 + sin(p.y * 0.012 + uTime * 0.7) * 2.2);
  float rays = 0.6 + 0.4 * sin(p.x * 0.09 + uTime * 2.0 + sin(p.y * 0.03) * 3.0);
  float drift = 0.5 + 0.5 * sin(p.x * 0.0023 + uTime * 0.35 + p.y * 0.004);
  vec3 aurCol = mix(vec3(0.25, 1.0, 0.6), vec3(0.5, 0.35, 1.0), 0.5 + 0.5 * sin(p.x * 0.004 + uTime * 0.4));
  col += aurCol * ma.r * (0.2 + 0.8 * curtain) * rays * (0.6 + 0.4 * drift) * 0.9;

  // glowing elements: slow breathing light
  float breath = 0.5 + 0.5 * sin(uTime * 1.4 + p.x * 0.01 + p.y * 0.007);
  col *= 1.0 + ma.b * 0.6 * breath;

  // stars: twinkle in small clusters
  float twinkle = 0.5 + 0.5 * sin(uTime * 2.2 + hash(floor(p / 3.0)) * 6.2832);
  col += mb.r * twinkle * 0.9;

  // mist: a soft band drifts sideways
  vec2 mistUv = clamp(uv + vec2(0.02 * sin(uTime * 0.5), 0.0), 0.0, 1.0);
  float mist = texture2D(uMaskB, mistUv).g;
  col = mix(col, vec3(0.8, 0.84, 0.92), mist * 0.16 * (0.6 + 0.4 * sin(uTime * 0.8)));

  // waterfalls: light runs downwards
  float flow = 0.5 + 0.5 * sin(p.y * 0.07 - uTime * 5.0 + sin(p.x * 0.3) * 2.0);
  col += mb.b * flow * vec3(0.8, 0.9, 1.0) * 0.4;

  // lake: glints on bright water
  float bright = dot(col, vec3(0.3, 0.59, 0.11));
  col += ma.g * pow(max(bright - 0.55, 0.0) * 2.0, 2.0) * (0.5 + 0.5 * sin(p.x * 0.13 + p.y * 0.21 - uTime * 3.0)) * 0.8;

  gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}`;

  function loadImage(url) {
    return new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = reject;
      image.src = url;
    });
  }

  function compile(gl, type, source) {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      throw new Error(gl.getShaderInfoLog(shader));
    }
    return shader;
  }

  function createTexture(gl, image, unit) {
    gl.activeTexture(gl.TEXTURE0 + unit);
    const texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, image);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return texture;
  }

  function setupGl(canvas) {
    const gl = canvas.getContext('webgl', { alpha: false, antialias: false }) || canvas.getContext('experimental-webgl');
    if (!gl) return null;
    const program = gl.createProgram();
    gl.attachShader(program, compile(gl, gl.VERTEX_SHADER, VERTEX));
    gl.attachShader(program, compile(gl, gl.FRAGMENT_SHADER, FRAGMENT));
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program));
    gl.useProgram(program);
    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    const position = gl.getAttribLocation(program, 'aPos');
    gl.enableVertexAttribArray(position);
    gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
    const uniform = (name) => gl.getUniformLocation(program, name);
    return {
      gl,
      uCanvas: uniform('uCanvas'),
      uImage: uniform('uImage'),
      uScale: uniform('uScale'),
      uOffset: uniform('uOffset'),
      uTime: uniform('uTime'),
      uImg: uniform('uImg'),
      uMaskA: uniform('uMaskA'),
      uMaskB: uniform('uMaskB'),
    };
  }

  function makeParticles(kind, width, height, rangeX) {
    const count = Math.min(kind === 'spark' ? 80 : 110, Math.round((width * height) / 15000));
    const [x0, x1] = rangeX;
    const list = [];
    for (let i = 0; i < count; i += 1) {
      const random = Math.random;
      list.push({
        x: (x0 + random() * (x1 - x0)) * width,
        y: random() * height,
        size: kind === 'spark' ? 1.2 + random() * 2.2 : 5 + random() * 4,
        speed: kind === 'spark' ? 18 + random() * 30 : 16 + random() * 26,
        sway: kind === 'spark' ? 6 + random() * 10 : 14 + random() * 26,
        freq: 0.2 + random() * 0.45,
        phase: random() * Math.PI * 2,
        spin: (random() - 0.5) * 1.6,
        tint: random(),
      });
    }
    return list;
  }

  function drawBlossoms(ctx, list, time, width, height) {
    ctx.clearRect(0, 0, width, height);
    list.forEach((p) => {
      const y = ((p.y + p.speed * time) % (height + 24)) - 12;
      const x = p.x + Math.sin(time * p.freq + p.phase) * p.sway;
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(p.phase + time * p.spin);
      ctx.fillStyle = `rgba(255, ${190 + Math.round(p.tint * 25)}, ${215 + Math.round(p.tint * 20)}, 0.88)`;
      ctx.beginPath();
      ctx.ellipse(0, 0, p.size, p.size * 0.58, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    });
  }

  function drawSparks(ctx, list, time, width, height) {
    ctx.clearRect(0, 0, width, height);
    ctx.globalCompositeOperation = 'lighter';
    list.forEach((p) => {
      const y = height + 12 - ((p.y + p.speed * time) % (height + 24));
      const x = p.x + Math.sin(time * p.freq + p.phase) * p.sway;
      const alpha = 0.35 + 0.65 * (0.5 + 0.5 * Math.sin(time * 2.4 + p.phase));
      const glow = ctx.createRadialGradient(x, y, 0, x, y, p.size * 4);
      glow.addColorStop(0, `rgba(210, 255, 170, ${alpha})`);
      glow.addColorStop(1, 'rgba(210, 255, 170, 0)');
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(x, y, p.size * 4, 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.globalCompositeOperation = 'source-over';
  }

  function startScene(root) {
    const imageUrl = root.dataset.image;
    const maskAUrl = root.dataset.maskA;
    const maskBUrl = root.dataset.maskB;
    const particleKind = root.dataset.particles || '';
    const rangeX = (root.dataset.particleX || '0,1').split(',').map(Number);

    const glCanvas = document.createElement('canvas');
    glCanvas.className = 'living__gl';
    const fxCanvas = document.createElement('canvas');
    fxCanvas.className = 'living__fx';
    root.append(glCanvas, fxCanvas);
    const fx = fxCanvas.getContext('2d');

    const setup = setupGl(glCanvas);
    if (!setup) {
      glCanvas.remove();
      return;
    }
    const { gl } = setup;

    Promise.all([loadImage(imageUrl), loadImage(maskAUrl), loadImage(maskBUrl)]).then(([image, maskA, maskB]) => {
      createTexture(gl, image, 0);
      createTexture(gl, maskA, 1);
      createTexture(gl, maskB, 2);
      gl.uniform1i(setup.uImg, 0);
      gl.uniform1i(setup.uMaskA, 1);
      gl.uniform1i(setup.uMaskB, 2);
      gl.uniform2f(setup.uImage, image.naturalWidth, image.naturalHeight);

      let particles = [];
      let width = 0;
      let height = 0;

      function layout() {
        width = root.clientWidth;
        height = root.clientHeight;
        const dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
        const pxW = Math.round(width * dpr);
        const pxH = Math.round(height * dpr);
        glCanvas.width = pxW;
        glCanvas.height = pxH;
        fxCanvas.width = width;
        fxCanvas.height = height;
        // cover fit, same as CSS background-size: cover
        const scale = Math.max(pxW / image.naturalWidth, pxH / image.naturalHeight);
        gl.viewport(0, 0, pxW, pxH);
        gl.uniform2f(setup.uCanvas, pxW, pxH);
        gl.uniform1f(setup.uScale, scale);
        gl.uniform2f(setup.uOffset,
          (pxW - image.naturalWidth * scale) * 0.5,
          (pxH - image.naturalHeight * scale) * ANCHOR_Y);
        if (particleKind) particles = makeParticles(particleKind, width, height, rangeX);
      }

      const started = performance.now();
      function frame(now) {
        const time = (now - started) / 1000;
        gl.uniform1f(setup.uTime, time);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
        if (particleKind === 'spark') drawSparks(fx, particles, time, width, height);
        else if (particleKind) drawBlossoms(fx, particles, time, width, height);
        glCanvas.classList.add('is-ready');
        if (!reduceMotion.matches) requestAnimationFrame(frame);
      }

      new ResizeObserver(() => {
        layout();
        if (reduceMotion.matches) frame(performance.now());
      }).observe(root);
      layout();
      requestAnimationFrame(frame);
    }).catch(() => {
      glCanvas.remove();
    });
  }

  scenes.forEach((root) => {
    try {
      startScene(root);
    } catch (error) {
      // WebGL unavailable or shader failed: the still picture in the background stays visible
    }
  });
})();
