// Deterministic demo data so the board renders with no Hostaway key.
// Shapes match the real mapping in hostawayBoard.ts.
import type { Conversation, RawData, Reservation, Unit } from "./boardTypes";
import { addDays, londonStamp, londonToday } from "./dates";

function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const GROUPS: Array<{ name: string; units: number; rate: number; occ: number }> = [
  { name: "Clacton", units: 14, rate: 95, occ: 0.74 },
  { name: "Colchester", units: 12, rate: 110, occ: 0.81 },
  { name: "Chelmsford", units: 10, rate: 120, occ: 0.69 },
  { name: "Southend", units: 9, rate: 105, occ: 0.77 },
  { name: "London", units: 11, rate: 185, occ: 0.85 },
];

const STREETS = ["Marine Parade", "High Street", "Station Road", "Victoria Court", "Harbour View", "Kings Road", "The Maltings", "Mill Lane", "Abbey Gate", "Riverside"];
const FIRST = ["Sarah", "James", "Priya", "Tom", "Emma", "Mohammed", "Chloe", "Daniel", "Aisha", "Liam", "Grace", "Oliver", "Hannah", "Ravi", "Sophie", "Ben"];
const LAST = ["Taylor", "Patel", "Hughes", "Khan", "Walker", "Evans", "Clarke", "Wright", "Lewis", "Ahmed", "Turner", "Brown"];
const CHANNELS = ["Airbnb", "Booking.com", "Direct", "Vrbo", "Corporate"];

const MESSAGES: Array<[string, number]> = [
  ["Hi, we're stuck outside — the lockbox code isn't working and it's raining. Can someone help asap?", 3],
  ["There's water leaking from the bathroom ceiling into the hallway.", 3],
  ["We cancelled last minute because of a family emergency, can we please get a full refund?", 2],
  ["Honestly the flat was dirty when we arrived, hair in the shower and the bins weren't emptied. Very disappointed, thinking about leaving a review.", 2],
  ["No hot water this morning, boiler shows an error light.", 3],
  ["Neighbours have been playing loud music since 11pm, can't sleep.", 2],
  ["Wifi keeps dropping out, I need it for work calls tomorrow.", 1],
  ["Is early check-in possible? We land at 9am.", 1],
  ["Can we get an invoice for our company for the stay?", 1],
  ["What's the parking situation near the flat?", 1],
  ["Just checking — is there a hairdryer in the apartment?", 1],
  ["We were charged twice for the cleaning fee, can you look into this?", 2],
];

export function mockRawData(): RawData {
  const r = rng(20261112);
  const today = londonToday();
  const nowStamp = londonStamp();

  const units: Unit[] = [];
  let id = 5000;
  for (const g of GROUPS) {
    for (let i = 0; i < g.units; i++) {
      // Most onboarded over the last 2 years, a handful this month.
      const ageDays = i < 1 && g.units > 10 ? Math.floor(r() * 10) : 30 + Math.floor(r() * 700);
      units.push({
        id: id++,
        name: `${g.name} · ${STREETS[i % STREETS.length]} ${i + 1}`,
        group: g.name,
        onboardedAt: addDays(today, -ageDays),
      });
    }
  }

  const reservations: Reservation[] = [];
  let rid = 900000;
  const start = addDays(today, -430);
  const horizon = addDays(today, 120);
  for (const u of units) {
    const g = GROUPS.find((x) => x.name === u.group)!;
    let d = u.onboardedAt > start ? u.onboardedAt : start;
    while (d < horizon) {
      // Gap before next stay, tuned so occupancy ≈ group target.
      const gapMean = (1 - g.occ) * 4.5;
      const gap = Math.floor(r() * gapMean * 2);
      const arrival = addDays(d, gap);
      const nights = 1 + Math.floor(r() * 6);
      const departure = addDays(arrival, nights);
      if (arrival >= horizon) break;

      // Further-out nights are less booked yet.
      const daysOut = (new Date(arrival).getTime() - new Date(today).getTime()) / 86400000;
      const lead = Math.floor(r() * r() * 70);
      const bookedDay = addDays(arrival, -lead);
      if (bookedDay <= today && !(daysOut > 30 && r() < daysOut / 160)) {
        const hh = String(7 + Math.floor(r() * 15)).padStart(2, "0");
        const mm = String(Math.floor(r() * 60)).padStart(2, "0");
        let bookedOn = `${bookedDay} ${hh}:${mm}`;
        if (bookedOn > nowStamp) bookedOn = nowStamp;
        const cancelled = r() < 0.07;
        const seasonal = 1 + 0.25 * Math.sin(((new Date(arrival).getMonth() + 1 - 4) / 12) * 2 * Math.PI);
        reservations.push({
          id: rid++,
          listingId: u.id,
          listingName: u.name,
          guestName: `${FIRST[Math.floor(r() * FIRST.length)]} ${LAST[Math.floor(r() * LAST.length)]}`,
          arrival,
          departure,
          bookedOn,
          cancelledOn: cancelled ? addDays(bookedDay, Math.floor(r() * Math.max(1, lead))) : undefined,
          total: Math.round(nights * g.rate * seasonal * (0.85 + r() * 0.3)),
          status: cancelled ? "cancelled" : "confirmed",
          channel: CHANNELS[Math.floor(r() * CHANNELS.length)],
          checkInTime: 15 + Math.floor(r() * 3),
        });
      }
      d = departure;
    }
  }

  // Conversations: some answered, some waiting.
  const conversations: Conversation[] = [];
  for (let i = 0; i < 34; i++) {
    const u = units[Math.floor(r() * units.length)];
    const [msg] = i < MESSAGES.length ? MESSAGES[i] : MESSAGES[Math.floor(r() * MESSAGES.length)];
    const minsAgo = Math.floor(r() * r() * 60 * 50) + 4;
    const incoming = londonStamp(new Date(Date.now() - minsAgo * 60000));
    const answered = i >= 9 && r() < 0.75;
    conversations.push({
      id: 7000 + i,
      guestName: `${FIRST[Math.floor(r() * FIRST.length)]} ${LAST[Math.floor(r() * LAST.length)]}`,
      listingId: u.id,
      listingName: u.name,
      lastIncomingAt: incoming,
      lastOutgoingAt: answered ? londonStamp(new Date(Date.now() - (minsAgo - 3) * 60000)) : undefined,
      lastMessage: msg,
    });
  }

  const losses = [
    { date: addDays(today, -6), id: 4991, name: "Clacton · Pier Avenue 3", group: "Clacton" },
    { date: addDays(today, -40), id: 4990, name: "Southend · Eastern Esplanade 2", group: "Southend" },
  ];

  return { units, reservations, conversations, losses };
}
