import { specimenArtwork } from './artwork';
import { useState } from 'react';
import { MapPin, Pencil, Check, X } from 'lucide-react';
import { post } from './api';
import type { Mode, Observation } from './types';

export function SightingHistory({ observations, mode, offline, updated, onMap }: { observations: Observation[]; mode: Mode; offline: boolean; updated: () => Promise<unknown>; onMap: (id: string) => void }) {
  const [editing, setEditing] = useState<string | null>(null);
  const [note, setNote] = useState(''); const [area, setArea] = useState('');
  const [error, setError] = useState(''); const [busy, setBusy] = useState(false);
  const [photo, setPhoto] = useState<Observation | null>(null);
  async function save(id: string) {
    setBusy(true); setError('');
    try { await post(`/observations/${id}/details`, { mode, note, area }); await updated(); setEditing(null); }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not save. Try again.'); }
    finally { setBusy(false); }
  }
  return <section className="sighting-history"><div className="section-heading"><div><p className="eyebrow">YOUR ENCOUNTERS</p><h2>{observations.length} sighting{observations.length === 1 ? '' : 's'} to remember</h2></div></div>
    {!!observations.length && <div className="sighting-gallery" aria-label="Sighting photos">{observations.map(o => <button key={o.id} aria-label={`View photo from ${new Date(o.found_at).toLocaleDateString()}`} onClick={() => setPhoto(o)}><img src={specimenArtwork(o.image)} alt={o.name} loading="lazy" /></button>)}</div>}
    {photo && <div className="gallery-preview"><button className="icon-button" aria-label="Close photo preview" onClick={() => setPhoto(null)}><X size={18} /></button><img src={specimenArtwork(photo.image)} alt={photo.name} /><p>{new Date(photo.found_at).toLocaleString()}</p></div>}
    {error && <p className="error-box" role="alert">{error}</p>}
    <div className="sighting-timeline">{observations.map(o => <article key={o.id}><header><strong>{new Date(o.found_at).toLocaleDateString(undefined, { day:'numeric', month:'short', year:'numeric' })}</strong><span>{new Date(o.found_at).toLocaleTimeString(undefined,{hour:'numeric',minute:'2-digit'})}</span></header>
      {editing === o.id ? <form onSubmit={e => { e.preventDefault(); save(o.id); }}><label className="field-label">Field note<textarea maxLength={400} value={note} onChange={e => setNote(e.target.value)} /></label><label className="field-label">Place name<input maxLength={100} value={area} onChange={e => setArea(e.target.value)} /></label><div className="sighting-actions"><button className="secondary-button" disabled={busy}><Check size={15} />Save changes</button><button type="button" className="text-button" disabled={busy} onClick={() => setEditing(null)}>Cancel</button></div></form> : <><p>{o.note || 'A little wonder, worth stopping for.'}</p>{o.area && <p className="sighting-place"><MapPin size={14} />{o.area}</p>}<div className="sighting-actions"><button className="text-button" disabled={offline} onClick={() => { setEditing(o.id); setNote(o.note); setArea(o.area || ''); setError(''); }}><Pencil size={14} />Edit note</button><button className="text-button" onClick={() => onMap(o.id)}><MapPin size={14} />{o.latitude != null ? 'View pin' : 'Pin this sighting'}</button></div></>}
    </article>)}</div>{offline && <p className="feature-note">Reconnect to edit notes or save map pins.</p>}
  </section>;
}
