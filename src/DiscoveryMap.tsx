import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { MapPin, Check, Navigation, X } from 'lucide-react';
import { post } from './api';
import type { Mode, Observation } from './types';

export function DiscoveryMap({ observations, mode, offline, initialId, updated, openSpecies }: { observations: Observation[]; mode: Mode; offline: boolean; initialId: string | null; updated: () => Promise<unknown>; openSpecies: (id: string) => void }) {
  const container = useRef<HTMLDivElement>(null); const map = useRef<L.Map | null>(null);
  const markers = useRef<L.LayerGroup | null>(null); const draftMarker = useRef<L.CircleMarker | null>(null);
  const [id, setId] = useState(initialId || ''); const selected = observations.find(o => o.id === id);
  const [latitude, setLatitude] = useState(''); const [longitude, setLongitude] = useState(''); const [area, setArea] = useState('');
  const [street, setStreet] = useState(false); const [error, setError] = useState(''); const [message, setMessage] = useState(''); const [busy, setBusy] = useState(false);
  const selection = useRef(id); selection.current = id;
  const lat = latitude.trim() ? Number(latitude) : NaN; const lon = longitude.trim() ? Number(longitude) : NaN;
  const valid = Number.isFinite(lat) && Number.isFinite(lon) && Math.abs(lat) <= 85 && Math.abs(lon) <= 180;
  const pins = observations.filter(o => o.latitude != null && o.longitude != null);
  useEffect(() => {
    if (!container.current) return;
    const instance = L.map(container.current, { center:[20,0], zoom:2, minZoom:2, maxZoom:18, scrollWheelZoom:false, maxBounds:[[-85,-180],[85,180]], maxBoundsViscosity:1 }); map.current = instance;
    instance.createPane('world-outline').style.zIndex = '180';
    instance.attributionControl.addAttribution('<a href="https://www.naturalearthdata.com/">Natural Earth</a>');
    instance.attributionControl.setPrefix(false);
    markers.current = L.layerGroup().addTo(instance);
    const abort = new AbortController();
    fetch('/world-land.geojson', { signal:abort.signal }).then(r => { if (!r.ok) throw new Error(); return r.json(); }).then(data => {
      if (!abort.signal.aborted) L.geoJSON(data, { pane:'world-outline', style:{ color:'#71805a', weight:1, fillColor:'#c6d795', fillOpacity:1 }, interactive:false }).addTo(instance);
    }).catch(() => { if (!abort.signal.aborted) setError('The map overview could not load. You can still add a pin using coordinates.'); });
    // No geolocation API is used: positions come only from manual selection.
    instance.on('click', (event: L.LeafletMouseEvent) => {
      if (!selection.current) { setMessage('Choose a sighting first, then tap a place on the map.'); return; }
      setLatitude(event.latlng.lat.toFixed(5)); setLongitude(event.latlng.lng.toFixed(5)); setMessage('Pin selected. Save it to keep this place.');
    });
    const resize = new ResizeObserver(() => instance.invalidateSize()); resize.observe(container.current);
    return () => { abort.abort(); resize.disconnect(); instance.remove(); map.current = null; markers.current = null; draftMarker.current = null; };
  }, []);
  useEffect(() => { if (initialId) setId(initialId); }, [initialId]);
  useEffect(() => {
    setLatitude(selected?.latitude != null ? String(selected.latitude) : ''); setLongitude(selected?.longitude != null ? String(selected.longitude) : ''); setArea(selected?.area || ''); setError(''); setMessage('');
    if (selected?.latitude != null && selected.longitude != null) map.current?.setView([selected.latitude, selected.longitude], 12);
  }, [selected]);
  useEffect(() => {
    const instance = map.current, group = markers.current; if (!instance || !group) return;
    group.clearLayers();
    for (const o of observations) {
      if (o.latitude == null || o.longitude == null) continue;
      const label = document.createElement('span'); label.textContent = `${o.name}${o.area ? ` · ${o.area}` : ''}`;
      L.circleMarker([o.latitude,o.longitude], { radius:o.id === id ? 10 : 7, color:'#243c2c', weight:2, fillColor:o.id === id ? '#e7c56d' : '#426744', fillOpacity:1, bubblingMouseEvents:false }).bindTooltip(label).on('click', () => setId(o.id)).addTo(group);
    }
  }, [observations, id]);
  useEffect(() => {
    draftMarker.current?.remove(); draftMarker.current = null;
    if (valid && map.current) draftMarker.current = L.circleMarker([lat,lon], { radius:12, color:'#b08b37', weight:3, fillColor:'#e7c56d', fillOpacity:.5, interactive:false }).addTo(map.current);
  }, [lat,lon,valid]);
  useEffect(() => {
    const instance = map.current; if (!instance || !street || offline) return;
    const layer = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom:19, attribution:'&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors' }).addTo(instance);
    layer.on('tileerror', () => setError('Street-map details could not load. Your pins and overview are still available.'));
    return () => { layer.remove(); };
  }, [street, offline]);
  async function save(remove = false) {
    if (!selected || (!remove && !valid)) return;
    setBusy(true); setError('');
    try { await post(`/observations/${selected.id}/details`, { mode, latitude:remove ? null : lat, longitude:remove ? null : lon, ...(remove ? {} : {area}) }); await updated(); setMessage(remove ? 'Pin removed.' : 'Sighting pinned. A place to remember.'); }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not save your pin.'); }
    finally { setBusy(false); }
  }
  return <><div className="page-intro"><div><p className="eyebrow">THE PLACES YOU PAUSED</p><h1>Your discovery map.</h1><p>Pin a sighting yourself. Revisit the places that made you curious.</p></div><span className="outline-label"><MapPin size={16} />{pins.length} pinned sighting{pins.length === 1 ? '' : 's'}</span></div>
    <div className="discovery-map-layout"><section className="map-panel"><div className="map-toolbar"><span>Drag to explore · tap to place a pin</span><button className="text-button" disabled={!pins.length} onClick={() => { if (pins.length) map.current?.fitBounds(L.latLngBounds(pins.map(o => [o.latitude!,o.longitude!])),{padding:[25,25],maxZoom:13}); }}>Show my pins</button></div><div ref={container} className="discovery-map" role="region" aria-label="Discovery map, use arrow keys to pan and plus or minus to zoom" /><label className="map-street-toggle"><input type="checkbox" checked={street} disabled={offline} onChange={e => setStreet(e.target.checked)} />Show street details (online)</label>{street && <p className="feature-note">The area you view is requested from OpenStreetMap. Your notes and photos are not sent.</p>}<p className="feature-note">Overview works offline. Zoom in with street details for paths and parks. No automatic location tracking.</p></section>
    <section className="pin-editor"><h2>A place to remember</h2><label className="field-label">Choose a sighting<select value={id} onChange={e => setId(e.target.value)}><option value="">Select a discovery</option>{observations.map(o => <option key={o.id} value={o.id}>{o.name} · {new Date(o.found_at).toLocaleDateString()}</option>)}</select></label>{selected ? <><div className="pin-sighting"><img src={selected.image} alt={selected.name} /><div><h3>{selected.name}</h3><p>{selected.note || 'Choose a spot on the map.'}</p><button className="text-button" onClick={() => openSpecies(selected.species_id)}>Open species page</button></div></div><label className="field-label">Place name <span>(optional)</span><input value={area} maxLength={100} onChange={e => setArea(e.target.value)} placeholder="e.g. A favourite park" /></label><div className="coordinate-fields"><label className="field-label">Latitude<input type="number" step="any" min={-85} max={85} value={latitude} onChange={e => setLatitude(e.target.value)} /></label><label className="field-label">Longitude<input type="number" step="any" min={-180} max={180} value={longitude} onChange={e => setLongitude(e.target.value)} /></label></div><button className="text-button" disabled={!valid} onClick={() => map.current?.setView([lat,lon],14)}><Navigation size={15} />Go to coordinates</button><button className="primary-button full-width" disabled={!valid || offline || busy} onClick={() => save()}><Check size={16} />Save pin</button>{selected.latitude != null && <button className="text-button full-width" disabled={offline || busy} onClick={() => save(true)}><X size={14} />Remove pin</button>}</> : <p className="feature-note">Choose one of your saved sightings to add a pin. You can use an approximate place.</p>}{offline && <p className="feature-note">Reconnect to save or change a pin.</p>}{error && <p className="error-box" role="alert">{error}</p>}{message && <p className="walk-message" role="status">{message}</p>}</section></div>
    {!!pins.length && <section className="pinned-places"><h2>Places worth another visit</h2>{pins.map(o => <button key={o.id} className={id === o.id ? 'selected' : ''} onClick={() => setId(o.id)}><MapPin size={20} /><div><strong>{o.area || o.name}</strong><span>{o.name} · {new Date(o.found_at).toLocaleDateString()}</span></div></button>)}</section>}
  </>;
}
