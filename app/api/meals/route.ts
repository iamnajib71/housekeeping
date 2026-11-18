// Retired feature. Historical meal data remains private and unchanged.
export const dynamic = 'force-dynamic';
export function GET() {
  return Response.json({ error: 'Shared meals has been removed. Refresh the app to open your cleaning dashboard.' }, { status: 410, headers: { 'Cache-Control': 'no-store' } });
}
export const POST = GET;
