/** Parsers for canonical Publisher JSON; these functions do not establish ownership. */
export class PlayCommerceError extends Error {
    constructor(public code:'INVALID_PURCHASE'|'PENDING'|'ACCOUNT_MISMATCH'|'MODE_MISMATCH'|'UNAVAILABLE'|'BUSY'|'RETIRED'|'TERMS_REQUIRED'|'FEATURE_DISABLED') { super(code); }
}
export const invalidPlayPurchase = (): never => { throw new PlayCommerceError('INVALID_PURCHASE'); };
export const playObject = (value:unknown): value is Record<string,unknown> =>
    value !== null && typeof value === 'object' && !Array.isArray(value)
    && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);
/** ProtoJSON null has the same presence semantics as an absent field. */
export const playPresent = (value:unknown): boolean => value !== undefined && value !== null;
export const playEmptyMessage = (value:unknown): boolean => playObject(value) && Object.keys(value).length === 0;
export const playBinding = (value:unknown): string =>
    typeof value === 'string' && /^[a-f0-9]{64}$/.test(value) ? value : invalidPlayPurchase();
export const playToken = (value:unknown): string =>
    typeof value === 'string' && value.length >= 16 && value.length <= 4096 && !/[\s\u0000-\u001f\u007f]/u.test(value) ? value : invalidPlayPurchase();
export const playOrderId = (value:unknown): string =>
    typeof value === 'string' && /^GPA\.\d{4}-\d{4}-\d{4}-\d{5}(?:\.\.\d{1,20})?$/.test(value) ? value : invalidPlayPurchase();

export type PlayTimestamp = Readonly<{ iso:string; epochNanoseconds:bigint }>;
/** Google Timestamp uses the proleptic Gregorian calendar and smeared leap seconds. */
export function parsePlayTimestamp(value:unknown): PlayTimestamp {
    if (typeof value !== 'string') return invalidPlayPurchase();
    const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,9}))?(Z|([+-])(\d{2}):(\d{2}))$/.exec(value);
    if (!match) return invalidPlayPurchase();
    const [year,month,day,hour,minute,second] = match.slice(1,7).map(Number);
    const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
    const days = [31,leap ? 29 : 28,31,30,31,30,31,31,30,31,30,31];
    if (year < 1 || month < 1 || month > 12 || day < 1 || day > days[month-1]
        || hour > 23 || minute > 59 || second > 59) return invalidPlayPurchase();
    const offsetHour = Number(match[10] ?? 0), offsetMinute = Number(match[11] ?? 0);
    // -00:00 denotes an unknown offset in RFC3339, not a known Google instant.
    if (offsetHour > 23 || offsetMinute > 59 || match[8] === '-00:00') return invalidPlayPurchase();
    const local = new Date(0);
    local.setUTCFullYear(year,month-1,day);
    local.setUTCHours(hour,minute,second,0);
    const offset = (offsetHour*60+offsetMinute) * (match[9] === '-' ? -1 : 1);
    const utc = new Date(local.getTime()-offset*60_000);
    if (utc.getUTCFullYear() < 1 || utc.getUTCFullYear() > 9999) return invalidPlayPurchase();
    const fraction = (match[7] ?? '').padEnd(9,'0');
    return Object.freeze({iso:utc.toISOString().slice(0,19)+'.'+fraction+'Z',epochNanoseconds:BigInt(utc.getTime())*1_000_000n+BigInt(fraction)});
}
export function playNowNanoseconds(now:number): bigint {
    if (!Number.isSafeInteger(now) || Math.abs(now) > 8_640_000_000_000_000) return invalidPlayPurchase();
    return BigInt(now)*1_000_000n;
}

export type PlayMoney = Readonly<{ currencyCode:string; amountNanos:bigint }>;
/** No floating point conversion, currency conversion, or Stripe USD price comparison. */
export function parsePlayMoney(value:unknown): PlayMoney {
    if (!playObject(value) || typeof value.currencyCode !== 'string' || !/^[A-Z]{3}$/.test(value.currencyCode)) return invalidPlayPurchase();
    const units = value.units ?? '0', nanos = value.nanos ?? 0;
    if (typeof units !== 'string' || !/^-?(?:0|[1-9]\d*)$/.test(units)
        || typeof nanos !== 'number' || !Number.isInteger(nanos) || Math.abs(nanos) > 999_999_999) return invalidPlayPurchase();
    const whole = BigInt(units);
    if (whole < -9_223_372_036_854_775_808n || whole > 9_223_372_036_854_775_807n
        || whole > 0n && nanos < 0 || whole < 0n && nanos > 0) return invalidPlayPurchase();
    return Object.freeze({currencyCode:value.currencyCode,amountNanos:whole*1_000_000_000n+BigInt(nanos)});
}
