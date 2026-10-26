'use strict';
const path = require('node:path');

// Own exactly one Studio process. No external installation, demo or pack-state handoff.
function createModStudio({ fork, openExternal, rootDir, archivesDir, dataDir, runtimeCache, startupTimeout = 240000 }) {
  let active = null;
  let closed = false;

  function start() {
    if (closed) return Promise.reject(new Error('Modspire wird beendet.'));
    if (active) return active.ready;
    const child = fork(path.join(__dirname, 'mod-studio-worker.cjs'), [], { stdio: 'ignore', serviceName: 'Modspire · Mod Studio' });
    const session = { child, origin: null, ready: null };
    active = session;
    session.ready = new Promise((resolve, reject) => {
      let settled = false;
      const fail = error => {
        if (active === session) active = null;
        if (!settled) { settled = true; clearTimeout(timer); reject(error); }
        child.kill();
      };
      const timer = setTimeout(() => fail(new Error('Mod Studio konnte nicht rechtzeitig starten. Bitte erneut versuchen.')), startupTimeout);
      child.on('message', message => {
        if (message?.type === 'error') return fail(new Error(message.message));
        if (message?.type !== 'ready' || settled) return;
        try {
          const url = new URL(message.origin);
          if (url.protocol !== 'http:' || url.hostname !== '127.0.0.1' || !url.port || url.pathname !== '/' || url.search || url.hash || url.username || url.password) throw new Error('Ungültige lokale Studio-Adresse.');
          session.origin = url.origin;
          settled = true; clearTimeout(timer); resolve({ origin: session.origin, version: message.version });
        } catch (error) { fail(error); }
      });
      child.once('exit', () => {
        if (active === session) active = null;
        if (!settled) { settled = true; clearTimeout(timer); reject(new Error('Mod Studio wurde vor dem Start beendet.')); }
      });
      child.once('error', error => fail(error));
      child.postMessage({ type: 'start', rootDir, archivesDir, dataDir, runtimeCache });
    });
    return session.ready;
  }

  return {
    async open() {
      const result = await start();
      if (closed) throw new Error('Modspire wird beendet.');
      await openExternal(`${result.origin}/`);
      return result;
    },
    close() {
      closed = true;
      const session = active;
      active = null;
      if (!session) return;
      session.child.postMessage({ type: 'stop' });
      const timeout = setTimeout(() => session.child.kill(), 3000);
      timeout.unref();
      session.child.once('exit', () => clearTimeout(timeout));
    }
  };
}

module.exports = { createModStudio };
