# Property Tracker

A dashboard that shows **how many properties you have onboarded in Hostaway** and **how many you've brought on over time** — great for tracking progress toward an onboarding bonus.

Everything is derived live from the Hostaway API using each listing's `insertedOn` (onboarding) date, so there's **no database and nothing to pay for** — it shows your real history going back to your first listing.

## What it shows

- **Properties now** — live count from Hostaway
- **Brought on this month / last 30 days / previous month** — onboarding momentum
- **Portfolio growth** — real cumulative property count over time
- **Properties brought on** — every property with the date it was onboarded, newest first

## Run it locally

```bash
npm install
npm run dev
```

Open http://localhost:3000. With no key it runs in **DEMO DATA** mode. For real data, create `.env.local`:

```
HOSTAWAY_ACCOUNT_ID=your_account_id
HOSTAWAY_API_KEY=your_api_key
```

(Account ID = Hostaway `client_id`, API key = `client_secret`, from Hostaway → Settings → Hostaway API.)

## Deploy to Vercel

1. Import the repo at [vercel.com/new](https://vercel.com/new) (Next.js is auto-detected).
2. Add two environment variables under **Settings → Environment Variables**:
   - `HOSTAWAY_ACCOUNT_ID`
   - `HOSTAWAY_API_KEY`
3. Deploy. That's it — no database, no cron, no storage add-ons.

## How it works

| Piece | File |
|---|---|
| Hostaway auth + listing fetch (paginated, with `insertedOn`) | `lib/hostaway.ts` |
| Deriving growth history + onboarding stats | `lib/dashboard.ts` |
| Dashboard data API | `app/api/data/route.ts` |
| UI | `app/components/Dashboard.tsx`, `LineChart.tsx` |

### Note on properties *removed*

Hostaway's API only returns current listings, so a property that's been
deleted no longer appears — the API can't tell you historically what was
taken *out*. This tracker therefore focuses on what you've brought *on*
(which is what the bonus is based on). If you later want removal tracking,
it can be added for free by committing a daily snapshot file to this repo.
