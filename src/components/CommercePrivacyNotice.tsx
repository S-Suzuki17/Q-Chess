'use client';
import React from 'react';
import type { Language } from '../locales/dict';
import { commerceText } from '../locales/commerceText';
import { MEMBER_TICKET_USAGE_ENABLED, STRIPE_WEB_MEMBERSHIP_ENABLED, STRIPE_WEB_PORTAL_ENABLED } from '../lib/stripeMembership';

export function CommercePrivacyNotice({ lang }: { lang: Language }) {
    if (!MEMBER_TICKET_USAGE_ENABLED && !STRIPE_WEB_MEMBERSHIP_ENABLED && !STRIPE_WEB_PORTAL_ENABLED) return null;
    const text = commerceText(lang);
    return <section data-commerce-privacy><h2 className="mb-2 text-xl font-bold text-white">{text.privacyTitle}</h2><p>{text.privacy}</p></section>;
}
