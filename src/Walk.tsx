import { LocationPicker, type LocationPoint } from './LocationPicker';
import { useEffect, useRef, useState } from 'react';
import { Camera, ImagePlus, Footprints, Eye, X, CheckCircle2 } from 'lucide-react';
import { getOfflineQueue, queueOfflineObservation, removeQueuedObservation, type QueuedObservation } from './snapshot';

export interface WalkSession { id: string; name: string; startedAt: string }
export function readWalk(): WalkSession | null {
  try { const walk = JSON.parse(localStorage.getItem('naturedex-walk') || 'null'); return walk?.id && walk?.startedAt ? walk : null; } catch { return null; }
}
function DraftPhoto({ item }: { item: QueuedObservation }) {
  const [url, setUrl] = useState('');
  useEffect(() => { const next = URL.createObjectURL(item.blob); setUrl(next); return () => URL.revokeObjectURL(next); }, [item.blob]);
  return <img src={url || undefined} alt="Photo saved during your walk" />;
}
export function Walk({ items, changed, review, offline, active, setActive, gpsEnabled = true, showPlaceName = true }: { gpsEnabled?: boolean; showPlaceName?: boolean; items: QueuedObservation[]; changed: (items: QueuedObservation[]) => void; review: (item: QueuedObservation) => void; offline: boolean; active: WalkSession | null; setActive: (session: WalkSession | null) => void }) {
  const [location, setLocation] = useState<LocationPoint | null>(null);
  useEffect(() => { if (!gpsEnabled) setLocation(null); }, [gpsEnabled]);
  const [name, setName] = useState(''); const [note, setNote] = useState(''); const [area, setArea] = useState('');
  const [error, setError] = useState(''); const [busy, setBusy] = useState(false); const [message, setMessage] = useState('');
  const [discarded, setDiscarded] = useState<QueuedObservation | null>(null);
  const [autoIdentify, setAutoIdentify] = useState(() => localStorage.getItem('naturedex-auto-identify') !== 'false');
  const camera = useRef<HTMLInputElement>(null); const gallery = useRef<HTMLInputElement>(null);
  const drafts = items.filter(item => item.reviewRequired);
  function begin() { const session = { id:crypto.randomUUID(), name:name.trim() || 'A little adventure', startedAt:new Date().toISOString() }; localStorage.setItem('naturedex-walk', JSON.stringify(session)); setActive(session); setMessage(''); }
  function finish() { localStorage.removeItem('naturedex-walk'); setActive(null); setLocation(null); setMessage('Walk complete. Your photos are ready whenever you are.'); }
  async function capture(files: File[]) {
    if (!active || busy) return;
    setBusy(true); setError(''); let saved = 0;
    try {
      for (const file of files) {
        if (!file.type.startsWith('image/') || file.size > 12 * 1024 * 1024) { setError('Some photos were skipped. Choose images smaller than 12 MB.'); continue; }
        await queueOfflineObservation({ id:crypto.randomUUID(), blob:file, mode:'field', note, area:showPlaceName ? area.trim() || null : null, latitude:location?.latitude ?? null, longitude:location?.longitude ?? null, createdAt:new Date().toISOString(), reviewRequired:true, walkId:active.id, walkName:active.name, autoIdentify, syncState:'waiting' }); saved++;
      }
      changed(await getOfflineQueue()); setMessage(`${saved} photo${saved === 1 ? '' : 's'} saved on this phone.`); setNote(''); setLocation(null);
    } catch { setError('Could not save all photos on this device. Free some storage and try again.'); changed(await getOfflineQueue()); }
    finally { setBusy(false); }
  }
  async function discard(id: string) { try { const item = items.find(item => item.id === id); await removeQueuedObservation(id); changed(await getOfflineQueue()); setDiscarded(item || null); } catch { setError('Could not remove this draft. Try again.'); } }
  async function undoDiscard() { if (!discarded) return; try { await queueOfflineObservation(discarded); changed(await getOfflineQueue()); setDiscarded(null); } catch { setError('Could not restore this draft. Try again.'); } }
  return <><div className="page-intro"><div><p className="eyebrow">LESS SCREEN. MORE GREEN.</p><h1>Take NatureDex for a walk.</h1><p>Save moments along the way. Identify them when you get back.</p></div></div>
    <section className="walk-console"><Footprints size={34} /><div><h2>{active ? active.name : 'Ready to head outside?'}</h2><p>{active ? `Started ${new Date(active.startedAt).toLocaleTimeString(undefined,{hour:'numeric',minute:'2-digit'})} · ${drafts.filter(d => d.walkId === active.id).length} photos saved` : 'Photos stay on this device until your laptop can identify them.'}</p></div>
      {!active ? <><label className="field-label">Name your walk<input maxLength={80} value={name} onChange={e => setName(e.target.value)} placeholder="e.g. A lap around the park" /></label><button className="primary-button" onClick={begin}><Footprints size={18} />Start a walk</button></> : <div className="walk-capture">{showPlaceName && <label className="field-label">Place name <span>(optional)</span><input maxLength={100} value={area} onChange={e => setArea(e.target.value)} placeholder="e.g. Riverside park" /></label>}<label className="field-label">Note for your next photo <span>(optional)</span><input maxLength={400} value={note} onChange={e => setNote(e.target.value)} placeholder="What caught your eye?" /></label><LocationPicker enabled={gpsEnabled} value={location} changed={setLocation} /><button className="primary-button" disabled={busy} onClick={() => camera.current?.click()}><Camera size={18} />Take a photo</button><button className="secondary-button" disabled={busy} onClick={() => gallery.current?.click()}><ImagePlus size={18} />Add photos</button><button className="text-button" disabled={busy} onClick={finish}><CheckCircle2 size={16} />Finish walk</button></div>}
      <input ref={camera} className="sr-only" type="file" accept="image/*" capture="environment" tabIndex={-1} onChange={e => { capture(Array.from(e.target.files || [])); e.target.value = ''; }} /><input ref={gallery} className="sr-only" type="file" accept="image/*" multiple tabIndex={-1} onChange={e => { capture(Array.from(e.target.files || [])); e.target.value = ''; }} />
    </section><label className="settings-toggle walk-auto-identify"><div><strong>Identify when my laptop is available</strong><span>Photos transfer directly to your paired laptop while this app is open. Review matches before saving.</span></div><input type="checkbox" role="switch" checked={autoIdentify} onChange={async event => { const enabled = event.target.checked; setAutoIdentify(enabled); localStorage.setItem('naturedex-auto-identify',String(enabled)); for (const photo of drafts.filter(photo => !photo.scan)) await queueOfflineObservation({...photo,autoIdentify:enabled}); changed(await getOfflineQueue()); }} /></label>{error && <p className="error-box" role="alert">{error}</p>}{message && <p className="walk-message" role="status">{message}</p>}
    {discarded && <div className="walk-message" role="status">Draft removed. <button className="text-button" onClick={undoDiscard}>Undo</button></div>}
    <div className="section-heading"><div><p className="eyebrow">FOR ANOTHER LOOK</p><h2>{drafts.length} photo{drafts.length === 1 ? '' : 's'} to review</h2></div></div>
    {offline && <p className="feature-note">Keep taking photos. Reconnect when you’re ready to identify them.</p>}
    <div className="walk-drafts">{drafts.map(item => <article key={item.id}><DraftPhoto item={item} /><div><span className="eyebrow">{item.walkName || 'Saved discovery'}</span><h3>{new Date(item.createdAt).toLocaleDateString(undefined,{month:'short',day:'numeric'})} · {new Date(item.createdAt).toLocaleTimeString(undefined,{hour:'numeric',minute:'2-digit'})}</h3><p className="draft-sync-status" role="status">{item.scan ? 'Ready to review' : item.syncState === 'identifying' && !offline ? 'Identifying on your laptop…' : item.autoIdentify ? offline ? 'Waiting for your laptop' : 'Waiting to identify' : 'Saved on this phone'}</p><p>{item.note || item.area || 'A little moment of curiosity.'}</p><button className="secondary-button" disabled={offline || busy || item.syncState === 'identifying'} onClick={() => review(item)}><Eye size={16} />{item.scan ? 'Review match' : 'Identify photo'}</button><button className="text-button" disabled={busy} onClick={() => discard(item.id)}><X size={14} />Discard draft</button></div></article>)}</div>
    {!drafts.length && <div className="empty-collection"><Camera size={32} /><h3>A walk full of possibilities.</h3><p>Start a walk and take your first photo.</p></div>}
  </>;
}
