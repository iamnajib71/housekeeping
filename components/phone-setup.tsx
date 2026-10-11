'use client';
import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { Bell, Check, Download, House, X } from 'lucide-react';
type InstallEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };
type PushConfig = { publicKey: string | null; userId: string | null };

async function readyRegistration() {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      navigator.serviceWorker.ready,
      new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error('The app could not connect phone notifications. Reload and try again.')), 15000); }),
    ]);
  } finally { clearTimeout(timer); }
}

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

export function PhoneSetup() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false), [ready, setReady] = useState(false);
  const [installed, setInstalled] = useState(false), [ios, setIos] = useState(false), [supported, setSupported] = useState(false);
  const [installEvent, setInstallEvent] = useState<InstallEvent | null>(null), [instructions, setInstructions] = useState(false);
  const [permission, setPermission] = useState<NotificationPermission>('default'), [enabled, setEnabled] = useState(false);
  const [config, setConfig] = useState<PushConfig>({ publicKey: null, userId: null });
  const [busy, setBusy] = useState(false), [message, setMessage] = useState(''), [error, setError] = useState('');

  useEffect(() => {
    const screenApp = matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
    const applePhone = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    setInstalled(screenApp); setIos(applePhone);
    setSupported(window.isSecureContext && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window);
    if ('Notification' in window) setPermission(Notification.permission);
    if ('serviceWorker' in navigator && window.isSecureContext) void navigator.serviceWorker.register('/sw.js', { scope: '/', updateViaCache: 'none' }).catch(() => {});
    const install = (event: Event) => { event.preventDefault(); setInstallEvent(event as InstallEvent); };
    const done = () => { setInstalled(true); setInstallEvent(null); setInstructions(false); };
    window.addEventListener('beforeinstallprompt', install); window.addEventListener('appinstalled', done);
    const mode = matchMedia('(display-mode: standalone)');
    const changed = () => setInstalled(mode.matches);
    mode.addEventListener('change', changed);
    return () => { window.removeEventListener('beforeinstallprompt', install); window.removeEventListener('appinstalled', done); mode.removeEventListener('change', changed); };
  }, []);

  useEffect(() => {
    let active = true, timer: ReturnType<typeof setTimeout>;
    (async () => {
      try {
        const response = await fetch('/api/push', { cache: 'no-store' });
        if (!response.ok) return;
        const next: PushConfig = await response.json();
        const registration = 'serviceWorker' in navigator ? await navigator.serviceWorker.getRegistration('/') : undefined;
        const sub = await registration?.pushManager?.getSubscription();
        let subscribed = false;
        if (next.userId && sub && 'Notification' in window && Notification.permission === 'granted') subscribed = Boolean((await pushAction('status', sub)).enabled);
        if (!active) return;
        setConfig(next); setEnabled(subscribed); setReady(true);
        if ('Notification' in window) setPermission(Notification.permission);
        const deferredUntil = Number(localStorage.getItem('housekeeping-phone-later') || 0);
        const standalone = matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
        if (deferredUntil < Date.now() && !(standalone && subscribed)) timer = setTimeout(() => { if (active) setOpen(true); }, 1200);
      } catch { if (active) setReady(true); }
    })();
    return () => { active = false; clearTimeout(timer); };
  }, [pathname]);

  async function install() {
    setError('');
    if (!installEvent) { setInstructions(true); return; }
    try { await installEvent.prompt(); await installEvent.userChoice; setInstallEvent(null); } catch { setInstructions(true); }
  }
  async function enable() {
    setError(''); setMessage('');
    if (!config.userId) { setMessage('Sign in first, then enable reminders for your account.'); return; }
    if (!config.publicKey) { setError('Phone reminders are being connected. Please try again shortly.'); return; }
    setBusy(true);
    try {
      // Called directly from a tap: browsers prohibit permission prompts on load.
      const result = await Notification.requestPermission(); setPermission(result);
      if (result !== 'granted') { setMessage('Notifications were not enabled. Email reminders still work.'); return; }
      const registration = await readyRegistration();
      let sub = await registration.pushManager.getSubscription();
      const bytes = Uint8Array.from(atob(config.publicKey.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0));
      if (sub?.options.applicationServerKey && !Array.from(new Uint8Array(sub.options.applicationServerKey)).every((b, i) => b === bytes[i])) { await sub.unsubscribe(); sub = null; }
      sub ||= await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: bytes });
      await pushAction('subscribe', sub);
      localStorage.setItem('housekeeping-push-owner', config.userId);
      setEnabled(true); setMessage('Notifications enabled. You can send a test below.');
    } catch (e) { setError((e as Error).message || 'Could not enable notifications. Please try again.'); }
    finally { setBusy(false); }
  }
  async function manage(action: 'test' | 'unsubscribe') {
    setBusy(true); setError(''); setMessage('');
    try {
      const registration = await readyRegistration(), sub = await registration.pushManager.getSubscription();
      if (!sub) throw new Error('Enable notifications again on this device.');
      await pushAction(action, sub);
      if (action === 'unsubscribe') { await sub.unsubscribe(); localStorage.removeItem('housekeeping-push-owner'); setEnabled(false); setMessage('Phone notifications turned off on this device.'); }
      else setMessage('Test sent. Check your phone notifications.');
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  }
  function later() { try { localStorage.setItem('housekeeping-phone-later', String(Date.now() + 7 * 86400000)); } catch {} setOpen(false); }
  if (!ready || pathname === '/setup' || pathname.startsWith('/auth/')) return null;
  if (!open) return <button className="phone-setup-launch" aria-label="Phone setup and notifications" onClick={() => { setOpen(true); setMessage(''); setError(''); }}><Bell size={17} /><span>Phone setup</span></button>;
  return <aside className="phone-setup-card" aria-label="Set up Housekeeping on your phone">
    <button className="phone-setup-close" aria-label="Close phone setup" onClick={later}><X size={18}/></button>
    <div className="phone-setup-title"><span><House size={22}/></span><div><h2>Keep your clean on track</h2><p>Quick access and a nudge when proof is missing.</p></div></div>
    <div className="phone-setup-step"><Download size={19}/><div><b>{installed ? 'Added to your Home Screen' : 'Add to Home Screen'}</b><small>{installed ? 'Open it like any other app.' : 'Keep your roster one tap away.'}</small></div>{installed ? <Check size={18}/> : <button className="button" onClick={install}>Add app</button>}</div>
    {(instructions || (ios && !installed)) && <p className="phone-setup-help">{ios ? 'Open this page in Safari. Tap Share → Add to Home Screen → Add. Open the new Housekeeping icon, then enable notifications.' : 'Open your browser menu and choose Install app or Add to Home Screen. If your browser does not offer it, try Chrome or Edge.'}</p>}
    <div className="phone-setup-step"><Bell size={19}/><div><b>{enabled ? 'Notifications enabled' : 'Enable notifications'}</b><small>Reminders for your unsubmitted cleaning turns.</small></div>{enabled ? <Check size={18}/> : <button className="button primary" disabled={busy || permission === 'denied' || (ios && !installed) || !supported} onClick={enable}>{busy ? 'Enabling…' : 'Enable'}</button>}</div>
    {!config.userId && <p className="phone-setup-help">Sign in to receive reminders for your own tasks. <a href="/">Go to login</a></p>}
    {permission === 'denied' && <p className="phone-setup-help">Notifications are blocked. Allow them in your browser or phone settings, then reopen this app.</p>}
    {!supported && !(ios && !installed) && <p className="phone-setup-help">This browser does not support phone notifications. Try Chrome, Edge or Safari. Email reminders still work.</p>}
    {message && <p className="success" role="status">{message}</p>}{error && <p className="error" role="alert">{error}</p>}
    <div className="phone-setup-footer"><button className="text-link" onClick={later}>Later</button>{enabled && <><button className="text-link" disabled={busy} onClick={() => manage('test')}>Send test</button><button className="text-link" disabled={busy} onClick={() => manage('unsubscribe')}>Turn off</button></>}</div>
  </aside>;
}
