import { describe, expect, it, vi } from 'vitest';
import { listenForNativeLogin, nativeLoginCode } from './nativeAuthLinks';

const settle = async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); };
function fixture(launch?: string) {
    let receiver: (data: { url: string }) => void = () => {};
    const remove = vi.fn(async () => {});
    const app = {
        addListener: vi.fn(async (_event: 'appUrlOpen', callback: typeof receiver) => { receiver = callback; return { remove }; }),
        getLaunchUrl: vi.fn(async () => launch ? { url: launch } : undefined),
    };
    const exchangeCode = vi.fn(async (_code: string): Promise<{ error: unknown }> => ({ error: null }));
    const closeBrowser = vi.fn(async () => {}), onError = vi.fn();
    const stop = listenForNativeLogin({ app, exchangeCode, closeBrowser, onError });
    return { app, exchangeCode, closeBrowser, onError, remove, stop, send: (url: string) => receiver({ url }) };
}
describe('Android authentication return path', () => {
    it('accepts only exact registered callback addresses with an auth code', () => {
        expect(nativeLoginCode('qgambit://login-callback?code=sample')).toBe('sample');
        for (const url of ['https://evil.test/?next=qgambit://login-callback&code=x', 'qgambit://login-callback.evil/?code=x', 'qgambit://login-callback/other?code=x', 'qgambit://user@login-callback?code=x', 'qgambit://login-callback#access_token=x&refresh_token=y', 'invalid']) {
            expect(nativeLoginCode(url)).toBeNull();
        }
    });
    it('handles cold launch and duplicate resume notifications exactly once', async () => {
        const f = fixture('qgambit://login-callback?code=sample');
        f.send('qgambit://login-callback?code=sample'); await settle();
        expect(f.exchangeCode).toHaveBeenCalledExactlyOnceWith('sample');
        expect(f.closeBrowser).toHaveBeenCalledTimes(1);expect(f.onError).not.toHaveBeenCalled();
        f.stop();await settle();expect(f.remove).toHaveBeenCalledTimes(1);
    });
    it('cleans up a listener that finishes registering after unmount', async () => {
        const f = fixture('qgambit://login-callback?code=sample');f.stop();await settle();
        f.send('qgambit://login-callback?code=other');await settle();
        expect(f.remove).toHaveBeenCalledTimes(1);expect(f.exchangeCode).not.toHaveBeenCalled();expect(f.app.getLaunchUrl).not.toHaveBeenCalled();
    });
    it('reports rejected sessions and provider errors without leaking their contents', async () => {
        const f = fixture();await settle();
        f.exchangeCode.mockResolvedValue({ error: new Error('private-provider-detail') });
        f.send('qgambit://login-callback?code=sample');await settle();
        f.send('qgambit://login-callback?error=denied&error_description=private');await settle();
        expect(f.onError).toHaveBeenCalledTimes(2);expect(f.onError.mock.calls.every(args => args.length === 0)).toBe(true);
        f.stop();
    });
});
