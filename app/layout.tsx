import type { Metadata, Viewport } from 'next';
import './globals.css';
import './workspace.css';
import { PhoneSetup } from '@/components/phone-setup';
export const metadata: Metadata = { title: 'Housekeeping · A little effort, a happy home', description: 'Your household cleaning roster, tasks and photo proof in one place.', robots: { index: false, follow: false }, manifest: '/manifest.webmanifest', appleWebApp: { capable: true, title: 'Housekeeping', statusBarStyle: 'default' }, icons: { apple: '/icons/icon-180.png' } };
export const viewport: Viewport = { width: 'device-width', initialScale: 1, themeColor: '#103d3b' };
// Apply a saved device preference before the first paint, without caching private data.
const themeBootstrap = `(function(){try{var t=localStorage.getItem('housekeeping-theme');if(t!=='dark'&&t!=='light')t=window.matchMedia('(prefers-color-scheme:dark)').matches?'dark':'light';document.documentElement.dataset.theme=t;}catch(e){document.documentElement.dataset.theme=window.matchMedia('(prefers-color-scheme:dark)').matches?'dark':'light';}})();`;
export default function Layout({ children }: { children: React.ReactNode }) { return <html lang="en" suppressHydrationWarning><head><script id="housekeeping-theme" dangerouslySetInnerHTML={{__html:themeBootstrap}}/></head><body>{children}<PhoneSetup /></body></html>; }
