import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { ReactElement, ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { User } from '../types/game';
import type { Language } from '../locales/dict';

// Stable hook slots preserve refs, effect dependencies and cleanup across identity changes.
const harness = vi.hoisted(() => ({
    slots: [] as unknown[], cursor: 0, dirty: false, effects: [] as Array<() => void>,
    policyDate: '2026-10-08' as string | null, now: Date.parse('2026-10-11T12:00:00Z'),
}));
vi.mock('react', async original => {
    const react = await original<typeof import('react')>();
    const useState = <T,>(initial: T | (() => T)) => {
        const index = harness.cursor++;
        if (!(index in harness.slots)) harness.slots[index] = typeof initial === 'function' ? (initial as () => T)() : initial;
        return [harness.slots[index] as T, (next: T | ((previous: T) => T)) => {
            const value = typeof next === 'function' ? (next as (previous: T) => T)(harness.slots[index] as T) : next;
            if (!Object.is(value, harness.slots[index])) { harness.slots[index] = value; harness.dirty = true; }
        }] as const;
    };
    const useRef = <T,>(initial: T) => {
        const index = harness.cursor++;
        if (!(index in harness.slots)) harness.slots[index] = { current: initial };
        return harness.slots[index] as { current: T };
    };
    const useEffect = (effect: () => void | (() => void), deps?: readonly unknown[]) => {
        const index = harness.cursor++;
        type Slot = { deps?: readonly unknown[]; cleanup?: () => void };
        const previous = harness.slots[index] as Slot | undefined;
        if (previous && deps && previous.deps?.length === deps.length && deps.every((value, i) => Object.is(value, previous.deps![i]))) return;
        const next: Slot = { deps }; harness.slots[index] = next;
        harness.effects.push(() => { previous?.cleanup?.(); const cleanup = effect(); if (cleanup) next.cleanup = cleanup; });
    };
    return { ...react, useState, useRef, useEffect, useLayoutEffect: useEffect, default: { ...react, useState, useRef, useEffect, useLayoutEffect: useEffect } };
});
vi.mock('../lib/accountProfile', () => ({ requestAccountProfile: vi.fn() }));
vi.mock('../config/currentTerms', async original => {
    const actual = await original<typeof import('../config/currentTerms')>();
    return { ...actual, get CURRENT_TERMS_EFFECTIVE_DATE() { return harness.policyDate; },
        currentTermsEffective: () => actual.currentTermsEffective(harness.policyDate, harness.now) };
});
vi.mock('./TermsDocument', async () => {
    const react = await import('react');
    return { TermsDocument: (props: { initialLanguage?: string; legacy?: boolean }) =>
        react.createElement('article', { 'data-fixture-current-document': !props.legacy, 'data-fixture-language': props.initialLanguage }, 'Current terms fixture') };
});

import { OnlineMatchTermsGate } from './OnlineMatchTermsGate';
import { TermsDocument } from './TermsDocument';
import { requestAccountProfile } from '../lib/accountProfile';
import { CURRENT_TERMS_ACCEPTED_EVENT } from '../lib/currentAccountTerms';
import { CURRENT_TERMS_VERSION } from '../config/currentTerms';
import { LANGUAGES } from '../locales/dict';
import { onlineMatchTermsText } from '../locales/onlineMatchTermsText';

type Props = Parameters<typeof OnlineMatchTermsGate>[0];
type Control = ReactElement<{ children?: ReactNode; onClick?: () => void;
    onChange?: (event: { target: { checked: boolean } }) => void; disabled?: boolean; checked?: boolean; [key: string]: unknown }>;
const alice: User = { id: 'Alice', name: 'Alice', type: 'registered' };
const bob: User = { id: 'Bob', name: 'Bob', type: 'registered' };
const read = vi.mocked(requestAccountProfile);
let props: Props;
let tree: ReturnType<typeof OnlineMatchTermsGate>;
const response = (accepted = false, userId = 'Alice') => ({
    userId, currentVersion: CURRENT_TERMS_VERSION, effectiveDate: harness.policyDate, effective: true,
    consent: accepted ? { version: CURRENT_TERMS_VERSION, acceptedAt: '2026-10-11T00:00:00Z' } : null,
});
function deferred<T>() {
    let resolve!: (value: T) => void; let reject!: (reason: unknown) => void;
    const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
    return { promise, resolve, reject };
}
const elements = (node: ReactNode): Control[] => {
    if (Array.isArray(node)) return node.flatMap(elements);
    if (!node || typeof node !== 'object' || !('props' in node)) return [];
    const element = node as Control;
    return [element, ...elements(element.props.children)];
};
function draw(next = props) {
    props = next; harness.cursor = 0; harness.dirty = false; tree = OnlineMatchTermsGate(props);
    harness.effects.splice(0).forEach(effect => effect());
    return tree;
}
async function flush() {
    for (let i = 0; i < 16; i++) { await Promise.resolve(); if (harness.dirty) draw(); }
}
function control(attribute: string) {
    const result = elements(tree).find(element => attribute in element.props);
    if (!result) throw new Error(`Missing fixture control: ${attribute}`);
    return result;
}
const click = (attribute: string) => control(attribute).props.onClick!();
async function check() { control('data-online-match-terms-checkbox').props.onChange!({ target: { checked: true } }); await flush(); }
const markup = () => tree ? renderToStaticMarkup(tree) : '';
function unmount() {
    harness.slots.forEach(slot => (slot as { cleanup?: () => void } | undefined)?.cleanup?.());
}
beforeEach(() => {
    harness.slots = []; harness.cursor = 0; harness.dirty = false; harness.effects = [];
    harness.policyDate = '2026-10-08'; harness.now = Date.parse('2026-10-11T12:00:00Z');
    read.mockReset().mockResolvedValue(response());
    props = { user: alice, lang: 'ja', onReady: vi.fn(), onCancel: vi.fn() };
    tree = null; vi.stubGlobal('window', new EventTarget());
});
afterEach(() => { unmount(); vi.unstubAllGlobals(); });

it('waits for HTTP confirmation and ignores an acceptance event while the request is pending', async () => {
    const pending = deferred<Record<string, unknown>>(); read.mockReturnValue(pending.promise);
    draw(); await flush();
    expect(control('data-online-match-terms').props['data-online-match-terms-state']).toBe('loading');
    expect(elements(tree).some(element => 'data-online-match-terms-checkbox' in element.props)).toBe(false);
    window.dispatchEvent(new CustomEvent(CURRENT_TERMS_ACCEPTED_EVENT, { detail: { userId: 'Alice' } }));
    expect(props.onReady).not.toHaveBeenCalled();
    pending.resolve(response(true)); await flush();
    expect(props.onReady).toHaveBeenCalledOnce(); expect(tree).toBeNull();
    draw({ ...props, onReady: vi.fn() }); await flush();
    expect(read).toHaveBeenCalledOnce(); expect(props.onReady).not.toHaveBeenCalled();
});

it('requires personal unchecked consent and one explicit save of the current document before continuing', async () => {
    const save = deferred<Record<string, unknown>>();
    read.mockResolvedValueOnce(response()).mockReturnValueOnce(save.promise);
    draw(); await flush();
    const document = elements(tree).find(element => element.type === TermsDocument)!;
    expect(document.props.initialLanguage).toBe('ja'); expect(document.props.legacy).toBeUndefined();
    expect(elements(tree).find(element => element.type === 'details')?.props.open).toBeUndefined();
    expect(control('data-online-match-terms-checkbox').props.checked).toBe(false);
    expect(control('data-online-match-terms-accept').props.disabled).toBe(true);
    expect(markup()).toContain('/privacy/'); expect(markup()).not.toContain('role="dialog"');
    click('data-online-match-terms-accept'); await flush(); expect(read).toHaveBeenCalledOnce();
    await check();
    const accept = control('data-online-match-terms-accept').props.onClick!;
    accept(); accept(); // Same render: synchronous double-click must issue one POST.
    expect(read).toHaveBeenCalledTimes(2);
    expect(read).toHaveBeenLastCalledWith('/account/current-terms', 'Alice',
        { version: CURRENT_TERMS_VERSION, accepted: true }, expect.any(AbortSignal));
    await flush();
    expect(control('data-online-match-terms-accept').props.disabled).toBe(true);
    expect(control('data-online-match-terms-checkbox').props.disabled).toBe(true);
    expect(control('data-online-match-terms-cancel').props.disabled).not.toBe(true);
    expect(props.onReady).not.toHaveBeenCalled();
    save.resolve(response(true)); await flush(); expect(props.onReady).toHaveBeenCalledOnce();
});

it('shows a safe error after failed acceptance and retries only the confirmation GET with fresh unchecked consent', async () => {
    read.mockResolvedValueOnce(response()).mockRejectedValueOnce(new Error('private-token-payment-secret'))
        .mockResolvedValueOnce(response());
    draw(); await flush(); await check();
    const oldAccept = control('data-online-match-terms-accept').props.onClick!;
    oldAccept(); await flush();
    expect(props.onReady).not.toHaveBeenCalled(); expect(markup()).not.toContain('private-token-payment-secret');
    expect(markup()).toContain(onlineMatchTermsText('ja').error);
    click('data-online-match-terms-retry'); await flush();
    expect(read).toHaveBeenCalledTimes(3);
    expect(read.mock.calls.map(call => call[2])).toEqual([undefined, { version: CURRENT_TERMS_VERSION, accepted: true }, undefined]);
    expect(control('data-online-match-terms-checkbox').props.checked).toBe(false);
    expect(control('data-online-match-terms-accept').props.disabled).toBe(true);
    oldAccept(); await flush(); // A retry creates a new request, so old checked handlers have no authority.
    expect(read).toHaveBeenCalledTimes(3); expect(props.onReady).not.toHaveBeenCalled();
});

it('cancels pending verification once, aborts HTTP and ignores a later accepted response', async () => {
    const pending = deferred<Record<string, unknown>>(); read.mockReturnValue(pending.promise);
    draw(); await flush();
    const cancel = control('data-online-match-terms-cancel').props.onClick!;
    cancel(); cancel();
    expect(read.mock.calls[0][3]?.aborted).toBe(true); expect(props.onCancel).toHaveBeenCalledOnce();
    pending.resolve(response(true)); await flush(); expect(props.onReady).not.toHaveBeenCalled(); expect(tree).toBeNull();
    draw(); await flush(); expect(read).toHaveBeenCalledOnce();
});

it('cancels pending acceptance without granting queue readiness or emitting accepted authority', async () => {
    const save = deferred<Record<string, unknown>>();
    read.mockResolvedValueOnce(response()).mockReturnValueOnce(save.promise);
    const event = vi.fn(); window.addEventListener(CURRENT_TERMS_ACCEPTED_EVENT, event);
    draw(); await flush(); await check(); click('data-online-match-terms-accept'); await flush();
    click('data-online-match-terms-cancel');
    expect(read.mock.calls[1][3]?.aborted).toBe(true);
    save.resolve(response(true)); await flush();
    expect(props.onReady).not.toHaveBeenCalled(); expect(event).not.toHaveBeenCalled();
    expect(props.onCancel).toHaveBeenCalledOnce();
});

it.each(['GET', 'POST'] as const)('aborts %s on unmount and ignores late server confirmation', async phase => {
    const pending = deferred<Record<string, unknown>>();
    if (phase === 'GET') read.mockReturnValue(pending.promise);
    else read.mockResolvedValueOnce(response()).mockReturnValueOnce(pending.promise);
    draw(); await flush();
    if (phase === 'POST') { await check(); click('data-online-match-terms-accept'); }
    const signal = read.mock.calls.at(-1)![3]!;
    unmount(); expect(signal.aborted).toBe(true);
    pending.resolve(response(true)); await flush(); expect(props.onReady).not.toHaveBeenCalled();
});

it('aborts old identity verification before a new identity can become ready', async () => {
    const old = deferred<Record<string, unknown>>(); const current = deferred<Record<string, unknown>>();
    read.mockReturnValueOnce(old.promise).mockReturnValueOnce(current.promise);
    const aliceReady = props.onReady; draw(); await flush();
    const bobReady = vi.fn(); draw({ ...props, user: bob, onReady: bobReady }); await flush();
    expect(read.mock.calls[0][3]?.aborted).toBe(true);
    old.resolve(response(true)); await flush(); expect(aliceReady).not.toHaveBeenCalled(); expect(bobReady).not.toHaveBeenCalled();
    current.resolve(response(true, 'Bob')); await flush(); expect(bobReady).toHaveBeenCalledOnce();
    expect(read.mock.calls.map(call => call[1])).toEqual(['Alice', 'Bob']);
});

it('rejects old identity accept and cancel handlers instead of acting on the new request', async () => {
    draw(); await flush(); await check();
    const oldAccept = control('data-online-match-terms-accept').props.onClick!;
    const oldCancel = control('data-online-match-terms-cancel').props.onClick!;
    draw({ ...props, user: bob }); await flush();
    oldAccept(); oldCancel(); await flush();
    expect(read.mock.calls.map(call => call[1])).toEqual(['Alice', 'Bob']);
    expect(props.onCancel).not.toHaveBeenCalled(); expect(props.onReady).not.toHaveBeenCalled();
    expect(control('data-online-match-terms-checkbox').props.checked).toBe(false);
});

it('rejects an old error retry after identity changes', async () => {
    read.mockRejectedValueOnce(new Error('unavailable')).mockResolvedValueOnce(response(false, 'Bob'));
    draw(); await flush(); const oldRetry = control('data-online-match-terms-retry').props.onClick!;
    draw({ ...props, user: bob }); await flush(); oldRetry(); await flush();
    expect(read).toHaveBeenCalledTimes(2); expect(read.mock.calls[1][3]?.aborted).toBe(false);
    expect(control('data-online-match-terms').props['data-online-match-terms-state']).toBe('needed');
});

it('keeps the new identity save locked when an older identity save resolves', async () => {
    const old = deferred<Record<string, unknown>>(); const current = deferred<Record<string, unknown>>();
    read.mockResolvedValueOnce(response()).mockReturnValueOnce(old.promise)
        .mockResolvedValueOnce(response(false, 'Bob')).mockReturnValueOnce(current.promise);
    const aliceReady = props.onReady; draw(); await flush(); await check(); click('data-online-match-terms-accept'); await flush();
    const bobReady = vi.fn(); draw({ ...props, user: bob, onReady: bobReady }); await flush(); await check();
    const newAccept = control('data-online-match-terms-accept').props.onClick!; newAccept(); await flush();
    old.resolve(response(true)); await flush();
    expect(aliceReady).not.toHaveBeenCalled(); expect(bobReady).not.toHaveBeenCalled();
    expect(control('data-online-match-terms-accept').props.disabled).toBe(true);
    newAccept(); expect(read).toHaveBeenCalledTimes(4);
    current.resolve(response(true, 'Bob')); await flush(); expect(bobReady).toHaveBeenCalledOnce();
});

it('offers no guest agreement, HTTP request or readiness', async () => {
    draw({ ...props, user: { id: 'guest_local', name: 'Guest', type: 'guest' } }); await flush();
    expect(read).not.toHaveBeenCalled(); expect(props.onReady).not.toHaveBeenCalled();
    expect(elements(tree).some(element => 'data-online-match-terms-checkbox' in element.props)).toBe(false);
    expect(markup()).toContain(onlineMatchTermsText('ja').guest);
    click('data-online-match-terms-cancel'); expect(props.onCancel).toHaveBeenCalledOnce();
});

it.each(['old-version', 'wrong-date', 'invalid-consent-date', 'future-effective', 'server-not-effective'] as const)(
    'fails closed for %s without exposing consent controls or starting a queue', async problem => {
        if (problem === 'future-effective') harness.policyDate = '2099-01-01';
        const value = response(true);
        if (problem === 'old-version') value.currentVersion = '2026-09-25.1';
        if (problem === 'wrong-date') value.effectiveDate = '2026-10-07';
        if (problem === 'invalid-consent-date') value.consent!.acceptedAt = 'not-a-date';
        if (problem === 'server-not-effective') value.effective = false;
        read.mockResolvedValue(value); draw(); await flush();
        expect(control('data-online-match-terms').props['data-online-match-terms-state']).toBe('error');
        expect(props.onReady).not.toHaveBeenCalled();
        expect(elements(tree).some(element => 'data-online-match-terms-checkbox' in element.props)).toBe(false);
        expect(read.mock.calls.every(call => call[2] === undefined)).toBe(true);
    },
);

it.each(['no-saved-consent', 'old-version', 'invalid-consent-date'] as const)(
    'does not become ready after a save returning %s', async problem => {
        const saved = response(problem !== 'no-saved-consent');
        if (problem === 'old-version') saved.currentVersion = '2026-09-25.1';
        if (problem === 'invalid-consent-date') saved.consent!.acceptedAt = 'not-a-date';
        read.mockResolvedValueOnce(response()).mockResolvedValueOnce(saved);
        const event = vi.fn(); window.addEventListener(CURRENT_TERMS_ACCEPTED_EVENT, event);
        draw(); await flush(); await check(); click('data-online-match-terms-accept'); await flush();
        expect(props.onReady).not.toHaveBeenCalled(); expect(event).not.toHaveBeenCalled();
        expect(control('data-online-match-terms').props['data-online-match-terms-state']).toBe('error');
    },
);

it('provides all twelve languages without a ticket-claim acceptance label', async () => {
    expect(LANGUAGES).toHaveLength(12);
    draw(); await flush();
    for (const language of LANGUAGES) {
        const lang = language.code as Language;
        const copy = onlineMatchTermsText(lang);
        expect(Object.values(copy).every(value => typeof value === 'string' && value.trim().length > 0)).toBe(true);
        expect(copy.accept).not.toMatch(/券|ticket|チケット/i);
        draw({ ...props, lang }); await flush();
        expect(markup()).toContain(copy.title);
        expect(elements(tree).find(element => element.type === TermsDocument)?.props.initialLanguage).toBe(lang);
    }
    expect(read).toHaveBeenCalledOnce();
});
