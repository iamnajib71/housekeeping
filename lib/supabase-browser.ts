import { createBrowserClient } from '@supabase/ssr';
export function browserClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL, key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) throw new Error('Login is not connected yet.');
  return createBrowserClient(url, key);
}
