import { createHash } from 'node:crypto';
import { ApiError, bodyJson, checkOrigin, failure, ok, requireUser } from '@/lib/server';
import { validateSubscription } from '@/lib/push-validation';
import { pushConfigured, sendBrowserPush } from '@/lib/web-push';
export const runtime = 'nodejs';

export async function GET() {
  try {
    let userId: string | null = null;
    try { userId = (await requireUser()).user.id; } catch (e) { if (!(e instanceof ApiError) || e.status !== 401) throw e; }
    return ok({ publicKey: pushConfigured() ? process.env.VAPID_PUBLIC_KEY : null, userId });
  } catch (e) { return failure(e); }
}

export async function POST(request: Request) {
  try {
    checkOrigin(request);
    const { db, user } = await requireUser(), body = await bodyJson(request);
    if (!['subscribe', 'status', 'unsubscribe', 'test'].includes(body.action)) throw new ApiError('Unknown notification action.');
    let sub;
    try { sub = validateSubscription(body.subscription); } catch { throw new ApiError('The browser notification subscription is invalid.'); }
    const hash = createHash('sha256').update(sub.endpoint).digest('hex');
    const { data: current, error: readError } = await db.from('push_subscriptions').select('*').eq('endpoint_hash', hash).maybeSingle();
    if (readError) throw readError;
    const own = current?.user_id === user.id;
    if (body.action === 'status') return ok({ enabled: own });
    if (body.action === 'unsubscribe') {
      const { error } = await db.from('push_subscriptions').delete().eq('endpoint_hash', hash).eq('user_id', user.id);
      if (error) throw error;
      return ok({ ok: true });
    }
    if (!pushConfigured()) throw new ApiError('Phone notifications are not configured yet.', 503);
    if (body.action === 'subscribe') {
      const { count, error: countError } = await db.from('push_subscriptions').select('id', { count: 'exact', head: true }).eq('user_id', user.id);
      if (countError) throw countError;
      if (!own && (count || 0) >= 10) throw new ApiError('Too many notification devices. Remove an old device first.');
      // A shared browser can be transferred only with its existing encryption
      // keys; a guessed endpoint must not take over another user's subscription.
      if (current && !own && (current.p256dh !== sub.keys.p256dh || current.auth !== sub.keys.auth)) throw new ApiError('This notification device belongs to another account.', 403);
      const { error } = await db.from('push_subscriptions').upsert({ endpoint_hash: hash, endpoint: sub.endpoint, p256dh: sub.keys.p256dh, auth: sub.keys.auth, user_id: user.id, email: user.email!.toLowerCase(), updated_at: new Date().toISOString() }, { onConflict: 'endpoint_hash' });
      if (error) throw error;
      return ok({ ok: true });
    }
    if (!own) throw new ApiError('Enable notifications on this device first.', 403);
    const { data: reserved, error } = await db.from('push_subscriptions').update({ last_test_at: new Date().toISOString() }).eq('id', current.id).eq('user_id', user.id).or('last_test_at.is.null,last_test_at.lt.' + new Date(Date.now() - 60000).toISOString()).select('id');
    if (error) throw error;
    if (!reserved?.length) throw new ApiError('Please wait a minute before sending another test.', 429);
    try { await sendBrowserPush(sub, { title: 'Housekeeping notifications are ready', body: 'Your cleaning reminders will appear here. Tap to open your dashboard.', url: '/app', tag: 'housekeeping-test' }); }
    catch (e) {
      if ([404, 410].includes((e as { statusCode?: number }).statusCode || 0)) await db.from('push_subscriptions').delete().eq('id', current.id);
      throw new ApiError('Could not send a test. Try enabling notifications again.', 502);
    }
    return ok({ ok: true });
  } catch (e) { return failure(e); }
}
