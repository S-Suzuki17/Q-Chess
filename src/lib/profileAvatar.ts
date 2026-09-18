import { supabase } from './supabaseClient';
import { gameServerUrl, readRankedSession } from './rankedSession';
import { circuitIcon, circuitIconFromUrl } from '../config/circuitIcons';

export const MAX_AVATAR_BYTES = 2 * 1024 * 1024;
const PHOTO_TYPES = ['image/png','image/jpeg','image/webp'];
export class AvatarError extends Error {
    constructor(public readonly code: 'AUTH_REQUIRED'|'INVALID_PHOTO'|'TOO_LARGE'|'UNAVAILABLE') { super(code); }
}
export function validateAvatarFile(file: Pick<File,'type'|'size'>) {
    if (!PHOTO_TYPES.includes(file.type) || file.size < 1) throw new AvatarError('INVALID_PHOTO');
    if (file.size > MAX_AVATAR_BYTES) throw new AvatarError('TOO_LARGE');
}
export function isSafeSavedAvatar(url: unknown): url is string {
    if (typeof url !== 'string') return false;
    if (circuitIconFromUrl(url)) return true;
    try {
        const parsed = new URL(url), configured = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co');
        return parsed.origin === configured.origin && !parsed.username && !parsed.password && !parsed.search && !parsed.hash &&
            /^\/storage\/v1\/object\/public\/avatars\/u\/[0-9a-f]{64}\/[0-9a-f-]{36}\.webp$/.test(parsed.pathname);
    } catch { return false; }
}
/** Re-encoding a center crop removes metadata before any upload. */
export async function prepareAvatarPhoto(file: File, signal: AbortSignal): Promise<Blob> {
    validateAvatarFile(file); signal.throwIfAborted();
    let bitmap: ImageBitmap;
    try { bitmap = await createImageBitmap(file); } catch { throw new AvatarError('INVALID_PHOTO'); }
    try {
        signal.throwIfAborted();
        if (!bitmap.width || !bitmap.height || bitmap.width * bitmap.height > 16777216) throw new AvatarError('INVALID_PHOTO');
        const canvas = document.createElement('canvas'); canvas.width = 512; canvas.height = 512;
        const context = canvas.getContext('2d'); if (!context) throw new AvatarError('INVALID_PHOTO');
        const side = Math.min(bitmap.width, bitmap.height);
        context.drawImage(bitmap, (bitmap.width-side)/2, (bitmap.height-side)/2, side, side, 0, 0, 512, 512);
        const output = await new Promise<Blob|null>(resolve => canvas.toBlob(resolve, 'image/webp', .9));
        signal.throwIfAborted();
        if (!output || !PHOTO_TYPES.includes(output.type)) throw new AvatarError('INVALID_PHOTO');
        if (output.size > MAX_AVATAR_BYTES) throw new AvatarError('TOO_LARGE');
        return output;
    } finally { bitmap.close(); }
}
export async function saveProfileAvatar(userId: string, value: { iconId: string } | { photo: Blob }, signal: AbortSignal): Promise<string> {
    if (!userId || /^(?:guest(?:[-_]|$)|anon(?:ymous)?(?:[-_]|$)|cpu(?:[-_]|$)|ai(?::|$)|supabase-)/i.test(userId)) throw new AvatarError('AUTH_REQUIRED');
    signal.throwIfAborted();
    let token = readRankedSession(userId)?.token;
    if (!token) {
        const { data, error } = await supabase.auth.getSession();
        const session = data.session;
        if (!error && session?.user.id === userId && !session.user.is_anonymous &&
            (!session.expires_at || session.expires_at * 1000 > Date.now())) token = session.access_token;
    }
    signal.throwIfAborted();
    if (!token) throw new AvatarError('AUTH_REQUIRED');
    const isIcon = 'iconId' in value;
    if (isIcon ? !circuitIcon(value.iconId) : !PHOTO_TYPES.includes(value.photo.type) || value.photo.size < 1 || value.photo.size > MAX_AVATAR_BYTES) throw new AvatarError('INVALID_PHOTO');
    try {
        const endpoint = new URL(`/profile/avatar/${isIcon ? 'icon' : 'photo'}`, gameServerUrl());
        if (endpoint.protocol !== 'https:' && !['localhost','127.0.0.1','[::1]'].includes(endpoint.hostname)) throw new AvatarError('UNAVAILABLE');
        const response = await fetch(endpoint, {
            method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': isIcon ? 'application/json' : value.photo.type },
            body: isIcon ? JSON.stringify({ iconId: value.iconId }) : value.photo,
            signal: AbortSignal.any([signal, AbortSignal.timeout(20000)]), credentials: 'omit', cache: 'no-store', redirect: 'error',
        });
        if (response.status === 401 || response.status === 403) throw new AvatarError('AUTH_REQUIRED');
        if (response.status === 413) throw new AvatarError('TOO_LARGE');
        if (response.status === 400 || response.status === 415) throw new AvatarError('INVALID_PHOTO');
        if (!response.ok) throw new AvatarError('UNAVAILABLE');
        const data = await response.json(); signal.throwIfAborted();
        if (data?.userId !== userId || !isSafeSavedAvatar(data?.avatarUrl)) throw new AvatarError('UNAVAILABLE');
        return data.avatarUrl;
    } catch (error) {
        if (signal.aborted) throw signal.reason;
        if (error instanceof AvatarError) throw error;
        throw new AvatarError('UNAVAILABLE');
    }
}
