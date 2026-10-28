import { mkdir, writeFile, rm, readdir, readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { join, resolve } from 'node:path';
import { existsSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
import { makeZip } from './zip.js';
import { rewriteJavaModelTextures } from './blockbench.js';

export function createGenerator({ dataDir, runtimeDir }) {
  function toolchainReady() {
    const java = process.platform === 'win32' ? 'java.exe' : 'java';
    const javac = process.platform === 'win32' ? 'javac.exe' : 'javac';
    const gradle = process.platform === 'win32' ? 'gradle.bat' : 'gradle';
    return Boolean(runtimeDir?.jdk && runtimeDir?.gradle && existsSync(join(runtimeDir.jdk, 'bin', java)) && existsSync(join(runtimeDir.jdk, 'bin', javac)) && existsSync(join(runtimeDir.gradle, 'bin', gradle)));
  }

  function generate(project) {
    const namespace = project.namespace;
    const javaPackage = `com.modstudio.${namespace.replace(/[^a-z0-9_]/g, '_')}`;
    const classElements = project.elements.map((element) => element.kind === 'block'
      ? `    private static final ResourceKey<Block> BLOCK_ID_${constant(element.identifier)} = ResourceKey.create(Registries.BLOCK, id("${element.identifier}"));`
      : `    private static final ResourceKey<Item> ID_${constant(element.identifier)} = ResourceKey.create(Registries.ITEM, id("${element.identifier}"));`).join('\n');
    const registrations = project.elements.map((element) => {
      const name = constant(element.identifier);
      if (element.kind === 'block') {
        const hardness = Number(element.properties?.hardness ?? 2);
        const resistance = Number(element.properties?.resistance ?? 3);
        const luminance = Math.round(Math.max(0, Math.min(15, Number(element.properties?.luminance ?? 0))));
        const toolRequirement = element.properties?.requiresTool ? '.requiresCorrectToolForDrops()' : '';
        const itemKey = `ResourceKey.create(Registries.ITEM, id("${element.identifier}"))`;
        return `        Block ${name} = new Block(BlockBehaviour.Properties.of().setId(BLOCK_ID_${name}).strength(${hardness}f, ${resistance}f).lightLevel(state -> ${luminance})${toolRequirement});\n        Registry.register(BuiltInRegistries.BLOCK, BLOCK_ID_${name}, ${name});\n        ResourceKey<Item> ${name}_ITEM_ID = ${itemKey};\n        Registry.register(BuiltInRegistries.ITEM, ${name}_ITEM_ID, new BlockItem(${name}, new Item.Properties().useBlockDescriptionPrefix().setId(${name}_ITEM_ID)));\n        CreativeModeTabEvents.modifyOutputEvent(CreativeModeTabs.BUILDING_BLOCKS).register(tab -> tab.accept(${name}.asItem()));`;
      }
      const stack = Math.max(1, Math.min(99, element.properties?.maxStackSize || 64));
      const fireResistant = element.properties?.fireResistant ? '.fireResistant()' : '';
      return `        Item ${name} = new Item(new Item.Properties().setId(ID_${name}).stacksTo(${stack})${fireResistant});\n        Registry.register(BuiltInRegistries.ITEM, ID_${name}, ${name});\n        CreativeModeTabEvents.modifyOutputEvent(CreativeModeTabs.INGREDIENTS).register(tab -> tab.accept(${name}));`;
    }).join('\n');
    const files = [
      { path: 'settings.gradle', content: `pluginManagement { repositories { maven { url = 'https://maven.fabricmc.net/' }; gradlePluginPortal() } }\nrootProject.name = '${namespace}'\n` },
      { path: 'gradle.properties', content: 'org.gradle.jvmargs=-Xmx1G\norg.gradle.parallel=true\nminecraft_version=26.2\nloader_version=0.19.5\nloom_version=1.18-SNAPSHOT\nfabric_api_version=0.161.0+26.2\n' },
      { path: 'build.gradle', content: `plugins { id 'net.fabricmc.fabric-loom' version "\${loom_version}"; id 'maven-publish' }\n\nrepositories { }\n\ndependencies {\n    minecraft "com.mojang:minecraft:\${project.minecraft_version}"\n    implementation "net.fabricmc:fabric-loader:\${project.loader_version}"\n    implementation "net.fabricmc.fabric-api:fabric-api:\${project.fabric_api_version}"\n}\n\nversion = '1.0.0'\ngroup = '${javaPackage}'\nbase { archivesName = '${namespace}' }\ndef modVersion = version.toString()\n\ntasks.withType(JavaCompile).configureEach { it.options.release = 25 }\njava { sourceCompatibility = JavaVersion.VERSION_25; targetCompatibility = JavaVersion.VERSION_25 }\n\nprocessResources { inputs.property 'version', modVersion; filesMatching('fabric.mod.json') { expand 'version': modVersion } }\n` },
      { path: 'src/main/resources/fabric.mod.json', content: JSON.stringify({ schemaVersion: 1, id: namespace, version: '${version}', name: project.name, description: project.description || 'Mit Mod Studio erstellt.', authors: ['Mod Studio creator'], environment: '*', entrypoints: { main: [`${javaPackage}.ModEntry`] }, depends: { fabricloader: '>=0.19.5', minecraft: '~26.2', java: '>=25', 'fabric-api': '*' } }, null, 2) },
      { path: `src/main/java/${javaPackage.replaceAll('.', '/')}/ModEntry.java`, content: `package ${javaPackage};\n\nimport net.fabricmc.api.ModInitializer;\nimport net.fabricmc.fabric.api.creativetab.v1.CreativeModeTabEvents;\nimport net.minecraft.core.Registry;\nimport net.minecraft.core.registries.BuiltInRegistries;\nimport net.minecraft.world.level.block.Block;\nimport net.minecraft.world.level.block.state.BlockBehaviour;\nimport net.minecraft.world.item.BlockItem;\nimport net.minecraft.core.registries.Registries;\nimport net.minecraft.resources.ResourceKey;\nimport net.minecraft.resources.Identifier;\nimport net.minecraft.world.item.CreativeModeTabs;\nimport net.minecraft.world.item.Item;\n\npublic final class ModEntry implements ModInitializer {\n    private static Identifier id(String path) { return Identifier.fromNamespaceAndPath("${namespace}", path); }\n${classElements}\n\n    @Override public void onInitialize() {\n${registrations}\n    }\n}\n` },
      { path: 'README.md', content: `# ${project.name}\n\nGenerated locally by Mod Studio for Minecraft Java 26.2 with Fabric.\n\nBuild with the Gradle distribution and JDK 25. Dependencies are resolved from official Minecraft and Fabric repositories on first build.\n` },
    ];
    const language = {};
    for (const element of project.elements) {
      const { identifier } = element;
      if (element.kind === 'block') {
        language[`block.${namespace}.${identifier}`] = element.name;
        files.push({ path: `src/main/resources/assets/${namespace}/textures/block/${identifier}.png`, binary: encodeTexture(element.texture.pixels) });
        const blockModel = element.javaModel
          ? rewriteJavaModelTextures(element.javaModel, `${namespace}:block/${identifier}`)
          : { parent: 'minecraft:block/cube_all', textures: { all: `${namespace}:block/${identifier}` } };
        files.push({ path: `src/main/resources/assets/${namespace}/models/block/${identifier}.json`, content: JSON.stringify(blockModel, null, 2) });
        files.push({ path: `src/main/resources/assets/${namespace}/blockstates/${identifier}.json`, content: JSON.stringify({ variants: { '': { model: `${namespace}:block/${identifier}` } } }, null, 2) });
        files.push({ path: `src/main/resources/assets/${namespace}/items/${identifier}.json`, content: JSON.stringify({ model: { type: 'minecraft:model', model: `${namespace}:block/${identifier}` } }, null, 2) });
        files.push({ path: `src/main/resources/data/${namespace}/loot_table/blocks/${identifier}.json`, content: JSON.stringify({ type: 'minecraft:block', pools: [{ rolls: 1, entries: [{ type: 'minecraft:item', name: `${namespace}:${identifier}` }], conditions: [{ condition: 'minecraft:survives_explosion' }] }] }, null, 2) });
      } else {
        language[`item.${namespace}.${identifier}`] = element.name;
        files.push({ path: `src/main/resources/assets/${namespace}/textures/item/${identifier}.png`, binary: encodeTexture(element.texture.pixels) });
        files.push({ path: `src/main/resources/assets/${namespace}/items/${identifier}.json`, content: JSON.stringify({ model: { type: 'minecraft:model', model: `${namespace}:item/${identifier}` } }, null, 2) });
        const itemModel = element.javaModel
          ? rewriteJavaModelTextures(element.javaModel, `${namespace}:item/${identifier}`)
          : { parent: 'minecraft:item/generated', textures: { layer0: `${namespace}:item/${identifier}` } };
        files.push({ path: `src/main/resources/assets/${namespace}/models/item/${identifier}.json`, content: JSON.stringify(itemModel, null, 2) });
      }
    }
    files.push({ path: `src/main/resources/assets/${namespace}/lang/en_us.json`, content: JSON.stringify(language, null, 2) });
    const toolBlocks = project.elements.filter((element) => element.kind === 'block' && element.properties?.requiresTool);
    if (toolBlocks.length) files.push({ path: 'src/main/resources/data/minecraft/tags/block/mineable/pickaxe.json', content: JSON.stringify({ replace: false, values: toolBlocks.map((element) => `${namespace}:${element.identifier}`) }, null, 2) });
    for (const file of files) if (file.content !== undefined && typeof project.sourceOverrides?.[file.path] === 'string') file.content = project.sourceOverrides[file.path];
    return files;
  }

  async function writeProject(project) {
    const root = join(dataDir, 'generated', project.id);
    await rm(root, { recursive: true, force: true });
    await mkdir(root, { recursive: true });
    const files = generate(project);
    for (const file of files) {
      const destination = resolve(root, file.path);
      if (!destination.startsWith(root + '\\') && !destination.startsWith(root + '/')) throw new Error('Ungültiger Generatorpfad.');
      await mkdir(join(destination, '..'), { recursive: true });
      await writeFile(destination, file.binary || file.content, { flag: 'w' });
    }
    return { root, files };
  }

  async function sourceArchive(project) {
    const files = generate(project);
    return makeZip(files.map((file) => ({ name: file.path, content: file.binary || Buffer.from(file.content, 'utf8') })));
  }

  async function findBuiltArtifact(project) {
    const directory = join(dataDir, 'generated', project.id, 'build', 'libs');
    const manifestPath = join(dataDir, 'generated', project.id, 'mod-studio-build.json');
    try {
      const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
      if (manifest.fingerprint !== projectFingerprint(project) || typeof manifest.artifact !== 'string' || manifest.artifact !== manifest.artifact.split(/[\\/]/).pop()) return null;
      const names = await readdir(directory);
      return manifest.artifact.endsWith('.jar') && names.includes(manifest.artifact) ? join(directory, manifest.artifact) : null;
    } catch { return null; }
  }

  async function markBuilt(project) {
    const directory = join(dataDir, 'generated', project.id, 'build', 'libs');
    let names;
    try { names = await readdir(directory); } catch { return null; }
    const artifact = names.filter((name) => name.endsWith('.jar') && !/-sources|-dev|-shadow/.test(name)).sort()[0];
    if (!artifact) return null;
    await writeFile(join(dataDir, 'generated', project.id, 'mod-studio-build.json'), JSON.stringify({ fingerprint: projectFingerprint(project), artifact, builtAt: new Date().toISOString() }), 'utf8');
    return join(directory, artifact);
  }

  return { generate, writeProject, sourceArchive, findBuiltArtifact, markBuilt, toolchainReady };
}

function projectFingerprint(project) { return createHash('sha256').update(JSON.stringify(project)).digest('hex'); }

function constant(identifier) { return identifier.toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_+|_+$/g, ''); }

function encodeTexture(pixels) {
  const width = Math.round(Math.sqrt(pixels.length)) || 16, height = width;
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y += 1) {
    const row = y * (width * 4 + 1); raw[row] = 0;
    for (let x = 0; x < width; x += 1) {
      const color = pixels[y * width + x]; const at = row + 1 + x * 4;
      if (!color) { raw[at + 3] = 0; continue; }
      raw[at] = parseInt(color.slice(1, 3), 16); raw[at + 1] = parseInt(color.slice(3, 5), 16); raw[at + 2] = parseInt(color.slice(5, 7), 16); raw[at + 3] = color.length === 9 ? parseInt(color.slice(7, 9), 16) : 255;
    }
  }
  const chunk = (type, data) => { const name = Buffer.from(type); const length = Buffer.alloc(4); length.writeUInt32BE(data.length); const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(Buffer.concat([name, data]))); return Buffer.concat([length, name, data, crc]); };
  const header = Buffer.alloc(13); header.writeUInt32BE(width, 0); header.writeUInt32BE(height, 4); header[8] = 8; header[9] = 6;
  return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]), chunk('IHDR', header), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

const crcTable = Array.from({ length: 256 }, (_, index) => { let value = index; for (let bit = 0; bit < 8; bit += 1) value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1; return value >>> 0; });
function crc32(buffer) { let crc = 0xffffffff; for (const byte of buffer) crc = crcTable[(crc ^ byte) & 255] ^ (crc >>> 8); return (crc ^ 0xffffffff) >>> 0; }
