'use client';
import React from 'react';
import type { Language } from '../locales/dict';
import { commerceText } from '../locales/commerceText';
import { MEMBER_TICKET_USAGE_ENABLED, STRIPE_WEB_MEMBERSHIP_ENABLED, STRIPE_WEB_PORTAL_ENABLED } from '../lib/stripeMembership';

export function CommercePrivacyNotice({ lang }: { lang: Language }) {
    if (!MEMBER_TICKET_USAGE_ENABLED && !STRIPE_WEB_MEMBERSHIP_ENABLED && !STRIPE_WEB_PORTAL_ENABLED) return null;
    const text = commerceText(lang);
    return <section data-commerce-privacy><h2 className="mb-2 text-xl font-bold text-white">{text.privacyTitle}</h2><p>{text.privacy}</p><p className="mt-3" lang={lang==='ja'?'ja':'en'}>{lang==='ja'?'削除後の遅延通知でアカウントや特典が再作成されないよう、必要最小限の決済処理識別子を分離して保持します。法令・決済事業者側で必要な保存を即時削除できるとは約束しません。':'The minimum payment-processing identifiers needed to prevent delayed notifications from recreating a deleted account or its benefits are retained separately. We do not promise immediate deletion of records that the law or payment provider requires to be retained.'}</p></section>;
}
