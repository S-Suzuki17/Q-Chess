import { CURRENT_TERMS_VERSION, CURRENT_TERMS_EFFECTIVE_DATE, CURRENT_TERMS_SECTIONS, CURRENT_TERMS_ENGLISH } from './currentTerms';
/** Current published terms shape; retained export name for review tooling. */
export const SALES_TERMS_DRAFT = {
    version: CURRENT_TERMS_VERSION, effectiveDate: CURRENT_TERMS_EFFECTIVE_DATE,
    ja: CURRENT_TERMS_SECTIONS, en: CURRENT_TERMS_ENGLISH,
} as const;
