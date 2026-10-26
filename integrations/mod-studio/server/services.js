import { spawn } from 'node:child_process';
import { basename, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createGenerator } from './generator.js';
import { createVersionCatalog } from './version-catalog.js';
import { createChatGPTAuth } from './auth/oauth.js';
import { createAiService } from './ai.js';
import { createAiMemory } from './ai-memory.js';

const gradleRunner = fileURLToPath(new URL('./build-runner.ps1', import.meta.url));

export function createServices({ projectStore, dataDir, runtimeDir, vault, openExternal }) {
  const generator = createGenerator({ dataDir, runtimeDir });
  const auth = createChatGPTAuth({ dataDir, vault, openExternal });
  const aiMemory = createAiMemory(join(dataDir, 'ai-memory.json'));
  const ai = createAiService(auth, projectStore, aiMemory);
  const getVersionCatalog = createVersionCatalog();
  const build = {
    async check(project) {
      const supported = project.target.loader === 'fabric' && project.target.minecraftVersion === '26.2' && project.elements.every((element) => ['item', 'block'].includes(element.kind));
      const artifact = await generator.findBuiltArtifact(project);
      return {
        ready: supported && generator.toolchainReady(),
        supported,
        artifactAvailable: Boolean(artifact),
        artifactName: artifact ? basename(artifact) : null,
        message: supported
          ? (generator.toolchainReady() ? 'App-eigenes JDK 25 und Gradle 9.8.2 bereit. Der erste Build lädt Minecraft-/Fabric-Artefakte aus den offiziellen Repositories.' : 'Die eingebettete Build-Laufzeit ist in diesem Paket nicht vorhanden.')
          : 'Der Generator baut aktuell Fabric-Items und -Blöcke für Minecraft 26.2. Weitere Loader und Versionen benötigen eigene Generator-Adapter.',
        networkRequired: true,
      };
    },
    async start(req, res, project) {
      const capability = await this.check(project);
      if (!capability.ready) { res.writeHead(409, { 'Content-Type': 'application/json; charset=utf-8' }); res.end(JSON.stringify({ error: capability.message })); return; }
      const { root } = await generator.writeProject(project);
      const gradleCommand = join(runtimeDir.gradle, 'bin', 'gradle.bat');
      const javaHome = runtimeDir.jdk;
      const command = process.platform === 'win32' ? 'powershell.exe' : gradleCommand;
      const args = process.platform === 'win32'
        ? ['-NoLogo', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', gradleRunner, '-GradlePath', gradleCommand]
        : ['build', '--no-daemon', '--console=plain'];
      const child = spawn(command, args, {
        cwd: root,
        env: { ...process.env, JAVA_HOME: javaHome, PATH: `${join(javaHome, 'bin')};${process.env.PATH || ''}`, GRADLE_USER_HOME: join(dataDir, 'gradle-cache') },
        windowsHide: true,
      });
      res.writeHead(200, { 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
      const emit = (event, value) => { if (!res.destroyed) res.write(`event: ${event}\ndata: ${JSON.stringify(value)}\n\n`); };
      let outputBytes = 0; let timedOut = false; let ended = false;
      const timeout = setTimeout(() => { timedOut = true; child.kill(); }, 12 * 60 * 1000);
      const sendOutput = (chunk) => { const text = chunk.toString('utf8').slice(0, 8000); outputBytes += Buffer.byteLength(text); if (outputBytes < 500_000) emit('log', { text }); };
      child.stdout.on('data', sendOutput); child.stderr.on('data', sendOutput);
      child.on('error', (error) => emit('error', { message: error.message.slice(0, 300) }));
      child.on('close', async (code) => {
        if (ended) return; ended = true; clearTimeout(timeout);
        const artifact = code === 0 && !timedOut ? await generator.markBuilt(project).catch(() => null) : null;
        emit('complete', { ok: code === 0 && !timedOut, code, timedOut, artifact: Boolean(artifact), filename: artifact ? basename(artifact) : null }); res.end();
      });
      res.on('close', () => { if (!ended && !child.killed) child.kill(); });
    },
  };
  return {
    generator,
    build,
    auth,
    ai,
    aiMemory,
    async capabilities() {
      return { ...await getVersionCatalog(), runtime: { ready: generator.toolchainReady(), java: '25', gradle: '9.8.2' } };
    },
  };
}
