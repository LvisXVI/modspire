const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createDiagnostics, redact } = require('../diagnostics.cjs');
const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'workshop-diagnostics-'));
try {
  const diagnostics = createDiagnostics(directory, 'test', 500);
  assert.equal(diagnostics.record('renderer-error', 'Failure sk-secret_key_value access_token=private_value', 'Bearer private-bearer'), true);
  let report = diagnostics.snapshot();
  assert.equal(report.entries.length, 1);
  assert.ok(!JSON.stringify(report).includes('private_value'));
  assert.ok(!JSON.stringify(report).includes('secret_key_value'));
  assert.ok(!JSON.stringify(report).includes('private-bearer'));
  assert.equal(report.entries[0].version, 'test');
  diagnostics.record('window-unresponsive', 'freeze '.repeat(120));
  diagnostics.record('window-responsive', 'recovered');
  assert.ok(fs.existsSync(path.join(directory, 'app.previous.log')), 'rotate bounded log files');
  fs.appendFileSync(diagnostics.file, '{partial');
  report = diagnostics.snapshot();
  assert.equal(report.entries.at(-1).message, 'recovered');
  assert.equal(redact('https://x.test/?code=private&token=private'), 'https://x.test/?code=[REDACTED]&token=[REDACTED]');
  assert.ok(redact('a'.repeat(15000)).length <= 12000);
  const recentDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'workshop-diagnostics-tail-'));
  try {
    fs.writeFileSync(path.join(recentDirectory, 'app.log'), Array.from({ length: 150 }, (_, index) => JSON.stringify({ message: 'entry-' + index })).join('\n') + '\n');
    const recent = createDiagnostics(recentDirectory, 'test').snapshot().entries;
    assert.equal(recent.length, 100, 'snapshot keeps only the displayed tail');
    assert.equal(recent[0].message, 'entry-50');
    assert.equal(recent.at(-1).message, 'entry-149');
  } finally { fs.rmSync(recentDirectory, { recursive: true, force: true }); }
  console.log('Crash reporter: errors, rotation, incomplete writes, and credential redaction passed.');
} finally { fs.rmSync(directory, { recursive: true, force: true }); }
