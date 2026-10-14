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
  function snapshot() {
    const entries = [];
    for (const target of [previous, file]) {
      try {
        for (const line of fs.readFileSync(target, 'utf8').split('\n')) {
          if (!line.trim()) continue;
          try { entries.push(JSON.parse(line)); } catch { /* Interrupted final writes are ignored. */ }
        }
      } catch {}
    }
    return { directory, file, version, entries: entries.slice(-100) };
  }
  return { record, snapshot, directory, file };
}
module.exports = { createDiagnostics, redact };
