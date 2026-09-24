type Listener = { remove(): Promise<void> };
type AppLinks = {
    addListener(event: 'appUrlOpen', callback: (data: { url: string }) => void): Promise<Listener>;
    getLaunchUrl(): Promise<{ url: string } | undefined>;
};

/** Accept only our exact callback; never log a callback URL or authentication code. */
export function nativeLoginCode(value: string): string | null {
    try {
        const url = new URL(value);
        if (url.protocol !== 'qgambit:' || url.hostname !== 'login-callback' ||
            url.username || url.password || url.port || !['', '/'].includes(url.pathname)) return null;
        if (url.searchParams.has('error')) throw new Error('AUTH_CALLBACK_FAILED');
        const code = url.searchParams.get('code');
        return code && code.length <= 8192 ? code : null;
    } catch (error) {
        if (error instanceof Error && error.message === 'AUTH_CALLBACK_FAILED') throw error;
        return null;
    }
}

export function listenForNativeLogin({ app, exchangeCode, closeBrowser, onError }: {
    app: AppLinks;
    exchangeCode(code: string): Promise<{ error: unknown }>;
    closeBrowser(): Promise<unknown>;
    onError(): void;
}): () => void {
    let disposed = false;
    const seen = new Set<string>();
    const receive = async ({ url }: { url: string }) => {
        if (disposed) return;
        try {
            const code = nativeLoginCode(url);
            if (!code || seen.has(code)) return;
            if (seen.size >= 8) seen.delete(seen.values().next().value!);
            seen.add(code);
            // PKCE verifies the callback against this app's stored login verifier.
            const { error } = await exchangeCode(code);
            if (disposed) return;
            await closeBrowser().catch(() => {});
            if (error) onError();
        } catch { if (!disposed) onError(); }
    };
    const handle = app.addListener('appUrlOpen', data => { void receive(data); });
    void handle.then(async () => {
        if (disposed) return;
        const launch = await app.getLaunchUrl();
        if (launch) await receive(launch);
    }).catch(() => { if (!disposed) onError(); });
    return () => {
        disposed = true;
        seen.clear();
        void handle.then(listener => listener.remove()).catch(() => {});
    };
}
