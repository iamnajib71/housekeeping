'use client';
import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { Check, Download, House, X } from 'lucide-react';
type InstallEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };

async function pushAction(action: string, subscription: PushSubscription) {
  const r = await fetch('/api/push', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, subscription: subscription.toJSON() }) });
  const data = await r.json();
  if (!r.ok) throw new Error(data.error || 'Could not save phone notifications.');
  return data;
}

export async function disconnectPhonePush() {
  if (!('serviceWorker' in navigator)) return;
  const registration = await navigator.serviceWorker.getRegistration('/');
  const subscription = await registration?.pushManager.getSubscription();
  try { if (subscription) await pushAction('unsubscribe', subscription); }
  finally { await subscription?.unsubscribe(); localStorage.removeItem('housekeeping-push-owner'); }
}

// Home-screen setup is available on demand, without notification prompts.
export function PhoneSetup() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false), [installed, setInstalled] = useState(false);
  const [ios, setIos] = useState(false), [instructions, setInstructions] = useState(false);
  const [installEvent, setInstallEvent] = useState<InstallEvent | null>(null);
  useEffect(() => {
    const mode = matchMedia('(display-mode: standalone)');
    const changed = () => setInstalled(mode.matches || (navigator as Navigator & { standalone?: boolean }).standalone === true);
    changed();
    setIos(/iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1));
    if ('serviceWorker' in navigator && window.isSecureContext) void navigator.serviceWorker.register('/sw.js', { scope: '/', updateViaCache: 'none' }).catch(() => {});
    const install = (event: Event) => { event.preventDefault(); setInstallEvent(event as InstallEvent); };
    const done = () => { setInstalled(true); setInstallEvent(null); setInstructions(false); };
    window.addEventListener('beforeinstallprompt', install);window.addEventListener('appinstalled', done);mode.addEventListener('change', changed);
    return () => { window.removeEventListener('beforeinstallprompt', install);window.removeEventListener('appinstalled', done);mode.removeEventListener('change', changed); };
  }, []);
  async function install() {
    if (!installEvent) { setInstructions(true);return; }
    try { await installEvent.prompt();await installEvent.userChoice;setInstallEvent(null); } catch { setInstructions(true); }
  }
  if (pathname !== '/app' || (installed && !open)) return null;
  if (!open) return <button className="phone-setup-launch" aria-label="Add app to Home Screen" onClick={() => setOpen(true)}><Download size={17}/><span>Add app</span></button>;
  return <aside className="phone-setup-card" aria-label="Set up Housekeeping on your phone">
    <button className="phone-setup-close" aria-label="Close phone setup" onClick={() => setOpen(false)}><X size={18}/></button>
    <div className="phone-setup-title"><span><House size={22}/></span><div><h2>Your roster, one tap away</h2><p>Add Housekeeping to your Home Screen.</p></div></div>
    <div className="phone-setup-step"><Download size={19}/><div><b>{installed ? 'Added to your Home Screen' : 'Add to Home Screen'}</b><small>Open it like any other app.</small></div>{installed ? <Check size={18}/> : <button className="button" onClick={install}>Add app</button>}</div>
    {(instructions || (ios && !installed)) && <p className="phone-setup-help">{ios ? 'Open this page in Safari. Tap Share → Add to Home Screen → Add.' : 'Open your browser menu and choose Install app or Add to Home Screen.'}</p>}
    <p className="phone-setup-help">Cleaning reminders arrive by email: in the morning and at 10pm if you have not submitted. Enable Gmail notifications for phone alerts.</p>
    <div className="phone-setup-footer"><button className="text-link" onClick={() => setOpen(false)}>Close</button></div>
  </aside>;
}
