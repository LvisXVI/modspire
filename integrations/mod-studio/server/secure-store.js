import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const protectionScript = fileURLToPath(new URL('./auth/dpapi.ps1', import.meta.url));

export function createWindowsVault() {
  const run = (mode, value) => {
    if (process.platform !== 'win32') throw new Error('ChatGPT-Zugangsdaten werden derzeit nur unter Windows sicher gespeichert.');
    const output = execFileSync('powershell.exe', ['-NoLogo', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', protectionScript, '-Mode', mode], {
      input: value,
      encoding: 'utf8',
      windowsHide: true,
      maxBuffer: 2_000_000,
      timeout: 20_000,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    return output.trim();
  };
  return { available: () => process.platform === 'win32', encrypt: (value) => run('Encrypt', value), decrypt: (value) => run('Decrypt', value) };
}
