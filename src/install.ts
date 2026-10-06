import { useEffect, useState } from 'react';

interface InstallPrompt extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export function useInstall() {
  const [prompt, setPrompt] = useState<InstallPrompt | null>(null);
  const [installed, setInstalled] = useState(() => window.matchMedia('(display-mode: standalone)').matches || Boolean((navigator as Navigator & {standalone?:boolean}).standalone));
  const [installing, setInstalling] = useState(false);
  useEffect(() => {
    const media = window.matchMedia('(display-mode: standalone)');
    const available = (event: Event) => { event.preventDefault(); setPrompt(event as InstallPrompt); };
    const complete = () => { setInstalled(true); setPrompt(null); };
    const changed = () => setInstalled(media.matches || Boolean((navigator as Navigator & {standalone?:boolean}).standalone));
    window.addEventListener('beforeinstallprompt', available);
    window.addEventListener('appinstalled', complete);
    media.addEventListener('change', changed);
    return () => { window.removeEventListener('beforeinstallprompt', available); window.removeEventListener('appinstalled', complete); media.removeEventListener('change', changed); };
  }, []);
  async function install() {
    if (!prompt) return false;
    setInstalling(true);
    try {
      await prompt.prompt();
      const choice = await prompt.userChoice;
      setPrompt(null);
      return choice.outcome === 'accepted';
    } finally { setInstalling(false); }
  }
  return { available:!!prompt, installed, installing, install };
}
