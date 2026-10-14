async function readOllamaChatStream(response, onProgress) {
  if (!response?.body) throw new Error('Das lokale Modell hat keinen Antwort-Stream geöffnet.');
  const reader = response.body.getReader(), decoder = new TextDecoder();
  let pending = '', content = '';
  const consumeLine = line => {
    const value = line.trim(); if (!value) return;
    let packet; try { packet = JSON.parse(value); } catch { return; }
    if (packet.error) throw new Error(String(packet.error));
    const token = String(packet.message?.content || '');
    if (token) { content += token; onProgress?.(content); }
  };
  try {
    while (true) {
      const { value, done } = await reader.read();
      pending += decoder.decode(value || new Uint8Array(), { stream: !done });
      const lines = pending.split(/\r?\n/); pending = lines.pop() || '';
      for (const line of lines) consumeLine(line);
      if (done) break;
    }
    if (pending.trim()) consumeLine(pending);
  } finally { reader.releaseLock(); }
  content = content.trim();
  if (!content) throw new Error('Das lokale Modell hat keine Antwort geliefert. Prüfe, ob es genug Arbeitsspeicher hat.');
  return content;
}

module.exports = { readOllamaChatStream };
