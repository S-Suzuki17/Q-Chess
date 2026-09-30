# Optional Web engagement measurement

The production Supabase table and Render receiver were deployed on 2026-09-30.
The code defaults both the Web build flag `NEXT_PUBLIC_ENGAGEMENT_METRICS_ENABLED`
and the Render flag `ENGAGEMENT_METRICS_ENABLED` to OFF. The approved production
Web release explicitly used `QG_ENABLE_WEB_ENGAGEMENT_METRICS=1`; the Render
service has `ENGAGEMENT_METRICS_ENABLED=true`. Collection remains OFF for each
visitor until they opt in through Settings. Ads and daily play limits remain OFF.

## Measurement and consent

- The setting starts OFF. Only an explicit opt-in stores a UTC cohort day and
  milestone state in this browser's localStorage. Disabling the setting aborts
  a pending request and clears both localStorage keys. If browser storage
  deletion fails, a session-level deny marker prevents sending after a reload
  in the same tab and the setting displays a localized warning to clear site
  data. A request already accepted by the server cannot be retracted from
  anonymous aggregate counts.
- Web only. Android/Capacitor does not collect these events. No account ID,
  email, advertising ID, URL, game record, move, device ID or IP is sent in
  the JSON. The seven event names, cohort day and an independent random UUID
  per event are the complete payload. Render/Supabase/Cloudflare may still
  process connection metadata in their normal infrastructure logs.
- The setting is available only on `q-gambit.com` and `www.q-gambit.com`
  (localhost during development). The Pages preview host does not send events.
- The first visit, tutorial and first match are the first ones **after opt-in**.
  D1 means a visit on the following UTC calendar day. Tutorial
  started/completed, first-match started/completed and
  second-match started are limited to the opt-in UTC date and the following
  seven UTC dates. The events in the database
  are retained for less than 90 days by a daily deletion job using an 89-day
  threshold; there is no separate permanent aggregate table.
- First-match completion is recorded only by the same game-board instance that
  recorded first-match start. Completing a different match after abandoning the
  first one does not count. A reload or remount of the original game board may
  therefore undercount completion; this avoids persisting a match identifier.
- An event UUID makes retries idempotent but never links different events.
  Queued events can be delivered after offline use, up to 89 UTC days after
  the cohort date. The receiver cannot verify that the claimed event happened.
  Counting relies on the same browser's local state. Reinstalls, cleared
  storage, multiple browsers, disabled storage, declined consent, blockers,
  and requests interrupted after server acceptance all make rates estimates.
  Anonymous input cannot prove that a game was played; the endpoint has strict
  validation and process-local limits of 120 requests per minute and 5,000 per
  UTC day, but abuse can still distort the counts. These limits can also cause
  undercounting when legitimate traffic is high.

## Daily cohort query

Run as a database administrator, not from the browser. Show tutorial,
first-match and second-match rates only for cohorts at least eight days old;
show D1 only for cohorts at least two days old. Do not sum percentages across
days.

```sql
select cohort_day,
       count(*) filter (where event_type = 'first_visit') as opted_in,
       count(*) filter (where event_type = 'tutorial_started') as tutorial_started,
       count(*) filter (where event_type = 'tutorial_completed') as tutorial_completed,
       count(*) filter (where event_type = 'first_match_started') as first_started,
       count(*) filter (where event_type = 'first_match_completed') as first_completed,
       count(*) filter (where event_type = 'second_match_started') as second_started,
       count(*) filter (where event_type = 'next_day_return') as returned_d1,
       round(100.0 * count(*) filter (where event_type = 'tutorial_completed') /
           nullif(count(*) filter (where event_type = 'tutorial_started'), 0), 1)
           as tutorial_completion_pct,
       round(100.0 * count(*) filter (where event_type = 'first_match_completed') /
           nullif(count(*) filter (where event_type = 'first_match_started'), 0), 1)
           as first_completion_pct,
       round(100.0 * count(*) filter (where event_type = 'second_match_started') /
           nullif(count(*) filter (where event_type = 'first_match_completed'), 0), 1)
           as second_match_start_pct,
       round(100.0 * count(*) filter (where event_type = 'next_day_return') /
           nullif(count(*) filter (where event_type = 'first_visit'), 0), 1)
           as d1_return_pct
from public.engagement_events
where cohort_day >= (now() at time zone 'UTC')::date - 89
group by cohort_day
order by cohort_day desc;
```

The four denominators are deliberately different. These are consenting
browser cohorts, not total visitors or unique people. There is no conversion
estimate for people who declined or never saw the setting.
