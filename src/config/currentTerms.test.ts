import { expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { CURRENT_TERMS_VERSION, CURRENT_TERMS_EFFECTIVE_DATE, CURRENT_TERMS_SECTIONS, CURRENT_TERMS_ENGLISH, currentTermsEffective } from './currentTerms';
import { CURRENT_TICKET_TERMS_VERSION } from '../../server/src/services/AccountCurrentTerms';
import { TERMS_VERSION, TERMS_SECTIONS } from './terms';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { TermsDocument } from '../components/TermsDocument';
it('aligns Web/server/SQL publication date and preserves legacy terms',()=>{
 expect(CURRENT_TERMS_VERSION).toBe('2026-10-03.1');expect(CURRENT_TICKET_TERMS_VERSION).toBe(CURRENT_TERMS_VERSION);
 expect(CURRENT_TERMS_EFFECTIVE_DATE).toBe('2026-10-03');expect(TERMS_VERSION).toBe('2026-09-25.1');
 const sql=readFileSync('supabase/migrations/20261003042315_approved_current_terms_consent.sql','utf8');
 expect(sql).toContain("values(true,'2026-10-03.1','2026-10-03')");
 for(const name of ['claim_daily_login_reward','claim_stripe_member_daily_grant','claim_stripe_live_member_daily_grant','stripe_checkout_preflight','stripe_live_checkout_preflight','register_stripe_checkout_intent','register_stripe_live_checkout_intent']) {
  const body=sql.match(new RegExp('create or replace function public\\.'+name+'\\([\\s\\S]*?end \\$\\$;'))?.[0];
  expect(body,name).toContain('not public.has_current_ticket_terms(p_user_id)');
  expect(body,name).not.toContain('2026-09-25.1');
 }
 expect(sql).not.toMatch(/create or replace function public\.(apply_stripe|stripe_(?:live_)?member_status|.*portal|.*cancellation)/);
 for(const index of [0,1,3,4,6,7,8,9]) expect(CURRENT_TERMS_SECTIONS[index]).toEqual(TERMS_SECTIONS[index]);
});
it('fails closed for null, invalid and future dates; uses JST start of publication day',()=>{
 const now=Date.parse('2026-10-02T15:00:00Z');
 for(const date of [null,'2026-02-30','garbage','2026-10-04']) expect(currentTermsEffective(date,now)).toBe(false);
 expect(currentTermsEffective('2026-10-03',now-1)).toBe(false);expect(currentTermsEffective('2026-10-03',now)).toBe(true);
});
it('shows complete approved conditions with publication date and a separate unchanged legacy document',()=>{
 const html=renderToStaticMarkup(createElement(TermsDocument));
 for(const text of ['各60枚','無料券は各20枚','受け取らなかった日','返還分','購読解約','必要最小限','2026-10-03']) expect(html).toContain(text);
 expect(html).not.toContain('未発効');
 const en=CURRENT_TERMS_ENGLISH.map(s=>s[1]).join(' ');expect(en).toContain('USD 3.00');expect(en).toContain('cannot be claimed retroactively');expect(en).toContain('retained separately');
 const legacy=renderToStaticMarkup(createElement(TermsDocument,{legacy:true}));expect(legacy).toContain('2026-09-25.1');expect(legacy).not.toContain('2026-10-03.1');
});
