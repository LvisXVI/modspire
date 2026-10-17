const fs = require('node:fs');
const path = require('node:path');

function redact(value) {
  return String(value || '').slice(0, 12000)
    .replace(/\bsk-[\w-]+/gi, '[API KEY]')
    .replace(/\bBearer\s+[^\s"']+/gi, 'Bearer [REDACTED]')
    .replace(/((?:access_token|refresh_token|api[_-]?key|authorization|password|secret)["']?\s*[:=]\s*["']?)[^\s,"'}]+/gi, '$1[REDACTED]')
    .replace(/([?&](?:code|token|key)=)[^&\s]+/gi, '$1[REDACTED]');
}

function createDiagnostics(directory, version, maxBytes = 1024 * 1024) {
  const file = path.join(directory, 'app.log');
  const previous = path.join(directory, 'app.previous.log');
  let burstStart = 0, burstCount = 0;
  function record(kind, message, stack = '') {
    try {
      const now = Date.now();
      if (now - burstStart > 10000) { burstStart = now; burstCount = 0; }
      if (++burstCount > 20) return false;
      fs.mkdirSync(directory, { recursive: true });
      if (fs.existsSync(file) && fs.statSync(file).size >= maxBytes) fs.renameSync(file, previous);
      const entry = { time: new Date(now).toISOString(), version, kind: redact(kind).slice(0, 60), message: redact(message), stack: redact(stack) };
      fs.appendFileSync(file, JSON.stringify(entry) + '\n', 'utf8');
      return true;
    } catch (error) { console.warn('Diagnosebericht konnte nicht gespeichert werden:', error.message); return false; }
  }
  function readRecentEntries(target, limit) {
    let descriptor;
    try {
      const size = fs.statSync(target).size;
      if (!size || limit <= 0) return [];
      descriptor = fs.openSync(target, 'r');
      const chunks = [];
      let position = size;
      let newlineCount = 0;
      while (position > 0 && newlineCount <= limit) {
        const length = Math.min(8192, position);
        position -= length;
        const chunk = Buffer.allocUnsafe(length);
        const bytesRead = fs.readSync(descriptor, chunk, 0, length, position);
        if (!bytesRead) break;
        const contents = chunk.subarray(0, bytesRead);
        chunks.unshift(contents);
        for (const byte of contents) if (byte === 10) newlineCount++;
      }
      const lines = Buffer.concat(chunks).toString('utf8').split('\n').slice(-limit - 1);
      const entries = [];
      for (const line of lines) {
        if (!line.trim()) continue;
        try { entries.push(JSON.parse(line)); } catch { /* Interrupted writes are ignored. */ }
      }
      return entries.slice(-limit);
    } catch { return []; }
    finally { if (descriptor !== undefined) fs.closeSync(descriptor); }
  }
  function snapshot() {
    const entries = readRecentEntries(file, 100);
    if (entries.length < 100) entries.unshift(...readRecentEntries(previous, 100 - entries.length));
    return { directory, file, version, entries: entries.slice(-100) };
  }
  return { record, snapshot, directory, file };
}
module.exports = { createDiagnostics, redact };
