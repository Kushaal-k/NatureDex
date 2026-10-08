import { backendFetch } from './connection';

export class BackendUnavailable extends Error {}
export class PairingRequired extends Error {}

export async function api<T>(path: string, options?: RequestInit): Promise<T> {
  let response:Response;
  const signal = options?.signal;
  const deadline = new AbortController();
  const cancel = () => deadline.abort();
  signal?.addEventListener('abort', cancel, { once:true });
  if (signal?.aborted) deadline.abort();
  const timer = setTimeout(cancel, options?.method === 'POST' ? 600000 : 8000);
  try { response = await backendFetch(`/api${path}`, { ...options, signal:deadline.signal }); }
  catch (error) {
    if (options?.signal?.aborted) throw error;
    throw new BackendUnavailable('NatureDex cannot reach its identification server. Reconnect to the computer running NatureDex, then try again.');
  }
  finally { clearTimeout(timer); signal?.removeEventListener('abort', cancel); }
  if (response.status === 401) throw new PairingRequired('Connect this phone using your private NatureDex link.');
  if ([502,504,530].includes(response.status)) throw new BackendUnavailable('The NatureDex computer is disconnected. Your saved guide is still available.');
  const text = await response.text();
  let data;
  try { data = JSON.parse(text); } catch { throw new BackendUnavailable('NatureDex cannot reach its computer. Try reconnecting.'); }
  if (!response.ok) throw new Error(typeof data.detail === 'string' ? data.detail : 'Something went wrong. Please try again.');
  return data as T;
}
export function post<T>(path: string, data: unknown, signal?: AbortSignal) {
  return api<T>(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data), signal });
}
