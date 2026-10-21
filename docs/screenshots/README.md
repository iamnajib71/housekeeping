# Interface screenshots

Captured on 22 October 2026 from the actual Next.js dashboard running locally. The desktop capture uses the browser's standard 1280 × 720 viewport; the phone capture uses 390 × 844 to verify the mobile navigation and checklist layout.

All data comes from the fictional members in `tests/fixtures.ts`, the existing schedule generator and a fictional property labelled **Demo household / Fictional demo property**. The fixture date is 19 October 2026. API responses are mocked, mutations are rejected and no live household or proof storage is queried. These are interface previews, not production usage records.

To reproduce, use a checkout without production credentials:

```sh
npm ci
# Terminal 1
npm run dev -- --hostname 127.0.0.1 --port 3011
# Terminal 2
npx tsx scripts/docs-preview.mts
```

Open `http://127.0.0.1:3012/app`, select light mode and dismiss the optional phone-setup panel. Capture the overview at desktop and phone widths. The preview proxy binds only to loopback; all application API calls receive local fictional fixtures, and writes are blocked. Start from `/app` without a `home` query parameter because selecting an account is intentionally blocked in this read-only preview.

Developer indicators were disabled during capture. No screenshot pixels were edited, and no real names, addresses, submissions or proof photos were used.
