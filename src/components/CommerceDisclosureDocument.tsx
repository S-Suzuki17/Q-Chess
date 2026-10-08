'use client';
import React from 'react';
import { COMMERCE_PRODUCTS, commerceProductText, commerceProductBenefits, commercePaymentTerms } from '../config/commerceCatalog';
import { STRIPE_WEB_CHECKOUT_ENABLED, STRIPE_WEB_MEMBERSHIP_ENABLED } from '../lib/stripeMembership';
import type { Language } from '../locales/dict';
import { commerceText } from '../locales/commerceText';
import { stripeMembershipText } from '../locales/stripeMembershipText';
import { ticketWalletText } from '../locales/ticketWalletText';
import { dailyLoginText } from '../locales/dailyLoginText';
import { COMMERCE_SELLER, MEMBER_TICKET_CAP, webCommerceCheckoutReady } from '../config/webCommerce';

/** Only owner-approved public fields. No payment entry point is included here. */
export function CommerceDisclosureDocument({ lang }: { lang: Language }) {
    const text = commerceText(lang), member = stripeMembershipText(lang), wallet = ticketWalletText(lang), tickets = dailyLoginText(lang);
    const salesOpen = STRIPE_WEB_CHECKOUT_ENABLED && STRIPE_WEB_MEMBERSHIP_ENABLED && webCommerceCheckoutReady();
    const japanese = lang === 'ja';
    const productsTitle = salesOpen ? (japanese ? '商品と価格' : 'Products and prices')
        : (japanese ? '新商品（販売準備中）' : 'New products (not on sale)');
    const legacyTitle = japanese ? '既存の旧会員契約' : 'Existing legacy membership';
    return <article lang={lang} className="space-y-6 leading-relaxed" data-commerce-disclosure data-commerce-sales={salesOpen ? 'open' : 'closed'}>
        <h1 className="text-2xl text-[#D4B872]">{text.title}</h1>
        {!salesOpen && <p role="status">{text.unavailable}</p>}
        <dl className="grid gap-2 sm:grid-cols-[auto_1fr]">
            <dt>{text.seller}</dt><dd>{COMMERCE_SELLER.legalName} · {COMMERCE_SELLER.businessName}</dd>
            <dt>{text.address}</dt><dd>{COMMERCE_SELLER.address}</dd>
            <dt>{text.phone}</dt><dd><a className="underline" href={`tel:${COMMERCE_SELLER.telephoneUri}`}>{COMMERCE_SELLER.telephone}</a></dd>
            <dt>{text.support}</dt><dd><a className="break-all underline" href={`mailto:${COMMERCE_SELLER.email}`}>{COMMERCE_SELLER.email}</a></dd>
        </dl>
        <section aria-label={productsTitle} data-commerce-products>
            <h2>{productsTitle}</h2>
            <ul className="space-y-3">{COMMERCE_PRODUCTS.map(product => <li key={product.sku} data-commerce-sku={product.sku}>
                <p>{commerceProductText(product, japanese)}</p>
                <p>{commerceProductBenefits(product, japanese)}</p>
            </li>)}</ul>
            <p>Standard / Plus: {commercePaymentTerms(COMMERCE_PRODUCTS[0], japanese)}</p>
            <p>{japanese ? 'ヒント券の1回購入: ' : 'One-time hint packs: '}{commercePaymentTerms(COMMERCE_PRODUCTS[2], japanese)}</p>
        </section>
        <section aria-label={legacyTitle} data-legacy-commerce-terms>
            <h2>{legacyTitle}</h2>
            <p>{japanese ? 'USD 2.99/月' : 'USD 2.99/month'}</p>
            <p>{member.benefits}</p>
            {MEMBER_TICKET_CAP && <p>{text.cap}: {tickets.rankedTickets} {MEMBER_TICKET_CAP.ranked} · {tickets.hintTickets} {MEMBER_TICKET_CAP.hint}</p>}
            <p>{member.billingTerms}</p><p>{wallet.expiry} {member.legalRights}</p>
            <p>{text.methods}</p>
        </section>
        <p>{text.start}</p><p>{text.requirements}</p>
    </article>;
}
