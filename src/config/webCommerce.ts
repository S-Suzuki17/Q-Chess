import { ANDROID_BUILD } from './appPlatform';
import { PUBLIC_SUPPORT_EMAIL } from './publicContact';
import { CURRENT_TERMS_VERSION, CURRENT_TERMS_EFFECTIVE_DATE, currentTermsEffective } from './currentTerms';

export const SALES_TERMS_DRAFT_VERSION = CURRENT_TERMS_VERSION;
/** Publication of these purpose-limited fields was approved by the owner on 2026-10-03. */
export const COMMERCE_SELLER = {
    legalName: '鈴木 壮太',
    businessName: 'Q-Gambit',
    address: '〒362-0812 埼玉県北足立郡伊奈町内宿台2-184-1',
    telephone: '070-7660-1602',
    telephoneUri: '+817076601602',
    email: PUBLIC_SUPPORT_EMAIL,
} as const;

/** Existing legacy membership caps; separate from the current free-ticket policy. */
export const MEMBER_TICKET_CAP: Readonly<{ ranked: number; hint: number }> = { ranked: 60, hint: 60 };
/** Reviewed new-SKU release; public sales still require the independent build flag and current terms. */
export const NEW_SKU_RELEASE_VERIFIED = true;
export const WEB_COMMERCE_SALES_RELEASE_READY = !ANDROID_BUILD && process.env.NEXT_PUBLIC_QG_WEB_COMMERCE_SALES_RELEASE_READY === 'true';

export function webCommerceCheckoutReady(
    releaseReady = WEB_COMMERCE_SALES_RELEASE_READY,
    cap: Readonly<{ ranked: number; hint: number }> | null = MEMBER_TICKET_CAP,
    termsVersion = CURRENT_TERMS_VERSION,
    effectiveDate: string | null = CURRENT_TERMS_EFFECTIVE_DATE,
    skuReleaseVerified: boolean = NEW_SKU_RELEASE_VERIFIED,
): boolean {
    return !ANDROID_BUILD && skuReleaseVerified && releaseReady && currentTermsEffective(effectiveDate) && termsVersion === CURRENT_TERMS_VERSION && !!cap &&
        Number.isSafeInteger(cap.ranked) && cap.ranked > 0 &&
        Number.isSafeInteger(cap.hint) && cap.hint > 0;
}
