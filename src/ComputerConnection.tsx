import { useState } from 'react';
import { Laptop, RefreshCw } from 'lucide-react';
import { connectLaptop, readConnection } from './connection';

export function ComputerConnection({ retry }: { retry: () => void }) {
  const [link, setLink] = useState(() => readConnection()?.origin || '');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  return <div className="empty-state computer-connection">
    <Laptop size={42} />
    <h2>Connect to your laptop</h2>
    <p>Pair once. Photos stay on this phone until your laptop is available.</p>
    {readConnection() && <p className="connection-note">Laptop paired. We’ll reconnect automatically while this app is open.</p>}
    <form onSubmit={async event => {
      event.preventDefault();
      setBusy(true); setError('');
      try { await connectLaptop(link, code); setCode(''); setLink(readConnection()?.origin || ''); retry(); }
      catch (error) { setError(error instanceof Error ? error.message : 'Check your phone link.'); }
      finally { setBusy(false); }
    }}>
      <label className="field-label">Private phone link
        <input type="url" required value={link} onChange={event => { setLink(event.target.value); setError(''); }} placeholder="Paste your private laptop pairing link" autoComplete="off" spellCheck={false} autoCapitalize="none" />
      </label>
      <label className="field-label">Pairing code<input type="password" value={code} onChange={event => setCode(event.target.value)} autoComplete="off" placeholder="Included in your private link" /></label>
      {error && <p className="error-box" role="alert">{error}</p>}
      <button className="primary-button full-width" disabled={busy} type="submit">{busy ? 'Connecting…' : 'Pair my laptop'}</button>
    </form>
    <p className="connection-note">Your app stays at this address. Your laptop needs to be awake to identify photos.</p>
    <details><summary>Where do I find the link?</summary><p>Start the NatureDex companion on your laptop. Its configuration must allow this app’s address. Copy its private pairing link here once. Use a stable laptop address for automatic reconnection.</p></details>
    <button className="text-button" type="button" onClick={retry}><RefreshCw size={16} />Retry this connection</button>
  </div>;
}
