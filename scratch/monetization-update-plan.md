# Monetization & UX Update Plan

## 1. Monetization & Play Limits (Agent: Economy)
- **Free Matches:** 3 free online/ranked matches per day.
- **Ad Matches:** After 3 free matches, require 1 ad view per match.
- **Crown Circuit:** Requires 1 ad view per match for free users.
- **Subscriptions:**
  - $3/month Tier: Unlimited online matches, no ads.
  - $6/month Tier: Unlimited online matches, no ads + 10 hint tickets monthly.
- **Login Bonus Update (claim_daily_login_reward):**
  - Day 1-2: 1 Rank Ticket
  - Day 3-4: 2 Rank Tickets
  - Day 5-6: 3 Rank Tickets
  - Day 7: 3 Rank Tickets + 1 Hint Ticket
  - Infinite loop (resets to Day 1 after Day 7).
  - Uncapped inventory for Rank & Hint tickets (remove the 20/60 limits in DB).
  - Migration Prefix: Use 20261004040000_... for your DB migration.

## 2. Hint Ticket Store (Agent: Store)
- **One-time Purchases (Stripe):**
  - 1 ticket: .00
  - 13 tickets: .00
  - 27 tickets: .00
  - 44 tickets: .00
  - 77 tickets: .00
  - 166 tickets: .00
- Support the new  and  tiers in the UI and server (StripeMembership.ts, etc).
- Migration Prefix: Use 20261004050000_... for your DB migration.

## 3. Web Login Maintenance (Agent: Auth)
- Extend session duration to support long-term login ("Keep me logged in" feature).
- Currently RankedAuth has a 1-hour TTL. Provide an option for a long TTL (e.g., 30 days) if requested by the client.
- Implement Cookie-based session persistence or localStorage fallback to survive browser restarts.
- Add UI checkbox for "Keep me logged in" on the login screen.

## 4. QUBE Hint AI & UI (Agent: UI)
- Rename "Hint" feature to "QUBEに聞く" (Ask QUBE).
- Integrate the uploaded image as the QUBE icon.
- Implement "QUBE is thinking..." animation/effect.
- Hook up the strongest CPU configuration (highest depth/eval) for the Hint generation.
