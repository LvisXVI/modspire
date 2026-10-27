const FACE_NAMES = ['north', 'south', 'east', 'west', 'up', 'down'];

export function createBlockbenchProject(element, textureSource, uuidFactory = () => crypto.randomUUID()) {
  const modelElements = element.javaModel?.elements?.length ? element.javaModel.elements : defaultGeometry(element.kind);
  const elements = modelElements.map((source, index) => {
    const uuid = uuidFactory();
    const rotation = source.rotation;
    const faceDefaults = source.faces || {};
    const faces = {};
    for (const name of FACE_NAMES) {
      const face = faceDefaults[name];
      if (face === undefined && source.faces) continue;
      faces[name] = {
        uv: [...(face?.uv || [0, 0, 16, 16])],
        texture: 0,
        ...(face?.rotation ? { rotation: face.rotation } : {}),
        ...(face?.cullface ? { cullface: face.cullface } : {}),
        ...(Number.isInteger(face?.tintindex) ? { tint: face.tintindex } : {}),
      };
    }
    return {
      name: source.name || `${element.name} ${index + 1}`,
      type: 'cube',
      uuid,
      from: [...source.from],
      to: [...source.to],
      origin: rotation ? [...rotation.origin] : [8, 8, 8],
      rotation: rotation ? [rotation.axis === 'x' ? rotation.angle : 0, rotation.axis === 'y' ? rotation.angle : 0, rotation.axis === 'z' ? rotation.angle : 0] : [0, 0, 0],
      rescale: Boolean(rotation?.rescale),
      autouv: 0,
      color: 0,
      faces,
    };
  });
  const textureUuid = uuidFactory();
  return {
    meta: { format_version: '5.0', model_format: 'java_block', box_uv: false },
    name: element.identifier,
    parent: element.javaModel?.parent || '',
    ambientocclusion: element.javaModel?.ambientocclusion !== false,
    front_gui_light: false,
    visible_box: [1, 1, 0],
    variable_placeholders: '',
    variable_placeholder_buttons: [],
    resolution: { width: 16, height: 16 },
    elements,
    groups: [],
    outliner: elements.map((modelElement) => modelElement.uuid),
    textures: [{
      path: '',
      name: `${element.identifier}.png`,
      folder: '',
      namespace: '',
      id: '0',
      particle: true,
      render_mode: 'default',
      visible: true,
      mode: 'bitmap',
      saved: false,
      uuid: textureUuid,
      source: textureSource,
    }],
    ...(element.javaModel?.display ? { display: structuredClone(element.javaModel.display) } : {}),
  };
}

export function importBlockbenchProject(project) {
  if (!project || project.meta?.model_format !== 'java_block' || !Array.isArray(project.elements)) {
    throw new Error('Bitte ein Blockbench-Projekt im Format „Java Block/Item“ auswählen.');
  }
  if (project.textures !== undefined && !Array.isArray(project.textures)) throw new Error('Die Blockbench-Texturliste ist ungültig.');
  const resolution = project.resolution || { width: 16, height: 16 };
  if (project.textures?.some((texture) => texture.source) && (resolution.width !== 16 || resolution.height !== 16)) {
    throw new Error('Dieses Projekt nutzt eine andere Texturgröße. Mod Studio übernimmt derzeit Blockbench-Texturen mit 16 × 16 Pixeln.');
  }
  const usedTextures = new Set();
  const elements = project.elements.map((element) => {
    if (element.type && element.type !== 'cube') throw new Error('Mod Studio kann aus Blockbench derzeit Java-Würfelgeometrie übernehmen.');
    const rotation = Array.isArray(element.rotation) ? element.rotation : [0, 0, 0];
    const nonzero = rotation.map((value, index) => ({ value, axis: ['x', 'y', 'z'][index] })).filter((item) => Math.abs(item.value) > 0.0001);
    if (nonzero.length > 1) throw new Error('Minecraft Java erlaubt in diesem Modell nur eine Rotationsachse pro Cube. Passe die Rotation in Blockbench an.');
    const faces = {};
    for (const direction of FACE_NAMES) {
      const source = element.faces?.[direction];
      if (!source || source.texture === false) continue;
      // Cubes added in Blockbench start without a texture; Mod Studio has one texture per element, so they get it.
      const textureId = source.texture === null || source.texture === undefined ? 0 : Number(source.texture);
      if (!Number.isInteger(textureId) || textureId < 0 || textureId >= (project.textures?.length || 1)) {
        throw new Error('Eine Cube-Seite verweist auf eine unbekannte Blockbench-Textur.');
      }
      usedTextures.add(textureId);
      faces[direction] = {
        ...(Array.isArray(source.uv) ? { uv: [...source.uv] } : {}),
        texture: '#all',
        ...(source.rotation ? { rotation: source.rotation } : {}),
        ...(source.cullface ? { cullface: source.cullface } : {}),
        ...(Number.isInteger(source.tint) ? { tintindex: source.tint } : {}),
      };
    }
    return {
      from: [...element.from],
      to: [...element.to],
      ...(nonzero.length ? { rotation: { origin: [...(element.origin || [8, 8, 8])], axis: nonzero[0].axis, angle: nonzero[0].value, ...(element.rescale ? { rescale: true } : {}) } } : {}),
      faces,
    };
  });
  if (usedTextures.size > 1) throw new Error('Dieses Blockbench-Modell nutzt mehrere Texturen. Mod Studio kann pro Mod-Element derzeit eine Textur verwenden.');
  const textureSource = usedTextures.size ? project.textures?.[Array.from(usedTextures)[0]]?.source || null : null;
  return {
    javaModel: {
      ...(typeof project.parent === 'string' && project.parent ? { parent: project.parent } : {}),
      textures: { all: 'blockbench:source' },
      elements,
      ...(project.display ? { display: structuredClone(project.display) } : {}),
    },
    textureSource,
  };
}

function defaultGeometry(kind) {
  const from = kind === 'item' ? [4, 0, 7.5] : [0, 0, 0];
  const to = kind === 'item' ? [12, 16, 8.5] : [16, 16, 16];
  const faces = Object.fromEntries(FACE_NAMES.map((name) => [name, { uv: [0, 0, 16, 16], texture: '#all' }]));
  return [{ name: kind === 'item' ? 'Item-Grundform' : 'Block-Grundform', from, to, faces }];
}

