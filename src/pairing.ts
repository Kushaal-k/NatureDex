import { post } from './api';

export function takePairingCode() {
  const values = new URLSearchParams(window.location.hash.slice(1));
  const code = values.get('pair');
  if (code) window.history.replaceState(null, '', window.location.pathname + window.location.search);
  return code;
}

export async function pairPhone(code:string) {
  await post('/mobile/pair', { code:code.trim() });
}
