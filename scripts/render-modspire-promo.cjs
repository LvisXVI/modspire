const { spawn } = require('node:child_process');
const { mkdir, stat } = require('node:fs/promises');
const path = require('node:path');
const packageJson = require('../package.json');

const repoRoot = path.resolve(__dirname, '..');
const defaultInput = path.join(process.env.USERPROFILE || '', 'Desktop', 'Modspire-App-Preview-0.2.88.webm');
const input = path.resolve(process.argv[2] || defaultInput);
const output = path.resolve(process.argv[3] || path.join(repoRoot, '..', '..', '..', '..', 'outputs', 'deliverables', `Modspire-Promo-v${packageJson.version}.mp4`));
const ffmpeg = process.env.FFMPEG_PATH || path.resolve(repoRoot, '..', '..', '..', '..', 'work', 'promo-tools', 'node_modules', '.pnpm', 'ffmpeg-static@5.3.0', 'node_modules', 'ffmpeg-static', 'ffmpeg.exe');
const font = 'C\\:/Windows/Fonts/segoeuib.ttf';

const captions = [
  [0, 3.2, 'BUILD A WORLD THAT FEELS LIKE YOURS'],
  [3.2, 7.1, 'Plan your pack with contextual AI'],
  [7.1, 11, 'Search Modrinth and choose mods in batches'],
  [11, 14.9, 'Keep projects, checks, and snapshots together'],
  [14.9, 18.8, 'Switch layouts and Minecraft world themes'],
  [18.8, 23, 'MODSPIRE  ·  MINECRAFT MODPACK STUDIO'],
];

const escapeText = (text) => text
  .replaceAll('\\', '\\\\')
  .replaceAll(':', '\\:')
  .replaceAll("'", "\\'");

const filters = [
  'scale=1920:1080:force_original_aspect_ratio=decrease',
  'pad=1920:1080:(ow-iw)/2:(oh-ih)/2:color=#080d19',
  "drawbox=x=0:y=0:w=iw:h=112:color=#08111fe8:t=fill",
  "drawbox=x=0:y=108:w=iw:h=4:color=#54d6d5:t=fill",
  `drawtext=fontfile='${font}':text='MODSPIRE':fontcolor=white:fontsize=34:x=64:y=28:shadowcolor=black@0.5:shadowx=1:shadowy=2`,
  `drawtext=fontfile='${font}':text='MINECRAFT MODPACK STUDIO':fontcolor=#a9c9e7:fontsize=17:x=66:y=70`,
  ...captions.flatMap(([start, end, caption]) => [
    `drawbox=x=0:y=920:w=iw:h=160:color=#08111fea:t=fill:enable='between(t,${start},${end})'`,
    `drawbox=x=64:y=920:w=5:h=160:color=#54d6d5:t=fill:enable='between(t,${start},${end})'`,
    `drawtext=fontfile='${font}':text='${escapeText(caption)}':fontcolor=white:fontsize=31:x=90:y=977:shadowcolor=black@0.6:shadowx=1:shadowy=2:enable='between(t,${start},${end})'`,
  ]),
  'fps=30,format=yuv420p',
].join(',');

function run(args) {
  return new Promise((resolve, reject) => {
    const child = spawn(ffmpeg, args, { windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] });
    let stderr = '';
    child.stderr.on('data', (chunk) => { stderr += chunk.toString(); });
    child.on('error', reject);
    child.on('close', (code) => code === 0 ? resolve() : reject(new Error(stderr.slice(-5000))));
  });
}

async function main() {
  await stat(input);
  await mkdir(path.dirname(output), { recursive: true });
  await run([
    '-y', '-hide_banner', '-loglevel', 'error', '-i', input,
    '-map', '0:v:0', '-vf', filters, '-an', '-c:v', 'libx264', '-preset', 'fast',
    '-crf', '19', '-movflags', '+faststart', '-t', '23', output,
  ]);
  const result = await stat(output);
  console.log(`Created ${output} (${result.size} bytes)`);
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
