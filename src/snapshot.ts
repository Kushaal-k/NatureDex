import { api, BackendUnavailable } from './api';
import type { Dashboard, Mode } from './types';

interface Snapshot { key: Mode; dashboard: Dashboard; savedAt: string }
function openStore(): Promise<IDBDatabase> {
  return new Promise((resolve,reject) => {
    const request = indexedDB.open('naturedex-field-guide',1);
    request.onupgradeneeded = () => request.result.createObjectStore('snapshots',{keyPath:'key'});
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
async function writeSnapshot(dashboard:Dashboard):Promise<void> {
  const db = await openStore();
  try {
    await new Promise<void>((resolve,reject) => {
      const transaction = db.transaction('snapshots','readwrite');
      transaction.objectStore('snapshots').put({key:dashboard.mode,dashboard,savedAt:new Date().toISOString()} satisfies Snapshot);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error);
    });
  } finally { db.close(); }
}
async function readSnapshot(mode:Mode):Promise<Snapshot|undefined> {
  const db = await openStore();
  try {
    return await new Promise((resolve,reject) => {
      const request = db.transaction('snapshots').objectStore('snapshots').get(mode);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  } finally { db.close(); }
}

export async function loadFieldGuide(mode:Mode,signal?:AbortSignal) {
  try {
    const dashboard = await api<Dashboard>(`/dashboard?mode=${mode}`,{signal});
    if (signal?.aborted) throw new DOMException('Cancelled','AbortError');
    await writeSnapshot(dashboard).catch(() => {});
    return {dashboard, offline:false, savedAt:null};
  } catch (error) {
    if (!(error instanceof BackendUnavailable) || signal?.aborted) throw error;
    const snapshot = await readSnapshot(mode).catch(() => undefined);
    if (!snapshot) throw error;
    return {dashboard:snapshot.dashboard,offline:true,savedAt:snapshot.savedAt};
  }
}
