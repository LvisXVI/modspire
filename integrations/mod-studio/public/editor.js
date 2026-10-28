export const TEXTURE_SIZES = [16, 32, 64, 128];

export function createPixelEditor(canvas, initialTexture, onChange) {
  const context = canvas.getContext('2d', { alpha: false });
  let SIZE = TEXTURE_SIZES.includes(initialTexture.size) ? initialTexture.size : 16;
  let pixels = [...initialTexture.pixels];
  let color = '#465E84';
  let tool = 'pencil';
  let isDrawing = false;
  let undoStack = [];
  let redoStack = [];
  let onCommit = onChange;
  const colors = ['#465E84', '#29354A', '#79899E', '#C6A875', '#E7D9B7', '#F4F2EC', '#B8674D', '#71936B', '#D8B858', '#94B8BE', '#B579AD', '#4D7655'];

  function draw() {
    const width = canvas.width;
    const height = canvas.height;
    const cell = width / SIZE;
    context.fillStyle = '#202426';
    context.fillRect(0, 0, width, canvas.height);
    for (let y = 0; y < SIZE; y += 1) {
      for (let x = 0; x < SIZE; x += 1) {
        context.fillStyle = (x + y) % 2 === 0 ? '#24292b' : '#1c2022';
        context.fillRect(x * cell, y * cell, cell, cell);
        const pixel = pixels[y * SIZE + x];
        if (pixel) {
          context.fillStyle = pixel;
          const inset = cell >= 8 ? 1 : 0;
          context.fillRect(x * cell + inset, y * cell + inset, cell - inset * 2, cell - inset * 2);
        }
      }
    }
    context.strokeStyle = 'rgba(220, 230, 224, .11)';
    context.lineWidth = 1;
    const gridStep = SIZE > 32 ? 8 : 1;
    for (let index = 0; index <= SIZE; index += gridStep) {
      const pos = Math.round(index * cell) + 0.5;
      context.beginPath(); context.moveTo(pos, 0); context.lineTo(pos, height); context.stroke();
      context.beginPath(); context.moveTo(0, pos); context.lineTo(width, pos); context.stroke();
    }
  }

  function coordinate(event) {
    const bounds = canvas.getBoundingClientRect();
    return {
      x: Math.max(0, Math.min(SIZE - 1, Math.floor(((event.clientX - bounds.left) / bounds.width) * SIZE))),
      y: Math.max(0, Math.min(SIZE - 1, Math.floor(((event.clientY - bounds.top) / bounds.height) * SIZE))),
    };
  }

  function commit() {
    draw();
    onCommit({ size: SIZE, pixels: [...pixels] });
  }

  function snapshot() {
    undoStack.push([...pixels]);
    if (undoStack.length > 50) undoStack.shift();
    redoStack = [];
  }

  function setPixel(x, y) {
    const index = y * SIZE + x;
    const next = tool === 'eraser' ? null : color;
    if (pixels[index] === next) return;
    pixels[index] = next;
    draw();
  }

  function fillAt(startX, startY) {
    const startIndex = startY * SIZE + startX;
    const original = pixels[startIndex];
    if (original === color) return;
    snapshot();
    const stack = [[startX, startY]];
    while (stack.length) {
      const [x, y] = stack.pop();
      if (x < 0 || x >= SIZE || y < 0 || y >= SIZE) continue;
      const index = y * SIZE + x;
      if (pixels[index] !== original) continue;
      pixels[index] = color;
      stack.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]);
    }
    commit();
  }

  function pointerDown(event) {
    event.preventDefault();
    const { x, y } = coordinate(event);
    if (tool === 'fill') return fillAt(x, y);
    snapshot();
    isDrawing = true;
    canvas.setPointerCapture(event.pointerId);
    setPixel(x, y);
  }

  function pointerMove(event) {
    if (!isDrawing) return;
    const { x, y } = coordinate(event);
    setPixel(x, y);
  }

  function pointerUp() {
    if (!isDrawing) return;
    isDrawing = false;
    commit();
  }

  canvas.addEventListener('pointerdown', pointerDown);
  canvas.addEventListener('pointermove', pointerMove);
  canvas.addEventListener('pointerup', pointerUp);
  canvas.addEventListener('pointercancel', pointerUp);
  draw();

  return {
    setTool(value) { tool = ['pencil', 'eraser', 'fill'].includes(value) ? value : 'pencil'; },
    setColor(value) { if (/^#[\da-f]{6}$/i.test(value)) color = value.toUpperCase(); },
    setTexture(texture) { SIZE = TEXTURE_SIZES.includes(texture.size) ? texture.size : 16; pixels = [...texture.pixels]; undoStack = []; redoStack = []; draw(); },
    getSize() { return SIZE; },
    setChangeHandler(callback) { onCommit = callback; },
    getTexture() { return { size: SIZE, pixels: [...pixels] }; },
    undo() { if (!undoStack.length) return; redoStack.push([...pixels]); pixels = undoStack.pop(); commit(); },
    redo() { if (!redoStack.length) return; undoStack.push([...pixels]); pixels = redoStack.pop(); commit(); },
    clear() { if (pixels.every((pixel) => pixel === null)) return; snapshot(); pixels.fill(null); commit(); },
    getPalette() { return [...colors]; },
    destroy() {
      canvas.removeEventListener('pointerdown', pointerDown);
      canvas.removeEventListener('pointermove', pointerMove);
      canvas.removeEventListener('pointerup', pointerUp);
      canvas.removeEventListener('pointercancel', pointerUp);
    },
  };
}

export function renderVoxelPreview(canvas, pixels, element, rotation = 0) {
  const context = canvas.getContext('2d');
  const width = canvas.width;
  const height = canvas.height;
  const side = TEXTURE_SIZES.find((value) => value * value === pixels?.length) || 16;
  const texture = pixels?.length === side * side ? pixels : Array(side * side).fill(null);
  context.clearRect(0, 0, width, height);
  if (!element) return;
  const centerX = width / 2;
  const centerY = height * 0.54;
  const scale = width * 0.4;
  const angle = rotation * Math.PI / 2;
  const point = (x, y, z) => {
    const rx = x * Math.cos(angle) - z * Math.sin(angle);
    const rz = x * Math.sin(angle) + z * Math.cos(angle);
    return [centerX + (rx - rz) * scale * 0.5, centerY + (rx + rz) * scale * 0.25 - y * scale * 0.58];
  };
  const path = (vertices, color) => {
    context.beginPath();
    vertices.map(([x, y, z]) => point(x, y, z)).forEach(([x, y], index) => index ? context.lineTo(x, y) : context.moveTo(x, y));
    context.closePath();
    context.fillStyle = color;
    context.fill();
    context.strokeStyle = 'rgba(30,43,59,.12)';
    context.lineWidth = 1;
    context.stroke();
  };
  if (element.javaModel?.elements?.length) {
    drawJavaModelPreview(context, element.javaModel.elements, texture, width, height, rotation);
    return;
  }
  if (element.kind === 'item') {
    const sprite = createTextureCanvas(texture);
    const spriteSize = scale * 0.72;
    context.save();
    context.translate(centerX, height * 0.5);
    context.rotate(-Math.PI / 8 + rotation * Math.PI / 18);
    context.transform(1, 0.12, -0.08, 0.96, 0, 0);
    context.shadowColor = 'rgba(0, 0, 0, 0.38)';
    context.shadowBlur = 16;
    context.shadowOffsetY = 13;
    context.imageSmoothingEnabled = false;
    context.drawImage(sprite, -spriteSize / 2, -spriteSize / 2, spriteSize, spriteSize);
    context.restore();
    return;
  }
  const size = 1;
  path([[0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]], '#6F87A4');
  path([[1, 0, 0], [1, 0, 1], [1, 1, 1], [1, 1, 0]], '#536B89');
  path([[0, 1, 0], [1, 1, 0], [1, 1, 1], [0, 1, 1]], '#8FA0B4');

  if (element?.kind === 'block') {
    drawTexturePlane(texture, (u, v) => point(u, 1 - v, 1.002), context, size);
    drawTexturePlane(texture, (u, v) => point(1.002, 1 - v, 1 - u), context, size);
    drawTexturePlane(texture, (u, v) => point(u, 1 - v, 0.002), context, size);
  }

  function drawTexturePlane(texturePixels, map, ctx, extent) {
    const n = textureSide(texturePixels);
    const scratch = createTextureCanvas(texturePixels);
    const [a, b] = map(0, 0), [c, d] = map(extent, 0), [e, f] = map(0, extent);
    ctx.save();
    ctx.setTransform((c - a) / n, (d - b) / n, (e - a) / n, (f - b) / n, a, b);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(scratch, 0, 0);
    ctx.restore();
  }

  function parseHex(value) { const n = Number.parseInt(value.slice(1, 7), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255, value.length === 9 ? Number.parseInt(value.slice(7, 9), 16) : 255]; }
}

function textureSide(texturePixels) { return TEXTURE_SIZES.find((value) => value * value === texturePixels?.length) || 16; }

function createTextureCanvas(texturePixels) {
  const side = textureSide(texturePixels);
  const canvas = document.createElement('canvas');
  canvas.width = side; canvas.height = side;
  const context = canvas.getContext('2d');
  const image = context.createImageData(side, side);
  texturePixels.forEach((pixel, index) => {
    const value = pixel || '#ffffff';
    const packed = Number.parseInt(value.slice(1, 7), 16);
    const color = [(packed >> 16) & 255, (packed >> 8) & 255, packed & 255, value.length === 9 ? Number.parseInt(value.slice(7, 9), 16) : 255];
    const offset = index * 4;
    image.data[offset] = color[0]; image.data[offset + 1] = color[1]; image.data[offset + 2] = color[2]; image.data[offset + 3] = pixel ? color[3] : 0;
  });
  context.putImageData(image, 0, 0);
  return canvas;
}

function drawJavaModelPreview(context, elements, pixels, width, height, cameraRotation) {
  const cubes = elements.map((element) => {
    const [x0, y0, z0] = element.from, [x1, y1, z1] = element.to;
    const points = [[x0,y0,z0],[x1,y0,z0],[x0,y1,z0],[x1,y1,z0],[x0,y0,z1],[x1,y0,z1],[x0,y1,z1],[x1,y1,z1]];
    if (element.rotation) points.forEach((point) => rotateBlockbenchPoint(point, element.rotation));
    return { element, points };
  });
  const all = cubes.flatMap(({ points }) => points);
  const center = [0, 1, 2].map((axis) => (Math.min(...all.map((point) => point[axis])) + Math.max(...all.map((point) => point[axis]))) / 2);
  const span = Math.max(16, ...[0, 1, 2].map((axis) => Math.max(...all.map((point) => point[axis])) - Math.min(...all.map((point) => point[axis]))));
  const scale = width * 0.4 * 16 / span;
  const angle = cameraRotation * Math.PI / 2;
  const project = ([x, y, z]) => {
    const localX = (x - center[0]) / 16, localZ = (z - center[2]) / 16;
    const rx = localX * Math.cos(angle) - localZ * Math.sin(angle);
    const rz = localX * Math.sin(angle) + localZ * Math.cos(angle);
    return [width / 2 + (rx - rz) * scale * 0.5, height * 0.54 + (rx + rz) * scale * 0.25 - ((y - center[1]) / 16) * scale * 0.58];
  };
  const textureCanvas = document.createElement('canvas'); textureCanvas.width = side; textureCanvas.height = side;
  const textureContext = textureCanvas.getContext('2d');
  const textureImage = textureContext.createImageData(side, side);
  pixels.forEach((hex, index) => {
    if (!hex) return;
    const rgb = Number.parseInt(hex.slice(1, 7), 16), offset = index * 4;
    textureImage.data[offset] = (rgb >> 16) & 255; textureImage.data[offset + 1] = (rgb >> 8) & 255; textureImage.data[offset + 2] = rgb & 255; textureImage.data[offset + 3] = hex.length === 9 ? Number.parseInt(hex.slice(7, 9), 16) : 255;
  });
  textureContext.putImageData(textureImage, 0, 0);
  for (const { element, points } of cubes) {
    const faces = [
      [element.faces.south, [points[6], points[7], points[3], points[2]], 0.76],
      [element.faces.east, [points[7], points[5], points[1], points[3]], 0.57],
      [element.faces.up, [points[2], points[3], points[7], points[6]], 1.12],
    ];
    for (const [face, vertices, brightness] of faces) {
      if (!face) continue;
      const projected = vertices.map(project);
      const [u1, v1, u2, v2] = face.uv || [0, 0, 16, 16];
      const uvWidth = u2 - u1 || 1, uvHeight = v2 - v1 || 1;
      const [p0, p1, p2] = projected;
      context.save();
      context.beginPath(); projected.forEach(([x, y], index) => index ? context.lineTo(x, y) : context.moveTo(x, y)); context.closePath(); context.clip();
      context.setTransform((p1[0] - p0[0]) / uvWidth, (p1[1] - p0[1]) / uvWidth, (p2[0] - p0[0]) / uvHeight, (p2[1] - p0[1]) / uvHeight, p0[0] - ((p1[0] - p0[0]) / uvWidth) * u1 - ((p2[0] - p0[0]) / uvHeight) * v1, p0[1] - ((p1[1] - p0[1]) / uvWidth) * u1 - ((p2[1] - p0[1]) / uvHeight) * v1);
      context.imageSmoothingEnabled = false; context.drawImage(textureCanvas, 0, 0, 16, 16);
      if (brightness < 1) { context.fillStyle = `rgba(0,0,0,${1 - brightness})`; context.fillRect(-512, -512, 1024, 1024); }
      context.restore();
      context.beginPath(); projected.forEach(([x, y], index) => index ? context.lineTo(x, y) : context.moveTo(x, y)); context.closePath();
      context.strokeStyle = 'rgba(30,43,59,.3)'; context.lineWidth = 1; context.stroke();
    }
  }
}

function rotateBlockbenchPoint(point, rotation) {
  const origin = rotation.origin || [8, 8, 8];
  const [x, y, z] = point.map((value, index) => value - origin[index]);
  const angles = rotation.axis ? [rotation.axis === 'x' ? rotation.angle : 0, rotation.axis === 'y' ? rotation.angle : 0, rotation.axis === 'z' ? rotation.angle : 0].map((value) => value * Math.PI / 180) : rotation;
  const [rx, ry, rz] = angles || [0, 0, 0];
  const afterX = [x, y * Math.cos(rx) - z * Math.sin(rx), y * Math.sin(rx) + z * Math.cos(rx)];
  const afterY = [afterX[0] * Math.cos(ry) + afterX[2] * Math.sin(ry), afterX[1], -afterX[0] * Math.sin(ry) + afterX[2] * Math.cos(ry)];
  const afterZ = [afterY[0] * Math.cos(rz) - afterY[1] * Math.sin(rz), afterY[0] * Math.sin(rz) + afterY[1] * Math.cos(rz), afterY[2]];
  point[0] = origin[0] + afterZ[0]; point[1] = origin[1] + afterZ[1]; point[2] = origin[2] + afterZ[2];
}
