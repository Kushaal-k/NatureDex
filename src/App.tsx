import { specimenArtwork } from './artwork';
import { lazy, Suspense, useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import {
  ArrowRight, ArrowUpRight, Bird, BookOpen, Bug, Camera, Check, CheckCircle2,
  ChevronRight, Clock3, Compass, Download, Flame, ImagePlus, Info, Leaf,
  Loader2, LockKeyhole, MapPin, Umbrella as Mushroom, NotebookPen, Search, Settings,
  ShieldCheck, Smartphone, Sparkles, Sprout, Sun, TreePine, Trophy, WifiOff, X, Footprints,
} from 'lucide-react';
import { api, PairingRequired, post } from './api';
import { useInstall } from './install';
import { getOfflineQueue, loadFieldGuide, queueOfflineObservation, removeQueuedObservation, syncOfflineQueue, type QueuedObservation } from './snapshot';
import { pairPhone, takePairingCode } from './pairing';
import { sfx } from './audio';
import { LocationPicker, type LocationPoint } from './LocationPicker';
import { Matches } from './Matches';
import { Walkthrough } from './Walkthrough';
import { IdentificationFeedback } from './IdentificationFeedback';
import { SightingHistory } from './SightingHistory';
import { Walk, readWalk, type WalkSession } from './Walk';
import type { Achievement, Dashboard, Expedition, Health, Mode, Page, Scan, Species } from './types';

const DiscoveryMap = lazy(() => import('./DiscoveryMap').then(module => ({ default:module.DiscoveryMap })));

const navigation: { id: Page; name: string; icon: typeof Compass }[] = [
  { id: 'explore', name: 'Explore', icon: Compass },
  { id: 'dex', name: 'Field Guide', icon: BookOpen },
  { id: 'walk', name: 'Walk', icon: Footprints },
  { id: 'map', name: 'Discovery map', icon: MapPin },
  { id: 'expeditions', name: 'Expeditions', icon: TreePine },
  { id: 'journal', name: 'Field journal', icon: NotebookPen },
  { id: 'achievements', name: 'Achievements', icon: Trophy },
];
const sidebarNavigation = navigation.filter(item => ['explore', 'dex', 'walk', 'expeditions', 'achievements'].includes(item.id));
const categories = ['All species', 'Plants', 'Birds', 'Insects', 'Fungi', 'Reptiles'];
const categoryIcons: Record<string, typeof Leaf> = { Plants: Leaf, Birds: Bird, Insects: Bug, Fungi: Mushroom, Reptiles: Sun, Other: Compass };
const achievementIcons: Record<string, typeof Leaf> = { leaf: Sprout, bird: Bird, bug: Bug, mushroom: Mushroom, compass: Compass, sun: Sun };
const readableDate = (value: string | null, short = false) => value ? new Date(value).toLocaleDateString(undefined, { month: short ? 'short' : 'long', day: 'numeric', ...(short ? {} : { year: 'numeric' }) }) : 'Not yet discovered';
const errorMessage = (error: unknown) => {
  const message = error instanceof Error ? error.message : 'Please try again.';
  return /bioclip|dependencies|model|traceback|readme/i.test(message)
    ? 'Photo identification is unavailable right now. Please try again later.' : message;
};

function Dialog({ title, children, close, wide = false, className = '', closeLabel = 'Close dialog' }: { title: string; children: ReactNode; close: () => void; wide?: boolean; className?: string; closeLabel?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const closeRef = useRef(close);
  closeRef.current = close;
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const oldOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    ref.current?.focus();
    const handler = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeRef.current();
      if (event.key !== 'Tab') return;
      const elements = Array.from(ref.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled):not([tabindex="-1"]), textarea, select, a[href], [tabindex="0"]') || []);
      const first = elements[0], last = elements[elements.length - 1];
      if (!first) { event.preventDefault(); return; }
      if (!ref.current?.contains(document.activeElement) || document.activeElement === ref.current) { event.preventDefault(); (event.shiftKey ? last : first).focus(); }
      else if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', handler);
    return () => { document.body.style.overflow = oldOverflow; document.removeEventListener('keydown', handler); previous?.focus(); };
  }, []);
  useEffect(() => { if (!ref.current?.contains(document.activeElement)) ref.current?.focus(); }, [children]);
  return <div className={`modal-backdrop ${className === 'mobile-more-sheet' ? 'mobile-more-backdrop' : ''}`} onMouseDown={event => { if (event.target === event.currentTarget) close(); }}>
    <div ref={ref} className={`modal ${wide ? 'wide' : ''} ${className}`} role="dialog" aria-modal="true" aria-labelledby="dialog-title" tabIndex={-1}>
      <div className="modal-heading"><h2 id="dialog-title">{title}</h2><button className="icon-button" data-sfx="back" aria-label={closeLabel} onClick={close}><X size={21} />{className === 'mobile-more-sheet' && <span>Close</span>}</button></div>
      {children}
    </div>
  </div>;
}

function SpeciesCard({ species, index, onClick }: { species: Species; index: number; onClick: () => void }) {
  const unlocked = species.sightings > 0;
  const Icon = categoryIcons[species.category] || Compass;
  return <button className={`species-card ${unlocked ? '' : 'undiscovered'}`} onClick={onClick} aria-label={unlocked ? `View ${species.name}` : `Undiscovered ${species.category.toLowerCase()} species ${index+1}`}>
    <div className="specimen">
      {unlocked ? <><img src={specimenArtwork(species.image)} alt={species.name} loading="lazy" /><span className="collected-check"><Check size={12} /></span></> : <div className="unknown-specimen"><Icon size={59} strokeWidth={1} /><span>?</span></div>}
    </div>
    <div className="species-card-info"><span className="species-category"><Icon size={12} />{species.category}</span><h3>{unlocked ? species.name : 'A discovery awaits'}</h3>
      <p>{unlocked ? species.scientific : 'Keep your eyes curious'}</p>
      <div className="species-card-bottom">{unlocked ? <><span className={`rarity ${species.rarity.toLowerCase()}`}><i />{species.rarity}</span><ArrowUpRight size={15} /></> : <span className="locked-label"><LockKeyhole size={12} /> Undiscovered</span>}</div>
    </div>
  </button>;
}

