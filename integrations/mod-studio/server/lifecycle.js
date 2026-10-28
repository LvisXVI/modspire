// Tracks the open browser tabs of the local app. Every tab keeps one event stream open; when the last one is gone for a
// short grace period (a reload reconnects within it) the app can shut itself down, like closing a normal desktop program.
export function createLifecycle({ enabled = false, graceMs = 8000, onIdle = () => {} } = {}) {
  const streams = new Set();
  let everConnected = false;
  let timer = null;

  function connect(response) {
    streams.add(response);
    everConnected = true;
    clearTimeout(timer);
    const ping = setInterval(() => { try { response.write(': ping' + String.fromCharCode(10, 10)); } catch { /* closed */ } }, 15000);
    ping.unref?.();
    response.on('close', () => {
      clearInterval(ping);
      streams.delete(response);
      if (!enabled || !everConnected || streams.size > 0) return;
      clearTimeout(timer);
      timer = setTimeout(() => { if (streams.size === 0) onIdle(); }, graceMs);
      timer.unref?.();
    });
  }

  return { connect, count: () => streams.size, enabled };
}
