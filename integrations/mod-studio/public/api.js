export async function api(path, options = {}) {
  const response = await fetch(path, {
    ...options,
    headers: { ...(options.body ? { 'Content-Type': 'application/json' } : {}), ...options.headers },
  });
  const contentType = response.headers.get('content-type') || '';
  if (!response.ok) {
    const payload = contentType.includes('json') ? await response.json().catch(() => ({})) : {};
    throw new Error(payload.error || `Anfrage fehlgeschlagen (${response.status}).`);
  }
  return contentType.includes('json') ? response.json() : response;
}

export function jsonBody(value) { return JSON.stringify(value); }
