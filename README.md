# Keapr Board

The Keapr operating board: occupancy, guest problems pulled from the inbox, bookings and
revenue (today, any month, running total) and team targets — live from Hostaway.
Built on the earlier **property-tracker** (property counts + losses), which now lives at `/growth`.

## What's on the board (`/`)

| Section | Where the numbers come from |
|---|---|
| Occupancy tonight, vs same night last week | Confirmed reservations covering tonight ÷ properties |
| Booked today / last 24h | Reservations by booking date (`reservationDate`), cancellations by `cancellationDate` |
| Arriving / leaving today | Reservation arrival / departure dates |
| Unanswered, oldest waiting | Conversations where the guest's last message is newer than ours |
| Needs you + hero card | Latest guest message checked for access, maintenance, refund, complaint, noise, WiFi, cancellation keywords (`lib/board.ts` → `RULES`); anything unanswered > 4h is flagged too |
| Bookings & revenue (month picker) | Bookings made in the month, revenue booked, running total for the year, month occupancy, stay revenue & ADR, daily running-total chart vs target pace |
| Next 14 nights heatmap / Tonight by area | Occupancy per area (Hostaway listing `city`) |
| Team targets — people | Google Sheet via `TARGETS_SHEET_CSV_URL` (pulled once a day, `lib/sheets.ts`). Columns: Person, Target, Actual, optional Month / Unit / Team. Until connected: Gelo £20k, Darwin £5k, Christine £10k a month. |
| Team targets — company | `lib/targets.ts` (Hostaway metrics). Always company-wide. |
| Portfolio strip | Properties now, onboarded and lost this month (lost = daily snapshot diff) |

Area pills filter everything except team targets.

## Pages
- `/` Overview: the main board. Tiles, problems and targets click through to the pages below.
- `/inbox` Guest inbox: needs a reply / problems / all, issue-type filters, search, area filter, click a conversation to read the full thread (read-only; reply in Hostaway). Short thank-you messages don't count as needing a reply.
- `/targets` Team targets by month: each person (Google Sheet) with what's left and per-day pace, plus company targets with charts.
- `/growth` Portfolio growth: properties now, brought on / lost, growth chart, last 12 months, searchable lists.

## Run locally
```bash
npm install
npm run dev       # http://localhost:3000 — DEMO DATA with no keys
```
`.env.local` for real data: `HOSTAWAY_ACCOUNT_ID`, `HOSTAWAY_API_KEY`, optional `GREETING_NAME`.

## Deploy (Vercel)
Same as property-tracker: add the Hostaway env vars, add a Blob store (for loss tracking),
the daily cron in `vercel.json` snapshots the roster at 07:00 UTC.

## Code map
- `lib/hostaway.ts` — auth + listings (from property-tracker)
- `lib/hostawayBoard.ts` — reservations + conversations/messages
- `lib/board.ts` — all board maths (shared by real and demo data)
- `lib/mockBoard.ts` — demo data
- `lib/targets.ts` — team targets
- `app/components/Board.tsx`, `app/board.css` — UI
- `app/api/board` — `GET /api/board?month=YYYY-MM&group=<area>`

## Next
Click-through detail pages (each tile / target / problem), reply time, AI summaries of inbox problems.
