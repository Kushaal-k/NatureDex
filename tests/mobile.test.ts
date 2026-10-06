import 'fake-indexeddb/auto';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { api, BackendUnavailable, PairingRequired } from '../src/api';
import { loadFieldGuide, putCachedPhoto, getCachedPhoto, queueOfflineObservation, getOfflineQueue, syncOfflineQueue } from '../src/snapshot';
import type { Dashboard, Mode } from '../src/types';
import { JSDOM } from 'jsdom';
import { act, createElement, StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from '../src/App';

const originalFetch = globalThis.fetch;
function dashboard(mode:Mode):Dashboard {
  return { mode, collection:[], observations:[], expeditions:[{id:'pollinator',title:'A little adventure',subtitle:'Discover your neighbourhood',duration:20,xp:100,theme:'meadow',goals:[],active:false,claimed:false,completed:0}], achievements:[], profile:{ xp:mode === 'demo' ? 430 : 0, level:1, title:'Explorer', level_start:0, next_level:500, discovered:0, streak:0, total_sightings:0 } };
}

test('saved phone guide stays available offline, with separate sample and real collections', async () => {
  try {
    globalThis.fetch = async () => Response.json(dashboard('demo'));
    const online = await loadFieldGuide('demo');
    assert.equal(online.offline,false);
    globalThis.fetch = async () => { throw new TypeError('Network disconnected'); };
    const saved = await loadFieldGuide('demo');
    assert.equal(saved.offline,true);
    assert.equal(saved.dashboard.profile.xp,430);
    assert.ok(saved.savedAt);
    await assert.rejects(loadFieldGuide('field'),BackendUnavailable);
    globalThis.fetch = async () => Response.json(dashboard('field'));
    await loadFieldGuide('field');
    globalThis.fetch = async () => new Response('Cloudflare tunnel offline',{status:502});
    const field = await loadFieldGuide('field');
    assert.equal(field.dashboard.profile.xp,0);
    assert.equal(field.dashboard.mode,'field');
    assert.equal(field.offline,true);
  } finally { globalThis.fetch = originalFetch; }
});

test('expired pairing asks for reconnection instead of silently restoring a cached collection', async () => {
  try {
    globalThis.fetch = async () => new Response('Unauthorized',{status:401});
    await assert.rejects(loadFieldGuide('demo'),PairingRequired);
    globalThis.fetch = async () => Response.json({detail:'Model setup required'},{status:503});
    await assert.rejects(api('/scans',{method:'POST'}),/Model setup required/);
    const abort = new AbortController(); abort.abort();
    globalThis.fetch = async () => { throw new DOMException('Aborted','AbortError'); };
    await assert.rejects(loadFieldGuide('demo',abort.signal),{name:'AbortError'});
  } finally { globalThis.fetch = originalFetch; }
});

test('graceful offline snapshot permits read-only browsing on 401 when offline', async () => {
  try {
    globalThis.fetch = async () => Response.json(dashboard('demo'));
    await loadFieldGuide('demo');

    const originalNav = (globalThis as any).navigator;
    Object.defineProperty(globalThis, 'navigator', {
      value: { onLine: false },
      configurable: true,
      writable: true,
    });
    try {
      globalThis.fetch = async () => new Response('Unauthorized', { status: 401 });
      const offlineGuide = await loadFieldGuide('demo');
      assert.equal(offlineGuide.offline, true);
      assert.equal(offlineGuide.readOnly, true);
      assert.equal(offlineGuide.dashboard.profile.xp, 430);
    } finally {
      if (originalNav) {
        Object.defineProperty(globalThis, 'navigator', { value: originalNav, configurable: true, writable: true });
      } else {
        delete (globalThis as any).navigator;
      }
    }
  } finally { globalThis.fetch = originalFetch; }
});

test('photo blobs are cached in IndexedDB and offline observation queue auto-syncs', async () => {
  try {
    const testBlob = new Blob(['fake-image-bytes'], { type: 'image/jpeg' });
    await putCachedPhoto('/photos/sample-test.jpg', testBlob);
    const cached = await getCachedPhoto('/photos/sample-test.jpg');
    assert.ok(cached);
    assert.equal(cached.url, '/photos/sample-test.jpg');

    await queueOfflineObservation({
      id: 'offline-obs-1',
      blob: testBlob,
      mode: 'field',
      note: 'Found under a rock',
      area: 'Backyard',
      createdAt: new Date().toISOString(),
    });

    const queued = await getOfflineQueue();
    assert.equal(queued.length, 1);
    assert.equal(queued[0].id, 'offline-obs-1');

    globalThis.fetch = async (input) => {
      const url = String(input);
      if (url === '/api/scans') {
        return Response.json({
          scan_id: 'scan-synced-1',
          mode: 'field',
          photo: '/photos/synced.jpg',
          candidates: [{ species: { id: 'honey-bee', name: 'Western Honey Bee' }, score: 0.95 }],
          uncertain: false,
          message: 'Match found',
          score_note: '',
        });
      }
      if (url === '/api/observations') {
        return Response.json({ xp: 50, new_species: true, species: { id: 'honey-bee', name: 'Western Honey Bee' } });
      }
      return Response.json({});
    };

    const syncResult = await syncOfflineQueue();
    assert.equal(syncResult.synced, 1);
    assert.equal(syncResult.failed, 0);

    const remaining = await getOfflineQueue();
    assert.equal(remaining.length, 0);
  } finally { globalThis.fetch = originalFetch; }
});

test('service worker serves its shell offline and never intercepts private APIs or photos', async () => {
  const listeners:Record<string,(event:any)=>void> = {};
  const shell = new Response('<html>Saved NatureDex</html>');
  const context = vm.createContext({
    self:{location:{origin:'https://phone.test'},addEventListener:(name:string,callback:any)=>listeners[name]=callback},
    URL, Response,
    caches:{open:async()=>({match:async()=>shell})},
    fetch:async()=>{throw new TypeError('offline');},
  });
  vm.runInContext(readFileSync('public/sw.js','utf8'),context);
  for (const path of ['/api/dashboard','/api/export','/api/mobile/pair','/photos/private.jpg']) {
    let intercepted = false;
    listeners.fetch({request:{url:'https://phone.test'+path,method:'GET',mode:'navigate'},respondWith:()=>{intercepted=true;}});
    assert.equal(intercepted,false,path);
  }
  let response:Promise<Response>|undefined;
  listeners.fetch({request:{url:'https://phone.test/',method:'GET',mode:'navigate'},respondWith:(value:Promise<Response>)=>response=value});
  assert.equal(await (await response!).text(),'<html>Saved NatureDex</html>');
});

async function phoneBrowser(initialHash:string, check:(dom:JSDOM, codes:string[])=>Promise<void>) {
  const dom = new JSDOM('<div id="root"></div>',{url:'https://phone.test/'+initialHash});
  const names = ['window','document','localStorage','HTMLElement','IS_REACT_ACT_ENVIRONMENT'];
  const originals = names.map(name=>Object.getOwnPropertyDescriptor(globalThis,name));
  const values = [dom.window,dom.window.document,dom.window.localStorage,dom.window.HTMLElement,true];
  names.forEach((name,index)=>Object.defineProperty(globalThis,name,{value:values[index],configurable:true,writable:true}));
  dom.window.matchMedia = (()=>({matches:false,addEventListener(){},removeEventListener(){}})) as any;
  dom.window.scrollTo = ()=>{};
  let paired = false;
  const codes:string[] = [];
  globalThis.fetch = async (input, options) => {
    if (String(input) === '/api/mobile/pair') {
      codes.push(JSON.parse(String(options?.body)).code);
      paired = true;
      return Response.json({connected:true});
    }
    if (String(input).startsWith('/api/dashboard')) {
      return paired ? Response.json(dashboard('demo')) : Response.json({detail:'Connect this phone'},{status:401});
    }
    return Response.json({status:'ok',model:{enabled:false,loaded:false,installed:false,device:'cpu'}});
  };
  const root = createRoot(dom.window.document.getElementById('root')!);
  try {
    await act(async()=>root.render(createElement(StrictMode,null,createElement(App))));
    await check(dom,codes);
  } finally {
    await act(async()=>root.unmount());
    dom.window.close();
    globalThis.fetch = originalFetch;
    names.forEach((name,index)=>{ if(originals[index]) Object.defineProperty(globalThis,name,originals[index]!); else delete (globalThis as any)[name]; });
  }
}

async function settleBrowser() {
  await act(async()=>{ await new Promise(resolve=>setTimeout(resolve,30)); });
}

test('opening the private link in an already loaded pairing screen connects without typing a code', async()=>{
  await phoneBrowser('',async(dom,codes)=>{
    assert.match(dom.window.document.body.textContent || '',/Connect your field guide/);
    await act(async()=>{ dom.window.location.hash = '#pair=private-reopened-link'; await new Promise(resolve=>setTimeout(resolve,10)); });
    await settleBrowser();
    assert.deepEqual(codes,['private-reopened-link']);
    assert.equal(dom.window.location.hash,'');
    assert.match(dom.window.document.body.textContent || '',/Wonder is all around you/);
  });
});

test('a fresh private link pairs exactly once even when React repeats startup effects', async()=>{
  await phoneBrowser('#pair=private-first-link',async(dom,codes)=>{
    await settleBrowser();
    assert.deepEqual(codes,['private-first-link']);
    assert.equal(dom.window.location.hash,'');
    assert.match(dom.window.document.body.textContent || '',/Wonder is all around you/);
  });
});
