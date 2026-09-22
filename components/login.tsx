'use client';
import { useEffect, useState } from 'react';
import { ArrowRight, House, Sparkles, CalendarDays, Camera, ShieldCheck } from 'lucide-react';
import { browserClient } from '@/lib/supabase-browser';
export function Login({ configured }: { configured: boolean }) {
  const [error, setError] = useState(''), [busy, setBusy] = useState(false), [checking, setChecking] = useState(configured);
  useEffect(() => {
    const message = new URLSearchParams(window.location.search).get('error');
    if (message) setError(message);
    if (!configured) return;
    browserClient().auth.getSession().then(({ data }) => {
      if (data.session) window.location.replace('/app');
      else setChecking(false);
    }).catch(() => setChecking(false));
  }, [configured]);
  async function login() {
    setBusy(true); setError('');
    try { const { error } = await browserClient().auth.signInWithOAuth({ provider: 'google', options: { redirectTo: `${window.location.origin}/auth/callback`, queryParams: { prompt: 'select_account' } } }); if (error) throw error; }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not start login.'); setBusy(false); }
  }
  return <main className="login-page"><div className="login-brand"><span className="brand-icon"><House size={25} /></span>housekeeping<span className="brand-period">.</span></div><div className="login-grid"><section className="login-story"><span className="eyebrow"><Sparkles size={16} /> A SHARED HOME. A SHARED EFFORT.</span><h1>A little effort.<br />A happier <em>home.</em></h1><p>Your turn, your tasks, all in one place.<br />Let’s keep the place feeling good.</p><div className="login-features"><span><CalendarDays />A fair, rotating roster</span><span><Camera />A quick photo when you’re done</span><span><ShieldCheck />Just for your household</span></div><div className="login-dates"><span><b>29 SEP</b>Daily cleaning begins</span><span><b>05 OCT</b>Monday team cleans begin</span></div></section><section className="login-card"><span className="welcome-icon"><House size={30} /></span><h2>Welcome home</h2><p>Sign in once with the Google account your household admin added. This device will remember you and open your dashboard next time.</p><button className="button primary full" onClick={login} disabled={!configured || busy || checking}><span className="google-g">G</span>{checking ? 'Checking this device…' : busy ? 'Opening Google…' : 'Continue with Google'}<ArrowRight size={18} /></button>{!configured && <div className="notice">Household login is being connected. You can explore a preview below.</div>}{error && <p className="error" role="alert">{error}</p>}<div className="login-divider" /><a className="text-link" href="/demo">Explore the demo <ArrowRight size={16} /></a><small>The demo uses fictional members.</small><div className="private-note"><ShieldCheck size={15} />Your cleaning photos stay private. Use Log out on shared devices.</div></section></div><footer>Made for the place you call home.<span>Melbourne time · Australia</span></footer></main>;
}
