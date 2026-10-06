import 'fake-indexeddb/auto';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { api, BackendUnavailable, PairingRequired } from '../src/api';
import { loadFieldGuide } from '../src/snapshot';
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
