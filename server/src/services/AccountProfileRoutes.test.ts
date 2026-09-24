import express from 'express';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RankedAuth } from './RankedAuth';
import { AccountWriteGate } from './AccountDeletion';
import { createAccountProfileRouter } from './AccountProfileRoutes';
import { parseDisplayName, type AccountProfileStore } from './AccountProfiles';

describe('owner-scoped account profile HTTP API', () => {
    let server: http.Server, base: string, token: string, auth: RankedAuth, gate: AccountWriteGate;
    let store: { [K in keyof AccountProfileStore]: ReturnType<typeof vi.fn> };
    beforeEach(async () => {
        store = { verifyUser: vi.fn().mockResolvedValue(null), blocked: vi.fn().mockResolvedValue(false), profile: vi.fn().mockResolvedValue({ id: 'Alice', name: 'Alice' }), ensure: vi.fn().mockResolvedValue({ id: 'Alice', name: 'Alice' }), rename: vi.fn().mockResolvedValue({ id: 'Alice', name: 'New' }), friends: vi.fn().mockResolvedValue([]), changeFriend: vi.fn().mockResolvedValue(true) };
        auth = new RankedAuth(async (id, password) => id === 'Alice' && password === 'right'); token = (await auth.issueLegacySession('Alice','right'))!.token;
        gate = new AccountWriteGate(); const app = express(); app.use(createAccountProfileRouter(auth, store, gate));
        server = http.createServer(app); await new Promise<void>(resolve => server.listen(0,'127.0.0.1',resolve)); base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    });
    afterEach(async () => { server?.closeAllConnections(); if (server?.listening) await new Promise<void>(resolve => server.close(() => resolve())); vi.restoreAllMocks(); });
    const options = (token: string, body?: unknown) => ({ headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, ...(body === undefined ? {} : { method: 'POST', body: JSON.stringify(body) }) });
    it('rejects forged/guest/absent credentials before mutation and private reads', async () => {
        for (const value of ['', 'Alice', 'GUEST-Alice', 'ranked_forged', 'a.b.c']) {
            expect((await fetch(`${base}/account/friends`,options(value))).status).toBe(401);
            expect((await fetch(`${base}/account/profile/name`,options(value,{name:'Name'}))).status).toBe(401);
        }
        expect(store.rename).not.toHaveBeenCalled(); expect(store.friends).not.toHaveBeenCalled();
    });
    it('takes ownership only from the verified proof and rejects mass assignment', async () => {
        const res = await fetch(`${base}/account/profile/name`, options(token,{name:' New '})); expect(res.status).toBe(200);
        expect(store.rename).toHaveBeenCalledExactlyOnceWith('Alice','New'); expect(res.headers.get('cache-control')).toBe('no-store');
        for (const extra of [{userId:'Bob'},{id:'Bob'},{rating:9999},{avatar_url:'bad'},{email:'bad'}]) expect((await fetch(`${base}/account/profile/name`, options(token,{name:'New',...extra}))).status).toBe(400);
        expect(store.rename).toHaveBeenCalledTimes(1);
    });
    it('permits creation only for verified OAuth identities, never legacy proofs', async () => {
        expect((await fetch(`${base}/account/profile/ensure`,options(token,{name:'Alice'}))).status).toBe(200);
        expect(store.ensure).toHaveBeenCalledWith('Alice','Alice',false);
        store.verifyUser.mockResolvedValue('OAuthId');
        expect((await fetch(`${base}/account/profile/ensure`,options('valid.jwt.token',{name:'Name'}))).status).toBe(200);
        expect(store.ensure).toHaveBeenCalledWith('OAuthId','Name',true);
    });
    it('requires the recipient identity for acceptance and rejects arbitrary selectors', async () => {
        expect((await fetch(`${base}/account/friends`,options(token,{friendId:'Bob',action:'accept'}))).status).toBe(200);
        expect(store.changeFriend).toHaveBeenCalledExactlyOnceWith('Alice','Bob','accept');
        for (const body of [{friendId:'Alice',action:'request'},{friendId:'Bob),id.gt.0',action:'remove'},{friendId:'Bob',action:'accept',userId:'Carol'},{friendId:'Bob',action:'unknown'},{friendId:'GUEST-x',action:'request'}]) expect((await fetch(`${base}/account/friends`,options(token,body))).status).toBe(400);
        expect((await fetch(`${base}/account/friends?userId=Bob`,options(token))).status).toBe(400);
        expect(store.changeFriend).toHaveBeenCalledTimes(1);
    });
    it('filters unexpected foreign rows and refuses a missing account', async () => {
        store.friends.mockResolvedValue([{user_id:'Alice',friend_id:'Bob'},{user_id:'Carol',friend_id:'Bob'}]);
        const res = await fetch(`${base}/account/friends`,options(token)); expect((await res.json()).friends).toHaveLength(1);
        store.profile.mockResolvedValue(null); expect((await fetch(`${base}/account/friends`,options(token))).status).toBe(404);
    });
    it('blocks revoked and expired proofs, including revocation during auth await', async () => {
        store.blocked.mockImplementation(async () => { auth.revokeSession(token); return false; });
        expect((await fetch(`${base}/account/profile/name`,options(token,{name:'Name'}))).status).toBe(401);
        expect(store.rename).not.toHaveBeenCalled();
        token=(await auth.issueLegacySession('Alice','right'))!.token; vi.spyOn(Date,'now').mockReturnValue(Date.now()+3600001);
        expect((await fetch(`${base}/account/friends`,options(token))).status).toBe(401);
    });
    it('blocks both participants during durable deletion and fails closed on lookup errors', async () => {
        store.blocked.mockImplementation(async id => id === 'Bob');
        expect((await fetch(`${base}/account/friends`,options(token,{friendId:'Bob',action:'request'}))).status).toBe(423);
        expect(store.changeFriend).not.toHaveBeenCalled();
        store.blocked.mockRejectedValue(new Error('secret')); const res=await fetch(`${base}/account/friends`,options(token));
        expect(res.status).toBe(503); expect(await res.text()).not.toContain('secret');
    });
    it('holds a write lease for each participant until the DB operation settles', async () => {
        let finish!: () => void, entered!: () => void;
        const began=new Promise<void>(resolve=>{entered=resolve;});
        store.changeFriend.mockImplementation(async()=>{entered();await new Promise<void>(resolve=>{finish=resolve;});return true;});
        const pending=fetch(`${base}/account/friends`,options(token,{friendId:'Bob',action:'request'})); await began;
        expect(()=>gate.reserve('Alice',false)).toThrow('ACCOUNT_BUSY'); expect(()=>gate.reserve('Bob',false)).toThrow('ACCOUNT_BUSY');
        expect((await fetch(`${base}/account/friends`,options(token,{friendId:'Bob',action:'request'}))).status).toBe(429);
        finish(); expect((await pending).status).toBe(200); expect(()=>gate.reserve('Alice',false)).not.toThrow(); expect(()=>gate.reserve('Bob',false)).not.toThrow();
    });
    it('validates bodies/content type/size before writes and limits write frequency', async () => {
        for (const name of ['', 'x'.repeat(16), 'a\u202Eb', 'a\nb']) expect((await fetch(`${base}/account/profile/name`,options(token,{name}))).status).toBe(400);
        expect((await fetch(`${base}/account/profile/name`,options(token,{name:'x'.repeat(2048)}))).status).toBe(413);
        expect((await fetch(`${base}/account/profile/name`,{method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'text/plain'},body:'test'})).status).toBe(415);
        for(let i=0;i<14;i++) await fetch(`${base}/account/profile/name`,options(token,{name:'Name'}));
        expect((await fetch(`${base}/account/profile/name`,options(token,{name:'Name'}))).status).toBe(429);
    });
    it('keeps international visible names without permitting control or bidi tricks', () => {
        for (const name of ['太郎','Élodie','हिन्दी','தமிழ்','王 ♟']) expect(parseDisplayName(name)).toBe(name);
        expect(parseDisplayName('e\u0301')).toBe('é'); expect(parseDisplayName('\u200b')).toBeNull();
    });
});
