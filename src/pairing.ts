import { post } from './api';
import { connectLaptop, readConnection } from './connection';
let laptopAddress: string | null = null;

export function takePairingCode() {
  const values = new URLSearchParams(window.location.hash.slice(1));
  const code = values.get('pair');
  if (code) laptopAddress = values.get('computer');
  if (code) window.history.replaceState(null, '', window.location.pathname + window.location.search);
  return code;
}

export async function pairPhone(code:string) {
  if (laptopAddress) { await connectLaptop(laptopAddress, code); laptopAddress = null; return; }
  const saved = readConnection();
  if (saved) { await connectLaptop(saved.origin, code); return; }
  await post('/mobile/pair', { code:code.trim() });
}
