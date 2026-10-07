import 'fake-indexeddb/auto';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { api, BackendUnavailable, PairingRequired } from '../src/api';
import { loadFieldGuide, putCachedPhoto, getCachedPhoto, queueOfflineObservation, getOfflineQueue, removeQueuedObservation, syncOfflineQueue } from '../src/snapshot';
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

test('overlapping syncs save once and retain the original capture date and retry ID', async () => {
  const createdAt = '2026-01-02T10:30:00.000Z';
  let scans = 0;
  const saves: any[] = [];
  try {
    await queueOfflineObservation({id:'concurrent-photo',blob:new Blob(['photo']),mode:'field',note:'leaf',area:null,createdAt});
    globalThis.fetch = async (input, init) => {
      if (String(input) === '/api/scans') {
        scans++;
        await new Promise(resolve=>setTimeout(resolve,10));
        return Response.json({scan_id:'single-scan',uncertain:false,candidates:[]});
      }
      saves.push(JSON.parse(String(init?.body)));
      return Response.json({xp:50});
    };
    await Promise.all([syncOfflineQueue(),syncOfflineQueue()]);
    assert.equal(scans,1);
    assert.equal(saves.length,1);
    assert.equal(saves[0].offline_id,'concurrent-photo');
    assert.equal(saves[0].captured_at,createdAt);
    assert.equal(saves[0].confirm_uncertain,false);
  } finally { globalThis.fetch=originalFetch; await removeQueuedObservation('concurrent-photo'); }
});

test('uncertain queued scans wait for review and reuse their candidates on retry', async () => {
  let scans = 0;
  let saves = 0;
  try {
    await queueOfflineObservation({id:'tentative-photo',blob:new Blob(['photo']),mode:'field',note:'',area:null,createdAt:new Date().toISOString()});
    globalThis.fetch = async input => {
      if (String(input) === '/api/scans') {
        scans++;
        return Response.json({scan_id:'tentative-scan',uncertain:true,candidates:[{score:.1,species:{id:'test'}}]});
      }
      saves++;
      return Response.json({});
    };
    await syncOfflineQueue();
    await syncOfflineQueue();
    assert.equal(scans,1);
    assert.equal(saves,0);
    const item = (await getOfflineQueue()).find(item=>item.id==='tentative-photo');
    assert.equal(item?.scan?.scan_id,'tentative-scan');
    assert.equal(item?.blob.size,5);
  } finally { globalThis.fetch=originalFetch; await removeQueuedObservation('tentative-photo'); }
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

test('walk drafts remain private and unsaved through background sync, even for strong matches', async () => {
  const id = 'held-walk-photo';
  await queueOfflineObservation({id, blob:new Blob(['walk-photo'],{type:'image/jpeg'}), mode:'field', note:'By the stream', area:'Park', createdAt:'2026-10-07T10:00:00Z', reviewRequired:true, walkId:'walk-one', walkName:'Morning stroll', scan:{scan_id:'strong-match',mode:'field',photo:null,uncertain:false,message:'Match',score_note:'',candidates:[]}});
  let requests = 0;
  try {
    globalThis.fetch = async()=>{ requests++; throw new Error('Walk photos must not be sent in the background'); };
    await syncOfflineQueue();
    assert.equal(requests,0);
    const stored = (await getOfflineQueue()).find(item=>item.id===id)!;
    assert.equal(stored.blob.size,10);
    assert.equal(stored.walkName,'Morning stroll');
    assert.equal(stored.createdAt,'2026-10-07T10:00:00Z');
    assert.equal(stored.reviewRequired,true);
  } finally { globalThis.fetch=originalFetch; await removeQueuedObservation(id); }
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
    assert.match(dom.window.document.body.textContent || '',/Adventure starts outside/);
  });
});

test('a fresh private link pairs exactly once even when React repeats startup effects', async()=>{
  await phoneBrowser('#pair=private-first-link',async(dom,codes)=>{
    await settleBrowser();
    assert.deepEqual(codes,['private-first-link']);
    assert.equal(dom.window.location.hash,'');
    assert.match(dom.window.document.body.textContent || '',/Adventure starts outside/);
  });
});

test('walk mode captures multiple photos without inference and keeps them after finishing', async()=>{
  const ids:string[] = [];
  try {
    await phoneBrowser('#pair=walk-test',async(dom)=>{
      await settleBrowser();
      const button = (text:string) => Array.from(dom.window.document.querySelectorAll('button')).find(b=>b.textContent?.trim()===text)!;
      await act(async()=>button('Walk').click());
      await act(async()=>button('Start a walk').click());
      const session=JSON.parse(dom.window.localStorage.getItem('naturedex-walk')!);
      assert.ok(session.id);
      let inference=0;
      const savedFetch=globalThis.fetch;
      globalThis.fetch=async(input, init)=>{ if(String(input)==='/api/scans') inference++; return savedFetch(input,init); };
      const upload=dom.window.document.querySelector<HTMLInputElement>('input[type=file][multiple]')!;
      Object.defineProperty(upload,'files',{value:[new File(['one'],'one.jpg',{type:'image/jpeg'}),new File(['two'],'two.jpg',{type:'image/jpeg'})],configurable:true});
      await act(async()=>{ upload.dispatchEvent(new dom.window.Event('change',{bubbles:true})); await new Promise(resolve=>setTimeout(resolve,40)); });
      const stored=(await getOfflineQueue()).filter(item=>item.walkId===session.id);
      ids.push(...stored.map(item=>item.id));
      assert.equal(stored.length,2);
      assert.equal(inference,0);
      assert.ok(stored.every(item=>item.reviewRequired && item.mode==='field' && item.createdAt));
      await act(async()=>button('Finish walk').click());
      assert.equal(dom.window.localStorage.getItem('naturedex-walk'),null);
      assert.equal((await getOfflineQueue()).filter(item=>ids.includes(item.id)).length,2);
      assert.match(dom.window.document.body.textContent || '',/2 photos to review/);
    });
  } finally { for(const id of ids) await removeQueuedObservation(id); }
});

