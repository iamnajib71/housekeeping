'use client';

import { useEffect, useState } from 'react';
import { Moon, Sun } from 'lucide-react';

type Theme = 'light' | 'dark';
const key = 'housekeeping-theme';
function apply(theme: Theme) {
  document.documentElement.dataset.theme = theme;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'dark' ? '#142b27' : '#103d3b');
}

export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>('light');
  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const read = () => {
      let saved: string | null = null;
      try { saved = localStorage.getItem(key); } catch {}
      const next = saved === 'dark' || saved === 'light' ? saved : media.matches ? 'dark' : 'light';
      apply(next); setTheme(next);
    };
    read();
    const storage = (event: StorageEvent) => { if (event.key === key || event.key === null) read(); };
    window.addEventListener('storage', storage);
    media.addEventListener('change', read);
    return () => { window.removeEventListener('storage', storage); media.removeEventListener('change', read); };
  }, []);
  function toggle() {
    const next = theme === 'dark' ? 'light' : 'dark';
    apply(next); setTheme(next);
    try { localStorage.setItem(key, next); } catch {}
  }
  return <button type="button" className="theme-toggle" onClick={toggle} aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'} title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}>
    {theme === 'dark' ? <Sun size={18}/> : <Moon size={18}/>}
    <span>{theme === 'dark' ? 'Light mode' : 'Dark mode'}</span>
  </button>;
}
