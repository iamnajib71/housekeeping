import { createServer, request } from 'node:http';
import { connect } from 'node:net';
import { defaultSettings, testMembers } from '../tests/fixtures';
import { generateSchedule } from '../lib/schedule';

const today = '2026-10-19';
const members = testMembers.map(member => ({ ...member, guide_completed: true }));
const household = { id: 1, name: 'Demo household', address: 'Fictional demo property' };
const dashboard = {
  me: members[0], members, household, settings: defaultSettings,
  assignments: generateSchedule(members, defaultSettings, '2026-10-12', '2027-01-03'),
  submissions: [], today, server_now: '2026-10-19T08:30:00+11:00',
};
const fixtures: Record<string, unknown> = {
  '/api/dashboard': dashboard,
  '/api/account': { ok: true, homes: [household], name: 'Alex', email: 'alex@example.invalid' },
  '/api/push': { publicKey: null, userId: null },
  '/api/meals': { groups: [], today },
  '/api/onboarding': { configured: false, trials: [] },
};
const previewServer = createServer((incoming, outgoing) => {
  const path = new URL(incoming.url || '/', 'http://127.0.0.1:3012').pathname;
  if (path.startsWith('/api/')) {
    const data = incoming.method !== 'GET' ? { error: 'Documentation preview is read-only.' }
      : fixtures[path] || (path.startsWith('/api/assignments/') ? { submissions: [], photos: [] } : { error: 'No fictional fixture for this endpoint.' });
    outgoing.writeHead(incoming.method === 'GET' && !('error' in (data as object)) ? 200 : 403, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
    outgoing.end(JSON.stringify(data));
    return;
  }
  const upstream = request({ hostname: '127.0.0.1', port: 3011, path: incoming.url, method: incoming.method, headers: { ...incoming.headers, host: '127.0.0.1:3011' } }, response => {
    outgoing.writeHead(response.statusCode || 502, response.headers);
    response.pipe(outgoing);
  });
  upstream.on('error', () => { outgoing.writeHead(502); outgoing.end('Local documentation renderer is starting.'); });
  incoming.pipe(upstream);
});
previewServer.on('upgrade', (incoming, socket, head) => {
  const upstream = connect(3011, '127.0.0.1', () => {
    upstream.write(`${incoming.method} ${incoming.url} HTTP/${incoming.httpVersion}\r\n`);
    for (const [name, value] of Object.entries(incoming.headers)) upstream.write(`${name}: ${name === 'host' ? '127.0.0.1:3011' : value}\r\n`);
    upstream.write('\r\n');
    if (head.length) upstream.write(head);
    socket.pipe(upstream).pipe(socket);
  });
  upstream.on('error', () => socket.destroy());
  socket.on('error', () => upstream.destroy());
});
previewServer.listen(3012, '127.0.0.1', () => console.log('Read-only fictional-data preview: http://127.0.0.1:3012/app'));
