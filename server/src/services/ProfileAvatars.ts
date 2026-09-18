import { createHash, randomUUID } from 'node:crypto';
import sharp from 'sharp';
import type { SupabaseClient } from '@supabase/supabase-js';

export const AVATAR_MAX_BYTES = 2 * 1024 * 1024;
export const AVATAR_CONTENT_TYPES = ['image/png','image/jpeg','image/webp'] as const;
export interface ProfileAvatarStore {
    verifyUser(token: string): Promise<string|null>;
    setIcon(userId: string, iconId: string): Promise<string>;
    setPhoto(userId: string, bytes: Buffer): Promise<string>;
}
export const knownCircuitIcon = (value: unknown): value is string => typeof value === 'string' && /^circuit-(0[1-9]|1[0-5])$/.test(value);
export const avatarOwnerPath = (userId: string) => `u/${createHash('sha256').update(userId).digest('hex')}`;
export class InvalidAvatarPhoto extends Error {}
/** Decode, cap dimensions, strip metadata and re-encode. Never upload original bytes. */
export async function normalizeAvatarPhoto(bytes: Buffer, contentType: string): Promise<Buffer> {
    if (!Buffer.isBuffer(bytes) || !bytes.length || bytes.length > AVATAR_MAX_BYTES) throw new InvalidAvatarPhoto();
    const signature = contentType === 'image/png' ? bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])) :
        contentType === 'image/jpeg' ? bytes[0]===255 && bytes[1]===216 && bytes[2]===255 :
        contentType === 'image/webp' ? bytes.toString('ascii',0,4)==='RIFF' && bytes.toString('ascii',8,12)==='WEBP' : false;
    if (!signature) throw new InvalidAvatarPhoto();
    try {
        const image=sharp(bytes,{failOn:'warning',limitInputPixels:16777216,animated:false});
        const info=await image.metadata();
        const format=contentType.slice(6);
        if(info.format!==format || !info.width || !info.height || info.width>4096 || info.height>4096 || (info.pages??1)>1) throw new InvalidAvatarPhoto();
        const encoded=await image.rotate().resize(512,512,{fit:'cover',position:'centre'}).webp({quality:90}).timeout({seconds:5}).toBuffer();
        if(encoded.length>AVATAR_MAX_BYTES)throw new InvalidAvatarPhoto();
        return encoded;
    } catch { throw new InvalidAvatarPhoto(); }
}
export function createProfileAvatarStore(client: SupabaseClient, verifyUser: ProfileAvatarStore['verifyUser']): ProfileAvatarStore {
    const update = async (userId: string, avatarUrl: string) => {
        const {data,error}=await client.from('profiles').update({avatar_url:avatarUrl}).eq('id',userId)
            .select('id,avatar_url').abortSignal(AbortSignal.timeout(5000)).single();
        if(error || !data || data.id!==userId || data.avatar_url!==avatarUrl)throw new Error('Avatar profile update failed');
        return avatarUrl;
    };
    return {
        verifyUser,
        async setIcon(userId,iconId) {
            if(!knownCircuitIcon(iconId))throw new Error('Unknown circuit icon');
            // Campaign progress is currently local-only. This is an ID allowlist,
            // not a claim of server-verified reward ownership.
            return update(userId,`/avatars/${iconId}.svg`);
        },
        async setPhoto(userId,bytes) {
            const path=`${avatarOwnerPath(userId)}/${randomUUID()}.webp`;
            const bucket=client.storage.from('avatars');
            const {error}=await bucket.upload(path,bytes,{contentType:'image/webp',cacheControl:'3600',upsert:false});
            if(error)throw new Error('Avatar storage unavailable');
            const {data}=bucket.getPublicUrl(path);
            const url=new URL(data.publicUrl);
            if(!['http:','https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash ||
                !url.pathname.endsWith(`/storage/v1/object/public/avatars/${path}`))throw new Error('Avatar storage URL invalid');
            // Previous files are deliberately kept; cancel/failure never deletes them.
            return update(userId,url.href);
        },
    };
}