test('reviewing a saved tentative photo requires confirmation and saves its capture date', async()=>{
  const species = {id:'test-leaf',name:'Test leaf',scientific:'Testus leaf',category:'Plants',rarity:'Unrated',
    image:'/specimens/unknown.svg',tags:[],taxonomy:{},fact:'Compare visible features',habitat:'Unknown',
    sightings:0,first_found:null,last_found:null};
  const createdAt = '2026-01-02T10:30:00.000Z';
  await queueOfflineObservation({id:'review-ui-photo',blob:new Blob(['photo']),mode:'field',note:'Original note',area:null,createdAt,
    scan:{scan_id:'review-scan',mode:'field',photo:null,uncertain:true,message:'Possible match',score_note:'Not a probability',
      candidates:[{species,score:.1}]}});
  try {
    await phoneBrowser('#pair=review-test',async(dom)=>{
      await settleBrowser();
      const lookup = (text:string) => Array.from(dom.window.document.querySelectorAll('button')).find(button=>button.textContent?.includes(text))!;
      await act(async()=>lookup('Review saved photos').click());
      assert.match(dom.window.document.body.textContent || '',/Test leaf/);
      assert.equal(lookup('Add to my NatureDex').disabled,true);
      await act(async()=>dom.window.document.querySelector<HTMLInputElement>('.confirm-check input')!.click());
      assert.equal(lookup('Add to my NatureDex').disabled,false);
      const savedFetch = globalThis.fetch;
      let body:any;
      globalThis.fetch = async(input, init)=>{
        if (String(input)==='/api/observations') {
          body=JSON.parse(String(init?.body));
          return Response.json({xp:50,new_species:true,species});
        }
        return savedFetch(input,init);
      };
      await act(async()=>{ lookup('Add to my NatureDex').click(); await new Promise(resolve=>setTimeout(resolve,30)); });
      await settleBrowser();
      assert.equal(body.offline_id,'review-ui-photo');
      assert.equal(body.captured_at,createdAt);
      assert.equal(body.confirm_uncertain,true);
      assert.equal((await getOfflineQueue()).some(item=>item.id==='review-ui-photo'),false);
    });
  } finally { await removeQueuedObservation('review-ui-photo'); }
});

test('rejecting all matches keeps the original walk photo for another look without awarding XP', async()=>{
  const id='reject-walk-photo';
  const species={id:'test-leaf',name:'Test leaf',scientific:'Testus leaf',category:'Plants',rarity:'Unrated',image:'/specimens/unknown.svg',tags:[],taxonomy:{},fact:'Compare visible features',habitat:'Unknown',sightings:0,first_found:null,last_found:null};
  await queueOfflineObservation({id,blob:new Blob(['original'],{type:'image/jpeg'}),mode:'field',note:'Original note',area:'Park',createdAt:'2026-10-07T10:00:00Z',reviewRequired:true,walkId:'original-walk',scan:{scan_id:'rejected-scan',mode:'field',photo:null,uncertain:false,message:'Match',score_note:'',candidates:[{species,score:.9}]}});
  try {
    await phoneBrowser('#pair=reject-test',async(dom)=>{
      await settleBrowser();
      const button=(text:string)=>Array.from(dom.window.document.querySelectorAll('button')).find(b=>b.textContent?.includes(text))!;
      await act(async()=>button('Review saved photos').click());
      let saves=0;
      const savedFetch=globalThis.fetch;
      globalThis.fetch=async(input,init)=>{ if(String(input)==='/api/observations') saves++; return savedFetch(input,init); };
      await act(async()=>{
        button('None of these').click();
        for (let i=0; i<100; i++) {
          await new Promise(resolve=>setTimeout(resolve,10));
          if (dom.window.document.querySelector('.walk-drafts')) break;
        }
      });
      const held=(await getOfflineQueue()).find(item=>item.id===id)!;
      assert.equal(held.scan,undefined);
      assert.equal(held.reviewRequired,true);
      assert.equal(held.blob.size,8);
      assert.equal(held.createdAt,'2026-10-07T10:00:00Z');
      assert.equal(held.walkId,'original-walk');
      assert.equal(saves,0);
      assert.match(dom.window.document.body.textContent || '',/1 photo to review/);
    });
  } finally { await removeQueuedObservation(id); }
});
