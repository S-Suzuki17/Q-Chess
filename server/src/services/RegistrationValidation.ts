import { permittedRegistrationName } from './AccountNamePolicy';

// Shared by the browser and registration API. Keep this module free of Node APIs,
// stores and authentication imports; it must never return or transform a password.
export type RegistrationIssue =
    | { field: 'email'; reason: 'required' | 'format' }
    | { field: 'username'; reason: 'required' | 'format' | 'length' | 'unavailable' }
    | { field: 'password'; reason: 'required' | 'short' | 'long' | 'control' | 'weak' | 'variety' };
export type RegistrationField = RegistrationIssue['field'];
const allowedReasons: Record<RegistrationField, readonly string[]> = {
    email: ['required', 'format'],
    username: ['required', 'format', 'length', 'unavailable'],
    password: ['required', 'short', 'long', 'control', 'weak', 'variety'],
};

/** Copy only allowlisted codes. Never expose an upstream message or input value. */
export function readRegistrationIssue(value: unknown): RegistrationIssue | undefined {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return;
    const { field, reason } = value as Record<string, unknown>;
    if (typeof field !== 'string' || !Object.prototype.hasOwnProperty.call(allowedReasons, field)
        || typeof reason !== 'string' || !allowedReasons[field as RegistrationField].includes(reason)) return;
    return { field, reason } as RegistrationIssue;
}

export function registrationUsernameIssue(value: unknown): RegistrationIssue | undefined {
    if (typeof value !== 'string' || !value.trim()) return { field: 'username', reason: 'required' };
    if (!/^[A-Za-z0-9]+$/.test(value)) return { field: 'username', reason: 'format' };
    if (value.length < 3 || value.length > 15) return { field: 'username', reason: 'length' };
    if (!permittedRegistrationName(value)) return { field: 'username', reason: 'unavailable' };
}

export function registrationPasswordIssue(value: unknown): RegistrationIssue | undefined {
    if (typeof value !== 'string' || !value) return { field: 'password', reason: 'required' };
    if ([...value].length < 12) return { field: 'password', reason: 'short' };
    if (new TextEncoder().encode(value).length > 72) return { field: 'password', reason: 'long' };
    if (/[\p{Cc}]/u.test(value)) return { field: 'password', reason: 'control' };
    if (/^(?:password|qwerty|123456|abcdef|letmein)[\d!@#$]*$/i.test(value)) return { field: 'password', reason: 'weak' };
    if (new Set(value).size < 4) return { field: 'password', reason: 'variety' };
}

export function registrationEmailIssue(value: unknown): RegistrationIssue | undefined {
    if (typeof value !== 'string' || !value.trim()) return { field: 'email', reason: 'required' };
    // Preserve the API's raw length check and its existing email acceptance set.
    if (value.length > 254 || !/^[^\s@<>\x00-\x1f]+@[^\s@<>\x00-\x1f]+\.[^\s@<>\x00-\x1f]+$/.test(value.trim().toLowerCase())) {
        return { field: 'email', reason: 'format' };
    }
}

export function registrationEmail(value: unknown): string | null {
    return registrationEmailIssue(value) ? null : (value as string).trim().toLowerCase();
}

export function registrationIssues(username: unknown, password: unknown, email?: unknown, withEmail = true): RegistrationIssue[] {
    return [withEmail ? registrationEmailIssue(email) : undefined,
        registrationUsernameIssue(username), registrationPasswordIssue(password)]
        .filter((issue): issue is RegistrationIssue => issue !== undefined);
}

/** Preserve the form's outer ID/email trim and native single-email constraint.
 * Password whitespace is tested for the existing required-field rule only;
 * the original password is always validated and sent without modification.
 */
export function registrationFormIssues(username: string, password: string, email: string, emailTypeMismatch = false): RegistrationIssue[] {
    const issues = registrationIssues(username.trim(), password, email.trim().toLowerCase());
    if (emailTypeMismatch && !issues.some(issue => issue.field === 'email')) issues.unshift({ field: 'email', reason: 'format' });
    if (!password.trim()) return [...issues.filter(issue => issue.field !== 'password'), { field: 'password', reason: 'required' }];
    return issues;
}
