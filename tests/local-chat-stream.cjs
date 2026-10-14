const assert = require('node:assert/strict');
const { readOllamaChatStream } = require('../ollama-stream.cjs');

(async () => {
  const encoder = new TextEncoder();
  const chunks = [
    '{"message":{"content":"Die Mod"}}\n{"message":{"cont',
    'ent":" ergänzt neue Biome."}}\n{"done":true}\n',
  ];
  const body = new ReadableStream({ start(controller) { for (const chunk of chunks) controller.enqueue(encoder.encode(chunk)); controller.close(); } });
  const progress = [];
  const result = await readOllamaChatStream({ body }, text => progress.push(text));
  assert.equal(result, 'Die Mod ergänzt neue Biome.');
  assert.deepEqual(progress, ['Die Mod', 'Die Mod ergänzt neue Biome.']);
  const failure = new ReadableStream({ start(controller) { controller.enqueue(encoder.encode('{"error":"model needs more memory"}\n')); controller.close(); } });
  await assert.rejects(readOllamaChatStream({ body: failure }), /model needs more memory/);
  console.log('Local AI stream: split chunks are reassembled and partial text is published as it arrives.');
})().catch(error => { console.error(error); process.exitCode = 1; });
