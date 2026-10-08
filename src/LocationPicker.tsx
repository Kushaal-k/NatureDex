import { useEffect, useRef, useState } from 'react';
import { MapPin, Loader2, X } from 'lucide-react';

export interface LocationPoint { latitude: number; longitude: number }

export function LocationPicker({ value, changed, enabled = true }: { enabled?: boolean; value: LocationPoint | null; changed: (point: LocationPoint | null) => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const request = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  function cancel() { request.current++; if (timer.current) clearTimeout(timer.current); timer.current = null; }
  useEffect(() => () => cancel(), []);
  useEffect(() => { if (!enabled) { cancel(); setBusy(false); setError(''); } }, [enabled]);
  function locate() {
    if (!enabled) return;
    if (!navigator.geolocation) { setError('Location is unavailable here. You can add a place name or pin the map manually.'); return; }
    if (!window.isSecureContext) { setError('GPS needs a secure HTTPS phone link. You can still add a place name.'); return; }
    cancel();
    const id = request.current;
    setBusy(true); setError('');
    function fail(code: number) {
      if (id !== request.current) return;
      cancel(); setBusy(false);
      setError(code === 1 ? 'Location is blocked. In Chrome, open site settings for this address and allow Location. On Android, also turn on phone Location and allow Chrome to use it. Then try again.' : code === 3 ? 'Location took too long. Check that device Location is on, then try again outdoors. You can also pin the map manually.' : 'Your device could not provide a location. Check device Location and your browser’s location permission, then try again. You can also pin the map manually.');
    }
    // Some browsers never call back while a permission prompt is pending.
    timer.current = setTimeout(() => fail(3), 32000);
    try { navigator.geolocation.getCurrentPosition(position => {
      if (id !== request.current) return;
      cancel(); setBusy(false);
      const { latitude, longitude } = position.coords;
      if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || Math.abs(latitude) > 85 || Math.abs(longitude) > 180) {
        setError('This location is outside the supported map area. Add a place name instead.'); return;
      }
      changed({latitude, longitude});
    }, failure => fail(failure.code), {enableHighAccuracy:false, timeout:30000, maximumAge:60000});
    } catch { fail(2); }
  }
  return <div className="location-picker"><strong>GPS location <span>(optional)</span></strong><p>Use this where you took the photo. Coordinates are saved with the sighting and shown on your map.</p>
    {value && <div className="location-selected" role="status"><MapPin size={16} /><span>Location added: {value.latitude.toFixed(4)}, {value.longitude.toFixed(4)}</span><button type="button" className="icon-button" aria-label="Remove GPS location" onClick={() => { cancel(); setBusy(false); setError(''); changed(null); }}><X size={16} /></button></div>}
    {enabled ? <button type="button" className="secondary-button" disabled={busy} onClick={locate}>{busy ? <Loader2 size={16} className="spin" /> : <MapPin size={16} />}{busy ? 'Finding your location…' : value ? 'Update my location' : 'Use my location'}</button> : <p>GPS is off in your preferences. Enable “Offer GPS location” in Profile to add a location.</p>}
    {error && <p className="error-box" role="alert">{error}</p>}
  </div>;
}
