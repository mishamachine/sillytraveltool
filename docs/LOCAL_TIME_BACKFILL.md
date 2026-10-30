# Local-time backfill for existing bookings (applied 21 Oct 2026 with the owner's OK)

New bookings are saved with the time zone of each place (see `docs/LOCAL_TIME.md`). Bookings saved before that have
no zone, so the app keeps showing them the old way until this backfill runs. **Applied on live on 21 Oct 2026; old values are in `public._backup_local_time_20261021` (18 rows) for rollback.**
`docs/local-time-backfill.sql` is the script that was applied; it backs up the old values first.

## What is on live (21 Oct 2026)

- 30 bookings. **18 have flight times**, all imported from email. The 11 hotels and tickets use dates plus printed
  times, which were already right and stay as they are.
- 9 trips, none with a destination zone yet. The app now fills these in when a trip is opened; the script sets them too.
- The 18 flight rows are **mixed**. Most were saved as the printed local time labelled as UTC (an old prompt rule plus
  the server running in UTC). A few emails carried a time-zone offset, so those rows already hold the real moment.
  Each row is classified by which reading gives a realistic flight time:

| Booking | Route | Flight time read as stored | Flight time read as local | Decision | Will show as (local at each airport) |
|---|---|---|---|---|---|
| `8a5b24bf` | SEA→SFO | 2h22 | 2h22 | Printed local time: re-read (One time zone; read as stored it would leave Seattle at 01:15) | 2026-03-11 08:15 PT → 10:37 PT |
| `da90a1a9` | SFO→HKG | 30h35 | 15h35 | Printed local time: re-read | 2026-03-11 12:25 PT → 19:00 Hong Kong SAR China Time |
| `333a4084` | HKG→DEL | 3h55 | 6h25 | Printed local time: re-read | 2026-03-12 20:15 Hong Kong SAR China Time → 00:10 India Time |
| `baf3b141` | SEATTLE→AMSTERDAM | 18h55 | 9h55 | Printed local time: re-read | 2026-04-01 13:45 PT → 08:40 Netherlands Time |
| `ab174e38` | ABQ→DFW | 1h55 | 0h55 | Already the real time: add zones only | 2026-04-01 13:24 MT → 16:19 CT |
| `a64346ab` | DFW→MAD | 9h10 | 2h10 | Already the real time: add zones only | 2026-04-01 17:25 CT → 09:35 Spain Time |
| `3639a9d0` | AMSTERDAM→MADRID | 2h35 | 2h35 | Printed local time: re-read (One time zone; same email as the other Seattle–Amsterdam–Madrid legs) | 2026-04-02 09:35 Netherlands Time → 12:10 Spain Time |
| `3e757c03` | DEL→HKG | 7h40 | 5h10 | Printed local time: re-read | 2026-04-04 01:10 India Time → 08:50 Hong Kong SAR China Time |
| `3ff8c3ec` | HKG→SEA | NEGATIVE 3h20 | 11h40 | Printed local time: re-read | 2026-04-04 13:25 Hong Kong SAR China Time → 10:05 PT |
| `562d06d8` | MADRID→AMSTERDAM | 2h25 | 2h25 | Printed local time: re-read (One time zone; same email as the other Seattle–Amsterdam–Madrid legs) | 2026-04-10 06:00 Spain Time → 08:25 Netherlands Time |
| `776add42` | AMSTERDAM→SEATTLE | 1h25 | 10h25 | Printed local time: re-read | 2026-04-10 10:20 Netherlands Time → 11:45 PT |
| `7661e5d1` | MAD→DFW | 11h15 | 18h15 | Already the real time: add zones only | 2026-04-10 15:55 Spain Time → 20:10 CT |
| `a357b78a` | DFW→ABQ | 1h53 | 2h53 | Already the real time: add zones only | 2026-04-10 22:35 CT → 23:28 MT |
| `df810f6a` | SEA→JFK | 8h15 | 5h15 | Printed local time: re-read | 2026-04-15 07:00 PT → 15:15 ET |
| `4e30041d` | SEA→JFK | 5h27 | 2h27 | Already the real time: add zones only | 2026-04-15 08:45 PT → 17:12 ET |
| `b5f6f55f` | JFK→MAD | 13h15 | 7h15 | Printed local time: re-read | 2026-04-15 18:30 ET → 07:45 Spain Time |
| `94308041` | MAD→JFK | 2h30 | 8h30 | Printed local time: re-read | 2026-04-25 10:00 Spain Time → 12:30 ET |
| `e4e38c09` | JFK→SEA | 3h15 | 6h15 | Printed local time: re-read | 2026-04-25 15:00 ET → 18:15 PT |

**Result: 13 rows re-read as printed local time, 5 kept with zones added, 9 trips get a destination zone.**
Three rows fly within one time zone, so flight time can't decide; the decision column says why. If you know a real
departure time that differs from the last column, tell me which row and I'll flip it before running anything.
