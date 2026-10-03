'use client';
import React from 'react';
import type { Language } from '../locales/dict';
import { commerceText } from '../locales/commerceText';
import { stripeMembershipText } from '../locales/stripeMembershipText';
import { ticketWalletText } from '../locales/ticketWalletText';
import { dailyLoginText } from '../locales/dailyLoginText';
import { COMMERCE_SELLER, MEMBER_TICKET_CAP, webCommerceCheckoutReady } from '../config/webCommerce';

/** Only owner-approved public fields. No payment entry point is included here. */
export function CommerceDisclosureDocument({ lang }: { lang: Language }) {
    const text = commerceText(lang), member = stripeMembershipText(lang), wallet = ticketWalletText(lang), tickets = dailyLoginText(lang);
    return <article lang={lang} className="space-y-6 leading-relaxed" data-commerce-disclosure>
        <h1 className="text-2xl text-[#D4B872]">{text.title}</h1>
        {!webCommerceCheckoutReady() && <p role="status">{text.unavailable}</p>}
        <dl className="grid gap-2 sm:grid-cols-[auto_1fr]">
            <dt>{text.seller}</dt><dd>{COMMERCE_SELLER.legalName} · {COMMERCE_SELLER.businessName}</dd>
            <dt>{text.address}</dt><dd>{COMMERCE_SELLER.address}</dd>
            <dt>{text.phone}</dt><dd><a className="underline" href={`tel:${COMMERCE_SELLER.telephoneUri}`}>{COMMERCE_SELLER.telephone}</a></dd>
            <dt>{text.support}</dt><dd><a className="break-all underline" href={`mailto:${COMMERCE_SELLER.email}`}>{COMMERCE_SELLER.email}</a></dd>
            <dt>{text.price}</dt><dd>{webCommerceCheckoutReady() ? 'USD 2.99' : member.planned}</dd>
            {MEMBER_TICKET_CAP && <><dt>{text.cap}</dt><dd>{tickets.rankedTickets}: {MEMBER_TICKET_CAP.ranked} · {tickets.hintTickets}: {MEMBER_TICKET_CAP.hint}</dd></>}
        </dl>
        <p>{member.benefits}</p><p>{member.billingTerms}</p><p>{wallet.expiry} {member.legalRights}</p>
        <p>{text.methods}</p><p>{text.start}</p><p>{text.requirements}</p>
    </article>;
}
