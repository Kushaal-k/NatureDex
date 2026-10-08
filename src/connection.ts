export interface LaptopConnection { origin: string; token: string }
const KEY = 'naturedex-laptop-connection';

export function readConnection(): LaptopConnection | null {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (!saved?.token || new URL(saved.origin).origin !== saved.origin || !saved.origin.startsWith('https://')) return null;
    return saved;
  } catch { return null; }
}

export function rememberConnection(connection: LaptopConnection) {
  localStorage.setItem(KEY, JSON.stringify(connection));
}

export function forgetConnection() { localStorage.removeItem(KEY); }

/** Send credentials only to the paired laptop, never to illustration or other URLs. */
export function backendFetch(path: string, options: RequestInit = {}) {
  if (!/^\/(api\/|photos\/)/.test(path) || path.includes('..') || path.includes('\\')) throw new Error('Invalid laptop request');
  const saved = readConnection();
  const headers = new Headers(options.headers);
  if (saved) headers.set('Authorization', `Bearer ${saved.token}`);
  return fetch(saved ? saved.origin + path : path, { ...options, headers, credentials:saved ? 'omit' : 'same-origin', redirect:'error' });
}

export async function connectLaptop(value: string, pairingCode: string): Promise<void> {
  let link: URL;
  try { link = new URL(value.trim()); } catch { throw new Error('Enter your laptop’s complete HTTPS address.'); }
  if (link.protocol !== 'https:' || link.username || link.password || link.origin === window.location.origin) throw new Error('Use your laptop’s HTTPS address.');
  const code = new URLSearchParams(link.hash.slice(1)).get('pair') || pairingCode.trim();
  if (!code) throw new Error('Enter the pairing code shown on your laptop.');
  const previous = readConnection();
  if (previous && previous.origin !== link.origin) throw new Error('This app is already paired with a different laptop address. Use its existing address to reconnect.');
  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), 10000);
  try {
    const response = await fetch(link.origin + '/api/mobile/pair', {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({code}),credentials:'omit',redirect:'error',signal:abort.signal});
    const data = await response.json();
    if (!response.ok || typeof data.access_token !== 'string') throw new Error(data.detail || 'The laptop must allow this app’s address. Check its companion configuration.');
    rememberConnection({origin:link.origin,token:data.access_token});
  } catch (error) {
    if (error instanceof TypeError || (error instanceof DOMException && error.name === 'AbortError')) throw new Error('Laptop unavailable. Keep the companion running and check its allowed app address.');
    throw error;
  } finally { clearTimeout(timer); }
}
