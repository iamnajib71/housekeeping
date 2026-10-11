import 'server-only';
import { database } from './server';
import type { Assignment, Member, Settings, Submission } from './types';
import { buildPushJobs } from './push-jobs';
import { reminderIsCurrent } from './reminders';
import { pushConfigured, sendBrowserPush } from './web-push';

export async function runPushReminders(db: ReturnType<typeof database>, assignments: Assignment[], members: Member[], submissions: Submission[], settings: Settings[], clock: { date: string; hour: number }) {
  if (!pushConfigured()) return { sent: 0, failed: 0 };
  const { data: devices, error: deviceError } = await db.from('push_subscriptions').select('id,user_id,email');
  if (deviceError) throw deviceError;
  const jobs = buildPushJobs(assignments, members, submissions, settings, devices || [], clock.date, clock.hour);
  for (let i = 0; i < jobs.length; i += 500) {
    const { error } = await db.from('push_jobs').upsert(jobs.slice(i, i + 500), { onConflict: 'subscription_id,member_id,assignment_id', ignoreDuplicates: true });
    if (error) throw error;
  }
  const { error: exhaustedError } = await db.from('push_jobs').update({ status: 'failed' }).eq('status', 'leased').gte('attempts', 3).lt('leased_at', new Date(Date.now() - 5 * 60000).toISOString());
  if (exhaustedError) throw exhaustedError;
  const { data: claimed, error } = await db.rpc('claim_push_jobs', { p_limit: 5 });
  if (error) throw error;
  let sent = 0, failed = 0;
  await Promise.all((claimed || []).map(async (job: { id: string; lease_token: string; subscription_id: string; assignment_id: string; member_id: string; recipient_user_id: string; attempts: number }) => {
    const update = async (values: Record<string, unknown>) => {
      const { error } = await db.from('push_jobs').update(values).eq('id', job.id).eq('lease_token', job.lease_token);
      if (error) throw error;
    };
    try {
      const [{ data: device, error: de }, { data: a, error: ae }, { data: sub, error: se }] = await Promise.all([
        db.from('push_subscriptions').select('*').eq('id', job.subscription_id).maybeSingle(),
        db.from('assignments').select('*').eq('id', job.assignment_id).maybeSingle(),
        db.from('submissions').select('*').eq('assignment_id', job.assignment_id).eq('member_id', job.member_id).maybeSingle(),
      ]);
      if (de || ae || se) throw de || ae || se;
      const member = members.find(m => m.id === job.member_id), preferences = settings.find(s => s.id === a?.household_id);
      if (!device || !a || !member || !preferences || member.household_id !== a.household_id || device.user_id !== job.recipient_user_id || device.email !== member.email?.toLowerCase() || (member.user_id && member.user_id !== device.user_id) || !reminderIsCurrent('overdue', a, member.id, sub ? [sub] : [], clock.date, clock.hour, preferences)) {
        await update({ status: 'cancelled' }); return;
      }
      await sendBrowserPush({ endpoint: device.endpoint, keys: { p256dh: device.p256dh, auth: device.auth } }, {
        title: 'Your cleaning submission is missing',
        body: a.kind === 'weekly' ? 'Your part of the team clean still needs proof. Tap to open your task.' : 'If you have cleaned, remember to submit your checklist and photo proof.',
        url: '/app?assignment=' + encodeURIComponent(a.id) + '&home=' + a.household_id,
        tag: 'clean-' + job.id,
      });
      await update({ status: 'sent', sent_at: new Date().toISOString() }); sent++;
    } catch (e) {
      failed++;
      const expired = [404, 410].includes((e as { statusCode?: number }).statusCode || 0);
      if (expired) { const { error: removeError } = await db.from('push_subscriptions').delete().eq('id', job.subscription_id); if (removeError) throw removeError; }
      else { await update({ status: job.attempts >= 3 ? 'failed' : 'pending', next_attempt_at: new Date(Date.now() + 15 * 60000).toISOString() }); }
    }
  }));
  const { error: pruneError } = await db.from('push_jobs').delete().in('status', ['sent', 'cancelled', 'failed']).lt('created_at', new Date(Date.now() - 30 * 86400000).toISOString());
  if (pruneError) throw pruneError;
  return { sent, failed };
}
