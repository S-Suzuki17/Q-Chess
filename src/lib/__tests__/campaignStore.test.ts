import { describe, expect, it, vi } from 'vitest';
import { createCampaignStore } from '../campaignStore';
import { emptyCampaign, equipReward, finishBoss, parseCampaign } from '../../config/campaign';

const victory = { won: true, draw: false, playerMoves: 12, hintsUsed:0,initialSeconds:600,remainingSeconds:420};
function memoryStorage() {
    let raw: string | null = null;
    return { getItem: () => raw, setItem: (_key: string, value: string) => { raw = value; } };
}

describe('shared campaign save', () => {
    it('loads an empty save without locking standard cosmetics', () => {
        const store = createCampaignStore(memoryStorage);
        expect(store.getServerSnapshot().loaded).toBe(false);
        store.load();
        expect(store.getSnapshot()).toEqual({ loaded: true, storageError: false, progress: emptyCampaign() });
    });
    it('persists rewards and equipment for a new page', () => {
        const storage = memoryStorage(), store = createCampaignStore(() => storage);
        store.update(value => finishBoss(value, 'nox', victory));
        store.update(value => equipReward(value, 'board', 'slate'));
        const reloaded = createCampaignStore(() => storage);
        reloaded.load();
        expect(reloaded.getSnapshot().progress).toEqual(store.getSnapshot().progress);
        expect(reloaded.getSnapshot().progress.board).toBe('slate');
    });
    it('retains progress and equipment across mode unmounts while saving is blocked', () => {
        const store = createCampaignStore(() => { throw new Error('Storage denied'); });
        const listener = vi.fn(), unsubscribe = store.subscribe(listener);
        store.load();
        store.update(value => finishBoss(value, 'nox', victory));
        store.update(value => equipReward(value, 'board', 'slate'));
        unsubscribe();
        const callCount = listener.mock.calls.length;
        store.load();
        store.update(value => finishBoss(value, 'ember', victory));
        expect(listener).toHaveBeenCalledTimes(callCount);
        expect(store.getSnapshot().storageError).toBe(true);
        expect(store.getSnapshot().progress).toMatchObject({ board: 'slate', stars: { nox: 3, ember: 3 } });
    });
    it('does not replace unsaved equipment with a stale save after a quota error', () => {
        const storage = memoryStorage();
        const store = createCampaignStore(() => storage);
        store.update(value => finishBoss(value, 'nox', victory));
        const write = storage.setItem;
        storage.setItem = () => { throw new Error('Quota'); };
        store.update(value => equipReward(value, 'board', 'slate'));
        storage.setItem = write;
        store.update(value => finishBoss(value, 'ember', victory));
        expect(parseCampaign(storage.getItem()).board).toBe('slate');
        expect(store.getSnapshot().storageError).toBe(false);
    });
    it('preserves best medals from another tab when changing equipment', () => {
        const storage = memoryStorage(), first = createCampaignStore(() => storage), second = createCampaignStore(() => storage);
        first.load(); second.load();
        first.update(value => finishBoss(value, 'nox', victory));
        second.update(value => equipReward(value, 'board', 'slate'));
        first.refresh();
        expect(first.getSnapshot().progress).toEqual(second.getSnapshot().progress);
        expect(first.getSnapshot().progress.stars.nox).toBe(3);
        expect(first.getSnapshot().progress.board).toBe('slate');
    });
    it('recovers safely from malformed saved data', () => {
        const storage = memoryStorage();
        storage.setItem('', '{broken');
        const store = createCampaignStore(() => storage);
        store.load();
        expect(store.getSnapshot().progress).toEqual(emptyCampaign());
    });
});
