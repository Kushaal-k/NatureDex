import { api, BackendUnavailable, PairingRequired } from './api';
import { backendFetch } from './connection';
import type { Dashboard, Mode, Scan } from './types';

interface Snapshot { key: Mode; dashboard: Dashboard; savedAt: string }

export interface CachedPhoto {
  url: string;
  blob: Blob;
  dataUrl?: string;
}

export interface QueuedObservation {
  id: string;
  blob: Blob;
  mode: Mode;
  note: string;
  area: string | null;
  latitude?: number | null;
  longitude?: number | null;
  createdAt: string;
  scan?: Scan;
  reviewRequired?: boolean;
  walkId?: string;
  walkName?: string;
  autoIdentify?: boolean;
  syncState?: 'waiting' | 'identifying' | 'review';
}

function openStore(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('naturedex-field-guide', 2);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains('snapshots')) {
        db.createObjectStore('snapshots', { keyPath: 'key' });
      }
      if (!db.objectStoreNames.contains('photos')) {
        db.createObjectStore('photos', { keyPath: 'url' });
      }
      if (!db.objectStoreNames.contains('queue')) {
        db.createObjectStore('queue', { keyPath: 'id' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function putCachedPhoto(url: string, blob: Blob): Promise<void> {
  let dataUrl: string | undefined;
  if (typeof FileReader !== 'undefined') {
    try {
      dataUrl = await new Promise<string>((res, rej) => {
        const reader = new FileReader();
        reader.onloadend = () => res(reader.result as string);
        reader.onerror = rej;
        reader.readAsDataURL(blob);
      });
    } catch {}
  }
  const db = await openStore();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction('photos', 'readwrite');
      tx.objectStore('photos').put({ url, blob, dataUrl });
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  } finally { db.close(); }
}

export async function getCachedPhoto(url: string): Promise<CachedPhoto | undefined> {
  const db = await openStore();
  try {
    return await new Promise<CachedPhoto | undefined>((resolve, reject) => {
      const tx = db.transaction('photos', 'readonly');
      const req = tx.objectStore('photos').get(url);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  } finally { db.close(); }
}

export async function cacheUserPhotos(dashboard: Dashboard): Promise<void> {
  const urls: string[] = [];
  for (const obs of dashboard.observations || []) {
    if (obs.image && obs.image.startsWith('/photos/')) urls.push(obs.image);
  }
  for (const sp of dashboard.collection || []) {
    if (sp.image && sp.image.startsWith('/photos/')) urls.push(sp.image);
  }
  for (const url of urls) {
    try {
      const existing = await getCachedPhoto(url);
      if (!existing && typeof fetch !== 'undefined') {
        const res = await backendFetch(url);
        if (res.ok) {
          const blob = await res.blob();
          await putCachedPhoto(url, blob);
        }
      }
    } catch {}
  }
}

async function restoreCachedPhotos(dashboard: Dashboard): Promise<Dashboard> {
  try {
    const db = await openStore();
    try {
      const photos = await new Promise<Map<string, CachedPhoto>>((resolve) => {
        const tx = db.transaction('photos', 'readonly');
        const req = tx.objectStore('photos').getAll();
        req.onsuccess = () => {
          const map = new Map<string, CachedPhoto>();
          for (const item of (req.result || [])) {
            map.set(item.url, item);
          }
          resolve(map);
        };
        req.onerror = () => resolve(new Map());
      });
      if (photos.size === 0) return dashboard;
      const cloned: Dashboard = JSON.parse(JSON.stringify(dashboard));
      for (const obs of cloned.observations || []) {
        if (obs.image && photos.has(obs.image)) {
          const cached = photos.get(obs.image)!;
          obs.image = cached.dataUrl || (typeof URL !== 'undefined' && URL.createObjectURL ? URL.createObjectURL(cached.blob) : obs.image);
        }
      }
      for (const sp of cloned.collection || []) {
        if (sp.image && photos.has(sp.image)) {
          const cached = photos.get(sp.image)!;
          sp.image = cached.dataUrl || (typeof URL !== 'undefined' && URL.createObjectURL ? URL.createObjectURL(cached.blob) : sp.image);
        }
      }
      return cloned;
    } finally { db.close(); }
  } catch {
    return dashboard;
  }
}

async function writeSnapshot(dashboard: Dashboard): Promise<void> {
  const db = await openStore();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction('snapshots', 'readwrite');
      transaction.objectStore('snapshots').put({ key: dashboard.mode, dashboard, savedAt: new Date().toISOString() } satisfies Snapshot);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error);
    });
  } finally { db.close(); }
}

async function readSnapshot(mode: Mode): Promise<Snapshot | undefined> {
  const db = await openStore();
  try {
    return await new Promise((resolve, reject) => {
      const request = db.transaction('snapshots').objectStore('snapshots').get(mode);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  } finally { db.close(); }
}

export async function queueOfflineObservation(item: QueuedObservation): Promise<void> {
  const db = await openStore();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction('queue', 'readwrite');
      tx.objectStore('queue').put(item);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  } finally { db.close(); }
}

export async function getOfflineQueue(): Promise<QueuedObservation[]> {
  const db = await openStore();
  try {
    return await new Promise<QueuedObservation[]>((resolve, reject) => {
      const tx = db.transaction('queue', 'readonly');
      const req = tx.objectStore('queue').getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });
  } finally { db.close(); }
}

export async function removeQueuedObservation(id: string): Promise<void> {
  const db = await openStore();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction('queue', 'readwrite');
      tx.objectStore('queue').delete(id);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  } finally { db.close(); }
}

