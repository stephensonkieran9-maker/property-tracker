# Property Tracker

A dashboard that shows **how many properties you have onboarded in Hostaway**, your **net growth over time**, and a live feed of **properties coming in and going out** — great for tracking progress toward an onboarding bonus.

It pulls the live count from the Hostaway API and records one snapshot per day, so it can show trends and in/out changes that the Hostaway API alone can't.

![stack: Next.js + Vercel KV + Vercel Cron](https://img.shields.io/badge/Next.js-Vercel-black)

---

## What it shows

- **Properties now** — live count from Hostaway
- **Net change** — growth since tracking began
- **Brought on / Off-boarded** — running totals of adds and removals
- **Count over time** — daily line chart
- **In & out feed** — every property that was added or removed, with the date

---

## Run it locally (demo mode, no key needed)

```bash
npm install
npm run dev
```

Open http://localhost:3000 — it starts in **DEMO DATA** mode with realistic sample data so you can see the layout before wiring your key.

---

## Deploy to Vercel

1. **Push this folder to a Git repo** (GitHub/GitLab/Bitbucket) and import it at [vercel.com/new](https://vercel.com/new). Framework preset: **Next.js** (auto-detected).

2. **Add a KV store for snapshot history:**
   Project → **Storage** → **Create Database** → **KV** (Upstash Redis) → connect it to the project.
   Vercel auto-injects `KV_REST_API_URL` and `KV_REST_API_TOKEN`.

3. **Add your Hostaway credentials** under Project → **Settings → Environment Variables**:

   | Variable | Value |
   |---|---|
   | `HOSTAWAY_ACCOUNT_ID` | your Hostaway Account ID (the API `client_id`) |
   | `HOSTAWAY_API_KEY` | your Hostaway API key (the `client_secret`) |
   | `CRON_SECRET` | any long random string |

   Get the Hostaway values from **Hostaway → Settings → Hostaway API**.

4. **Redeploy.** The daily cron (`vercel.json`, 06:00 UTC) records a snapshot automatically. The dashboard also records one on first visit each day, so history stays fresh even without the cron.

> Leaving `HOSTAWAY_*` blank keeps it in demo mode. Set `DEMO_MODE=1` to force demo data even with a key present.

---

## How it works

| Piece | File |
|---|---|
| Hostaway auth + listing fetch (paginated) | `lib/hostaway.ts` |
| Snapshot storage (Vercel KV, local file fallback) | `lib/store.ts` |
| Trend + in/out diffing | `lib/dashboard.ts` |
| Daily cron endpoint | `app/api/snapshot/route.ts` |
| Dashboard data API | `app/api/data/route.ts` |
| UI | `app/components/Dashboard.tsx`, `LineChart.tsx` |

Snapshots are stored as one record per day: `{ date, count, listings: [{id, name}] }`.
"In / out" is computed by diffing each day against the day before, so removed
properties keep their names in the feed.

---

## Notes

- The local file store (`.data/snapshots.json`) is for local dev only — Vercel's
  filesystem is ephemeral, which is why production uses KV.
- Hostaway access tokens are long-lived and cached in memory per instance.
- Cron runs on Vercel's schedule; adjust the time in `vercel.json`.
