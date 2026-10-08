import 'fake-indexeddb/auto';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cancelOfflineSync, getOfflineQueue, queueOfflineObservation, removeQueuedObservation, syncOfflineQueue } from '../src/snapshot';
import { backendFetch, connectLaptop, readConnection } from '../src/connection';

const originalFetch = globalThis.fetch;
const photo = (id:string) => ({id,blob:new Blob(['original-photo'],{type:'image/jpeg'}),mode:'field' as const,note:'From my walk',area:null,createdAt:'2026-10-08T08:00:00Z',walkId:'morning',reviewRequired:true,autoIdentify:true});

test('direct sync retains the original photo and match for review, even for a confident result',async()=>{
  let scans=0; let saves=0;
  await queueOfflineObservation(photo('auto-walk'));
  try {
    globalThis.fetch=async input=>{
      if(String(input)==='/api/scans') { scans++; return Response.json({scan_id:'cpu-result',uncertain:false,candidates:[]}); }
      saves++; return Response.json({});
    };
    const result=await syncOfflineQueue();
    await syncOfflineQueue();
    assert.equal(scans,1); assert.equal(saves,0); assert.equal(result.ready,1);
    const item=(await getOfflineQueue()).find(p=>p.id==='auto-walk')!;
    assert.equal(item.scan?.scan_id,'cpu-result'); assert.equal(item.syncState,'review');
    assert.equal(await item.blob.text(),'original-photo'); assert.equal(item.createdAt,photo('').createdAt);
  } finally { globalThis.fetch=originalFetch; await removeQueuedObservation('auto-walk'); }
});

test('unavailable laptop keeps photo waiting, then reconnect retries successfully',async()=>{
  await queueOfflineObservation(photo('retry-walk'));
  try {
    globalThis.fetch=async()=>{throw new TypeError('Laptop asleep');};
    assert.equal((await syncOfflineQueue()).failed,1);
    let item=(await getOfflineQueue()).find(p=>p.id==='retry-walk')!;
    assert.equal(item.syncState,'waiting'); assert.equal(item.scan,undefined); assert.equal(item.blob.size,14);
    globalThis.fetch=async()=>Response.json({scan_id:'after-wake',uncertain:true,candidates:[]});
    assert.equal((await syncOfflineQueue()).ready,1);
    item=(await getOfflineQueue()).find(p=>p.id==='retry-walk')!;
    assert.equal(item.scan?.scan_id,'after-wake');
  } finally { globalThis.fetch=originalFetch; await removeQueuedObservation('retry-walk'); }
});

test('discarding during inference does not resurrect the draft',async()=>{
  await queueOfflineObservation(photo('discard-walk'));
  try {
    globalThis.fetch=async()=>{ await removeQueuedObservation('discard-walk'); return Response.json({scan_id:'unused',uncertain:false,candidates:[]}); };
    await syncOfflineQueue();
    assert.equal((await getOfflineQueue()).find(p=>p.id==='discard-walk'),undefined);
  } finally { globalThis.fetch=originalFetch; await removeQueuedObservation('discard-walk'); }
});

test('network loss cancels an in-flight transfer without losing the phone photo',async()=>{
  await queueOfflineObservation(photo('interrupted-walk'));
  try {
    globalThis.fetch=async(_input,options)=>{
      cancelOfflineSync();
      assert.equal(options?.signal?.aborted,true);
      throw new DOMException('Disconnected','AbortError');
    };
    assert.equal((await syncOfflineQueue()).failed,1);
    const held=(await getOfflineQueue()).find(p=>p.id==='interrupted-walk')!;
    assert.equal(held.syncState,'waiting');
    assert.equal(await held.blob.text(),'original-photo');
    globalThis.fetch=async()=>Response.json({scan_id:'retried',uncertain:false,candidates:[]});
    assert.equal((await syncOfflineQueue()).ready,1);
  } finally {globalThis.fetch=originalFetch;await removeQueuedObservation('interrupted-walk');}
});

test('pair once stores only laptop origin and token and directs APIs and photos to it',async()=>{
  const oldStorage=Object.getOwnPropertyDescriptor(globalThis,'localStorage');
  const oldWindow=Object.getOwnPropertyDescriptor(globalThis,'window');
  const values=new Map<string,string>();
  Object.defineProperty(globalThis,'localStorage',{configurable:true,value:{getItem:(key:string)=>values.get(key),setItem:(key:string,value:string)=>values.set(key,value)}});
  Object.defineProperty(globalThis,'window',{configurable:true,value:{location:{origin:'https://naturedex.onrender.com'}}});
  const requests:{url:string;options?:RequestInit}[]=[];
  try {
    globalThis.fetch=async(input,options)=>{ requests.push({url:String(input),options}); return Response.json({access_token:'device-session',connected:true}); };
    await connectLaptop('https://laptop.test/#pair=private-pairing-code','');
    assert.deepEqual(readConnection(),{origin:'https://laptop.test',token:'device-session'});
    await connectLaptop('https://naturedex.onrender.com/#computer=https%3A%2F%2Flaptop.test&pair=private-pairing-code','');
    assert.equal(requests.pop()!.url,'https://laptop.test/api/mobile/pair');
    assert.ok(!JSON.stringify([...values]).includes('private-pairing-code'));
    await backendFetch('/api/dashboard'); await backendFetch('/photos/image.jpg');
    assert.equal(requests[1].url,'https://laptop.test/api/dashboard');
    assert.equal(new Headers(requests[1].options?.headers).get('Authorization'),'Bearer device-session');
    assert.equal(requests[1].options?.credentials,'omit');
    assert.equal(requests[2].url,'https://laptop.test/photos/image.jpg');
    assert.throws(()=>backendFetch('https://other.test/api/dashboard'));
    assert.throws(()=>backendFetch('/photos/../api/dashboard'));
  } finally {
    globalThis.fetch=originalFetch;
    if(oldStorage) Object.defineProperty(globalThis,'localStorage',oldStorage); else delete (globalThis as any).localStorage;
    if(oldWindow) Object.defineProperty(globalThis,'window',oldWindow); else delete (globalThis as any).window;
  }
});
