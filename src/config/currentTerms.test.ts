import { expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { CURRENT_TERMS_VERSION, CURRENT_TERMS_EFFECTIVE_DATE, CURRENT_TERMS_SECTIONS, CURRENT_TERMS_ENGLISH, currentTermsEffective } from './currentTerms';
import { CURRENT_TICKET_TERMS_VERSION } from '../../server/src/services/AccountCurrentTerms';
import { TERMS_VERSION, TERMS_SECTIONS } from './terms';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { TermsDocument } from '../components/TermsDocument';
it('aligns the new Web/server/policy release without rewriting prior consent or Checkout snapshots',()=>{
 expect(CURRENT_TERMS_VERSION).toBe('2026-10-07.1'); expect(CURRENT_TICKET_TERMS_VERSION).toBe(CURRENT_TERMS_VERSION);
 expect(CURRENT_TERMS_EFFECTIVE_DATE).toBe('2026-10-07'); expect(TERMS_VERSION).toBe('2026-09-25.1');
 const sql=readFileSync('supabase/migrations/20261007124401_commerce_terms_release_20261007.sql','utf8');
 expect(sql).toContain("set version = '2026-10-07.1', effective_date = '2026-10-07'");
 expect(sql).toContain("check (version = '2026-10-07.1')");
 expect(sql).not.toMatch(/(?:insert into|update|delete from) public\.(?:account_terms_consents|stripe_commerce_checkout_intents)/i);
 const historical=readFileSync('supabase/migrations/20261003042315_approved_current_terms_consent.sql','utf8');
 expect(historical).toContain("values(true,'2026-10-03.1','2026-10-03')");
 for(const index of [0,1,3,4,6,7,8,9]) expect(CURRENT_TERMS_SECTIONS[index]).toEqual(TERMS_SECTIONS[index]);
});
it('fails closed for null, invalid and future dates and starts the new publication on the JST boundary',()=>{
 const now=Date.parse('2026-10-06T15:00:00Z');
 for(const date of [null,'2026-02-30','garbage','2026-10-08']) expect(currentTermsEffective(date,now)).toBe(false);
 expect(currentTermsEffective('2026-10-07',now-1)).toBe(false); expect(currentTermsEffective('2026-10-07',now)).toBe(true);
});
it('renders the new rewards, prices, source terms and preserved legacy benefits in Japanese and English',()=>{
 const html=renderToStaticMarkup(createElement(TermsDocument));
 for(const text of ['1・1・2・2・3・3・3枚','7日目に1枚','7日間の周期','保有上限はありません','USD 3.00','USD 6.00','USD 2.99','各60枚','10枚','166枚USD 100.00','支払済み期間の終了だけでは','購入・支払期間の未使用分','購読解約','必要最小限','2026-10-07.1']) expect(html).toContain(text);
 for(const stale of ['1・1・1・2・2・2・3','2・2・3・3・4・4・5','無料券は各20枚','新しいStandard・Plus・ヒントパックの販売は準備中']) expect(html).not.toContain(stale);
 const en=CURRENT_TERMS_ENGLISH.map(s=>s[1]).join(' ');
 for(const text of ['1,1,2,2,3,3,3','on day 7','seven-day cycle repeats','no holding cap','USD 3.00','USD 6.00','10 CPU practice hint tickets per paid monthly','USD 100.00 for 166','ordinary use expiry','does not expire hints already granted','affected purchase or paid period','USD 2.99','cap of 60 of each kind','cannot be claimed retroactively','retained separately']) expect(en).toContain(text);
 expect(en).not.toContain('sales are being prepared separately');
 const legacy=renderToStaticMarkup(createElement(TermsDocument,{legacy:true})); expect(legacy).toContain('2026-09-25.1'); expect(legacy).not.toContain(CURRENT_TERMS_VERSION);
});