function ExpeditionCard({ expedition, onClick }: { expedition: Expedition; onClick: () => void }) {
  const discoveries = expedition.goals.reduce((sum, goal) => sum + (goal.count || 1), 0);
  return <button className={`expedition-card ${expedition.theme}`} onClick={onClick}>
    <div className="expedition-art"><img src="/pixel-woodland.svg" alt="" /><span className="expedition-time"><Clock3 size={13} />{expedition.duration} min outdoors</span></div>
    <div className="expedition-card-body"><span className={`difficulty-badge ${expedition.difficulty || 'medium'}`}>{expedition.difficulty || 'medium'}</span><div className="eyebrow">{expedition.claimed ? 'Completed today' : expedition.active ? 'Your active expedition' : 'A little adventure'}<span><Sparkles size={13} />{expedition.xp} XP</span></div>
      <h3>{expedition.title}</h3><p>{expedition.subtitle}</p>
      <div className="expedition-card-footer"><span>{expedition.claimed ? 'Reward earned. Well explored!' : expedition.active ? `${expedition.completed} of ${expedition.goals.length} goals` : `${discoveries} ${discoveries === 1 ? 'discovery' : 'discoveries'} to make`}</span><ArrowRight size={18} /></div>
    </div>
  </button>;
}

function Badge({ achievement }: { achievement: Achievement }) {
  const unlocked = achievement.progress >= achievement.target;
  const Icon = achievementIcons[achievement.icon] || Trophy;
  return <div className={`badge-card ${unlocked ? 'earned' : ''}`}>
    <div className="badge-emblem"><Icon size={32} strokeWidth={1.5} />{unlocked && <span><Check size={11} /></span>}</div>
    <h3>{achievement.name}</h3><p>{achievement.description}</p>
    <span className="badge-status">{unlocked ? 'Unlocked' : `${Math.min(achievement.progress, achievement.target)} / ${achievement.target}`}</span>
    {!unlocked && <div className="tiny-progress"><span style={{ width: `${Math.min(100, achievement.progress / achievement.target * 100)}%` }} /></div>}
  </div>;
}

