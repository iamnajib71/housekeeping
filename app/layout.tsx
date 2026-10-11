import type { Metadata, Viewport } from 'next';
import './globals.css';
import { PhoneSetup } from '@/components/phone-setup';
export const metadata: Metadata = { title: 'Housekeeping · A little effort, a happy home', description: 'Your household cleaning roster, tasks and photo proof in one place.', robots: { index: false, follow: false }, manifest: '/manifest.webmanifest', appleWebApp: { capable: true, title: 'Housekeeping', statusBarStyle: 'default' }, icons: { apple: '/icons/icon-180.png' } };
export const viewport: Viewport = { width: 'device-width', initialScale: 1, themeColor: '#2458e8' };
export default function Layout({ children }: { children: React.ReactNode }) { return <html lang="en"><body>{children}<PhoneSetup /></body></html>; }
