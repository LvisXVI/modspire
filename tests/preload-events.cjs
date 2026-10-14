const assert = require('node:assert/strict');
const EventEmitter = require('node:events');
const Module = require('node:module');

const originalLoad = Module._load;
const ipc = new EventEmitter();
const exposed = {};
Module._load = function(request, parent, isMain) {
  if (request === 'electron') return {
    contextBridge: { exposeInMainWorld: (name, value) => { exposed[name] = value; } },
    ipcRenderer: { on: ipc.on.bind(ipc), removeListener: ipc.removeListener.bind(ipc), invoke: async () => undefined }
  };
  return originalLoad.call(this, request, parent, isMain);
};

try {
  require('../preload.cjs');
} finally {
  Module._load = originalLoad;
}

let received = 0;
const unsubscribe = exposed.workshop.onChatProgress(() => { received++; });
ipc.emit('chat:progress', {}, { text: 'first' });
assert.equal(received, 1, 'event bridge forwards subscribed events');
assert.equal(typeof unsubscribe, 'function', 'event bridge returns an unsubscribe function');
unsubscribe();
ipc.emit('chat:progress', {}, { text: 'after cleanup' });
assert.equal(received, 1, 'unsubscribed bridge does not retain or call its listener');
console.log('Preload event listeners unsubscribe cleanly.');