export default function App() {
  const install = useInstall();
  const initialPairingCode = useRef<string | null | undefined>(undefined);
  const initialPairing = useRef<Promise<void> | null>(null);
  const [page, setPage] = useState<Page>('explore');
  const mode: Mode = 'field';
  const [name, setName] = useState(() => localStorage.getItem('naturedex-name') || 'Explorer');
  const [gpsEnabled, setGpsEnabled] = useState(() => localStorage.getItem('naturedex-gps-enabled') !== 'false');
  const [saveArea, setSaveArea] = useState(() => localStorage.getItem('naturedex-save-area') !== 'false');
  const [data, setData] = useState<Dashboard | null>(null);
  const [health, setHealth] = useState<Health | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [offline, setOffline] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [pairingRequired, setPairingRequired] = useState(false);
  const [pairingCode, setPairingCode] = useState('');
  const [connectionVersion, setConnectionVersion] = useState(0);
  const [category, setCategory] = useState('All species');
  const [difficulty, setDifficulty] = useState<'all' | 'easy' | 'medium' | 'hard'>('all');
  const [query, setQuery] = useState('');
  const [dialog, setDialog] = useState<'scan' | 'species' | 'expedition' | 'settings' | 'install' | 'example' | null>(null);
  const [selectedSpecies, setSelectedSpecies] = useState<Species | null>(null);
  const [expeditionId, setExpeditionId] = useState<string | null>(null);
  const [scan, setScan] = useState<Scan | null>(null);
  const [candidateIndex, setCandidateIndex] = useState(0);
  const [preview, setPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [note, setNote] = useState('');
  const [area, setArea] = useState('');
  const [location, setLocation] = useState<LocationPoint | null>(null);
  const [toast, setToast] = useState('');
  const [sound, setSound] = useState(() => sfx.isEnabled());
  const [queued, setQueued] = useState<QueuedObservation[]>([]);
  const [queuedReview, setQueuedReview] = useState<QueuedObservation | null>(null);
  const [activeWalk, setActiveWalk] = useState<WalkSession | null>(readWalk);
  const [mapObservation, setMapObservation] = useState<string | null>(null);
  const [walkthroughOpen, setWalkthroughOpen] = useState(() => localStorage.getItem('naturedex-walkthrough-seen') !== '1');
  const [walkthroughStep, setWalkthroughStep] = useState(0);
  const capturedAt = useRef<string>('');
  const fileRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const controller = useRef<AbortController | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const notify = useCallback((message: string) => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast(message);
    toastTimer.current = setTimeout(() => setToast(''), 5500);
  }, []);
  const refresh = useCallback(async (targetMode = mode) => {
    const guide = await loadFieldGuide(targetMode);
    setData(guide.dashboard); setOffline(guide.offline); setSavedAt(guide.savedAt);
    return guide.dashboard;
  }, [mode]);

  useEffect(() => {
    const receiveLink = () => {
      const code = takePairingCode();
      if (!code) return;
      initialPairingCode.current = code;
      initialPairing.current = null;
      setPairingRequired(false);
      setConnectionVersion(value => value + 1);
    };
    window.addEventListener('hashchange', receiveLink);
    return () => window.removeEventListener('hashchange', receiveLink);
  }, []);

  useEffect(() => {
    const abort = new AbortController();
    setLoading(true); setError(''); setData(null); setHealth(null);
    localStorage.setItem('naturedex-mode', mode);
    async function connect() {
      if (initialPairingCode.current === undefined) initialPairingCode.current = takePairingCode();
      const code = initialPairingCode.current;
      if (code) {
        initialPairing.current ||= pairPhone(code);
        await initialPairing.current;
        if (abort.signal.aborted) return;
        initialPairingCode.current = null;
      }
      const guide = await loadFieldGuide(mode, abort.signal);
      if (abort.signal.aborted) return;
      setData(guide.dashboard); setOffline(guide.offline); setSavedAt(guide.savedAt); setPairingRequired(false);
      if (!guide.offline) api<Health>('/health', { signal:abort.signal }).then(state => { if (!abort.signal.aborted) setHealth(state); }).catch(() => {});
    }
    connect().catch(error => { if (!abort.signal.aborted) { setPairingRequired(error instanceof PairingRequired || Boolean(initialPairingCode.current)); setError(errorMessage(error)); } })
      .finally(() => { if (!abort.signal.aborted) setLoading(false); });
    return () => abort.abort();
  }, [mode, connectionVersion]);

  useEffect(() => {
    let active = true;
    getOfflineQueue().then(items => { if (active) setQueued(items); }).catch(() => {});
    const triggerSync = () => {
      syncOfflineQueue().then(({ synced }) => {
        if (!active) return;
        getOfflineQueue().then(items => { if (active) setQueued(items); }).catch(() => {});
        if (synced > 0) {
          notify(`Saved ${synced} discovery${synced > 1 ? 's' : ''}!`);
          refresh();
        }
      }).catch(() => {});
    };
    const reconnect = () => {
      if (offline) setConnectionVersion(value => value + 1);
      triggerSync();
    };
    window.addEventListener('online', reconnect);
    if (!offline) triggerSync();
    return () => { active = false; window.removeEventListener('online', reconnect); };
  }, [offline, refresh, notify]);

  useEffect(() => { localStorage.setItem('naturedex-name', name); }, [name]);
  useEffect(() => { localStorage.setItem('naturedex-gps-enabled', String(gpsEnabled)); if (!gpsEnabled) setLocation(null); }, [gpsEnabled]);
  useEffect(() => { localStorage.setItem('naturedex-save-area', String(saveArea)); }, [saveArea]);
  useEffect(() => { window.scrollTo({ top: 0, behavior: 'instant' }); }, [page]);
  useEffect(() => () => { controller.current?.abort(); if (toastTimer.current) clearTimeout(toastTimer.current); }, []);
  // One listener gives every control its chiptune voice; data-sfx selects the tone.
  useEffect(() => {
    const handler = (event: MouseEvent) => {
      const control = (event.target as HTMLElement | null)?.closest<HTMLElement>('button, a[href]');
      if (!control || control.hasAttribute('disabled')) return;
      const tone = control.dataset.sfx;
      if (tone === 'select') sfx.playSelect();
      else if (tone === 'scan') sfx.playScan();
      else if (tone === 'back') sfx.playCancel();
      else sfx.playClick();
    };
    document.addEventListener('click', handler);
    return () => document.removeEventListener('click', handler);
  }, []);
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);

  function closeDialog() {
    controller.current?.abort(); setDialog(null); setBusy(false); setActionError(''); setQueuedReview(null);
  }
  function startScan() {
    setQueuedReview(null);
    setScan(null); setPreview(null); setConfirmed(false); setCandidateIndex(0); setNote(''); setArea(''); setLocation(null); setActionError(''); setDialog('scan');
  }
  async function identify(file: File, reviewItem?: QueuedObservation) {
    capturedAt.current = reviewItem?.createdAt || new Date().toISOString();
    if (file.size > 12 * 1024 * 1024) { setActionError('Choose a photo smaller than 12 MB.'); return; }
    if (!file.type.startsWith('image/')) { setActionError('Choose an image file.'); return; }
    controller.current?.abort(); controller.current = new AbortController();
    sfx.playScan();
    setPreview(URL.createObjectURL(file)); setScan(null); setBusy(true); setActionError('');
    if (offline) {
      setScan({
        scan_id: 'offline-' + Date.now(),
        mode,
        photo: null,
        candidates: [],
        uncertain: false,
        message: 'Save this photo now and identify it when you reconnect.',
        score_note: '',
      });
      setCandidateIndex(0);
      setConfirmed(true);
      setBusy(false);
      return;
    }
    const form = new FormData(); form.append('file', file);
    try {
      const result = await api<Scan>('/scans', { method: 'POST', body: form, signal: controller.current.signal });
      if (reviewItem) {
        await queueOfflineObservation({ ...reviewItem, scan: result });
        setQueuedReview({ ...reviewItem, scan: result });
        setQueued(await getOfflineQueue());
      }
      setScan(result); setCandidateIndex(0); setConfirmed(false);
      setHealth(await api<Health>('/health'));
    } catch (error) { if (!controller.current.signal.aborted) setActionError(errorMessage(error)); }
    finally { if (!controller.current.signal.aborted) setBusy(false); }
  }
  async function saveDiscovery() {
    if (!scan) return;
    setBusy(true); setActionError('');
    if (queuedReview && offline) { setBusy(false); setActionError('Reconnect to save this reviewed identification.'); return; }
    if (offline && preview) {
      try {
        const res = await fetch(preview);
        const blob = await res.blob();
        await queueOfflineObservation({
          id: crypto.randomUUID(),
          blob,
          mode: 'field',
          note,
          area: saveArea ? area || null : null,
          latitude: location?.latitude ?? null, longitude: location?.longitude ?? null,
          createdAt: capturedAt.current || new Date().toISOString(),
        });
        setQueued(await getOfflineQueue());
        closeDialog();
        sfx.playSelect();
        notify('Photo saved. It will be identified when you reconnect.');
      } catch (error) { setActionError(errorMessage(error)); }
      finally { setBusy(false); }
      return;
    }
    try {
      const result = await post<{ xp: number; new_species: boolean; species: Species }>('/observations', { scan_id: scan.scan_id, candidate: candidateIndex, confirm_uncertain: confirmed, note, area: saveArea ? area || null : null, latitude: location?.latitude ?? null, longitude: location?.longitude ?? null,
        ...(queuedReview ? { offline_id: queuedReview.id, captured_at: queuedReview.createdAt } : {}) });
      if (queuedReview) {
        await removeQueuedObservation(queuedReview.id);
        setQueued(await getOfflineQueue());
      }
      await refresh();
      closeDialog();
      if (result.new_species) sfx.playFanfare(); else sfx.playSelect();
      notify(`${result.new_species ? 'New species unlocked' : 'Another sighting saved'} · ${result.species.name} · +${result.xp} XP`);
    } catch (error) {
      if (queuedReview && /expired/i.test(errorMessage(error))) {
        await queueOfflineObservation({ ...queuedReview, scan: undefined });
        setQueued(await getOfflineQueue());
      }
      setActionError(errorMessage(error));
    }
    finally { setBusy(false); }
  }

  async function syncSavedPhotos() {
    setBusy(true);
    try {
      const result = await syncOfflineQueue();
      setQueued(await getOfflineQueue());
      if (result.synced) await refresh();
      notify(result.failed ? 'Some saved photos could not sync. They are still on this device; reconnect and retry.' : 'Saved photos synced. Review any tentative matches before saving.');
    } catch (error) { notify(errorMessage(error)); }
    finally { setBusy(false); }
  }

  async function reviewSavedPhoto(chosen?: QueuedObservation) {
    const item = chosen || queued.find(item => item.reviewRequired || item.scan?.uncertain);
    if (!item) return;
    setQueuedReview(item); setScan(item.scan || null); setPreview(URL.createObjectURL(item.blob));
    setNote(item.note); setArea(item.area || ''); setLocation(item.latitude != null && item.longitude != null ? {latitude:item.latitude, longitude:item.longitude} : null); setCandidateIndex(0); setConfirmed(false);
    setActionError(''); setDialog('scan');
    if (!item.scan) await identify(new File([item.blob], 'walk-photo.jpg', { type:item.blob.type || 'image/jpeg' }), item);
  }

  async function rejectMatch() {
    if (!scan || !preview) return;
    setBusy(true); setActionError('');
    try {
      const blob = queuedReview?.blob || await (await fetch(preview)).blob();
      await queueOfflineObservation({ ...queuedReview, id:queuedReview?.id || crypto.randomUUID(), blob, mode:'field', note, area:area || null, latitude:location?.latitude ?? null, longitude:location?.longitude ?? null, createdAt:queuedReview?.createdAt || capturedAt.current, scan:undefined, reviewRequired:true });
      setQueued(await getOfflineQueue()); closeDialog(); setPage('walk');
      notify('Photo kept for another look. Try a closer photo or a different angle.');
    } catch (error) { setActionError(errorMessage(error)); }
    finally { setBusy(false); }
  }

  function openMap(id: string) { closeDialog(); setMapObservation(id); setPage('map'); }
  async function expeditionAction(expedition: Expedition, claim = false) {
    if (offline) { setActionError('Reconnect to start an expedition or claim a reward.'); return; }
    setBusy(true); setActionError('');
    try {
      const result = await post<{ xp?: number }>(`/expeditions/${expedition.id}/${claim ? 'claim' : 'start'}`, { mode });
      await refresh();
      if (claim) sfx.playFanfare();
      notify(claim ? `Expedition complete! +${result.xp} XP` : 'Expedition started. Your next discoveries count toward the goals.');
    } catch (error) { setActionError(errorMessage(error)); }
    finally { setBusy(false); }
  }
  async function exportJournal() {
    setBusy(true); setActionError('');
    try {
      const result = offline && data ? data : await api<Dashboard>(`/export?mode=${mode}`);
      const url = URL.createObjectURL(new Blob([JSON.stringify(result, null, 2)], { type: 'application/json' }));
      const link = document.createElement('a'); link.href = url; link.download = `naturedex-${mode}-${new Date().toISOString().slice(0, 10)}.json`; link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000); notify('Your field journal has been exported.');
    } catch (error) { setActionError(errorMessage(error)); }
    finally { setBusy(false); }
  }
  function openSpecies(species: Species) { setSelectedSpecies(species); setDialog('species'); }
  function openExpedition(expedition: Expedition) { setExpeditionId(expedition.id); setDialog('expedition'); setActionError(''); }
  async function connectPhone() {
    setBusy(true); setError('');
    try { await pairPhone(pairingCode); initialPairingCode.current = null; initialPairing.current = null; setPairingCode(''); setConnectionVersion(value => value + 1); }
    catch (error) { setError(errorMessage(error)); }
    finally { setBusy(false); }
  }

  const profile = data?.profile;
  const collected = data?.collection.filter(species => species.sightings > 0) || [];
  const recent = [...collected].sort((a, b) => (b.last_found || '').localeCompare(a.last_found || '')).slice(0, 3);
  const filtered = collected.filter(species =>
    (category === 'All species' || species.category === category) &&
    (!query || `${species.name} ${species.scientific} ${species.category}`.toLowerCase().includes(query.toLowerCase())));
  const guidePage = ['dex', 'journal', 'map'].includes(page);
  const sightings = collected.reduce((total, species) => total + species.sightings, 0);
  const expedition = data?.expeditions.find(e => e.id === expeditionId);
  const candidate = scan?.candidates[candidateIndex];
  const tentative = scan && (scan.uncertain || candidateIndex !== 0);
  const levelProgress = profile ? profile.next_level ? (profile.xp-profile.level_start)/(profile.next_level-profile.level_start)*100 : 100 : 0;
  const hour = new Date().getHours();
  const walkthroughVisible = walkthroughOpen && !loading && !!data && !error && !pairingRequired && !dialog;
  const finishWalkthrough = () => { localStorage.setItem('naturedex-walkthrough-seen', '1'); setWalkthroughOpen(false); };

  return <div className="app-shell">
    <aside className="sidebar" inert={!!dialog || walkthroughVisible}>
      <button className="brand" data-sfx="select" onClick={() => setPage('explore')} aria-label="NatureDex home"><div className="brand-mark"><Leaf size={25} strokeWidth={1.7} /></div><span>Nature<span>Dex</span><small>YOUR WORLD, DISCOVERED.</small></span></button>
      <div className="sidebar-caption">YOUR FIELD GUIDE</div>
      <nav aria-label="Main navigation">{sidebarNavigation.map(item => <button key={item.id} className={`nav-item ${(page === item.id || (item.id === 'dex' && guidePage)) ? 'active' : ''}`} aria-current={(page === item.id || (item.id === 'dex' && guidePage)) ? 'page' : undefined} onClick={() => setPage(item.id)}><item.icon size={19} strokeWidth={1.7} /><span>{item.name}</span>{item.id === 'dex' && <span className="nav-count">{profile?.discovered || 0}</span>}</button>)}</nav>
      <div className="sidebar-bottom"><div className="outdoor-note"><Sprout size={24} /><p>A little less scrolling.<br /><strong>A little more exploring.</strong></p></div>
        {!install.installed && <button className="nav-item" onClick={() => setDialog('install')}><Smartphone size={18} />Install NatureDex</button>}
        <button className="nav-item settings-link" onClick={() => { setActionError(''); setDialog('settings'); }}><Settings size={18} />Profile</button>
        <div className="sidebar-profile"><div className="avatar">{name.slice(0, 1).toUpperCase() || 'E'}</div><div><strong>{name || 'Explorer'}</strong><span>{profile?.title || 'Backyard beginner'}</span></div><span className="level-pill">Lv. {profile?.level || 1}</span></div>
      </div>
    </aside>

    <div className="main-shell" inert={!!dialog || walkthroughVisible}>
      <header className="topbar"><div className="breadcrumb"><span>My field guide</span><ChevronRight size={14} /><strong>{guidePage ? 'Field Guide' : navigation.find(item => item.id === page)?.name}</strong></div>
        <div className="topbar-actions">{!install.installed && <button className="icon-button install-shortcut" aria-label="Install NatureDex on your phone" onClick={() => setDialog('install')}><Smartphone size={19} /></button>}<button className="top-avatar" onClick={() => setDialog('settings')} aria-label="Open profile settings">{name.slice(0, 1).toUpperCase() || 'E'}</button></div>
      </header>
      <main id="main-content">
        {loading ? <div className="loading-state"><Loader2 className="spin" size={30} /><h2>Opening your field guide…</h2></div> : pairingRequired ? <div className="empty-state pairing-card"><ShieldCheck size={42} /><h2>Connect your field guide.</h2><p>Open your NatureDex invitation link, or enter its pairing code below.</p><form onSubmit={event => { event.preventDefault(); connectPhone(); }}><label className="field-label">Pairing code<input type="password" autoComplete="off" value={pairingCode} onChange={event => setPairingCode(event.target.value)} required /></label>{error && <p className="error-box" role="alert">{error}</p>}<button className="primary-button full-width" disabled={busy}>{busy ? <Loader2 className="spin" size={18} /> : <LockKeyhole size={18} />}Connect this phone</button></form></div> : error ? <div className="empty-state"><Leaf size={42} /><h2>Let’s reconnect NatureDex</h2><p>{error}</p><button className="primary-button" onClick={() => setConnectionVersion(value => value + 1)}>Try again</button></div> : data && <>
          {offline && <div className="offline-banner" role="status"><WifiOff size={20} /><div><strong>Your saved field guide</strong><span>Last synced {savedAt ? new Date(savedAt).toLocaleString() : 'earlier'}. You can capture photos offline. Reconnect to identify them and save matches.</span></div><button onClick={() => setConnectionVersion(value => value + 1)}>Reconnect</button></div>}
          {page === 'explore' && <>
            {!!queued.length && <div className="offline-banner" role="status"><BookOpen size={20} /><div><strong>{queued.length} saved photo{queued.length === 1 ? '' : 's'} on this device</strong><span>{queued.some(item => item.reviewRequired || item.scan?.uncertain) ? 'Your saved photos are ready for a closer look.' : 'Your photos are waiting to be identified.'}</span></div>{queued.some(item => item.reviewRequired || item.scan?.uncertain) && <button disabled={busy || offline} onClick={() => reviewSavedPhoto()}>Review saved photos</button>}<button disabled={busy || offline} onClick={syncSavedPhotos}>{busy ? 'Syncing…' : 'Sync saved photos'}</button></div>}
            <div className="page-intro"><div><p className="eyebrow greeting"><Sun size={15} />Good {hour < 12 ? 'morning' : hour < 17 ? 'afternoon' : 'evening'}, {name.toLowerCase() || 'explorer'}</p><h1>Adventure starts outside.</h1><p>A short walk. A new discovery. A story to keep.</p></div><span className="date-label">{new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' })}</span></div>
            <section className="hero simple-hero"><div className="hero-copy"><h2>What caught your eye?</h2><p>Take a photo and meet your next species.</p><button className="primary-button" data-sfx="select" onClick={startScan}><Camera size={18} />Capture a discovery<ArrowUpRight size={17} /></button></div><div className="hero-art"><picture><source media="(min-width: 521px)" srcSet="/pixel-woodland-panorama.svg" /><img src="/pixel-woodland-mobile.svg" alt="Sunlit pixel forest with a winding trail, woodland pool, bird, butterfly, and wildflowers" /></picture><button className="primary-button" data-sfx="select" onClick={startScan}><Camera size={18} />Capture a discovery<ArrowUpRight size={17} /></button></div></section>
            <section className="home-recent"><div className="section-heading"><div><h2>Recent discoveries</h2></div><button className="text-button" onClick={() => setPage('dex')}>Field Guide<ArrowRight size={14} /></button></div>{recent.length ? <div className="recent-grid">{recent.map(species => <SpeciesCard key={species.id} species={species} index={data.collection.findIndex(s => s.id === species.id)} onClick={() => openSpecies(species)} />)}</div> : <div className="empty-collection"><Sprout size={34} /><h3>Your story starts with one discovery.</h3><p>A leaf outside your window is a good place to begin.</p><button className="text-button" data-sfx="select" onClick={startScan}>Find your first species<ArrowRight size={15} /></button></div>}</section>
            <details className="home-extras"><summary>Your progress &amp; expeditions<ChevronRight size={18} /></summary><section className="stats-row" aria-label="Your exploration progress"><div className="stat-card"><div className="stat-icon green"><Leaf size={22} /></div><div><strong>{collected.length}</strong><p>Discoveries</p></div><div className="stat-decoration"><Sprout size={32} strokeWidth={1} /></div></div><div className="stat-card"><div className="stat-icon ochre"><Sparkles size={22} /></div><div><strong>{profile?.xp.toLocaleString()}<span> XP</span></strong><p>Explorer points</p></div><span className="level-small">LEVEL {profile?.level}</span></div><div className="stat-card"><div className="stat-icon terracotta"><Flame size={22} /></div><div><strong>{profile?.streak}<span> {profile?.streak === 1 ? 'day' : 'days'}</span></strong><p>Day streak</p></div><span className="streak-dots">{Array.from({ length: 5 }, (_, i) => <i key={i} className={i < (profile?.streak || 0) ? 'lit' : ''} />)}</span></div></section><div className="section-heading"><h2>Today’s expedition</h2><button className="text-button" onClick={() => setPage('expeditions')}>View all<ArrowRight size={14} /></button></div><ExpeditionCard expedition={data.expeditions[0]} onClick={() => openExpedition(data.expeditions[0])} /></details>
            <div className="field-note"><div className="field-note-icon"><Info size={19} /></div><p><strong>A note from the field</strong> Observe gently. Leave every leaf, nest, and creature just as you found it.</p><span>TAKE ONLY CURIOSITY</span></div>
          </>}

          {guidePage && <section className="field-guide-header"><div className="page-intro"><div><p className="eyebrow">YOUR DISCOVERIES, TOGETHER</p><h1>Field Guide</h1><p>{collected.length} {collected.length === 1 ? 'species' : 'species'} discovered &middot; {sightings} {sightings === 1 ? 'sighting' : 'sightings'}</p></div><button className="primary-button" data-sfx="select" onClick={startScan}><Camera size={17} />New discovery</button></div><nav className="guide-views" aria-label="Field Guide views">{([{id:'dex', name:'Species', Icon:Leaf}, {id:'journal', name:'Timeline', Icon:NotebookPen}, {id:'map', name:'Map', Icon:MapPin}] as const).map(view => <button key={view.id} aria-current={page === view.id ? 'page' : undefined} className={page === view.id ? 'active' : ''} onClick={() => { if (view.id === 'map') setMapObservation(null); setPage(view.id); }}><view.Icon size={18} />{view.name}</button>)}</nav></section>}
          {page === 'dex' && <>
            <div className="collection-controls"><div className="category-tabs" role="group" aria-label="Species categories">{categories.map(cat => { const Icon = categoryIcons[cat]; return <button key={cat} className={category === cat ? 'active' : ''} onClick={() => setCategory(cat)}>{Icon && <Icon size={14} />}{cat}</button>; })}</div><div className="collection-search-row"><label className="search-input"><Search size={17} /><input aria-label="Search species" placeholder="Search your discoveries…" value={query} onChange={event => setQuery(event.target.value)} /></label></div></div>
            <p className="results-label">{filtered.length} {filtered.length === 1 ? 'species' : 'species'}</p>
            <div className="dex-grid">{filtered.map(species => <SpeciesCard key={species.id} species={species} index={data.collection.findIndex(s => s.id === species.id)} onClick={() => openSpecies(species)} />)}</div>
            {!collected.length ? <div className="empty-collection"><Sprout size={34} /><h3>Your field guide starts here.</h3><p>Capture a leaf, flower, or creature. Each species you discover will appear here.</p><button className="primary-button" onClick={startScan}><Camera size={17} />Capture your first discovery</button></div> : !filtered.length && <div className="empty-state"><Search size={30} /><h2>No matching discoveries</h2><p>Try another search or category.</p><button className="text-button" onClick={() => { setQuery(''); setCategory('All species'); }}>Clear filters</button></div>}

          </>}

          {page === 'expeditions' && <>
            <div className="page-intro"><div><p className="eyebrow">FOLLOW YOUR CURIOSITY</p><h1>Small adventures. Big discoveries.</h1><p>Pick a path, pocket your phone, and see what’s waiting outside.</p></div><div className="outline-label"><TreePine size={17} />Fresh goals every day</div></div>
            <div className="expeditions-info"><Compass size={22} /><p><strong>Let nature set the pace.</strong> Start an expedition, then save discoveries to complete its goals. Only sightings made after you start count.</p></div>
            <div className="difficulty-filters" role="group" aria-label="Expedition difficulty">{(['all', 'easy', 'medium', 'hard'] as const).map(level => <button key={level} aria-pressed={difficulty === level} className={difficulty === level ? 'active' : ''} onClick={() => setDifficulty(level)}>{level === 'all' ? 'All expeditions' : level}</button>)}</div><p className="expedition-pace">Choose your pace. Times are estimates; you can finish over several short walks.</p><div className="expedition-grid">{data.expeditions.filter(e => difficulty === 'all' || (e.difficulty || 'medium') === difficulty).map(e => <ExpeditionCard key={e.id} expedition={e} onClick={() => openExpedition(e)} />)}</div>
            <div className="field-note"><Info size={20} /><p>Stay on familiar paths and give wildlife space. You can finish an expedition with several short walks.</p></div>
          </>}

          {page === 'journal' && <>
            <div className="timeline-heading"><h2>Sighting timeline</h2><button className="text-button" onClick={exportJournal} disabled={busy}><Download size={16} />Export journal</button></div>
            {actionError && <p className="error-box" role="alert">{actionError}</p>}
            <div className="journal-list">{data.observations.map((o, i) => { const showDate = i === 0 || readableDate(o.found_at) !== readableDate(data.observations[i-1].found_at); return <div key={o.id}>{showDate && <h2 className="journal-date"><span />{readableDate(o.found_at)}</h2>}<button className="journal-entry" onClick={() => { const species = data.collection.find(s => s.id === o.species_id); if (species) openSpecies(species); }}><img src={specimenArtwork(o.image)} alt="" /><div><span className="eyebrow">{o.category}</span><h3>{o.name}</h3><p>{o.note || 'A moment of curiosity, saved.'}</p><div className="journal-meta"><span><Clock3 size={12} />{new Date(o.found_at).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}</span>{o.area && <span><MapPin size={12} />{o.area}</span>}</div></div><span className="xp-label">+{o.xp} XP</span><ArrowUpRight size={18} /></button></div>; })}</div>
            {!data.observations.length && <div className="empty-state"><NotebookPen size={36} /><h2>A fresh page awaits.</h2><p>Your saved sightings will appear here by date.</p><button className="primary-button" data-sfx="select" onClick={startScan}><Camera size={17} />Make a discovery</button></div>}
          </>}

          {page === 'achievements' && <>
            <div className="page-intro"><div><p className="eyebrow">EVERY SMALL STEP COUNTS</p><h1>Curiosity looks good on you.</h1><p>Little milestones from your adventures in the natural world.</p></div><span className="outline-label"><Trophy size={16} />{data.achievements.filter(a => a.progress >= a.target).length} / {data.achievements.length} unlocked</span></div>
            <section className="level-card"><div className="level-emblem"><Compass size={42} strokeWidth={1.3} /></div><div><span className="eyebrow">LEVEL {profile?.level}</span><h2>{profile?.title}</h2><p>Keep noticing. There’s always another little wonder.</p></div><div className="level-progress"><div><span>{profile?.xp.toLocaleString()} XP</span><span>{profile?.next_level ? `${profile.next_level.toLocaleString()} XP` : 'Highest level'}</span></div><div className="progress-track"><span style={{ width: `${levelProgress}%` }} /></div><p>{profile?.next_level ? `${profile.next_level - profile.xp} XP to your next level` : 'Keep exploring for the joy of discovery.'}</p></div></section>
            <div className="badge-grid">{data.achievements.map(a => <Badge key={a.id} achievement={a} />)}</div>
          </>}
          {page === 'walk' && <Walk gpsEnabled={gpsEnabled} showPlaceName={saveArea} items={queued} changed={setQueued} review={item => reviewSavedPhoto(item)} offline={offline} active={activeWalk} setActive={setActiveWalk} />}
          {page === 'map' && <Suspense fallback={<div className="loading-state">Opening your map…</div>}><DiscoveryMap observations={data.observations} mode={mode} offline={offline} initialId={mapObservation} updated={refresh} openSpecies={id => { const species = data.collection.find(s => s.id === id); if (species) openSpecies(species); }} /></Suspense>}
          <footer className="page-footer"><span><Leaf size={13} />Made for the world outside.</span><span>{page === 'walk' ? 'Capture now. Review when you are ready.' : 'Your discoveries. Your story.'}</span></footer>
        </>}
      </main>
    </div>
    <nav className="mobile-nav" aria-label="Mobile navigation" inert={!!dialog || walkthroughVisible}>{sidebarNavigation.map(item => <button key={item.id} onClick={() => setPage(item.id)} className={(page === item.id || (item.id === 'dex' && guidePage)) ? 'active' : ''} aria-current={(page === item.id || (item.id === 'dex' && guidePage)) ? 'page' : undefined}><item.icon size={20} /><span>{item.id === 'expeditions' ? 'Quests' : item.id === 'achievements' ? 'Badges' : item.name}</span></button>)}</nav>

    {dialog === 'scan' && <Dialog title={scan ? 'Your discovery' : 'Capture a discovery'} close={closeDialog} wide={!!scan}>
      {busy && !scan ? <div className="scanning-state">{preview && <img src={preview} alt="Photo being identified" />}<Loader2 size={34} className="spin" /><h3>{preview ? 'Looking a little closer…' : 'Opening a practice discovery…'}</h3><p>Finding the closest match. This may take a moment.</p></div> : scan && candidate ? <div className="scan-result"><div className="result-photo"><img src={specimenArtwork((queuedReview && preview) || scan.photo || candidate.species.image)} alt={candidate.species.name} /><span className="photo-label">YOUR FIELD PHOTO</span></div><div className="result-details"><p className="eyebrow"><Sparkles size={13} />{tentative ? 'POSSIBLE MATCH' : 'LIKELY MATCH'}</p><h3>{candidate.species.name}</h3><p className="scientific-name">{candidate.species.scientific}</p>
        <IdentificationFeedback scan={scan} alternative={candidateIndex !== 0} disabled={busy} retake={startScan} />
        <Matches scan={scan} selected={candidateIndex} choose={index => { setCandidateIndex(index); setConfirmed(false); }} />{scan.mode === 'field' && <button className="text-button full-width" disabled={busy} onClick={rejectMatch}>None of these — keep photo for later</button>}
        <details className="scan-extras"><summary>Add a note or place<ChevronRight size={16} /></summary><label className="field-label">Field note <span>(optional)</span><textarea value={note} onChange={event => setNote(event.target.value)} maxLength={400} placeholder="What did you notice?" rows={2} /></label>
        {saveArea && <label className="field-label">Place name <span>(optional)</span><input maxLength={100} value={area} onChange={event => setArea(event.target.value)} placeholder="e.g. neighbourhood park" /></label>}
<LocationPicker enabled={gpsEnabled} value={location} changed={setLocation} /></details>
        {tentative && <label className="confirm-check"><input type="checkbox" checked={confirmed} onChange={event => setConfirmed(event.target.checked)} /><span>I’ve reviewed the features and want to save a tentative identification.</span></label>}
        {actionError && <p className="error-box" role="alert">{actionError}</p>}
        <button className="primary-button full-width" disabled={busy || (!!tentative && !confirmed)} onClick={saveDiscovery}>{busy ? <Loader2 className="spin" size={17} /> : <BookOpen size={17} />}Save to Field Guide<ArrowRight size={17} /></button><button className="text-button full-width" data-sfx="back" disabled={busy} onClick={startScan}>Try another discovery</button>
      </div></div> : scan ? <div className="scan-result"><div className="result-photo">{preview && <img src={preview} alt="Captured specimen" />}<span className="photo-label">OFFLINE CAPTURE</span></div><div className="result-details"><p className="eyebrow"><Sparkles size={13} />IDENTIFY LATER</p><h3>A discovery in waiting</h3><p className="scientific-name">Ready when you reconnect</p><p className="identification-note"><Info size={16} />{scan.message}</p>
        <label className="field-label">Field note <span>(optional)</span><textarea value={note} onChange={event => setNote(event.target.value)} maxLength={400} placeholder="What did you notice?" rows={2} /></label>
        {saveArea && <label className="field-label">Place name <span>(optional)</span><input maxLength={100} value={area} onChange={event => setArea(event.target.value)} placeholder="e.g. neighbourhood park" /></label>}
        {actionError && <p className="error-box" role="alert">{actionError}</p>}
        <LocationPicker enabled={gpsEnabled} value={location} changed={setLocation} /><button className="primary-button full-width" disabled={busy} onClick={saveDiscovery}>{busy ? <Loader2 className="spin" size={17} /> : <BookOpen size={17} />}Save photo for later<ArrowRight size={17} /></button><button className="text-button full-width" data-sfx="back" disabled={busy} onClick={startScan}>Take another photo</button>
      </div></div> : <div className="capture-content"><p>Photograph a leaf, a wing, or something wonderfully unfamiliar.</p><div className="capture-options" onDragOver={event => event.preventDefault()} onDrop={event => { event.preventDefault(); const file = event.dataTransfer.files[0]; if (file) identify(file); }}><div className="capture-emblem"><Camera size={30} strokeWidth={1.4} /></div><h3>Something caught your eye?</h3><p>JPEG, PNG, WebP · up to 12 MB</p><button className="primary-button full-width" onClick={() => cameraRef.current?.click()}><Camera size={18} />Take a photo</button><button className="secondary-button full-width" onClick={() => fileRef.current?.click()}><ImagePlus size={18} />Choose from gallery</button></div><input ref={cameraRef} className="sr-only" tabIndex={-1} type="file" accept="image/*" capture="environment" onChange={event => { const file = event.target.files?.[0]; if (file) identify(file); event.target.value = ''; }} /><input ref={fileRef} className="sr-only" tabIndex={-1} type="file" accept="image/*" onChange={event => { const file = event.target.files?.[0]; if (file) identify(file); event.target.value = ''; }} />
        {actionError && <p className="error-box" role="alert">{actionError}</p>}
        {health && !health.model.enabled && <div className="recognition-status" role="status"><Info size={17} /><p>Photo identification is unavailable right now. You can capture photos in Walk and identify them later.</p></div>}

        <p className="capture-tip"><Leaf size={16} aria-hidden="true" /><span>Photograph from a respectful distance. Leave nature where it belongs.</span></p>
      </div>}
    </Dialog>}

    {dialog === 'species' && selectedSpecies && <Dialog title={selectedSpecies.sightings ? 'Your field guide' : 'An undiscovered neighbour'} close={closeDialog} wide={selectedSpecies.sightings > 0}>
      {selectedSpecies.sightings ? <div className="species-detail"><div className="detail-image"><img src={specimenArtwork(selectedSpecies.image)} alt={selectedSpecies.name} /></div><div className="detail-content"><p className="eyebrow">{selectedSpecies.category} · {selectedSpecies.rarity}</p><h3>{selectedSpecies.name}</h3><p className="scientific-name">{selectedSpecies.scientific}</p><div className="detail-stats"><div><span>FIRST DISCOVERED</span><strong>{readableDate(selectedSpecies.first_found, true)}</strong></div><div><span>SIGHTINGS</span><strong>{selectedSpecies.sightings}</strong></div></div><div className="fact-box"><Sparkles size={18} /><div><strong>Did you know?</strong><p>{selectedSpecies.fact}</p></div></div><p className="habitat"><MapPin size={16} />{selectedSpecies.habitat}</p><h4 className="eyebrow taxonomy-title">A PLACE IN THE TREE OF LIFE</h4><div className="taxonomy-tree">{Object.entries(selectedSpecies.taxonomy).filter(([, value]) => value).map(([key, value]) => <div key={key}><span>{key}</span><strong>{value}</strong></div>)}</div><p className="detail-note">You can compare this sighting with future discoveries. Collection rarity is a game label, not a conservation status.</p></div></div> : <div className="locked-detail"><div className="locked-emblem"><LockKeyhole size={33} /></div><p className="eyebrow">{selectedSpecies.category}</p><h3>Some wonders are still waiting.</h3><p>Look around {selectedSpecies.category === 'Fungi' ? 'fallen branches and dead wood' : selectedSpecies.category === 'Birds' ? 'the trees and open spaces near you' : selectedSpecies.category === 'Insects' ? 'flowers and sunny garden edges' : 'your local green spaces'}. Your next discovery could be closer than you think.</p><button className="primary-button" data-sfx="select" onClick={startScan}><Camera size={17} />Make a discovery</button></div>}
      {selectedSpecies.sightings > 0 && <SightingHistory gpsEnabled={gpsEnabled} key={selectedSpecies.id} observations={(data?.observations || []).filter(o => o.species_id === selectedSpecies.id)} mode={mode} offline={offline} updated={refresh} onMap={openMap} />}
    </Dialog>}

    {dialog === 'expedition' && expedition && <Dialog title="Your next little adventure" close={closeDialog}>
      <div className={`quest-detail ${expedition.theme}`}><div className="quest-scene"><img src="/pixel-woodland.svg" alt="Woodland trail illustration" /></div><span className={`difficulty-badge ${expedition.difficulty || 'medium'}`}>{expedition.difficulty || 'medium'}</span><p className="eyebrow">ABOUT {expedition.duration} MIN OUTDOORS · {expedition.xp} XP</p><h3>{expedition.title}</h3><p>{expedition.subtitle}</p><div className="quest-objectives">{expedition.goals.map((goal, i) => <div key={i} className={goal.done ? 'done' : ''}><span>{goal.done ? <Check size={15} /> : i+1}</span><p>{goal.label}{(goal.target || goal.count || 1) > 1 && <small className="goal-progress">{goal.progress || 0} / {goal.target || goal.count} species</small>}</p>{goal.done && <CheckCircle2 size={17} />}</div>)}</div><div className="quest-hint"><Leaf size={16} /><p>Save a discovery after starting to tick off its objective. Keep wildlife at a comfortable distance.</p></div>
        {actionError && <p className="error-box" role="alert">{actionError}</p>}
        {offline && <p className="error-box">Reconnect to start expeditions, save discoveries, or claim rewards.</p>}
        {expedition.claimed ? <div className="completed-expedition"><Trophy size={22} />Well explored! Your reward is in your XP.</div> : expedition.active ? expedition.completed === expedition.goals.length ? <button className="primary-button full-width" disabled={busy || offline} onClick={() => expeditionAction(expedition, true)}>{busy ? <Loader2 className="spin" size={18} /> : <Trophy size={18} />}Claim {expedition.xp} XP</button> : <button className="primary-button full-width" disabled={offline} onClick={startScan}><Camera size={18} />Find a discovery<span>{expedition.completed}/{expedition.goals.length}</span></button> : <button className="primary-button full-width" disabled={busy || offline} onClick={() => expeditionAction(expedition)}>{busy ? <Loader2 className="spin" size={18} /> : <Compass size={18} />}Start expedition<ArrowRight size={17} /></button>}
      </div>
    </Dialog>}

    {walkthroughVisible && <Dialog title="Welcome to NatureDex" close={finishWalkthrough}><Walkthrough example={() => setDialog('example')} step={walkthroughStep} next={() => setWalkthroughStep(step => step + 1)} finish={finishWalkthrough} /></Dialog>}
    {dialog === 'settings' && <Dialog title="Your explorer profile" close={closeDialog}>
      <div className="settings-content"><label className="field-label">What should we call you?<input value={name} maxLength={30} onChange={event => setName(event.target.value)} placeholder="Explorer" /></label>
        <h3>NatureDex on your phone</h3><button className="secondary-button full-width" onClick={() => setDialog('install')}><Smartphone size={17} />{install.installed ? 'Your installed app' : 'Add to your home screen'}</button>
        <button className="text-button walkthrough-replay" onClick={() => { closeDialog(); setWalkthroughStep(0); setWalkthroughOpen(true); }}><BookOpen size={17} />Show the quick walkthrough</button>
        <h3>Your preferences</h3><label className="settings-toggle"><div><strong>Show place-name field</strong><span>Show the optional place-name field when saving.</span></div><input type="checkbox" role="switch" checked={saveArea} onChange={event => setSaveArea(event.target.checked)} /></label><label className="settings-toggle"><div><strong>Offer GPS location</strong><span>Show “Use my location” for photos. Location is requested only when you tap it.</span></div><input type="checkbox" role="switch" checked={gpsEnabled} onChange={event => setGpsEnabled(event.target.checked)} /></label>
        <label className="settings-toggle"><div><strong>Retro sound effects</strong><span>8-bit clicks, scan chirps, and discovery jingles.</span></div><input type="checkbox" role="switch" checked={sound} onChange={() => setSound(sfx.toggle())} /></label>
        {actionError && <p className="error-box" role="alert">{actionError}</p>}<button className="secondary-button full-width" onClick={exportJournal} disabled={busy}><Download size={16} />Export my field journal</button><details className="privacy-details"><summary><ShieldCheck size={16} />About your photos &amp; privacy</summary><p>Photo GPS metadata is removed. You can optionally add GPS using “Use my location”; it is never collected automatically. GPS coordinates and place names are saved with your sighting. Your saved guide is available for browsing without a connection.</p><p>When you use a phone link, photos, notes, and any GPS coordinates you add pass through Cloudflare to the computer hosting NatureDex. Keep your invitation link private. Identification needs that computer to be awake and connected.</p></details>
      </div>
    </Dialog>}
    {dialog === 'example' && <Dialog title="Try an example" close={() => setDialog(null)}><div className="example-content"><p className="eyebrow">EXAMPLE ONLY</p><img src="/pixel-specimens-v2/neem.svg" alt="Pixel illustration of a neem leaf" /><h3>Neem</h3><p className="scientific-name">Azadirachta indica</p><p>A result gives you a suggested species. Compare leaf edges, veins, and the stem, then choose the closest match.</p><div className="walkthrough-hint">With your own photo, Save adds a sighting to your Field Guide. This example adds no discoveries or points.</div><button className="primary-button full-width" onClick={() => { finishWalkthrough(); startScan(); }}><Camera size={17} />Capture my first discovery</button><button className="text-button full-width" onClick={() => setDialog(null)}>Back to walkthrough</button></div></Dialog>}
    {dialog === 'install' && <Dialog title="Your pocket field guide." close={closeDialog}>
      <div className="install-content"><img className="app-icon" src="/icons/icon-192.png" alt="NatureDex leaf icon" /><h3>NatureDex, ready for a walk.</h3><p>Open it from your home screen, take a photo, and keep your discoveries close.</p>{install.installed ? <div className="install-success"><CheckCircle2 size={20} />You’re using the installed app.</div> : <><ol><li>Open your private NatureDex link in <strong>Chrome on Android</strong>.</li><li>Tap Chrome’s <strong>⋮ menu</strong>, then <strong>Add to Home screen</strong> or <strong>Install app</strong>.</li><li>Confirm, then look for the leaf icon on your home screen.</li></ol>{install.available && <button className="primary-button full-width" disabled={install.installing} onClick={() => install.install().then(accepted => { if (accepted) notify('NatureDex has been added to your home screen.'); }).catch(() => notify('Use Chrome’s menu to install NatureDex.'))}>{install.installing ? <Loader2 className="spin" size={18} /> : <Download size={18} />}Install NatureDex</button>}</>}<div className="install-note"><WifiOff size={19} /><p>Browse your saved guide without a connection. Reconnect to identify new photos.</p></div></div>
    </Dialog>}
    {toast && <div className="toast" role="status"><CheckCircle2 size={19} /><span>{toast}</span><button aria-label="Dismiss notification" onClick={() => setToast('')}><X size={16} /></button></div>}
  </div>;
}
