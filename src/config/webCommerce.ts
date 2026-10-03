import { TERMS_VERSION } from './terms';

export const SALES_TERMS_DRAFT_VERSION = '2026-10-03.1';
/** Publication of these purpose-limited fields was approved by the owner on 2026-10-03. */
export const COMMERCE_SELLER = {
    legalName: '鈴木 壮太',
    businessName: 'Q-Gambit',
    address: '〒362-0812 埼玉県北足立郡伊奈町内宿台2-184-1',
    telephone: '070-7660-1602',
    telephoneUri: '+817076601602',
    email: 'qgambit970@gmail.com',
} as const;

/** Owner approved on 2026-10-03; separate from each free pool's cap of 20. */
export const MEMBER_TICKET_CAP: Readonly<{ ranked: number; hint: number }> = { ranked: 60, hint: 60 };
export const WEB_COMMERCE_SALES_RELEASE_READY = false;

export function webCommerceCheckoutReady(
    releaseReady = WEB_COMMERCE_SALES_RELEASE_READY,
    cap: Readonly<{ ranked: number; hint: number }> | null = MEMBER_TICKET_CAP,
    termsVersion = TERMS_VERSION,
): boolean {
    return releaseReady && termsVersion === SALES_TERMS_DRAFT_VERSION && !!cap &&
        Number.isSafeInteger(cap.ranked) && cap.ranked > 0 &&
        Number.isSafeInteger(cap.hint) && cap.hint > 0;
}