interface SyncResult { synced: number; failed: number; ready: number }
let activeSync: Promise<SyncResult> | null = null;
let syncController: AbortController | null = null;
export function cancelOfflineSync() { syncController?.abort(); }
export function syncOfflineQueue(): Promise<SyncResult> {
  if (activeSync) return activeSync;
  syncController = new AbortController();
  const signal = syncController.signal;
  const work = () => runOfflineSync(signal);
  activeSync = (typeof navigator !== 'undefined' && navigator.locks
    ? navigator.locks.request('naturedex-offline-sync', work)
    : work()).finally(() => { activeSync = null; syncController = null; });
  return activeSync;
}

async function runOfflineSync(signal: AbortSignal): Promise<SyncResult> {
  const queue = await getOfflineQueue().catch(() => []);
  if (queue.length === 0) return { synced: 0, failed: 0, ready: 0 };
  let synced = 0;
  let failed = 0;
  let ready = 0;
  for (const item of queue) {
    if (signal.aborted) break;
    // Identify opted-in walk photos automatically, but never save their matches without review.
    if (item.reviewRequired && (!item.autoIdentify || item.scan)) continue;
    try {
      if (item.autoIdentify) {
        await queueOfflineObservation({ ...item, syncState:'identifying' });
        if (typeof window !== 'undefined') window.dispatchEvent(new window.Event('naturedex-queue-changed'));
      }
      const form = new FormData();
      form.append('file', item.blob, `offline-${item.id}.jpg`);
      const scan = item.scan || await api<Scan>('/scans', { method: 'POST', body: form, signal });
      const current = (await getOfflineQueue()).find(photo => photo.id === item.id);
      if (!current) continue;
      if (!item.scan) await queueOfflineObservation({ ...current, scan, syncState:'review' });
      if (item.reviewRequired) { ready++; continue; }
      // Retain the photo and candidates until the user reviews a tentative match.
      if (scan.uncertain) continue;
      await api('/observations', {
        method: 'POST',
        signal,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          scan_id: scan.scan_id,
          candidate: 0,
          confirm_uncertain: false,
          offline_id: item.id,
          captured_at: item.createdAt,
          note: item.note,
          area: item.area,
          latitude: item.latitude ?? null,
          longitude: item.longitude ?? null,
        }),
      });
      await removeQueuedObservation(item.id);
      synced++;
    } catch (error) {
      // A draft may have been discarded while its identification was in flight.
      const current = (await getOfflineQueue()).find(photo => photo.id === item.id);
      if (current?.autoIdentify) await queueOfflineObservation({ ...current, syncState:'waiting' });
      // A cached unsaved scan may expire after a long offline period.
      if (current && error instanceof Error && /expired/i.test(error.message)) {
        await queueOfflineObservation({ ...current, scan: undefined, syncState:'waiting' });
      }
      failed++;
    }
  }
  if (typeof window !== 'undefined') window.dispatchEvent(new window.Event('naturedex-queue-changed'));
  return { synced, failed, ready };
}

export function emptyFieldGuide(mode: Mode = 'field'): Dashboard {
  return {mode,collection:[],observations:[],expeditions:[],achievements:[],profile:{xp:0,level:1,title:'Backyard beginner',level_start:0,next_level:500,discovered:0,streak:0,total_sightings:0}};
}

export async function loadFieldGuide(mode: Mode, signal?: AbortSignal) {
  const isOffline = typeof navigator !== 'undefined' && navigator.onLine === false;
  if (isOffline) {
    const snapshot = await readSnapshot(mode).catch(() => undefined);
    if (snapshot) {
      const enriched = await restoreCachedPhotos(snapshot.dashboard);
      return { dashboard: enriched, offline: true, savedAt: snapshot.savedAt, readOnly: true };
    }
  }
  try {
    const dashboard = await api<Dashboard>(`/dashboard?mode=${mode}`, { signal });
    if (signal?.aborted) throw new DOMException('Cancelled', 'AbortError');
    await writeSnapshot(dashboard).catch(() => {});
    cacheUserPhotos(dashboard).catch(() => {});
    return { dashboard, offline: false, savedAt: null, readOnly: false };
  } catch (error) {
    if (signal?.aborted) throw error;
    const offlineNow = typeof navigator !== 'undefined' && navigator.onLine === false;
    if (error instanceof BackendUnavailable || (error instanceof PairingRequired && offlineNow)) {
      const snapshot = await readSnapshot(mode).catch(() => undefined);
      if (snapshot) {
        const enriched = await restoreCachedPhotos(snapshot.dashboard);
        return { dashboard: enriched, offline: true, savedAt: snapshot.savedAt, readOnly: true };
      }
      return {dashboard:emptyFieldGuide(mode),offline:true,savedAt:null,readOnly:true};
    }
    throw error;
  }
}
