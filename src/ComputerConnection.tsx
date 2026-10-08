import { useState } from 'react';
import { ArrowUpRight, Laptop, RefreshCw } from 'lucide-react';
import { computerLink } from './computerLink';

export function ComputerConnection({ retry }: { retry: () => void }) {
  const [link, setLink] = useState('');
  const [error, setError] = useState('');
  return <div className="empty-state computer-connection">
    <Laptop size={42} />
    <h2>Connect to your laptop</h2>
    <p>Open your laptop’s private phone link to use your Field Guide and identify discoveries.</p>
    <form onSubmit={event => {
      event.preventDefault();
      try { window.location.assign(computerLink(link, window.location.origin)); }
      catch (error) { setError(error instanceof Error ? error.message : 'Check your phone link.'); }
    }}>
      <label className="field-label">Private phone link
        <input type="url" required value={link} onChange={event => { setLink(event.target.value); setError(''); }} placeholder="https://…trycloudflare.com/#pair=…" autoComplete="off" spellCheck={false} autoCapitalize="none" />
      </label>
      {error && <p className="error-box" role="alert">{error}</p>}
      <button className="primary-button full-width" type="submit">Open my NatureDex<ArrowUpRight size={17} /></button>
    </form>
    <p className="connection-note">This opens NatureDex at your laptop’s address. Keep the laptop and its phone launcher running, and keep the link private.</p>
    <details><summary>Where do I find the link?</summary><p>On your laptop, start NatureDex with the CPU Phone launcher or <code>npm run phone</code>. Copy the complete HTTPS link it shows, including the pairing part.</p></details>
    <button className="text-button" type="button" onClick={retry}><RefreshCw size={16} />Retry this connection</button>
  </div>;
}
